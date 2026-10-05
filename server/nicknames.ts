// Names the manager gave people (Rename in their chat), shared by every office on this machine:
// one small file per session in ~/.claude-office/names/ (0600), named by its session id. One
// file each means two offices renaming different people never overwrite each other. A
// nickname wins over Claude Code's own name and the office's pick, through restarts,
// call-backs and moves.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME } from './config';

/** Letters, numbers, spaces and . ' - (the hire panel's rule), up to 32. */
export const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,31}$/u;
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Kept for the most recently named sessions only. */
const MAX = 500;

let tmpSeq = 0;

export class Nicknames {
  /** Session id → [name, its file's mtime]: a file is re-read only when it changes. */
  private names = new Map<string, [string, number]>();
  /** Reads and saves take turns, so a slow read never lands on top of a save. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private dir = join(HOME, '.claude-office', 'names')) {}

  private turn<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.queue.then(fn);
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** Every nickname, by session id (re-reading only the files that changed). */
  all(): Promise<ReadonlyMap<string, string>> {
    return this.turn(async () => {
      const files = await readdir(this.dir).catch(() => [] as string[]);
      const next = new Map<string, [string, number]>();
      await Promise.all(
        files.filter((f) => SESSION.test(f)).map(async (id) => {
          const mtime = await stat(join(this.dir, id)).then((s) => s.mtimeMs, () => 0);
          if (!mtime) return;
          const had = this.names.get(id);
          if (had && had[1] === mtime) return void next.set(id, had);
          const name = (await readFile(join(this.dir, id), 'utf8').catch(() => '')).trim();
          if (NAME_OK.test(name)) next.set(id, [name, mtime]);
        }),
      );
      this.names = next;
      return new Map([...next].map(([id, [name]]) => [id, name]));
    });
  }

  /** Set (or with an empty name, clear) a session's nickname. */
  set(sessionId: string, name: string): Promise<void> {
    if (!SESSION.test(sessionId)) return Promise.reject(new Error('Bad session id'));
    return this.turn(async () => {
      const file = join(this.dir, sessionId);
      if (!name) {
        await rm(file, { force: true });
        this.names.delete(sessionId);
        return;
      }
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      const tmp = join(this.dir, `.${sessionId}.${process.pid}.${++tmpSeq}.tmp`);
      await writeFile(tmp, `${name}\n`, { mode: 0o600 });
      await rename(tmp, file);
      this.names.delete(sessionId);
      // Keep the folder small: the oldest names go past MAX.
      const files = (await readdir(this.dir).catch(() => [] as string[])).filter((f) => SESSION.test(f));
      if (files.length > MAX) {
        const aged = await Promise.all(files.map(async (f) => [f, await stat(join(this.dir, f)).then((s) => s.mtimeMs, () => 0)] as const));
        for (const [f] of aged.sort((a, b) => a[1] - b[1]).slice(0, files.length - MAX)) await rm(join(this.dir, f), { force: true });
      }
    });
  }
}
