// Docked panels (UX.md §3.5, §4.3): a person (with their ask card on top), the chat, Now hiring,
// Personnel files, the Roster, Help, the Team Room and the Intern desk. One at a time, docked
// right; the world keeps running behind them.
import type { ApiResult, Employee, EmployeeState, PastSession, ProjectInfo } from '../../../shared/protocol';
import { employeeLooks } from '../chars/looks';
import { GRAPHICS_PRESETS, readGraphics, setGraphics, type GraphicsPreset } from '../engine/graphics';
import { REGULARS_PRESETS, readReceptionist, readRegularsDensity, setReceptionist, setRegularsDensity, type RegularsPreset } from '../chars/regulars-setting';
import type { Backend, RosterStore } from '../net';
import { renderAsk, type AskView } from './askpanel';
import { bus } from './bus';
import { httpChatApi, openChat, type ChatApi, type ChatMode, type ChatView } from './chatpanel';
import { button, keyCap, panelShell, personRow } from './components';
import { soundSettings } from '../audio/controls';
import { coachDone, coachReset, startCoach } from './coach';
import { confetti } from './confetti';
import { ago, doingText, tildify, truncate, waitingLines } from './dom';
import { el, fmtDuration, fmtMoney, fmtTokens, fmtWait, type Child } from './el';
import { employeeFace, internFace } from './faces';
import { icon, stateBadge, STATE_WORD, type IconName } from './icons';
import type { Sfx } from './sfx';
import type { Panel, PanelId } from './shell';
import { enhanceMarkdown, plainText, renderMarkdown } from './markdown';
import { markNoteSeen, noteSeen } from './notes';
import { holdDisabled, isOffline, needsServer, releaseDisabled, setServerTip } from './offline';
import { HIGH_CONTEXT, renderTeamStats } from './teamstats';
import { setThoughtsOn, thoughtsOn, wireThoughts } from './thoughts';
import { TerminalView } from './terminal';
import type { Toasts } from './toasts';

export type { PanelId } from './shell';

export interface PanelActions {
  /** Walk the manager to someone's desk (their panel opens as you set off). */
  walkTo(sessionId: string): void;
  /** Sit at their computer (someone in your own terminal: just their Shell tab). */
  sitAt(sessionId: string): void;
  /** An ask was answered in-game (so they can lower their hand right away). */
  answered(sessionId: string, choice: string): void;
}

export interface PanelDeps {
  store: RosterStore;
  backend: Backend;
  toasts: Toasts;
  sfx: Sfx;
  actions: PanelActions;
}

export interface OpenOptions {
  /** Move keyboard focus into the panel (default). A go-to passes false: focus stays on the game. */
  focus?: boolean;
}

export interface ChatOpenOptions extends OpenOptions {
  /** Open straight into their live terminal (T). */
  mode?: ChatMode;
  /** Open with their name ready to edit (the Rename on an arrival toast). */
  rename?: boolean;
}

type SimplePanel = Exclude<PanelId, 'employee' | 'ask' | 'chat'>;
type Labelled = { btn: HTMLButtonElement; set(text: string, busy?: boolean): void };

/** Keys that act like a web page inside a panel; the game must not see them. */
const PAGE_KEYS = new Set([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
/** An E this soon after a panel opened is the press that opened it. */
const E_GRACE_MS = 250;
const CALM_KEY = 'claude-office:calm';
const STATE_ORDER: EmployeeState[] = ['needs-you', 'working', 'starting', 'idle', 'sleeping'];

/** "oh-my-claudecode:executor" → "executor". */
export const internType = (type: string): string => type.replace(/^.*:/, '') || 'intern';

/** "claude-opus-5-5" → "Opus 5.5", "claude-sonnet-4-5-20250929" → "Sonnet 4.5". */
export function modelName(model: string): string {
  const m = /^(?:claude-)?([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[.*\])?$/i.exec(model);
  if (!m) return model.replace(/^claude-/, '');
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  return `${family} ${m[2]}${m[3] ? `.${m[3]}` : ''}${m[4] ? ` ${m[4]}` : ''}`;
}

/** Their shirt colour: the band behind their face. */
const shirtOf = (sessionId: string, hosted: boolean) => employeeLooks(sessionId, hosted).shirt;

/** What someone is up to, in one line (roster rows). */
function lineFor(e: Employee): string {
  if (e.state === 'needs-you') return e.ask?.title ?? waitingLines(e)[1];
  if (e.state === 'idle') return e.lastText ? truncate(plainText(e.lastText), 80) : 'Free';
  return doingText(e);
}

/** Time in their current state: "0:42" while they need you (it counts), "12m" otherwise. */
function since(e: Employee, now: number): string {
  return e.state === 'needs-you' ? fmtWait(now - e.stateSince) : fmtDuration(now - e.stateSince);
}

function tag(name: IconName, text: string, title?: string): HTMLElement {
  return el('span', { class: 'co-tag', html: icon(name, 18), attrs: { title } }, text);
}

function spinner(): HTMLElement {
  return el('span', { class: 'co-spinner', attrs: { 'aria-hidden': 'true' } });
}

/** A button whose label changes ("Hire for blendscope", "Interviewing…"). */
function labelled(kind: 'primary' | 'secondary' | 'danger', label: string, key?: string): Labelled {
  const text = el('span', null, label);
  const lead = el('span', { class: 'co-btn__lead', attrs: { hidden: true } });
  const cls = kind === 'secondary' ? 'co-btn' : `co-btn co-btn--${kind}`;
  const btn = el('button', { class: cls, attrs: { type: 'button' } }, lead, text, key ? keyCap(key) : null);
  return {
    btn,
    set(next, busy = false) {
      text.textContent = next;
      lead.replaceChildren(...(busy ? [spinner()] : []));
      lead.hidden = !busy;
      if (busy) btn.setAttribute('aria-busy', 'true');
      else btn.removeAttribute('aria-busy');
    },
  };
}

function readCalm(): boolean {
  try {
    return localStorage.getItem(CALM_KEY) === '1';
  } catch {
    return false;
  }
}

function applyCalm(on: boolean): void {
  document.documentElement.classList.toggle('co-calm', on);
  try {
    localStorage.setItem(CALM_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable: this visit only
  }
}

export class PanelHost {
  private layer: HTMLElement;
  private current: Panel | null = null;
  private openedAt = 0;
  /** The open chat, for T (Chat ⇄ Terminal). */
  private chatView: ChatView | null = null;
  /** Fires with true when a panel opens, false when the last one closes. */
  onChange: ((open: boolean) => void) | null = null;
  /** The person whose panel (or chat) is open. */
  employeeId: string | null = null;

  constructor(
    root: HTMLElement,
    private deps: PanelDeps,
  ) {
    this.layer = el('div', { class: 'co-panels' });
    this.layer.addEventListener('keydown', (ev) => this.onKey(ev));
    root.append(this.layer);
    // Edge faces and name pills ask for a go-to; walking there is the game's job.
    bus.on('go-to', ({ id }) => this.deps.actions.walkTo(id));
    // Thought bubbles: the saved switch goes out with presence (this runs before backend.start()).
    wireThoughts(this.deps.backend, this.deps.store);
    // First-run tips (bottom-left), once the office is on screen.
    startCoach(root, this.deps.store);
    document.documentElement.classList.toggle('co-calm', readCalm());
  }

  get openId(): PanelId | null {
    return this.current?.id ?? null;
  }

  close(): void {
    const p = this.current;
    if (!p) return;
    this.current = null;
    this.employeeId = null;
    const hadFocus = p.el.contains(document.activeElement);
    p.el.classList.add('is-out');
    p.dispose?.();
    window.setTimeout(() => p.el.remove(), 170);
    this.deps.sfx.close();
    this.onChange?.(false);
    bus.emit('panel', { name: p.id, open: false });
    if (hadFocus) document.getElementById('scene')?.focus({ preventScroll: true });
  }

  toggle(id: SimplePanel): void {
    if (this.current?.id === id) this.close();
    else this.open(id);
  }

  open(id: SimplePanel, opts: OpenOptions = {}): void {
    this.employeeId = null;
    const make: Record<SimplePanel, () => Panel> = {
      hire: () => this.hire(),
      archive: () => this.archive(),
      roster: () => this.roster(),
      help: () => this.help(),
      stats: () => this.teamRoom(),
      interns: () => this.internDesk(),
    };
    this.present(make[id](), opts);
  }

  openEmployee(sessionId: string, opts: OpenOptions = {}): void {
    this.present(this.employee(sessionId, false), opts);
    this.employeeId = sessionId;
    coachDone('talk');
  }

  /** Their panel with the ask card focused (just their panel when there's nothing to answer). */
  openAsk(sessionId: string, opts: OpenOptions = {}): void {
    this.present(this.employee(sessionId, true), opts);
    this.employeeId = sessionId;
    coachDone('talk');
  }

  /** Talk: the chat with someone (their conversation, a composer, their ask inline). */
  openChat(sessionId: string, opts: ChatOpenOptions = {}): void {
    const chat = this.chat(sessionId, opts.mode ?? 'chat');
    if (!chat) return;
    this.present(chat, opts);
    this.employeeId = sessionId;
    // After present()'s own focus (next frame) has landed, or it would take the name box's.
    if (opts.rename) requestAnimationFrame(() => requestAnimationFrame(() => this.chatView?.rename()));
    coachDone('talk');
    if (opts.mode === 'terminal') coachDone('peek');
  }

  /**
   * T: a quick look at someone's live terminal without sitting down. With a chat open it flips
   * Chat ⇄ Terminal; otherwise it opens `sessionId`'s chat straight in terminal mode.
   */
  peek(sessionId?: string): void {
    const chat = this.current?.id === 'chat' ? this.chatView : null;
    if (chat) {
      chat.setMode(chat.getMode() === 'terminal' ? 'chat' : 'terminal');
      chat.focus();
      return;
    }
    if (sessionId) this.openChat(sessionId, { mode: 'terminal' });
  }

  /** `E` with a panel open: press its button marked E. False when it has none (the caller closes it). */
  pressE(): boolean {
    if (!this.current) return false;
    if (performance.now() - this.openedAt < E_GRACE_MS) return true;
    return this.current.pressE?.() ?? false;
  }

  private present(p: Panel, opts: OpenOptions = {}): void {
    const old = this.current;
    if (old) {
      old.dispose?.();
      old.el.remove();
    }
    this.current = p;
    this.openedAt = performance.now();
    this.layer.append(p.el);
    this.deps.sfx.pop();
    this.onChange?.(true);
    bus.emit('panel', { name: p.id, open: true, left: p.el.offsetLeft, top: p.el.offsetTop, el: p.el });
    if (opts.focus === false) return;
    requestAnimationFrame(() => {
      if (this.current !== p) return;
      if (p.focus) p.focus();
      else p.el.querySelector<HTMLElement>('.co-panel__title')?.focus({ preventScroll: true });
    });
  }

  /** Inside a panel: page keys stay in the page, and Esc in a field clears it, then closes. */
  private onKey(ev: KeyboardEvent): void {
    if (PAGE_KEYS.has(ev.key)) ev.stopPropagation();
    if (ev.key !== 'Escape' || ev.defaultPrevented || ev.isComposing) return;
    if (this.current?.escape?.()) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const t = ev.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
    ev.preventDefault();
    if (t instanceof HTMLInputElement && t.type === 'search' && t.value) {
      t.value = '';
      t.dispatchEvent(new Event('input', { bubbles: true }));
    } else this.close();
  }

  private faceFor(sessionId: string, size: number) {
    const e = this.deps.store.get(sessionId);
    return employeeFace(sessionId, e?.hosted ?? false, { size });
  }

  // -------------------------------------------------------------------------------------
  // A person

  private employee(id: string, focusAsk: boolean): Panel {
    const { store, backend, toasts, actions } = this.deps;
    const e0 = store.get(id);
    let hosted = e0?.hosted ?? false;
    const shell = panelShell({
      title: e0?.displayName ?? 'Gone home',
      theme: 'person',
      band: shirtOf(id, hosted),
      face: employeeFace(id, hosted, { size: 64 }),
      dock: true,
      onClose: () => this.close(),
    });
    const panel = shell.el;
    const faceEl = panel.querySelector<HTMLElement>('.co-panel__face');
    const chip = el('span', { class: 'co-chip co-chip--fill' });
    const head = el('div', { class: 'co-panel__head' }, chip);
    const askSlot = el('div', { class: 'co-panel__ask' });
    const needsNote = el('div', { class: 'co-needsnote', attrs: { hidden: true } });
    const tags = el('div', { class: 'co-tags' });
    const ctx = el('div', { class: 'co-field', attrs: { hidden: true } });
    const rows = el('dl', { class: 'co-rows' });
    const note = el('p', { class: 'co-muted', attrs: { hidden: true } });
    const gone = el('p', { class: 'co-muted', attrs: { hidden: true } }, 'This session has ended. They packed up and went home.');
    shell.body.append(head, askSlot, needsNote, tags, ctx, rows, note, gone);
    panel.append(shell.foot);

    let askView: AskView | null = null;
    let askId: string | null = null;
    let confirming = false;
    /** "Last said" as rendered markdown, redone only when it changes. */
    let said: { text: string; el: HTMLElement } | null = null;
    let footKey = '';
    let eButton: HTMLButtonElement | null = null;

    const renderHead = (e: Employee) => {
      const text = `${STATE_WORD[e.state]} ${since(e, store.now())}`;
      if (chip.dataset.text === text) return;
      chip.dataset.text = text;
      chip.dataset.state = e.state;
      chip.replaceChildren(el('span', { html: stateBadge(e.state) }), text);
    };

    const renderAskCard = (e: Employee) => {
      if (e.ask && e.ask.id !== askId) {
        askView?.destroy();
        askId = e.ask.id;
        let card: AskView | null = null;
        card = renderAsk(
          askSlot,
          e.ask,
          async (a) => {
            const r = await backend.answer({ ...a, sessionId: id });
            if (r.ok && a.choice !== 'terminal') actions.answered(id, a.choice);
            return r;
          },
          {
            // Cards never focus themselves: only opening their panel does (focus()), so a new ask
            // can't jump under your fingers.
            name: e.displayName,
            now: () => store.now(),
            onSettled: (outcome) => {
              // "Answer in their terminal": you sit down at it (hosted), UX.md §3.3.
              if (outcome === 'terminal' && store.get(id)?.hosted) actions.sitAt(id);
              window.setTimeout(() => {
                if (askView !== card) return;
                card?.el.remove();
                askView = null;
                panel.classList.remove('co-panel--wide');
              }, 4000);
            },
          },
        );
        askView = card;
        panel.classList.toggle('co-panel--wide', e.ask.kind === 'plan');
      } else if (!e.ask && askView) {
        askView.settle(e.state === 'needs-you' ? 'expired' : 'elsewhere');
      }
    };

    let needsKey = '';
    const renderNeeds = (e: Employee) => {
      // Sessions in their own terminal: "Got it" puts the note away until they need you again.
      const show = e.state === 'needs-you' && !e.ask && !(!e.hosted && noteSeen(e));
      const key = show ? `${e.hosted}|${e.waitingFor ?? ''}|${e.stateSince}|${e.project}|${e.pid}` : '';
      if (key === needsKey) return;
      needsKey = key;
      needsNote.hidden = !show;
      if (!show) {
        needsNote.replaceChildren();
        return;
      }
      const [said, fact] = waitingLines(e);
      const gotIt = e.hosted
        ? null
        : button('Got it', {
            small: true,
            onClick: () => {
              const now = store.get(id);
              if (now) markNoteSeen(now);
              const hadFocus = needsNote.contains(document.activeElement);
              if (now) renderNeeds(now);
              if (hadFocus) (eButton ?? shell.title).focus({ preventScroll: true });
            },
          });
      needsNote.replaceChildren(
        el('span', { class: 'co-needsnote__bang', attrs: { 'aria-hidden': 'true' } }, '!'),
        el(
          'span',
          { class: 'co-needsnote__text' },
          el('strong', null, said),
          el('span', null, fact),
          e.hosted
            ? null
            : el('span', { class: 'co-muted' }, e.otherOffice ? 'They work in another office. Answer them there.' : `They're in your own terminal (${e.project}, pid ${e.pid}). Answer them there.`),
        ),
      );
      if (gotIt) needsNote.append(gotIt);
    };

    const renderInfo = (e: Employee) => {
      const now = store.now();
      tags.replaceChildren(tag('folder', e.project, tildify(e.cwd, store.home)));
      if (e.branch) tags.append(tag('branch', e.branch));
      if (e.model) tags.append(tag('model', modelName(e.model)));
      tags.append(tag('clock', fmtDuration(now - e.startedAt), 'On the clock'));
      if (e.costUSD !== undefined) tags.append(tag('coin', fmtMoney(e.costUSD), 'Cost so far'));

      const c = store.stats?.context.find((x) => x.sessionId === id);
      ctx.hidden = !c;
      if (c) {
        const pct = Math.round(c.pct);
        const high = c.pct >= HIGH_CONTEXT;
        ctx.replaceChildren(
          el('span', { class: 'co-label' }, 'Context ', el('span', { class: 'co-muted' }, `${pct}%, ${fmtTokens(c.tokens)} of ${fmtTokens(c.windowSize)}`)),
          el('div', { class: `co-bar${high ? ' is-high' : ''}`, style: `--pct:${Math.min(100, Math.max(0, c.pct)).toFixed(1)}%`, attrs: { role: 'img', 'aria-label': `Context ${pct}% full` } }, el('i')),
        );
        if (high) ctx.append(el('span', { class: 'co-muted' }, 'Nearly full: expect a /compact'));
      }

      const pairs: [string, string | HTMLElement][] = [];
      if (e.state !== 'needs-you') pairs.push(['Now', doingText(e)]);
      if (e.title) pairs.push(['Working on', e.title]);
      if (e.lastText) {
        if (said?.text !== e.lastText) {
          said = { text: e.lastText, el: el('div', { class: 'co-md co-md--clip', html: renderMarkdown(e.lastText) }) };
          enhanceMarkdown(said.el);
        }
        pairs.push(['Last said', said.el]);
      }
      if (e.lastPrompt) pairs.push(['You asked', truncate(e.lastPrompt, 200)]);
      if (e.interns.length) {
        const active = e.interns.filter((i) => i.active);
        const types = [...new Set(active.map((i) => internType(i.type)))].join(', ');
        pairs.push(['Interns', active.length ? `${active.length} helping: ${types}` : `${e.interns.length} waiting`]);
      }
      rows.replaceChildren(...pairs.map(([k, v]) => el('div', { class: 'co-row' }, el('dt', null, k), el('dd', null, v))));

      note.hidden = e.hosted;
      if (!e.hosted) {
        note.textContent = e.otherOffice
          ? 'Hired in another office: you can watch them here, and talk to them there.'
          : e.otherPidNamespace
            ? `Can't check: different PID namespace. One of you runs in a container, so the office can't see their process (pid ${e.pid}): they stay here until Claude Code removes their session file.`
            : e.adopting
              ? `Moving into the office: they walk in as soon as you type /exit in their terminal (pid ${e.pid}).`
              : `Started in your own terminal (pid ${e.pid}).`;
      }
    };

    /** A let-go in flight: the footer stays exactly as it is until it lands. */
    let firing = false;
    const fire = async (go: Labelled) => {
      if (firing) return;
      firing = true;
      const e = store.get(id);
      const name = e?.displayName ?? 'them';
      holdDisabled(go.btn);
      go.set('Letting go…', true);
      // Their departure gets this toast, not the generic "clocked out" (registered before the reply can race it).
      toasts.expect(id, 'leave');
      const r = await backend.fire(id);
      if (r.ok) {
        bus.emit('sfx', { name: 'wahwah' });
        toasts.show(`${name} packed up and left.`, 'info', 4000, 'Their session has ended.', { who: e });
        if (this.current?.el === panel) this.close();
        return;
      }
      toasts.forget(id, 'leave');
      toasts.show(`Couldn't let ${name} go`, 'bad', 7000, r.error);
      firing = false;
      confirming = false;
      refresh();
    };

    const renderFoot = (e: Employee | undefined) => {
      if (firing) return;
      const needsSit = !!e && e.hosted && e.state === 'needs-you' && !e.ask;
      // "In the middle of something" only matters on the confirm, so working ⇄ free never rebuilds the buttons.
      const key = e ? `${e.hosted}|${needsSit}|${!!e.ask}|${confirming}|${confirming && e.state === 'working'}` : 'gone';
      if (key === footKey) return;
      footKey = key;
      eButton = null;
      const foot = shell.foot;
      const focused = foot.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.action : undefined;
      foot.replaceChildren();
      foot.hidden = !e;
      if (!e) return;
      // Whatever had focus in the footer keeps it (or its nearest stand-in) after the rebuild.
      queueMicrotask(() => {
        if (!focused || foot.contains(document.activeElement)) return;
        (foot.querySelector<HTMLElement>(`[data-action="${focused}"]`) ?? eButton ?? foot.querySelector<HTMLElement>('.co-btn'))?.focus({ preventScroll: true });
      });
      if (confirming && e.hosted) {
        const keep = button('Keep them', { onClick: () => cancelConfirm() });
        keep.dataset.action = 'keep';
        const go = labelled('danger', 'Let go');
        go.btn.dataset.action = 'fire';
        needsServer(go.btn);
        go.btn.addEventListener('click', () => void fire(go));
        foot.append(
          el(
            'div',
            { class: 'co-confirm', attrs: { role: 'alert' } },
            el('strong', null, `Let ${e.displayName} go?`),
            el('span', { class: 'co-muted' }, 'This ends their Claude session. You can call them back later from Personnel files.'),
            e.state === 'working' ? el('span', { class: 'co-muted' }, "They're in the middle of something.") : null,
          ),
          keep,
          go.btn,
        );
        keep.focus({ preventScroll: true });
        return;
      }
      // E presses the button carrying the E cap; with an ask open, E focuses the card instead.
      const talk = button('Talk', { kind: needsSit ? 'secondary' : 'primary', icon: 'chat', key: needsSit || e.ask ? undefined : 'E', onClick: () => this.openChat(id) });
      talk.dataset.action = 'talk';
      if (!e.hosted) {
        // No Claude screen to sit at, but their shell is there.
        const shellBtn = button('Sit at their computer', { icon: 'terminal', onClick: () => actions.sitAt(id) });
        shellBtn.dataset.action = 'sit';
        needsServer(shellBtn);
        foot.append(shellBtn, talk);
        eButton = e.ask ? null : talk;
        return;
      }
      const letGo = button('Let go', {
        kind: 'danger-text',
        onClick: () => {
          confirming = true;
          refresh();
        },
      });
      letGo.classList.add('co-push');
      letGo.dataset.action = 'letgo';
      needsServer(letGo);
      const sit = button(needsSit ? 'Sit down and answer' : 'Sit at their computer', {
        kind: needsSit ? 'primary' : 'secondary',
        icon: 'terminal',
        key: needsSit ? 'E' : undefined,
        onClick: () => actions.sitAt(id),
      });
      sit.dataset.action = 'sit';
      needsServer(sit);
      foot.append(letGo, needsSit ? talk : sit, needsSit ? sit : talk);
      eButton = needsSit ? sit : e.ask ? null : talk;
    };

    /** Keep them: back to the normal buttons, focus on the one that started it. */
    const cancelConfirm = () => {
      confirming = false;
      refresh();
      (shell.foot.querySelector<HTMLElement>('[data-action="letgo"]') ?? eButton)?.focus({ preventScroll: true });
    };

    const refresh = () => {
      const e = store.get(id);
      gone.hidden = !!e;
      for (const part of [head, tags, rows]) part.hidden = !e;
      if (!e) {
        needsNote.hidden = true;
        ctx.hidden = true;
        note.hidden = true;
        askView?.settle('elsewhere');
        renderFoot(undefined);
        return;
      }
      shell.title.textContent = e.displayName;
      if (e.hosted !== hosted && faceEl) {
        // Brought into the office: the lanyard goes on.
        hosted = e.hosted;
        faceEl.innerHTML = employeeFace(id, hosted, { size: 64 });
        panel.style.setProperty('--band', shirtOf(id, hosted));
      }
      renderHead(e);
      renderAskCard(e);
      renderNeeds(e);
      renderInfo(e);
      renderFoot(e);
    };

    refresh();
    const unsub = store.subscribe(refresh);
    const tick = window.setInterval(() => {
      const e = store.get(id);
      if (e) renderHead(e);
    }, 1000);

    return {
      id: focusAsk && e0?.ask ? 'ask' : 'employee',
      el: panel,
      focus: () => {
        if (focusAsk && askView) askView.focus();
        else shell.title.focus({ preventScroll: true });
      },
      escape: () => {
        // Esc on the let-go confirm backs out of the confirm first (UX.md §5).
        if (!confirming || firing) return false;
        cancelConfirm();
        return true;
      },
      pressE: () => {
        if (askView && store.get(id)?.ask?.id === askId) {
          askView.focus();
          return true;
        }
        if (eButton?.isConnected && !eButton.disabled) {
          eButton.click();
          return true;
        }
        return false;
      },
      dispose: () => {
        unsub();
        window.clearInterval(tick);
        askView?.destroy();
      },
    };
  }

  // -------------------------------------------------------------------------------------
  // Talk

  private chat(id: string, mode: ChatMode): Panel | null {
    const { store } = this.deps;
    const e = store.get(id);
    if (!e) return null;
    // Assigned right below; onMode can run inside openChat (starting in terminal mode), before it is.
    let opened: ChatView | null = null;
    const view = openChat(this.layer, e, this.chatApi(), {
      dock: true,
      now: () => store.now(),
      mode,
      home: store.home,
      // Terminal mode widens the panel: keep the edge faces clear of it.
      onMode: (m) => {
        if (m === 'terminal') coachDone('peek');
        if (opened && this.chatView === opened) bus.emit('panel', { name: 'chat', open: true, left: opened.el.offsetLeft, top: opened.el.offsetTop, el: opened.el });
      },
    });
    opened = view;
    this.chatView = view;
    let adopting = !!e.adopting;
    let ended = false;
    const unsub = store.subscribe(() => {
      const next = store.get(id);
      if (next) {
        adopting = !!next.adopting;
        ended = false;
        view.update(next);
      } else if (!adopting && !ended) {
        // Moving into the office leaves the roster for a moment; anything else is the end.
        ended = true;
        view.end(`${e.displayName}'s session has ended.`);
      }
    });
    return {
      id: 'chat',
      el: view.el,
      focus: () => view.focus(),
      pressE: () => {
        view.focus();
        return true;
      },
      // Esc in the quick look (on its tabs or its buttons) comes back to the chat, as from inside the terminal.
      escape: () => {
        if (view.getMode() !== 'terminal') return false;
        view.setMode('chat');
        view.el.querySelector<HTMLElement>('.co-panel__title')?.focus({ preventScroll: true });
        return true;
      },
      dispose: () => {
        unsub();
        if (this.chatView === view) this.chatView = null;
        view.close();
      },
    };
  }

  /**
   * Someone's chat inline in `container` (the laptop's Monitor): the same conversation, answers
   * and composer as the docked one, following the roster. `sit` replaces Sit at their computer.
   */
  inlineChat(container: HTMLElement, sessionId: string, sit: (sessionId: string) => void): { view: ChatView; dispose(): void } | null {
    const { store } = this.deps;
    const e = store.get(sessionId);
    if (!e) return null;
    const view = openChat(container, e, { ...this.chatApi(), sit, onClose: () => undefined }, { dock: false, now: () => store.now(), home: store.home });
    let ended = false;
    const unsub = store.subscribe(() => {
      const next = store.get(sessionId);
      if (next) {
        ended = false;
        view.update(next);
      } else if (!ended && !e.adopting) {
        ended = true;
        view.end(`${e.displayName}'s session has ended.`);
      }
    });
    return {
      view,
      dispose: () => {
        unsub();
        view.close();
      },
    };
  }

  /** The chat's endpoints: the backend's where it has them, so the demo office can talk too. */
  private chatApi(): ChatApi {
    const { backend, actions } = this.deps;
    const http = httpChatApi({ sit: (sid) => actions.sitAt(sid), onClose: () => this.close() });
    const answer: ChatApi['answer'] = async (req) => {
      const r = await backend.answer(req);
      if (r.ok && req.choice !== 'terminal') actions.answered(req.sessionId, req.choice);
      return r;
    };
    const say: ChatApi['say'] = (sid, text) => backend.say(sid, text);
    const openTerminal: ChatApi['openTerminal'] = (sid, o) => new TerminalView(backend, sid, o);
    if (!backend.demo) return { ...http, say, answer, openTerminal };
    const pretend = async (): Promise<ApiResult> => ({ ok: false, error: 'the demo office has no real sessions' });
    return {
      ...http,
      async chatter(sid, q) {
        const all = await backend.chatter(sid);
        const after = q.after;
        return after === undefined ? all.slice(-(q.n ?? 60)) : all.filter((l) => l.seq > after);
      },
      say,
      answer,
      openTerminal,
      interrupt: pretend,
      adopt: pretend,
      rename: (sid, name) => backend.rename(sid, name),
    };
  }

  // -------------------------------------------------------------------------------------
  // Now hiring!

  private hire(): Panel {
    const { backend, toasts, sfx, store } = this.deps;
    const shell = panelShell({ title: 'Now hiring!', theme: 'hire', dock: true, onClose: () => this.close() });
    const listId = `co-hire-${Math.random().toString(36).slice(2, 8)}`;
    const search = el('input', {
      class: 'co-input',
      attrs: {
        type: 'search',
        placeholder: 'Search projects or paste a path',
        role: 'combobox',
        'aria-controls': listId,
        'aria-expanded': 'true',
        'aria-autocomplete': 'list',
        autocomplete: 'off',
        spellcheck: 'false',
      },
    });
    const list = el('div', { class: 'co-list co-hire__list', attrs: { id: listId, role: 'listbox', 'aria-label': 'Projects' } }, el('p', { class: 'co-muted' }, 'Looking through your projects…'));
    const firstTime = el('p', { class: 'co-muted', attrs: { hidden: true } }, "First time here: they'll ask you to trust this folder.");
    const task = el('textarea', { class: 'co-textarea', attrs: { rows: 3, maxlength: 4000, placeholder: 'What should they start on? Leave it empty to just say hi.' } });
    const name = el('input', { class: 'co-input', attrs: { type: 'text', maxlength: 32, placeholder: "We'll pick one", autocomplete: 'off', spellcheck: 'false' } });
    const error = el('p', { class: 'co-error', attrs: { role: 'alert', hidden: true } });
    const go = labelled('primary', 'Hire someone', '↵');
    shell.body.append(
      el('label', { class: 'co-field' }, el('span', { class: 'co-label' }, 'Which project?'), search),
      list,
      firstTime,
      el('label', { class: 'co-field' }, el('span', { class: 'co-label' }, 'First task ', el('span', { class: 'co-muted' }, '(optional)')), task),
      el('label', { class: 'co-field' }, el('span', { class: 'co-label' }, 'Name ', el('span', { class: 'co-muted' }, '(optional)')), name),
      error,
    );
    needsServer(go.btn);
    shell.foot.append(go.btn);
    shell.el.append(shell.foot);

    type Choice = { cwd: string; name: string; known: boolean };
    let projects: ProjectInfo[] = [];
    let loaded = false;
    let chosen: Choice | null = null;
    let options: (Choice & { el: HTMLElement })[] = [];
    let active = -1;
    let busy = false;

    const expand = (p: string) => (p.startsWith('~') && store.home ? store.home + p.slice(1) : p).replace(/(.)\/+$/, '$1');
    const baseName = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;

    const sync = () => {
      if (!busy) go.set(chosen ? `Hire for ${chosen.name}` : 'Hire someone');
      go.btn.disabled = !chosen;
      setServerTip(go.btn, chosen ? null : 'Pick a project first');
      firstTime.hidden = !chosen || chosen.known;
      for (const o of options) {
        const on = !!chosen && o.cwd === chosen.cwd;
        o.el.setAttribute('aria-selected', String(on));
        o.el.classList.toggle('is-chosen', on);
      }
    };

    /** Keyboard highlight in the list (-1: none). */
    const highlight = (i: number) => {
      active = i >= 0 && i < options.length ? i : -1;
      options.forEach((o, j) => o.el.classList.toggle('is-active', j === active));
      const o = options[active];
      if (o) {
        search.setAttribute('aria-activedescendant', o.el.id);
        o.el.scrollIntoView({ block: 'nearest' });
      } else search.removeAttribute('aria-activedescendant');
    };

    const choose = (o: Choice) => {
      chosen = { cwd: o.cwd, name: o.name, known: o.known };
      error.hidden = true;
      sync();
      task.focus({ preventScroll: true });
    };

    const render = () => {
      const q = search.value.trim();
      const ql = q.toLowerCase();
      const rows: (Choice & { side: string; line: string })[] = [];
      if (/^[~/]/.test(q)) {
        const cwd = expand(q);
        rows.push({ cwd, name: baseName(cwd), known: projects.some((p) => p.cwd === cwd), side: '', line: `Use ${tildify(cwd, store.home)}` });
      }
      for (const p of projects) {
        if (rows.length >= 24) break;
        if (ql && !`${p.name} ${tildify(p.cwd, store.home)}`.toLowerCase().includes(ql)) continue;
        if (rows.some((r) => r.cwd === p.cwd)) continue;
        rows.push({ cwd: p.cwd, name: p.name, known: true, side: ago(p.lastActive), line: tildify(p.cwd, store.home) });
      }
      options = rows.map((r, i) => {
        const b = personRow({ face: icon('folder', 40), name: r.name, line: r.line, side: r.side, onClick: () => choose(r) });
        b.id = `${listId}-${i}`;
        b.setAttribute('role', 'option');
        b.tabIndex = -1;
        return { cwd: r.cwd, name: r.name, known: r.known, el: b };
      });
      if (options.length) list.replaceChildren(...options.map((o) => o.el));
      else if (loaded) list.replaceChildren(el('p', { class: 'co-muted' }, projects.length ? 'No projects match. Paste a path starting with ~ or /.' : 'No projects yet. Paste a path starting with ~ or /.'));
      highlight(q ? 0 : -1);
      sync();
    };

    search.addEventListener('input', render);
    search.addEventListener('keydown', (ev) => {
      if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && options.length) {
        ev.preventDefault();
        const n = options.length;
        highlight(ev.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1);
      } else if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        const o = options[Math.max(0, active)];
        if (o) choose(o);
      }
    });
    const submitOnEnter = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
      ev.preventDefault();
      void hire();
    };
    task.addEventListener('keydown', submitOnEnter);
    name.addEventListener('keydown', submitOnEnter);
    go.btn.addEventListener('click', () => void hire());

    const hire = async () => {
      if (!chosen || busy || isOffline()) return;
      busy = true;
      error.hidden = true;
      holdDisabled(go.btn);
      go.set('Interviewing…', true);
      const r = await backend.hire(chosen.cwd, task.value.trim() || undefined, name.value.trim() || undefined);
      busy = false;
      releaseDisabled(go.btn);
      if (r.ok) {
        confetti(go.btn);
        sfx.fanfare();
        toasts.show('Interview went great!', 'good', 4200, 'Your new hire is on the way.', { slam: true });
        const sid = r.sessionId;
        if (sid) {
          toasts.expect(sid, 'arrive', (e) => `${e.displayName} just started on ${e.project}.`);
          window.setTimeout(() => {
            if (!store.get(sid)) toasts.show('Your new hire is running late.', 'warn', 7000, "If they don't show up, check the server terminal.");
          }, 20_000);
        }
        if (this.current?.el === shell.el) this.close();
        return;
      }
      error.textContent = `Couldn't hire: ${r.error ?? 'unknown error'}`;
      error.hidden = false;
      sync();
    };

    backend
      .projects()
      .then((ps) => {
        projects = ps;
        loaded = true;
        render();
      })
      .catch((err: Error) => {
        loaded = true;
        list.replaceChildren(el('p', { class: 'co-muted' }, `Couldn't list your projects (${err.message}). Paste a path starting with ~ or /.`));
      });
    sync();
    return { id: 'hire', el: shell.el, focus: () => search.focus({ preventScroll: true }) };
  }

  // -------------------------------------------------------------------------------------
  // Personnel files

  private archive(): Panel {
    const { backend, toasts, sfx, store, actions } = this.deps;
    const shell = panelShell({ title: 'Personnel files', theme: 'files', dock: true, onClose: () => this.close() });
    const search = el('input', { class: 'co-input', attrs: { type: 'search', placeholder: 'Search past sessions', 'aria-label': 'Search past sessions', autocomplete: 'off', spellcheck: 'false' } });
    const list = el('div', { class: 'co-list' }, el('p', { class: 'co-muted' }, 'Opening the filing cabinet…'));
    shell.body.append(search, list);
    let all: PastSession[] = [];
    let loaded = false;
    /** Call-backs in flight: their rows keep saying "Calling…" through re-renders. */
    const calling = new Set<string>();
    let shownKey = '';

    const isLive = (s: PastSession) => s.live || !!store.get(s.sessionId);

    const callBack = async (s: PastSession) => {
      if (calling.has(s.sessionId)) return;
      calling.add(s.sessionId);
      render(true);
      // Their arrival gets this toast, not the generic "clocked in" (registered before the reply can race it).
      toasts.expect(s.sessionId, 'arrive', (e) => `Welcome back, ${e.displayName}!`);
      const r = await backend.rehire(s.sessionId);
      calling.delete(s.sessionId);
      if (r.ok) {
        sfx.fanfare();
        toasts.show('Called back in.', 'good', 4000, "They're on their way.");
        if (this.current?.el === shell.el) this.close();
        return;
      }
      toasts.forget(s.sessionId, 'arrive');
      render(true);
      toasts.show("Couldn't call them back", 'bad', 7000, r.error);
    };

    /** Rows change on load, search, a call-back, or someone in them walking in or out; nothing else. */
    const render = (force = false) => {
      if (!loaded) return;
      const q = search.value.trim().toLowerCase();
      const rows = all.filter((s) => !q || `${s.title ?? ''} ${s.project} ${s.lastPrompt ?? ''}`.toLowerCase().includes(q)).slice(0, 60);
      const key = `${q}|${rows.map((s) => `${s.sessionId}:${isLive(s) ? 1 : 0}:${calling.has(s.sessionId) ? 1 : 0}`).join()}`;
      if (!force && key === shownKey) return;
      shownKey = key;
      const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.session : undefined;
      if (!rows.length) {
        list.replaceChildren(el('p', { class: 'co-muted' }, all.length ? `No files match "${search.value.trim()}".` : 'No past sessions yet. Finished sessions end up here.'));
        return;
      }
      list.replaceChildren(
        ...rows.map((s) => {
          const live = isLive(s);
          let side: HTMLElement;
          if (live) {
            side = button('Go to them', {
              small: true,
              onClick: () => {
                this.close();
                actions.walkTo(s.sessionId);
              },
            });
          } else {
            const b = labelled('primary', 'Call back in');
            b.btn.classList.add('co-btn--small');
            if (calling.has(s.sessionId)) {
              holdDisabled(b.btn);
              b.set('Calling…', true);
            }
            b.btn.addEventListener('click', () => void callBack(s));
            side = needsServer(b.btn);
          }
          side.dataset.session = s.sessionId;
          const title = s.title ?? (s.lastPrompt ? truncate(s.lastPrompt, 60) : 'Untitled session');
          const meta = [s.project, ago(s.lastActive), s.costUSD !== undefined ? fmtMoney(s.costUSD) : ''].filter(Boolean).join(', ');
          return el(
            'div',
            { class: `co-file${live ? ' is-live' : ''}` },
            el('span', { class: 'co-file__icon', html: icon('folder', 36) }),
            el('span', { class: 'co-file__main' }, el('span', { class: 'co-file__title', attrs: { title } }, title), el('span', { class: 'co-muted' }, live ? `${meta}. In the office.` : meta)),
            side,
          );
        }),
      );
      if (focused) list.querySelector<HTMLElement>(`[data-session="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    };
    search.addEventListener('input', () => render());
    backend
      .archive()
      .then((rows) => {
        all = rows;
        loaded = true;
        render(true);
      })
      .catch((err: Error) => list.replaceChildren(el('p', { class: 'co-error' }, `Couldn't open the cabinet: ${err.message}`)));
    const unsub = store.subscribe(() => render());
    return { id: 'archive', el: shell.el, focus: () => search.focus({ preventScroll: true }), dispose: unsub };
  }

  // -------------------------------------------------------------------------------------
  // Roster

  private roster(): Panel {
    const { store, actions } = this.deps;
    const shell = panelShell({ title: 'Roster', theme: 'roster', dock: true, onClose: () => this.close() });
    const hireBtn = button('Hire someone', { key: 'H', icon: 'hire', onClick: () => this.open('hire') });
    shell.foot.append(hireBtn);
    shell.el.append(shell.foot);

    let shownKey = '';
    /** The time in each row ticks in place: no rebuild, so focus and screen readers stay put. */
    const tickTimes = () => {
      const now = store.now();
      for (const t of shell.body.querySelectorAll<HTMLElement>('.co-person__time')) {
        const e = store.get(t.dataset.session ?? '');
        if (e) t.textContent = since(e, now);
      }
    };
    const render = () => {
      const people = [...store.employees].sort((a, b) => a.displayName.localeCompare(b.displayName));
      const key = people.map((e) => `${e.sessionId}|${e.state}|${e.hosted}|${e.displayName}|${e.project}|${lineFor(e)}|${e.interns.filter((i) => i.active).length}`).join('\n');
      if (key === shownKey) return tickTimes();
      shownKey = key;
      const focused = shell.body.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.session : undefined;
      const scroll = shell.body.scrollTop;
      const now = store.now();
      if (!people.length) {
        shell.body.replaceChildren(el('div', { class: 'co-empty' }, el('strong', null, "Nobody's in yet."), el('span', { class: 'co-muted' }, 'Hire someone at reception, or run claude in any terminal.')));
        return;
      }
      const kids: Child[] = [];
      for (const state of STATE_ORDER) {
        const group = people.filter((e) => e.state === state);
        if (!group.length) continue;
        if (state === 'needs-you') group.sort((a, b) => a.stateSince - b.stateSince);
        kids.push(el('h3', { class: 'co-section co-section--state' }, el('span', { html: stateBadge(state, true) }), `${STATE_WORD[state]} (${group.length})`));
        kids.push(
          el(
            'div',
            { class: 'co-list' },
            ...group.map((e) => {
              const n = e.interns.filter((i) => i.active).length;
              const row = personRow({
                face: employeeFace(e.sessionId, e.hosted, { size: 40 }),
                name: e.displayName,
                line: `${e.project}: ${lineFor(e)}`,
                side: [
                  el('span', { class: 'co-person__time', attrs: { 'data-session': e.sessionId } }, since(e, now)),
                  n ? el('span', { class: 'co-mini', attrs: { title: `${n} intern${n === 1 ? '' : 's'} helping` } }, `+${n}`) : null,
                ],
                onClick: () => {
                  this.close();
                  actions.walkTo(e.sessionId);
                },
              });
              row.dataset.session = e.sessionId;
              row.setAttribute('aria-label', `Go to ${e.displayName}, ${STATE_WORD[e.state].toLowerCase()}: ${lineFor(e)}`);
              return row;
            }),
          ),
        );
      }
      shell.body.replaceChildren(...(kids as Node[]));
      shell.body.scrollTop = scroll;
      if (focused) shell.body.querySelector<HTMLElement>(`[data-session="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    };
    render();
    const unsub = store.subscribe(render);
    const tick = window.setInterval(tickTimes, 1000);
    return {
      id: 'roster',
      el: shell.el,
      dispose: () => {
        unsub();
        window.clearInterval(tick);
      },
    };
  }

  // -------------------------------------------------------------------------------------
  // Help

  private help(): Panel {
    const shell = panelShell({ title: 'How to manage', theme: 'help', dock: true, onClose: () => this.close() });
    // The sound section follows the speakers while Help is open, and lets go when it closes.
    const sound = new AbortController();
    const keys: [string[], string][] = [
      [['W', 'A', 'S', 'D'], 'Walk (the arrows work too)'],
      [['Shift'], 'Run'],
      [['Space'], 'Jump'],
      [['Drag', 'Wheel'], 'Look around, zoom'],
      [['V'], 'First or third person'],
      [['E'], 'Talk to someone, answer them, use reception, the files, the boards, the coffee'],
      [['E'], 'At an empty desk: use the computer, your own shell in your home folder'],
      [['E'], 'At the boss desk: your laptop plays your Spotify on the office speakers'],
      [['Q'], 'Go to whoever has needed you longest'],
      [['T'], "Look at someone's live terminal, right where you stand"],
      [['R'], 'Roster'],
      [['H'], 'Hire someone'],
      [['M'], 'All sound on or off, music too'],
      [['Esc'], 'Close the panel. At a computer, Esc goes to the terminal'],
      [['Ctrl', '`'], 'At their computer: switch between Claude and their shell'],
      [['Ctrl', ']'], 'Stand up from a computer (or press Stand up)'],
    ];
    const states: [EmployeeState, string][] = [
      ['working', 'Typing, reading, running things, thinking'],
      ['needs-you', 'Hand up: waiting on a permission or an answer'],
      ['idle', 'Finished their turn, ready for the next task'],
      ['sleeping', 'Free for 15 minutes or more'],
      ['starting', 'Just walked in, getting settled'],
    ];
    const calm = el('input', { attrs: { type: 'checkbox' } });
    calm.checked = document.documentElement.classList.contains('co-calm');
    calm.addEventListener('change', () => applyCalm(calm.checked));
    const thoughts = el('input', { attrs: { type: 'checkbox' } });
    thoughts.checked = thoughtsOn();
    thoughts.addEventListener('change', () => setThoughtsOn(thoughts.checked));
    // Regulars: NPC coworkers at the free desks (chars/regulars.ts), saved per browser.
    const density = readRegularsDensity();
    const presets: Record<RegularsPreset, [string, string]> = {
      off: ['Off', 'Just sessions'],
      some: ['Some', 'About half'],
      lively: ['Lively', 'All desks but one'],
    };
    const regulars = el(
      'div',
      { class: 'co-regulars', attrs: { role: 'radiogroup', 'aria-label': 'Office regulars' } },
      ...REGULARS_PRESETS.map((p) => {
        const input = el('input', { attrs: { type: 'radio', name: 'co-regulars', value: p } });
        input.checked = density === p;
        input.addEventListener('change', () => input.checked && setRegularsDensity(p));
        return el('label', { class: 'co-choice' }, input, el('span', null, presets[p][0], el('small', null, presets[p][1])));
      }),
    );
    // Graphics presets (engine/graphics.ts), saved per browser; the engine switches live.
    const gfxNow = readGraphics();
    const gfxLabels: Record<GraphicsPreset, [string, string]> = {
      potato: ['Potato', 'No shadows or effects'],
      low: ['Low', 'Basic shadows'],
      medium: ['Medium', 'Softer light'],
      high: ['High', 'The full look'],
      ultra: ['Ultra', 'Sharpest shadows'],
    };
    const graphics = el(
      'div',
      { class: 'co-graphics', attrs: { role: 'radiogroup', 'aria-label': 'Graphics' } },
      ...GRAPHICS_PRESETS.map((p) => {
        const input = el('input', { attrs: { type: 'radio', name: 'co-graphics', value: p } });
        input.checked = gfxNow === p;
        input.addEventListener('change', () => input.checked && setGraphics(p));
        return el('label', { class: 'co-choice' }, input, el('span', null, gfxLabels[p][0], el('small', null, gfxLabels[p][1])));
      }),
    );
    // The receptionist has her own switch: Off above sends the crowd home, not her.
    const frontDesk = el('input', { attrs: { type: 'checkbox' } });
    frontDesk.checked = readReceptionist();
    frontDesk.addEventListener('change', () => setReceptionist(frontDesk.checked));
    shell.body.append(
      el('dl', { class: 'co-rows co-keys' }, ...keys.map(([ks, what]) => el('div', { class: 'co-row' }, el('dt', null, ...ks.map((k) => keyCap(k))), el('dd', null, what)))),
      el('h3', { class: 'co-section' }, 'Reading the room'),
      el(
        'dl',
        { class: 'co-rows co-legend' },
        ...states.map(([s, what]) => el('div', { class: 'co-row' }, el('dt', null, el('span', { html: stateBadge(s, true) }), STATE_WORD[s]), el('dd', null, what))),
      ),
      el('p', { class: 'co-muted' }, '“Hot desk” on a nameplate: your shell is still running at that desk. Press E there to pick up where you left off; Shut down ends it.'),
      el('label', { class: 'co-choice co-choice--toggle' }, calm, el('span', null, 'Calmer motion', el('small', null, 'No bobbing, breathing, wiggles or confetti; pops become fades.'))),
      el(
        'label',
        { class: 'co-choice co-choice--toggle' },
        thoughts,
        el('span', null, 'Thought bubbles', el('small', null, "Now and then someone thinks out loud about what they're doing. Off: nobody does, and the office stops asking for thoughts.")),
      ),
      // Music and sound (audio/controls.ts): the café music, and the music and sound-effect volumes.
      soundSettings({ signal: sound.signal }),
      el('h3', { class: 'co-section' }, 'Graphics'),
      el('p', { class: 'co-muted' }, 'Lower settings run smoother on slower computers. It changes right away.'),
      graphics,
      el('h3', { class: 'co-section' }, 'Office regulars'),
      el('p', { class: 'co-muted' }, 'Coworkers who aren’t Claude sessions fill the free desks, and give one up whenever a session needs it.'),
      regulars,
      el('label', { class: 'co-choice co-choice--toggle' }, frontDesk, el('span', null, 'Mabel on the front desk', el('small', null, 'Waves everyone in and out, takes calls. Stays when the regulars are off.'))),
      el('div', { class: 'co-help__tips' }, button('Show tips again', { small: true, onClick: () => { this.close(); coachReset(); } })),
      el('p', { class: 'co-muted' }, "Everyone with the orange lanyard is a live Claude Code session on this machine. Sit at anyone's computer for a shell in their folder; for the ones you hire here (they run in tmux), Claude's own screen too."),
    );
    return { id: 'help', el: shell.el, dispose: () => sound.abort() };
  }

  // -------------------------------------------------------------------------------------
  // Team Room (the wall board's twin)

  private teamRoom(): Panel {
    const { store, actions } = this.deps;
    const shell = panelShell({ title: 'Team Room', theme: 'help', dock: true, onClose: () => this.close() });
    let shown: unknown = undefined;
    let shownAt = 0;
    /** Only new numbers redraw (focus and screen readers stay put); reset countdowns refresh every 30 s. */
    const render = (force = false) => {
      const stats = store.stats;
      if (!force && stats === shown && Date.now() - shownAt < 30_000) return;
      shown = stats;
      shownAt = Date.now();
      if (!stats) {
        shell.body.replaceChildren(el('p', { class: 'co-muted' }, 'No numbers yet. The server sends them every few seconds.'));
        return;
      }
      renderTeamStats(shell.body, stats, {
        now: store.now(),
        face: (sid) => this.faceFor(sid, 28),
        onGo: (sid) => {
          this.close();
          actions.walkTo(sid);
        },
      });
    };
    render(true);
    const unsub = store.subscribe(() => render());
    const tick = window.setInterval(() => render(), 5000);
    return {
      id: 'stats',
      el: shell.el,
      dispose: () => {
        unsub();
        window.clearInterval(tick);
      },
    };
  }

  // -------------------------------------------------------------------------------------
  // Intern desk

  private internDesk(): Panel {
    const { store, actions } = this.deps;
    const shell = panelShell({ title: 'Intern desk', theme: 'interns', dock: true, onClose: () => this.close() });
    let shownKey = '';
    const render = () => {
      const rows = store.employees.flatMap((boss) => boss.interns.map((i) => ({ boss, i })));
      rows.sort((a, b) => Number(b.i.active) - Number(a.i.active) || a.boss.displayName.localeCompare(b.boss.displayName));
      const key = rows.map(({ boss, i }) => `${i.id}|${i.active}|${i.type}|${i.description}|${boss.sessionId}|${boss.displayName}|${boss.hosted}`).join('\n');
      if (key === shownKey) return;
      shownKey = key;
      const focused = shell.body.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.intern : undefined;
      if (!rows.length) {
        shell.body.replaceChildren(el('div', { class: 'co-empty' }, el('strong', null, 'No interns right now.'), el('span', { class: 'co-muted' }, 'They show up when someone hands off work.')));
        return;
      }
      shell.body.replaceChildren(
        el(
          'div',
          { class: 'co-list' },
          ...rows.map(({ boss, i }) => {
            const row = personRow({
              face: internFace(i.id, shirtOf(boss.sessionId, boss.hosted), { size: 40 }),
              name: internType(i.type),
              line: truncate(i.description || 'Helping out', 70),
              side: [el('span', { class: 'co-person__boss', html: employeeFace(boss.sessionId, boss.hosted, { size: 24 }) }), `for ${boss.displayName}`],
              onClick: () => {
                this.close();
                actions.walkTo(boss.sessionId);
              },
            });
            row.classList.toggle('is-waiting', !i.active);
            row.dataset.intern = i.id;
            row.setAttribute('aria-label', `${internType(i.type)}, ${i.active ? 'working' : 'waiting'}, for ${boss.displayName}. Go to ${boss.displayName}.`);
            return row;
          }),
        ),
      );
      if (focused) shell.body.querySelector<HTMLElement>(`[data-intern="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    };
    render();
    const unsub = store.subscribe(render);
    return { id: 'interns', el: shell.el, dispose: unsub };
  }
}
