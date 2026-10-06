// `?demo=1`: a pretend office with no server. Exercises every state and activity, walks
// people in and out, churns interns, and fakes every REST call plus a toy terminal.
// `&quiet=1` freezes the cast (no arrivals, departures or state changes) for screenshots.
import type { ActivityKind, ApiResult, Ask, ChatLine, Employee, EmployeeState, Intern, PastSession, ProjectInfo, SlashCommand, TeamStats } from '../../shared/protocol';
import type { Backend, TermLink } from './net';

const HOME = '/Users/you';
const NAMES = ['Claudette', 'Claudius', 'Clyde', 'Claudia', 'Klaus', 'Claudine', 'Clod', 'Claudio', 'Clawdia', 'Claudson', 'Clancy', 'Claudel', 'Clover', 'Clementine', 'Claude Jr.', 'Clint'];
const PROJECTS = ['blendscope', 'claude-office', 'crateswipe', 'homebase', 'smaugfuss', 'dotfiles', 'rubc-prod', 'naudio', 'pancake-api', 'garden-bot'];

const ACTIVITIES: Record<ActivityKind, [tool: string | undefined, label: string][]> = {
  typing: [
    ['Edit', 'Editing spectrum.ts'],
    ['Write', 'Writing README.md'],
    ['Edit', 'Editing roster.ts'],
    ['MultiEdit', 'Editing camera.ts'],
  ],
  reading: [
    ['Read', 'Reading server/index.ts'],
    ['Grep', 'Searching "findPath"'],
    ['Glob', 'Listing src/**/*.ts'],
  ],
  running: [
    ['Bash', '$ npm test'],
    ['Bash', '$ npx tsc --noEmit'],
    ['Bash', '$ git log --oneline -5'],
  ],
  browsing: [
    ['WebFetch', 'Reading threejs.org/docs'],
    ['WebSearch', 'Searching "xterm fit addon"'],
  ],
  thinking: [[undefined, 'Thinking…']],
  delegating: [['Agent', 'Briefing the interns']],
  planning: [['TodoWrite', 'Updating the plan']],
  asking: [['AskUserQuestion', 'Has a question for you']],
  other: [['mcp__fff__grep', 'Using fff grep']],
};
const WORK_KINDS: ActivityKind[] = ['typing', 'reading', 'running', 'browsing', 'thinking', 'planning', 'typing', 'reading'];
const WAITING = ['permission', 'input needed', 'dialog open'];
const LAST_TEXT = [
  'All done! The tests pass and I tidied up the imports while I was there.',
  'I found the bug: the spring was integrating with the wrong timestep. Fixed and verified.',
  "Here's the plan: refactor the roster diffing first, then the desk assignment.",
  'Shipped. Want me to write the changelog entry too?',
  'The build is green. Two small calls are left for you to decide.',
];
const PROMPTS = [
  'give the employees springier arms',
  'why is the door not opening?',
  'add a coffee machine that actually works',
  'fix the flaky test in roster.spec.ts',
  'can you tidy up the README',
];
const TITLES = ['Spring tuning', 'Door sensor bug', 'Coffee machine API', 'Flaky roster test', 'README polish', 'Desk monitor redesign'];
/** What "/" offers in the demo chat: a few of Claude Code's own, and some of each kind of custom one. */
const COMMANDS: SlashCommand[] = [
  ...(
    [
      ['clear', 'Clear conversation history and free up context'],
      ['compact', 'Clear conversation history but keep a summary in context'],
      ['context', 'Visualize current context usage'],
      ['cost', 'Show the total cost and duration of the current session'],
      ['help', 'Show help and available commands'],
      ['init', 'Initialize a new CLAUDE.md file with codebase documentation'],
      ['model', 'Set the AI model for Claude Code'],
      ['release-notes', 'View release notes'],
      ['review', 'Review a pull request'],
    ] as const
  ).map(([name, description]): SlashCommand => ({ name, description, source: 'built-in', kind: 'command' })),
  { name: 'deploy', description: 'Build and ship to the staging box', source: 'project', kind: 'command' },
  { name: 'release', description: 'Tag and publish a release', source: 'project', kind: 'skill' },
  { name: 'test', description: 'Run the tests for what you changed', source: 'project', kind: 'command' },
  { name: 'frontend:storybook', description: 'Open the component gallery for a component', source: 'project', kind: 'command' },
  { name: 'tidy-imports', description: 'Sort and prune imports in the files you changed', source: 'user', kind: 'command' },
  { name: 'changelog', description: 'Draft a changelog entry from the commits since the last tag', source: 'user', kind: 'skill' },
  { name: 'garden:water', description: 'Water every plant in the office', source: 'plugin', plugin: 'garden', kind: 'command' },
  { name: 'garden:repot', description: 'Move a plant to a bigger pot', source: 'plugin', plugin: 'garden', kind: 'skill' },
];
const INTERN_TYPES: [string, string][] = [
  ['Explore', 'Find every caller of findPath'],
  ['oh-my-claudecode:executor', 'Implement the hire panel'],
  ['general-purpose', 'Research xterm.js resize'],
  ['code-reviewer', 'Review the spring helper'],
  ['Explore', 'Map the server modules'],
  ['test-engineer', 'Write tests for the director'],
];

const hashish = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The three kinds of in-game question, shaped like the server's (server/asks.ts). */
function demoAsk(kind: Ask['kind'], now: number): Ask {
  const common = { id: `ask-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, createdAt: now, expiresAt: now + 90_000 };
  if (kind === 'question') {
    return {
      ...common,
      kind,
      tool: 'AskUserQuestion',
      title: 'Which test runner should I set up?',
      detail: 'Which test runner should I set up?\nShould I add a CI job too?',
      questions: [
        {
          question: 'Which test runner should I set up?',
          header: 'Test runner',
          options: [
            { label: 'Vitest', description: 'Fast, Vite-native, Jest-compatible API' },
            { label: 'Node test runner', description: 'Built in, no dependencies' },
            { label: 'Jest', description: 'The classic' },
          ],
        },
        {
          question: 'Should I add a CI job too?',
          header: 'CI',
          multiSelect: true,
          options: [{ label: 'GitHub Actions' }, { label: 'Pre-commit hook' }],
        },
      ],
      options: [
        { id: 'answer', label: 'Send answers', style: 'primary' },
        { id: 'terminal', label: 'Answer in their terminal', style: 'ghost' },
      ],
    };
  }
  if (kind === 'plan') {
    return {
      ...common,
      kind,
      tool: 'ExitPlanMode',
      title: 'Approve this plan?',
      detail:
        '## Plan: make the door sensor reliable\n\n1. Measure distance on the XZ plane only\n2. Keep the door open while anyone is within 2.5 m\n3. Add a 0.4 s close delay so it never snaps shut on someone\n4. Write a test that walks three people through at once',
      options: [
        { id: 'approve', label: 'Approve plan', style: 'primary' },
        { id: 'revise', label: 'Keep planning', hint: 'Add a note with what to change', style: 'secondary' },
        { id: 'terminal', label: 'Answer in their terminal', style: 'ghost' },
      ],
    };
  }
  return {
    ...common,
    kind,
    tool: 'Bash',
    title: 'Run a command?',
    detail: 'npm test -- --run src/roster.spec.ts\n— Run the roster tests once',
    options: [
      { id: 'allow', label: 'Allow', style: 'primary' },
      { id: 'always:0', label: 'Always allow npm test:*', hint: 'For this project (.claude/settings.local.json)', style: 'secondary' },
      { id: 'deny', label: 'Deny', hint: 'Optionally tell them why', style: 'danger' },
      { id: 'terminal', label: 'Answer in their terminal', style: 'ghost' },
    ],
  };
}

/** Small deterministic PRNG so demo runs (and screenshots) repeat. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Seed {
  state: EmployeeState;
  kind?: ActivityKind;
  project: string;
  hosted?: boolean;
  interns?: number;
  waitingFor?: string;
}

const CAST: Seed[] = [
  { state: 'working', kind: 'typing', project: 'blendscope', hosted: true },
  { state: 'needs-you', project: 'homebase', waitingFor: 'permission' },
  { state: 'working', kind: 'delegating', project: 'claude-office', interns: 3 },
  { state: 'sleeping', project: 'smaugfuss' },
  { state: 'working', kind: 'reading', project: 'crateswipe' },
  { state: 'idle', project: 'dotfiles', hosted: true },
  { state: 'working', kind: 'thinking', project: 'rubc-prod' },
  { state: 'working', kind: 'running', project: 'naudio' },
  { state: 'working', kind: 'planning', project: 'pancake-api' },
];

export function createDemoBackend(params: URLSearchParams): Backend {
  const rand = mulberry32(42);
  const pickR = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const quiet = params.has('quiet');
  const start = Date.now();
  let serial = 0;
  let nameIdx = 0;
  let internSerial = 0;
  const employees: Employee[] = [];
  /** Demo renames: everyone's name before their first one, for an empty rename to restore. */
  const usualNames = new Map<string, string>();
  /** Demo renames by session, so a call-back comes back with theirs. */
  const nicknames = new Map<string, string>();
  const chatter = new Map<string, ChatLine[]>();
  let chatSeq = 0;
  const line = (role: ChatLine['role'], text: string, tool?: string): ChatLine => ({ role, text, seq: ++chatSeq, ...(tool ? { tool } : {}) });
  const archive: PastSession[] = [];

  const newId = () => {
    serial++;
    const hex = (n: number, w: number) => n.toString(16).padStart(w, '0');
    return `de${hex(serial * 2654435761 % 0xffffff, 6)}-${hex(serial * 97, 4)}-4${hex(serial * 31, 3)}-a${hex(serial * 7, 3)}-${hex(serial * 1103515245 % 0xffffffffffff, 12)}`;
  };
  /** The next name in the cast, skipping any someone already has (a rename, say). */
  const nextName = (): string => {
    for (;;) {
      const n = NAMES[nameIdx++ % NAMES.length] + (nameIdx > NAMES.length ? ` ${Math.ceil(nameIdx / NAMES.length)}` : '');
      if (!employees.some((x) => x.displayName.toLowerCase() === n.toLowerCase())) return n;
    }
  };
  const activity = (kind: ActivityKind) => {
    const [tool, label] = pickR(ACTIVITIES[kind]);
    return { tool, kind, label };
  };
  const makeIntern = (): Intern => {
    const [type, description] = INTERN_TYPES[internSerial++ % INTERN_TYPES.length];
    return { id: `a${(internSerial * 7919).toString(16)}`, type, description, active: true };
  };
  const screenFor = (e: Employee): string[] | undefined => {
    if (!e.hosted) return undefined;
    const a = e.activity?.label ?? 'Thinking…';
    const lines = [
      `╭${'─'.repeat(46)}╮`,
      `│ ✻ Welcome to Claude Code!${' '.repeat(20)}│`,
      `│   cwd: ~/${e.project}${' '.repeat(Math.max(0, 36 - e.project.length))}│`,
      `╰${'─'.repeat(46)}╯`,
      '',
      `> ${e.lastPrompt ?? 'hello!'}`,
      '',
    ];
    if (e.state === 'working') {
      lines.push(`● ${e.activity?.tool ?? 'Thinking'}(${a.replace(/^\$ /, '')})`, '  ⎿  Running…', '', `✻ ${pickR(['Jiggling', 'Hustling', 'Pondering', 'Noodling'])}… (esc to interrupt)`);
    } else if (e.state === 'needs-you') {
      lines.push('╭─ Permission ─────────────────────────────╮', '│ Allow Bash(rm -rf node_modules)?        │', '│ ❯ 1. Yes   2. No, tell Claude otherwise │', '╰──────────────────────────────────────────╯');
    } else {
      lines.push(`● ${e.lastText ?? 'Done.'}`.slice(0, 78), '', '> ');
    }
    return lines;
  };

  function make(seed: Seed, at: number, sessionId = newId()): Employee {
    const project = seed.project;
    const e: Employee = {
      sessionId,
      pid: 41000 + serial * 37,
      name: `${project}-${sessionId.slice(2, 4)}`,
      displayName: nextName(),
      cwd: project === '~' ? HOME : `${HOME}/${project}`,
      project,
      title: pickR(TITLES),
      branch: pickR(['main', 'spring-tuning', 'fix/door', 'feat/hire-panel']),
      model: pickR(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']),
      kind: 'interactive',
      entrypoint: 'cli',
      hosted: seed.hosted ?? false,
      state: seed.state,
      stateSince: seed.state === 'needs-you' ? at : at - Math.floor(rand() * 600_000),
      waitingFor: seed.waitingFor,
      activity: seed.state === 'working' && seed.kind ? activity(seed.kind) : undefined,
      lastText: pickR(LAST_TEXT),
      lastPrompt: pickR(PROMPTS),
      interns: Array.from({ length: seed.interns ?? 0 }, makeIntern),
      costUSD: Math.round(rand() * 900) / 100,
      startedAt: at - Math.floor(rand() * 5_400_000),
    };
    if (seed.state === 'needs-you' && !seed.waitingFor) e.waitingFor = pickR(WAITING);
    if (seed.state === 'needs-you') e.ask = demoAsk('permission', at);
    // As the server does: free and asleep people say when their last turn ended.
    if (seed.state === 'idle') e.turnEndedAt = e.stateSince;
    if (seed.state === 'sleeping') e.turnEndedAt = e.stateSince - 15 * 60_000;
    e.screen = screenFor(e);
    chatter.set(e.sessionId, [
      line('user', e.lastPrompt ?? 'hello'),
      line('assistant', "On it. I'll start by reading the relevant files."),
      line('tool', 'Reading server/roster.ts', 'Read'),
      line('tool', 'Editing roster.ts', 'Edit'),
      line('assistant', e.lastText ?? 'Done.'),
    ]);
    return e;
  }

  for (const seed of CAST) employees.push(make(seed, start));
  for (let i = 0; i < 14; i++) {
    const project = PROJECTS[i % PROJECTS.length];
    archive.push({
      sessionId: newId(),
      cwd: `${HOME}/${project}`,
      project,
      title: TITLES[i % TITLES.length],
      lastPrompt: PROMPTS[i % PROMPTS.length],
      lastActive: start - (i + 1) * 3_700_000 * (1 + (i % 3)),
      costUSD: Math.round(rand() * 1200) / 100,
      live: false,
    });
  }
  archive.unshift({ ...archive[0], sessionId: employees[0].sessionId, title: employees[0].title, lastActive: start, live: true });

  const backend: Backend = {
    demo: true,
    onRoster: null,
    onHello: null,
    onNotice: null,
    onStats: null,
    onStatus: null,
    onDesks: null,
    start() {
      backend.onStatus?.(true, 0);
      backend.onHello?.(HOME, 'demo');
      emitDesks();
      emit();
      backend.onStats?.(stats());
      if (!quiet) {
        window.setInterval(tick, 1000);
        window.setInterval(() => backend.onStats?.(stats()), 15_000);
      }
    },
    roster: async () => clone(),
    projects: async (): Promise<ProjectInfo[]> =>
      PROJECTS.map((name, i) => ({ cwd: `${HOME}/${name}`, name, lastActive: start - i * 5_000_000, sessionCount: 3 + ((i * 7) % 20) })),
    archive: async () => archive.map((a) => ({ ...a, live: employees.some((e) => e.sessionId === a.sessionId) })),
    chatter: async (id) => [...(chatter.get(id) ?? [])].slice(-12),
    commands: async () => COMMANDS.map((c) => ({ ...c })),
    async hire(cwd, prompt, name): Promise<ApiResult> {
      if (!cwd.trim()) return { ok: false, error: 'Pick a project first.' };
      const project = cwd.replace(/\/+$/, '').split('/').pop() || '~';
      const id = newId();
      window.setTimeout(() => {
        const e = make({ state: 'starting', project, hosted: true }, Date.now(), id);
        e.cwd = cwd;
        e.lastPrompt = prompt || undefined;
        if (name) e.name = name;
        employees.push(e);
        emit();
        window.setTimeout(() => {
          setState(e, prompt ? 'working' : 'idle', prompt ? 'thinking' : undefined);
          emit();
        }, 5000);
      }, 2200);
      return { ok: true, sessionId: id };
    },
    async rehire(sessionId): Promise<ApiResult> {
      const past = archive.find((a) => a.sessionId === sessionId);
      if (!past) return { ok: false, error: 'No such session.' };
      if (employees.some((e) => e.sessionId === sessionId)) return { ok: false, error: 'Already in the office.' };
      window.setTimeout(() => {
        const e = make({ state: 'idle', project: past.project, hosted: true }, Date.now(), sessionId);
        e.title = past.title;
        // A name you gave them comes back with them, as in the office.
        const nick = nicknames.get(sessionId);
        if (nick && !employees.some((x) => x.displayName.toLowerCase() === nick.toLowerCase())) e.displayName = nick;
        employees.push(e);
        emit();
      }, 1800);
      return { ok: true, sessionId };
    },
    async rename(sessionId, name): Promise<ApiResult> {
      const e = employees.find((x) => x.sessionId === sessionId);
      if (!e) return { ok: false, error: 'Not here.' };
      const n = name.trim();
      if (n && employees.some((x) => x !== e && x.displayName.toLowerCase() === n.toLowerCase())) return { ok: false, error: `Someone called ${n} already works here` };
      if (!usualNames.has(e.sessionId)) usualNames.set(e.sessionId, e.displayName);
      const want = n || usualNames.get(e.sessionId) || e.displayName;
      // Like the office: never two the same (a restored name that's taken gets " 2").
      let given = want;
      for (let k = 2; employees.some((x) => x !== e && x.displayName.toLowerCase() === given.toLowerCase()); k++) given = `${want} ${k}`;
      e.displayName = given;
      if (n) nicknames.set(e.sessionId, given);
      else nicknames.delete(e.sessionId);
      emit();
      return { ok: true };
    },
    async fire(sessionId): Promise<ApiResult> {
      const e = employees.find((x) => x.sessionId === sessionId);
      if (!e) return { ok: false, error: 'Not here.' };
      if (!e.hosted) return { ok: false, error: 'Only people hired in the office can be let go.' };
      window.setTimeout(() => remove(e), 700);
      return { ok: true };
    },
    async say(sessionId, text): Promise<ApiResult> {
      const e = employees.find((x) => x.sessionId === sessionId);
      if (!e) return { ok: false, error: 'Not here.' };
      if (!e.hosted) return { ok: false, error: 'Talk to them in their own terminal.' };
      e.lastPrompt = text.slice(0, 200);
      chatter.get(sessionId)?.push(line('user', text));
      setState(e, 'working', 'thinking');
      emit();
      window.setTimeout(() => {
        chatter.get(sessionId)?.push(line('assistant', 'Sure thing, boss! Done.'));
        e.lastText = 'Sure thing, boss! Done.';
        setState(e, 'idle');
        emit();
      }, 6000);
      return { ok: true };
    },
    async answer(req): Promise<ApiResult> {
      const e = employees.find((x) => x.sessionId === req.sessionId);
      if (!e || !e.ask || e.ask.id !== req.askId) return { ok: false, error: 'That question was already answered or withdrawn' };
      const said =
        req.choice === 'deny'
          ? `Denied${req.message ? `: ${req.message}` : ''}`
          : req.choice === 'answer'
            ? Object.entries(req.answers ?? {})
                .map(([q, a]) => `${q} → ${a}`)
                .join('; ')
            : req.choice;
      chatter.get(e.sessionId)?.push(line('user', `(answered in the office) ${said}`));
      if (req.choice === 'terminal') {
        e.ask = undefined;
      } else {
        setState(e, 'working', req.choice === 'revise' ? 'planning' : undefined);
      }
      window.setTimeout(emit, 250);
      return { ok: true };
    },
    terminal: (id, _cols, _rows, kind) => {
      if (kind === 'desk') return fakeShell(undefined, deskShell(Number(id)));
      const e = employees.find((x) => x.sessionId === id);
      return kind === 'shell' ? fakeShell(e) : fakeTerminal(e);
    },
    async closeDesk(desk): Promise<ApiResult> {
      const shell = desks.get(desk);
      if (!shell) return { ok: true };
      desks.delete(desk);
      emitDesks();
      // Its terminals end, the way the office's do when a desk's shell is shut down.
      for (const link of [...shell.links]) {
        link.close();
        link.onClose?.(1000, 'detached');
      }
      return { ok: true };
    },
  };

  /** Hot desks' pretend shells: started the first time you sit at a desk, there until exit or Shut down. */
  const desks = new Map<number, DeskShell>();

  function emitDesks(): void {
    backend.onDesks?.([...desks.keys()].sort((a, b) => a - b));
  }

  /** The pretend shell at `desk` (the one from last time, if it's still open). */
  function deskShell(desk: number): DeskShell {
    const open = desks.get(desk);
    if (open) return open;
    const shell: DeskShell = {
      screen: '',
      links: new Set(),
      exited() {
        if (desks.get(desk) !== shell) return;
        desks.delete(desk);
        emitDesks();
      },
    };
    desks.set(desk, shell);
    emitDesks();
    return shell;
  }

  function clone(): Employee[] {
    return employees.map((e) => ({ ...e, interns: e.interns.map((i) => ({ ...i })), screen: e.screen ? [...e.screen] : undefined }));
  }

  function emit(): void {
    backend.onRoster?.(clone(), Date.now());
  }

  /** Plausible Team Room numbers that drift a little each push. */
  function stats(): TeamStats {
    const now = Date.now();
    const mins = (now - start) / 60_000;
    const count = (st: EmployeeState) => employees.filter((e) => e.state === st).length;
    return {
      plan: {
        limits: [
          { id: 'five_hour', label: '5-hour', usedPct: Math.min(99, 38 + mins * 1.5), resetsAt: start + 2 * 3600_000 + 13 * 60_000 },
          { id: 'seven_day', label: 'Weekly', usedPct: Math.min(99, 61 + mins * 0.2), resetsAt: start + 3 * 86400_000 + 5 * 3600_000 },
        ],
        updatedAt: now - 40_000,
      },
      team: {
        staff: employees.length,
        working: count('working'),
        needsYou: count('needs-you'),
        idle: count('idle') + count('sleeping') + count('starting'),
        interns: employees.reduce((n, e) => n + e.interns.filter((i) => i.active).length, 0),
        costUSD: employees.reduce((n, e) => n + (e.costUSD ?? 0), 0),
        linesAdded: 1834 + Math.round(mins * 40),
        linesRemoved: 612 + Math.round(mins * 12),
        commitsToday: 7 + Math.floor(mins / 3),
        sessionsToday: 14 + Math.floor(mins / 2),
      },
      context: employees.map((e, i) => {
        const pct = ((hashish(e.sessionId) + i * 17) % 90) + 5;
        return { sessionId: e.sessionId, displayName: e.displayName, tokens: Math.round(2000 * pct), windowSize: 200_000, pct };
      }),
    };
  }

  function setState(e: Employee, state: EmployeeState, kind?: ActivityKind): void {
    if (e.state !== state) e.stateSince = Date.now();
    // A turn ends on every move to free, even from free (a quick turn between two polls).
    if (state === 'idle') e.turnEndedAt = Date.now();
    else if (state !== 'sleeping') e.turnEndedAt = undefined;
    e.state = state;
    e.activity = state === 'working' ? activity(kind ?? pickR(WORK_KINDS)) : undefined;
    e.waitingFor = state === 'needs-you' ? pickR(WAITING) : undefined;
    e.ask = undefined;
    if (state === 'needs-you') {
      const kind = pickR(['permission', 'permission', 'question', 'plan'] as const);
      e.waitingFor = kind === 'permission' ? 'permission' : kind === 'question' ? 'question' : 'plan approval';
      e.ask = demoAsk(kind, Date.now());
    }
    if (state === 'working' && e.activity?.kind !== 'delegating') e.interns = e.interns.slice(0, 1);
    if (state !== 'working') e.interns = [];
    e.screen = screenFor(e);
  }

  function remove(e: Employee): void {
    const i = employees.indexOf(e);
    if (i < 0) return;
    employees.splice(i, 1);
    archive.unshift({ sessionId: e.sessionId, cwd: e.cwd, project: e.project, title: e.title, lastPrompt: e.lastPrompt, lastActive: Date.now(), costUSD: e.costUSD, live: false });
    emit();
  }

  // Dev builds with ?debug=1: checks can move the cast along, quiet or not
  // (window.officeDemo.finish('Klaus') ends their turn: the ready-for-you cue, #162).
  if (import.meta.env.DEV && params.has('debug')) {
    const find = (who: string) => employees.find((e) => e.sessionId === who || e.displayName.toLowerCase() === who.toLowerCase());
    Object.assign(window, {
      officeDemo: {
        // Already free: a quick turn that started and ended between two polls (stateSince stays put).
        finish(who: string, said = pickR(LAST_TEXT)): boolean {
          const e = find(who);
          if (!e) return false;
          e.lastText = said;
          chatter.get(e.sessionId)?.push(line('assistant', said));
          setState(e, 'idle');
          emit();
          return true;
        },
        work(who: string): boolean {
          const e = find(who);
          if (!e) return false;
          setState(e, 'working', 'typing');
          emit();
          return true;
        },
      },
    });
  }

  let ticks = 0;
  function tick(): void {
    ticks++;
    const t = ticks;
    let changed = false;
    // Someone new walks in every ~25 s (first one soon, so there's always action).
    if ((t === 9 || (t > 9 && t % 25 === 9)) && employees.length < 13) {
      const e = make({ state: 'starting', project: pickR(PROJECTS), hosted: rand() < 0.4 }, Date.now());
      employees.push(e);
      window.setTimeout(() => {
        setState(e, 'working');
        emit();
      }, 4000 + rand() * 3000);
      changed = true;
    }
    // Someone goes home every ~40 s.
    if (t % 40 === 30 && employees.length > 6) {
      const candidates = employees.filter((e) => e.state === 'idle' || e.state === 'working');
      if (candidates.length) {
        remove(pickR(candidates));
        return;
      }
    }
    // Shuffle what people are doing.
    if (t % 6 === 0) {
      const workers = employees.filter((e) => e.state === 'working' && e.activity?.kind !== 'delegating');
      if (workers.length) {
        const e = pickR(workers);
        e.activity = activity(pickR(WORK_KINDS));
        e.screen = screenFor(e);
        changed = true;
      }
    }
    if (t % 11 === 0) {
      // Someone finishes (or gets stuck); someone idle picks up work again.
      const workers = employees.filter((x) => x.state === 'working' && x.activity?.kind !== 'delegating');
      const e = workers.length ? pickR(workers) : undefined;
      if (e) setState(e, rand() < 0.3 ? 'needs-you' : 'idle');
      const idle = employees.filter((x) => (x.state === 'idle' || x.state === 'starting') && x !== e);
      if (idle.length) setState(pickR(idle), 'working');
      changed = true;
    }
    // Needs-you gets answered after a while, but there's always someone with a hand up.
    const now = Date.now();
    for (const x of employees) {
      if (x.state === 'needs-you' && now - x.stateSince > 28_000) {
        setState(x, 'working');
        changed = true;
      }
    }
    if (!employees.some((x) => x.state === 'needs-you')) {
      const workers = employees.filter((x) => x.state === 'working' && x.activity?.kind !== 'delegating');
      if (workers.length) {
        setState(pickR(workers), 'needs-you');
        changed = true;
      }
    }
    // Interns come and go.
    if (t % 13 === 0) {
      const boss = employees.find((e) => e.activity?.kind === 'delegating');
      if (boss) {
        if (boss.interns.length > 1 && rand() < 0.6) boss.interns.shift();
        if (boss.interns.length < 5) boss.interns.push(makeIntern());
        boss.activity = { tool: 'Agent', kind: 'delegating', label: `Briefing ${boss.interns.length} interns` };
        changed = true;
      }
    }
    if (changed) emit();
  }

  return backend;
}

/** A hot desk's pretend shell: everything it has shown (sitting down again shows it), and its open terminals. */
interface DeskShell {
  screen: string;
  links: Set<TermLink>;
  /** Someone typed exit. */
  exited(): void;
}

/** Most of a hot desk's screen it keeps (whole lines, the newest). */
const DESK_SCREEN = 8000;

/** A toy shell for the Shell tab (a prompt in their folder) or a hot desk (in your home folder): a few commands answer. */
function fakeShell(e: Employee | undefined, desk?: DeskShell): TermLink {
  const green = '\x1b[32m';
  const blue = '\x1b[34m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const dir = desk ? '~' : `~/${e?.project ?? 'somewhere'}`;
  const prompt = () => `${green}you@office${reset} ${blue}${dir}${reset} % `;
  const answers: Record<string, string> = desk
    ? {
        pwd: HOME,
        ls: `${blue}Desktop${reset}  ${blue}Documents${reset}  ${blue}Downloads${reset}  ${blue}projects${reset}`,
        'git status': 'fatal: not a git repository (or any of the parent directories): .git',
        whoami: 'you',
      }
    : {
        pwd: `${HOME}/${e?.project ?? 'somewhere'}`,
        ls: `README.md  package.json  ${blue}src${reset}  ${blue}tests${reset}`,
        'git status': `On branch ${e?.branch ?? 'main'}\r\nnothing to commit, working tree clean`,
        whoami: 'you',
      };
  let line = '';
  let closed = false;
  const link: TermLink = {
    onOpen: null,
    onData: null,
    onClose: null,
    send(msg) {
      if (closed || msg.t !== 'in') return;
      for (const ch of msg.d) {
        if (ch === '\r') {
          const cmd = line.trim();
          line = '';
          out('\r\n');
          if (cmd === 'exit') {
            closed = true;
            desk?.exited();
            window.setTimeout(() => link.onClose?.(1000, 'detached'), 120);
            return;
          }
          if (cmd) out(`${answers[cmd] ?? `${dim}(demo shell) ${cmd.split(' ')[0]}: pretend it worked${reset}`}\r\n`);
          out(prompt());
        } else if (ch === '\x7f') {
          if (line) {
            line = line.slice(0, -1);
            out('\b \b');
          }
        } else if (ch === '\x03') {
          line = '';
          out(`^C\r\n${prompt()}`);
        } else if (ch >= ' ') {
          line += ch;
          out(ch);
        }
      }
    },
    close() {
      closed = true;
      desk?.links.delete(link);
    },
  };
  const out = (s: string) => {
    if (desk) {
      const all = desk.screen + s;
      desk.screen = all.length > DESK_SCREEN ? all.slice(all.indexOf('\n', all.length - DESK_SCREEN) + 1) : all;
    }
    link.onData?.(s);
  };
  desk?.links.add(link);
  window.setTimeout(() => {
    link.onOpen?.();
    // Back at a hot desk: its screen as you left it.
    if (desk?.screen) link.onData?.(desk.screen);
    else if (desk) out(`${dim}※ Demo office: a pretend shell at this desk, in ~. Try ls or pwd; exit closes it.${reset}\r\n\r\n${prompt()}`);
    else out(`${dim}※ Demo office: a pretend shell in ${dir}. Try ls, pwd or git status.${reset}\r\n\r\n${prompt()}`);
  }, 250);
  return link;
}

/** A toy terminal: Claude Code's welcome box, echo, and a cheerful fake reply. */
function fakeTerminal(e: Employee | undefined): TermLink {
  const orange = '\x1b[38;2;217;119;87m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  let line = '';
  let closed = false;
  const link: TermLink = {
    onOpen: null,
    onData: null,
    onClose: null,
    send(msg) {
      if (closed || msg.t !== 'in') return;
      for (const ch of msg.d) {
        if (ch === '\r') {
          const said = line.trim();
          line = '';
          out('\r\n');
          if (said) {
            out(`${orange}●${reset} ${pick(['On it, boss!', 'Great idea. Doing it now.', "Sure! (This is the demo office, so I'm only pretending.)"])}\r\n\r\n`);
          }
          out('> ');
        } else if (ch === '\x7f') {
          if (line) {
            line = line.slice(0, -1);
            out('\b \b');
          }
        } else if (ch === '\x03') {
          line = '';
          out('^C\r\n> ');
        } else if (ch >= ' ') {
          line += ch;
          out(ch);
        }
      }
    },
    close() {
      closed = true;
    },
  };
  const out = (s: string) => link.onData?.(s);
  const pick = (l: string[]) => l[Math.floor(Math.random() * l.length)];
  window.setTimeout(() => {
    link.onOpen?.();
    const w = 52;
    const row = (s: string) => `${orange}│${reset} ${s}${' '.repeat(Math.max(0, w - 1 - [...s.replace(/\x1b\[[0-9;]*m/g, '')].length))}${orange}│${reset}\r\n`;
    out(`${orange}╭${'─'.repeat(w)}╮${reset}\r\n`);
    out(row(`${orange}✻${reset} Welcome to Claude Code!`));
    out(row(''));
    out(row(`${dim}/help for help, /status for your current setup${reset}`));
    out(row(''));
    out(row(`${dim}cwd: ~/${e?.project ?? 'somewhere'}${reset}`));
    out(`${orange}╰${'─'.repeat(w)}╯${reset}\r\n\r\n`);
    out(` ${dim}※ Demo office: this terminal is pretend. Type away anyway.${reset}\r\n\r\n`);
    if (e?.lastPrompt) out(`> ${e.lastPrompt}\r\n\r\n${orange}●${reset} ${e.lastText ?? 'Done.'}\r\n\r\n`);
    out('> ');
  }, 350);
  return link;
}
