// Minimal typings for the parts of n8ao 2.x the engine uses (the package ships none).
declare module 'n8ao' {
  import type { Camera, Color, Scene, WebGLRenderTarget } from 'three';
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

  export type N8AOQuality =
    | 'Performance'
    | 'Low'
    | 'Medium'
    | 'High'
    | 'Ultra'
    | 'Neural-Low'
    | 'Neural-Medium'
    | 'Neural-High';

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: Color;
      aoSamples: number;
      denoiseSamples: number;
      denoiseRadius: number;
      denoiseIterations: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
      transparencyAware: boolean;
      accumulate: boolean;
      autoRenderBeauty: boolean;
      colorMultiply: boolean;
      aoTones: number;
      biasOffset: number;
      biasMultiplier: number;
    };
    autoDetectTransparency: boolean;
    beautyRenderTarget: WebGLRenderTarget;
    setQualityMode(mode: N8AOQuality): void;
    setDisplayMode(mode: 'Combined' | 'AO' | 'No AO' | 'Split' | 'Split AO'): void;
  }
}
