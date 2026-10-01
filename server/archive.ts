// Past sessions ("Personnel Files") and known project folders (the hiring picker).
import { open, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { ChatLine, PastSession, ProjectInfo } from '../shared/protocol';
import { HOME, PROJECTS_DIR } from './config';
import { clip, encodeCwd, humanize } from './transcript';

const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;
const ARCHIVE_LIMIT = 60;

interface FileInfo {
  sessionId: string;
  path: string;
  mtimeMs: number;
}

interface Digest {
  cwd?: string;
  title?: string;
  lastPrompt?: string;
  costUSD?: number;
  chatter: ChatLine[];
}

const digestCache = new Map<string, { mtimeMs: number; digest: Digest }>();

async function allTranscripts(): Promise<FileInfo[]> {
  let dirs: string[] = [];
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const out: FileInfo[] = [];
  await Promise.all(
    dirs.map(async (d) => {
      const dir = join(PROJECTS_DIR, d);
      let files: string[] = [];
      try {
        files = await readdir(dir);
      } catch {
        return;
      }
      await Promise.all(
        files
          .filter((f) => /^[0-9a-f-]{36}\.jsonl$/i.test(f))
          .map(async (f) => {
            const s = await stat(join(dir, f)).catch(() => null);
            if (s?.isFile() && s.size > 0) out.push({ sessionId: f.slice(0, 36), path: join(dir, f), mtimeMs: s.mtimeMs });
          }),
      );
    }),
  );
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Title, launch folder, last prompt, cost and recent chatter. The launch folder comes from the
 * head of the transcript (entries later in the file carry wherever the session `cd`'d to), and
 * must encode to the project dir name, because that's where `claude --resume` looks.
 */
export async function digest(path: string, mtimeMs: number): Promise<Digest> {
  const hit = digestCache.get(path);
  if (hit && hit.mtimeMs === mtimeMs) return hit.digest;
  const d: Digest = { chatter: [] };
  const projectDir = basename(dirname(path));
  const seenCwds: string[] = [];
  let firstPrompt: string | undefined;
  try {
    const fh = await open(path, 'r');
    try {
      const size = (await fh.stat()).size;
      const headBuf = Buffer.alloc(Math.min(size, HEAD_BYTES));
      await fh.read(headBuf, 0, headBuf.length, 0);
      for (const line of headBuf.toString('utf8').split('\n').slice(0, -1)) {
        try {
          const e = JSON.parse(line);
          if (typeof e.cwd === 'string') seenCwds.push(e.cwd);
        } catch {
          // partial line at the 64 KB boundary
        }
        if (seenCwds.length >= 8) break;
      }

      const start = Math.max(0, size - TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      await fh.read(buf, 0, buf.length, start);
      const lines = buf.toString('utf8').split('\n');
      if (start > 0) lines.shift();
      for (const line of lines) {
        if (!line) continue;
        let e: Record<string, any>;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof e.cwd === 'string' && seenCwds.length < 64) seenCwds.push(e.cwd);
        if (e.type === 'ai-title' && typeof e.aiTitle === 'string') d.title = e.aiTitle;
        else if (e.type === 'last-prompt' && typeof e.lastPrompt === 'string') d.lastPrompt = humanize(e.lastPrompt) ?? d.lastPrompt;
        else if (e.type === 'cost-state' && typeof e.totalCostUSD === 'number') d.costUSD = e.totalCostUSD;
        else if ((e.type === 'user' || e.type === 'assistant') && !e.isSidechain && !e.isMeta) {
          const c = e.message?.content;
          const texts: string[] =
            typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter((b: any) => b?.type === 'text' && typeof b.text === 'string').map((b: any) => b.text) : [];
          for (const raw of texts) {
            const text = e.type === 'user' ? humanize(raw) : raw.trim();
            if (!text) continue;
            if (e.type === 'user') firstPrompt ??= text;
            d.chatter.push({ role: e.type, text: clip(text, 400), ts: e.timestamp });
          }
        }
      }
    } finally {
      await fh.close();
    }
  } catch {
    // unreadable: return what we have
  }
  d.cwd = seenCwds.find((c) => encodeCwd(c) === projectDir) ?? seenCwds[0];
  d.chatter = d.chatter.slice(-30);
  if (!d.title && firstPrompt) d.title = clip(firstPrompt, 60);
  if (d.lastPrompt) d.lastPrompt = clip(d.lastPrompt, 200);
  digestCache.set(path, { mtimeMs, digest: d });
  return d;
}

export async function listPastSessions(liveIds: Set<string>): Promise<PastSession[]> {
  const files = (await allTranscripts()).slice(0, ARCHIVE_LIMIT);
  return Promise.all(
    files.map(async (f) => {
      const d = await digest(f.path, f.mtimeMs);
      const cwd = d.cwd ?? '';
      return {
        sessionId: f.sessionId,
        cwd,
        project: projectName(cwd),
        title: d.title,
        lastPrompt: d.lastPrompt,
        lastActive: Math.round(f.mtimeMs),
        costUSD: d.costUSD,
        live: liveIds.has(f.sessionId),
      };
    }),
  );
}

/** Where a past session lived and what it said last, for resume and the chatter endpoint. */
export async function findPastSession(sessionId: string): Promise<{ path: string; digest: Digest } | null> {
  const f = (await allTranscripts()).find((t) => t.sessionId === sessionId);
  return f ? { path: f.path, digest: await digest(f.path, f.mtimeMs) } : null;
}

/** Folders Claude Code has worked in, plus git repos one level under ~ and ~/.repos etc. */
export async function listProjects(liveCwds: string[]): Promise<ProjectInfo[]> {
  const byCwd = new Map<string, ProjectInfo>();
  const touch = (cwd: string, lastActive: number, sessions = 0) => {
    const cur = byCwd.get(cwd);
    if (cur) {
      cur.lastActive = Math.max(cur.lastActive, lastActive);
      cur.sessionCount += sessions;
    } else {
      byCwd.set(cwd, { cwd, name: projectName(cwd), lastActive, sessionCount: sessions });
    }
  };

  for (const f of (await allTranscripts()).slice(0, 200)) {
    const d = await digest(f.path, f.mtimeMs);
    if (d.cwd) touch(d.cwd, Math.round(f.mtimeMs), 1);
  }
  const now = Date.now();
  for (const cwd of liveCwds) touch(cwd, now);

  const roots = [HOME, join(HOME, '.repos'), join(HOME, 'code'), join(HOME, 'Code'), join(HOME, 'projects'), join(HOME, 'Projects'), join(HOME, 'src'), join(HOME, 'dev'), join(HOME, 'Developer')];
  await Promise.all(
    roots.map(async (root) => {
      let names: string[] = [];
      try {
        names = await readdir(root);
      } catch {
        return;
      }
      await Promise.all(
        names
          .filter((n) => !n.startsWith('.') || root !== HOME)
          .map(async (n) => {
            const git = await stat(join(root, n, '.git')).catch(() => null);
            if (git) touch(join(root, n), Math.round(git.mtimeMs));
          }),
      );
    }),
  );

  return [...byCwd.values()].sort((a, b) => b.lastActive - a.lastActive).slice(0, 60);
}

export function projectName(cwd: string): string {
  if (!cwd) return '?';
  if (cwd === HOME) return '~';
  return basename(cwd) || cwd;
}
