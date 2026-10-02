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
/** Panels go to a bottom sheet below this width (theme.css). */
const SHEET = typeof window !== 'undefined' ? window.matchMedia('(max-width: 899px)') : null;

/** Restart an element's CSS animation without a forced layout (no `void el.offsetWidth`). */
function replay(node: HTMLElement): void {
  for (const a of node.getAnimations()) {
    a.cancel();
    a.play();
  }
}

class Tag {
  readonly obj: CSS2DObject;
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
    this.root = el('div', { class: 'co-tagstack' }, this.bang, this.bump, this.zzz, this.thought, this.bubble, this.pill);
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
  update(camDist: number, mgrDist: number, pillFade: number, bubbleAllowed: boolean, inReach: boolean): void {
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
    if (e.quipping && camDist < 24) {
      kind = 'say';
      text = e.quipText;
    } else if (needs && !walking) {
      if (inReach) {
        kind = 'needs';
        ({ line1, line2, code } = this.needsLines());
      }
    } else if (bubbleAllowed && mgrDist < BUBBLE_RANGE && st !== 'sleeping') {
      kind = 'say';
      if (e.phase === 'entering') text = new Date().getHours() < 12 ? 'Morning!' : 'Hi!';
      else if (e.phase === 'leaving') text = 'Bye!';
      else if (e.seated) text = this.line();
    }
    if (kind === 'say' && !text) kind = '';
    const key = `${kind}|${text}|${line1}|${line2}|${code}`;
    const now = performance.now();
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

    const thinking = e.seated && st === 'working' && d.activity?.kind === 'thinking' && this.bubble.hidden && camDist < 18;
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
    this.root = el('div', { class: 'co-tagstack' }, this.bump, this.bubble, this.pill);
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
    this.obj.visible = !this.pill.hidden || !this.bubble.hidden || !this.bump.hidden;
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
  /** Reused every frame. */
  private order: Tag[] = [];
  private targets: EdgeTarget[] = [];
  /** Clicked someone's needs-you bubble. */
  onBubbleClick: (e: EmployeeChar) => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer.domElement.className = 'labels';
    container.append(this.renderer.domElement);
    this.edges = createEdgeIndicators(document.getElementById('ui') ?? container, (id) => bus.emit('go-to', { id }));
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
    let bubbles = 0;
    const targets = this.targets;
    targets.length = 0;
    for (const t of order) {
      const d = t.dist;
      t.e.labelAnchor.getWorldPosition(_p);
      t.head.copy(_p);
      const camDist = _p.distanceTo(_cam);
      const fade = t.e.handUp ? 1 : pills < MAX_PILLS ? THREE.MathUtils.clamp((reach - d) / 3, 0, 1) : 0;
      if (fade > 0 && !t.e.handUp) pills++;
      const chatty = !t.e.handUp && bubbles < MAX_BUBBLES && d < BUBBLE_RANGE;
      if (chatty) bubbles++;
      t.update(camDist, d, fade, chatty, d <= reach);

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
    for (const { t, d } of regulars) {
      const fade = regularPills < MAX_REGULAR_PILLS ? THREE.MathUtils.clamp((REGULAR_PILL_RANGE - d) / 1.5, 0, 1) : 0;
      if (fade > 0) regularPills++;
      const r = t.r;
      const heard = r.quipping && regularBubbles < MAX_REGULAR_BUBBLES && (d < REGULAR_BUBBLE_RANGE || (r.quipLoud && d < 24));
      if (heard) regularBubbles++;
      t.update(fade, heard ? r.quipText : '');
    }
    // Longest waiting first: they win when markers merge.
    if (targets.length > 1) targets.sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    const now = performance.now();
    if (now - this.insetAt > 250) {
      this.insetAt = now;
      this.measureInset();
    }
    // A bottom sheet (narrow windows) leaves no free edge for faces; the panel has the floor.
    const room = this.visible && this.inset?.bottom === undefined;
    this.edges.updateEdgeIndicators(camera, { width: this.vw, height: this.vh, inset: this.inset }, room ? targets : []);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
