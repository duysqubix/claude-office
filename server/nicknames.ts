// Names the manager gave people (Rename in their chat): by session id, in ~/.claude-office
// (0600), shared by every office on this machine. A nickname wins over Claude Code's own name
// and the office's pick, and stays through restarts, call-backs and moves.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { HOME } from './config';

/** Letters, numbers, spaces and . ' - (the hire panel's rule), up to 32. */
export const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,31}$/u;
/** Kept for the most recently named sessions only. */
const MAX = 500;

interface Entry {
  name: string;
  at: number;
}

export class Nicknames {
  private names = new Map<string, Entry>();
  private loaded: Promise<void> | null = null;

  constructor(private file = join(HOME, '.claude-office', 'names.json')) {}

  private load(): Promise<void> {
    this.loaded ??= readFile(this.file, 'utf8').then(
      (text) => {
        let data: Record<string, Entry> = {};
        try {
          data = JSON.parse(text) as Record<string, Entry>;
        } catch {
          // A damaged file: start afresh (the next rename rewrites it).
        }
        for (const [id, e] of Object.entries(data)) if (typeof e?.name === 'string' && NAME_OK.test(e.name)) this.names.set(id, { name: e.name, at: Number(e.at) || 0 });
      },
      () => undefined,
    );
    return this.loaded;
  }

  /** Every nickname, by session id. */
  async all(): Promise<ReadonlyMap<string, string>> {
    await this.load();
    return new Map([...this.names].map(([id, e]) => [id, e.name]));
  }

  /** Set (or with an empty name, clear) a session's nickname. */
  async set(sessionId: string, name: string): Promise<void> {
    await this.load();
    if (name) this.names.set(sessionId, { name, at: Date.now() });
    else this.names.delete(sessionId);
    if (this.names.size > MAX) {
      const oldest = [...this.names].sort((a, b) => a[1].at - b[1].at).slice(0, this.names.size - MAX);
      for (const [id] of oldest) this.names.delete(id);
    }
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(this.names), null, 1), { mode: 0o600 });
    await rename(tmp, this.file);
  }
}
