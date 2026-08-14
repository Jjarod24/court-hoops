export type Box = { x: number; y: number; w: number; h: number };

export type HoopLock = {
  /** Rim box in normalized (0..1) frame coordinates. */
  rim: Box;
  /** Estimated backboard box, when a plausible one sits above the rim. */
  backboard: Box | null;
  /** 0..1 — how stable/trustworthy the lock is. */
  confidence: number;
};

/**
 * Heuristic rim finder.
 *
 * A basketball rim is a *stationary*, wide-and-flat, warm-coloured blob.
 * That is what separates it from the ball (same colour, but small, round and
 * moving). We downsample the frame, mask warm pixels, take connected
 * components, keep wide/flat ones and require positional stability across
 * frames before reporting a lock.
 *
 * This is intentionally written behind the `HoopLock` contract so a trained
 * rim-detection model (TFJS / ONNX) can replace `detect()` without touching
 * the tracker or the UI.
 */
export class HoopDetector {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly W = 160;
  private readonly H = 120;

  private candidate: Box | null = null;
  private stable = 0;
  private locked: HoopLock | null = null;

  /** Manual override — player taps where the rim is. */
  setManual(rim: Box) {
    this.locked = { rim, backboard: backboardFor(rim), confidence: 1 };
    this.candidate = rim;
    this.stable = 30;
  }

  reset() {
    this.locked = null;
    this.candidate = null;
    this.stable = 0;
  }

  get lock() {
    return this.locked;
  }

  detect(video: HTMLVideoElement): HoopLock | null {
    if (this.locked && this.locked.confidence >= 1) return this.locked;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.W;
      this.canvas.height = this.H;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
    const ctx = this.ctx;
    if (!ctx) return this.locked;

    try {
      ctx.drawImage(video, 0, 0, this.W, this.H);
    } catch {
      return this.locked;
    }
    const { data } = ctx.getImageData(0, 0, this.W, this.H);

    const mask = new Uint8Array(this.W * this.H);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      // Warm rim / net-hardware tones: strong red, mid green, low blue.
      if (r > 95 && r > g * 1.25 && g > b * 0.9 && b < r * 0.75) mask[p] = 1;
    }

    const boxes = components(mask, this.W, this.H);
    let best: { box: Box; score: number } | null = null;
    for (const b of boxes) {
      const w = b.w / this.W;
      const h = b.h / this.H;
      const area = w * h;
      if (area < 0.002 || area > 0.35) continue;
      const aspect = b.w / Math.max(1, b.h);
      if (aspect < 1.15) continue; // rims read as wide ellipses; balls do not
      const score = aspect * Math.min(1, area * 12);
      if (!best || score > best.score) {
        best = {
          box: { x: b.x / this.W, y: b.y / this.H, w, h },
          score,
        };
      }
    }

    if (!best) {
      this.stable = Math.max(0, this.stable - 1);
      if (this.stable === 0) this.candidate = null;
      return this.locked;
    }

    const prev = this.candidate;
    const moved = prev
      ? Math.hypot(
          best.box.x + best.box.w / 2 - (prev.x + prev.w / 2),
          best.box.y + best.box.h / 2 - (prev.y + prev.h / 2),
        )
      : 1;
    if (prev && moved < 0.06) {
      this.stable += 1;
      // Smooth the box so the AR outline does not jitter.
      this.candidate = {
        x: prev.x * 0.8 + best.box.x * 0.2,
        y: prev.y * 0.8 + best.box.y * 0.2,
        w: prev.w * 0.8 + best.box.w * 0.2,
        h: prev.h * 0.8 + best.box.h * 0.2,
      };
    } else {
      this.stable = 1;
      this.candidate = best.box;
    }

    const confidence = Math.min(0.98, this.stable / 24);
    if (this.candidate && confidence >= 0.6) {
      this.locked = {
        rim: this.candidate,
        backboard: backboardFor(this.candidate),
        confidence,
      };
    }
    return this.locked;
  }

  /** Live candidate + progress, for the "searching" HUD. */
  get progress() {
    return { candidate: this.candidate, confidence: Math.min(0.98, this.stable / 24) };
  }
}

function backboardFor(rim: Box): Box {
  const w = Math.min(1, rim.w * 2.4);
  const h = Math.min(1, rim.h * 4.5);
  return {
    x: Math.max(0, rim.x + rim.w / 2 - w / 2),
    y: Math.max(0, rim.y - h * 0.85),
    w,
    h,
  };
}

type RawBox = { x: number; y: number; w: number; h: number };

/** Connected components (4-neighbour flood fill) over a binary mask. */
function components(mask: Uint8Array, W: number, H: number): RawBox[] {
  const seen = new Uint8Array(mask.length);
  const out: RawBox[] = [];
  const stack: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    let minX = W,
      maxX = 0,
      minY = H,
      maxY = 0,
      count = 0;
    stack.length = 0;
    stack.push(p);
    seen[p] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W;
      const y = (q / W) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[q - 1] && !seen[q - 1]) (seen[q - 1] = 1), stack.push(q - 1);
      if (x < W - 1 && mask[q + 1] && !seen[q + 1]) (seen[q + 1] = 1), stack.push(q + 1);
      if (y > 0 && mask[q - W] && !seen[q - W]) (seen[q - W] = 1), stack.push(q - W);
      if (y < H - 1 && mask[q + W] && !seen[q + W]) (seen[q + W] = 1), stack.push(q + W);
    }
    if (count < 12) continue;
    out.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return out;
}
