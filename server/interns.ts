// Subagents ("interns"): ~/.claude/projects/<enc>/<sessionId>/subagents/agent-<id>.{jsonl,meta.json}
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Intern } from '../shared/protocol';
import { INTERN_ACTIVE_MS } from './config';

const metaCache = new Map<string, { type: string; description: string }>();

/** Interns whose transcript moved in the last INTERN_ACTIVE_MS. `transcriptPath` is the parent's .jsonl. */
export async function activeInterns(transcriptPath: string, sessionId: string): Promise<Intern[]> {
  const dir = join(dirname(transcriptPath), sessionId, 'subagents');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const now = Date.now();
  const out: Intern[] = [];
  await Promise.all(
    files
      .filter((f) => f.endsWith('.jsonl'))
      .map(async (f) => {
        const full = join(dir, f);
        const s = await stat(full).catch(() => null);
        if (!s || now - s.mtimeMs > INTERN_ACTIVE_MS) return;
        const id = f.slice(0, -'.jsonl'.length);
        const meta = await readMeta(join(dir, `${id}.meta.json`));
        out.push({ id, type: meta.type, description: meta.description, active: true });
      }),
  );
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function readMeta(path: string): Promise<{ type: string; description: string }> {
  const hit = metaCache.get(path);
  if (hit) return hit;
  let meta = { type: 'helper', description: '' };
  try {
    const m = JSON.parse(await readFile(path, 'utf8'));
    meta = {
      type: typeof m.agentType === 'string' ? m.agentType : typeof m.name === 'string' ? m.name : 'helper',
      description: typeof m.description === 'string' ? m.description : '',
    };
    metaCache.set(path, meta);
  } catch {
    // meta.json may land a moment after the transcript; don't cache the miss
  }
  return meta;
}
