// The intern desk's list: every subagent, what it's doing, and who it works for.
import type { RosterStore } from '../net';
import { PALETTE } from '../style/palette';
import { clear, h, truncate } from './dom';
import { shell, type Panel } from './shell';

/** "oh-my-claudecode:executor" → "executor". */
export const internType = (type: string): string => type.replace(/^.*:/, '') || 'intern';

export function internsPanel(store: RosterStore, close: () => void, walkTo: (bossId: string) => void): Panel {
  const list = h('div', { class: 'roster' });
  const el = shell('Interns', PALETTE.carpetAlt, [list], close, [], 'panel-interns');
  const render = () => {
    clear(list);
    const rows = store.employees.flatMap((boss) => boss.interns.map((i) => ({ boss, i })));
    rows.sort((a, b) => Number(b.i.active) - Number(a.i.active) || a.boss.displayName.localeCompare(b.boss.displayName));
    if (!rows.length) list.append(h('p', { class: 'muted' }, 'No interns right now. They show up when someone delegates (subagents).'));
    for (const { boss, i } of rows) {
      const row = h(
        'button',
        { class: `roster-row ${i.active ? 'st-working' : 'st-idle'}`, type: 'button', style: `--c:${i.active ? PALETTE.stateWorking : PALETTE.stateIdle}`, title: `Go to ${boss.displayName}` },
        h('i', { class: 'dot' }),
        h('span', { class: 'who' }, h('b', null, internType(i.type)), h('small', null, `for ${boss.displayName}`)),
        h('span', { class: 'what' }, truncate(i.description || 'Helping out', 60)),
        h('span', { class: 'mini-chip' }, i.active ? 'working' : 'waiting'),
      );
      row.addEventListener('click', () => {
        close();
        walkTo(boss.sessionId);
      });
      list.append(row);
    }
  };
  render();
  const unsub = store.subscribe(render);
  return { id: 'interns', el, dispose: unsub };
}
