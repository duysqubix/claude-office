// Labels that float over people's heads (CSS2DRenderer): a name pill that fades with
// distance, an activity bubble when you're close (always when they need you), the big
// bouncing "!" for needs-you, "Z z z" for sleepers, a "…" cloud for thinkers, a quick "!"
// pop when you bump into someone, and "<type> · <boss>" pills over interns.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { EmployeeChar } from '../chars/employee';
import type { InternChar } from '../chars/intern';
import { STATE_COLOR, h, truncate, waitingLines } from './dom';

const BUBBLE_RANGE = 7;
const MAX_BUBBLES = 3;
const _p = new THREE.Vector3();

class Tag {
  readonly obj: CSS2DObject;
  private root: HTMLElement;
  private bang: HTMLElement;
  private bubble: HTMLElement;
  private bubbleText: HTMLElement;
  private bubbleSub: HTMLElement;
  private thought: HTMLElement;
  private zzz: HTMLElement;
  private pill: HTMLElement;
  private pillName: HTMLElement;
  private pillDot: HTMLElement;
  private bumpEl: HTMLElement;
  private last: Record<string, string | boolean | number> = {};

  constructor(
    readonly e: EmployeeChar,
    onBubbleClick: (e: EmployeeChar) => void,
  ) {
    this.bang = h('div', { class: 'tag-bang', hidden: true }, h('span', null, '!'));
    this.bubbleText = h('span');
    this.bubbleSub = h('small', { hidden: true });
    this.bubble = h('div', { class: 'tag-bubble', hidden: true }, this.bubbleText, this.bubbleSub);
    // The needs-you bubble is a button: click it to answer.
    this.bubble.addEventListener('click', () => {
      if (this.bubble.dataset.kind === 'needs') onBubbleClick(this.e);
    });
    this.thought = h('div', { class: 'tag-thought', hidden: true }, h('i'), h('i'), h('i'));
    this.zzz = h('div', { class: 'tag-zzz', hidden: true }, h('b', null, 'Z'), h('b', null, 'z'), h('b', null, 'z'));
    this.pillDot = h('i');
    this.pillName = h('span');
    this.pill = h('div', { class: 'tag-pill' }, this.pillDot, this.pillName);
    this.bumpEl = h('div', { class: 'tag-bump', hidden: true }, '!');
    this.root = h('div', { class: 'tag' }, this.bang, this.bumpEl, this.zzz, this.thought, this.bubble, this.pill);
    this.obj = new CSS2DObject(this.root);
    this.obj.center.set(0.5, 1);
    e.labelAnchor.add(this.obj);
  }

  private set<K extends string>(key: K, v: string | boolean | number, apply: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    apply();
  }

  bumped(): void {
    const el = this.bumpEl;
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    window.setTimeout(() => (el.hidden = true), 900);
  }

  update(camDist: number, mgrDist: number, bubbleAllowed: boolean): void {
    const e = this.e;
    const d = e.data;
    const st = d.state;
    const atDesk = e.seated;
    const needs = e.handUp;
    this.set('name', d.displayName, () => (this.pillName.textContent = d.displayName));
    this.set('dot', st, () => {
      this.pillDot.style.background = STATE_COLOR[st];
      this.root.dataset.state = st;
    });
    // Name pill fades with distance (never for someone who needs you).
    const fade = needs ? 1 : THREE.MathUtils.clamp(1 - (camDist - 13) / 9, 0, 1);
    this.set('pillOpacity', Math.round(fade * 20) / 20, () => {
      this.pill.style.opacity = String(fade);
      this.pill.hidden = fade <= 0.01;
    });

    const walking = e.phase === 'entering' || e.phase === 'leaving';
    this.set('bang', needs && e.phase !== 'leaving', () => (this.bang.hidden = !(needs && e.phase !== 'leaving')));

    let text = '';
    let sub = '';
    let bubbleKind = '';
    if (e.quipping && camDist < 24) {
      text = e.quipText;
      bubbleKind = 'quip';
    } else if (needs && !walking) {
      [text, sub] = waitingLines(d);
      // With an in-game question, say exactly what they're asking.
      if (d.ask) [text, sub] = [truncate(d.ask.title, 48), 'Click or press E to answer'];
      bubbleKind = 'needs';
    } else if (bubbleAllowed && mgrDist < BUBBLE_RANGE && st !== 'sleeping') {
      if (e.phase === 'entering') text = new Date().getHours() < 12 ? 'Morning!' : 'Hi!';
      else if (e.phase === 'leaving') text = 'Bye!';
      else if (atDesk) text = bubbleLine(e);
      bubbleKind = d.activity?.kind === 'thinking' ? 'think' : st;
    }
    this.set('bubble', text + '|' + sub + '|' + bubbleKind, () => {
      this.bubble.hidden = !text;
      this.bubbleText.textContent = text;
      this.bubbleSub.textContent = sub;
      this.bubbleSub.hidden = !sub;
      this.bubble.dataset.kind = bubbleKind;
    });
    const thinking = atDesk && st === 'working' && d.activity?.kind === 'thinking' && !text && camDist < 18;
    this.set('thought', thinking, () => (this.thought.hidden = !thinking));
    const sleeping = atDesk && st === 'sleeping' && camDist < 26;
    this.set('zzz', sleeping, () => (this.zzz.hidden = !sleeping));
    // Seated heads sit lower than standing ones; walking people carry their labels higher.
    this.set('lift', walking ? 1 : 0, () => this.root.classList.toggle('walking', walking));
  }

  dispose(): void {
    this.obj.removeFromParent();
    this.root.remove();
  }
}

/** A small pill over an intern: what kind of subagent, and whose. */
class InternTag {
  readonly obj: CSS2DObject;
  private el: HTMLElement;
  private shown = '';

  constructor(readonly i: InternChar) {
    this.el = h('div', { class: 'tag-pill tag-intern' }, h('i', { style: `background:${i.rig.looks.hatColor}` }), h('span', null, i.title));
    this.obj = new CSS2DObject(this.el);
    this.obj.center.set(0.5, 1);
    i.labelAnchor.add(this.obj);
  }

  update(camDist: number): void {
    const fade = THREE.MathUtils.clamp(1 - (camDist - 9) / 5, 0, 1);
    const key = `${Math.round(fade * 10)}`;
    if (key === this.shown) return;
    this.shown = key;
    this.el.style.opacity = String(fade);
    this.el.hidden = fade <= 0.01;
  }

  dispose(): void {
    this.obj.removeFromParent();
    this.el.remove();
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
  /** Clicked someone's needs-you bubble. */
  onBubbleClick: (e: EmployeeChar) => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer.domElement.className = 'labels';
    container.append(this.renderer.domElement);
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
    this.renderer.domElement.style.visibility = v ? '' : 'hidden';
  }

  update(manager: THREE.Vector3, camera: THREE.Camera): void {
    // Only the nearest few get a chatty bubble, so the office doesn't turn into a comic strip.
    const near = [...this.tags.values()]
      .map((t) => ({ t, d: Math.hypot(t.e.position.x - manager.x, t.e.position.z - manager.z) }))
      .sort((a, b) => a.d - b.d);
    near.forEach(({ t, d }, i) => {
      t.e.labelAnchor.getWorldPosition(_p);
      const camDist = _p.distanceTo(camera.position);
      t.update(camDist, d, i < MAX_BUBBLES);
    });
    for (const it of this.internTags.values()) {
      it.i.labelAnchor.getWorldPosition(_p);
      it.update(_p.distanceTo(camera.position));
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
