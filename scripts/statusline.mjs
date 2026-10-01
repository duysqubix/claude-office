// Opt-in: let the office read plan usage (5-hour / weekly limits) straight from Claude Code.
//   npm run statusline:install     wraps your current status line with scripts/statusline-tap.mjs
//   npm run statusline:uninstall   restores your previous status line exactly
//   npm run statusline:status
// Only needed if the Team Room's plan gauges say "waiting for data" (the office already
// reads oh-my-claudecode's HUD cache when that's installed). Every write backs up settings.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const SETTINGS = join(CONFIG_DIR, 'settings.json');
const OFFICE_DIR = join(homedir(), '.claude-office');
const NEXT = join(OFFICE_DIR, 'statusline-next.json');
const TAP = resolve(dirname(fileURLToPath(import.meta.url)), 'statusline-tap.mjs');
const MARKER = 'claude-office/scripts/statusline-tap.mjs';

const load = () => (existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {});
const isOurs = (s) => typeof s?.statusLine?.command === 'string' && s.statusLine.command.includes(MARKER);

function save(settings) {
  if (existsSync(SETTINGS)) {
    const backup = `${SETTINGS}.claude-office-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(SETTINGS, backup);
    console.log(`backup: ${backup}`);
  }
  const tmp = `${SETTINGS}.claude-office-tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  JSON.parse(readFileSync(tmp, 'utf8'));
  renameSync(tmp, SETTINGS);
}

const cmd = process.argv[2] ?? 'status';
const settings = load();

if (cmd === 'install') {
  if (isOurs(settings)) {
    console.log('already installed');
  } else {
    mkdirSync(OFFICE_DIR, { recursive: true });
    // Remember the previous status line so the tap can keep running it, and uninstall can restore it.
    writeFileSync(NEXT, JSON.stringify({ statusLine: settings.statusLine ?? null }, null, 2) + '\n');
    settings.statusLine = { type: 'command', command: `"${process.execPath}" "${TAP}"`, ...(settings.statusLine?.padding !== undefined && { padding: settings.statusLine.padding }) };
    save(settings);
    console.log('installed: your status line keeps working; Claude Office now sees plan usage.');
  }
} else if (cmd === 'uninstall') {
  if (!isOurs(settings)) {
    console.log('not installed');
  } else {
    const prev = existsSync(NEXT) ? JSON.parse(readFileSync(NEXT, 'utf8')).statusLine : null;
    if (prev) settings.statusLine = prev;
    else delete settings.statusLine;
    save(settings);
    rmSync(NEXT, { force: true });
    console.log('removed: previous status line restored');
  }
} else {
  console.log(isOurs(settings) ? '✔ status line tap installed' : '✘ status line tap not installed');
  const snap = join(OFFICE_DIR, 'statusline.json');
  if (existsSync(snap)) {
    const { savedAt } = JSON.parse(readFileSync(snap, 'utf8'));
    console.log(`last snapshot: ${Math.round((Date.now() - savedAt) / 1000)} s ago`);
  }
}
