// Living style guide (dev only): every co- component and state from docs/UX.md, for eyeballing and
// screenshots. Time is frozen so countdowns hold still.
//   /ui-kit.html             everything
//   /ui-kit.html?only=ask    one section (tokens, buttons, hud, labels, faces, edges, panels, ask, team, chat)
//   /ui-kit.html?calm=1      reduced motion ("Calmer motion")
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import * as THREE from 'three';
import type { ApiResult, Ask, AskOption, ChatLine, Employee, EmployeeState, TeamStats } from '../../shared/protocol';
import { employeeLooks, type HairStyle } from './chars/looks';
import { renderAsk, type AskAnswer } from './ui/askpanel';
import {
  bangMarker,
  banner,
  button,
  coachCard,
  hudButton,
  internChip,
  keyCap,
  namePill,
  needsChip,
  panelShell,
  personRow,
  promptPill,
  speech,
  stateChip,
  toastEl,
  ToastStack,
  worldTag,
  zzz,
} from './ui/components';
import { Bus } from './ui/bus';
import { openChat, type ChatApi } from './ui/chatpanel';
import { createEdgeIndicators, placeEdge } from './ui/edge';
import { el, markup, type Child, type Markup } from './ui/el';
import { faceSvg, internFace, logoSvg, managerFace, setTabAlert } from './ui/faces';
import { icon, stateBadge, STATE_WORD, type IconName } from './ui/icons';
import { enhanceMarkdown, renderMarkdown } from './ui/markdown';
import { planMeter, renderTeamStats } from './ui/teamstats';
import './ui/theme.css';

const params = new URLSearchParams(location.search);
const only = params.get('only');
if (params.get('calm')) document.documentElement.classList.add('co-calm');
const root = document.getElementById('kit')!;
const T0 = Date.UTC(2026, 9, 1, 13, 42);
const frozen = () => T0;

function section(id: string, title: string, lede: string, ...content: Child[]): void {
  if (only && only !== id) return;
  root.append(el('section', { class: 'kit-sec', attrs: { id } }, el('h2', null, title), el('p', null, lede), ...content));
}
const cell = (cap: string, ...children: Child[]) => el('div', { class: 'kit-cell' }, ...children, el('span', { class: 'kit-cap' }, cap));
const row = (...children: Child[]) => el('div', { class: 'kit-row' }, ...children);
const html = (m: Markup, cls?: string) => el('span', { class: cls, html: m });

// ------------------------------------------------------------------ people

/** First session id per hair style (with and without glasses), so the faces cover every look. */
function coverIds(): { id: string; style: HairStyle; glasses: boolean }[] {
  const styles: HairStyle[] = ['tuft', 'bob', 'cap', 'beanie', 'bun', 'headphones', 'bald'];
  const found = new Map<string, string>();
  for (let i = 0; i < 5000 && found.size < styles.length * 2; i++) {
    const id = `kit-${i}`;
    const l = employeeLooks(id, i % 2 === 0);
    const key = `${l.hairStyle}:${l.glasses}`;
    if (!found.has(key)) found.set(key, id);
  }
  const out: { id: string; style: HairStyle; glasses: boolean }[] = [];
  for (const style of styles) {
    for (const glasses of [false, true]) {
      const id = found.get(`${style}:${glasses}`);
      if (id) out.push({ id, style, glasses });
    }
  }
  return out;
}
const COVER = coverIds();
const byStyle = (s: HairStyle, glasses = false) => (COVER.find((c) => c.style === s && c.glasses === glasses) ?? COVER[0]).id;

interface Person {
  id: string;
  name: string;
}
const P = {
  claudette: { id: byStyle('bob'), name: 'Claudette' },
  clyde: { id: byStyle('cap'), name: 'Clyde' },
  klaus: { id: byStyle('beanie'), name: 'Klaus' },
  claudia: { id: byStyle('bun'), name: 'Claudia' },
  claudine: { id: byStyle('headphones'), name: 'Claudine' },
  clod: { id: byStyle('tuft'), name: 'Clod' },
  claudio: { id: byStyle('bald', true), name: 'Claudio' },
} satisfies Record<string, Person>;
const face = (p: Person, size = 40) => faceSvg(employeeLooks(p.id, true), { size });

// ------------------------------------------------------------------ asks

const opt = (id: string, label: string, style: AskOption['style'], hint?: string): AskOption => ({ id, label, style, hint });
const TERMINAL = opt('terminal', 'Answer in their terminal', 'ghost');

function ask(partial: Partial<Ask> & Pick<Ask, 'kind' | 'tool' | 'title' | 'detail' | 'options'>, leftMs = 72_000): Ask {
  return { id: `ask-${Math.random().toString(36).slice(2, 8)}`, createdAt: T0 - (90_000 - leftMs), expiresAt: T0 + leftMs, ...partial };
}

const ASK_BASH = ask({
  kind: 'permission',
  tool: 'Bash',
  title: 'Run a command?',
  detail: 'npm test -- --run server/roster.test.ts\n— Run the roster tests',
  options: [
    opt('allow', 'Allow', 'primary'),
    opt('always:0', 'Always allow Bash(npm test:*)', 'secondary', 'in this project'),
    opt('deny', 'Deny', 'danger', 'Optionally tell them why'),
    TERMINAL,
  ],
});
const ASK_EDIT = ask({
  kind: 'permission',
  tool: 'Edit',
  title: 'Edit roster.ts?',
  detail: '/Users/duan.uys/claude-office/server/roster.ts',
  options: [
    opt('allow', 'Allow', 'primary'),
    opt('always:0', 'Allow all edits from now on', 'secondary', 'for this session'),
    opt('deny', 'Deny', 'danger', 'Optionally tell them why'),
    TERMINAL,
  ],
});
const ASK_MCP = ask(
  {
    kind: 'permission',
    tool: 'mcp__claude-in-chrome__navigate',
    title: 'Open github.com?',
    detail: 'https://github.com/anthropics/claude-code/issues?q=is%3Aopen+label%3Abug+sort%3Aupdated-desc',
    options: [opt('allow', 'Allow', 'primary'), opt('deny', 'Deny', 'danger', 'Optionally tell them why'), TERMINAL],
  },
  8_000,
);
const ASK_PLAN = ask({
  kind: 'plan',
  tool: 'ExitPlanMode',
  title: 'Approve this plan?',
  detail: [
    '## Fix the flaky roster test',
    '1. Sort sessions by `sessionId` before diffing, so two arrivals in the same tick compare equal.',
    '2. Freeze `Date.now()` in the test with `vi.useFakeTimers()`.',
    '3. Add a regression test for **two sessions starting in the same second**.',
    '',
    'Files: `server/roster.ts`, `server/roster.test.ts`. No changes to the protocol.',
    '',
    '```ts',
    'employees.sort((a, b) => a.sessionId.localeCompare(b.sessionId));',
    '```',
  ].join('\n'),
  options: [opt('approve', 'Approve plan', 'primary'), opt('revise', 'Keep planning', 'secondary', 'Add a note with what to change'), TERMINAL],
});
const ASK_QUESTION = ask({
  kind: 'question',
  tool: 'AskUserQuestion',
  title: '2 questions for you',
  detail: 'Which test runner should I set up?\nWhat should the first tests cover?',
  questions: [
    {
      header: 'Test runner',
      question: 'Which test runner should I set up?',
      options: [
        { label: 'Vitest', description: 'Fast, and works with Vite out of the box' },
        { label: 'Node test runner', description: 'No dependencies; a little more wiring' },
      ],
    },
    {
      header: 'Scope',
      question: 'What should the first tests cover?',
      multiSelect: true,
      options: [{ label: 'Roster diffing' }, { label: 'Desk assignment' }, { label: 'The hire API' }],
    },
  ],
  options: [opt('answer', 'Send answers', 'primary'), TERMINAL],
});

const okLater = (): Promise<ApiResult> => new Promise((r) => window.setTimeout(() => r({ ok: true }), 650));
const answerLog = (a: AskAnswer) => {
  console.info(`[ui-kit] POST /api/answer ${JSON.stringify(a)}`);
  return okLater();
};

type OnAnswer = (a: AskAnswer) => Promise<ApiResult | void> | ApiResult | void;

function askCell(cap: string, a: Ask, then?: (v: ReturnType<typeof renderAsk>) => void, onAnswer: OnAnswer = answerLog): HTMLElement {
  const box = el('div', { style: 'width: 400px' });
  const view = renderAsk(box, a, onAnswer, { now: frozen, name: 'Claudius' });
  then?.(view);
  return cell(cap, box);
}

// ------------------------------------------------------------------ sections

root.append(
  el(
    'header',
    null,
    el('h1', null, 'Claude Office UI kit'),
    el(
      'p',
      { class: 'kit-lede' },
      'Every component and state from docs/UX.md, built from client/src/ui. Add ?only=<section> to show one section, or ?calm=1 to preview reduced motion.',
    ),
  ),
);

// Tokens ------------------------------------------------------------
{
  const L = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
    return ((x + 0.05) / (y + 0.05)).toFixed(1);
  };
  const sw = (name: string, hex: string, text = '#2B2D42', use = '') =>
    el('div', { class: 'kit-swatch', style: `background:${hex};color:${text}` }, name, el('small', null, hex), el('small', null, `${use}${use ? ', ' : ''}text ${ratio(hex, text)}:1`));
  section(
    'tokens',
    'Colour and type',
    'Ink text on every fill, except paper on danger and on the dark wells. Amber belongs to needs-you alone. Panels stay paper (our palette, toy-box energy).',
    el(
      'div',
      { class: 'kit-swatches' },
      sw('ink', '#2B2D42', '#FFFDF7', 'text, borders'),
      sw('ink-2', '#5C5F77', '#FFFDF7', 'secondary on paper'),
      sw('paper', '#FFFDF7', '#2B2D42', 'panels'),
      sw('paper-2', '#F3EBDA', '#2B2D42', 'inputs, rows'),
      sw('primary', '#5CC8FF', '#2B2D42', 'primary buttons'),
      sw('danger', '#C92A3A', '#FFFDF7', 'let go, deny'),
      sw('working', '#4ADE80'),
      sw('needs you', '#FFB020'),
      sw('free', '#60A5FA'),
      sw('asleep', '#A78BFA'),
      sw('starting', '#CBD5E1'),
      sw('hire band', '#FFC94A'),
      sw('files band', '#F6B76E'),
      sw('roster band', '#8FE0C8'),
      sw('help band', '#7DB8F0'),
      sw('well', '#1B2330', '#E6EDF5', 'ask detail, terminal'),
    ),
    el(
      'div',
      { class: 'kit-cols', style: 'margin-top: 24px' },
      cell(
        'Type scale (Fredoka): panel title, section, prompt, body, button, chip, meta, key cap',
        el(
          'div',
          { class: 'kit-type' },
          el('div', { class: 'co-panel__band', style: '--band: #FFC94A; border-radius: 14px; border: 4px solid #2B2D42; height: 56px' }, el('h2', { class: 'co-panel__title' }, 'Now hiring!')),
          el('p', { class: 'co-section' }, 'Recent chatter 20/24'),
          el('p', { style: 'font: 600 18px/22px var(--co-font)' }, 'Talk to Claudette 18/22'),
          el('p', { style: 'font: 400 16px/22px var(--co-font)' }, 'Body copy sits at 16/22 so long lastText stays readable.'),
          el('p', { style: 'font: 600 16px/20px var(--co-font)' }, 'Button label 16/20'),
          el('p', { style: 'font: 600 15px/20px var(--co-font)' }, 'Chip, bubble 15/20'),
          el('p', { class: 'co-muted' }, 'Meta 14/18 in ink-2, paper only'),
          row(keyCap('Ctrl+]'), keyCap('Tab'), keyCap('E', true)),
        ),
      ),
    ),
  );
}

// Buttons and icons -------------------------------------------------
{
  const pressed = button('Pressed', { kind: 'primary' });
  pressed.classList.add('is-pressed');
  const focused = button('Focused', {});
  focused.classList.add('is-focus');
  const icons: IconName[] = [
    'roster',
    'hire',
    'sound',
    'soundOff',
    'help',
    'close',
    'folder',
    'branch',
    'model',
    'clock',
    'coin',
    'staff',
    'intern',
    'sun',
    'moon',
    'check',
    'send',
    'copy',
    'plan',
    'question',
    'terminal',
  ];
  const states: EmployeeState[] = ['working', 'needs-you', 'idle', 'sleeping', 'starting'];
  section(
    'buttons',
    'Buttons, keys, icons',
    'Three kinds plus text: primary (sky), secondary (paper), danger (red, paper text). The bottom shadow compresses on press and springs back. Disabled buttons say why in a tooltip.',
    row(
      button('Sit at their computer', { kind: 'primary', key: 'E' }),
      button('Quick message'),
      button('Let go', { kind: 'danger' }),
      button('Skip tips', { kind: 'ghost' }),
      button('Let go', { kind: 'danger-text' }),
      button('Call back in', { kind: 'primary', small: true }),
      button('Hire for blendscope', { kind: 'primary', disabled: true, tip: 'Pick a project first' }),
      pressed,
      focused,
    ),
    row(
      ...['E', 'Q', 'N', 'R', 'H', 'M', '?', 'V', '1', '2', '3', 'Esc', 'Ctrl+]', '⌘↵'].map((k) => keyCap(k)),
      hudButton('roster', 'Roster', 'R'),
      hudButton('hire', 'Hire', 'H'),
      hudButton('sound', 'Sound', 'M'),
      hudButton('help', 'Help', '?'),
    ),
    row(...icons.map((n) => cell(n, html(icon(n, 32))))),
    row(...states.map((s) => cell(STATE_WORD[s], html(stateBadge(s, true))))),
  );
}

// HUD ---------------------------------------------------------------
{
  const badge = el(
    'div',
    { class: 'co-hud-box' },
    html(logoSvg(false, 40)),
    el(
      'span',
      null,
      el('span', { class: 'co-hud-box__title' }, 'Claude Office'),
      el('span', { class: 'co-hud-box__meta', html: icon('sun', 18) }, '3:42 PM', el('span', { style: 'margin-left: 6px' }, '7 staff')),
    ),
  );
  const LIMITS = [
    { id: 'five_hour', label: '5-hour', usedPct: 42, resetsAt: T0 + 72 * 60_000 },
    { id: 'seven_day', label: 'Weekly', usedPct: 18, resetsAt: T0 + 3 * 86_400_000 },
  ];
  const stage = el('div', { class: 'kit-stage kit-floor', style: 'height: 470px' });
  const at = (style: string, ...c: Child[]) => el('div', { style: `position:absolute;${style}` }, ...c);
  stage.append(
    at(
      'left:16px;top:16px;display:flex;flex-direction:column;align-items:flex-start;gap:12px',
      badge,
      needsChip(3, { left: 0.62 }),
      row(stateChip('working', 4), stateChip('idle', 1), stateChip('sleeping', 1), internChip(3), planMeter(LIMITS, T0)),
    ),
    at('right:24px;top:16px;display:flex;gap:12px', hudButton('roster', 'Roster', 'R'), hudButton('hire', 'Hire', 'H'), hudButton('sound', 'Sound', 'M'), hudButton('help', 'Help', '?')),
    at('left:50%;top:16px;transform:translateX(-50%);width:400px', toastEl({ text: 'Clyde clocked in for blendscope', face: face(P.clyde, 32) })),
    at('left:16px;bottom:16px', coachCard("You're the manager.", ['Walk with ', keyCap('W'), keyCap('A'), keyCap('S'), keyCap('D'), ' or the arrows. Hold ', keyCap('Shift'), ' to run, ', keyCap('Space'), ' to jump. Drag to look around, scroll to zoom.'], { done: 'Got it' })),
    at('left:50%;bottom:72px;transform:translateX(-50%)', promptPill('Talk to Claudette')),
  );
  const HIGH = [
    { id: 'five_hour', label: '5-hour', usedPct: 86, resetsAt: T0 + 20 * 60_000 },
    { id: 'seven_day', label: 'Weekly', usedPct: 64, resetsAt: T0 + 2 * 86_400_000 },
  ];
  section(
    'hud',
    'HUD',
    'Always on: badge and clock, the needs-you chip (the hero), counts, the plan meter, four buttons. Contextual: the prompt, toasts, coach cards. Composed here at real size over a floor.',
    stage,
    row(
      cell('1 needs you, no ask open', needsChip(1)),
      cell('inbox zero (slams in)', needsChip(0)),
      cell('seated: no Q cap', needsChip(2, { seated: true, left: 0.2 })),
      cell('plan meter from 80 %', planMeter(HIGH, T0)),
      cell('first person', el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:48px;padding:12px' }, el('div', { class: 'co-crosshair' }), promptPill('Check on Klaus'))),
    ),
    row(
      cell('good, with an action', el('div', { style: 'width:420px' }, toastEl({ kind: 'good', text: 'Claudette finished: make the bpm detection…', face: face(P.claudette, 32), action: { label: 'Go', run: () => {} } }))),
      cell('error (7 s)', el('div', { style: 'width:420px' }, toastEl({ kind: 'bad', text: "Couldn't hire: tmux isn't installed", sub: 'Install it with brew install tmux, then try again.', face: icon('hire', 32) }))),
      cell('merged clock-ins', el('div', { style: 'width:420px' }, toastEl({ text: '3 people clocked in', face: icon('staff', 32) }))),
      cell('server notice', el('div', { style: 'width:420px' }, toastEl({ kind: 'warn', text: "Clod's session crashed on startup", sub: 'tmux said: exit status 1', face: face(P.clod, 32) }))),
    ),
    row(
      cell('offline', banner('offline', 'Lost the office server. Reconnecting…')),
      cell('offline after 30 s', banner('offline', "The office server isn't running.", { label: 'Retry now', run: () => {} })),
      cell('back', banner('back', 'Back online')),
      cell('world tags (first run)', row(worldTag('Hire people here'), worldTag('Roster: who’s doing what'))),
    ),
  );
}

// Labels over people --------------------------------------------------
{
  const col = (cap: string, p: Person, ...tags: Child[]) =>
    el(
      'div',
      { style: 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;width:180px;height:320px' },
      el('div', { class: 'co-tagstack' }, ...tags),
      html(face(p, 84)),
      el('span', { class: 'kit-cap', style: 'background:#fffdf7cc;padding:0 6px;border-radius:6px' }, cap),
    );
  const stage = el(
    'div',
    { class: 'kit-stage kit-wall', style: 'display:flex;justify-content:space-around;align-items:flex-end;padding:18px 12px 14px' },
    col('working', P.claudette, speech({ text: 'Editing roster.ts' }), namePill('Claudette', 'working')),
    col('free, long text clamps', P.clyde, speech({ text: 'Done! All 48 tests pass and the branch is pushed for review.' }), namePill('Clyde', 'idle')),
    col('needs you (waitingFor)', P.klaus, bangMarker(), speech({ needs: true, line1: 'Can I do this?', line2: 'Needs your permission' }), namePill('Klaus', 'needs-you')),
    col('needs you (ask)', P.claudia, bangMarker(), speech({ needs: true, line1: 'Run a command?', code: 'npm test -- --run roster' }), namePill('Claudia', 'needs-you')),
    col('asleep', P.claudine, zzz(), namePill('Claudine', 'sleeping')),
    col('starting', P.clod, speech({ text: 'Getting settled…' }), namePill('Clod', 'starting')),
    col('bumped; far pill dimmed', P.claudio, bangMarker('bump'), namePill('Claudio', 'working', true)),
  );
  section(
    'labels',
    'Labels over people',
    'Name pills fade with distance; chatter bubbles are glassy dialogue bubbles; needs-you bubbles are solid amber with the bouncing "!" above. Every state has a glyph as well as a colour.',
    stage,
  );
}

// Faces ----------------------------------------------------------------
{
  setTabAlert(2, 'Claude Office UI kit');
  const sample = COVER[1]?.id ?? COVER[0].id;
  section(
    'faces',
    'Faces',
    'One portrait per person, drawn from the same looks as their 3D rig: every hair style, with and without glasses, on a disc of their shirt colour.',
    row(...COVER.map((c) => cell(`${c.style}${c.glasses ? ', glasses' : ''}`, html(faceSvg(employeeLooks(c.id, true), { size: 64 }))))),
    row(
      ...[24, 32, 40, 56, 96].map((s) => cell(`${s} px`, html(faceSvg(employeeLooks(sample, true), { size: s })))),
      cell('manager', html(managerFace({ size: 64 }))),
      cell('intern of Claudette', html(internFace('kit-intern-1', employeeLooks(P.claudette.id, true).shirt, { size: 64 }))),
      cell('intern of Klaus', html(internFace('kit-intern-7', employeeLooks(P.klaus.id, true).shirt, { size: 64 }))),
      cell('logo', html(logoSvg(false, 64))),
      cell('favicon while 2 wait', html(logoSvg(true, 64))),
    ),
  );
}

// Off-screen faces -----------------------------------------------------
{
  const W = 1336;
  const H = 440;
  const stage = el('div', { class: 'kit-stage kit-floor', style: `width:${W}px;height:${H}px` });
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
  cam.position.set(0, 9, 11);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const edges = createEdgeIndicators(stage, (id) => console.info(`[ui-kit] go to ${id}`));
  const t = (p: Person, x: number, y: number, z: number, urgent = true, since?: number) => ({
    id: p.id,
    position: new THREE.Vector3(x, y, z),
    faceSvg: face(p, 56),
    urgent,
    name: p.name,
    tooltip: urgent ? `Go to ${p.name} (needs your permission)` : `Go to ${p.name}`,
    since,
  });
  const targets = [
    t(P.klaus, -26, 1.4, -2),
    t(P.clyde, 30, 1.4, -6, true, Date.now() - 4 * 60_000),
    t(P.claudia, 3, 1.4, 22),
    t(P.claudette, 27, 1.4, 6),
    t(P.clod, 27.4, 1.4, 6.5),
    t(P.claudine, -14, 1.4, -40, false),
  ];
  const inset = { top: 70, bottom: 60, left: 24, right: 24 };
  edges.updateEdgeIndicators(cam, { width: W, height: H, inset }, targets);
  edges.updateEdgeIndicators(cam, { width: W, height: H, inset }, targets);
  stage.append(
    el('div', { style: 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)' }, el('div', { class: 'co-tagstack' }, namePill('You are here', 'working'))),
  );
  section(
    'edges',
    'Off-screen faces',
    'Needs-you people outside the safe rect, or behind the camera, get their face pinned to the edge with a notch pointing at them. Close ones merge with a count; three minutes of waiting adds a wiggle. A paper ring marks someone who is not urgent (e.g. who you are walking to). Real camera, real projection.',
    stage,
  );
}

// Panels -------------------------------------------------------------
{
  const looks = employeeLooks(P.claudette.id, true);
  const tags = () =>
    row(
      el('span', { class: 'co-tag', html: icon('folder', 18) }, 'blendscope'),
      el('span', { class: 'co-tag', html: icon('branch', 18) }, 'main'),
      el('span', { class: 'co-tag', html: icon('model', 18) }, 'Opus 5.5'),
      el('span', { class: 'co-tag', html: icon('clock', 18) }, '1h 17m'),
      el('span', { class: 'co-tag', html: icon('coin', 18) }, '$5.62'),
    );
  const context = (pct: number, used: string) =>
    el(
      'div',
      { class: 'co-field' },
      el('span', { class: 'co-label' }, 'Context ', el('span', { class: 'co-muted' }, `${pct}%, ${used} of 200k`)),
      el('div', { class: `co-bar${pct >= 85 ? ' is-high' : ''}`, style: `--pct:${pct}%` }, el('i')),
      pct >= 85 ? el('span', { class: 'co-muted' }, 'Nearly full: expect a /compact') : null,
    );
  const rows = (pairs: [string, string][]) => el('dl', { class: 'co-rows' }, ...pairs.map(([k, v]) => el('div', { class: 'co-row' }, el('dt', null, k), el('dd', null, v))));
  const stateHead = (state: EmployeeState, time: string) =>
    el('div', { class: 'co-panel__head' }, el('span', { class: 'co-chip co-chip--fill', attrs: { 'data-state': state } }, html(stateBadge(state)), `${STATE_WORD[state]} ${time}`));

  const working = panelShell({
    title: 'Claudette',
    theme: 'person',
    band: looks.shirt,
    face: faceSvg(looks, { size: 64 }),
    body: [
      stateHead('working', '12m'),
      tags(),
      context(64, '128k'),
      rows([
        ['Now', 'Editing spectrum.ts'],
        ['Working on', 'Flaky roster test'],
        ['Last said', "Here's the plan: refactor the roster diffing first, then the desk assignment."],
        ['You asked', 'why is the door not opening?'],
        ['Interns', '2 helping: Explore, executor'],
      ]),
    ],
    foot: [button('Let go', { kind: 'danger-text' }), button('Sit at their computer', { icon: 'terminal' }), button('Talk', { kind: 'primary', key: 'E' })],
  });
  working.foot.firstElementChild?.classList.add('co-push');

  const claudius = employeeLooks(P.klaus.id, true);
  const needs = panelShell({ title: 'Klaus', theme: 'person', band: claudius.shirt, face: faceSvg(claudius, { size: 64 }) });
  needs.body.append(stateHead('needs-you', '0:42'));
  renderAsk(needs.body, ASK_BASH, answerLog, { now: frozen, name: 'Klaus' });
  needs.body.append(tags(), context(91, '182k'));

  const confirm = panelShell({
    title: 'Claudio',
    theme: 'person',
    band: employeeLooks(P.claudio.id, true).shirt,
    face: face(P.claudio, 64),
    body: [stateHead('working', '3m'), rows([['Now', 'Running npm test']])],
    foot: [
      el(
        'div',
        { style: 'display:flex;flex-direction:column;gap:4px;margin-right:auto' },
        el('strong', null, 'Let Claudio go?'),
        el('span', { class: 'co-muted' }, 'This ends their Claude session. You can call them back later from Personnel files.'),
        el('span', { class: 'co-muted' }, "They're in the middle of something."),
      ),
      button('Keep them'),
      button('Let go', { kind: 'danger' }),
    ],
  });

  const roster = panelShell({ title: 'Roster', theme: 'roster' });
  const group = (state: EmployeeState, people: [Person, string, string][]) => {
    roster.body.append(el('h3', { class: 'co-section', style: 'display:flex;align-items:center;gap:8px' }, html(stateBadge(state, true)), `${STATE_WORD[state]} (${people.length})`));
    roster.body.append(el('div', { class: 'co-list' }, ...people.map(([p, line, side]) => personRow({ face: face(p, 40), name: p.name, line, side }))));
  };
  group('needs-you', [
    [P.klaus, 'Run a command? npm test -- --run roster', '0:42'],
    [P.claudia, 'Quick question! Needs an answer', '3m'],
  ]);
  group('working', [
    [P.claudette, 'blendscope: Editing spectrum.ts', '12m'],
    [P.clyde, 'crateswipe: $ npm run build', '+2'],
  ]);
  group('idle', [[P.clod, 'homebase: Done! Deployed the dashboard.', '4m']]);
  roster.foot.append(button('Hire someone', { key: 'H' }));
  roster.el.append(roster.foot);

  const hire = panelShell({
    title: 'Now hiring!',
    theme: 'hire',
    body: [
      el('label', { class: 'co-field' }, el('span', { class: 'co-label' }, 'Which project?'), el('input', { class: 'co-input', attrs: { type: 'search', placeholder: 'Search projects or paste a path', value: 'blend' } })),
      el(
        'div',
        { class: 'co-list' },
        personRow({ face: icon('folder', 40), name: 'blendscope', line: '~/blendscope', side: '2h ago' }),
        personRow({ face: icon('folder', 40), name: 'blender-assets', line: '~/claude-office/assets/blender', side: '1d ago' }),
      ),
      el('label', { class: 'co-field' }, el('span', { class: 'co-label' }, 'First task ', el('span', { class: 'co-muted' }, '(optional)')), el('textarea', { class: 'co-textarea', attrs: { rows: 3, placeholder: 'What should they start on? Leave it empty to just say hi.' } })),
      el('label', { class: 'co-field' }, el('span', { class: 'co-label' }, 'Name ', el('span', { class: 'co-muted' }, '(optional)')), el('input', { class: 'co-input', attrs: { type: 'text', placeholder: "We'll pick one", maxlength: 32 } })),
    ],
    foot: [button('Hire for blendscope', { kind: 'primary', key: '↵' })],
  });

  const interns = panelShell({ title: 'Intern desk', theme: 'interns' });
  interns.body.append(
    el(
      'div',
      { class: 'co-list' },
      personRow({ face: internFace('kit-intern-1', employeeLooks(P.claudette.id, true).shirt, { size: 40 }), name: 'Explore', line: 'Find where desks get assigned, for Claudette', side: '' }),
      personRow({ face: internFace('kit-intern-7', employeeLooks(P.klaus.id, true).shirt, { size: 40 }), name: 'executor', line: 'Write the roster regression test, for Klaus', side: '' }),
    ),
  );

  // Needs you without an in-game question: the amber note, and "Sit down and answer" takes E.
  const clod = employeeLooks(P.clod.id, true);
  const waiting = panelShell({
    title: 'Clod',
    theme: 'person',
    band: clod.shirt,
    face: faceSvg(clod, { size: 64 }),
    body: [
      stateHead('needs-you', '1:05'),
      el(
        'div',
        { class: 'co-needsnote' },
        el('span', { class: 'co-needsnote__bang', attrs: { 'aria-hidden': 'true' } }, '!'),
        el('span', { class: 'co-needsnote__text' }, el('strong', null, "I've got a menu open."), el('span', null, 'Needs you at the keyboard')),
      ),
      tags(),
    ],
    foot: [button('Let go', { kind: 'danger-text' }), button('Talk', { icon: 'chat' }), button('Sit down and answer', { kind: 'primary', icon: 'terminal', key: 'E' })],
  });
  waiting.foot.firstElementChild?.classList.add('co-push');

  const fileRow = (title: string, meta: string, live: boolean) =>
    el(
      'div',
      { class: `co-file${live ? ' is-live' : ''}` },
      el('span', { class: 'co-file__icon', html: icon('folder', 36) }),
      el('span', { class: 'co-file__main' }, el('span', { class: 'co-file__title' }, title), el('span', { class: 'co-muted' }, meta)),
      live ? button('Go to them', { small: true }) : button('Call back in', { kind: 'primary', small: true }),
    );
  const files = panelShell({
    title: 'Personnel files',
    theme: 'files',
    body: [
      el('input', { class: 'co-input', attrs: { type: 'search', placeholder: 'Search past sessions' } }),
      el(
        'div',
        { class: 'co-list' },
        fileRow('Flaky roster test', 'blendscope, just now, $5.21. In the office.', true),
        fileRow('Door sensor bug', 'claude-office, 4 h ago, $6.94', false),
        fileRow('Coffee machine API', 'crateswipe, yesterday, $4.04', false),
      ),
    ],
  });
  const empty = panelShell({
    title: 'Roster',
    theme: 'roster',
    body: [el('div', { class: 'co-empty' }, el('strong', null, "Nobody's in yet."), el('span', { class: 'co-muted' }, 'Hire someone at reception, or run claude in any terminal.'))],
  });

  section(
    'panels',
    'Panels',
    'Docked right, one at a time. A coloured band with a chunky outlined title; a person panel puts their face across the band edge. Confirms happen in place. The ask card sits at the top when they have one.',
    el(
      'div',
      { class: 'kit-cols' },
      cell('employee, working', working.el),
      cell('employee, needs you (ask on top)', needs.el),
      cell('let go: in-place confirm', confirm.el),
      cell('roster', roster.el),
      cell('hire', hire.el),
      cell('intern desk', interns.el),
      cell('needs you, no question (sit down)', waiting.el),
      cell('personnel files', files.el),
      cell('empty roster', empty.el),
    ),
  );
}

// Ask cards ------------------------------------------------------------
{
  const plan = el('div', { style: 'width:560px' });
  renderAsk(plan, ASK_PLAN, answerLog, { now: frozen });
  const planCell = cell('plan (panel widens to 560)', plan);
  planCell.style.gridColumn = 'span 2';
  section(
    'ask',
    'Answering in the office',
    'Permission, plan and question asks. Buttons follow the ask\'s styles and keep Claude Code\'s numbering; number keys work only while the card has focus. The bar drains to expiresAt; the last 10 s pulse. Answers fold the card into one line.',
    el(
      'div',
      { class: 'kit-cols' },
      askCell('permission: run a command (1:12 left)', ASK_BASH),
      askCell('permission: edit, with "always" for this session', ASK_EDIT),
      askCell('permission: MCP, last 10 s', ASK_MCP),
      askCell('question: one pick + several picks', ASK_QUESTION, (v) => {
        const first = v.el.querySelector<HTMLInputElement>('input[type=radio]');
        if (first) {
          first.checked = true;
          first.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }),
      planCell,
      askCell('note open for Deny', ask({ ...ASK_BASH, id: 'note' }), (v) => {
        v.el.querySelector<HTMLButtonElement>('.co-ask__linkrow .co-btn')?.click();
        const input = v.el.querySelector<HTMLInputElement>('.co-ask__note input');
        if (input) {
          input.value = "Don't run the whole suite, just the roster file";
          input.blur();
        }
      }),
      askCell('answered here', ask({ ...ASK_BASH, id: 'done' }), (v) => v.el.querySelector<HTMLButtonElement>('[data-choice="allow"]')?.click(), () => ({ ok: true })),
      askCell('answered in their terminal', ask({ ...ASK_EDIT, id: 'gone' }), (v) => v.settle('elsewhere')),
      askCell('expired', ask({ ...ASK_MCP, id: 'late' }), (v) => v.settle('expired')),
      askCell(
        'answer failed',
        ask({ ...ASK_BASH, id: 'fail' }),
        (v) => v.el.querySelector<HTMLButtonElement>('[data-choice="deny"]')?.click(),
        () => ({ ok: false, error: 'they already answered in their terminal' }),
      ),
    ),
  );
}

// Team Room ------------------------------------------------------------
{
  const STATS: TeamStats = {
    plan: {
      limits: [
        { id: 'five_hour', label: '5-hour', usedPct: 42, resetsAt: T0 + 72 * 60_000 },
        { id: 'seven_day', label: 'Weekly', usedPct: 86, resetsAt: T0 + 3 * 86_400_000 + 4 * 3_600_000 },
      ],
      updatedAt: T0 - 30_000,
    },
    team: { staff: 7, working: 4, needsYou: 2, idle: 1, interns: 3, costUSD: 23.48, linesAdded: 1204, linesRemoved: 318, commitsToday: 9, sessionsToday: 12 },
    context: [
      { sessionId: P.claudette.id, displayName: 'Claudette', tokens: 128_000, windowSize: 200_000, pct: 64 },
      { sessionId: P.klaus.id, displayName: 'Klaus', tokens: 182_000, windowSize: 200_000, pct: 91 },
      { sessionId: P.clyde.id, displayName: 'Clyde', tokens: 41_000, windowSize: 200_000, pct: 20.5 },
      { sessionId: P.claudia.id, displayName: 'Claudia', tokens: 610_000, windowSize: 1_000_000, pct: 61 },
    ],
  };
  const facesById = new Map(Object.values(P).map((p) => [p.id, face(p, 28)]));
  const full = panelShell({ title: 'Team Room', theme: 'help' });
  renderTeamStats(full.body, STATS, { now: T0, face: (id) => facesById.get(id) ?? markup(''), onGo: (id) => console.info(`[ui-kit] go to ${id}`) });
  const unknown = panelShell({ title: 'Team Room', theme: 'help' });
  renderTeamStats(unknown.body, { ...STATS, plan: { limits: [], updatedAt: null }, context: [] }, { now: T0 });
  section(
    'team',
    'Team Room',
    "The wall board's twin in HTML: plan gauges with reset countdowns (red from 80 %), today's numbers, and how full each context window is (red from 85 %). Rows go to the person.",
    el('div', { class: 'kit-cols' }, cell('live numbers', full.el), cell('before any session reports plan usage', unknown.el)),
  );
}

// Chat -------------------------------------------------------------------
{
  const iso = (t: number) => new Date(t).toISOString();
  const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
  const HISTORY: ChatLine[] = [
    { seq: 1, role: 'user', text: 'why is the door not opening when someone walks up?', ts: iso(T0 - 26 * 60_000) },
    { seq: 2, role: 'tool', text: 'Searching for setDoorOpen', tool: 'Grep' },
    { seq: 3, role: 'tool', text: 'Reading world/index.ts', tool: 'Read' },
    { seq: 4, role: 'tool', text: 'Reading chars/director.ts', tool: 'Read' },
    { seq: 5, role: 'tool', text: 'Reading main.ts', tool: 'Read' },
    {
      seq: 6,
      role: 'assistant',
      ts: iso(T0 - 25 * 60_000),
      text: [
        'Found it. The door only opens for the **manager**:',
        '',
        '1. `main.ts` checks the distance to the manager, but never to employees.',
        '2. Walk-ins start 4 m outside, so the door stays shut until you are near.',
        '   - Fix: also check everyone in `director.walking`.',
        '3. The door closes again after 1.2 s, which clips slow walkers.',
        '',
        '```ts',
        'const near = [manager, ...director.walking].some((c) => c.position.distanceTo(door) < 2.5);',
        'world.setDoorOpen(near);',
        '```',
        '',
        'Want me to make that change?',
      ].join('\n'),
    },
    { seq: 7, role: 'user', text: 'yes please, and run the tests after', ts: iso(T0 - 12 * 60_000) },
    { seq: 8, role: 'tool', text: 'Editing main.ts', tool: 'Edit' },
    { seq: 9, role: 'tool', text: '$ npm test -- --run door', tool: 'Bash' },
    { seq: 10, role: 'assistant', text: 'Done: the door now opens for anyone within 2.5 m. All 12 door tests pass.', ts: iso(T0 - 11 * 60_000) },
    { seq: 11, role: 'user', text: '/compact', ts: iso(T0 - 3 * 60_000) },
  ];

  function mockApi(lines: ChatLine[], opts: { failSay?: string } = {}): ChatApi {
    const store = [...lines];
    let seq = store.length ? store[store.length - 1].seq : 0;
    return {
      async chatter(_id, q) {
        await wait(120);
        return q.after !== undefined ? store.filter((l) => l.seq > q.after!) : store.slice(-(q.n ?? 60));
      },
      async say(_id, text) {
        console.info(`[ui-kit] POST /api/say ${JSON.stringify(text)}`);
        await wait(350);
        if (opts.failSay) return { ok: false, error: opts.failSay };
        window.setTimeout(() => store.push({ seq: ++seq, role: 'user', text, ts: iso(Date.now()) }), 500);
        window.setTimeout(() => store.push({ seq: ++seq, role: 'tool', text: 'Reading roster.ts', tool: 'Read' }), 1300);
        window.setTimeout(() => store.push({ seq: ++seq, role: 'assistant', text: "On it! I'll run the roster tests next.", ts: iso(Date.now()) }), 2400);
        return { ok: true };
      },
      async interrupt() {
        console.info('[ui-kit] POST /api/interrupt');
        await wait(200);
        return { ok: true };
      },
      async adopt() {
        console.info('[ui-kit] POST /api/adopt');
        await wait(300);
        return { ok: true };
      },
      async answer(req) {
        console.info(`[ui-kit] POST /api/answer ${JSON.stringify(req)}`);
        await wait(500);
        return { ok: true };
      },
      sit: (id) => console.info(`[ui-kit] sit at ${id}`),
    };
  }

  const person = (p: Person, extra: Partial<Employee>): Employee => ({
    sessionId: p.id,
    pid: 66880,
    name: p.name.toLowerCase(),
    displayName: p.name,
    cwd: '/Users/duan.uys/claude-office',
    project: 'claude-office',
    branch: 'main',
    model: 'claude-opus-5-5',
    kind: 'interactive',
    hosted: true,
    state: 'working',
    stateSince: T0 - 12 * 60_000,
    interns: [],
    startedAt: T0 - 77 * 60_000,
    ...extra,
  });

  const box = (h = 640) => el('div', { style: `height:${h}px;display:flex` });
  const mount = (target: HTMLElement, e: Employee, api: ChatApi) => {
    const view = openChat(target, e, api, { now: frozen, pollMs: 600 });
    view.el.style.height = '100%';
    return view;
  };

  const working = box();
  mount(working, person(P.claudette, { activity: { kind: 'typing', tool: 'Edit', label: 'Editing spectrum.ts' } }), mockApi(HISTORY));

  const needs = box();
  mount(needs, person(P.klaus, { state: 'needs-you', stateSince: T0 - 42_000, waitingFor: 'permission', ask: ASK_BASH }), mockApi(HISTORY.slice(0, 7)));

  const failed = box(520);
  const failView = mount(failed, person(P.clyde, { state: 'idle', project: 'crateswipe', branch: 'feat/swipe-undo' }), mockApi(HISTORY.slice(6, 10), { failSay: 'They have a question open. Sit at their computer to answer it.' }));
  window.setTimeout(() => {
    const input = failView.el.querySelector<HTMLTextAreaElement>('.co-chat__input');
    if (!input) return;
    input.value = 'can you also add a test for slow walkers?';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }, 400);

  const external = box(520);
  mount(external, person(P.claudia, { hosted: false, state: 'idle', project: 'blendscope', branch: 'main', pid: 41212 }), mockApi(HISTORY.slice(0, 6)));

  const adopting = box(520);
  mount(adopting, person(P.claudine, { hosted: false, adopting: true, state: 'idle', project: 'homebase', branch: undefined }), mockApi([]));

  // Agent text at its richest: a table, highlighted code, nested and task lists, a quote, links.
  const RICH: ChatLine[] = [
    { seq: 1, role: 'user', text: 'what did you change for the door, and what is left?', ts: iso(T0 - 9 * 60_000) },
    {
      seq: 2,
      role: 'assistant',
      ts: iso(T0 - 8 * 60_000),
      text: [
        '## Door fix',
        'The door now opens for **anyone** within 2.5 m, not just the manager. ~~Closing on a timer~~ is gone.',
        '',
        '| File | Change | Tests |',
        '| --- | --- | ---: |',
        '| `world/door.ts` | opens for walkers | 12 pass |',
        '| `chars/director.ts` | exposes `walking` | 3 pass |',
        '| `main.ts` | one call per frame | n/a |',
        '',
        '```ts',
        'export function updateDoor(world: World, people: readonly Char[]): void {',
        '  const near = people.some((c) => c.position.distanceTo(world.door) < 2.5);',
        "  world.setDoorOpen(near); // closes 1.2 s after the last one",
        '}',
        '```',
        '',
        'Still to do:',
        '- [x] Open for everyone',
        '- [x] Tests for slow walkers',
        '- [ ] Tune the slide speed',
        '  - maybe 300 ms?',
        '',
        '```diff',
        '- if (manager.position.distanceTo(door) < 2.5) open();',
        '+ if (near) open();',
        '```',
        '',
        '> The door model\'s pivot is 2 cm off; worth a look later.',
        '',
        'Docs: [Vector3.distanceTo](https://threejs.org/docs/#api/en/math/Vector3.distanceTo)',
      ].join('\n'),
    },
    { seq: 3, role: 'tool', text: '$ npm test -- --run door', tool: 'Bash' },
    {
      seq: 4,
      role: 'assistant',
      ts: iso(T0 - 7 * 60_000),
      text: ['All green:', '', '```bash', 'npm test -- --run door', '# ✓ 15 passed (0.9s)', '```', '', '```json', '{ "door": { "radius": 2.5, "closeAfterMs": 1200 } }', '```'].join('\n'),
    },
  ];
  const rich = box(900);
  mount(rich, person(P.clyde, { state: 'idle', project: 'claude-office', branch: 'door-fix' }), mockApi(RICH));

  // Hostile text must come out inert: no images load, no scripts run, no javascript: links.
  const HOSTILE = [
    'Raw HTML stays text: <img src=x onerror="window.__xss=1"> and <script>window.__xss=2</script>',
    '',
    '[a javascript: link](javascript:window.__xss=3) and [a data: link](data:text/html,hi) stay plain text.',
    '',
    '![an image](https://example.com/b.png) is a link, never loaded.',
    '',
    '<div onclick="window.__xss=4" style="position:fixed;inset:0">a raw HTML block</div>',
    '',
    'Real links still work: [the docs](https://example.com/docs), <https://example.com/auto> and mail to <a@b.co>.',
  ].join('\n');
  const hostile = el('div', {
    class: 'co-md',
    style: 'max-width:440px;padding:14px 16px;border:3px solid #2B2D42;border-radius:16px;background:#FFFDF7;font:400 15px/21px Fredoka, sans-serif',
    html: renderMarkdown(HOSTILE),
  });
  enhanceMarkdown(hostile);

  section(
    'chat',
    'Chat',
    "Talk to them like in Claude Code. Assistant text renders as light markdown; tool steps become chips, and runs of 3+ collapse. Enter sends, Shift+Enter adds a line, slash commands pass through, Esc hands the keys back to the game. Sending shows your message at once and reconciles with their feed. While they need you the ask sits inline and sending waits.",
    el(
      'div',
      { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:28px 24px;align-items:start' },
      cell('working: typing indicator, collapsed steps', working),
      cell('needs you: the ask inline, sending waits', needs),
      cell('a send the office refused', failed),
      cell('started in their own terminal', external),
      cell('bringing them in (waiting for /exit)', adopting),
      cell('rich markdown: table, highlighted code, lists', rich),
      cell('hostile markdown renders inert', hostile),
    ),
  );
}

// For the headless behaviour checks (dev only).
Object.assign(window, { __kit: { ToastStack, Bus, renderAsk, placeEdge, THREE, ASK_BASH, ASK_QUESTION, openChat, renderMarkdown, enhanceMarkdown } });
