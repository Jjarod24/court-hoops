import { useEffect, useRef, useState } from "react";
import { ShotTracker, type HoopZone, type ShotResult } from "@/lib/shot-tracker";

export type DetectorStatus = "idle" | "loading" | "ready" | "unavailable";

type Options = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  zone: HoopZone;
  enabled: boolean;
  onShot: (result: ShotResult) => void;
};

/**
 * Runs a lightweight object detector on the live camera feed and reports
 * made/missed shots automatically. Browser-only: the model is imported
 * dynamically after mount so it never runs during SSR.
 */
export function useBallDetection({ videoRef, zone, enabled, onShot }: Options) {
  const [status, setStatus] = useState<DetectorStatus>("idle");
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const trackerRef = useRef(new ShotTracker(zone));
  const onShotRef = useRef(onShot);
  onShotRef.current = onShot;

  useEffect(() => {
    trackerRef.current.setZone(zone);
  }, [zone]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let raf = 0;
    let model: { detect: (el: HTMLVideoElement) => Promise<Array<{ class: string; score: number; bbox: number[] }>> } | null =
      null;

    (async () => {
      setStatus("loading");
      try {
        const tf = await import("@tensorflow/tfjs");
        await tf.ready();
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        model = (await cocoSsd.load({ base: "lite_mobilenet_v2" })) as typeof model;
        if (cancelled) return;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
        return;
      }

      let busy = false;
      const loop = async () => {
        raf = requestAnimationFrame(loop);
        const video = videoRef.current;
        if (busy || !model || !video || video.readyState < 2) return;
        busy = true;
        try {
          const preds = await model.detect(video);
          const now = performance.now();
          const w = video.videoWidth || 1;
          const h = video.videoHeight || 1;
          const candidates = preds.filter(
            (p) => (p.class === "sports ball" || p.class === "frisbee") && p.score > 0.3,
          );
          const best = candidates.sort((a, b) => b.score - a.score)[0];
          if (best) {
            const [x, y, bw, bh] = best.bbox;
            const point = { x: (x + bw / 2) / w, y: (y + bh / 2) / h, t: now };
            setBall({ x: point.x, y: point.y });
            const result = trackerRef.current.push(point);
            if (result) onShotRef.current(result);
          } else {
            setBall(null);
            const result = trackerRef.current.tick(now);
            if (result) onShotRef.current(result);
          }
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

  return { status, ball };
}
