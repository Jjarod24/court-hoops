import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, X, Navigation2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompass, useGeolocation } from "@/hooks/useGeolocation";
import {
  CHECKIN_RADIUS_M,
  angleDelta,
  bearingDegrees,
  compassLabel,
  distanceMeters,
  formatDistance,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

export function ArNavigator({
  court,
  onClose,
}: {
  court: { name: string; lat: number; lng: number };
  onClose: () => void;
}) {
  const { position, error: geoError } = useGeolocation(true);
  const { heading, granted, needsPermission, supported, requestPermission } = useCompass();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [smoothRot, setSmoothRot] = useState(0);
  const [trend, setTrend] = useState<"warmer" | "colder" | null>(null);
  const lastDistance = useRef<number | null>(null);

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
        setCamError("Camera unavailable — showing compass only.");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const distance = useMemo(
    () => (position ? distanceMeters(position.lat, position.lng, court.lat, court.lng) : null),
    [position, court.lat, court.lng],
  );
  const bearing = useMemo(
    () => (position ? bearingDegrees(position.lat, position.lng, court.lat, court.lng) : null),
    [position, court.lat, court.lng],
  );

  useEffect(() => {
    if (distance == null) return;
    const prev = lastDistance.current;
    if (prev != null && Math.abs(prev - distance) > 3) {
      setTrend(distance < prev ? "warmer" : "colder");
    }
    lastDistance.current = distance;
  }, [distance]);

  const targetRot = bearing == null ? 0 : granted && heading != null ? bearing - heading : bearing;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setSmoothRot((cur) => cur + angleDelta(cur, targetRot) * 0.14);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetRot]);

  const arrived = distance != null && distance <= CHECKIN_RADIUS_M;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-background/40" />

      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-background/70 px-3 py-2 backdrop-blur">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Navigating to
            </p>
            <p className="font-display text-2xl leading-none">{court.name}</p>
          </div>
          <Button size="icon" variant="secondary" onClick={onClose} aria-label="Close AR navigation">
            <X />
          </Button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div
            className={cn(
              "flex h-48 w-48 items-center justify-center rounded-full border-4 backdrop-blur transition-colors",
              arrived
                ? "border-success bg-success/15 pulse-ring"
                : "border-primary/70 bg-background/40",
            )}
          >
            <Navigation2
              className={cn("h-24 w-24", arrived ? "text-success" : "text-primary")}
              style={{ transform: `rotate(${smoothRot}deg)` }}
              strokeWidth={1.5}
            />
          </div>

          <div className="rounded-xl bg-background/75 px-6 py-4 text-center backdrop-blur">
            <p className="font-display text-5xl">
              {distance == null ? "--" : formatDistance(distance)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {arrived
                ? "You're in check-in range!"
                : trend === "warmer"
                  ? "Getting closer!"
                  : trend === "colder"
                    ? "Getting colder…"
                    : "Start walking to lock on"}
            </p>
            {bearing != null && (
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                Head {compassLabel(bearing)}
                {!granted && " (map direction — compass off)"}
              </p>
            )}
          </div>

          {needsPermission && supported && (
            <Button onClick={() => void requestPermission()} size="lg">
              <Compass /> Enable Compass
            </Button>
          )}
          {!supported && (
            <p className="max-w-xs text-center text-xs text-muted-foreground">
              Compass unavailable — the arrow points using map north instead. Keep your phone
              facing north for accuracy.
            </p>
          )}
          {(geoError || camError) && (
            <p className="max-w-xs text-center text-xs text-destructive">
              {geoError ?? camError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
