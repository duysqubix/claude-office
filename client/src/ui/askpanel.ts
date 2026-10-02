// In-game answering (UX.md §3.3): the ask card for permission, question and plan asks.
// A pure view: it renders `Ask`, counts down to `expiresAt`, and reports the choice through
// `onAnswer` (the caller POSTs /api/answer with its sessionId). Approving never takes a single
// keystroke: digit keys only work while the card itself has focus, and never send it back to
// the terminal.
import type { AnswerRequest, ApiResult, Ask, AskOption } from '../../../shared/protocol';
import { el, fmtClock } from './el';
import { icon } from './icons';
import { enhanceMarkdown, renderMarkdown, visibleText } from './markdown';
import { needsServer } from './offline';
import './theme.css';

/** What the card reports: an AnswerRequest without the sessionId, which the caller adds. */
export type AskAnswer = Omit<AnswerRequest, 'sessionId'>;
export type AskOutcome = 'answered' | 'terminal' | 'expired' | 'elsewhere';

export interface AskViewOptions {
  /** Their display name, for the screen-reader countdown. */
  name?: string;
  /** Focus the card on render: only for panels the manager opened themselves (never on a go-to). */
  focus?: boolean;
  /** Clock override (the UI kit freezes time). */
  now?: () => number;
  /** After the card folds, for whatever reason (called asynchronously). */
  onSettled?: (outcome: AskOutcome, choice?: string) => void;
}

export interface AskView {
  readonly el: HTMLElement;
  focus(): void;
  /** The ask left the roster without an answer from this card. Deferred while an answer is in flight. */
  settle(outcome: 'expired' | 'elsewhere'): void;
  destroy(): void;
}

const DONE: Record<string, string> = {
  allow: 'Allowed',
  deny: 'Denied',
  approve: 'Plan approved',
  revise: 'Sent back to planning',
  answer: 'Answers sent',
  terminal: 'Moved to their terminal.',
};

const STYLE_CLASS: Record<AskOption['style'], string> = {
  primary: 'co-btn--primary',
  secondary: '',
  danger: 'co-btn--danger',
  ghost: 'co-btn--ghost',
};

/** Keys that act like a web page inside the card (the game must not see them). */
const PAGE_KEYS = new Set([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

let uid = 0;

/** "Bash", "chrome › navigate", "Question", "Plan". */
export function toolLabel(tool: string): string {
  if (tool.startsWith('mcp__')) {
    const [, server = '', ...rest] = tool.split('__');
    return `${server} › ${rest.join(' ').replace(/_/g, ' ')}`.trim();
  }
  if (tool === 'AskUserQuestion') return 'Question';
  if (tool === 'ExitPlanMode') return 'Plan';
  return tool;
}

/** The digit a key event stands for (by physical key, so AZERTY and the numpad work), or 0. */
function digitOf(ev: KeyboardEvent): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code);
  return m ? Number(m[1]) : 0;
}

/** Render an ask card into `container`. Returns a handle to focus, settle or remove it. */
export function renderAsk(
  container: HTMLElement,
  ask: Ask,
  onAnswer: (answer: AskAnswer) => Promise<ApiResult | void> | ApiResult | void,
  opts: AskViewOptions = {},
): AskView {
  const now = opts.now ?? Date.now;
  const id = `co-ask-${++uid}`;
  const total = Math.max(1, ask.expiresAt - ask.createdAt);
  const what = ask.kind === 'question' ? 'question' : ask.kind === 'plan' ? 'plan' : 'request';
  let busy = false;
  let done = false;
  let timer = 0;
  /** An outcome that arrived while an answer was in flight; it wins only if that answer fails. */
  let deferred: 'expired' | 'elsewhere' | null = null;
  const announced = new Set<number>();

  const titleEl = el('h3', { class: 'co-ask__title', attrs: { id: `${id}-t` } }, ask.title);
  const countdown = el('span', { class: 'co-ask__countdown' });
  const live = el('span', { class: 'co-sr', attrs: { 'aria-live': 'polite' } });
  const strip = el(
    'div',
    { class: 'co-ask__strip' },
    el('i', { class: 'co-ask__timer', attrs: { 'aria-hidden': 'true' } }),
    el('div', { class: 'co-ask__top' }, titleEl, el('span', { class: 'co-ask__tool' }, toolLabel(ask.tool))),
    countdown,
  );
  const card = el('section', { class: 'co-ask', attrs: { tabindex: -1, role: 'group', 'aria-labelledby': `${id}-t` } }, strip);
  card.dataset.kind = ask.kind;

  if (ask.kind === 'plan') {
    const plan = el('div', { class: 'co-ask__plan co-md', html: renderMarkdown(ask.detail), attrs: { tabindex: 0, role: 'region', 'aria-label': 'The plan' } });
    card.append(plan);
    enhanceMarkdown(plan);
  } else if (ask.kind === 'permission' && ask.detail) {
    // What you approve is what runs: escape sequences, zero-width and bidi characters show as \u{…}.
    card.append(el('pre', { class: 'co-ask__well', attrs: { tabindex: 0, role: 'region', 'aria-label': 'What they want to do' } }, visibleText(ask.detail)));
  }

  const body = el('div', { class: 'co-ask__body' });
  card.append(body, live);

  // Questions (AskUserQuestion): one fieldset each; "Send answers" waits for a pick on every one.
  const groups: { question: string; inputs: HTMLInputElement[]; fs: HTMLFieldSetElement }[] = [];
  for (const [qi, q] of (ask.questions ?? []).entries()) {
    const inputs: HTMLInputElement[] = [];
    const fs = el(
      'fieldset',
      { class: 'co-ask__q' },
      el('legend', null, q.header ? el('span', { class: 'co-tag' }, q.header) : null, el('span', null, q.question)),
    );
    for (const o of q.options) {
      const input = el('input', { attrs: { type: q.multiSelect ? 'checkbox' : 'radio', name: `${id}-q${qi}`, value: o.label } });
      inputs.push(input);
      fs.append(el('label', { class: 'co-choice' }, input, el('span', null, o.label, o.description ? el('small', null, o.description) : null)));
    }
    groups.push({ question: q.question, inputs, fs });
    body.append(fs);
  }
  const answers = (): Record<string, string> | null => {
    const out: Record<string, string> = {};
    for (const g of groups) {
      const picked = g.inputs.filter((i) => i.checked).map((i) => i.value);
      if (!picked.length) return null;
      out[g.question] = picked.join(', ');
    }
    return out;
  };

  // Buttons in option order. Digits follow Claude Code's numbering (Allow, Always allow…, Deny);
  // "Answer in their terminal" gets no digit, so a stray key can never send the ask away.
  const buttons: HTMLButtonElement[] = [];
  const numbered: HTMLButtonElement[] = [];
  const hintOf = new Map<HTMLButtonElement, HTMLElement>();
  for (const opt of ask.options) {
    const label = el('span', null, opt.label);
    const ghost = opt.style === 'ghost';
    const cap = ghost ? null : el('span', { class: 'co-key', attrs: { 'aria-hidden': 'true' } }, String(numbered.length + 1));
    const b = el(
      'button',
      { class: `co-btn co-ask__opt ${STYLE_CLASS[opt.style]}`.trim(), attrs: { type: 'button', 'data-choice': opt.id } },
      ghost ? el('span', { html: icon('terminal', 22) }) : cap,
      el('span', { class: 'co-ask__label' }, label, opt.hint ? el('span', { class: 'co-ask__hint' }, opt.hint) : null),
    );
    if (opt.hint) hintOf.set(b, b.querySelector('.co-ask__hint') as HTMLElement);
    b.addEventListener('click', () => void choose(opt, b, label));
    needsServer(b);
    buttons.push(b);
    if (!ghost) numbered.push(b);
  }
  const ghosts = buttons.filter((b) => b.classList.contains('co-btn--ghost'));
  body.append(...buttons.filter((b) => !ghosts.includes(b)));

  // The note (Deny's reason, Keep planning's feedback) sits right under them.
  const needsNote = ask.kind === 'permission' || ask.kind === 'plan';
  const noteInput = el('input', {
    class: 'co-input',
    attrs: {
      type: 'text',
      maxlength: 500,
      placeholder: ask.kind === 'plan' ? 'What should change?' : 'Tell them why (optional)',
      'aria-label': ask.kind === 'plan' ? 'What should change?' : 'Why you are denying it (optional)',
    },
  });
  const note = el('div', { class: 'co-ask__note', attrs: { hidden: true } }, noteInput);
  const noteToggle = el('button', { class: 'co-btn co-btn--ghost co-btn--small', attrs: { type: 'button', 'aria-expanded': 'false' } }, 'Add a note');
  const error = el('p', { class: 'co-ask__error', attrs: { role: 'alert', hidden: true } });
  if (needsNote) {
    body.append(el('div', { class: 'co-ask__linkrow' }, noteToggle), note);
    noteToggle.addEventListener('click', () => openNote(!!note.hidden));
    noteInput.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.isComposing) return;
      ev.preventDefault();
      buttons.find((b) => b.dataset.choice === (ask.kind === 'plan' ? 'revise' : 'deny'))?.click();
    });
  }

  const sendBtn = buttons.find((b) => b.dataset.choice === 'answer');
  const sendHint = el('p', { class: 'co-muted', attrs: { id: `${id}-send-hint` } }, 'Pick an answer for each question.');
  if (sendBtn) {
    sendBtn.setAttribute('aria-describedby', `${id}-send-hint`);
    sendBtn.after(sendHint);
  }
  body.append(...ghosts, error);

  const syncSend = () => {
    if (!sendBtn) return;
    const ready = answers() !== null;
    sendBtn.disabled = !ready;
    sendHint.hidden = ready;
  };
  if (groups.length) {
    body.addEventListener('change', syncSend);
    syncSend();
  }

  function openNote(open: boolean): void {
    note.hidden = !open;
    noteToggle.setAttribute('aria-expanded', String(open));
    noteToggle.textContent = open ? 'Hide note' : 'Add a note';
    if (open) noteInput.focus();
  }

  /** While an answer is in flight: aria-disabled (keeps focus where it is) plus the busy guard. */
  const swapped = new Map<HTMLButtonElement, Element>();
  function setBusy(on: boolean, pressed?: HTMLButtonElement): void {
    busy = on;
    for (const b of [...buttons, noteToggle]) {
      if (on) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
    if (on && pressed?.firstElementChild) {
      // The pressed button's key cap (or icon) becomes a spinner until the answer lands.
      pressed.setAttribute('aria-busy', 'true');
      swapped.set(pressed, pressed.firstElementChild);
      pressed.firstElementChild.replaceWith(el('span', { class: 'co-spinner', attrs: { 'aria-hidden': 'true' } }));
    } else if (!on) {
      for (const [b, lead] of swapped) {
        b.removeAttribute('aria-busy');
        b.firstElementChild?.replaceWith(lead);
      }
      swapped.clear();
      syncSend();
    }
  }

  async function choose(opt: AskOption, btn: HTMLButtonElement, label: HTMLElement): Promise<void> {
    if (busy || done || btn.disabled) return;
    // Keep planning is two steps: open the note, then send it back.
    if (opt.id === 'revise' && note.hidden) {
      openNote(true);
      label.textContent = 'Send back to planning';
      const hint = hintOf.get(btn);
      if (hint) hint.textContent = 'Enter sends it with your note';
      return;
    }
    const answer: AskAnswer = { askId: ask.id, choice: opt.id };
    const text = noteInput.value.trim();
    if (text && (opt.id === 'deny' || opt.id === 'revise')) answer.message = text;
    if (opt.id === 'answer') {
      const a = answers();
      if (!a) return;
      answer.answers = a;
    }
    error.hidden = true;
    setBusy(true, btn);
    try {
      const res = await onAnswer(answer);
      if (res && res.ok === false) throw new Error(res.error || 'the office said no');
      fold(opt.id === 'terminal' ? 'terminal' : 'answered', opt.id);
    } catch (err) {
      if (deferred) {
        // The ask went away while we were sending: show what really happened.
        fold(deferred);
        return;
      }
      setBusy(false);
      error.textContent = `Couldn't answer: ${err instanceof Error ? err.message : String(err)}`;
      error.hidden = false;
    }
  }

  function fold(outcome: AskOutcome, choice?: string): void {
    if (done) return;
    done = true;
    busy = false;
    window.clearInterval(timer);
    const hadFocus = card.contains(document.activeElement);
    const text =
      outcome === 'answered'
        ? (choice && (DONE[choice] ?? (choice.startsWith('always') ? 'Always allowed' : 'Answered'))) || 'Answered'
        : outcome === 'elsewhere'
          ? 'Answered in their terminal.'
          : 'Moved to their terminal.';
    const mark = outcome === 'answered' ? icon('check', 26) : icon('terminal', 26);
    card.classList.add('is-folded');
    card.classList.remove('is-urgent');
    card.replaceChildren(el('div', { class: 'co-ask__done', attrs: { 'aria-hidden': 'true' }, html: mark }, text), live);
    live.textContent = text;
    if (hadFocus) card.focus({ preventScroll: true });
    queueMicrotask(() => opts.onSettled?.(outcome, choice));
  }

  function tick(): void {
    if (done) return;
    const left = ask.expiresAt - now();
    if (left <= 0) {
      if (busy) deferred = 'expired';
      else fold('expired');
      return;
    }
    if (!card.isConnected) return; // Keep counting while detached; just don't touch the DOM.
    card.style.setProperty('--left', Math.min(1, left / total).toFixed(4));
    countdown.textContent = `Back to their terminal in ${fmtClock(left)}`;
    card.classList.toggle('is-urgent', left <= 10_000);
    for (const mark of [30_000, 10_000]) {
      if (left <= mark && left > mark - 2000 && !announced.has(mark)) {
        announced.add(mark);
        live.textContent = `${opts.name ? `${opts.name}'s` : 'This'} ${what} goes back to their terminal in ${mark / 1000} seconds.`;
      }
    }
  }

  card.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement;
    const inText = t instanceof HTMLInputElement && t.type === 'text';
    if (ev.isComposing) return;
    // Same for a held Enter on a focused answer button (Enter presses buttons on every repeat).
    if (ev.repeat && ev.key === 'Enter' && t instanceof HTMLButtonElement) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    const n = !inText && !ev.metaKey && !ev.ctrlKey && !ev.altKey ? digitOf(ev) : 0;
    if (n) {
      ev.preventDefault();
      ev.stopPropagation();
      // A held digit never answers: not one held from before the card had focus, nor a
      // re-submit on every repeat after a failed answer.
      if (ev.repeat) return;
      // Inside a question, digits pick that question's options; elsewhere they press the numbered buttons.
      const group = groups.find((g) => g.fs.contains(t));
      if (group) {
        const input = group.inputs[n - 1];
        if (input) {
          input.click();
          input.focus();
        }
        return;
      }
      const b = numbered[n - 1];
      if (!b || b.disabled || busy) return;
      b.classList.add('is-pressed');
      window.setTimeout(() => b.classList.remove('is-pressed'), 120);
      b.click();
      return;
    }
    // Space, Enter, arrows and paging act like a web page here; the game must not see them.
    if (PAGE_KEYS.has(ev.key) && t !== card) ev.stopPropagation();
  });

  container.append(card);
  tick();
  if (!done) timer = window.setInterval(tick, 250);
  if (opts.focus && !done) card.focus({ preventScroll: true });

  return {
    el: card,
    focus: () => card.focus({ preventScroll: true }),
    settle: (outcome) => {
      if (done) return;
      if (busy) deferred = outcome;
      else fold(outcome);
    },
    destroy: () => {
      done = true;
      window.clearInterval(timer);
      card.remove();
    },
  };
}
