// Screen-door fading for characters (procedural rig and kit parts alike).
//
// A fading character is drawn as an ordered 4×4 (Bayer) dither in screen space rather than
// alpha blended: each pixel is either drawn solid or not at all, with depth writes on. So the
// insides and far side never show through (no ghosting), nothing needs sorting, and edges stay
// crisp. The pattern is anchored to the screen's pixels, so it never crawls while the camera is
// still. The test is compiled into every character material and costs one uniform compare when
// solid, so starting or ending a fade never recompiles a shader.
import type * as THREE from 'three';

const fades = new WeakMap<THREE.Material, { value: number }>();

const DECLARE = /* glsl */ `
uniform float uDitherFade;
const float DITHER_BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
`;

/** First thing in main(): keep a pixel only while the fade is above its cell's threshold. */
const TEST = /* glsl */ `
  if (uDitherFade < 1.0) {
    ivec2 ditherCell = ivec2(gl_FragCoord.xy) & 3;
    if (uDitherFade * 16.0 <= DITHER_BAYER[ditherCell.x + 4 * ditherCell.y] + 0.5) discard;
  }
`;

/**
 * Let `m` fade by dithering. Idempotent; keeps whatever onBeforeCompile `m` already has (the
 * fresnel rim), so call it after the material is otherwise finished.
 */
export function ditherable<M extends THREE.Material>(m: M): M {
  if (fades.has(m)) return m;
  const fade = { value: 1 };
  fades.set(m, fade);
  const prev = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uDitherFade = fade;
    shader.fragmentShader = DECLARE + shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (head) => head + TEST);
  };
  m.customProgramCacheKey = () => key + '|dither';
  return m;
}

/** How much of `m` is drawn: 1 = solid, 0 = gone. No effect on materials that don't dither. */
export function setDither(m: THREE.Material, fade: number): void {
  const f = fades.get(m);
  if (f) f.value = fade;
}

/** The fade `m` is drawn at (1 for materials that don't dither). */
export function ditherOf(m: THREE.Material): number {
  return fades.get(m)?.value ?? 1;
}
