// Labels over people (UX.md §2.1), drawn with CSS2DRenderer: a name pill (click = go to them),
// a glass speech bubble when you're close, the amber needs-you bubble and bouncing "!" always,
// Z z z for sleepers, thinking dots, a "!" pop when you bump someone, and "<type> for <boss>"
// pills over interns. Also drives the off-screen faces for people who need you.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { EmployeeChar } from '../chars/employee';
import type { InternChar } from '../chars/intern';
import { bus } from './bus';
import { bangMarker, zzz } from './components';
import { truncate, waitingLines } from './dom';
import { createEdgeIndicators, type EdgeTarget, type EdgeViewport } from './edge';
import { el, type Markup } from './el';
import { employeeFace, faceSvg } from './faces';
import { stateBadge, STATE_WORD } from './icons';

/** Chatter bubbles: within this many metres of the manager, the nearest few only. */
const BUBBLE_RANGE = 7;
const MAX_BUBBLES = 3;
/** At most this many name pills (people who need you always get one). */
const MAX_PILLS = 10;
/** A bubble's text changes at most this often. */
const BUBBLE_HOLD_MS = 800;
const _p = new THREE.Vector3();
const _cam = new THREE.Vector3();

class Tag {
  readonly obj: CSS2DObject;
  readonly head = new THREE.Vector3();
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
    b.hidden = false;
    // Restart the pop.
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    this.bumpTimer = window.setTimeout(() => (b.hidden = true), 900);
  }

  /** `pillFade` 0–1 (0 hides it); `bubbleAllowed`: one of the nearest few. */
  update(camDist: number, mgrDist: number, pillFade: number, bubbleAllowed: boolean): void {
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
      kind = 'needs';
      if (d.ask) {
        line1 = truncate(d.ask.title, 40);
        const first = d.ask.kind === 'permission' ? (d.ask.detail ?? '').split('\n').find((l) => l.trim()) : '';
        if (first) code = truncate(first, 36);
        else line2 = 'Click or press E to answer';
      } else [line1, line2] = waitingLines(d);
    } else if (bubbleAllowed && mgrDist < BUBBLE_RANGE && st !== 'sleeping') {
      kind = 'say';
      if (e.phase === 'entering') text = new Date().getHours() < 12 ? 'Morning!' : 'Hi!';
      else if (e.phase === 'leaving') text = 'Bye!';
      else if (e.seated) text = bubbleLine(e);
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
          this.bubble.classList.remove('is-bumped');
          void this.bubble.offsetWidth;
          this.bubble.classList.add('is-bumped');
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

/** What someone at their desk says when you're close (UX.md §2.1). */
function bubbleLine(e: EmployeeChar): string {
  const d = e.data;
  switch (d.state) {
    case 'working':
      return truncate(d.activity?.label ?? 'Thinking…', 60);
    case 'idle':
      return e.stateAge < 3 || !d.lastText ? 'Done!' : truncate(d.lastText, 70);
    case 'starting':
      return 'Getting settled…';
    default:
      return '';
  }
}

export class LabelLayer {
  readonly renderer = new CSS2DRenderer();
  private tags = new Map<EmployeeChar, Tag>();
  private internTags = new Map<InternChar, InternTag>();
  private edges: ReturnType<typeof createEdgeIndicators>;
  /** Keep edge faces clear of an open panel. */
  private inset: EdgeViewport['inset'] = {};
  private visible = true;
  /** Clicked someone's needs-you bubble. */
  onBubbleClick: (e: EmployeeChar) => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer.domElement.className = 'labels';
    container.append(this.renderer.domElement);
    this.edges = createEdgeIndicators(document.getElementById('ui') ?? container, (id) => bus.emit('go-to', { id }));
    bus.on('panel', (p) => {
      if (!p.open || p.left === undefined || p.top === undefined) this.inset = {};
      else if (p.top > window.innerHeight * 0.4) this.inset = { bottom: window.innerHeight - p.top + 16 };
      else this.inset = { right: window.innerWidth - p.left + 16 };
    });
    this.resize();
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  attach(e: EmployeeChar): void {
    if (!this.tags.has(e)) this.tags.set(e, new Tag(e, (x) => this.onBubbleClick(x)));
  }

  detach(e: EmployeeChar): void {
    this.tags.get(e)?.dispose();
    this.tags.delete(e);
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

  /** Hide everything (e.g. while sitting at someone's terminal). */
  setVisible(v: boolean): void {
    this.visible = v;
    this.renderer.domElement.style.visibility = v ? '' : 'hidden';
  }

  update(manager: THREE.Vector3, camera: THREE.Camera): void {
    camera.getWorldPosition(_cam);
    // Pills reach farther the farther out the camera is (UX.md §2.1).
    const reach = Math.max(10, _cam.distanceTo(manager) + 2);
    const near = [...this.tags.values()]
      .map((t) => ({ t, d: Math.hypot(t.e.position.x - manager.x, t.e.position.z - manager.z) }))
      .sort((a, b) => a.d - b.d);
    let pills = 0;
    let bubbles = 0;
    const targets: EdgeTarget[] = [];
    for (const { t, d } of near) {
      t.e.labelAnchor.getWorldPosition(_p);
      t.head.copy(_p);
      const camDist = _p.distanceTo(_cam);
      const fade = t.e.handUp ? 1 : pills < MAX_PILLS ? THREE.MathUtils.clamp((reach - d) / 3, 0, 1) : 0;
      if (fade > 0 && !t.e.handUp) pills++;
      const chatty = !t.e.handUp && bubbles < MAX_BUBBLES && d < BUBBLE_RANGE;
      if (chatty) bubbles++;
      t.update(camDist, d, fade, chatty);

      const e = t.e;
      if (e.handUp && e.phase !== 'leaving' && e.phase !== 'gone') {
        const fact = e.data.ask?.title ?? waitingLines(e.data)[1];
        targets.push({
          id: e.data.sessionId,
          position: t.head,
          faceSvg: t.face(),
          urgent: true,
          name: e.data.displayName,
          tooltip: `Go to ${e.data.displayName} (${fact.charAt(0).toLowerCase()}${fact.slice(1)})`,
          since: e.data.stateSince,
        });
      }
    }
    for (const it of this.internTags.values()) {
      it.i.labelAnchor.getWorldPosition(_p);
      it.update(_p.distanceTo(_cam));
    }
    // Longest waiting first: they win when markers merge.
    targets.sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    this.edges.updateEdgeIndicators(camera, { width: window.innerWidth, height: window.innerHeight, inset: this.inset }, this.visible ? targets : []);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
