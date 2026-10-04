// Behaviour checks for the co- UI modules (client/src/ui): the dev UI kit, then the game itself
// in the demo office (game.mjs; GAME_LIVE=1 adds read-only screenshots of the live office).
//   PORT=4778 npm run dev, then:   node scripts/ui-check.mjs
// UI_KIT_BASE / GAME_BASE point the suites at a dev office on another port (default: 4778).
// They never run against your own game on 4777 unless UI_CHECK_ALLOW_4777=1 (ui-check/base.mjs).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Refuse 4777 once, here, rather than once per suite.
const { officeBase } = await import('./ui-check/base.mjs');
console.log(`ui kit at ${officeBase('UI_KIT_BASE')}, game at ${officeBase('GAME_BASE', 'UI_KIT_BASE')}`);

const suites = ['kit', 'asks', 'chat', 'markdown', 'game', 'regulars', 'desks', 'crowd', 'yard', 'shell', 'hotdesk', 'audio', 'camera', 'building', 'spotify'];
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
