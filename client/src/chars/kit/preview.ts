// Dev-only character kit preview: /kit-preview.html
// Kit-dressed characters in front, their procedural twins behind on a riser, all driven by
// the real Rig + Body (springs, walk cycle, sitting, blinking) under the game's lighting.
//   ?walk=1 ?run=1 ?sit=1 ?jump=1 ?wave=1   pose (default: idle, glancing at the camera)
//   ?set=0|1|2|3   people (default) | hairstyles A | hairstyles and hats B | glasses, beards, shorts, boots, a regular
//   ?n=N           first N of the set (motion poses default to 3)
//   ?only=kit|proc one row               ?focus=N   close-up of character N, kit beside procedural
//   ?fade=1        fade in and out       ?mouth=smile|open|flat   hold a mouth shape
//   ?girth=G       everyone this wide (looks girth runs 0.94–1.08)
//   ?cam=px,py,pz,lx,ly,lz  free camera  ?hud=0     hide the overlay
// Keys: K takes the kit off / puts it back on (front row), H toggles the HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEngine } from '../../engine';
import { PALETTE } from '../../style/palette';
import { Body } from '../body';
import { employeeLooks, internLooks, managerLooks, regularLooks, type HairStyle, type Looks } from '../looks';
import { DIM, Rig } from '../rig';
import { applyKit, keepProcedural, kitReport, planKit, stripKit, type KitPlan } from './index';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
if (params.get('hud') === '0') hud.classList.add('hidden');

type Pose = 'idle' | 'walk' | 'run' | 'sit' | 'jump' | 'wave';
const pose: Pose = (['walk', 'run', 'sit', 'jump', 'wave'] as const).find((p) => params.get(p) === '1') ?? 'idle';
const only = params.get('only');
const focus = params.has('focus') ? Number(params.get('focus')) : null;
const mouth = params.get('mouth') as 'smile' | 'open' | 'flat' | null;

// ---- Who --------------------------------------------------------------------------------------

/** The first generated employee whose kit plan matches (hair family forced, like chars/lineup.ts). */
function employee(want: (p: KitPlan) => boolean, hair?: HairStyle, hosted = false): Looks {
  for (let i = 0; i < 6000; i++) {
    const l = employeeLooks(`kit-preview-${i}`, hosted);
    if (hair) l.hairStyle = hair;
    if (want(planKit(l))) return l;
  }
  console.warn('[kit-preview] no employee matches', want.toString());
  return employeeLooks('kit-preview', hosted);
}
const hairdo = (id: string | null, family: HairStyle, extra: (p: KitPlan) => boolean = () => true) =>
  employee((p) => p.hair === id && extra(p), family, true);

const SETS: (() => Looks[])[] = [
  () => [
    managerLooks(),
    employee((p) => p.torso === 'char_torso_hoodie' && p.hair === 'hair_bob' && p.glasses === 'glasses_round', 'bob'),
    internLooks('intern-a', '#4D96FF'),
    employee((p) => p.torso === 'char_torso_tee' && p.hair === 'hair_tuft' && !p.longSleeves, 'tuft', true),
    employee((p) => p.torso === 'char_torso_sweater' && p.hair === 'hair_ponytail', 'bun', true),
    employee((p) => p.torso === 'char_torso_vest' && p.hat === 'hat_cap', 'cap'),
    employee((p) => p.hat === 'headphones' && p.mouth.smile === 'char_mouth_grin', 'headphones'),
    employee((p) => p.hair === null && p.facialHair === 'beard_full', 'bald'),
  ],
  () => [
    hairdo('hair_tuft', 'tuft'),
    hairdo('hair_spiky', 'tuft'),
    hairdo('hair_mohawk', 'tuft'),
    hairdo('hair_bob', 'bob'),
    hairdo('hair_long', 'bob'),
    hairdo('hair_curly', 'bob'),
    hairdo('hair_afro', 'bob'),
    hairdo('hair_bun', 'bun'),
    hairdo('hair_ponytail', 'bun'),
  ],
  () => [
    hairdo('hair_pigtails', 'bun'),
    hairdo('hair_slick', 'slick'),
    hairdo('hair_side_part', 'slick'),
    hairdo('hair_buzz', 'cap'),
    hairdo('hair_buzz', 'capBack'),
    hairdo('hair_buzz', 'beanie'),
    hairdo('hair_side_part', 'headphones', (p) => p.hat === 'headphones'),
    hairdo('hair_buzz', 'headphones', (p) => p.hat === 'headset_mic'),
  ],
  () => [
    employee((p) => p.glasses === 'glasses_round'),
    employee((p) => p.glasses === 'glasses_square'),
    employee((p) => p.glasses === 'sunglasses'),
    employee((p) => p.facialHair === 'mustache'),
    employee((p) => p.facialHair === 'beard_full' && p.hair !== null),
    employee((p) => p.thigh === 'legs_shorts'),
    employee((p) => p.shoe === 'char_shoe_boot' && p.torso === 'char_torso_hoodie'),
    employee((p) => p.mouth.smile === 'char_mouth_grin' && p.torso === 'char_torso_vest' && p.lanyard !== null, undefined, true),
    // A regular (NPC coworker): never a staff lanyard, a plain mug in their own colour.
    regularLooks('kit-preview-regular'),
  ],
];
let looks = SETS[Number(params.get('set') ?? 0)]?.() ?? SETS[0]();
if (params.has('girth')) looks.forEach((l) => (l.girth = Number(params.get('girth'))));
const n = Number(params.get('n') ?? (pose === 'idle' ? looks.length : 3));
looks = focus !== null ? [looks[focus] ?? looks[0]] : looks.slice(0, n);

// ---- Stage ------------------------------------------------------------------------------------

const engine = createEngine(canvas);
const { scene, camera } = engine;
const SPACING = 0.95;
const RISER = { h: 1.0, z: -1.7 };
const SEAT_H = 0.46;

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: PALETTE.floorWood, roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const showKit = only !== 'proc';
const showProc = only !== 'kit';
/** Small groups stand as pairs (kit left, procedural right); a lineup puts the twins on a riser. */
const twinsBeside = showKit && showProc && looks.length <= 3;
const PAIR = 1.7;
const width = twinsBeside ? (looks.length - 1) * PAIR + 1.6 : Math.max(1, looks.length) * SPACING + 0.6;
if (showProc && !twinsBeside) {
  const riser = new THREE.Mesh(new THREE.BoxGeometry(width, RISER.h, 1.2), new THREE.MeshStandardMaterial({ color: PALETTE.carpet, roughness: 0.9 }));
  riser.position.set(0, RISER.h / 2, RISER.z);
  riser.castShadow = riser.receiveShadow = true;
  scene.add(riser);
}

interface Person {
  rig: Rig;
  body: Body;
  kit: boolean;
  phase: number;
  /** Floor height under them (the riser). */
  base: number;
}
const people: Person[] = [];
const stoolGeo = new THREE.CylinderGeometry(0.2, 0.17, SEAT_H, 24);
const stoolMat = new THREE.MeshStandardMaterial({ color: PALETTE.chairs[1], roughness: 0.7 });

function spawn(l: Looks, at: THREE.Vector3, kit: boolean, phase: number): void {
  const rig = new Rig(l);
  if (!kit) keepProcedural(rig);
  rig.root.position.copy(at);
  scene.add(rig.root);
  const body = new Body(rig, 0);
  people.push({ rig, body, kit, phase, base: at.y });
  if (kit) void applyKit(rig).then(writeHud);
  if (pose === 'sit') {
    const stool = new THREE.Mesh(stoolGeo, stoolMat);
    stool.position.set(at.x, at.y + SEAT_H / 2, at.z - 0.13 * l.scale);
    stool.castShadow = stool.receiveShadow = true;
    scene.add(stool);
  }
}

looks.forEach((l, i) => {
  const x = (i - (looks.length - 1) / 2) * SPACING;
  if (twinsBeside) {
    const c = (i - (looks.length - 1) / 2) * PAIR;
    spawn(l, new THREE.Vector3(c - 0.42, 0, 0), true, i * 0.7);
    spawn(l, new THREE.Vector3(c + 0.42, 0, 0), false, i * 0.7);
  } else {
    if (showKit) spawn(l, new THREE.Vector3(x, 0, 0), true, i * 0.7);
    if (showProc) spawn(l, new THREE.Vector3(x, showKit ? RISER.h : 0, showKit ? RISER.z : 0), false, i * 0.7);
  }
});

engine.fitShadows(new THREE.Box3(new THREE.Vector3(-width / 2 - 1, 0, -3), new THREE.Vector3(width / 2 + 1, 2.6, 1.5)));

// ---- Camera -----------------------------------------------------------------------------------

const cam = params.get('cam')?.split(',').map(Number);
const target = new THREE.Vector3();
if (cam?.length === 6) {
  camera.position.set(cam[0], cam[1], cam[2]);
  target.set(cam[3], cam[4], cam[5]);
} else if (focus !== null) {
  camera.position.set(0.5, 1.15, 2.7);
  target.set(0, 0.72, 0);
} else if (twinsBeside) {
  // Three-quarter view: faces, and the legs and arms swinging, all read.
  camera.position.set(width * 0.3, 1.45, width * 0.55 + 1.2);
  target.set(width * 0.04, 0.66, 0);
} else {
  const fit = Math.max(width, 3.2);
  const d = fit * 0.78 + (showProc && showKit ? 1.2 : 0.4);
  camera.position.set(fit * 0.12, showProc && showKit ? 2.5 : 1.6, d);
  target.set(0, showProc && showKit ? 1.05 : 0.7, showProc && showKit ? -0.7 : 0);
}
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.enableDamping = true;
controls.update();

// ---- HUD --------------------------------------------------------------------------------------

const short = (id: string | null) => (id ? id.replace(/^(char_torso_|char_mouth_|hair_|hat_|char_shoe_)/, '') : '-');
function writeHud(): void {
  const lines = [`kit preview · ${pose}${mouth ? ' · mouth ' + mouth : ''} · K kit on/off · H hud`];
  people
    .filter((p) => p.kit)
    .forEach((p, i) => {
      const r = kitReport(p.rig);
      const k = r?.plan ?? planKit(p.rig.looks);
      const bits = [k.torso, k.hair, k.hat, k.glasses, k.facialHair, k.thigh === 'legs_shorts' ? 'shorts' : null, k.shoe, k.mouth.smile, k.lanyard, k.mug, k.laptop]
        .filter((b) => b)
        .map(short);
      lines.push(`${String(i).padStart(2)} ${p.rig.looks.role.padEnd(8)} ${String(r ? r.worn.length : 0).padStart(2)} parts · ${bits.join(' ')}`);
    });
  hud.textContent = lines.join('\n');
}
writeHud();

let kitOn = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') hud.classList.toggle('hidden');
  if (e.key === 'k' || e.key === 'K') {
    kitOn = !kitOn;
    for (const p of people.filter((q) => q.kit)) {
      if (kitOn) void applyKit(p.rig).then(writeHud);
      else stripKit(p.rig);
    }
    writeHud();
  }
});
// For headless probes.
(window as unknown as { __kit: unknown }).__kit = { people, camera, controls, scene, renderer: engine.renderer, THREE, Rig, Body, employeeLooks, managerLooks, internLooks, regularLooks, applyKit, stripKit, keepProcedural, kitReport };

// ---- Motion -----------------------------------------------------------------------------------

function act(p: Person, dt: number, t: number): void {
  const b = p.body;
  const rig = p.rig;
  const s = rig.root.scale.y;
  const T = b.target;
  const O = b.over;
  const tt = t + p.phase;
  b.begin();
  rig.root.position.y = p.base;
  switch (pose) {
    case 'walk':
      b.locomote(dt, 1.65, 0, s);
      break;
    case 'run':
      b.locomote(dt, 4.4, 1, s);
      break;
    case 'jump':
      b.hop = 0.45 * Math.abs(Math.sin(tt * 2.2));
      b.flail(tt, Math.cos(tt * 2.2) * 2);
      break;
    case 'sit':
      // As employee.ts: pelvis just above the cushion, thighs forward, typing.
      rig.root.position.y = p.base + SEAT_H + 0.13 * s - DIM.pelvisY * s;
      T.legLPitch += 1.45;
      T.legRPitch += 1.45;
      T.kneeL += 1.4;
      T.kneeR += 1.4;
      T.legLRoll += 0.1;
      T.legRRoll += 0.1;
      O.kneeL += Math.sin(tt * 5.6) * 0.1;
      O.kneeR += Math.sin(tt * 5.6 + 2.1) * 0.1;
      T.lean += 0.14;
      T.armLPitch += 1.0;
      T.armRPitch += 1.0;
      T.armLRoll -= 0.06;
      T.armRRoll -= 0.06;
      T.elbowL += 0.8;
      T.elbowR += 0.8;
      T.headPitch += 0.08;
      O.elbowL += Math.sin(tt * 19) * 0.12;
      O.elbowR += Math.sin(tt * 19 + Math.PI) * 0.12;
      break;
    case 'wave':
      // The needs-you wave (employee.ts): arm straight up, waving from the elbow, worried.
      T.armRRoll += 2.25;
      T.armRPitch += 0.15;
      T.armRStretch += 0.7;
      T.elbowR += 0.25;
      O.elbowR += Math.sin(tt * 9.5) * 0.45;
      O.armRRoll += Math.sin(tt * 9.5 + 0.8) * 0.12;
      O.crouch += Math.abs(Math.sin(tt * 4.6)) * 0.045;
      T.side -= 0.2;
      T.headRoll -= 0.14;
      T.worry += 0.9;
      T.brow += 0.5;
      b.say('open', 0.1);
      break;
    default:
      b.idle(dt, tt);
      b.lookAt(camera.position, 0.8);
  }
  if (pose !== 'sit' && pose !== 'jump') {
    // Held items, as the manager and interns carry them.
    if (rig.laptop) {
      T.armLPitch += 0.5;
      T.armRPitch += 0.5;
      T.elbowL += 0.9;
      T.elbowR += 0.9;
    }
    if (rig.mug && pose !== 'wave') {
      T.armRPitch += 0.35;
      T.armRRoll -= 0.12;
      T.elbowR += 0.95;
      // A sip every 6 s, as manager.ts takes them.
      const st = tt % 6;
      const up = st < 0.35 ? st / 0.35 : st < 1.1 ? 1 : Math.max(0, 1 - (st - 1.1) / 0.35);
      T.armRPitch += up * 0.95;
      T.elbowR += up * 0.7;
      T.armRRoll -= up * 0.38;
      T.armRYaw += up * 0.3;
      T.headPitch -= up * 0.22;
      b.sip = up * 0.95 * (params.get('sipflip') === '1' ? -1 : 1);
    }
  }
  if (mouth) b.say(mouth, 0.2);
  b.update(dt);
  if (params.get('fade') === '1') rig.setOpacity(THREE.MathUtils.clamp(0.5 + 0.7 * Math.cos(tt * 1.3), 0, 1));
}

let last = performance.now();
const t0 = last;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;
  for (const p of people) act(p, dt, t);
  controls.update();
  engine.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
