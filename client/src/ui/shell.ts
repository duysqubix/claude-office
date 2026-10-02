// What every docked panel hands the PanelHost. The frame itself is components.ts' panelShell.

export type PanelId = 'employee' | 'chat' | 'hire' | 'archive' | 'roster' | 'help' | 'ask' | 'stats' | 'interns';

export interface Panel {
  id: PanelId;
  el: HTMLElement;
  /** Where keyboard focus goes when the manager opened it themselves (default: the title). */
  focus?(): void;
  /** `E` with the panel open: press its button marked E (or focus its ask card). False: it has none. */
  pressE?(): boolean;
  /** Stop timers and subscriptions. The host removes the element after its out animation. */
  dispose?(): void;
}
