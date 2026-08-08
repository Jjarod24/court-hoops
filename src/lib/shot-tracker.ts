export type BallPoint = { x: number; y: number; t: number; score?: number };

export type HoopZone = { cx: number; cy: number; r: number };

export type ShotResult = "made" | "missed";

export type ShotDetection = {
  result: ShotResult;
  /** 0..1 — how sure the detector is about this call. */
  confidence: number;
  /** Number of ball sightings during the flight. */
  samples: number;
};

/**
 * Normalized-coordinate shot tracker.
 * Coordinates are 0..1 relative to the camera frame.
 *
 * A shot is registered when the ball travels from above the hoop zone to
 * below it. It counts as "made" when the ball passed inside the hoop circle
 * on its way down, otherwise it's a miss.
 */
export class ShotTracker {
  private armed = false;
  private throughHoop = false;
  private lastSeen = 0;
  private cooldownUntil = 0;
  private samples = 0;
  private scoreSum = 0;
  /** Closest the ball ever got to the rim centre, in units of the rim radius. */
  private closest = Infinity;

  constructor(private zone: HoopZone) {}

  setZone(zone: HoopZone) {
    this.zone = zone;
  }

  /** Feed a detected ball position. Returns a detection when a shot completes. */
  push(p: BallPoint): ShotDetection | null {
    const { cx, cy, r } = this.zone;
    this.lastSeen = p.t;
    if (p.t < this.cooldownUntil) return null;

    const dist = Math.hypot(p.x - cx, p.y - cy);

    // Ball clearly above the rim → arm the tracker for a descent.
    if (p.y < cy - r) {
      if (!this.armed) this.resetFlight();
      this.armed = true;
      this.samples += 1;
      this.scoreSum += p.score ?? 0.5;
      this.closest = Math.min(this.closest, dist / r);
      return null;
    }

    if (!this.armed) return null;

    this.samples += 1;
    this.scoreSum += p.score ?? 0.5;
    this.closest = Math.min(this.closest, dist / r);

    // Passing through the rim area.
    if (dist < r) {
      this.throughHoop = true;
      return null;
    }

    // Ball has dropped below the rim → resolve the shot.
    if (p.y > cy + r) {
      const detection = this.resolve();
      this.reset(p.t);
      return detection;
    }

    return null;
  }

  /** Call on frames where no ball was found. Resolves a stalled attempt. */
  tick(t: number): ShotDetection | null {
    if (!this.armed || t < this.cooldownUntil) return null;
    // Ball vanished mid-flight (out of frame / occluded) for a while.
    if (t - this.lastSeen > 1600) {
      const detection = this.resolve(true);
      this.reset(t);
      return detection;
    }
    return null;
  }

  private resolve(stalled = false): ShotDetection {
    const result: ShotResult = this.throughHoop ? "made" : "missed";
    const avgScore = this.samples > 0 ? this.scoreSum / this.samples : 0.4;

    // More sightings → more trustworthy call.
    const sampleFactor = Math.min(1, this.samples / 8);
    // Clear separation from the rim (well inside, or well outside) → confident.
    const margin = this.throughHoop
      ? 1 - Math.min(1, this.closest)
      : Math.min(1, Math.max(0, this.closest - 1));
    const marginFactor = 0.4 + 0.6 * Math.min(1, margin * 1.8);

    let confidence = avgScore * (0.45 + 0.3 * sampleFactor + 0.25 * marginFactor);
    if (stalled) confidence *= 0.6; // ball was lost mid-flight

    return {
      result,
      confidence: Math.max(0.05, Math.min(0.99, confidence)),
      samples: this.samples,
    };
  }

  private resetFlight() {
    this.throughHoop = false;
    this.samples = 0;
    this.scoreSum = 0;
    this.closest = Infinity;
  }

  private reset(t: number) {
    this.armed = false;
    this.resetFlight();
    this.cooldownUntil = t + 1200;
  }
}
