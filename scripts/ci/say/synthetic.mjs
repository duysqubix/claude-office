// Say against synthetic screens: the real say() and dialogOnScreen() from server/tmux.ts, on the
// screens in screens.mjs, drawn into a tmux server of its own (its own socket dir, never yours)
// and pinned down the way the office acts on its hires.
// A change in how the office reads Claude Code's input box shows up here as a failed case; a
// change in how Claude Code draws it shows up in live.mjs, against the real thing.
//   node --import tsx scripts/ci/say/synthetic.mjs [--json]     (scripts/compat.mjs runs it)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boxes, screens } from './screens.mjs';

// The office module runs tmux with this process's environment: point both at a private server.
const dir = mkdtempSync(join(realpathSync(tmpdir()), 'say-'));
process.env.TMUX_TMPDIR = dir;
for (const k of ['TMUX', 'TMUX_PANE']) delete process.env[k];
process.env.LANG = process.env.LC_ALL = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';
const tmux = (...args) => execFileSync('tmux', args, { env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** A session pinned down the way the office acts on its hires: `$<id>@<server pid>/<name>`. */
const pinned = (name) => `${tmux('display-message', '-p', '-t', `=${name}:`, '#{session_id}@#{pid}').trim()}/${name}`;
const { dialogOnScreen, say } = await import('../../../server/tmux.ts');
const fakeBox = fileURLToPath(new URL('./fake-box.mjs', import.meta.url));

const stop = () => {
  try {
    tmux('kill-server');
  } catch {
    // never started
  }
  rmSync(dir, { recursive: true, force: true });
};
// Stopped from outside (Ctrl-C, compat.mjs's time limit): its tmux server goes too.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stop();
    process.exit(1);
  });

const results = [];
const record = (c, ok, detail) => results.push({ group: c.group, name: c.name, ok, detail });
try {
  tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'keep', '-x', '160', '-y', '48', '--', '/bin/sleep', '600');
  // Draw every screen first, then look: one wait instead of one per screen. Names say() accepts.
  const name = (i) => `office-${String(i).padStart(8, '0')}`;
  screens.forEach((c, i) => {
    const file = join(dir, `screen-${i}.txt`);
    writeFileSync(file, c.lines.join('\n'));
    tmux('new-session', '-d', '-s', name(i), '-x', '160', '-y', '48', '--', '/bin/sh', '-c', `cat '${file}'; exec /bin/sleep 600`);
  });
  await wait(800);
  for (const [i, c] of screens.entries()) {
    if (c.check === 'dialog') {
      const got = await dialogOnScreen(pinned(name(i)), c.typing);
      record(c, got === c.want, got === c.want ? '' : c.want ? `Enter would go out (typing ${JSON.stringify(c.typing.slice(0, 40))})` : 'refused: our text would never be sent');
    } else {
      const said = await say(pinned(name(i)), 'probe text', async () => false);
      const got = said === 'not-pasted' || said === 'draft' ? said : 'paste';
      record(c, got === c.want, got === c.want ? '' : `${got}, want ${c.want}`);
    }
  }

  // A stand-in input box that takes the paste and Enter, and logs what Enter sent.
  const box = (i) => `office-b${String(i).padStart(7, '0')}`;
  boxes.forEach((c, i) => {
    writeFileSync(join(dir, `box-${i}.log`), '');
    tmux('new-session', '-d', '-s', box(i), '-x', '120', '-y', '20', '--', process.execPath, fakeBox, join(dir, `box-${i}.log`), c.enter, c.ghost, c.rule);
  });
  await wait(1000);
  for (const [i, c] of boxes.entries()) {
    const got = await say(pinned(box(i)), c.text, async () => false);
    const seen = readFileSync(join(dir, `box-${i}.log`), 'utf8').trim();
    record(c, got === c.want && seen === c.logged, `${got}; the box got ${seen || '(no Enter)'}`);
  }
} catch (err) {
  results.push({ group: 'synthetic screens', name: 'ran to the end', ok: false, detail: String(err?.stack ?? err).split('\n').slice(0, 3).join(' / ') });
} finally {
  stop();
}

const failed = results.filter((r) => !r.ok).length;
if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(results)}\n`, () => process.exit(failed ? 1 : 0));
else {
  for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.group}: ${r.name}${r.ok && !r.detail.includes(';') ? '' : `  (${r.detail})`}`);
  console.log(failed ? `\n${failed} of ${results.length} failed` : `\nAll ${results.length} good.`);
  process.exit(failed ? 1 : 0);
}
