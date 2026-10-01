import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

/**
 * N8AO ambient occlusion → tone mapping/sRGB (OutputPass) → SMAA.
 * Hardware MSAA does not survive the render-target round trip, so SMAA restores
 * smooth edges; on high-DPI screens it is skipped because the pixels already are.
 */
export interface Post {
  composer: EffectComposer;
  ao: N8AOPass;
  setSize(width: number, height: number, pixelRatio: number): void;
  render(): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Post {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer);

  const ao = new N8AOPass(scene, camera, size.x * pr, size.y * pr);
  ao.setQualityMode('Medium');
  const cfg = ao.configuration;
  cfg.halfRes = true;
  cfg.gammaCorrection = false; // OutputPass handles tone mapping + sRGB
  cfg.aoRadius = 1.1;
  cfg.distanceFalloff = 1.0;
  cfg.intensity = 2.4;
  cfg.color = new THREE.Color('#3B2A33');
  // Transparent things here (glass, faded walls, decals, steam) never write depth, so AO is
  // simply computed for what is behind them. N8AO's transparency-aware mode would re-render
  // them twice per frame and roughly double the cost on a retina screen for no visible gain.
  // Turning auto-detection off also stops it re-scanning the scene graph every frame.
  ao.autoDetectTransparency = false;
  cfg.transparencyAware = false;
  composer.addPass(ao);

  composer.addPass(new OutputPass());
  const smaa = new SMAAPass();
  composer.addPass(smaa);

  return {
    composer,
    ao,
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      smaa.enabled = pixelRatio < 1.5;
    },
    render() {
      composer.render();
    },
  };
}
