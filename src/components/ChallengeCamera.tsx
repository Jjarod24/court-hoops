import { useEffect, useRef, useState } from "react";
import { X, Check, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
  const [shot, setShot] = useState(0);
  const [made, setMade] = useState(0);
  const [log, setLog] = useState<boolean[]>([]);

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
        setCamError("Camera blocked — you can still log shots.");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function record(hit: boolean) {
    const nextShot = shot + 1;
    const nextMade = made + (hit ? 1 : 0);
    setShot(nextShot);
    setMade(nextMade);
    setLog((l) => [...l, hit]);
    if (nextShot >= totalShots) onComplete(nextMade);
  }

  const done = shot >= totalShots;

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
        <div className="pointer-events-none flex flex-1 items-center justify-center">
          <div className="relative h-56 w-56">
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/70" />
            <div className="absolute inset-8 rounded-full border border-primary/40" />
            <div className="absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-primary/70" />
            <div className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-primary/70" />
          </div>
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
            {Array.from({ length: totalShots }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  log[i] === undefined
                    ? "bg-muted"
                    : log[i]
                      ? "bg-success"
                      : "bg-destructive"
                }`}
              />
            ))}
          </div>
          {camError && <p className="text-xs text-muted-foreground">{camError}</p>}
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
          {submitting && (
            <p className="text-center text-sm text-muted-foreground">Opening your pack…</p>
          )}
        </div>
      </div>
    </div>
  );
}
