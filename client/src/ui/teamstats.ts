// The Team Room numbers as HTML (UX.md §3.5): the twin of the wall board the world draws, for the
// plan meter's panel and for screen readers. Plan gauges with reset countdowns, today's team
// numbers, and how full each employee's context window is.
import type { PlanLimit, TeamStats } from '../../../shared/protocol';
import { el, fmtDuration, fmtInt, fmtMoney, fmtTokens, markup, type Markup } from './el';
import './theme.css';

const INK = '#2B2D42';
const TRACK = '#F3EBDA';
const DANGER = '#C92A3A';
const SKY = '#5CC8FF';
/** Plan usage and context fill turn red from here (UX.md §2, §3.5). */
export const HIGH_PLAN = 80;
export const HIGH_CONTEXT = 85;

/** A sticker ring gauge: ink outline, paper-2 track, coloured value arc (starts at 12 o'clock via CSS rotate). */
export function ringSvg(pct: number, size: number, stroke: number, color: string): Markup {
  const c = size / 2;
  const r = (size - stroke - 3) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, pct / 100));
  return markup(
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${INK}" stroke-width="${stroke + 3}"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${stroke}"/>` +
    (v > 0
      ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(len * v).toFixed(2)} ${len.toFixed(2)}"/>`
      : '') +
    `</svg>`
  );
}

/** "resets in 1h 12m" (or "resets soon"). */
export function resetText(limit: PlanLimit, now: number): string {
  if (!limit.resetsAt) return '';
  const left = limit.resetsAt - now;
  return left > 60_000 ? `resets in ${fmtDuration(left)}` : 'resets soon';
}

/** The HUD plan meter (UX.md §2): one small ring per limit. Hidden by the caller while plan.updatedAt is null. */
export function planMeter(limits: readonly PlanLimit[], now: number, onClick?: () => void): HTMLButtonElement {
  const btn = el('button', { class: 'co-meter', attrs: { type: 'button' } });
  const tips: string[] = [];
  for (const l of limits) {
    const pct = Math.round(l.usedPct);
    const high = pct >= HIGH_PLAN;
    btn.append(
      el('span', { class: `co-meter__item${high ? ' is-high' : ''}`, html: ringSvg(pct, 18, 3, high ? DANGER : INK) }, `${l.label} `, el('b', null, `${pct}%`)),
    );
    const reset = resetText(l, now);
    tips.push(`${l.label} limit: ${pct}% used${reset ? ', ' + reset : ''}`);
  }
  if (!tips.length) {
    btn.append('Plan');
    tips.push('Plan usage not reported yet');
  }
  btn.setAttribute('aria-label', tips.join('. '));
  btn.setAttribute('data-co-tip', tips.join('; '));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export interface TeamStatsOptions {
  /** Portrait for a session id (faces.ts employeeFace). */
  face?: (sessionId: string) => Markup;
  /** Clicking someone's context row: go to them. */
  onGo?: (sessionId: string) => void;
  now?: number;
}

/** Render the whole Team Room view into `container` (replacing what was there). */
export function renderTeamStats(container: HTMLElement, stats: TeamStats, opts: TeamStatsOptions = {}): HTMLElement {
  const now = opts.now ?? Date.now();
  const root = el('div', { class: 'co-stats' });

  // Plan
  root.append(el('h3', { class: 'co-section' }, 'Plan'));
  if (stats.plan.updatedAt === null || !stats.plan.limits.length) {
    root.append(el('p', { class: 'co-muted' }, 'Plan usage shows up here once a Claude Code session reports it.'));
  } else {
    const gauges = el('div', { class: 'co-gauges' });
    for (const l of stats.plan.limits) {
      const pct = Math.round(l.usedPct);
      const high = pct >= HIGH_PLAN;
      gauges.append(
        el(
          'div',
          { class: `co-gauge${high ? ' is-high' : ''}`, attrs: { role: 'img', 'aria-label': `${l.label} limit: ${pct}% used. ${resetText(l, now)}` } },
          el('div', { class: 'co-gauge__ring', html: ringSvg(pct, 72, 10, high ? DANGER : SKY) }, el('b', null, `${pct}%`)),
          el('span', { class: 'co-gauge__label' }, l.label),
          el('span', { class: 'co-gauge__reset' }, resetText(l, now)),
        ),
      );
    }
    root.append(gauges);
  }

  // Today
  const t = stats.team;
  const tile = (value: string, label: string) => el('div', { class: 'co-tile' }, el('b', null, value), el('span', null, label));
  root.append(
    el('h3', { class: 'co-section' }, 'Today'),
    el(
      'div',
      { class: 'co-tiles' },
      tile(String(t.staff), t.staff === 1 ? 'person in' : 'people in'),
      tile(String(t.working), 'working'),
      tile(String(t.needsYou), t.needsYou === 1 ? 'needs you' : 'need you'),
      tile(String(t.interns), t.interns === 1 ? 'intern' : 'interns'),
      tile(String(t.sessionsToday), t.sessionsToday === 1 ? 'session' : 'sessions'),
      tile(String(t.commitsToday), t.commitsToday === 1 ? 'commit' : 'commits'),
      tile(fmtMoney(t.costUSD), 'spent'),
      tile(`+${fmtInt(t.linesAdded)}`, 'lines added'),
      tile(`−${fmtInt(t.linesRemoved)}`, 'lines removed'),
    ),
  );

  // Context
  root.append(el('h3', { class: 'co-section' }, 'Context'));
  if (!stats.context.length) {
    root.append(el('p', { class: 'co-muted' }, 'Nobody has started a conversation yet.'));
  } else {
    const list = el('div', { class: 'co-list' });
    for (const c of [...stats.context].sort((a, b) => b.pct - a.pct)) {
      const pct = Math.round(c.pct);
      const high = pct >= HIGH_CONTEXT;
      const row = el(
        'button',
        {
          class: 'co-ctx',
          attrs: {
            'data-session': c.sessionId,
            type: 'button',
            'aria-label': `${c.displayName}: context ${pct}% full, ${fmtTokens(c.tokens)} of ${fmtTokens(c.windowSize)} tokens${high ? '. Nearly full: expect a /compact' : ''}`,
          },
        },
        el('span', { html: opts.face?.(c.sessionId) }),
        el('span', { class: 'co-ctx__name' }, c.displayName),
        el('span', { class: `co-bar${high ? ' is-high' : ''}`, style: `--pct: ${Math.min(100, Math.max(0, pct))}%` }, el('i')),
        el('span', { class: 'co-ctx__pct' }, `${pct}%`),
      );
      if (opts.onGo) row.addEventListener('click', () => opts.onGo!(c.sessionId));
      list.append(row);
    }
    root.append(list);
  }

  // Re-rendered every ~15 s: keep the reader's place (scroll and the focused row).
  const focused = container.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.session : undefined;
  const scroll = container.scrollTop;
  container.replaceChildren(root);
  container.scrollTop = scroll;
  if (focused) root.querySelector<HTMLElement>(`[data-session="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  return root;
}
