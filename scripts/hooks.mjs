// Install / remove the Claude Office hooks in ~/.claude/settings.json (or $CLAUDE_CONFIG_DIR).
//   npm run hooks:install     adds PermissionRequest (*) + PreToolUse (AskUserQuestion|ExitPlanMode)
//   npm run hooks:uninstall   removes exactly those entries, nothing else
//   npm run hooks:status
// Every write keeps a timestamped backup next to settings.json and is validated by re-reading.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const SETTINGS = join(CONFIG_DIR, 'settings.json');
const HOOK_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'office-hook.mjs');
const MARKER = 'claude-office/scripts/office-hook.mjs';
const COMMAND = `"${process.execPath}" "${HOOK_SCRIPT}"`;
const ENTRY = { type: 'command', command: COMMAND, timeout: 120, statusMessage: 'Waiting for the manager in Claude Office…' };
const WANT = [
  { event: 'PermissionRequest', matcher: '*' },
  { event: 'PreToolUse', matcher: 'AskUserQuestion|ExitPlanMode' },
];

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARKER);

function load() {
  if (!existsSync(SETTINGS)) return {};
  return JSON.parse(readFileSync(SETTINGS, 'utf8'));
}

function save(settings) {
  if (existsSync(SETTINGS)) {
    const backup = `${SETTINGS}.claude-office-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(SETTINGS, backup);
    console.log(`backup: ${backup}`);
  }
  const tmp = `${SETTINGS}.claude-office-tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  JSON.parse(readFileSync(tmp, 'utf8')); // validate before replacing
  renameSync(tmp, SETTINGS);
}

function installed(settings) {
  return WANT.map(({ event, matcher }) => ({
    event,
    matcher,
    present: (settings.hooks?.[event] ?? []).some((g) => g.matcher === matcher && (g.hooks ?? []).some(isOurs)),
  }));
}

const cmd = process.argv[2] ?? 'status';
const settings = load();

if (cmd === 'install') {
  settings.hooks ??= {};
  let added = 0;
  for (const { event, matcher } of WANT) {
    const groups = (settings.hooks[event] ??= []);
    if (groups.some((g) => g.matcher === matcher && (g.hooks ?? []).some(isOurs))) continue;
    groups.push({ matcher, hooks: [{ ...ENTRY }] });
    added++;
  }
  if (added) save(settings);
  console.log(added ? `installed ${added} hook entr${added === 1 ? 'y' : 'ies'} → ${SETTINGS}` : 'already installed');
  console.log('New and resumed Claude Code sessions pick it up; running sessions may need a restart or /hooks.');
} else if (cmd === 'uninstall') {
  let removed = 0;
  for (const event of Object.keys(settings.hooks ?? {})) {
    const groups = settings.hooks[event];
    for (const g of groups) {
      const before = g.hooks?.length ?? 0;
      g.hooks = (g.hooks ?? []).filter((h) => !isOurs(h));
      removed += before - g.hooks.length;
    }
    settings.hooks[event] = groups.filter((g) => (g.hooks ?? []).length > 0);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (removed) save(settings);
  console.log(removed ? `removed ${removed} Claude Office hook(s)` : 'nothing to remove');
} else {
  for (const s of installed(settings)) console.log(`${s.present ? '✔' : '✘'} ${s.event} [${s.matcher}]`);
  console.log(`hook script: ${HOOK_SCRIPT}`);
}
