import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

/**
 * Scene (N8AO ambient occlusion, or a plain render when AO is off) → bloom → tone mapping and
 * sRGB (OutputPass) → colour grade + vignette → SMAA.
 *
 * The composer's targets are half-float, so HDR survives until OutputPass: only emissive
 * values above the bloom threshold glow (lamp bulbs, screens, signs), never lit walls.
 * Hardware MSAA doesn't survive the render-target round trip, so SMAA smooths the edges.
 */
export interface Post {
  composer: EffectComposer;
  setAO(on: boolean): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  render(): void;
}

/** Brightest a lit surface gets in this office is ~1.1; emissives are authored at 1.3–3. */
const BLOOM_THRESHOLD = 1.15;

const GradeShader = {
  name: 'OfficeGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.08 },
    warmth: { value: new THREE.Vector3(1.02, 1.0, 0.975) },
    vignette: { value: 0.16 },
    aspect: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform vec3 warmth;
    uniform float vignette;
    uniform float aspect;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation) * warmth;
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c.rgb *= 1.0 - vignette * smoothstep(0.45, 1.2, length(d));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
};

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, aoOn: boolean): Post {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer);

  const plain = new RenderPass(scene, camera);
  composer.addPass(plain);

  const ao = new N8AOPass(scene, camera, size.x * pr, size.y * pr);
  ao.setQualityMode('Medium');
  const cfg = ao.configuration;
  cfg.halfRes = true;
  cfg.gammaCorrection = false; // OutputPass handles tone mapping + sRGB
  cfg.aoRadius = 1.0;
  cfg.distanceFalloff = 1.0;
  cfg.intensity = 2.5;
  // N8AO converts this colour from sRGB itself, so hand it the raw sRGB components.
  cfg.color = new THREE.Color().setHex(0x3b2a33, THREE.LinearSRGBColorSpace);
  // Transparent things here (glass, decals, steam) never write depth, so AO is simply computed
  // for what is behind them. N8AO's transparency-aware mode would re-render them twice per frame
  // and roughly double the cost on a retina screen for no visible gain. Turning auto-detection
  // off also stops it re-scanning the scene graph every frame.
  ao.autoDetectTransparency = false;
  cfg.transparencyAware = false;
  composer.addPass(ao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, BLOOM_THRESHOLD);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new SMAAPass());

  const setAO = (on: boolean) => {
    ao.enabled = on;
    plain.enabled = !on;
  };
  setAO(aoOn);

  return {
    composer,
    setAO,
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      grade.uniforms.aspect.value = width / Math.max(1, height);
    },
    render() {
      composer.render();
    },
  };
}
