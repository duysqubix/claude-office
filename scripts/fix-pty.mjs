// node-pty's prebuilt spawn-helper ships without the executable bit on some installs,
// which makes every spawn fail with "posix_spawnp failed". Restore it.
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'node_modules', 'node-pty');
for (const dir of ['prebuilds', 'build/Release']) {
  const base = join(root, dir);
  if (!existsSync(base)) continue;
  const targets = dir === 'prebuilds' ? readdirSync(base).map((d) => join(base, d, 'spawn-helper')) : [join(base, 'spawn-helper')];
  for (const t of targets) if (existsSync(t)) chmodSync(t, 0o755);
}
