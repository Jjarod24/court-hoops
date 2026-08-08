export type BallPoint = { x: number; y: number; t: number };

export type HoopZone = { cx: number; cy: number; r: number };

export type ShotResult = "made" | "missed";

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

  constructor(private zone: HoopZone) {}

  setZone(zone: HoopZone) {
    this.zone = zone;
  }

  /** Feed a detected ball position. Returns a result when a shot completes. */
  push(p: BallPoint): ShotResult | null {
    const { cx, cy, r } = this.zone;
    this.lastSeen = p.t;
    if (p.t < this.cooldownUntil) return null;

    const dist = Math.hypot(p.x - cx, p.y - cy);

    // Ball clearly above the rim → arm the tracker for a descent.
    if (p.y < cy - r) {
      this.armed = true;
      this.throughHoop = false;
      return null;
    }

    if (!this.armed) return null;

    // Passing through the rim area.
    if (dist < r) {
      this.throughHoop = true;
      return null;
    }

    // Ball has dropped below the rim → resolve the shot.
    if (p.y > cy + r) {
      const result: ShotResult = this.throughHoop ? "made" : "missed";
      this.reset(p.t);
      return result;
    }

    return null;
  }

  /** Call on frames where no ball was found. Resolves a stalled attempt. */
  tick(t: number): ShotResult | null {
    if (!this.armed || t < this.cooldownUntil) return null;
    // Ball vanished mid-flight (out of frame / occluded) for a while.
    if (t - this.lastSeen > 1600) {
      const result: ShotResult = this.throughHoop ? "made" : "missed";
      this.reset(t);
      return result;
    }
    return null;
  }

  private reset(t: number) {
    this.armed = false;
    this.throughHoop = false;
    this.cooldownUntil = t + 1200;
  }
}
