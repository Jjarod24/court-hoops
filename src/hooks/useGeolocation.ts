import { useEffect, useRef, useState } from "react";

export type Position = { lat: number; lng: number; accuracy: number };

export function useGeolocation(watch = true) {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      setReady(true);
      return;
    }
    const onOk = (p: GeolocationPosition) => {
      setPosition({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
      });
      setError(null);
      setReady(true);
    };
    const onErr = (e: GeolocationPositionError) => {
      setError(e.message || "Location unavailable");
      setReady(true);
    };
    const opts: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    };
    if (!watch) {
      navigator.geolocation.getCurrentPosition(onOk, onErr, opts);
      return;
    }
    const id = navigator.geolocation.watchPosition(onOk, onErr, opts);
    return () => navigator.geolocation.clearWatch(id);
  }, [watch]);

  return { position, error, ready };
}

type OrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [supported, setSupported] = useState(true);
  const attached = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("DeviceOrientationEvent" in window)) {
      setSupported(false);
      return;
    }
    const evt = window.DeviceOrientationEvent as OrientationEventWithPermission;
    if (typeof evt.requestPermission === "function") {
      setNeedsPermission(true);
    } else {
      attach();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(e: DeviceOrientationEvent) {
    const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading;
    if (typeof webkit === "number" && !Number.isNaN(webkit)) {
      setHeading(webkit);
      setGranted(true);
      return;
    }
    if (typeof e.alpha === "number") {
      setHeading((360 - e.alpha) % 360);
      setGranted(true);
    }
  }

  function attach() {
    if (attached.current) return;
    attached.current = true;
    window.addEventListener("deviceorientationabsolute", handle as EventListener, true);
    window.addEventListener("deviceorientation", handle as EventListener, true);
  }

  async function requestPermission() {
    const evt = window.DeviceOrientationEvent as OrientationEventWithPermission;
    try {
      if (typeof evt.requestPermission === "function") {
        const res = await evt.requestPermission();
        if (res !== "granted") {
          setSupported(false);
          return false;
        }
      }
      attach();
      setNeedsPermission(false);
      return true;
    } catch {
      setSupported(false);
      return false;
    }
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientationabsolute", handle as EventListener, true);
      window.removeEventListener("deviceorientation", handle as EventListener, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { heading, granted, needsPermission, supported, requestPermission };
}
