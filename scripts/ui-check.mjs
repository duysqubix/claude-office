// Behaviour checks for the co- UI modules (client/src/ui): the dev UI kit, then the game itself
// in the demo office (game.mjs; GAME_LIVE=1 adds read-only screenshots of the live office).
//   npm run dev   (or any server on 4777), then:   node scripts/ui-check.mjs
// UI_KIT_BASE=http://127.0.0.1:4778 node scripts/ui-check.mjs   for a dev server on another port.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const suites = ['kit', 'asks', 'chat', 'markdown', 'game', 'regulars'];
let failed = 0;
for (const s of suites) {
  const file = fileURLToPath(new URL(`./ui-check/${s}.mjs`, import.meta.url));
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: process.env, timeout: 600_000 });
  const lines = [...new Set((r.stdout ?? '').split('\n').filter((l) => /^(PASS|FAIL)/.test(l)))];
  const fails = lines.filter((l) => l.startsWith('FAIL'));
  failed += fails.length + (r.status !== 0 && !fails.length ? 1 : 0);
  console.log(`${s}: ${lines.length - fails.length} passed, ${fails.length} failed${r.status !== 0 && !fails.length ? ' (crashed: ' + (r.stderr || r.error || '').toString().split('\n')[0] + ')' : ''}`);
  for (const f of fails) console.log('  ' + f);
}
process.exit(failed ? 1 : 0);
