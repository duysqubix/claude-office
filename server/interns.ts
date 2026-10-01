// Subagents ("interns"): ~/.claude/projects/<enc>/<sessionId>/subagents/agent-<id>.{jsonl,meta.json}
//
// Subagent transcripts don't record a clean "done", so completion comes from the parent:
// - background agents: a <task-notification> whose <task-id> is the file id, status completed/failed/killed
// - foreground agents: the parent's Agent tool_use (meta.toolUseId) got its tool_result
// Agents that never report back are dropped once their transcript has been still for
// INTERN_STALE_MS. `active` means "wrote something in the last minute" (typing vs idling).
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Intern } from '../shared/protocol';
import { INTERN_STALE_MS } from './config';

const ACTIVE_MS = 60_000;

interface Meta {
  type: string;
  description: string;
  toolUseId?: string;
  background: boolean;
}

export interface CompletionSource {
  finishedTasks: ReadonlySet<string>;
  completedToolUses: ReadonlySet<string>;
}

const metaCache = new Map<string, Meta>();

/** Interns still on the job for this session. `transcriptPath` is the parent's .jsonl. */
export async function activeInterns(transcriptPath: string, sessionId: string, parent: CompletionSource): Promise<Intern[]> {
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
      .filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
      .map(async (f) => {
        const id = f.slice('agent-'.length, -'.jsonl'.length);
        if (parent.finishedTasks.has(id)) return;
        const s = await stat(join(dir, f)).catch(() => null);
        if (!s || now - s.mtimeMs > INTERN_STALE_MS) return;
        const meta = await readMeta(join(dir, `agent-${id}.meta.json`));
        if (!meta.background && meta.toolUseId && parent.completedToolUses.has(meta.toolUseId)) return;
        out.push({ id, type: meta.type, description: meta.description, active: now - s.mtimeMs < ACTIVE_MS });
      }),
  );
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function readMeta(path: string): Promise<Meta> {
  const hit = metaCache.get(path);
  if (hit) return hit;
  let meta: Meta = { type: 'helper', description: '', background: false };
  try {
    const m = JSON.parse(await readFile(path, 'utf8'));
    meta = {
      type: typeof m.agentType === 'string' ? m.agentType : typeof m.name === 'string' ? m.name : 'helper',
      description: typeof m.description === 'string' ? m.description : '',
      toolUseId: typeof m.toolUseId === 'string' ? m.toolUseId : undefined,
      background: m.requestShape === 'background',
    };
    metaCache.set(path, meta);
  } catch {
    // meta.json may land a moment after the transcript; don't cache the miss
  }
  return meta;
}
