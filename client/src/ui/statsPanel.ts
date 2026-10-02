// "Team stats": plan limits with reset countdowns, team totals, and everyone's context fill.
// Same numbers as the Team Room wall (TeamStats from the server).
import type { TeamStats } from '../../../shared/protocol';
import type { RosterStore } from '../net';
import { PALETTE } from '../style/palette';
import { clear, duration, h, money } from './dom';
import { shell, type Panel } from './shell';

/** Green under 60 %, amber from 60 %, red from 85 %. */
export function usageLevel(pct: number): 'ok' | 'warm' | 'hot' {
  return pct >= 85 ? 'hot' : pct >= 60 ? 'warm' : 'ok';
}

function bar(pct: number): HTMLElement {
  const p = Math.max(0, Math.min(100, pct));
  return h('div', { class: `meter ${usageLevel(p)}` }, h('i', { style: `width:${p.toFixed(1)}%` }));
}

export function statsPanel(store: RosterStore, close: () => void): Panel {
  const body = h('div', { class: 'stats' });
  const el = shell('Team stats', PALETTE.wallAccent, [body], close, [], 'panel-stats');
  const render = () => {
    const s: TeamStats | null = store.stats;
    clear(body);
    if (!s) {
      body.append(h('p', { class: 'muted' }, 'No numbers yet. The server sends them every few seconds.'));
      return;
    }
    const now = store.now();
    body.append(h('h3', null, 'Plan limits'));
    if (!s.plan.limits.length) body.append(h('p', { class: 'muted' }, 'No plan usage reported yet.'));
    for (const l of s.plan.limits) {
      body.append(
        h(
          'div',
          { class: 'stat-row' },
          h('b', null, l.label),
          bar(l.usedPct),
          h('span', { class: 'num' }, `${Math.round(l.usedPct)}%`),
          h('small', { class: 'muted' }, l.resetsAt ? `resets in ${duration(l.resetsAt - now)}` : ''),
        ),
      );
    }
    if (s.plan.updatedAt) body.append(h('p', { class: 'muted small' }, `Reported ${duration(now - s.plan.updatedAt)} ago by a session.`));
    const t = s.team;
    body.append(
      h('h3', null, 'Today'),
      h(
        'div',
        { class: 'stat-grid' },
        ...[
          ['Staff', String(t.staff)],
          ['Working', String(t.working)],
          ['Need you', String(t.needsYou)],
          ['Free', String(t.idle)],
          ['Interns', String(t.interns)],
          ['Cost', money(t.costUSD)],
          ['Lines', `+${t.linesAdded} / −${t.linesRemoved}`],
          ['Commits', String(t.commitsToday)],
          ['Sessions', String(t.sessionsToday)],
        ].map(([k, v]) => h('div', null, h('small', null, k), v)),
      ),
    );
    if (s.context.length) {
      body.append(h('h3', null, 'Context windows'));
      for (const c of [...s.context].sort((a, b) => b.pct - a.pct)) {
        body.append(
          h(
            'div',
            { class: 'stat-row' },
            h('b', null, c.displayName),
            bar(c.pct),
            h('span', { class: 'num' }, `${Math.round(c.pct)}%`),
            h('small', { class: 'muted' }, `${Math.round(c.tokens / 1000)}k of ${Math.round(c.windowSize / 1000)}k`),
          ),
        );
      }
    }
  };
  render();
  const unsub = store.subscribe(render);
  const iv = window.setInterval(render, 1000);
  return {
    id: 'stats',
    el,
    dispose: () => {
      unsub();
      window.clearInterval(iv);
    },
  };
}
