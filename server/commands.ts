// What "/" offers someone in the chat (#151): Claude Code's built-in slash commands, then the
// custom commands and skills in their project's .claude/ and your ~/.claude/, then the enabled
// plugins'. Read-only: it reads folder listings and the top of each .md, never runs anything.
// Every path is resolved (symlinks too) and must stay inside the folder it was found in; a skill
// folder may itself be a symlink (skill managers install them that way), to somewhere in your
// home or their project. Cached per folder for CACHE_MS.
import { open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import type { SlashCommand } from '../shared/protocol';
import { CLAUDE_HOME, HOME } from './config';

/** Claude Code's own commands (the common ones), as its "/" menu describes them. Update as it grows. */
export const BUILT_IN_COMMANDS: readonly (readonly [name: string, description: string])[] = [
  ['add-dir', 'Add a new working directory'],
  ['agents', 'Manage agent configurations'],
  ['bug', 'Submit feedback about Claude Code'],
  ['clear', 'Clear conversation history and free up context'],
  ['compact', 'Clear conversation history but keep a summary in context'],
  ['config', 'Open the settings panel'],
  ['context', 'Visualize current context usage'],
  ['cost', 'Show the total cost and duration of the current session'],
  ['doctor', 'Diagnose and verify your Claude Code installation and settings'],
  ['exit', 'Exit the session'],
  ['help', 'Show help and available commands'],
  ['hooks', 'Manage hook configurations for tool events'],
  ['init', 'Initialize a new CLAUDE.md file with codebase documentation'],
  ['login', 'Sign in with your Anthropic account'],
  ['logout', 'Sign out from your Anthropic account'],
  ['mcp', 'Manage MCP servers'],
  ['memory', 'Edit Claude memory files'],
  ['model', 'Set the AI model for Claude Code'],
  ['permissions', 'Manage allow and deny tool permission rules'],
  ['pr-comments', 'Get comments from a GitHub pull request'],
  ['release-notes', 'View release notes'],
  ['rename', 'Rename the current conversation'],
  ['resume', 'Resume a conversation'],
  ['review', 'Review a pull request'],
  ['status', 'Show version, model, account, API connectivity and tool statuses'],
  ['terminal-setup', 'Install the Shift+Enter key binding for newlines'],
  ['vim', 'Toggle between Vim and normal editing modes'],
];

const CACHE_MS = 30_000;
/** Folders remembered at once; the oldest goes first. */
const MAX_CACHED = 64;
/** Most commands or skills read from one folder (and most plugins), and folders deep. */
const MAX_PER_ROOT = 300;
const MAX_PLUGINS = 64;
const MAX_DEPTH = 4;
/** Most folder entries looked at in one commands folder (however few of them are .md). */
const MAX_ENTRIES = 2000;
/** The most of the list sent back. */
const MAX_LIST = 1500;
/** Bytes read from the top of each .md: its frontmatter and first line live there. */
const HEAD_BYTES = 8 * 1024;
/** Settings and plugin manifests bigger than this aren't read. */
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_DESCRIPTION = 200;
/** A name segment Claude Code could take after "/" (and that is safe to show). */
const SEGMENT = /^[A-Za-z0-9][\w.-]{0,63}$/;

const cache = new Map<string, { at: number; list: Promise<SlashCommand[]> }>();

/** Everything "/" offers someone working in `cwd`: built-ins first, then theirs, yours, plugins'. */
export function listCommands(cwd: string): Promise<SlashCommand[]> {
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const list = build(cwd).catch((err: unknown) => {
    console.error('[commands]', err);
    cache.delete(cwd);
    return BUILT_IN_COMMANDS.map(([name, description]): SlashCommand => ({ name, description, source: 'built-in', kind: 'command' }));
  });
  cache.delete(cwd);
  cache.set(cwd, { at: Date.now(), list });
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return list;
}

async function build(cwd: string): Promise<SlashCommand[]> {
  const project = join(cwd, '.claude');
  // A skill folder may be a link to somewhere in your home or their project (never outside both).
  const linkable = (await Promise.all([HOME, cwd].map((p) => realpath(p).catch(() => null)))).filter((p): p is string => !!p);
  const groups = await Promise.all([
    commandsIn(join(project, 'commands'), 'project', linkable),
    commandsIn(join(CLAUDE_HOME, 'commands'), 'user', linkable),
    skillsIn(join(project, 'skills'), 'project', linkable),
    skillsIn(join(CLAUDE_HOME, 'skills'), 'user', linkable),
    pluginCommands(cwd),
  ]);
  const out: SlashCommand[] = BUILT_IN_COMMANDS.map(([name, description]) => ({ name, description, source: 'built-in', kind: 'command' }));
  // One per name: built-ins win, then the project's, then yours, then plugins'.
  const seen = new Set(out.map((c) => c.name));
  for (const c of groups.flat()) {
    if (out.length >= MAX_LIST) break;
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}

const inside = (root: string, p: string) => p === root || p.startsWith(root + sep);

/** `p` resolved (symlinks too), or null if it's missing or resolves outside every root. */
async function within(p: string, roots: string[]): Promise<string | null> {
  const real = await realpath(p).catch(() => null);
  return real && roots.some((r) => inside(r, real)) ? real : null;
}

interface Origin {
  source: SlashCommand['source'];
  plugin?: string;
}

/**
 * commands/**.md: the file name is the command, each subfolder a namespace ("frontend:deploy").
 * Plugin commands start with the plugin's name ("my-plugin:review").
 */
async function commandsIn(dir: string, source: SlashCommand['source'], bounds: string[], plugin?: string): Promise<SlashCommand[]> {
  // The folder itself must be in your home or their project (a plugin's: in the plugin); what's in it, in it.
  const top = await within(dir, bounds);
  if (!top) return [];
  const out: SlashCommand[] = [];
  const origin: Origin = { source, plugin };
  const walked = new Set<string>();
  let budget = MAX_ENTRIES;
  const walk = async (at: string, ns: string[], depth: number): Promise<void> => {
    if (walked.has(at)) return;
    walked.add(at);
    const names = (await readdir(at).catch(() => [] as string[])).sort().slice(0, budget);
    for (const name of names) {
      if (out.length >= MAX_PER_ROOT || --budget < 0) return;
      if (name.startsWith('.')) continue;
      const real = await within(join(at, name), [top]);
      const s = real ? await stat(real).catch(() => null) : null;
      if (!real || !s) continue;
      if (s.isDirectory()) {
        if (depth < MAX_DEPTH && SEGMENT.test(name)) await walk(real, [...ns, name], depth + 1);
      } else if (s.isFile() && name.endsWith('.md')) {
        const stem = name.slice(0, -3);
        if (!SEGMENT.test(stem)) continue;
        const { meta, firstLine } = await readHead(real);
        out.push(entry([...(plugin ? [plugin] : []), ...ns, stem].join(':'), meta.description || firstLine, 'command', origin));
      }
    }
  };
  await walk(top, [], 0);
  return out;
}

/**
 * skills/<name>/SKILL.md, named by its frontmatter (else the folder). Skills that say
 * `user-invocable: false` aren't offered (Claude Code keeps them out of its "/" menu too).
 * `linkable`: where a skill folder that is a symlink may point.
 */
async function skillsIn(dir: string, source: SlashCommand['source'], linkable: string[], plugin?: string): Promise<SlashCommand[]> {
  const top = await realpath(dir).catch(() => null);
  if (!top || !linkable.some((r) => inside(r, top))) return [];
  const names = (await readdir(top).catch(() => [] as string[])).sort().slice(0, MAX_PER_ROOT * 2);
  const out: SlashCommand[] = [];
  for (const name of names) {
    if (out.length >= MAX_PER_ROOT) break;
    if (name.startsWith('.')) continue;
    const skill = await oneSkill(join(top, name), linkable, { source, plugin });
    if (skill) out.push(skill);
  }
  return out;
}

/** One skill folder (its SKILL.md must be inside it), or null. */
async function oneSkill(folder: string, linkable: string[], origin: Origin): Promise<SlashCommand | null> {
  const real = await within(folder, linkable);
  if (!real || !(await stat(real).catch(() => null))?.isDirectory()) return null;
  const file = await within(join(real, 'SKILL.md'), [real]);
  if (!file || !(await stat(file).catch(() => null))?.isFile()) return null;
  const { meta, firstLine } = await readHead(file);
  if (meta['user-invocable'] === 'false') return null;
  const name = SEGMENT.test(meta.name ?? '') ? meta.name! : basename(folder);
  if (!SEGMENT.test(name)) return null;
  return entry(origin.plugin ? `${origin.plugin}:${name}` : name, meta.description || firstLine, 'skill', origin);
}

function entry(name: string, description: string, kind: SlashCommand['kind'], origin: Origin): SlashCommand {
  const one = description.replace(/\s+/g, ' ').trim();
  return {
    name,
    description: one.length > MAX_DESCRIPTION ? `${one.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : one,
    source: origin.source,
    kind,
    ...(origin.plugin ? { plugin: origin.plugin } : {}),
  };
}

/** The top of a .md: its frontmatter's `key: value` lines, and the first line of text after it. */
async function readHead(file: string): Promise<{ meta: Record<string, string>; firstLine: string }> {
  let text = '';
  const fh = await open(file, 'r').catch(() => null);
  if (fh) {
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
      text = buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      await fh.close();
    }
  }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const meta: Record<string, string> = {};
  let body = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) {
      body = end + 1;
      for (let i = 1; i < end; i++) {
        const m = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
        if (!m) continue;
        let v = m[2].trim();
        // A folded or literal block (`description: >` / `|`): its indented lines.
        if (/^[>|][-+]?$/.test(v)) {
          const more: string[] = [];
          while (i + 1 < end && /^\s+\S|^\s*$/.test(lines[i + 1])) more.push(lines[++i].trim());
          v = more.join(' ');
        } else if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
        meta[m[1]] = v;
      }
    }
  }
  const first = lines.slice(body).find((l) => l.trim()) ?? '';
  return { meta, firstLine: first.replace(/^#+\s*/, '').trim() };
}

async function readJson(file: string): Promise<unknown> {
  const s = await stat(file).catch(() => null);
  if (!s?.isFile() || s.size > MAX_JSON_BYTES) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The enabled plugins' commands and skills, as "plugin:name". Installed plugins are listed in
 * ~/.claude/plugins/installed_plugins.json (each at an installPath under ~/.claude/plugins), and
 * enabled in settings (enabledPlugins: yours, then the project's shared and local settings).
 * A plugin's own manifest can name more command or skill folders.
 */
async function pluginCommands(cwd: string): Promise<SlashCommand[]> {
  const root = await realpath(join(CLAUDE_HOME, 'plugins')).catch(() => null);
  if (!root) return [];
  const installed = await readJson(join(root, 'installed_plugins.json'));
  const plugins = isRecord(installed) && isRecord(installed.plugins) ? installed.plugins : {};
  const enabled: Record<string, unknown> = {};
  for (const file of [join(CLAUDE_HOME, 'settings.json'), join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json')]) {
    const s = await readJson(file);
    if (isRecord(s) && isRecord(s.enabledPlugins)) Object.assign(enabled, s.enabledPlugins);
  }
  const out: SlashCommand[] = [];
  for (const [key, installs] of Object.entries(plugins).slice(0, MAX_PLUGINS)) {
    if (enabled[key] !== true || !Array.isArray(installs)) continue;
    // Installed for everyone, or for this project.
    const here = installs.find((i) => isRecord(i) && typeof i.installPath === 'string' && (i.scope === 'user' || i.projectPath === cwd));
    const dir = isRecord(here) ? await within(String(here.installPath), [root]) : null;
    if (!dir) continue;
    const manifest = await readJson(join(dir, '.claude-plugin', 'plugin.json'));
    const named = isRecord(manifest) && typeof manifest.name === 'string' ? manifest.name : key.split('@')[0];
    if (!SEGMENT.test(named)) continue;
    const extra = (field: string) => {
      const v = isRecord(manifest) ? manifest[field] : undefined;
      return (Array.isArray(v) ? v : [v]).filter((p): p is string => typeof p === 'string').slice(0, MAX_PER_ROOT);
    };
    // However many folders its manifest names, one plugin offers at most MAX_PER_ROOT.
    const start = out.length;
    const full = () => out.length - start >= MAX_PER_ROOT || out.length >= MAX_LIST;
    const origin: Origin = { source: 'plugin', plugin: named };
    for (const rel of new Set(['commands', ...extra('commands')])) {
      if (full()) break;
      const p = resolve(dir, rel);
      if (!inside(dir, p)) continue;
      if (p.endsWith('.md')) {
        const file = await within(p, [dir]);
        if (!file || !SEGMENT.test(basename(p, '.md')) || !(await stat(file).catch(() => null))?.isFile()) continue;
        const { meta, firstLine } = await readHead(file);
        out.push(entry(`${named}:${basename(p, '.md')}`, meta.description || firstLine, 'command', origin));
      } else out.push(...(await commandsIn(p, 'plugin', [dir], named)));
    }
    for (const rel of new Set(['skills', ...extra('skills')])) {
      if (full()) break;
      const p = resolve(dir, rel);
      if (!inside(dir, p)) continue;
      // A manifest can name one skill's folder, or a folder of them.
      const one = await oneSkill(p, [dir], origin);
      if (one) out.push(one);
      else out.push(...(await skillsIn(p, 'plugin', [dir], named)));
    }
  }
  return out;
}
