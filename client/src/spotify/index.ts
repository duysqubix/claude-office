// Spotify on the manager's laptop (#28), wired up in one call from main.ts: the real Spotify (or,
// in the demo office, a pretend one), the laptop app you sit down at, the laptop's own screen in
// the room, and the E prompt at your desk, which says what's playing.
import type * as THREE from 'three';
import type { World } from '../world/types';
import { LaptopApp } from './app';
import { createDemoSpotify } from './mock';
import { LaptopScreen } from './screen';
import { SpotifyStore } from './store';
import { createWebSpotify } from './web';

export type { LaptopApp };
export { laptopShot, screenRect } from './seat';

/** The E prompt at your desk while nothing plays. */
export const USE_LAPTOP = 'Use your laptop';

export function createSpotify(opts: { demo: boolean; params: URLSearchParams; world: World; camera: THREE.Camera; root: HTMLElement }): LaptopApp {
  const store = new SpotifyStore(opts.demo ? createDemoSpotify(opts.params) : createWebSpotify());
  const app = new LaptopApp(opts.root, store);
  if (opts.world.laptop) new LaptopScreen(opts.world.laptop, store, opts.camera);
  const it = opts.world.interactables.find((i) => i.kind === 'laptop');
  if (it) {
    store.subscribe(() => {
      const now = store.state.now;
      it.label = now?.track && !now.paused ? `Spotify: ${now.track.name}` : USE_LAPTOP;
    });
  }
  return app;
}
