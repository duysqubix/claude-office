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
  },
  server: {
    fs: { allow: [here('.')] },
  },
});
