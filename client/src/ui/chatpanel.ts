// Chat with an employee, like in Claude Code: their conversation as a chat (assistant text as
// light markdown, tool steps as small chips), a composer that types into their real session,
// the ask card inline when they need you, and "Bring into the office" for sessions that were
// started in a terminal of their own.
//
//   const view = openChat(container, employee, httpChatApi({ sit: (id) => sitDown(id), onClose }));
//   store.onChange(() => view.update(store.get(id)!));   …   view.close();
import type { AnswerRequest, ApiResult, ChatLine, Employee } from '../../../shared/protocol';
import { renderAsk, type AskView } from './askpanel';
import { bus } from './bus';
import type { TermKind } from '../net';
import { lastTab, setLastTab } from '../termtab';
import { isTabSwitch, STATUS_TEXT, termTabs, type TermStatus, type TerminalView, type TerminalViewOptions } from './terminal';
import { button, keyCap, panelShell } from './components';
import { tildify } from './dom';
import { el, fmtTime, fmtWait } from './el';
import { faceSvg } from './faces';
import { employeeLooks } from '../chars/looks';
import { icon, stateGlyph, STATE_WORD, type IconName } from './icons';
import { enhanceMarkdown, renderMarkdown } from './markdown';
import { markNoteSeen, noteSeen } from './notes';
import { holdDisabled, isOffline, needsServer, releaseDisabled } from './offline';
import './theme.css';

export interface ChatApi {
  /** GET /api/session/:id/chatter: `{ n }` for the first load, `{ after: lastSeq }` while polling. */
  chatter(sessionId: string, q: { n?: number; after?: number }): Promise<ChatLine[]>;
  /** POST /api/say (hosted only; 409 while they need you). */
  say(sessionId: string, text: string): Promise<ApiResult>;
  /** POST /api/interrupt: Esc in their terminal (hosted only). */
  interrupt(sessionId: string): Promise<ApiResult>;
  /** POST /api/adopt: bring an external session into the office once it exits its own terminal. */
  adopt(sessionId: string): Promise<ApiResult>;
  /** POST /api/answer, for the inline ask card. */
  answer(req: AnswerRequest): Promise<ApiResult>;
  /** "Sit at their computer": the full terminal (the existing flow). */
  sit(sessionId: string): void;
  /** A live terminal for the quick look (Terminal mode). Without it, Terminal mode says it isn't available. */
  openTerminal?(sessionId: string, opts: TerminalViewOptions): TerminalView;
  /** The close button. Default: the view closes itself. */
  onClose?(): void;
}

/** The ChatApi over the office's REST endpoints (same origin). */
export function httpChatApi(hooks: { sit(sessionId: string): void; onClose?(): void }): ChatApi {
  const post = async (path: string, body: unknown): Promise<ApiResult> => {
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await r.json().catch(() => null)) as ApiResult | null;
      if (!r.ok) return { ok: false, error: data?.error ?? `${r.status} ${r.statusText}` };
      return data ?? { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
  return {
    async chatter(sessionId, q) {
      const p = new URLSearchParams();
      if (q.n !== undefined) p.set('n', String(q.n));
      if (q.after !== undefined) p.set('after', String(q.after));
      const r = await fetch(`/api/session/${encodeURIComponent(sessionId)}/chatter?${p}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return (await r.json()) as ChatLine[];
    },
    say: (sessionId, text) => post('/api/say', { sessionId, text }),
    interrupt: (sessionId) => post('/api/interrupt', { sessionId }),
    adopt: (sessionId) => post('/api/adopt', { sessionId }),
    answer: (req) => post('/api/answer', req),
    sit: hooks.sit,
    onClose: hooks.onClose,
  };
}

export interface ChatOptions {
  /** Fixed in the right dock (the game). Off for inline use (the UI kit). */
  dock?: boolean;
  /** Poll interval for new lines. Default 1200 ms. */
  pollMs?: number;
  /** Clock override (the UI kit freezes time). */
  now?: () => number;
  /** Start in Terminal mode (T from the office). */
  mode?: ChatMode;
  /** Chat ⇄ Terminal flipped (the panel changed width). */
  onMode?(mode: ChatMode): void;
  /** The home folder, for "~/…" paths on the Shell tab. */
  home?: string;
}

/** Chat: the conversation. Terminal: their live terminal, right here (the quick look). */
export type ChatMode = 'chat' | 'terminal';

export interface ChatView {
  readonly el: HTMLElement;
  update(employee: Employee): void;
  /** Put the cursor in the composer (only when the manager opened the chat themselves). */
  focus(): void;
  /** Their session ended: say so, keep the history readable, drop the composer. */
  end(text: string): void;
  getMode(): ChatMode;
  setMode(mode: ChatMode): void;
  close(): void;
}

/** The quick look takes keys this long after it opens (the T that opened it is long gone by then). */
const TERM_HOLD_MS = 400;
/** A gap this long between messages gets a time label. */
const TIME_GAP_MS = 10 * 60_000;
/** Runs of this many tool steps or more collapse into one chip. */
const COLLAPSE_AT = 3;
const PAGE_KEYS = new Set([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

function stepIcon(tool = ''): IconName {
  if (/^(Bash|BashOutput|KillShell)$/.test(tool)) return 'terminal';
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return 'pencil';
  if (/^(Read|Grep|Glob|LS)$/.test(tool)) return 'folder';
  if (/^(WebFetch|WebSearch)$/.test(tool) || tool.startsWith('mcp__')) return 'globe';
  if (/^(Agent|Task)$/.test(tool)) return 'intern';
  if (/^(TodoWrite|ExitPlanMode)$/.test(tool)) return 'plan';
  return 'model';
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const tsOf = (l: ChatLine) => (l.ts ? Date.parse(l.ts) : NaN);

interface Pending {
  text: string;
  node: HTMLElement;
  status: HTMLElement;
  state: 'sending' | 'sent' | 'failed';
  at: number;
}

export function openChat(container: HTMLElement, employee: Employee, api: ChatApi, opts: ChatOptions = {}): ChatView {
  const now = opts.now ?? Date.now;
  let e = employee;
  const id = e.sessionId;
  const looks = () => employeeLooks(id, e.hosted);
  let closed = false;
  let lastSeq = -1;
  let loaded = false;
  let pollTimer = 0;
  let pollFailures = 0;
  let askView: AskView | null = null;
  let askId: string | null = null;
  let lastMsgTs = NaN;
  let lastRole: ChatLine['role'] | 'system' | null = null;
  let steps: { lines: ChatLine[]; el: HTMLElement; open: boolean } | null = null;
  let emptyNote: HTMLElement | null = null;
  let ended = false;
  let faceHosted = e.hosted;
  let mode: ChatMode = 'chat';
  /**
   * Terminal mode's tab: their Claude session (hosted only) or their shell (anyone). Shell when
   * there's no Claude here; Claude while they need you; else where you last looked.
   */
  let termTab: TermKind = !e.hosted ? 'shell' : e.state === 'needs-you' ? 'claude' : (lastTab(id) ?? 'claude');
  /** Each tab's terminal, opened the first time the tab is shown. */
  let termViews: Partial<Record<TermKind, TerminalView>> = {};
  const termStatusOf: Partial<Record<TermKind, TermStatus>> = {};
  /** Bumped when the feed restarts, so answers to older requests are dropped. */
  let gen = 0;
  const pending: Pending[] = [];

  // ---------------------------------------------------------------- frame

  const shell = panelShell({
    title: e.displayName,
    theme: 'person',
    band: looks().shirt,
    face: faceSvg(looks(), { size: 64 }),
    dock: opts.dock,
    onClose: () => (api.onClose ? api.onClose() : view.close()),
  });
  const panel = shell.el;
  panel.classList.add('co-panel--chat');
  panel.setAttribute('aria-label', `Chat with ${e.displayName}`);

  const stateChip = el('span', { class: 'co-chip co-chip--fill co-chat__state' });
  const where = el('span', { class: 'co-chat__where' });
  const interruptBtn = needsServer(button('Interrupt', { small: true, icon: 'stop', onClick: () => void interrupt() }));
  const sitBtn = needsServer(button('Sit at their computer', { small: true, icon: 'terminal', onClick: () => api.sit(id) }));
  // Chat ⇄ Terminal (T): the same person, their conversation or their live terminal.
  const segChat = el('button', { class: 'co-seg__btn', attrs: { type: 'button', 'aria-pressed': 'true' } }, el('span', { html: icon('chat', 18) }), 'Chat');
  const segTerm = el(
    'button',
    { class: 'co-seg__btn', attrs: { type: 'button', 'aria-pressed': 'false', 'aria-keyshortcuts': 'T' } },
    el('span', { html: icon('terminal', 18) }),
    'Terminal',
    el('kbd', { class: 'co-key' }, 'T'),
  );
  segChat.addEventListener('click', () => setMode('chat'));
  segTerm.addEventListener('click', () => setMode('terminal'));
  const seg = el('div', { class: 'co-seg', attrs: { role: 'group', 'aria-label': 'Show' } }, segChat, segTerm);
  const head = el(
    'div',
    { class: 'co-chat__head' },
    el('div', { class: 'co-chat__meta' }, stateChip, where),
    el('div', { class: 'co-chat__actions' }, seg, interruptBtn, sitBtn),
  );
  panel.insertBefore(head, shell.body);

  const feed = shell.body;
  feed.classList.add('co-chat__feed');
  feed.setAttribute('tabindex', '0');
  const msgs = el('div', { class: 'co-chat__msgs', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': `Conversation with ${e.displayName}` } });
  const askSlot = el('div', { class: 'co-chat__ask' });
  const waitNote = el('div', { class: 'co-chat__note', attrs: { hidden: true } });
  const typingLabel = el('span', { class: 'co-typing__label' });
  const typing = el(
    'div',
    { class: 'co-typing', attrs: { hidden: true, 'aria-hidden': 'true' } },
    el('span', { class: 'co-typing__dots' }, el('i'), el('i'), el('i')),
    typingLabel,
  );
  const loading = el('p', { class: 'co-chat__empty' }, 'Opening the conversation…');
  const jump = el('button', { class: 'co-chat__jump co-btn co-btn--small', attrs: { type: 'button', hidden: true } }, 'New messages');
  jump.addEventListener('click', () => scrollToEnd(true));
  feed.append(loading, msgs, askSlot, waitNote, typing, jump);

  // Terminal mode: their live terminals (Claude | Shell tabs on the screen), or why there isn't one.
  const termTabsCtl = termTabs((k, focus) => showTab(k, focus));
  const termWhere = el('span', { class: 'co-chat__termwhere', attrs: { hidden: true } });
  const termStatus = el('span', { class: 'co-chat__termstatus' });
  const termLed = el('i', { class: 'term-led', attrs: { 'aria-hidden': 'true' } });
  const termRetry = button('Try again', { small: true, onClick: () => termViews[termTab]?.retry() });
  const termFresh = button('New shell', { small: true, onClick: () => termViews.shell?.retry() });
  termRetry.hidden = termFresh.hidden = true;
  const termHint = el('span', { class: 'co-chat__termhint' });
  // Esc here leaves the quick look (unlike sitting down, where Esc goes to Claude), so stopping
  // them has its own button right by the terminal.
  const termInterrupt = needsServer(button('Interrupt', { small: true, icon: 'stop', onClick: () => void interrupt() }));
  const termNote = el('div', { class: 'co-chat__termnote', attrs: { hidden: true } });
  const termSlot = el('div', { class: 'co-chat__termslot' }, termNote);
  const termBar = el('div', { class: 'co-chat__termbar' }, termWhere, termLed, termStatus, termHint, termRetry, termFresh, termInterrupt);
  const termPane = el('div', { class: 'co-chat__term', attrs: { hidden: true } }, termTabsCtl.el, termSlot, termBar);
  // Ctrl+` and Ctrl+] from the tabs and the bar's buttons too (inside a terminal, its onKey has
  // them first). From out here a switch keeps you on the tabs: the next Enter must not land in a
  // terminal. Esc there is the panel host's: back to the chat as well.
  termPane.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented) return;
    if (isTabSwitch(ev)) {
      ev.preventDefault();
      if (ev.repeat) return;
      showTab(termTab === 'claude' ? 'shell' : 'claude', false);
      termTabsCtl.focus();
    } else if (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']')) {
      ev.preventDefault();
      setMode('chat');
      shell.title.focus({ preventScroll: true });
    }
  });
  feed.after(termPane);

  // Composer (hosted) and the adopt card (external): both live in the footer.
  const input = el('textarea', {
    class: 'co-input co-chat__input',
    attrs: { rows: 1, maxlength: 8000, 'aria-label': `Message ${e.displayName}`, placeholder: `Message ${e.displayName}…`, spellcheck: 'true' },
  });
  const sendBtn = needsServer(el('button', { class: 'co-btn co-btn--primary co-chat__send', attrs: { type: 'button', 'aria-label': 'Send', disabled: true }, html: icon('send', 22) }));
  const hint = el('p', { class: 'co-chat__hint' });
  const composer = el('div', { class: 'co-chat__composer' }, el('div', { class: 'co-chat__row' }, input, sendBtn), hint);
  const adoptBtn = needsServer(button('Bring into the office', { kind: 'primary', onClick: () => void adopt() }));
  const adoptText = el('p', { class: 'co-chat__adopt-text' });
  const adoptCard = el('div', { class: 'co-chat__adopt' }, adoptText, adoptBtn);
  shell.foot.append(composer, adoptCard);
  panel.append(shell.foot);

  // ---------------------------------------------------------------- feed

  const nearEnd = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  function scrollToEnd(force = false): void {
    if (force || nearEnd()) {
      feed.scrollTop = feed.scrollHeight;
      jump.hidden = true;
    }
  }
  feed.addEventListener('scroll', () => {
    if (nearEnd()) jump.hidden = true;
  });
  /** While an ask is open, its top (the question and its countdown) is what must be in view. */
  function revealAsk(): void {
    feed.scrollTop += askSlot.getBoundingClientRect().top - feed.getBoundingClientRect().top - 12;
    jump.hidden = true;
  }
  const settle = () => (askView ? revealAsk() : scrollToEnd(true));

  function timeLabel(ts: number): void {
    if (Number.isNaN(ts)) return;
    if (!Number.isNaN(lastMsgTs) && ts - lastMsgTs < TIME_GAP_MS) return;
    msgs.append(el('p', { class: 'co-chat__time' }, fmtTime(ts)));
  }

  type Steps = { lines: ChatLine[]; el: HTMLElement; open: boolean };
  /** Draw one run of tool steps (any run, not just the latest: older ones can be expanded too). */
  function renderSteps(s: Steps): void {
    const chip = (l: ChatLine) =>
      el('span', { class: 'co-step', attrs: { title: l.tool ?? '' } }, el('span', { html: icon(stepIcon(l.tool), 16) }), el('span', { class: 'co-step__text' }, l.text));
    if (s.lines.length < COLLAPSE_AT || s.open) {
      const kids: HTMLElement[] = s.lines.map(chip);
      if (s.lines.length >= COLLAPSE_AT) {
        const hide = el('button', { class: 'co-step co-step--toggle', attrs: { type: 'button', 'aria-expanded': 'true' } }, 'Hide steps');
        hide.addEventListener('click', () => {
          s.open = false;
          renderSteps(s);
        });
        kids.push(hide);
      }
      s.el.replaceChildren(...kids);
    } else {
      const last = s.lines[s.lines.length - 1];
      const toggle = el(
        'button',
        { class: 'co-step co-step--toggle', attrs: { type: 'button', 'aria-expanded': 'false', title: 'Show every step' } },
        el('span', { html: icon(stepIcon(last.tool), 16) }),
        el('b', null, `${s.lines.length} steps`),
        el('span', { class: 'co-step__text' }, `last: ${last.text}`),
      );
      toggle.addEventListener('click', () => {
        s.open = true;
        renderSteps(s);
      });
      s.el.replaceChildren(toggle);
    }
  }

  function addLine(l: ChatLine): void {
    emptyNote?.remove();
    emptyNote = null;
    if (l.role === 'tool') {
      if (!steps) {
        steps = { lines: [], el: el('div', { class: 'co-steps' }), open: false };
        msgs.append(steps.el);
      }
      steps.lines.push(l);
      renderSteps(steps);
      return;
    }
    steps = null;
    const ts = tsOf(l);
    timeLabel(ts);
    if (!Number.isNaN(ts)) lastMsgTs = ts;
    if (l.role === 'user') {
      msgs.append(userBubble(l.text, ts));
    } else {
      const showFace = lastRole !== 'assistant';
      const body = el('div', { class: 'co-msg__body co-md', html: renderMarkdown(l.text) });
      msgs.append(
        el(
          'div',
          { class: `co-msg co-msg--assistant${showFace ? '' : ' co-msg--cont'}`, attrs: { title: fmtTime(ts) } },
          showFace ? el('span', { class: 'co-msg__face', html: faceSvg(looks(), { size: 28 }) }) : null,
          body,
        ),
      );
      enhanceMarkdown(body);
    }
    lastRole = l.role;
  }

  function userBubble(text: string, ts = NaN): HTMLElement {
    const body = el('div', { class: 'co-msg__body' });
    // Slash commands read as commands.
    const m = /^(\/[\w:-]+)([\s\S]*)$/.exec(text);
    if (m) body.append(el('code', { class: 'co-msg__cmd' }, m[1]), m[2]);
    else body.append(text);
    return el('div', { class: 'co-msg co-msg--user', attrs: { title: fmtTime(ts) } }, body);
  }

  function systemLine(text: string, tone: 'info' | 'bad' = 'info'): void {
    steps = null;
    lastRole = 'system';
    msgs.append(el('p', { class: `co-chat__system${tone === 'bad' ? ' is-bad' : ''}` }, text));
    scrollToEnd();
  }

  function addLines(lines: ChatLine[]): void {
    const fresh = lines.filter((l) => l.seq > lastSeq).sort((a, b) => a.seq - b.seq);
    if (!fresh.length) return;
    const stick = nearEnd();
    for (const l of fresh) {
      if (l.role === 'user') reconcile(l.text);
      addLine(l);
      lastSeq = Math.max(lastSeq, l.seq);
    }
    // Pending bubbles stay last, after whatever the feed brought in.
    for (const p of pending) msgs.append(p.node);
    if (stick) settle();
    else jump.hidden = false;
  }

  /** The feed brought our message back: drop the optimistic bubble. */
  function reconcile(text: string): void {
    const i = pending.findIndex((p) => p.state !== 'failed' && norm(p.text) === norm(text));
    if (i < 0) return;
    pending[i].node.remove();
    pending.splice(i, 1);
  }

  async function load(): Promise<void> {
    const g = gen;
    try {
      const lines = await api.chatter(id, { n: 60 });
      if (closed || g !== gen) return;
      loaded = true;
      loading.remove();
      addLines(lines);
      if (!lines.length) {
        emptyNote = el('p', { class: 'co-chat__empty' }, e.hosted ? `No messages yet. Say hi to ${e.displayName}!` : 'Nothing said yet.');
        msgs.append(emptyNote);
      }
      settle();
    } catch (err) {
      if (closed || g !== gen) return;
      loading.textContent = `Couldn't open the conversation: ${err instanceof Error ? err.message : String(err)}. Retrying…`;
    }
    schedule();
  }

  /** Start the feed over: a session that left and came back (moved in, called back) numbers its lines from 1 again. */
  function restartFeed(): void {
    gen++;
    window.clearTimeout(pollTimer);
    loaded = false;
    lastSeq = -1;
    steps = null;
    lastRole = null;
    lastMsgTs = NaN;
    emptyNote = null;
    msgs.replaceChildren();
    loading.textContent = 'Opening the conversation…';
    if (!loading.isConnected) msgs.before(loading);
    void load();
  }

  async function poll(): Promise<void> {
    if (closed || ended) return;
    if (!loaded) return load();
    const g = gen;
    try {
      // A busy turn can add more than the server's default 12 lines between polls.
      const lines = await api.chatter(id, { after: lastSeq, n: 120 });
      if (closed || g !== gen) return;
      addLines(lines);
      pollFailures = 0;
    } catch {
      if (closed || g !== gen) return;
      pollFailures++;
      if (pollFailures === 3) systemLine('Lost the conversation feed. Still trying…', 'bad');
    }
    // A sent message that never echoes back (some slash commands don't) settles after 20 s.
    for (const p of [...pending]) if (p.state === 'sent' && now() - p.at > 20_000) markDelivered(p);
    renderState();
    schedule();
  }

  function schedule(): void {
    window.clearTimeout(pollTimer);
    if (!closed && !ended) pollTimer = window.setTimeout(() => void poll(), opts.pollMs ?? 1200);
  }

  // ---------------------------------------------------------------- terminal mode

  /** The bar follows whichever tab is showing. */
  function termChrome(): void {
    const shellTab = termTab === 'shell';
    const st = termViews[termTab] ? termStatusOf[termTab] : undefined;
    termTabsCtl.set(termTab);
    termStatus.textContent = st === 'ended' && shellTab ? 'Shell closed' : st ? STATUS_TEXT[st] : '';
    // No light where there's no screen (their Claude tab when they run in your own terminal).
    termLed.hidden = !st;
    termLed.classList.toggle('on', st === 'connected');
    termRetry.hidden = st !== 'lost';
    termFresh.hidden = !shellTab || st !== 'ended';
    termWhere.hidden = !shellTab;
    termWhere.textContent = shellTab ? `Shell in ${tildify(e.cwd, opts.home ?? '')}` : '';
    // (With no screen showing, Esc has nothing to be kept from.)
    termHint.replaceChildren(keyCap('Esc'), !termViews[termTab] ? ' back to the chat' : shellTab ? ' back to the chat (not to the shell)' : ' back to the chat (not to Claude)');
    // Stopping Claude, right by their screen (only theirs: never on the Shell tab).
    termInterrupt.hidden = shellTab || !e.hosted || ended;
  }

  /** A tab's terminal. `hold`: live after a beat (or a click in it), never on the T that opened the quick look. */
  function openTermView(kind: TermKind, hold: boolean): TerminalView {
    const v = api.openTerminal!(id, {
      kind,
      hold,
      onKey: (ev) => {
        // Ctrl+` flips tabs (once per press: a held one never repeats into the other terminal).
        if (isTabSwitch(ev)) {
          if (ev.type === 'keydown' && !ev.repeat) showTab(termTab === 'claude' ? 'shell' : 'claude');
          return true;
        }
        // Esc (or Ctrl+]) leaves the quick look; everything else is typed into their terminal.
        const leave = (ev.key === 'Escape' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) || (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']'));
        if (leave && ev.type === 'keydown') {
          setMode('chat');
          shell.title.focus({ preventScroll: true });
        }
        return leave;
      },
      onStatus: (st) => {
        termStatusOf[kind] = st;
        if (kind === termTab) termChrome();
      },
      onEnd: (why, reason) => {
        if (why !== 'refused' || kind !== termTab) return;
        termStatusOf[kind] = 'lost';
        termChrome();
        termStatus.textContent = kind === 'shell' ? `No shell${reason ? `: ${reason}` : ''}` : `Can't open their terminal${reason ? `: ${reason}` : ''}`;
      },
    });
    termViews[kind] = v;
    termSlot.append(v.el);
    v.start();
    if (hold) {
      const release = () => {
        window.clearTimeout(holdTimer);
        v.el.removeEventListener('pointerdown', release);
        if (termViews[kind] === v) v.release();
      };
      const holdTimer = window.setTimeout(release, TERM_HOLD_MS);
      v.el.addEventListener('pointerdown', release);
    }
    return v;
  }

  /**
   * Fill the terminal pane for who they are now: the tab's live terminal, or why there isn't one.
   * `switched`: a tab switch (the new terminal is live at once; the switch's own keys never
   * repeat into it).
   */
  function renderTerm(switched = false): void {
    // Their session ended: Claude's screen goes. A shell stays until it closes by itself, so
    // you can finish typing there.
    if (ended) dropView('claude');
    const canAttach = !!api.openTerminal && (termTab === 'shell' ? !ended || !!termViews.shell : e.hosted && !ended);
    for (const [k, v] of Object.entries(termViews)) v.el.hidden = k !== termTab;
    termBar.hidden = !canAttach && ended;
    termNote.hidden = canAttach;
    // Rebuilt only when what it says changes (a roster update must not take its button's focus).
    const noteKey = canAttach ? '' : `${ended}|${e.hosted}|${!!e.otherOffice}|${!!e.adopting}|${e.pid}|${e.displayName}`;
    if (canAttach) termViews[termTab] ?? openTermView(termTab, !switched);
    else if (noteKey !== termNote.dataset.key) {
      termNote.dataset.key = noteKey;
      const parts = [
        el('span', { html: icon('terminal', 32) }),
        ended
          ? el('p', null, `${e.displayName}'s session has ended.`)
          : e.otherOffice
            ? el('p', null, el('strong', null, `${e.displayName} works in another office`), ", so there's no Claude screen here. Their Shell tab works.")
            : !e.hosted
              ? el(
                  'p',
                  null,
                  el('strong', null, `${e.displayName} runs in their own terminal`),
                  ` (pid ${e.pid}), so there's no Claude screen here. Their Shell tab works, or bring them into the office and you can look in any time.`,
                )
              : el('p', null, "Their terminal can't be shown here."),
        !e.hosted && !ended && !e.otherOffice
          ? e.adopting
            ? el('p', { class: 'co-muted' }, 'Waiting for them to type /exit in their terminal…')
            : needsServer(button('Bring into the office', { kind: 'primary', onClick: () => void adopt() }))
          : null,
      ];
      termNote.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
    }
    if (canAttach) termNote.dataset.key = '';
    termChrome();
  }

  /**
   * Show the tab you picked, and remember it for them (only where Claude could show); `focus`:
   * and type in it (a click, Ctrl+` in a terminal). With no screen there, the keyboard waits on
   * the tabs, never on a button a stray Space or Enter would press.
   */
  function showTab(kind: TermKind, focus = true): void {
    if (closed || mode !== 'terminal') return;
    termTab = kind;
    if (e.hosted) setLastTab(id, kind);
    renderTerm(true);
    const v = termViews[kind];
    v?.fit();
    v?.forgetHeld();
    if (!focus) return;
    if (v) v.focus();
    else termTabsCtl.focus();
  }

  /** One tab's terminal goes (its screen with it); if you were in it, the keyboard moves to the tabs. */
  function dropView(kind: TermKind): void {
    const v = termViews[kind];
    if (!v) return;
    const inside = v.el.contains(document.activeElement);
    v.dispose();
    delete termViews[kind];
    if (inside && mode === 'terminal') termTabsCtl.focus();
  }

  function setMode(next: ChatMode): void {
    if (closed || next === mode) return;
    mode = next;
    const term = mode === 'terminal';
    panel.classList.toggle('co-panel--term', term);
    feed.hidden = term;
    termPane.hidden = !term;
    segChat.setAttribute('aria-pressed', String(!term));
    segTerm.setAttribute('aria-pressed', String(term));
    // Terminal mode has its own Interrupt, right by their screen.
    interruptBtn.hidden = !e.hosted || ended || term;
    shell.foot.hidden = term || ended;
    if (term) {
      renderTerm();
      termViews[termTab]?.focus();
    } else {
      for (const v of Object.values(termViews)) v.dispose();
      termViews = {};
      scrollToEnd(true);
    }
    opts.onMode?.(mode);
  }

  // ---------------------------------------------------------------- composer

  const blocked = () => !e.hosted || e.state === 'needs-you';

  function syncComposer(): void {
    const empty = !input.value.trim();
    sendBtn.disabled = empty || blocked();
    hint.classList.toggle('is-offline', isOffline());
    if (isOffline()) hint.textContent = "Offline: the office server isn't reachable. Your draft waits here.";
    else if (e.state === 'needs-you') hint.textContent = e.ask ? 'Answer their question above first.' : 'They need you in their terminal first. Sit at their computer to answer.';
    else if (e.state === 'working') hint.textContent = "They'll read it after this step. Enter sends, Shift+Enter adds a line.";
    else hint.textContent = 'Enter sends, Shift+Enter adds a line. Slash commands work too.';
    hint.classList.toggle('is-blocked', e.state === 'needs-you');
  }

  function grow(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 6 * 22 + 22)}px`;
  }

  input.addEventListener('input', () => {
    grow();
    syncComposer();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.isComposing) return;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void send();
    } else if (ev.key === 'Escape') {
      // Esc gives the keyboard back to the game; the draft stays.
      ev.preventDefault();
      input.blur();
    }
  });
  sendBtn.addEventListener('click', () => void send());

  function markDelivered(p: Pending): void {
    p.node.classList.remove('is-pending');
    p.status.remove();
    pending.splice(pending.indexOf(p), 1);
  }

  async function send(retry?: Pending): Promise<void> {
    const text = retry ? retry.text : input.value.trim();
    if (!text || blocked() || isOffline()) return;
    let p = retry;
    if (!p) {
      emptyNote?.remove();
      emptyNote = null;
      const node = userBubble(text);
      const status = el('span', { class: 'co-msg__status' }, 'Sending…');
      node.classList.add('is-pending');
      node.append(status);
      p = { text, node, status, state: 'sending', at: now() };
      pending.push(p);
      msgs.append(node);
      input.value = '';
      grow();
      syncComposer();
      scrollToEnd(true);
    } else {
      p.state = 'sending';
      p.node.classList.remove('is-failed');
      p.status.replaceChildren('Sending…');
    }
    const res = await api.say(id, text);
    if (closed) return;
    if (res.ok) {
      p.state = 'sent';
      p.at = now();
      p.status.replaceChildren('Sent');
      return;
    }
    p.state = 'failed';
    p.node.classList.add('is-failed');
    const why = /409|needs you|question|waiting/i.test(res.error ?? '') ? 'They need you first: answer their question.' : `Couldn't send: ${res.error ?? 'unknown error'}`;
    const again = el('button', { class: 'co-btn co-btn--ghost co-btn--small', attrs: { type: 'button' } }, 'Try again');
    const edit = el('button', { class: 'co-btn co-btn--ghost co-btn--small', attrs: { type: 'button' } }, 'Edit');
    const failed = p;
    again.addEventListener('click', () => void send(failed));
    edit.addEventListener('click', () => {
      failed.node.remove();
      pending.splice(pending.indexOf(failed), 1);
      input.value = failed.text;
      grow();
      syncComposer();
      input.focus();
    });
    p.status.replaceChildren(el('span', null, why), again, edit);
  }

  async function interrupt(): Promise<void> {
    if (interruptBtn.getAttribute('aria-disabled') === 'true') return;
    for (const b of [interruptBtn, termInterrupt]) holdDisabled(b);
    const res = await api.interrupt(id);
    if (closed) return;
    for (const b of [interruptBtn, termInterrupt]) releaseDisabled(b);
    if (res.ok) systemLine(`You interrupted ${e.displayName}.`);
    else systemLine(`Couldn't interrupt: ${res.error ?? 'unknown error'}`, 'bad');
  }

  async function adopt(): Promise<void> {
    holdDisabled(adoptBtn);
    const res = await api.adopt(id);
    if (closed) return;
    releaseDisabled(adoptBtn);
    if (res.ok) {
      e = { ...e, adopting: true };
      render();
    } else systemLine(`Couldn't bring them in: ${res.error ?? 'unknown error'}`, 'bad');
  }

  // ---------------------------------------------------------------- state

  /** The state chip (its needs-you timer ticks with the poll). */
  function renderState(): void {
    stateChip.dataset.state = e.state;
    const word = STATE_WORD[e.state] ?? e.state;
    const since = e.state === 'needs-you' ? ` ${fmtWait(now() - e.stateSince)}` : '';
    const text = `${word}${since}`;
    if (stateChip.dataset.text === text) return;
    stateChip.dataset.text = text;
    stateChip.replaceChildren(el('span', { class: 'co-badge', attrs: { 'data-state': e.state }, html: stateGlyph(e.state) }), text);
  }

  function render(): void {
    const l = looks();
    shell.title.textContent = e.displayName;
    panel.style.setProperty('--band', l.shirt);
    if (faceHosted !== e.hosted) {
      // Brought into the office: the lanyard goes on.
      faceHosted = e.hosted;
      const face = panel.querySelector<HTMLElement>('.co-panel__face');
      if (face) face.innerHTML = faceSvg(l, { size: 64 });
    }
    renderState();
    where.replaceChildren(el('span', { class: 'co-tag', html: icon('folder', 18) }, e.project));
    if (e.branch) where.append(el('span', { class: 'co-tag', html: icon('branch', 18) }, e.branch));
    interruptBtn.hidden = !e.hosted || ended || mode === 'terminal';
    interruptBtn.disabled = e.state !== 'working';
    termInterrupt.disabled = e.state !== 'working';
    sitBtn.hidden = ended;

    // Typing while they work.
    const working = e.state === 'working' && !ended;
    typing.hidden = !working;
    typingLabel.textContent = working ? (e.activity?.label ?? 'Thinking…') : '';

    // The ask inline while they need you.
    if (e.ask && e.ask.id !== askId) {
      askView?.destroy();
      askSlot.replaceChildren();
      askId = e.ask.id;
      let card: AskView | null = null;
      card = renderAsk(askSlot, e.ask, (a) => api.answer({ ...a, sessionId: id }), {
        name: e.displayName,
        now: opts.now,
        onSettled: (outcome) => {
          // "Answer in their terminal" sits you down at it (hosted), as from their panel (UX.md §3.3).
          if (outcome === 'terminal' && e.hosted) api.sit(id);
          // The folded line stays a moment, then makes room (only this card, never a newer one).
          window.setTimeout(() => card?.el.remove(), 4000);
        },
      });
      askView = card;
      revealAsk();
    } else if (!e.ask && askView) {
      askView.settle(e.state === 'needs-you' ? 'expired' : 'elsewhere');
      askView = null;
      askId = null;
    }
    // Waiting in a terminal: hosted, sit down to answer; their own terminal, "Got it" (same as their panel).
    const waitingInTerminal = e.state === 'needs-you' && !e.ask && !ended && !(!e.hosted && noteSeen(e));
    const waitKey = waitingInTerminal ? `${e.hosted}|${e.stateSince}|${e.pid}` : '';
    if (waitKey !== waitNote.dataset.key) {
      waitNote.dataset.key = waitKey;
      waitNote.hidden = !waitingInTerminal;
      waitNote.replaceChildren();
      if (waitingInTerminal) {
        waitNote.append(
          el('span', { html: icon('terminal', 22) }),
          el(
            'span',
            null,
            e.hosted
              ? `${e.displayName} is waiting in their terminal.`
              : e.otherOffice
                ? `${e.displayName} is waiting in another office. Answer them there.`
                : `${e.displayName} is waiting in your own terminal (pid ${e.pid}). Answer them there.`,
          ),
        );
        if (e.hosted) waitNote.append(needsServer(button('Sit at their computer', { small: true, kind: 'primary', onClick: () => api.sit(id) })));
        else
          waitNote.append(
            button('Got it', {
              small: true,
              onClick: () => {
                markNoteSeen(e);
                render();
                // The button is gone: keep focus in the chat, not on the page.
                view.focus();
              },
            }),
          );
      }
    }

    // Footer: the composer for hosted sessions, the adopt card for the rest.
    composer.hidden = !e.hosted || ended;
    adoptCard.hidden = e.hosted || ended;
    shell.foot.hidden = ended || mode === 'terminal';
    if (mode === 'terminal') renderTerm();
    if (!e.hosted) {
      adoptCard.classList.toggle('is-waiting', !!e.adopting);
      if (e.otherOffice) {
        // Another office hired them: only that office can talk to them or bring them in.
        adoptText.replaceChildren(el('strong', null, 'Hired in another office.'), ` Talk to ${e.displayName} there.`);
        adoptBtn.hidden = true;
      } else if (e.adopting) {
        adoptText.replaceChildren(
          el('span', { class: 'co-spinner', attrs: { 'aria-hidden': 'true' } }),
          el('span', null, el('strong', null, `Waiting for ${e.displayName}…`), ' Type ', el('code', null, '/exit'), " in their terminal: they'll walk in here with their whole conversation."),
        );
        adoptBtn.hidden = true;
      } else {
        adoptText.replaceChildren(
          el('strong', null, 'Started in their own terminal.'),
          ` Bring ${e.displayName} into the office to chat here. Type `,
          el('code', null, '/exit'),
          " in their terminal: they'll walk in here with their whole conversation.",
        );
        adoptBtn.hidden = false;
      }
    }
    syncComposer();
  }

  // Inside the panel, Space, Enter, arrows and paging act like a web page, not the game.
  panel.addEventListener('keydown', (ev) => {
    if (PAGE_KEYS.has(ev.key) && ev.target !== panel) ev.stopPropagation();
  });

  render();
  container.append(panel);
  void load();
  if (opts.mode === 'terminal') setMode('terminal');
  // The composer's hint says when the office server is away (offline.ts disables the buttons).
  const unsubOffline = bus.on('offline', () => syncComposer());

  const view: ChatView = {
    el: panel,
    update(next: Employee) {
      if (closed || next.sessionId !== id) return;
      // Back from the end, or moved into the office: their transcript starts over.
      const restart = ended || next.hosted !== e.hosted;
      e = next;
      ended = false;
      render();
      if (restart) restartFeed();
    },
    end(text: string) {
      if (closed || ended) return;
      ended = true;
      window.clearTimeout(pollTimer);
      askView?.settle('elsewhere');
      waitNote.hidden = true;
      render();
      systemLine(text);
    },
    focus() {
      // An open question comes first: E focuses its card (it never answers).
      if (mode === 'chat' && askView && e.ask?.id === askId) {
        askView.focus();
        revealAsk();
        return;
      }
      if (mode === 'terminal') {
        const v = termViews[termTab];
        if (v) v.focus();
        else termTabsCtl.focus();
      } else if (e.hosted) input.focus({ preventScroll: true });
      else (adoptBtn.hidden || ended ? shell.title : adoptBtn).focus({ preventScroll: true });
    },
    getMode: () => mode,
    setMode,
    close() {
      if (closed) return;
      closed = true;
      unsubOffline();
      window.clearTimeout(pollTimer);
      for (const v of Object.values(termViews)) v.dispose();
      termViews = {};
      askView?.destroy();
      // A host animating it out (.is-out) removes it when that's done.
      if (!panel.classList.contains('is-out')) panel.remove();
    },
  };
  return view;
}
