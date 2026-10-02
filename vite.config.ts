import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The game server (server/index.ts) mounts Vite as middleware in dev and serves
// dist/client in production, so the client and the API always share one origin.
export default defineConfig({
  root: here('./client'),
  publicDir: here('./client/public'),
  build: {
    outDir: here('./dist/client'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: [here('./client/index.html'), here('./client/catalog.html')],
    },
  },
  server: {
    // One origin for page, assets and API; never answer other origins' reads of the source.
    cors: false,
    fs: { strict: true, allow: [here('.')] },
  },
});
