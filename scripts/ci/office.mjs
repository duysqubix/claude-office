// An office of its own, for CI and for checks that must never touch yours: a throwaway HOME
// (so its own ~/.claude), a private tmux server and a port nobody else uses. It never sees
// your sessions, your tmux or your Claude login, and nothing in it shows up in your office.
// Used by scripts/ci/smoke.mjs, scripts/ci/ui.mjs and scripts/compat.mjs.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Your own office and the shared dev office: never ours. */
const TAKEN = new Set([4777, 4778]);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A free port on 127.0.0.1 (never 4777 or 4778). */
export async function freePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const s = net.createServer();
      s.unref();
      s.on('error', reject);
      s.listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
    });
    if (!TAKEN.has(port)) return port;
  }
}

/**
 * process.env with nothing that points at your own tmux, Claude session or login: inside a
 * tmux pane, $TMUX would send every tmux command to your server, and a Claude Code session's
 * variables would make a claude started here think it is nested in yours.
 */
export function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k === 'TMUX' || k === 'TMUX_PANE' || k === 'CLAUDECODE') continue;
    if (/^(CLAUDE_|ANTHROPIC_|npm_)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

/** A throwaway home: HOME with an empty ~/.claude, a private tmux socket dir and the env for both. */
export function makeHome(prefix = 'office-ci-') {
  // os.tmpdir(), not a long scratch path: tmux's socket path must stay under ~100 bytes. Its real
  // path, so folders compare equal to what a shell or Claude Code reports (macOS: /var → /private/var).
  const dir = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  const home = join(dir, 'home');
  const claudeHome = join(home, '.claude');
  const tmuxDir = join(dir, 'tmux');
  for (const d of [join(claudeHome, 'sessions'), join(claudeHome, 'projects'), tmuxDir]) mkdirSync(d, { recursive: true });
  // A login zsh with no .zshrc asks new-user questions instead of running what it's given.
  writeFileSync(join(home, '.zshrc'), '');
  const env = cleanEnv({ HOME: home, CLAUDE_HOME: claudeHome, CLAUDE_CONFIG_DIR: claudeHome, TMUX_TMPDIR: tmuxDir });
  return {
    dir,
    home,
    claudeHome,
    env,
    /** tmux on this home's private server. */
    tmux: (...args) => execFileSync('tmux', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
    cleanup() {
      try {
        execFileSync('tmux', ['kill-server'], { env, stdio: 'ignore' });
      } catch {
        // no tmux server was started
      }
      if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true });
      else console.log(`  (KEEP: left ${dir})`);
    },
  };
}

function get(port, path) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 3000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(0));
  });
}

/**
 * Start the office server (server/index.ts through tsx) in `home` on `port`. `dev` mounts Vite
 * (the ui-kit pages only exist there); otherwise it serves dist/. Thought bubbles are off unless
 * `env` turns them on. Resolves once /api/roster answers; `stop()` ends it.
 */
export async function startOffice({ home, port, dev = false, env = {}, readyMs = 90_000 }) {
  if (TAKEN.has(port)) throw new Error(`Refusing port ${port}: that's someone's office`);
  const childEnv = { ...home.env, PORT: String(port), CLAUDE_OFFICE_THOUGHTS: '0', ...env };
  if (dev) delete childEnv.NODE_ENV;
  else childEnv.NODE_ENV = 'production';
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  let exited = null;
  child.on('exit', (code, signal) => (exited = { code, signal }));

  const started = Date.now();
  while ((await get(port, '/api/roster')) !== 200) {
    if (exited) throw new Error(`The office exited (${exited.code ?? exited.signal}) before it opened:\n${log}`);
    if (Date.now() - started > readyMs) {
      child.kill('SIGKILL');
      throw new Error(`The office didn't open on :${port} within ${readyMs / 1000} s:\n${log}`);
    }
    await wait(250);
  }
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    log: () => log,
    async stop() {
      if (exited) return;
      child.kill('SIGTERM');
      for (let t = 0; t < 5000 && !exited; t += 100) await wait(100);
      if (!exited) child.kill('SIGKILL');
    },
  };
}
