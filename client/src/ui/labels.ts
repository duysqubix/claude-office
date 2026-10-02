// Labels over people (UX.md §2.1), drawn with CSS2DRenderer: a name pill (click = go to them),
// a glass speech bubble when you're close, the amber needs-you bubble and bouncing "!" always,
// Z z z for sleepers, thinking dots, a "!" pop when you bump someone, and "<type> for <boss>"
// pills over interns. Also drives the off-screen faces for people who need you.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { EmployeeChar } from '../chars/employee';
import type { InternChar } from '../chars/intern';
import type { RegularChar } from '../chars/npc';
import { bus } from './bus';
import { bangMarker, zzz } from './components';
import { truncate, waitingLines } from './dom';
import { createEdgeIndicators, type EdgeTarget, type EdgeViewport } from './edge';
import { el, type Markup } from './el';
import { plainText, visibleText } from './markdown';
import { employeeFace, faceSvg } from './faces';
import { stateBadge, STATE_WORD } from './icons';
import { daydream, thoughtsOn } from './thoughts';

/** Chatter bubbles: within this many metres of the manager, the nearest few only. */
const BUBBLE_RANGE = 7;
const MAX_BUBBLES = 3;
/** At most this many name pills (people who need you always get one). */
const MAX_PILLS = 10;
/** A bubble's text changes at most this often. */
const BUBBLE_HOLD_MS = 800;
/** Regulars (NPC coworkers): name pills only this close, a few at a time; their own bubble budget. */
const REGULAR_PILL_RANGE = 6;
const MAX_REGULAR_PILLS = 4;
const REGULAR_BUBBLE_RANGE = 10;
const MAX_REGULAR_BUBBLES = 3;
const _p = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _ndc = new THREE.Vector3();
/** Bubbles keep this far inside the window, the HUD and an open panel. */
const MARGIN = 12;
/** Bubble sizes are re-measured this often (frames); text changes are rare. */
const MEASURE_EVERY = 6;

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
/** A thought stays up this long (then fades over 400 ms). */
const THOUGHT_MS = 6000;
/** Regulars daydream every 20–40 s, one at a time. */
const DAYDREAM_MS = [20_000, 40_000];
/** Panels go to a bottom sheet below this width (theme.css). */
const SHEET = typeof window !== 'undefined' ? window.matchMedia('(max-width: 899px)') : null;

/** Restart an element's CSS animation without a forced layout (no `void el.offsetWidth`). */
function replay(node: HTMLElement): void {
  for (const a of node.getAnimations()) {
    a.cancel();
    a.play();
  }
}

/**
 * A thought cloud (thoughts.ts): soft cloud, trailing puffs, italic words. Plain text only
 * (textContent). Shows while `sync(true)` and the thought lasts, then fades out.
 */
class Cloud {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private until = 0;
  private shown = false;
  private hideTimer = 0;

  constructor() {
    this.text = el('span', { class: 'co-thought__text' });
    this.el = el(
      'div',
      { class: 'co-thought', attrs: { hidden: true, 'aria-hidden': 'true' } },
      this.text,
      el('i', { class: 'co-thought__puff' }),
      el('i', { class: 'co-thought__puff' }),
      el('i', { class: 'co-thought__puff' }),
    );
  }

  think(text: string, now = performance.now()): void {
    // Plain text, and nothing that steers how it reads (the server strips these too).
    this.text.textContent = truncate(text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ''), 120);
    this.until = now + THOUGHT_MS;
  }

  has(now: number): boolean {
    return this.until > now;
  }

  clear(): void {
    this.until = 0;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  sync(ok: boolean, now: number): void {
    const want = ok && this.until > now;
    if (want === this.shown) return;
    this.shown = want;
    window.clearTimeout(this.hideTimer);
    if (want) {
      this.el.classList.remove('is-out');
      this.el.hidden = false;
      return;
    }
    this.el.classList.add('is-out');
    this.hideTimer = window.setTimeout(() => {
      if (!this.shown) this.el.hidden = true;
    }, 400);
  }
}

class Tag {
  readonly obj: CSS2DObject;
  readonly cloud = new Cloud();
  /** A thought may show this frame (LabelLayer's budget and distance rules said so). */
  thoughtOk = false;
  readonly head = new THREE.Vector3();
  /** Distance to the manager this frame (for ordering). */
  dist = 0;
  /** This person's edge-face target, updated in place. */
  readonly target: EdgeTarget;
  private root: HTMLElement;
  private bang: HTMLElement;
  private bump: HTMLElement;
  private zzz: HTMLElement;
  private bubble: HTMLElement;
  private thought: HTMLElement;
  private pill: HTMLElement;
  private pillBadge: HTMLElement;
  private pillName: HTMLElement;
  private last: Record<string, string | boolean | number> = {};
  private bubbleAt = 0;
  private bumpTimer = 0;
  private faces = new Map<string, Markup>();
  /** Needs-you lines, worked out once per ask / waitingFor. */
  private needsSrc = '\u0000';
  private needs: { line1: string; line2: string; code: string; fact: string } = { line1: '', line2: '', code: '', fact: '' };
  /** lastText as one plain line, worked out once per text. */
  private saidSrc = '\u0000';
  private saidPlain = '';

  constructor(
    readonly e: EmployeeChar,
    onBubbleClick: (e: EmployeeChar) => void,
  ) {
    this.bang = bangMarker();
    this.bang.hidden = true;
    this.bump = bangMarker('bump');
    this.bump.hidden = true;
    this.zzz = zzz();
    this.zzz.hidden = true;
    this.bubble = el('div', { class: 'co-bubble', attrs: { hidden: true } });
    // The needs-you bubble is a button: click it to answer.
    this.bubble.addEventListener('click', () => {
      if (this.bubble.classList.contains('co-bubble--needs')) onBubbleClick(this.e);
    });
    this.thought = el('div', { class: 'co-bubble co-bubble--think', attrs: { hidden: true, 'aria-hidden': 'true' } }, el('span', { class: 'co-typing__dots' }, el('i'), el('i'), el('i')));
    this.pillBadge = el('span');
    this.pillName = el('span');
    this.pill = el('button', { class: 'co-pill', attrs: { type: 'button', tabindex: -1 } }, this.pillBadge, this.pillName);
    this.pill.addEventListener('click', () => bus.emit('go-to', { id: this.e.data.sessionId }));
    this.root = el('div', { class: 'co-tagstack' }, this.bang, this.bump, this.zzz, this.thought, this.cloud.el, this.bubble, this.pill);
    this.obj = new CSS2DObject(this.root);
    this.obj.center.set(0.5, 1);
    e.labelAnchor.add(this.obj);
    this.target = { id: e.data.sessionId, position: this.head, faceSvg: this.face(), urgent: true };
  }

  /** What they say when they need you: [line 1, line 2 or a command, the plain fact]. */
  needsLines() {
    const d = this.e.data;
    const src = `${d.ask?.id ?? ''}|${d.waitingFor ?? ''}`;
    if (src !== this.needsSrc) {
      this.needsSrc = src;
      if (d.ask) {
        const first = d.ask.kind === 'permission' ? (d.ask.detail ?? '').slice(0, 400).split('\n').find((l) => l.trim()) : '';
        this.needs = { line1: truncate(d.ask.title, 40), code: first ? truncate(visibleText(first), 36) : '', line2: first ? '' : 'Click or press E to answer', fact: d.ask.title };
      } else {
        const [said, fact] = waitingLines(d);
        this.needs = { line1: said, line2: fact, code: '', fact };
      }
    }
    return this.needs;
  }

  /** What someone at their desk says when you're close (UX.md §2.1). */
  private line(): string {
    const e = this.e;
    const d = e.data;
    switch (d.state) {
      case 'working':
        return truncate(d.activity?.label ?? 'Thinking…', 60);
      case 'idle':
        if (e.stateAge < 3 || !d.lastText) return 'Done!';
        if (d.lastText !== this.saidSrc) {
          this.saidSrc = d.lastText;
          this.saidPlain = truncate(plainText(d.lastText), 70);
        }
        return this.saidPlain;
      case 'starting':
        return 'Getting settled…';
      default:
        return '';
    }
  }

  /** Their portrait for the edge marker (cached; hosted changes it). */
  face(): Markup {
    const key = `${this.e.data.hosted}`;
    let f = this.faces.get(key);
    if (!f) this.faces.set(key, (f = employeeFace(this.e.data.sessionId, this.e.data.hosted, { size: 56 })));
    return f;
  }

  private set(key: string, v: string | boolean | number, apply: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    apply();
  }

  bumped(): void {
    window.clearTimeout(this.bumpTimer);
    const b = this.bump;
    // Showing it starts the pop; a second bump while it shows restarts it.
    if (b.hidden) b.hidden = false;
    else replay(b);
    this.bumpTimer = window.setTimeout(() => (b.hidden = true), 900);
  }

  /**
   * `pillFade` 0–1 (0 hides it); `bubbleAllowed`: one of the nearest few; `inReach`: within the
   * pill range, where a needs-you bubble shows (beyond it, just the "!" and the pill).
   */
  update(camDist: number, mgrDist: number, pillFade: number, bubbleAllowed: boolean, inReach: boolean, onScreen = true): void {
    const e = this.e;
    const d = e.data;
    const st = d.state;
    const needs = e.handUp;
    const walking = e.phase === 'entering' || e.phase === 'leaving';

    this.set('name', d.displayName, () => {
      this.pillName.textContent = d.displayName;
      this.pill.setAttribute('aria-label', `Go to ${d.displayName}`);
    });
    this.set('state', st, () => {
      this.pillBadge.innerHTML = stateBadge(st);
      this.root.dataset.state = st;
      this.pill.title = `${d.displayName}: ${STATE_WORD[st].toLowerCase()}`;
    });
    const fade = needs ? 1 : Math.round(pillFade * 20) / 20;
    this.set('pill', fade, () => {
      this.pill.style.opacity = fade >= 1 ? '' : String(fade);
      this.pill.hidden = fade <= 0.01;
    });

    const bang = needs && e.phase !== 'leaving';
    this.set('bang', bang, () => (this.bang.hidden = !bang));

    // What the bubble says (UX.md §2.1): needs-you always; chatter only close up.
    let kind = '';
    let text = '';
    let line1 = '';
    let line2 = '';
    let code = '';
    const now = performance.now();
    // A thought takes the place of their chatter; what they say out loud and needing you win.
    // A head off the screen shows no bubble at all (needs-you has its edge face instead).
    const quip = e.quipping && camDist < 24 && onScreen;
    const thinkAloud = this.thoughtOk && onScreen && !needs && !quip && this.cloud.has(now);
    this.cloud.sync(thinkAloud, now);
    if (quip) {
      kind = 'say';
      text = e.quipText;
    } else if (needs && !walking) {
      if (inReach && onScreen) {
        kind = 'needs';
        ({ line1, line2, code } = this.needsLines());
      }
    } else if (!thinkAloud && onScreen && bubbleAllowed && mgrDist < BUBBLE_RANGE && st !== 'sleeping') {
      kind = 'say';
      if (e.phase === 'entering') text = new Date().getHours() < 12 ? 'Morning!' : 'Hi!';
      else if (e.phase === 'leaving') text = 'Bye!';
      else if (e.seated) text = this.line();
    }
    if (kind === 'say' && !text) kind = '';
    const key = `${kind}|${text}|${line1}|${line2}|${code}`;
    // Needs-you changes land at once; chatter at most every 800 ms so it stays readable.
    if (key !== this.last.bubble && (kind === 'needs' || this.last.kind === 'needs' || now - this.bubbleAt >= BUBBLE_HOLD_MS || !kind)) {
      const was = this.last.kind;
      this.last.bubble = key;
      this.last.kind = kind;
      this.bubbleAt = now;
      this.bubble.hidden = !kind;
      if (kind) {
        this.bubble.classList.toggle('co-bubble--needs', kind === 'needs');
        if (kind === 'needs') {
          this.bubble.replaceChildren(
            el(
              'span',
              { class: 'co-bubble__lines' },
              el('span', { class: 'co-bubble__line1' }, line1),
              code ? el('span', { class: 'co-bubble__code' }, code) : line2 ? el('span', { class: 'co-bubble__line2' }, line2) : null,
            ),
          );
          this.bubble.setAttribute('role', 'button');
          this.bubble.setAttribute('aria-label', `${d.displayName}: ${line1}. Answer`);
        } else {
          this.bubble.replaceChildren(el('span', { class: 'co-bubble__text' }, text));
          this.bubble.removeAttribute('role');
          this.bubble.removeAttribute('aria-label');
        }
        // A new line nudges the bubble (unless it just popped in).
        if (was === kind) {
          if (this.bubble.classList.contains('is-bumped')) replay(this.bubble);
          else this.bubble.classList.add('is-bumped');
        }
      }
    }

    const thinking = e.seated && st === 'working' && d.activity?.kind === 'thinking' && this.bubble.hidden && !thinkAloud && camDist < 18;
    this.set('thought', thinking, () => (this.thought.hidden = !thinking));
    const sleeping = e.seated && st === 'sleeping' && camDist < 26;
    this.set('zzz', sleeping, () => (this.zzz.hidden = !sleeping));
    // Walking people carry their labels a little higher.
    this.set('lift', walking, () => this.root.classList.toggle('is-walking', walking));
  }

  dispose(): void {
    window.clearTimeout(this.bumpTimer);
    this.obj.removeFromParent();
    this.root.remove();
  }
}

/** A small pill over an intern: what kind of subagent, and whose. */
class InternTag {
  readonly obj: CSS2DObject;
  private root: HTMLElement;
  private pill: HTMLElement;
  private shown = '';

  constructor(readonly i: InternChar) {
    const type = i.data.type.replace(/^.*:/, '') || 'intern';
    this.pill = el(
      'span',
      { class: 'co-pill co-pill--intern', attrs: { title: `${type}, an intern for ${i.boss.name}` } },
      el('span', { class: 'co-pill__face', html: faceSvg(i.rig.looks, { size: 22 }) }),
      `${type} for ${i.boss.name}`,
    );
    this.root = el('div', { class: 'co-tagstack' }, this.pill);
    this.obj = new CSS2DObject(this.root);
    this.obj.center.set(0.5, 1);
    i.labelAnchor.add(this.obj);
  }

  update(camDist: number): void {
    const fade = THREE.MathUtils.clamp(1 - (camDist - 9) / 5, 0, 1);
    const key = `${Math.round(fade * 10)}`;
    if (key === this.shown) return;
    this.shown = key;
    this.pill.style.opacity = String(fade);
    this.pill.hidden = fade <= 0.01;
  }

  dispose(): void {
    this.obj.removeFromParent();
    this.root.remove();
  }
}

/**
 * Over a regular (an NPC coworker, not a session): a small muted name pill up close (no state,
 * not a button), what they say, and the bump pop. Never an edge face or a needs-you bubble.
 */
class RegularTag {
  readonly obj: CSS2DObject;
  /** Daydreams (thoughts.ts). */
  readonly cloud = new Cloud();
  private root: HTMLElement;
  private pill: HTMLElement;
  private bubble: HTMLElement;
  private bump: HTMLElement;
  private shown = -1;
  private said = '';
  private bumpTimer = 0;

  constructor(readonly r: RegularChar) {
    this.bump = bangMarker('bump');
    this.bump.hidden = true;
    this.bubble = el('div', { class: 'co-bubble', attrs: { hidden: true } });
    this.pill = el('span', { class: 'co-pill co-pill--regular', attrs: { hidden: true, title: `${r.name}, ${r.profile.dept}` } }, r.name);
    this.root = el('div', { class: 'co-tagstack' }, this.bump, this.cloud.el, this.bubble, this.pill);
    this.obj = new CSS2DObject(this.root);
    this.obj.center.set(0.5, 1);
    this.obj.visible = false;
    r.labelAnchor.add(this.obj);
  }

  bumped(): void {
    window.clearTimeout(this.bumpTimer);
    const b = this.bump;
    b.hidden = false;
    this.obj.visible = true;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    this.bumpTimer = window.setTimeout(() => (b.hidden = true), 900);
  }

  /** `pillFade` 0–1; `say`: their line, or '' for none. */
  update(pillFade: number, say: string): void {
    const fade = Math.round(pillFade * 10) / 10;
    if (fade !== this.shown) {
      this.shown = fade;
      this.pill.style.opacity = fade >= 1 ? '' : String(fade);
      this.pill.hidden = fade <= 0;
    }
    if (say !== this.said) {
      const was = this.said;
      this.said = say;
      this.bubble.hidden = !say;
      if (say) {
        this.bubble.replaceChildren(el('span', { class: 'co-bubble__text' }, say));
        if (was) {
          this.bubble.classList.remove('is-bumped');
          void this.bubble.offsetWidth;
          this.bubble.classList.add('is-bumped');
        }
      }
    }
    // Nothing to show: skip the element entirely.
    this.obj.visible = !this.pill.hidden || !this.bubble.hidden || !this.bump.hidden || this.cloud.visible;
  }

  dispose(): void {
    window.clearTimeout(this.bumpTimer);
    this.obj.removeFromParent();
    this.root.remove();
  }
}

export class LabelLayer {
  readonly renderer = new CSS2DRenderer();
  private tags = new Map<EmployeeChar, Tag>();
  private internTags = new Map<InternChar, InternTag>();
  private regularTags = new Map<RegularChar, RegularTag>();
  private edges: ReturnType<typeof createEdgeIndicators>;
  /** Keep edge faces clear of an open panel: its box, measured a few times a second. */
  private inset: EdgeViewport['inset'] = {};
  private panelEl: HTMLElement | null = null;
  private insetAt = 0;
  private visible = true;
  private vw = window.innerWidth;
  private vh = window.innerHeight;
  /** When the next regular may daydream. */
  private nextDaydream = performance.now() + 6000 + Math.random() * 10_000;
  /** Where bubbles may not go: the HUD's corners and an open panel (measured twice a second). */
  private zones: Box[] = [];
  private zonesAt = 0;
  private frame = 0;
  private measured = new WeakMap<HTMLElement, { w: number; h: number; top: number; rootH: number; at: number }>();
  /** The last shift written per bubble, so unchanged ones aren't touched. */
  private shifts = new WeakMap<HTMLElement, string>();
  /** Reused every frame. */
  private order: Tag[] = [];
  private targets: EdgeTarget[] = [];
  /** Clicked someone's needs-you bubble. */
  onBubbleClick: (e: EmployeeChar) => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer.domElement.className = 'labels';
    container.append(this.renderer.domElement);
    this.edges = createEdgeIndicators(document.getElementById('ui') ?? container, (id) => bus.emit('go-to', { id }));
    // Thoughts: a session's (from the server, or the demo's), and the switch in Help.
    bus.on('thought', ({ id, text }) => {
      if (!thoughtsOn()) return;
      for (const t of this.order) if (t.e.data.sessionId === id) t.cloud.think(text);
    });
    bus.on('thoughts', ({ on }) => {
      if (on) return;
      for (const t of this.order) t.cloud.clear();
      for (const t of this.regularTags.values()) t.cloud.clear();
    });
    bus.on('panel', (p) => {
      this.panelEl = p.open ? (p.el ?? null) : null;
      this.insetAt = 0;
    });
    this.resize();
  }

  resize(): void {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.renderer.setSize(this.vw, this.vh);
    this.insetAt = 0;
  }

  /** The open panel's edge, from its layout box (it widens for terminals and plans; windows resize). */
  private measureInset(): void {
    const p = this.panelEl;
    if (!p?.isConnected || p.classList.contains('is-out')) this.inset = {};
    else if (SHEET?.matches) this.inset = { bottom: this.vh - p.offsetTop + 16 };
    else this.inset = { right: this.vw - p.offsetLeft + 16 };
  }

  attach(e: EmployeeChar): void {
    if (this.tags.has(e)) return;
    this.tags.set(e, new Tag(e, (x) => this.onBubbleClick(x)));
    this.order = [...this.tags.values()];
  }

  detach(e: EmployeeChar): void {
    this.tags.get(e)?.dispose();
    this.tags.delete(e);
    this.order = [...this.tags.values()];
  }

  attachIntern(i: InternChar): void {
    if (!this.internTags.has(i)) this.internTags.set(i, new InternTag(i));
  }

  detachIntern(i: InternChar): void {
    this.internTags.get(i)?.dispose();
    this.internTags.delete(i);
  }

  bumped(e: EmployeeChar): void {
    this.tags.get(e)?.bumped();
  }

  attachRegular(r: RegularChar): void {
    if (!this.regularTags.has(r)) this.regularTags.set(r, new RegularTag(r));
  }

  detachRegular(r: RegularChar): void {
    this.regularTags.get(r)?.dispose();
    this.regularTags.delete(r);
  }

  bumpedRegular(r: RegularChar): void {
    this.regularTags.get(r)?.bumped();
  }

  /** Hide everything (e.g. while sitting at someone's terminal). */
  setVisible(v: boolean): void {
    this.visible = v;
    this.renderer.domElement.style.visibility = v ? '' : 'hidden';
  }

  update(manager: THREE.Vector3, camera: THREE.Camera): void {
    camera.getWorldPosition(_cam);
    // Pills reach farther the farther out the camera is (UX.md §2.1).
    const reach = Math.max(10, _cam.distanceTo(manager) + 2);
    const order = this.order;
    for (const t of order) t.dist = Math.hypot(t.e.position.x - manager.x, t.e.position.z - manager.z);
    order.sort((a, b) => a.dist - b.dist);
    let pills = 0;
    const now = performance.now();
    // Thoughts are rare and short: within the pill reach, they get the bubble budget first.
    let bubbles = 0;
    for (const t of order) {
      t.thoughtOk = bubbles < MAX_BUBBLES && !t.e.handUp && t.dist <= reach && t.cloud.has(now);
      if (t.thoughtOk) bubbles++;
    }
    const targets = this.targets;
    targets.length = 0;
    for (const t of order) {
      const d = t.dist;
      t.e.labelAnchor.getWorldPosition(_p);
      t.head.copy(_p);
      const camDist = _p.distanceTo(_cam);
      const fade = t.e.handUp ? 1 : pills < MAX_PILLS ? THREE.MathUtils.clamp((reach - d) / 3, 0, 1) : 0;
      if (fade > 0 && !t.e.handUp) pills++;
      const chatty = !t.e.handUp && !t.thoughtOk && bubbles < MAX_BUBBLES && d < BUBBLE_RANGE;
      if (chatty) bubbles++;
      t.update(camDist, d, fade, chatty, d <= reach, this.onScreen(_p, camera));

      const e = t.e;
      if (e.handUp && e.phase !== 'leaving' && e.phase !== 'gone') {
        const tg = t.target;
        const fact = t.needsLines().fact;
        tg.faceSvg = t.face();
        tg.name = e.data.displayName;
        tg.tooltip = `Go to ${e.data.displayName} (${fact.charAt(0).toLowerCase()}${fact.slice(1).replace(/[.!?]+$/, '')})`;
        tg.since = e.data.stateSince;
        targets.push(tg);
      }
    }
    for (const it of this.internTags.values()) {
      it.i.labelAnchor.getWorldPosition(_p);
      it.update(_p.distanceTo(_cam));
    }
    // Regulars: a quiet pill for the nearest few up close, and their lines (ones that matter,
    // like "All yours!", carry across the room). They never use the sessions' budgets.
    const regulars = [...this.regularTags.values()]
      .map((t) => ({ t, d: Math.hypot(t.r.position.x - manager.x, t.r.position.z - manager.z) }))
      .sort((a, b) => a.d - b.d);
    let regularPills = 0;
    let regularBubbles = 0;
    const inView = new Set<RegularTag>();
    for (const { t, d } of regulars) {
      const fade = regularPills < MAX_REGULAR_PILLS ? THREE.MathUtils.clamp((REGULAR_PILL_RANGE - d) / 1.5, 0, 1) : 0;
      if (fade > 0) regularPills++;
      const r = t.r;
      r.labelAnchor.getWorldPosition(_p);
      const seen = this.onScreen(_p, camera);
      if (seen) inView.add(t);
      const heard = seen && r.quipping && regularBubbles < MAX_REGULAR_BUBBLES && (d < REGULAR_BUBBLE_RANGE || (r.quipLoud && d < 24));
      if (heard) regularBubbles++;
      // A daydream shows close up, and steps aside for anything they say.
      const dreaming = seen && !heard && !r.quipping && d < REGULAR_BUBBLE_RANGE && t.cloud.has(now) && regularBubbles < MAX_REGULAR_BUBBLES;
      if (dreaming) regularBubbles++;
      t.cloud.sync(dreaming, now);
      t.update(fade, heard ? r.quipText : '');
    }
    // Now and then one regular nearby, at their desk or on a break, daydreams (one at a time).
    if (now >= this.nextDaydream) {
      // Nobody close enough to see it: look again in a few seconds, not a whole interval later.
      this.nextDaydream = now + 3000;
      if (thoughtsOn() && !regulars.some(({ t }) => t.cloud.has(now))) {
        const pool = regulars.filter(({ t, d }) => inView.has(t) && d < REGULAR_BUBBLE_RANGE && !t.r.quipping && (t.r.phase === 'seated' || t.r.hanging));
        const one = pool[Math.floor(Math.random() * pool.length)];
        if (one) {
          one.t.cloud.think(daydream(one.t.r), now);
          this.nextDaydream = now + DAYDREAM_MS[0] + Math.random() * (DAYDREAM_MS[1] - DAYDREAM_MS[0]);
        }
      }
    }
    // Longest waiting first: they win when markers merge.
    if (targets.length > 1) targets.sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    if (now - this.insetAt > 250) {
      this.insetAt = now;
      this.measureInset();
    }
    // Every bubble stays whole on screen, clear of the HUD and the panel (tails still point home).
    if (this.visible) this.clampBubbles(camera, now);
    // A bottom sheet (narrow windows) leaves no free edge for faces; the panel has the floor.
    const room = this.visible && this.inset?.bottom === undefined;
    this.edges.updateEdgeIndicators(camera, { width: this.vw, height: this.vh, inset: this.inset }, room ? targets : []);
  }

  /** Is this head on the screen? (Projects with the camera's current matrices.) */
  private onScreen(world: THREE.Vector3, camera: THREE.Camera): boolean {
    _ndc.copy(world).project(camera);
    return _ndc.z < 1 && _ndc.x >= -1 && _ndc.x <= 1 && _ndc.y >= -1 && _ndc.y <= 1;
  }

  /**
   * Slide each visible bubble (speech, needs-you and its "!", thought, the thinking dots) so its box sits
   * MARGIN inside the window and clear of the HUD and an open panel. The shift goes to
   * `translate` (the bubbles' own animations use `transform`) and to --shift, which keeps the
   * tail or the puffs pointing at the head.
   */
  private clampBubbles(camera: THREE.Camera, now: number): void {
    this.frame++;
    if (now - this.zonesAt > 500) {
      this.zonesAt = now;
      this.zones = [];
      for (const z of document.querySelectorAll<HTMLElement>('.co-hud__badge, .co-hud__needs > *, .co-hud__row, .co-hud__right, .co-hud__banner')) {
        if (z.hidden) continue;
        const r = z.getBoundingClientRect();
        // The buttons' key caps hang below them.
        const hang = z.classList.contains('co-hud__right') ? 10 : 0;
        if (r.width > 0 && r.height > 0) this.zones.push({ l: r.left, t: r.top, r: r.right, b: r.bottom + hang });
      }
      const p = this.panelEl;
      if (p?.isConnected && !p.classList.contains('is-out')) {
        const r = p.getBoundingClientRect();
        this.zones.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
    }
    camera.updateMatrixWorld();
    const stacks: { root: HTMLElement; anchor: THREE.Object3D }[] = [];
    for (const t of this.order) if (t.cloud.el.parentElement) stacks.push({ root: t.cloud.el.parentElement, anchor: t.e.labelAnchor });
    for (const t of this.regularTags.values()) if (t.obj.visible && t.cloud.el.parentElement) stacks.push({ root: t.cloud.el.parentElement, anchor: t.r.labelAnchor });
    for (const { root, anchor } of stacks) {
      const items = [...root.children].filter(
        (c): c is HTMLElement => c instanceof HTMLElement && !c.hidden && (c.classList.contains('co-bubble') || c.classList.contains('co-thought') || c.classList.contains('co-bang')),
      );
      if (!items.length) continue;
      anchor.getWorldPosition(_p);
      _ndc.copy(_p).project(camera);
      const ax = ((_ndc.x + 1) / 2) * this.vw;
      const ay = ((1 - _ndc.y) / 2) * this.vh;
      this.clampStack(items, root, ax, ay);
    }
  }

  /**
   * One label's bubbles move together up and down (so the "!", the cloud and the bubble never
   * overlap), and each slides sideways on its own (so each stays centred over the head if it can).
   */
  private clampStack(items: HTMLElement[], root: HTMLElement, ax: number, ay: number): void {
    const shifts: { el: HTMLElement; dx: number; dy: number }[] = [];
    for (const el of items) {
      let m = this.measured.get(el);
      if (!m || this.frame - m.at >= MEASURE_EVERY) {
        m = { w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop, rootH: root.offsetHeight, at: this.frame };
        this.measured.set(el, m);
      }
      // Where it sits unshifted: centred over the head, at its place in the stack above it.
      const box = { l: ax - m.w / 2, t: ay - m.rootH + m.top, r: ax + m.w / 2, b: ay - m.rootH + m.top + m.h };
      shifts.push({ el, ...this.fit(box) });
    }
    // Down together by the most any of them needs (or up, if one would hang off the bottom).
    const down = Math.max(0, ...shifts.map((s) => s.dy));
    const dy = down > 0 ? down : Math.min(0, ...shifts.map((s) => s.dy));
    for (const s of shifts) {
      const key = `${Math.round(s.dx)},${Math.round(dy)}`;
      if (this.shifts.get(s.el) === key) continue;
      this.shifts.set(s.el, key);
      s.el.style.translate = key === '0,0' ? '' : `${Math.round(s.dx)}px ${Math.round(dy)}px`;
      s.el.style.setProperty('--shift', `${Math.round(s.dx)}px`);
    }
  }

  /** The smallest shift that puts `box` MARGIN inside the window and off the HUD and the panel. */
  private fit(box: Box): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    const fitWindow = () => {
      if (box.l + dx < MARGIN) dx = MARGIN - box.l;
      else if (box.r + dx > this.vw - MARGIN) dx = this.vw - MARGIN - box.r;
      if (box.t + dy < MARGIN) dy = MARGIN - box.t;
      else if (box.b + dy > this.vh - MARGIN) dy = this.vh - MARGIN - box.b;
    };
    fitWindow();
    // Off the HUD and the panel, by the smallest move: down below it, or sideways away from it.
    for (const z of this.zones) {
      const l = box.l + dx;
      const t = box.t + dy;
      const r = box.r + dx;
      const b = box.b + dy;
      if (r <= z.l - MARGIN || l >= z.r + MARGIN || b <= z.t - MARGIN || t >= z.b + MARGIN) continue;
      const left = (z.l + z.r) / 2 < this.vw / 2;
      const down = z.b + MARGIN - t;
      const side = left ? z.r + MARGIN - l : z.l - MARGIN - r;
      if (Math.abs(side) < Math.abs(down)) dx += side;
      else dy += down;
    }
    fitWindow();
    return { dx, dy };
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
