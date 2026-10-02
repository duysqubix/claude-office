// The detail panel's 3D stage. One WebGL renderer for the whole page, reused for every model;
// it only renders while the panel shows a built model. Lights, shadows and tone mapping match
// the game (engine/index.ts) so a model looks here the way it will in the office.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clampTextures } from '../models';
import { PALETTE } from '../style/palette';
import { ICON } from './icons';
import { artistOf, version, type CatalogItem } from './types';
import { h, reducedMotion, svg } from './util';

/** Same sun as the game: high, from the front-right. */
const SUN_FROM = new THREE.Vector3(0.42, 1.55, 0.62).normalize();
/** Opening shot: a 3/4 view from the front-right, like the Blender previews. */
const VIEW_FROM = new THREE.Vector3(0.95, 0.66, 1.55).normalize();
/** The stand-in person waits on the opening shot's left, outside the turntable, facing the camera. */
const PERSON_SIDE = new THREE.Vector3(-VIEW_FROM.z, 0, VIEW_FROM.x).normalize();
const PERSON_YAW = Math.atan2(VIEW_FROM.x, VIEW_FROM.z);
/** Employees are about this tall (docs/SPEC.md §6.4). */
export const PERSON_HEIGHT = 1.25;
/** Gap between the model's sweep and the stand-in person, and the person's own radius. */
const PERSON_GAP = 0.12;
const PERSON_R = 0.32;
/** Share of the stage height kept clear for the toolbar and hint. */
const STAGE_CLEAR = 0.16;
const SPIN = 0.32; // rad/s
const RESUME_SPIN_MS = 2500;
const TWEEN_MS = 520;

export type Toggle = 'person' | 'wire' | 'spin' | 'anchors';

interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

interface Pin {
  obj: THREE.Object3D;
  label: HTMLElement;
}

export class ModelViewer {
  readonly el: HTMLElement;
  readonly on: Record<Toggle, boolean> = { person: false, wire: false, spin: !reducedMotion(), anchors: true };
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.01, 500);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight('#FFF1D6', 2.3);
  private readonly turntable = new THREE.Group();
  private readonly ground: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private readonly person: THREE.Group;
  private readonly labels: HTMLElement;
  private readonly personLabel: HTMLElement;
  private readonly note: HTMLElement;
  private readonly buttons = new Map<Toggle, HTMLButtonElement>();
  private readonly loader = new GLTFLoader();
  private holder: THREE.Group | null = null;
  private materials: THREE.MeshStandardMaterial[] = [];
  private pins: Pin[] = [];
  /** Current model: footprint radius around the turntable axis, and height. */
  private size = { r: 0.5, h: 1 };
  private token = 0;
  private raf = 0;
  private last = 0;
  private holdSpin = 0;
  private tween: { from: Shot; to: Shot; t0: number } | null = null;

  /** Throws if the browser can't make a WebGL context. */
  constructor() {
    const canvas = h('canvas', { class: 'stage-canvas' });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    const hemi = new THREE.HemisphereLight('#BFE3FF', '#E8D3B0', 1.5);
    const ambient = new THREE.AmbientLight('#FFF6EA', 0.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.radius = 4;
    this.sun.shadow.intensity = 0.8;
    this.ground = makeGround();
    this.person = makePerson();
    this.person.visible = false;
    this.person.rotation.y = PERSON_YAW;
    this.scene.add(hemi, ambient, this.sun, this.sun.target, this.ground, this.turntable, this.person);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.addEventListener('start', () => {
      this.holdSpin = Infinity;
      this.tween = null;
    });
    this.controls.addEventListener('end', () => (this.holdSpin = performance.now() + RESUME_SPIN_MS));
    canvas.addEventListener('dblclick', () => this.frame(true));

    this.labels = h('div', { class: 'stage-labels', 'aria-hidden': 'true' });
    this.personLabel = h('span', { class: 'stage-label person-label' }, `${PERSON_HEIGHT} m person`);
    this.labels.append(this.personLabel);
    this.note = h('div', { class: 'stage-note', hidden: true });
    const tools = h('div', { class: 'stage-tools' });
    const tool = (key: Toggle, icon: string, label: string, title: string) => {
      const b = h(
        'button',
        { type: 'button', class: 'tool', title, 'aria-label': label, 'aria-pressed': String(this.on[key]), onclick: () => this.toggle(key) },
        svg(icon),
        h('span', { class: 'tool-label' }, label),
      );
      this.buttons.set(key, b);
      tools.append(b);
    };
    tool('person', ICON.person, 'Person', `Show a ${PERSON_HEIGHT} m employee for scale`);
    tool('wire', ICON.wire, 'Wireframe', 'Show the triangles');
    tool('spin', ICON.spin, 'Spin', 'Turn the model slowly');
    tool('anchors', ICON.pin, 'Anchors', 'Show attach points');
    tools.append(h('button', { type: 'button', class: 'tool tool-icon', title: 'Reset the view (or double-click the model)', 'aria-label': 'Reset view', onclick: () => this.frame(true) }, svg(ICON.reset)));

    const hint = h('span', { class: 'stage-hint' }, h('span', { class: 'hint-mouse' }, 'Drag to turn, scroll to zoom'), h('span', { class: 'hint-touch' }, 'Drag to turn, pinch to zoom'));
    this.el = h('div', { class: 'stage' }, canvas, this.labels, this.note, tools, hint);
    new ResizeObserver(() => this.resize()).observe(this.el);
  }

  /** Load and show a built model. Resolves once it's on screen (or failed). */
  async show(item: CatalogItem): Promise<void> {
    const token = ++this.token;
    this.unmount();
    this.setNote(`Unboxing ${item.name}…`, 'loading');
    this.ground.material.color.set(artistOf(item.artist).floor);
    this.buttons.get('anchors')!.hidden = Object.keys(item.anchors).length === 0;
    if (!item.file) return;
    try {
      const gltf = await this.loader.loadAsync(`${item.file}?v=${version(item)}`);
      if (token !== this.token) {
        dispose(gltf.scene);
        return;
      }
      this.mount(gltf.scene, item);
      this.setNote(null);
    } catch (err) {
      if (token !== this.token) return;
      const status = /responded with (\d+)/.exec((err as Error).message)?.[1];
      this.setNote(`Couldn't load ${item.file}. ${status ? `The server answered ${status}.` : (err as Error).message}`, 'error');
    }
  }

  /** Recolour every material with this name, or put back the model's own colour. */
  tint(material: string, color: string | null): void {
    for (const m of this.materials) {
      if (m.name !== material) continue;
      const own = m.userData.own as { color: THREE.Color; emissive: THREE.Color };
      // Screens glow: tint the light they give off, not the dark glass under it.
      if (material === 'Screen' && own.emissive.getHex() !== 0) m.emissive.set(color ?? own.emissive);
      else m.color.set(color ?? own.color);
    }
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Forget the current model (the panel moved on to a planned one). */
  clear(): void {
    this.token++;
    this.unmount();
  }

  private toggle(key: Toggle): void {
    this.on[key] = !this.on[key];
    this.buttons.get(key)?.setAttribute('aria-pressed', String(this.on[key]));
    if (key === 'person') {
      this.person.visible = this.on.person;
      this.layout();
      this.frame(true);
    } else if (key === 'wire') {
      for (const m of this.materials) m.wireframe = this.on.wire;
    } else if (key === 'spin' && this.on.spin) {
      this.holdSpin = 0;
    } else if (key === 'anchors') {
      for (const p of this.pins) p.obj.visible = this.on.anchors;
    }
  }

  private mount(model: THREE.Object3D, item: CatalogItem): void {
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.2, 0.1));
    const center = box.getCenter(new THREE.Vector3());
    // Stand it on the disc, centred on the turntable axis. Anchors share the model's space.
    const holder = new THREE.Group();
    holder.position.set(-center.x, -box.min.y, -center.z);
    holder.add(model);

    const seen = new Set<THREE.Material>();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) clampTextures(m);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (seen.has(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        seen.add(m);
        const std = m as THREE.MeshStandardMaterial;
        std.userData.own = { color: std.color.clone(), emissive: std.emissive.clone() };
        std.wireframe = this.on.wire;
        this.materials.push(std);
      }
    });

    const size = box.getSize(new THREE.Vector3());
    this.size = { r: Math.max(0.05, Math.hypot(size.x, size.z) / 2), h: Math.max(0.05, size.y) };
    const pinR = THREE.MathUtils.clamp(Math.max(this.size.r, this.size.h) * 0.022, 0.008, 0.06);
    for (const [name, p] of Object.entries(item.anchors)) {
      const obj = new THREE.Mesh(new THREE.SphereGeometry(pinR, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.chairs[0], depthTest: false }));
      obj.position.set(p[0], p[1], p[2]);
      obj.renderOrder = 10;
      obj.visible = this.on.anchors;
      holder.add(obj);
      const label = h('span', { class: 'stage-label pin-label' }, name);
      this.labels.append(label);
      this.pins.push({ obj, label });
    }

    this.holder = holder;
    this.turntable.add(holder);
    this.turntable.rotation.y = 0;
    this.layout();
    this.frame(false);
  }

  private unmount(): void {
    if (this.holder) {
      this.turntable.remove(this.holder);
      dispose(this.holder);
    }
    this.holder = null;
    this.materials = [];
    for (const p of this.pins) p.label.remove();
    this.pins = [];
  }

  /** Place the stand-in person, then size the ground disc and the sun's shadow to cover both. */
  private layout(): void {
    const { r, h } = this.size;
    this.person.position.copy(PERSON_SIDE).multiplyScalar(r + PERSON_GAP + PERSON_R);
    // Smallest circle around the model's sweep (and the person): the disc and shadow cover it.
    let center = new THREE.Vector3();
    let radius = r;
    if (this.on.person) {
      const span = this.person.position.length();
      radius = (span + r + PERSON_R) / 2;
      center = PERSON_SIDE.clone().multiplyScalar(radius - r);
    }
    this.ground.position.set(center.x, 0, center.z);
    this.ground.scale.setScalar(radius * 1.3 + 0.08);
    const top = this.on.person ? Math.max(h, PERSON_HEIGHT) : h;
    fitShadow(this.sun, new THREE.Box3(new THREE.Vector3(center.x - radius, 0, center.z - radius), new THREE.Vector3(center.x + radius, top, center.z + radius)));
    this.sun.shadow.normalBias = 0.012 * Math.max(radius, top);
    this.sun.shadow.bias = -0.0004;
  }

  /** Points that must stay on screen: the model's whole sweep as it spins, and the person. */
  private framePoints(): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const ring = (cx: number, cz: number, r: number, h: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r), new THREE.Vector3(cx + Math.cos(a) * r, h, cz + Math.sin(a) * r));
      }
    };
    ring(0, 0, this.size.r, this.size.h, 16);
    if (this.on.person) ring(this.person.position.x, this.person.position.z, PERSON_R, PERSON_HEIGHT, 8);
    return pts;
  }

  /** The opening angle, pulled back just far enough that everything fits, and centred on it. */
  private frame(animate: boolean): void {
    // View space of the opening shot: x right, y up, z back towards the camera.
    const view = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(VIEW_FROM, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP));
    const toView = view.clone().invert();
    const pts = this.framePoints().map((p) => p.applyQuaternion(toView));
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of pts) {
      min.min(p);
      max.max(p);
    }
    const mid = min.clone().add(max).multiplyScalar(0.5);
    const tanFull = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanV = tanFull * (1 - STAGE_CLEAR);
    const tanH = tanFull * this.camera.aspect;
    let dist = 0;
    for (const p of pts) {
      const d = p.clone().sub(mid);
      dist = Math.max(dist, d.z + Math.abs(d.x) / tanH, d.z + Math.abs(d.y) / tanV);
    }
    dist *= 1.06;
    // Aim a little low so the subject sits above the toolbar along the bottom of the stage.
    mid.y -= dist * tanFull * STAGE_CLEAR * 0.6;
    const target = mid.applyQuaternion(view);
    const to = { pos: target.clone().addScaledVector(VIEW_FROM, dist), target };
    this.controls.minDistance = dist * 0.3;
    this.controls.maxDistance = dist * 3;
    this.camera.near = Math.max(0.005, dist / 200);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    if (animate && this.raf) {
      this.tween = { from: { pos: this.camera.position.clone(), target: this.controls.target.clone() }, to, t0: performance.now() };
    } else {
      this.tween = null;
      this.camera.position.copy(to.pos);
      this.controls.target.copy(to.target);
      this.controls.update();
    }
  }

  private readonly loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.on.spin && now > this.holdSpin) this.turntable.rotation.y += dt * SPIN;
    if (this.tween) {
      const t = Math.min(1, (now - this.tween.t0) / TWEEN_MS);
      const k = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.tween.from.pos, this.tween.to.pos, k);
      this.controls.target.lerpVectors(this.tween.from.target, this.tween.to.target, k);
      if (t >= 1) this.tween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  };

  private placeLabels(): void {
    const w = this.el.clientWidth;
    const hgt = this.el.clientHeight;
    const v = new THREE.Vector3();
    const put = (label: HTMLElement, show: boolean) => {
      v.project(this.camera);
      label.hidden = !show || v.z > 1;
      if (!label.hidden) label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * hgt}px)`;
    };
    this.person.localToWorld(v.set(0, PERSON_HEIGHT + 0.06, 0));
    put(this.personLabel, this.on.person && this.holder !== null);
    for (const p of this.pins) {
      p.obj.getWorldPosition(v);
      put(p.label, this.on.anchors);
    }
  }

  private resize(): void {
    const w = this.el.clientWidth;
    const hgt = this.el.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
    if (this.holder && !this.tween) this.frame(false);
  }

  private setNote(text: string | null, kind: 'loading' | 'error' = 'loading'): void {
    this.note.hidden = text === null;
    this.note.className = `stage-note note-${kind}`;
    this.note.textContent = text ?? '';
  }
}

/** A soft round floor that fades out at the edge, in the colour of where the model lives. */
function makeGround(): THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial> {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const material = new THREE.MeshStandardMaterial({ color: PALETTE.floorWood, roughness: 0.95, transparent: true, alphaMap: new THREE.CanvasTexture(c), depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 72), material);
  disc.rotation.x = -Math.PI / 2;
  disc.receiveShadow = true;
  disc.renderOrder = -1;
  return disc;
}

/** A plain 1.25 m employee (docs/SPEC.md §6.4 proportions), for judging scale. */
function makePerson(): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: '#B9C4D6', roughness: 0.85 });
  const part = (geo: THREE.BufferGeometry, x: number, y: number, z = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const leg = new THREE.CapsuleGeometry(0.085, 0.2, 6, 12);
  const foot = new THREE.SphereGeometry(0.095, 16, 10);
  const arm = new THREE.CapsuleGeometry(0.072, 0.26, 6, 12);
  const torso = part(new THREE.CapsuleGeometry(0.23, 0.22, 8, 20), 0, 0.7);
  torso.scale.z = 0.85;
  const feet = [part(foot, -0.1, 0.05, 0.04), part(foot, 0.1, 0.05, 0.04)];
  for (const f of feet) f.scale.set(1, 0.6, 1.35);
  const g = new THREE.Group();
  g.add(
    part(leg, -0.1, 0.22),
    part(leg, 0.1, 0.22),
    ...feet,
    torso,
    part(arm, -0.29, 0.66, 0, -0.16),
    part(arm, 0.29, 0.66, 0, 0.16),
    part(new THREE.SphereGeometry(0.27, 32, 20), 0, PERSON_HEIGHT - 0.27),
  );
  return g;
}

/** Fit the sun's orthographic shadow camera around a box (as the game's engine does). */
function fitShadow(sun: THREE.DirectionalLight, box: THREE.Box3): void {
  const center = box.getCenter(new THREE.Vector3());
  const span = box.getSize(new THREE.Vector3()).length();
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(SUN_FROM, span * 2 + 2);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(cam.matrixWorldInverse);
    min.min(v);
    max.max(v);
  }
  const pad = span * 0.04;
  cam.left = min.x - pad;
  cam.right = max.x + pad;
  cam.bottom = min.y - pad;
  cam.top = max.y + pad;
  cam.near = Math.max(0.01, -max.z - pad);
  cam.far = -min.z + pad;
  cam.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;
}

function dispose(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}
