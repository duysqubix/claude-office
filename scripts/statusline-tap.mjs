#!/usr/bin/env node
// Claude Code status line tap for Claude Office (installed by `npm run statusline:install`).
// Claude Code pipes a JSON snapshot (model, context window, cost, plan rate limits) to the
// status line command every time it redraws. This saves that snapshot for the office's Team
// Room board, then hands the same JSON to your previous status line command (if you had one)
// and prints its output unchanged. Without one, it prints a small default line.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.claude-office');
const SNAPSHOT = join(DIR, 'statusline.json');
const NEXT = join(DIR, 'statusline-next.json');

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

try {
  const data = JSON.parse(input);
  mkdirSync(DIR, { recursive: true });
  const tmp = `${SNAPSHOT}.${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), data }));
  renameSync(tmp, SNAPSHOT);
} catch {
  // Not JSON or not writable: never break the status line over it.
}

let next = null;
try {
  next = JSON.parse(readFileSync(NEXT, 'utf8'))?.statusLine ?? null;
} catch {
  next = null;
}

if (next?.type === 'command' && typeof next.command === 'string' && next.command.trim()) {
  const child = spawn('/bin/sh', ['-c', next.command], { stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.end(input);
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', () => process.exit(0));
} else {
  // Default line: model · context · plan usage.
  try {
    const d = JSON.parse(input);
    const parts = [d.model?.display_name ?? d.model?.id ?? 'Claude'];
    if (typeof d.context_window?.used_percentage === 'number') parts.push(`ctx ${d.context_window.used_percentage}%`);
    const rl = d.rate_limits ?? {};
    if (typeof rl.five_hour?.used_percentage === 'number') parts.push(`5h ${rl.five_hour.used_percentage}%`);
    if (typeof rl.seven_day?.used_percentage === 'number') parts.push(`wk ${rl.seven_day.used_percentage}%`);
    process.stdout.write(parts.join(' · '));
  } catch {
    process.stdout.write('Claude');
  }
}
