import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, CircleSlash, ScanEye, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBallDetection } from "@/hooks/useBallDetection";
import type { ShotDetection } from "@/lib/shot-tracker";

// Hoop zone in normalized camera-frame coordinates — matches the on-screen reticle.
const HOOP_ZONE = { cx: 0.5, cy: 0.5, r: 0.16 };

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
  const [camError, setCamError] = useState<string | null>(null);
  const [log, setLog] = useState<ShotEntry[]>([]);
  const [manual, setManual] = useState(false);
  const [flash, setFlash] = useState<{ hit: boolean; confidence: number | null } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const logCountRef = useRef(0);

  const shot = log.length;
  const made = log.filter((s) => s.hit).length;
  const done = shot >= totalShots;

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setCamError("Camera blocked — log your shots manually.");
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
    setFlash({ hit, confidence: entry.confidence });
    window.setTimeout(() => setFlash(null), 1600);
  }

  function toggleShot(index: number) {
    setLog((l) =>
      l.map((entry, i) =>
        i === index ? { ...entry, hit: !entry.hit, corrected: !entry.corrected } : entry,
      ),
    );
  }

  const { status, ball } = useBallDetection({
    videoRef,
    zone: HOOP_ZONE,
    enabled: !manual && !camError && !done && !submitting,
    onShot: (detection) => record(detection.result === "made", detection),
  });

  useEffect(() => {
    if (status === "unavailable") setManual(true);
  }, [status]);

  const statusLabel = useMemo(() => {
    if (manual || camError) return "Manual logging";
    if (status === "loading" || status === "idle") return "Warming up ball tracking…";
    if (ball) return "Ball locked — shoot!";
    return "Auto-tracking · aim the hoop inside the ring";
  }, [manual, camError, status, ball]);

  const lastIndex = log.length - 1;
  const lastEntry = log[lastIndex];

  if (reviewing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background px-4 py-6">
        <div className="mx-auto max-w-md">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Review your run
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
      <div className="absolute inset-0 bg-background/35" />

      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-background/70 px-3 py-2 backdrop-blur">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Challenge</p>
            <p className="font-display text-2xl leading-none">{title}</p>
          </div>
          <Button size="icon" variant="secondary" onClick={onClose} aria-label="Exit challenge">
            <X />
          </Button>
        </div>

        {/* Hoop reticle HUD */}
        <div className="pointer-events-none relative flex flex-1 items-center justify-center">
          <div className="relative h-56 w-56">
            <div
              className={`absolute inset-0 rounded-full border-2 border-dashed transition-colors ${
                flash?.hit
                  ? "border-success"
                  : flash
                    ? "border-destructive"
                    : ball
                      ? "border-primary"
                      : "border-primary/70"
              }`}
            />
            <div className="absolute inset-8 rounded-full border border-primary/40" />
            <div className="absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-primary/70" />
            <div className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-primary/70" />
          </div>

          {/* Live ball marker */}
          {ball && (
            <div
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary"
              style={{ left: `${ball.x * 100}%`, top: `${ball.y * 100}%` }}
            />
          )}

          {flash && (
            <div className="absolute flex flex-col items-center gap-1">
              <span
                className={`font-display text-5xl ${flash.hit ? "text-success" : "text-destructive"}`}
              >
                {flash.hit ? "SWISH!" : "MISS"}
              </span>
              {flash.confidence != null && (
                <span className={`text-xs ${confidenceClass(flash.confidence)}`}>
                  {confidenceLabel(flash.confidence)} confidence ·{" "}
                  {Math.round(flash.confidence * 100)}%
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl bg-background/80 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-sm">
            <span className="font-display text-xl">
              Shot {Math.min(shot + 1, totalShots)} of {totalShots}
            </span>
            <span className="text-muted-foreground">
              {made} made · {shot - made} missed
            </span>
          </div>
          <Progress value={(shot / totalShots) * 100} />
          <div className="flex gap-1">
            {log.length === 0
              ? Array.from({ length: totalShots }).map((_, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-muted" />
                ))
              : Array.from({ length: totalShots }).map((_, i) => {
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

          {/* Correct the last auto-logged shot */}
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
            <span>{statusLabel}</span>
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
                disabled={done || submitting}
                onClick={() => record(true)}
              >
                <Check /> Missed a make
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={done || submitting}
                onClick={() => record(false)}
              >
                <CircleSlash /> Log miss
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
