// While the office server is unreachable, every button that needs it (hire, answer, let go,
// call back, send, adopt, interrupt, sit down) is disabled and says why. The HUD announces the
// connection state on the bus; buttons opt in with needsServer(). One capturing click listener
// enforces it, so a key press or a scripted click can't slip through either.
import { bus } from './bus';

export const OFFLINE_TIP = "Offline: the office server isn't reachable. This works again once it's back.";

let offline = false;

export function isOffline(): boolean {
  return offline;
}

/** Mark a control that calls the server. It follows the connection state from now on. */
export function needsServer<T extends HTMLElement>(el: T): T {
  el.dataset.needsServer = '';
  apply(el);
  return el;
}

function apply(el: HTMLElement): void {
  const on = offline;
  if (on === (el.dataset.offline === 'true')) return;
  if (on) {
    el.dataset.offline = 'true';
    // Keep whatever tooltip it had (e.g. "Pick a project first") to put back later.
    if (el.hasAttribute('data-co-tip')) el.dataset.tipOnline = el.getAttribute('data-co-tip') ?? '';
    el.setAttribute('data-co-tip', OFFLINE_TIP);
    // aria-disabled may already mean "busy" (an answer in flight): only set it if it's ours to set.
    if (!el.hasAttribute('aria-disabled')) {
      el.setAttribute('aria-disabled', 'true');
      el.dataset.offlineAria = '';
    }
  } else {
    delete el.dataset.offline;
    if (el.dataset.tipOnline !== undefined) {
      el.setAttribute('data-co-tip', el.dataset.tipOnline);
      delete el.dataset.tipOnline;
    } else el.removeAttribute('data-co-tip');
    if (el.dataset.offlineAria !== undefined) {
      el.removeAttribute('aria-disabled');
      delete el.dataset.offlineAria;
    }
  }
}

// Dev builds with ?debug=1: checks can flip the connection state (window.officeOffline(true)).
if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { officeOffline: (on: boolean) => bus.emit('offline', { offline: on }) });
}

if (typeof document !== 'undefined') {
  bus.on('offline', ({ offline: next }) => {
    if (next === offline) return;
    offline = next;
    for (const el of document.querySelectorAll<HTMLElement>('[data-needs-server]')) apply(el);
  });
  // Clicks on a server button go nowhere while offline (Enter and Space on a button are clicks too).
  document.addEventListener(
    'click',
    (ev) => {
      if (!offline) return;
      const hit = (ev.target as Element | null)?.closest?.('[data-needs-server]');
      if (!hit) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    },
    true,
  );
}
