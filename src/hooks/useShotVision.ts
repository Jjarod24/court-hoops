import { useCallback, useEffect, useRef, useState } from "react";
import { ShotTracker, type ShotDetection, type TrackerState } from "@/lib/shot-tracker";
import { HoopDetector, type Box, type HoopLock } from "@/lib/hoop-detector";

export type VisionStatus = "idle" | "loading" | "ready" | "unavailable";

export type BallSighting = { x: number; y: number; w: number; h: number; score: number };

type Options = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onShot: (detection: ShotDetection) => void;
};

type Detector = {
  detect: (
    el: HTMLVideoElement,
  ) => Promise<Array<{ class: string; score: number; bbox: number[] }>>;
};

/**
 * Live camera shot vision: loads an on-device object detector, locks onto the
 * hoop, tracks the ball across frames and reports made/missed/unclear shots.
 *
 * Swap point for a dedicated basketball model: replace the `cocoSsd.load`
 * below with any detector exposing the `Detector` shape (TFJS graph model,
 * ONNX Runtime Web session wrapper, MediaPipe task, …) and replace
 * `HoopDetector.detect` with the model's rim class. Nothing else changes.
 */
export function useShotVision({ videoRef, enabled, onShot }: Options) {
  const [status, setStatus] = useState<VisionStatus>("idle");
  const [ball, setBall] = useState<BallSighting | null>(null);
  const [hoop, setHoop] = useState<HoopLock | null>(null);
  const [searching, setSearching] = useState<{ candidate: Box | null; confidence: number }>({
    candidate: null,
    confidence: 0,
  });
  const [state, setState] = useState<TrackerState>("idle");
  const [trail, setTrail] = useState<Array<{ x: number; y: number }>>([]);
  const [fps, setFps] = useState(0);
  const [frames, setFrames] = useState(0);

  const trackerRef = useRef(new ShotTracker({ cx: 0.5, cy: 0.4, r: 0.12 }));
  const hoopRef = useRef(new HoopDetector());
  const onShotRef = useRef(onShot);
  onShotRef.current = onShot;

  /** Player taps the rim to calibrate manually (normalized coords). */
  const calibrate = useCallback((rim: Box) => {
    hoopRef.current.setManual(rim);
    const lock = hoopRef.current.lock;
    if (lock) {
      setHoop(lock);
      trackerRef.current.setZone(zoneFor(lock));
    }
  }, []);

  const recalibrate = useCallback(() => {
    hoopRef.current.reset();
    setHoop(null);
    setSearching({ candidate: null, confidence: 0 });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let raf = 0;
    let model: Detector | null = null;

    (async () => {
      setStatus("loading");
      try {
        const tf = await import("@tensorflow/tfjs");
        await tf.ready();
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        model = (await cocoSsd.load({ base: "lite_mobilenet_v2" })) as unknown as Detector;
        if (cancelled) return;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      let busy = false;
      let frameCount = 0;
      let fpsWindow = performance.now();
      let fpsFrames = 0;

      const loop = async () => {
        raf = requestAnimationFrame(loop);
        const video = videoRef.current;
        if (busy || !model || !video || video.readyState < 2) return;
        busy = true;
        try {
          const now = performance.now();
          frameCount++;
          fpsFrames++;
          if (now - fpsWindow > 1000) {
            setFps(Math.round((fpsFrames * 1000) / (now - fpsWindow)));
            setFrames(frameCount);
            fpsWindow = now;
            fpsFrames = 0;
          }

          // --- hoop ---
          const lock = hoopRef.current.detect(video);
          if (lock) {
            setHoop(lock);
            trackerRef.current.setZone(zoneFor(lock));
          } else {
            setSearching({ ...hoopRef.current.progress });
          }

          // --- ball ---
          const preds = await model.detect(video);
          const w = video.videoWidth || 1;
          const h = video.videoHeight || 1;
          const candidates = preds.filter(
            (p) => (p.class === "sports ball" || p.class === "frisbee") && p.score > 0.28,
          );
          const best = candidates.sort((a, b) => b.score - a.score)[0];

          if (best) {
            const [bx = 0, by = 0, bw = 0, bh = 0] = best.bbox;
            const sighting = {
              x: bx / w,
              y: by / h,
              w: bw / w,
              h: bh / h,
              score: best.score,
            };
            setBall(sighting);
            if (lock) {
              const result = trackerRef.current.push({
                x: sighting.x + sighting.w / 2,
                y: sighting.y + sighting.h / 2,
                t: now,
                score: best.score,
              });
              if (result) onShotRef.current(result);
            }
          } else {
            setBall(null);
            const result = trackerRef.current.tick(now);
            if (result) onShotRef.current(result);
          }

          setState(trackerRef.current.currentState);
          setTrail(trackerRef.current.trajectory.slice(-24).map((p) => ({ x: p.x, y: p.y })));
        } catch {
          /* keep looping */
        } finally {
          busy = false;
        }
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [enabled, videoRef]);

  return { status, ball, hoop, searching, state, trail, fps, frames, calibrate, recalibrate };
}

function zoneFor(lock: HoopLock) {
  return {
    cx: lock.rim.x + lock.rim.w / 2,
    cy: lock.rim.y + lock.rim.h / 2,
    r: Math.max(0.05, lock.rim.w / 2),
  };
}
