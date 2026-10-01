// Friendly, stable office names for sessions.

const NAMES = [
  'Claudette', 'Claudius', 'Clyde', 'Claudia', 'Klaus', 'Claudine', 'Clod', 'Claudio',
  'Clawdia', 'Claudson', 'Clancy', 'Claudel', 'Clover', 'Clementine', 'Claude Jr.', 'Clint',
];

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Nameable {
  sessionId: string;
  startedAt?: number;
  /** Claude's own name for the session, and whether a human chose it. */
  name?: string;
  nameSource?: string;
}

/**
 * Names for everyone currently in the office. Sessions a human named keep that name.
 * Everyone else gets a name from NAMES picked by hashing the session id, probing forward
 * on collisions; earlier arrivals keep their name when someone new walks in.
 */
export function assignNames(people: Nameable[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const ordered = [...people].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.sessionId.localeCompare(b.sessionId));
  for (const p of ordered) {
    if (p.nameSource === 'user' && p.name) {
      out.set(p.sessionId, p.name);
      taken.add(p.name);
    }
  }
  for (const p of ordered) {
    if (out.has(p.sessionId)) continue;
    const name = pickName(p.sessionId, taken);
    out.set(p.sessionId, name);
    taken.add(name);
  }
  return out;
}

export function pickName(sessionId: string, taken: Set<string>): string {
  const start = hash32(sessionId) % NAMES.length;
  for (let i = 0; i < NAMES.length; i++) {
    const n = NAMES[(start + i) % NAMES.length];
    if (!taken.has(n)) return n;
  }
  for (let k = 2; ; k++) {
    const n = `${NAMES[start]} ${k}`;
    if (!taken.has(n)) return n;
  }
}
