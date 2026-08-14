import { useEffect, useRef, useState } from "react";
import { X, Check, CircleSlash, ScanEye, Loader2, RotateCcw, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useShotVision } from "@/hooks/useShotVision";
import type { ShotDetection } from "@/lib/shot-tracker";

type ShotEntry = {
  hit: boolean;
  auto: boolean;
  confidence: number | null;
  corrected: boolean;
};

function confidenceLabel(c: number) {
  if (c >= 0.75) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

function confidenceClass(c: number) {
  if (c >= 0.75) return "text-success";
  if (c >= 0.5) return "text-primary";
  return "text-destructive";
}

const STATE_LABEL: Record<string, string> = {
  idle: "WAITING FOR BALL",
  ball_detected: "BALL DETECTED",
  shot_started: "SHOT STARTED",
  in_flight: "BALL IN FLIGHT",
  approaching: "APPROACHING HOOP",
  hoop_event: "AT THE RIM",
  clearing: "WAIT FOR BALL TO CLEAR",
};

export function ChallengeCamera({
  title,
  totalShots,
  onClose,
  onComplete,
  submitting,
}: {
  title: string;
  totalShots: number;
  onClose: () => void;
  onComplete: (made: number) => void;
  submitting: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [log, setLog] = useState<ShotEntry[]>([]);
  const [manual, setManual] = useState(false);
  const [flash, setFlash] = useState<{ hit: boolean; confidence: number | null } | null>(null);
  const [unclear, setUnclear] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [debug, setDebug] = useState(false);
  const [tapCalibrate, setTapCalibrate] = useState(false);
  const logCountRef = useRef(0);

  const shot = log.length;
  const made = log.filter((s) => s.hit).length;
  const done = shot >= totalShots;

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("debug")) setDebug(true);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCamError("Camera unavailable on this device — log your shots manually.");
        setManual(true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        setCamError(
          name === "NotAllowedError"
            ? "Camera permission denied — enable it in your browser settings, or log shots manually."
            : name === "NotFoundError"
              ? "No camera found — log your shots manually."
              : "Camera couldn't start — log your shots manually.",
        );
        setManual(true);
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function record(hit: boolean, detection?: ShotDetection) {
    if (logCountRef.current >= totalShots) return;
    logCountRef.current += 1;
    const entry: ShotEntry = {
      hit,
      auto: Boolean(detection),
      confidence: detection ? detection.confidence : null,
      corrected: false,
    };
    setLog((l) => {
      const next = [...l, entry];
      if (next.length >= totalShots) setReviewing(true);
      return next;
    });
    setUnclear(false);
    setFlash({ hit, confidence: entry.confidence });
    window.setTimeout(() => setFlash(null), 1600);
  }

  function handleDetection(detection: ShotDetection) {
    // Low-confidence calls never consume one of the shots.
    if (detection.result === "unclear") {
      setUnclear(true);
      window.setTimeout(() => setUnclear(false), 2600);
      return;
    }
    record(detection.result === "made", detection);
  }

  function toggleShot(index: number) {
    setLog((l) =>
      l.map((entry, i) =>
        i === index ? { ...entry, hit: !entry.hit, corrected: !entry.corrected } : entry,
      ),
    );
  }

  const { status, ball, hoop, searching, state, trail, fps, frames, calibrate, recalibrate } =
    useShotVision({
      videoRef,
      enabled: !manual && !camError && !done && !submitting,
      onShot: handleDetection,
    });

  useEffect(() => {
    if (status === "unavailable") setManual(true);
  }, [status]);

  function onFrameTap(e: React.MouseEvent<HTMLDivElement>) {
    if (!tapCalibrate) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    calibrate({ x: Math.max(0, x - 0.09), y: Math.max(0, y - 0.03), w: 0.18, h: 0.06 });
    setTapCalibrate(false);
  }

  const lastIndex = log.length - 1;
  const lastEntry = log[lastIndex];
  const tracking = !manual && !camError && status === "ready";

  if (reviewing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background px-4 py-6">
        <div className="mx-auto max-w-md">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {totalShots}/{totalShots} shots complete
          </p>
          <h2 className="font-display text-3xl">
            {made}/{totalShots} made
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap any shot the tracker got wrong to flip it, then confirm.
          </p>

          <div className="mt-4 space-y-2">
            {log.map((entry, i) => (
              <button
                key={i}
                onClick={() => toggleShot(i)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <div>
                  <p className="font-display text-lg">
                    Shot {i + 1} ·{" "}
                    <span className={entry.hit ? "text-success" : "text-destructive"}>
                      {entry.hit ? "Made" : "Missed"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.auto
                      ? entry.confidence != null
                        ? `Auto · ${confidenceLabel(entry.confidence)} confidence (${Math.round(entry.confidence * 100)}%)`
                        : "Auto"
                      : "Logged manually"}
                    {entry.corrected ? " · corrected by you" : ""}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Flip
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Exit
            </Button>
            <Button className="flex-1" disabled={submitting} onClick={() => onComplete(made)}>
              {submitting ? "Opening your pack…" : `Confirm ${made}/${totalShots}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-background/25" />

      {/* AR overlay layer — normalized coordinates map 1:1 onto this box */}
      <div
        ref={frameRef}
        onClick={onFrameTap}
        className={`absolute inset-0 ${tapCalibrate ? "cursor-crosshair" : "pointer-events-none"}`}
      >
        {hoop && (
          <>
            <div
              className="absolute rounded-[50%] border-2 border-success shadow-[0_0_18px_rgba(0,0,0,0.35)]"
              style={{
                left: `${hoop.rim.x * 100}%`,
                top: `${hoop.rim.y * 100}%`,
                width: `${hoop.rim.w * 100}%`,
                height: `${hoop.rim.h * 100}%`,
              }}
            />
            {hoop.backboard && (
              <div
                className="absolute rounded-md border border-success/40"
                style={{
                  left: `${hoop.backboard.x * 100}%`,
                  top: `${hoop.backboard.y * 100}%`,
                  width: `${hoop.backboard.w * 100}%`,
                  height: `${hoop.backboard.h * 100}%`,
                }}
              />
            )}
            <span
              className="absolute -translate-y-5 text-[10px] uppercase tracking-widest text-success"
              style={{ left: `${hoop.rim.x * 100}%`, top: `${hoop.rim.y * 100}%` }}
            >
              Hoop · {Math.round(hoop.confidence * 100)}%
            </span>
          </>
        )}

        {!hoop && searching.candidate && (
          <div
            className="absolute rounded-[50%] border-2 border-dashed border-primary/70"
            style={{
              left: `${searching.candidate.x * 100}%`,
              top: `${searching.candidate.y * 100}%`,
              width: `${searching.candidate.w * 100}%`,
              height: `${searching.candidate.h * 100}%`,
            }}
          />
        )}

        {/* Trajectory */}
        {trail.length > 1 && (
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={trail.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="none"
              stroke="currentColor"
              className="text-primary/70"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {/* Ball box */}
        {ball && (
          <div
            className="absolute rounded-full border-2 border-primary"
            style={{
              left: `${ball.x * 100}%`,
              top: `${ball.y * 100}%`,
              width: `${ball.w * 100}%`,
              height: `${ball.h * 100}%`,
            }}
          />
        )}
      </div>

      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-background/70 px-3 py-2 backdrop-blur">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Challenge</p>
            <p className="font-display text-2xl leading-none">{title}</p>
          </div>
          <div className="flex gap-2">
            <button
              onDoubleClick={() => setDebug((d) => !d)}
              className="rounded-lg bg-background/70 px-2 text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur"
              aria-label="Toggle debug overlay"
            >
              {debug ? "dbg" : "·"}
            </button>
            <Button size="icon" variant="secondary" onClick={onClose} aria-label="Exit challenge">
              <X />
            </Button>
          </div>
        </div>

        <div className="pointer-events-none flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {tracking && !hoop && (
            <div className="rounded-xl bg-background/80 px-4 py-3 backdrop-blur">
              <p className="font-display text-2xl">Point your camera at the basketball hoop</p>
              <p className="text-xs text-muted-foreground">
                Locking on… {Math.round(searching.confidence * 100)}%
              </p>
            </div>
          )}

          {flash && (
            <div className="flex flex-col items-center gap-1">
              <span
                className={`font-display text-6xl ${flash.hit ? "text-success" : "text-destructive"}`}
              >
                {flash.hit ? "MAKE ✓" : "MISS ✕"}
              </span>
              {flash.confidence != null && (
                <span className={`text-xs ${confidenceClass(flash.confidence)}`}>
                  {confidenceLabel(flash.confidence)} confidence ·{" "}
                  {Math.round(flash.confidence * 100)}%
                </span>
              )}
            </div>
          )}

          {unclear && !flash && (
            <div className="rounded-xl bg-background/85 px-4 py-3 backdrop-blur">
              <p className="font-display text-2xl text-primary">Unable to detect shot clearly</p>
              <p className="text-xs text-muted-foreground">
                That attempt wasn't counted — retake the shot.
              </p>
            </div>
          )}
        </div>

        {debug && (
          <div className="mb-2 rounded-xl bg-background/85 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground backdrop-blur">
            <p>state: {state}</p>
            <p>
              ball:{" "}
              {ball
                ? `${ball.x.toFixed(3)},${ball.y.toFixed(3)} ${ball.w.toFixed(3)}x${ball.h.toFixed(3)} score ${ball.score.toFixed(2)}`
                : "none"}
            </p>
            <p>
              hoop:{" "}
              {hoop
                ? `${hoop.rim.x.toFixed(3)},${hoop.rim.y.toFixed(3)} ${hoop.rim.w.toFixed(3)}x${hoop.rim.h.toFixed(3)} conf ${hoop.confidence.toFixed(2)}`
                : `searching ${searching.confidence.toFixed(2)}`}
            </p>
            <p>trajectory points: {trail.length}</p>
            <p>
              fps: {fps} · frames: {frames} · model: {status}
            </p>
            <p>
              last: {lastEntry ? `${lastEntry.hit ? "make" : "miss"} ${lastEntry.confidence?.toFixed(2) ?? "manual"}` : "—"}
            </p>
          </div>
        )}

        <div className="space-y-3 rounded-2xl bg-background/80 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-sm">
            <span className="font-display text-xl">
              Shot {Math.min(shot + 1, totalShots)} / {totalShots}
            </span>
            <span className="text-muted-foreground">
              {made} made · {shot - made} missed
            </span>
          </div>
          <Progress value={(shot / totalShots) * 100} />
          <div className="flex gap-1">
            {Array.from({ length: totalShots }).map((_, i) => {
              const entry = log[i];
              return (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    !entry ? "bg-muted" : entry.hit ? "bg-success" : "bg-destructive"
                  }`}
                  style={
                    entry?.confidence != null
                      ? { opacity: 0.35 + entry.confidence * 0.65 }
                      : undefined
                  }
                />
              );
            })}
          </div>

          {lastEntry && (
            <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
              <div className="text-xs">
                <p className="font-display text-base">
                  Shot {lastIndex + 1}:{" "}
                  <span className={lastEntry.hit ? "text-success" : "text-destructive"}>
                    {lastEntry.hit ? "Made" : "Missed"}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {lastEntry.confidence != null ? (
                    <span className={confidenceClass(lastEntry.confidence)}>
                      {confidenceLabel(lastEntry.confidence)} confidence ·{" "}
                      {Math.round(lastEntry.confidence * 100)}%
                    </span>
                  ) : (
                    "Logged manually"
                  )}
                  {lastEntry.corrected ? " · corrected" : ""}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => toggleShot(lastIndex)}>
                <RotateCcw /> Wrong call
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {status === "loading" && !manual ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ScanEye className="h-3.5 w-3.5" />
            )}
            <span>
              {manual || camError
                ? "Manual logging"
                : status === "ready"
                  ? hoop
                    ? STATE_LABEL[state] ?? "TRACKING…"
                    : "Searching for the hoop…"
                  : "Warming up shot tracking…"}
            </span>
          </div>
          {camError && <p className="text-xs text-muted-foreground">{camError}</p>}

          {manual ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                className="h-16 bg-success text-success-foreground hover:bg-success/90"
                disabled={done || submitting}
                onClick={() => record(true)}
              >
                <Check /> Made It
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="h-16"
                disabled={done || submitting}
                onClick={() => record(false)}
              >
                <CircleSlash /> Missed
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  recalibrate();
                  setTapCalibrate(true);
                }}
              >
                <Crosshair /> {tapCalibrate ? "Tap the rim" : "Recalibrate"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDebug((d) => !d)}>
                {debug ? "Hide debug" : "Debug"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={done || submitting}
                onClick={() => setManual(true)}
              >
                Manual mode
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
