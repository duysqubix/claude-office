// The room the band plays in: a generated reverb tail, vinyl crackle and a distant café
// murmur. All synthesized into buffers once per context (a few milliseconds of work).
import { between, type Rng } from './rng';

const rooms = new WeakMap<BaseAudioContext, Promise<AudioBuffer>>();

/**
 * A small, warm room: decaying noise whose top end dies faster than its body, after a short
 * gap and a few early reflections. Stereo, so the tail spreads. Rendered off the main thread
 * (an OfflineAudioContext), once per context.
 */
export function roomImpulse(ctx: BaseAudioContext, seconds: number, rt60: number, r: Rng): Promise<AudioBuffer> {
  let room = rooms.get(ctx);
  if (room) return room;
  room = renderRoom(ctx.sampleRate, seconds, rt60, r);
  rooms.set(ctx, room);
  return room;
}

async function renderRoom(sr: number, seconds: number, rt60: number, r: Rng): Promise<AudioBuffer> {
  const len = Math.floor(sr * seconds);
  const pre = 0.012;
  const off = new OfflineAudioContext(2, len, sr);
  const noise = off.createBuffer(1, Math.floor(sr * 1.1), sr);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  const merge = off.createChannelMerger(2);
  merge.connect(off.destination);
  for (let ch = 0; ch < 2; ch++) {
    const src = off.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    // Darker as it goes: the top end dies first.
    const lp = off.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(9000, pre);
    lp.frequency.exponentialRampToValueAtTime(900, seconds);
    const g = off.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.setValueAtTime(0, pre);
    g.gain.linearRampToValueAtTime(1, pre + 0.006);
    // −60 dB at rt60.
    g.gain.setTargetAtTime(0, pre + 0.006, rt60 / 6.9);
    src.connect(lp).connect(g).connect(merge, 0, ch);
    src.start(0, ch * 0.53);
  }
  const buf = await off.startRendering();
  for (let ch = 0; ch < 2; ch++) {
    const x = buf.getChannelData(ch);
    let energy = 0;
    for (let i = 0; i < x.length; i++) energy += x[i] * x[i];
    // Early reflections off the café's walls and windows.
    const tap = Math.sqrt(energy / sr) * 4;
    for (let k = 0; k < 6; k++) x[Math.floor(sr * (pre + between(r, 0.004, 0.045)))] += (r() < 0.5 ? -1 : 1) * between(r, 0.25, 0.6) * tap;
    const norm = 1 / Math.sqrt(energy + 1e-9);
    for (let i = 0; i < x.length; i++) x[i] *= norm;
  }
  return buf;
}

/**
 * Vinyl surface for a loop of `seconds`: a faint hiss and sparse crackles (mostly tiny, now and
 * then a pop), filtered and mixed off the main thread. Nothing lands near the loop's ends, so
 * the seam is silent.
 */
export async function surfaceBuffer(ctx: BaseAudioContext, noise: AudioBuffer, seconds: number, r: Rng): Promise<AudioBuffer> {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const off = new OfflineAudioContext(2, len, sr);
  const clicks = off.createBuffer(2, len, sr);
  const L = clicks.getChannelData(0);
  const R = clicks.getChannelData(1);
  const edge = Math.floor(sr * 0.012);
  const click = (at: number, amp: number, tau: number, side: number) => {
    const n = Math.floor(tau * sr * 7);
    const pol = r() < 0.5 ? -1 : 1;
    const right = side === 0 ? between(r, 0.6, 1) : 1;
    for (let k = 0; k < n && at + k < len - edge; k++) {
      // A quick decaying wiggle (opposite signs up front: no DC thump).
      const e = Math.exp(-k / (tau * sr));
      const s = pol * amp * e * (k === 0 ? 1 : k === 1 ? -0.6 : Math.sin(k * 1.9) * 0.5);
      if (side <= 0) L[at + k] += s;
      if (side >= 0) R[at + k] += s * right;
    }
  };
  let t = between(r, 0.02, 0.1);
  while (t < seconds - 0.03) {
    const at = Math.floor(t * sr);
    if (at > edge) {
      const big = r() < 0.035;
      const amp = big ? between(r, 0.12, 0.22) : 0.012 + 0.09 * Math.pow(r(), 3.2);
      click(at, amp, big ? between(r, 0.0004, 0.0009) : between(r, 0.00008, 0.0003), r() < 0.7 ? 0 : r() < 0.5 ? -1 : 1);
    }
    // ~11 per second on average.
    t += -Math.log(1 - r()) / 11;
  }
  const filt = (type: BiquadFilterType, f: number) => {
    const n = off.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    return n;
  };
  const c = off.createBufferSource();
  c.buffer = clicks;
  c.connect(filt('highpass', 350)).connect(off.destination);
  c.start(0);
  // The hiss: the kit's noise, soft-edged, very low; decorrelated left and right.
  const merge = off.createChannelMerger(2);
  merge.connect(off.destination);
  for (let ch = 0; ch < 2; ch++) {
    const h = off.createBufferSource();
    h.buffer = noise;
    h.loop = true;
    const g = off.createGain();
    g.gain.value = 0.0045 / 0.55;
    h.connect(filt('highpass', 1800)).connect(filt('lowpass', 6500)).connect(g).connect(merge, 0, ch);
    h.start(0, ch * noise.duration * 0.5);
  }
  return off.startRendering();
}

/**
 * Café murmur: a few far-off voices made of filtered noise with a speaking rhythm (syllables,
 * phrases, pauses), rendered offline into a loop with a cross-faded seam.
 */
export async function murmurBuffer(sampleRate: number, seconds: number, r: Rng): Promise<AudioBuffer> {
  const fade = 1.5;
  const total = seconds + fade;
  const ctx = new OfflineAudioContext(2, Math.floor(sampleRate * total), sampleRate);
  const len = Math.floor(sampleRate * 3);
  const noise = ctx.createBuffer(1, len, sampleRate);
  const d = noise.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) {
    b = 0.97 * b + (r() * 2 - 1) * 0.03;
    d[i] = b * 6 + (r() * 2 - 1) * 0.15;
  }
  const out = ctx.createGain();
  out.gain.value = 0.9;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500;
  out.connect(lp).connect(ctx.destination);
  const voices = 7;
  for (let v = 0; v < voices; v++) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 6;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = between(r, -0.8, 0.8);
    const mixG = ctx.createGain();
    mixG.gain.value = between(r, 0.5, 1);
    src.connect(f1);
    src.connect(f2);
    f1.connect(amp);
    f2.connect(amp);
    amp.connect(pan).connect(mixG).connect(out);
    // Each voice has its own pitch of speech (formants move with the "vowels").
    const low = between(r, 0.85, 1.25);
    let t = between(r, 0, 2);
    while (t < total) {
      // A phrase: 4–14 syllables, then a pause.
      const syll = 4 + Math.floor(r() * 10);
      for (let s = 0; s < syll && t < total; s++) {
        const len = between(r, 0.12, 0.28);
        const peak = between(r, 0.4, 1);
        amp.gain.setTargetAtTime(peak, t, 0.025);
        amp.gain.setTargetAtTime(peak * 0.15, t + len * 0.6, 0.03);
        f1.frequency.setTargetAtTime(between(r, 320, 800) * low, t, 0.03);
        f2.frequency.setTargetAtTime(between(r, 950, 2200) * low, t, 0.03);
        t += len;
      }
      amp.gain.setTargetAtTime(0, t, 0.06);
      t += between(r, 0.4, 2.8);
    }
    src.start(0, r() * 2.5);
  }
  const rendered = await ctx.startRendering();
  // Cross-fade the tail into the head so the loop has no seam.
  const n = Math.floor(sampleRate * seconds);
  const f = Math.floor(sampleRate * fade);
  const loop = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate });
  for (let ch = 0; ch < 2; ch++) {
    const src = rendered.getChannelData(ch);
    const dst = loop.getChannelData(ch);
    dst.set(src.subarray(0, n));
    for (let i = 0; i < f; i++) {
      const x = i / f;
      dst[i] = src[i] * Math.sqrt(x) + src[n + i] * Math.sqrt(1 - x);
    }
  }
  return loop;
}

/**
 * The speakers' safety net: a fast limiter just under full scale, so piled-up sounds never
 * clip, and transparent below it. (A compressor node adds make-up gain by itself: about
 * +1.2 dB with these settings, taken back here so nothing is louder than it was made.)
 * Connects to `to` and returns the input.
 */
export function limiter(ctx: BaseAudioContext, to: AudioNode): AudioNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -3;
  c.knee.value = 3;
  c.ratio.value = 20;
  c.attack.value = 0.003;
  c.release.value = 0.25;
  const trim = ctx.createGain();
  trim.gain.value = 0.871;
  c.connect(trim).connect(to);
  return c;
}
