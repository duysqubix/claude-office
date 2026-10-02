// Chunky pop-in panels: Employee, Hire, Personnel Files (archive), Roster, Help, plus the
// Ask, Team stats and Interns panels from their own modules. One panel at a time.
import type { Employee, PastSession, ProjectInfo } from '../../../shared/protocol';
import type { Backend, RosterStore } from '../net';
import { PALETTE } from '../style/palette';
import { answerPanel } from './answerPanel';
import { STATE_COLOR, ago, append, clear, copyText, doingText, duration, h, money, stateChip, tildify, truncate, waitingLines } from './dom';
import { internsPanel } from './internsPanel';
import type { Sfx } from './sfx';
import { shell, type Panel, type PanelId } from './shell';
import { statsPanel } from './statsPanel';
import type { Toasts } from './toasts';

export type { PanelId } from './shell';

type ActionMode = 'idle' | 'message' | 'confirm';

interface ActionHandlers {
  sit(): void;
  answer(): void;
  setMode(m: ActionMode): void;
  send(text: string): Promise<void>;
  fire(): Promise<void>;
}

export interface PanelActions {
  /** Walk the manager to someone's desk. */
  walkTo(sessionId: string): void;
  /** Sit at their computer (hosted only). */
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

type SimplePanel = Exclude<PanelId, 'employee' | 'ask'>;

export class PanelHost {
  private layer: HTMLElement;
  private current: Panel | null = null;
  /** Fires with true when a panel opens, false when the last one closes. */
  onChange: ((open: boolean) => void) | null = null;

  constructor(
    root: HTMLElement,
    private deps: PanelDeps,
  ) {
    this.layer = h('div', { class: 'panel-layer', hidden: true });
    this.layer.addEventListener('pointerdown', (e) => {
      if (e.target === this.layer) this.close();
    });
    root.append(this.layer);
  }

  get openId(): PanelId | null {
    return this.current?.id ?? null;
  }

  /** The session shown in the employee panel, if that's what's open. */
  employeeId: string | null = null;

  close(): void {
    if (!this.current) return;
    const p = this.current;
    this.current = null;
    this.employeeId = null;
    p.dispose?.();
    p.el.classList.add('out');
    this.deps.sfx.close();
    window.setTimeout(() => {
      p.el.remove();
      if (!this.current) this.layer.hidden = true;
    }, 180);
    this.onChange?.(false);
  }

  toggle(id: SimplePanel): void {
    if (this.current?.id === id) this.close();
    else this.open(id);
  }

  open(id: SimplePanel): void {
    const close = () => this.close();
    const { store } = this.deps;
    const make: Record<SimplePanel, () => Panel> = {
      hire: () => this.hire(),
      archive: () => this.archive(),
      roster: () => this.roster(),
      help: () => this.help(),
      stats: () => statsPanel(store, close),
      interns: () => internsPanel(store, close, (id2) => this.deps.actions.walkTo(id2)),
    };
    this.present(make[id]());
  }

  openEmployee(sessionId: string): void {
    this.present(this.employee(sessionId));
    this.employeeId = sessionId;
  }

  /** The Ask panel for someone's open question (falls back to their employee panel). */
  openAsk(sessionId: string): void {
    if (!this.deps.store.get(sessionId)?.ask) {
      this.openEmployee(sessionId);
      return;
    }
    this.present(answerPanel(sessionId, this.deps, () => this.close()));
    this.employeeId = sessionId;
  }

  present(p: Panel): void {
    if (this.current) {
      const old = this.current;
      this.current = null;
      old.dispose?.();
      old.el.remove();
    }
    this.current = p;
    this.layer.hidden = false;
    this.layer.append(p.el);
    this.deps.sfx.pop();
    this.onChange?.(true);
    if (p.focus) window.setTimeout(() => p.focus?.focus(), 60);
  }

  // -------------------------------------------------------------------------------------
  // Employee

  private employee(sessionId: string): Panel {
    const { store, backend, toasts, actions, sfx } = this.deps;
    const headChip = h('span', { class: 'head-chip' });
    const info = h('div', { class: 'emp' });
    const actionsEl = h('div');
    const chatter = h('div', { class: 'chatter' }, h('p', { class: 'muted' }, 'Fetching the gossip…'));
    const el = shell('', PALETTE.stateIdle, [info, actionsEl, h('h3', null, 'Recent chatter'), chatter], () => this.close(), [headChip], 'panel-employee');
    const title = el.querySelector('h2')!;
    let mode: ActionMode = 'idle';
    let shownFor = '';

    const handlers: ActionHandlers = {
      sit: () => actions.sitAt(sessionId),
      answer: () => this.openAsk(sessionId),
      setMode: (m) => {
        mode = m;
        renderActions();
      },
      send: async (text) => {
        const r = await backend.say(sessionId, text);
        if (r.ok) {
          toasts.show('Message delivered', 'good', 2600, truncate(text, 60));
          sfx.pop();
          handlers.setMode('idle');
        } else {
          toasts.show("Couldn't send that", 'bad', 4200, r.error);
          renderActions();
        }
      },
      fire: async () => {
        const e = store.get(sessionId);
        const r = await backend.fire(sessionId);
        if (r.ok) {
          toasts.show(`You let ${e?.displayName ?? 'them'} go`, 'leave', 3600, "They're packing up their desk.");
          this.close();
        } else toasts.show("Couldn't let them go", 'bad', 4200, r.error);
      },
    };

    const actionsKey = (e: Employee) => `${e.hosted}|${e.state === 'needs-you'}|${e.ask?.id ?? ''}`;
    const renderActions = () => {
      const e = store.get(sessionId);
      clear(actionsEl);
      shownFor = e ? actionsKey(e) : '';
      if (e) actionsEl.append(this.employeeActions(e, mode, handlers));
    };

    const renderInfo = () => {
      const e = store.get(sessionId);
      if (!e) {
        title.textContent = 'Gone home';
        clear(info);
        clear(actionsEl);
        info.append(h('p', { class: 'muted' }, 'This session has ended. They packed up and went home.'));
        return;
      }
      el.style.setProperty('--head', STATE_COLOR[e.state]);
      title.textContent = e.displayName;
      clear(headChip);
      headChip.append(stateChip(e.state));
      clear(info);
      const now = store.now();
      const active = e.interns.filter((i) => i.active);
      append(info, [
        h(
          'div',
          { class: 'emp-tags' },
          h('span', { class: 'tagpill t-project', title: tildify(e.cwd, store.home) }, e.project),
          e.branch ? h('span', { class: 'tagpill t-branch' }, e.branch) : null,
          e.model ? h('span', { class: 'tagpill t-model' }, e.model.replace(/^claude-/, '')) : null,
          e.hosted ? h('span', { class: 'tagpill t-hosted' }, 'hired here') : null,
        ),
        e.state === 'needs-you'
          ? h('div', { class: 'emp-now now-needs-you' }, h('small', null, 'Needs you'), e.ask?.title ?? waitingLines(e)[1], h('em', null, ` “${waitingLines(e)[0]}”`))
          : h('div', { class: `emp-now now-${e.state}` }, h('small', null, 'Now'), doingText(e)),
        h(
          'div',
          { class: 'emp-stats' },
          h('div', null, h('small', null, 'On the clock'), duration(now - e.startedAt)),
          h('div', null, h('small', null, 'Cost so far'), money(e.costUSD)),
          h('div', null, h('small', null, 'Interns'), String(active.length)),
        ),
        e.title ? h('div', { class: 'emp-title' }, h('small', null, 'Working on'), e.title) : null,
        e.lastText ? h('blockquote', { class: 'emp-quote said' }, h('small', null, 'Last said'), truncate(e.lastText, 280)) : null,
        e.lastPrompt ? h('blockquote', { class: 'emp-quote asked' }, h('small', null, 'You asked'), truncate(e.lastPrompt, 200)) : null,
        active.length
          ? h(
              'ul',
              { class: 'emp-interns' },
              ...active.slice(0, 6).map((i) => h('li', null, h('b', null, i.type.replace(/^.*:/, '')), ' ', truncate(i.description, 70))),
            )
          : null,
      ]);
      // Actions only re-render when they have to, so a half-typed message survives roster pushes.
      if (shownFor !== actionsKey(e)) renderActions();
    };

    renderInfo();
    const unsub = store.subscribe(renderInfo);
    backend
      .chatter(sessionId)
      .then((lines) => {
        clear(chatter);
        if (!lines.length) chatter.append(h('p', { class: 'muted' }, 'Nothing said yet.'));
        for (const l of lines.slice(-14)) {
          if (l.role === 'tool') chatter.append(h('div', { class: 'chat-step' }, '· ', truncate(l.text, 80)));
          else chatter.append(h('div', { class: `chat chat-${l.role}` }, h('small', null, l.role === 'user' ? 'You' : 'Them'), truncate(l.text, 400)));
        }
        chatter.scrollTop = chatter.scrollHeight;
      })
      .catch((err: Error) => {
        clear(chatter);
        chatter.append(h('p', { class: 'muted' }, `Couldn't fetch chatter: ${err.message}`));
      });
    return { id: 'employee', el, dispose: unsub };
  }

  private employeeActions(e: Employee, mode: ActionMode, H: ActionHandlers): HTMLElement {
    const needs = e.state === 'needs-you';
    // An open question can be answered right here, whoever started the session.
    const answer = e.ask ? h('button', { class: 'btn btn-orange btn-big', type: 'button', onclick: () => H.answer() }, 'Answer', h('kbd', null, 'E')) : null;
    if (!e.hosted) {
      const cmd = `claude --resume ${e.sessionId}`;
      const copy = h('button', { class: 'btn btn-small btn-plain', type: 'button' }, 'Copy');
      copy.addEventListener('click', async () => {
        copy.textContent = (await copyText(cmd)) ? 'Copied!' : 'Copy failed';
        window.setTimeout(() => (copy.textContent = 'Copy'), 1500);
      });
      return h(
        'div',
        null,
        answer ? h('div', { class: 'emp-actions' }, answer) : null,
        h(
          'div',
          { class: 'emp-external' },
          h('p', null, needs && !e.ask ? `They're in your own terminal (pid ${e.pid}). Answer them there.` : `Started in your own terminal (pid ${e.pid}). Talk to them there.`),
          h('div', { class: 'cmd' }, h('code', null, cmd), copy),
        ),
      );
    }
    if (mode === 'message') {
      const ta = h('textarea', { class: 'input', rows: 3, placeholder: `Tell ${e.displayName} something…`, maxlength: 4000 }) as HTMLTextAreaElement;
      const send = h('button', { class: 'btn btn-green', type: 'button' }, 'Send') as HTMLButtonElement;
      const submit = () => {
        const text = ta.value.trim();
        if (!text) return;
        send.disabled = true;
        send.textContent = 'Sending…';
        void H.send(text);
      };
      send.addEventListener('click', submit);
      ta.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) submit();
      });
      const cancel = h('button', { class: 'btn btn-plain', type: 'button', onclick: () => H.setMode('idle') }, 'Cancel');
      window.setTimeout(() => ta.focus(), 30);
      return h('div', { class: 'emp-actions col' }, ta, h('div', { class: 'row' }, h('small', { class: 'muted' }, '⌘/Ctrl+Enter to send'), cancel, send));
    }
    if (mode === 'confirm') {
      return h(
        'div',
        { class: 'emp-actions confirm' },
        h('p', null, `Let ${e.displayName} go? Their tmux session ends and they walk out.`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn-plain', type: 'button', onclick: () => H.setMode('idle') }, 'Keep them'),
          h('button', { class: 'btn btn-red', type: 'button', onclick: () => void H.fire() }, 'Let go'),
        ),
      );
    }
    // While they have a question open, Enter would pick the dialog's default answer, so no
    // quick messages: answer in-game, or sit down at their computer.
    const sit = h('button', { class: `btn ${answer ? 'btn-plain' : 'btn-orange btn-big'}`, type: 'button', onclick: () => H.sit() }, needs && !answer ? 'Sit down and answer' : 'Sit at their computer', answer ? null : h('kbd', null, 'E'));
    const msg = h('button', { class: 'btn btn-blue', type: 'button', disabled: needs, title: needs ? 'Answer them first: sit down at their computer.' : '', onclick: () => H.setMode('message') }, 'Quick message');
    return h(
      'div',
      null,
      h('div', { class: 'emp-actions' }, answer, sit, msg, h('button', { class: 'btn btn-red-soft', type: 'button', onclick: () => H.setMode('confirm') }, 'Let go')),
      needs ? h('p', { class: 'muted small' }, answer ? 'Or sit down at their computer to answer in the real terminal.' : 'Answer them first: sit down at their computer.') : null,
    );
  }

  // -------------------------------------------------------------------------------------
  // Hire

  private hire(): Panel {
    const { backend, toasts, sfx, store } = this.deps;
    let chosen = '';
    const list = h('div', { class: 'proj-list' }, h('p', { class: 'muted' }, 'Looking through your projects…'));
    const path = h('input', { class: 'input', type: 'text', placeholder: '~/somewhere/else', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    const task = h('textarea', { class: 'input', rows: 3, placeholder: 'e.g. "fix the flaky test in roster.spec.ts" (optional)', maxlength: 4000 }) as HTMLTextAreaElement;
    const go = h('button', { class: 'btn btn-orange btn-big', type: 'button', disabled: true }, 'Hire!') as HTMLButtonElement;
    const target = () => {
      const typed = path.value.trim();
      if (typed) return typed.startsWith('~') && store.home ? store.home + typed.slice(1) : typed;
      return chosen;
    };
    const refresh = () => {
      go.disabled = !target();
      for (const c of list.querySelectorAll<HTMLElement>('.proj')) c.classList.toggle('sel', !path.value.trim() && c.dataset.cwd === chosen);
    };
    path.addEventListener('input', refresh);
    backend
      .projects()
      .then((projects: ProjectInfo[]) => {
        clear(list);
        if (!projects.length) list.append(h('p', { class: 'muted' }, 'No projects yet. Type a path below.'));
        for (const p of projects.slice(0, 24)) {
          const card = h(
            'button',
            { class: 'proj', type: 'button', 'data-cwd': p.cwd },
            h('b', null, p.name),
            h('small', null, tildify(p.cwd, store.home)),
            h('em', null, `${p.sessionCount} session${p.sessionCount === 1 ? '' : 's'} · ${ago(p.lastActive)}`),
          );
          card.addEventListener('click', () => {
            chosen = p.cwd;
            path.value = '';
            refresh();
          });
          list.append(card);
        }
      })
      .catch((err: Error) => {
        clear(list);
        list.append(h('p', { class: 'muted' }, `Couldn't list projects (${err.message}). Type a path below.`));
      });
    go.addEventListener('click', async () => {
      const cwd = target();
      if (!cwd) return;
      go.disabled = true;
      go.textContent = 'Interviewing…';
      const r = await backend.hire(cwd, task.value.trim() || undefined);
      if (r.ok) {
        sfx.fanfare();
        toasts.show('Interview went great!', 'good', 4200, 'Your new hire will walk in any second.');
        this.close();
      } else {
        toasts.show('The interview fell through', 'bad', 5000, r.error);
        go.textContent = 'Hire!';
        refresh();
      }
    });
    const el = shell(
      'Now hiring!',
      PALETTE.claude,
      [
        h('label', { class: 'field-label' }, 'Which project?'),
        list,
        h('label', { class: 'field-label' }, '…or somewhere else'),
        path,
        h('label', { class: 'field-label' }, 'First task ', h('span', { class: 'muted' }, '(optional)')),
        task,
        h('div', { class: 'panel-foot' }, h('small', { class: 'muted' }, 'Starts a new Claude Code session in tmux.'), go),
      ],
      () => this.close(),
      [],
      'panel-hire',
    );
    return { id: 'hire', el };
  }

  // -------------------------------------------------------------------------------------
  // Personnel Files

  private archive(): Panel {
    const { backend, toasts, sfx, store } = this.deps;
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search the files…', spellcheck: false }) as HTMLInputElement;
    const list = h('div', { class: 'files' }, h('p', { class: 'muted' }, 'Opening the filing cabinet…'));
    let all: PastSession[] = [];
    const render = () => {
      clear(list);
      const q = search.value.trim().toLowerCase();
      const rows = all.filter((s) => !q || `${s.title ?? ''} ${s.project} ${s.lastPrompt ?? ''}`.toLowerCase().includes(q));
      if (!rows.length) list.append(h('p', { class: 'muted' }, all.length ? 'No files match.' : 'The cabinet is empty.'));
      for (const s of rows.slice(0, 60)) {
        const live = s.live || !!store.get(s.sessionId);
        const btn = h('button', { class: `btn btn-small ${live ? 'btn-plain' : 'btn-purple'}`, type: 'button', disabled: live }, live ? 'In the office' : 'Call back in') as HTMLButtonElement;
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Calling…';
          const r = await backend.rehire(s.sessionId);
          if (r.ok) {
            sfx.fanfare();
            toasts.show('Called them back in!', 'good', 4000, `${s.title ?? s.project} · they'll be right over.`);
            this.close();
          } else {
            toasts.show("They didn't pick up", 'bad', 5000, r.error);
            btn.disabled = false;
            btn.textContent = 'Call back in';
          }
        });
        list.append(
          h(
            'div',
            { class: `file ${live ? 'live' : ''}` },
            h('div', { class: 'file-tab' }),
            h(
              'div',
              { class: 'file-main' },
              h('b', null, s.title ?? truncate(s.lastPrompt ?? 'Untitled session', 60)),
              h('small', null, `${s.project} · ${ago(s.lastActive)} · ${money(s.costUSD)}`),
            ),
            btn,
          ),
        );
      }
    };
    search.addEventListener('input', render);
    backend
      .archive()
      .then((rows) => {
        all = rows;
        render();
      })
      .catch((err: Error) => {
        clear(list);
        list.append(h('p', { class: 'muted' }, `Couldn't open the cabinet: ${err.message}`));
      });
    const el = shell('Personnel Files', PALETTE.stateSleeping, [search, list], () => this.close(), [], 'panel-archive');
    return { id: 'archive', el };
  }

  // -------------------------------------------------------------------------------------
  // Roster

  private roster(): Panel {
    const { store, actions } = this.deps;
    const list = h('div', { class: 'roster' });
    const order: Record<string, number> = { 'needs-you': 0, working: 1, starting: 2, idle: 3, sleeping: 4 };
    const render = () => {
      clear(list);
      const people = [...store.employees].sort((a, b) => order[a.state] - order[b.state] || a.displayName.localeCompare(b.displayName));
      if (!people.length) list.append(h('p', { class: 'muted' }, "Nobody's in yet. Hire someone at reception!"));
      for (const e of people) {
        const row = h(
          'button',
          { class: `roster-row st-${e.state}`, type: 'button', style: `--c:${STATE_COLOR[e.state]}` },
          h('i', { class: 'dot' }),
          h('span', { class: 'who' }, h('b', null, e.displayName), h('small', null, e.project)),
          h('span', { class: 'what' }, truncate(doingText(e), 42)),
          e.interns.some((i) => i.active) ? h('span', { class: 'mini-chip' }, `+${e.interns.filter((i) => i.active).length}`) : null,
          e.ask ? h('span', { class: 'btn btn-small btn-orange roster-answer' }, 'Answer') : h('span', { class: 'go' }, 'Go to →'),
        );
        row.addEventListener('click', (ev) => {
          if (e.ask && (ev.target as HTMLElement).closest('.roster-answer')) {
            this.openAsk(e.sessionId);
            return;
          }
          this.close();
          actions.walkTo(e.sessionId);
        });
        list.append(row);
      }
    };
    render();
    const unsub = store.subscribe(render);
    const el = shell('Roster', PALETTE.stateIdle, [list], () => this.close(), [], 'panel-roster');
    return { id: 'roster', el, dispose: unsub };
  }

  // -------------------------------------------------------------------------------------
  // Help

  private help(): Panel {
    const keys: [string, string][] = [
      ['W A S D', 'Walk (arrows work too)'],
      ['Shift', 'Run'],
      ['Space', 'Jump'],
      ['Drag / wheel', 'Orbit / zoom the camera'],
      ['V', 'First / third person (click to look around in first person)'],
      ['E', 'Talk to someone, answer them, use reception, the files, the boards, the coffee'],
      ['Q', 'Go to whoever has needed you longest'],
      ['R', 'Roster'],
      ['H', 'Hire someone'],
      ['M', 'Mute'],
      ['Ctrl + ]', 'Stand up from their computer'],
    ];
    const states: [keyof typeof STATE_COLOR, string][] = [
      ['working', 'Busy: typing, reading, running things, thinking'],
      ['needs-you', 'Hand up! Waiting on a permission or an answer'],
      ['idle', 'Free: finished their turn, leaning back'],
      ['sleeping', 'Free for 15+ minutes. Shh.'],
    ];
    const el = shell(
      'How to manage',
      PALETTE.wallAccent,
      [
        h('div', { class: 'help-keys' }, ...keys.map(([k, v]) => h('div', { class: 'help-row' }, h('kbd', null, k), h('span', null, v)))),
        h('h3', null, 'Reading the room'),
        h('div', { class: 'help-states' }, ...states.map(([s, v]) => h('div', { class: 'help-row' }, stateChip(s), h('span', null, v)))),
        h('p', { class: 'muted' }, 'Everyone here is a live Claude Code session on this machine. Sessions you hire here run in tmux, so you can sit at their computer.'),
      ],
      () => this.close(),
      [],
      'panel-help',
    );
    return { id: 'help', el };
  }
}
