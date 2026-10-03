import { execFile } from 'node:child_process';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The environment child processes get. Strips what `npm run` injects (node_modules/.bin on
 * PATH, npm_* vars) so sessions we start in tmux behave like ones started from a terminal,
 * and so a tmux server we happen to start doesn't inherit npm's environment. Everything else
 * (tokens and keys included) is kept on purpose: it's all yours, a tmux server we start hands
 * it to hires and shells as a terminal would, and a login shell re-reads your profile anyway,
 * so stripping it would hide nothing.
 */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith('npm_') || k === 'INIT_CWD' || k === 'NODE_ENV' || k === 'NODE' || k === 'TSX_TSCONFIG_PATH') continue;
    env[k] = v;
  }
  env.PATH = (process.env.PATH ?? '')
    .split(':')
    .filter((p) => p && !p.includes('/node_modules/.bin') && !p.includes('node-gyp-bin'))
    .join(':');
  return env;
}

/** execFile with no shell, a timeout, optional stdin, and a non-throwing result. */
export function run(
  cmd: string,
  args: string[],
  opts: { input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { env: { ...cleanEnv(), ...opts.env }, timeout: opts.timeoutMs ?? 5000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? Number((err as { code: number }).code) : 1) : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? (err ? String(err.message) : '') });
      },
    );
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

/** Absolute path of an executable on PATH, or null. */
export async function which(bin: string): Promise<string | null> {
  const r = await run('/usr/bin/which', [bin]);
  const p = r.stdout.trim().split('\n')[0];
  return r.code === 0 && p ? p : null;
}
