// Answer an employee's open question in the game (Employee.ask → POST /api/answer):
// permission (Allow / Always allow… / Deny + note / their terminal), plan (Approve /
// Keep planning + note / their terminal) and questions (option chips, "Other…", Send).
import type { Ask, AskOption } from '../../../shared/protocol';
import { PALETTE } from '../style/palette';
import { clear, h } from './dom';
import type { PanelDeps } from './panels';
import { shell, type Panel } from './shell';

const NOTE_FIRST = new Set(['deny', 'revise']);

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function optionButton(o: AskOption, onClick: () => void): HTMLButtonElement {
  const cls = { primary: 'btn-green', secondary: 'btn-plain', danger: 'btn-red', ghost: 'btn-ghost' }[o.style];
  const b = h('button', { class: `btn ask-opt ${cls}`, type: 'button', title: o.hint ?? '' }, h('span', null, o.label), o.hint ? h('small', null, o.hint) : null) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

export function answerPanel(sessionId: string, deps: PanelDeps, close: () => void): Panel {
  const { store, backend, toasts, actions } = deps;
  const e0 = store.get(sessionId);
  const ask0 = e0?.ask;
  const name = e0?.displayName ?? 'They';
  const timer = h('span', { class: 'chip ask-timer' });
  const body = h('div', { class: 'ask' });
  const el = shell(`${name} needs you`, PALETTE.stateNeedsYou, [body], close, [timer], 'panel-ask');
  if (!ask0) {
    body.append(h('p', { class: 'muted' }, 'Nothing to answer right now.'));
    return { id: 'ask', el };
  }
  const ask: Ask = ask0;
  let busy = false;
  let done = false;

  // Question asks: the chosen labels per question, plus free text.
  const picks = (ask.questions ?? []).map(() => new Set<string>());
  const others: HTMLInputElement[] = [];

  const send = async (choice: string, message?: string) => {
    if (busy || done) return;
    let answers: Record<string, string> | undefined;
    if (choice === 'answer') {
      answers = {};
      const qs = ask.questions ?? [];
      for (let i = 0; i < qs.length; i++) {
        const other = others[i]?.value.trim();
        const chosen = [...picks[i]];
        if (other) chosen.push(other);
        if (!chosen.length) {
          toasts.show('Pick an answer for every question', 'warn', 3000, qs[i].question);
          return;
        }
        answers[qs[i].question] = chosen.join(', ');
      }
    }
    busy = true;
    for (const b of el.querySelectorAll<HTMLButtonElement>('.ask-opt, .ask-send')) b.disabled = true;
    const r = await backend.answer({ sessionId, askId: ask.id, choice, message: message || undefined, answers });
    busy = false;
    if (r.ok) {
      done = true;
      actions.answered(sessionId, choice);
      close();
    } else {
      toasts.show("Couldn't send that", 'bad', 7000, r.error);
      for (const b of el.querySelectorAll<HTMLButtonElement>('.ask-opt, .ask-send')) b.disabled = false;
    }
  };

  const footer = h('div', { class: 'ask-actions' });
  const renderButtons = () => {
    clear(footer);
    for (const o of ask.options) {
      footer.append(
        optionButton(o, () => {
          if (NOTE_FIRST.has(o.id)) renderNote(o);
          else void send(o.id);
        }),
      );
    }
  };
  /** Deny / Keep planning: a short note first. */
  const renderNote = (o: AskOption) => {
    clear(footer);
    const ta = h('textarea', {
      class: 'input',
      rows: 3,
      maxlength: 2000,
      placeholder: o.id === 'deny' ? 'Why not? (optional, they get this as the reason)' : 'What should change in the plan?',
    }) as HTMLTextAreaElement;
    const go = h('button', { class: `btn ask-send ${o.id === 'deny' ? 'btn-red' : 'btn-blue'}`, type: 'button' }, o.id === 'deny' ? 'Deny' : 'Send feedback');
    go.addEventListener('click', () => void send(o.id, ta.value.trim()));
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) void send(o.id, ta.value.trim());
    });
    const back = h('button', { class: 'btn btn-plain', type: 'button' }, 'Back');
    back.addEventListener('click', renderButtons);
    footer.append(h('div', { class: 'ask-note' }, ta, h('div', { class: 'row' }, back, go)));
    window.setTimeout(() => ta.focus(), 30);
  };

  body.append(h('div', { class: 'ask-title' }, ask.title));
  if (ask.kind === 'question') {
    (ask.questions ?? []).forEach((q, i) => {
      const chips = h('div', { class: 'ask-chips' });
      for (const opt of q.options) {
        const chip = h('button', { class: 'ask-chip', type: 'button', title: opt.description ?? '' }, h('b', null, opt.label), opt.description ? h('small', null, opt.description) : null);
        chip.addEventListener('click', () => {
          const set = picks[i];
          if (q.multiSelect) {
            if (set.has(opt.label)) set.delete(opt.label);
            else set.add(opt.label);
          } else {
            set.clear();
            set.add(opt.label);
            if (others[i]) others[i].value = '';
          }
          for (const c of chips.querySelectorAll<HTMLElement>('.ask-chip')) c.classList.toggle('on', set.has(c.querySelector('b')!.textContent ?? ''));
        });
        chips.append(chip);
      }
      const other = h('input', { class: 'input ask-other', type: 'text', placeholder: q.multiSelect ? 'Other… (added to your picks)' : 'Other…', maxlength: 500 }) as HTMLInputElement;
      other.addEventListener('input', () => {
        if (!q.multiSelect && other.value.trim()) {
          picks[i].clear();
          for (const c of chips.querySelectorAll<HTMLElement>('.ask-chip')) c.classList.remove('on');
        }
      });
      others[i] = other;
      body.append(
        h(
          'div',
          { class: 'ask-q' },
          q.header ? h('span', { class: 'tagpill' }, q.header) : null,
          h('p', null, q.question, q.multiSelect ? h('small', { class: 'muted' }, ' (pick any)') : null),
          chips,
          other,
        ),
      );
    });
  } else if (ask.detail) {
    // Commands and paths in monospace; plans as wrapped text.
    body.append(h('pre', { class: `ask-detail ${ask.kind === 'plan' ? 'plan' : 'mono'}` }, ask.detail));
  }
  const expires = h('p', { class: 'ask-expires muted' });
  body.append(footer, expires);
  renderButtons();

  const tick = () => {
    const left = ask.expiresAt - Date.now() - store.skew;
    timer.textContent = countdown(left);
    if (left > 0) expires.textContent = `Goes back to their terminal in ${countdown(left)}`;
    else if (!done) {
      expires.textContent = 'Gone back to their terminal. Answer them there.';
      for (const b of el.querySelectorAll<HTMLButtonElement>('.ask-opt, .ask-send')) b.disabled = true;
    }
  };
  tick();
  const iv = window.setInterval(tick, 1000);
  // Answered elsewhere (their terminal, another tab) or withdrawn: say so and step aside.
  const unsub = store.subscribe(() => {
    if (done) return;
    if (store.get(sessionId)?.ask?.id === ask.id) return;
    done = true;
    clear(footer);
    expires.textContent = 'This one has been answered or withdrawn.';
    window.setTimeout(close, 1400);
  });
  return {
    id: 'ask',
    el,
    dispose: () => {
      window.clearInterval(iv);
      unsub();
    },
  };
}
