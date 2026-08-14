export type BallPoint = { x: number; y: number; t: number; score?: number };

/** Rim zone in normalized frame coordinates. */
export type HoopZone = { cx: number; cy: number; r: number };

export type ShotResult = "made" | "missed" | "unclear";

export type TrackerState =
  | "idle"
  | "ball_detected"
  | "shot_started"
  | "in_flight"
  | "approaching"
  | "hoop_event"
  | "clearing";

export type ShotDetection = {
  result: ShotResult;
  /** 0..1 — how sure the tracker is about this call. */
  confidence: number;
  /** Number of ball sightings during the flight. */
  samples: number;
};

const MIN_CONFIDENCE = 0.35;
const FLIGHT_MIN_SAMPLES = 4;

/**
 * Temporal basketball shot tracker.
 *
 * Consumes normalized (0..1) ball positions plus a rim zone and runs a state
 * machine so only real shooting trajectories are scored:
 *
 *   idle → ball_detected → shot_started → in_flight → approaching
 *        → hoop_event → make/miss → clearing → idle
 *
 * Balls that are carried, dribbled, passed or bounced elsewhere never leave
 * `ball_detected`, and every resolved shot is followed by a clearing phase so
 * one shot can never be counted twice.
 */
export class ShotTracker {
  private state: TrackerState = "idle";
  private history: BallPoint[] = [];
  private lastSeen = 0;
  private cooldownUntil = 0;

  // per-flight accumulators
  private samples = 0;
  private scoreSum = 0;
  private closest = Infinity;
  private crossedRimPlane = false;
  private insideRim = false;
  private aboveRim = false;
  private approachStart = 0;

  constructor(private zone: HoopZone) {}

  setZone(zone: HoopZone) {
    this.zone = zone;
  }

  get currentState() {
    return this.state;
  }

  get trajectory() {
    return this.history;
  }

  /** Feed a detected ball position. Returns a detection when a shot resolves. */
  push(p: BallPoint): ShotDetection | null {
    this.lastSeen = p.t;
    this.history.push(p);
    if (this.history.length > 45) this.history.shift();

    if (p.t < this.cooldownUntil) {
      this.state = "clearing";
      return null;
    }

    const { cx, cy, r } = this.zone;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    const rel = dist / Math.max(r, 0.02);

    if (this.state === "clearing" || this.state === "idle") {
      // Only leave the clearing phase once the ball is well away from the rim.
      if (this.state === "clearing" && rel < 2.2) return null;
      this.state = "ball_detected";
      this.resetFlight();
    }

    if (this.state === "ball_detected") {
      const v = this.velocity();
      const towardHoop = v ? Math.sign(cx - p.x) === Math.sign(v.vx) || Math.abs(v.vx) < 0.004 : false;
      const rising = v ? v.vy < -0.012 : false; // moving upward in frame
      // A shot only starts on an upward release heading toward the rim.
      if (rising && towardHoop && rel > 0.9) {
        this.state = "shot_started";
        this.resetFlight();
      } else {
        return null;
      }
    }

    this.samples += 1;
    this.scoreSum += p.score ?? 0.5;
    this.closest = Math.min(this.closest, rel);
    if (p.y < cy - r * 0.6) this.aboveRim = true;

    if (this.state === "shot_started" && this.samples >= 2) this.state = "in_flight";
    if (rel < 2.5 && (this.state === "in_flight" || this.state === "shot_started")) {
      this.state = "approaching";
      this.approachStart = p.t;
    }

    if (rel < 1) {
      this.insideRim = true;
      this.state = "hoop_event";
    }

    // Rim-plane crossing: was above the rim, now below it, laterally inside.
    if (this.aboveRim && p.y > cy + r * 0.35 && Math.abs(p.x - cx) < r * 0.95 && this.insideRim) {
      this.crossedRimPlane = true;
    }

    // Ball has dropped clearly below the rim → resolve.
    if ((this.state === "hoop_event" || this.state === "approaching") && p.y > cy + r * 1.8) {
      return this.finish(p.t);
    }

    // Ball flew past / over the rim and is now travelling away from it.
    if (this.state === "approaching" && rel > 4 && p.t - this.approachStart > 500) {
      return this.finish(p.t);
    }

    return null;
  }

  /** Call on frames where no ball was found. Resolves stalled attempts. */
  tick(t: number): ShotDetection | null {
    if (t >= this.cooldownUntil && this.state === "clearing") {
      this.state = "idle";
      this.resetFlight();
      return null;
    }
    const airborne =
      this.state === "in_flight" || this.state === "approaching" || this.state === "hoop_event";
    if (!airborne) {
      if (this.state === "ball_detected" && t - this.lastSeen > 1200) this.state = "idle";
      return null;
    }
    if (t - this.lastSeen > 1400) return this.finish(t, true);
    return null;
  }

  private velocity() {
    const n = this.history.length;
    if (n < 3) return null;
    const a = this.history[n - 3]!;
    const b = this.history[n - 1]!;
    const dt = Math.max(1, b.t - a.t);
    return { vx: ((b.x - a.x) / dt) * 16, vy: ((b.y - a.y) / dt) * 16 };
  }

  private finish(t: number, stalled = false): ShotDetection {
    const detection = this.resolve(stalled);
    this.state = "clearing";
    this.cooldownUntil = t + 1200;
    this.resetFlight();
    return detection;
  }

  private resolve(stalled: boolean): ShotDetection {
    const avgScore = this.samples > 0 ? this.scoreSum / this.samples : 0.4;
    const sampleFactor = Math.min(1, this.samples / 8);

    const made = this.crossedRimPlane;
    // Margin: how cleanly the ball was inside (make) or outside (miss) the rim.
    const margin = made
      ? 1 - Math.min(1, this.closest)
      : Math.min(1, Math.max(0, this.closest - 1));
    const marginFactor = 0.4 + 0.6 * Math.min(1, margin * 1.8);

    let confidence = avgScore * (0.45 + 0.3 * sampleFactor + 0.25 * marginFactor);
    if (stalled) confidence *= 0.55;
    if (this.samples < FLIGHT_MIN_SAMPLES) confidence *= 0.6;
    if (!this.aboveRim && made) confidence *= 0.7;

    confidence = Math.max(0.02, Math.min(0.99, confidence));

    // Not sure enough → report "unclear" so the shot can be retaken.
    if (confidence < MIN_CONFIDENCE || this.samples < 3) {
      return { result: "unclear", confidence, samples: this.samples };
    }
    return { result: made ? "made" : "missed", confidence, samples: this.samples };
  }

  private resetFlight() {
    this.samples = 0;
    this.scoreSum = 0;
    this.closest = Infinity;
    this.crossedRimPlane = false;
    this.insideRim = false;
    this.aboveRim = false;
    this.approachStart = 0;
  }
}
