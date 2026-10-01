// Damped springs: x'' = k(target − x) − c·x'. Underdamped by default so things overshoot
// and settle with a little jiggle. Parameterised by natural frequency (Hz) and damping
// ratio ζ (0 = boings forever, 1 = no overshoot), which is far easier to tune than k and c.

const STEP = 1 / 120;

export class Spring {
  value: number;
  target: number;
  velocity = 0;

  constructor(
    public freq = 3,
    public damping = 0.35,
    initial = 0,
  ) {
    this.value = initial;
    this.target = initial;
  }

  update(dt: number): number {
    const w = 2 * Math.PI * this.freq;
    const k = w * w;
    const c = 2 * this.damping * w;
    // Fixed substeps keep stiff springs stable at low frame rates (semi-implicit Euler).
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, STEP);
      this.velocity += (k * (this.target - this.value) - c * this.velocity) * h;
      this.value += this.velocity * h;
      left -= h;
    }
    return this.value;
  }

  /** Add velocity: a poke. */
  kick(v: number): void {
    this.velocity += v;
  }

  /** Jump straight to a value with no motion. */
  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
}

/** Shortest signed difference between two angles, in (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Spring for a heading angle: always takes the short way round. */
export class AngleSpring extends Spring {
  setTarget(angle: number): void {
    this.target = this.value + angleDelta(this.value, angle);
  }

  override update(dt: number): number {
    super.update(dt);
    // Keep the numbers small so wrap maths stays precise forever.
    if (Math.abs(this.value) > Math.PI * 4) {
      const wrap = Math.round(this.value / (Math.PI * 2)) * Math.PI * 2;
      this.value -= wrap;
      this.target -= wrap;
    }
    return this.value;
  }
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Frame-rate independent exponential approach: fraction to move this frame. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
