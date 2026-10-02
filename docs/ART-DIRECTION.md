# Claude Office art direction

This is the look and motion spec for Claude Office. It follows the code that ships, and each section names its source-of-truth files.
If this doc and the code ever disagree, the code wins: fix the doc. It is written for the world and character engineers, who work in
Three.js r186 with procedural springs and no physics engine.

## The five rules
1. **Same body, different clothes.** Everyone shares one body plan: a big round head on a soft bean, mitten hands, and stubby legs in rounded shoes. Skin is one of six tones; outfit, hair, hat and accessories carry identity.
2. **Responsive root, lagging body.** The character's position reacts within about 0.1 s. Torso, head and arms follow on springs that peak 0.15–0.25 s later with one overshoot (ζ ≈ 0.4–0.5) and never ring like jelly.
3. **Short quick steps, swinging arms that bend.** About 4 steps/s, knees lifting the swing foot, a waddle bob and sway. Arms swing against the legs with a little elbow bend at a walk and pump at a run.
4. **Bright sun, saturated darks.** Use real shadows and AO, but shadows keep their colour (warm and saturated, never grey). Surfaces are flat colour, with texture only where it carries information.
5. **Chunky, juicy UI.** Ink outlines, bevelled paper panels, outlined titles, blue-glass speech, and things that pop (§5).

## 1. Characters
Every character shares one body plan, customised through skin tone, clothes, hair, hats and accessories (`chars/looks.ts`). Looks are deterministic: the same session id always gets the same person.

### 1.1 Proportions
`chars/rig-dimensions.json` is the source of truth, shared by `chars/rig.ts` and the Blender character kit. At scale 1 a character stands 1.24 m (H), with the pelvis joint at 0.42 m.

| Part | Ratio | Metres | Build |
| --- | --- | --- | --- |
| Head | Ø 44 % of H | sphere r 0.27, centre at 0.97, neck pivot at 0.76 | Smooth sphere (56 × 40 segments). It sits 13 cm deep in the bean, so no neck shows. |
| Eyes | 33 % of head width apart; each 14 % wide and 20 % tall | centres x ±0.088 on the head's centre line, 0.074 × 0.11, sunk 1.2 cm | Dark ellipsoids with two white catchlights (§1.2). |
| Torso | 46 % of H tall, 37–42 % wide | bean from y 0.265 to 0.83, Ø 0.486 × girth at the pelvis, depth × 0.85 | Smoothed lathe "bean", girth 0.94–1.08 per person. The spine splits at the chest pivot (0.54 m), so the chest bends on top of the lower torso. |
| Arms | 33 % of H, shoulder to mitten tip | shoulder at (±0.215 × girth, 0.67), upper arm 0.15 (r 0.072), forearm 0.13 (r 0.066) | Capsule "noodles" with a bending elbow. At rest they splay 17° with the elbows bent 10°. |
| Hands | mitten 0.15 × 0.17 × 0.12 | centre 0.045 below the wrist; thumb r 0.032, 0.045 forward | A soft oval mitten with a thumb nub pointing forward. It flops on the wrist (§2.4). |
| Legs | hip at 34 % of H; 21 % shows below the bean | hips at (±0.105, 0.42), thigh 0.17 (r 0.085), shin 0.15 (r 0.078) | Capsules with a bending knee. At rest the knees are soft (2°) and the legs turn out 2°. |
| Shoes | 22 % of H long | ellipsoid 0.19 w × 0.14 h × 0.27 l, 0.03 below and 0.05 ahead of the ankle | Toes out 7°. Soles stay roughly level with the floor (§2.5). |

Scale: employees 0.96–1.04 (1.19–1.29 m), the manager 1.08, interns 0.7. The big round head is deliberate: it is what makes lag and sway readable.

### 1.2 Face
Face positions are in head-centre space, on the sphere surface (`face` in `rig-dimensions.json`).
- **Eyes:** `PALETTE.eye` `#1E1B2E`, roughness 0.22, no rim. Each has two white catchlights: r 0.0135 up and to the outside, and r 0.0065 down and to the inside.
- **Brows:** short capsules (r 0.0115, 0.042 long) in the hair colour darkened to 55 %, at x ±0.092, y 0.094. They rise up to about 1.8 cm when surprised (`brow`) and tilt their inner ends up when worried (`worry`, up to ±0.45 rad).
- **Mouth:** a small smile by default (0.08 wide). `open` (an oval 0.056 × 0.068) is for surprise, alarm and sleep; `flat` (0.052 wide) is neutral. `PALETTE.mouth` `#5A2A2A`, roughness 0.5.
- **Cheeks:** soft, unlit blush ovals (0.092 × 0.064) at x ±0.158, y −0.062, in `PALETTE.cheek` `#FF9AA2` at 55 % opacity.
- **Life:**
  - A blink every 2–6 s, lasting 0.12 s; the eye squeezes to 8 %. 15 % of blinks are doubles.
  - The eyes dart ahead of the head toward what they look at (up to 2.2 cm sideways and 1.5 cm up or down).
  - A squint when thanked, eyes shut in the celebration stretch and while asleep, and an open mouth for 0.7 s after a shove.
  - Worried brows and an open mouth while they need you.

### 1.3 Skin
- **Tones:** six, from `PALETTE.skins`: `#FFDDBB`, `#F7C59F`, `#E7A977`, `#C98B5B`, `#9B6640`, `#6E4329`, picked from the session id. The manager and the receptionist use `#F7C59F`.
- **Material:** soft plastic at roughness 0.62, with the character rim (§3.3) and a warm lift: emissive = skin × (0.09, 0.045, 0.03). That red-shifted glow keeps the shadow side warm, like subsurface scattering, never grey. No texture.

### 1.4 Clothing and customisation
- **Construction:**
  - The shirt is the bean above the belt (0.015 m above the pelvis) plus the sleeves.
  - The pants are the bean below the belt, 1.1 cm proud with a rounded waistband lip, plus the thighs and shins.
  - A baked bottom-to-top shade (0.86 → 1.04 on the shirt, 0.84 → 1.0 on the pants) grounds the body.
- **Sleeves:** long or short, 50/50; interns always wear short. Short sleeves show a bare upper arm under a cuff 35 % of its length, and bare forearms.
- **Colours:** shirts (10), pants (6), shoes (5) and hair (9) come from `PALETTE`. Hats use 8 colours and never match the shirt.
- **Roughness:** shirt 0.8, pants 0.82, shoes 0.55, hair 0.68, hats 0.78. Hat bands, pom-poms and headphone bands are the hat colour at 45 %, roughness 0.6.
- **Hair and hats (employees):** tuft (three jiggly tufts), bob (with a fringe), bun (a jiggly bun with a tie), cap, beanie (with a jiggly pom-pom), headphones over short hair, or bald.
- **Glasses:** 30 % of employees and 20 % of interns. Round frames (ring r 0.062) in ink, red, blue or brown, roughness 0.4.
- **Lanyard:** every Claude session wears the staff lanyard: a Claude-orange (`#D97757`) strap and a white badge (0.078 × 0.098) with an orange stripe and a tiny photo in the wearer's skin tone. Regulars (NPC coworkers) never wear it, and they carry a mug.
- **Cast:**
  - **Manager (you):** white shirt, red tie with collar points, dark pants, brown shoes, slick hair with a quiff. Holds a mug out in front, elbow bent about 55°. Scale 1.08.
  - **Interns:** scale 0.7, a cap worn backwards in their boss's colour, and a laptop.
  - **Receptionist (Mabel):** sunny yellow cardigan, red hair, red specs, headphones with a mic, and a mug.
- **Not built yet:**
  - Printed patterns: florals, plaid, hearts, checks or hi-vis stripes on a 256² `CanvasTexture`, mostly plain, at most two colours per piece.
  - Novelty hats, oversized to 1.05–1.25× head width.

### 1.5 Reading at a distance
At 10 m (the outdoor default) with FOV 45° on a 1080p screen, a 1.24 m character is about 160 px tall and its eyes about 14 px. Indoors the camera sits at 7.5 m, where they are about 215 px and 19 px. Characters read through four things:
- the head-plus-hair or hat silhouette;
- two clothing colour blocks (shirt and pants);
- the dark eyes with catchlights;
- the orange lanyard, which marks every Claude session.

### 1.6 Look rules
- **Head:** round, sunk into a soft bean, with no visible neck.
- **Face:** dark oval eyes with two catchlights, small brows, a smile and blush. Expression comes from brows, mouth shapes, squints and blinks (§1.2).
- **Hands:** mittens with a forward thumb and no fingers.
- **Limbs:** elbows and knees bend. Limbs are soft capsules that read like noodles when bent.
- **Feet:** rounded shoes with the toes slightly out.
- **Arms up:** only in the air (jump), to wave, to celebrate or stretch, or to signal (needs-you). Running pumps the arms with bent elbows and never raises them.

## 2. Movement
`chars/body.ts` is the source of truth for this section; seated behaviour lives in `chars/employee.ts`, the manager in `chars/manager.ts`.

### 2.1 Motion character
- **Overall feel:** a light ragdoll on snappy controls. Position responds at once; torso, head and arms catch up a beat later.
- **Spine:** the lower torso takes 45 % of every lean, side bend and twist at once. The chest takes the other 55 % a beat later, and the head lags the chest.
- **Cadence:** about 4 steps/s at a walk (§2.5), with short quick steps and long double support. The knee lifts the swing foot, most at mid-swing.
- **Bob:** twice per cycle, lowest mid-swing and highest just after a plant, like a toddler's waddle rather than an adult's gait.
- **Sway:** once per cycle (half the bob frequency), toward the stance foot, peaking as the swinging foot lands.
- **Arms:** splayed and swinging against the legs. At a walk the forearm trails on the back-swing; at a run the elbows pump. Mittens flop on the wrists when an arm changes direction.
- **Turns:** the head turns first and the body follows about 0.1 s later. Turning on the spot takes little shuffle steps.
- **Raised arms:** they overshoot and sway a little as they settle.

### 2.2 Always and never
**Always:** lagging torso, head and arms; quick short steps; waddle bob and sway; head-led turns; a little overshoot on stopping.
**Never:**
- stumbles or falls (a shove is a stagger in the pose, never a fall);
- a lean beyond 16° at a run;
- more than one visible overshoot on big chains (ζ ≥ 0.4);
- arm stretching outside signals and stretches: the needs-you hand reaches 1.7×, the celebration 1.3× and the yawn 1.25× (clamped to 0.8–2.2).

### 2.3 Architecture: a fake active ragdoll
A physics ragdoll gets this look by chasing an animated pose through joint motors. We fake the same thing without physics:
1. Behaviours (walking, typing, waving…) write a **target pose** each frame. Fast cycles that must not lag (leg cycles, typing, waving) add **direct offsets** instead.
2. **Per-joint springs** chase the targets. Lag, overshoot and follow-through come from the springs, so never keyframe them.
3. The body **feels root motion**. Velocity and acceleration measured from the root position kick the springs (inertia), so starting, stopping, turning and landing push the body around without anyone scripting it.

Per-frame order: behaviours → root motion → heading → springs → write the rig.

### 2.4 Spring settings (`Spring(freq Hz, ζ)` in `chars/spring.ts`)
For x'' = ω²(target − x) − 2ζωx' with ω = 2πf, overshoot is exp(−πζ/√(1−ζ²)):

| ζ | 0.2 | 0.3 | 0.4 | 0.45 | 0.5 | 0.6 | 0.7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Overshoot | 53 % | 37 % | 25 % | 21 % | 16 % | 9.5 % | 4.6 % |

- The first peak arrives at t = 1/(2f√(1−ζ²)).
- **"A little delayed"** means secondary chains peak 0.15–0.25 s after the cause, which gives f ≈ 2.2–3.5 Hz.
- **"Not exaggerated"** means ζ ≥ 0.4 on big chains, so the second overshoot stays under 3 %. Use ζ < 0.3 only for small danglers.
- A ζ of 0.17–0.26 on torso and arms gives 43–58 % overshoot and 2–3 visible rings: the jelly look we avoid.

| Channel (`body.ts`) | f / ζ | Role |
| --- | --- | --- |
| lean, side, twist (lower spine) | 3.2/0.5, 3.0/0.5, 3.0/0.5 | takes 45 % at once |
| chest lean, side, twist | 2.6/0.45, 2.5/0.45, 2.8/0.5 | the other 55 %, a beat later |
| headPitch, headRoll | 3.6/0.42, 3.5/0.42 | nods lag the body |
| headYaw | 4.5/0.7 | leads turns without overshoot |
| arm pitch, roll, yaw | 3.2/0.4, 3.2/0.42, 3.5/0.45 | heavy and late, one overshoot |
| elbows | 3.6/0.42 | |
| arm stretch | 6.0/0.35 | signals and stretches only (§2.2) |
| mitten flop | 4.5/0.3 | follow-through at the wrist |
| leg pitch, leg roll, knees | 7/0.7, 7/0.7, 8/0.7 | stiff, so feet never float |
| crouch, hipTwist, hipRoll | 5.5/0.5, 5/0.5, 4.0/0.45 | |
| squash | 6.5/0.35 | quick squash, one rebound |
| hair (tilt, stretch); jiggly bits | 5.2/0.26, 6.5/0.26; 4.5/0.2 | small danglers may ring a little |
| sway, weight shift | 2.2/0.5, 1.2/0.7 | |
| brow, worry, eyesClosed | 7/0.45, 6/0.6, 9/0.9 | |
| heading (`AngleSpring`) | 3.0/0.6 | overshooting yaw reads as drunk |

- **Variation:** each character's springs vary, f by ±8 % (±6 % for the chest) and ζ by ±0.04, so a room never moves in lockstep.
- **Anticipation**, if it is ever needed: a second-order filter with an initial-response term r, where k1 = ζ/(πf), k2 = 1/(2πf)² and k3 = rζ/(2πf). With r < 0 it winds up before moving; with r > 1 it overshoots from the start.
- **Root smoothing** with no overshoot: a critically damped spring, damping = 4·ln2/halflife.

### 2.5 Gait (scale 1; interns step at their own scale)
- **Cadence** (steps/s) = clamp(2.8 + 0.6·v, 3.2, 5.6). That gives 3.6 at 1.4 m/s, 4.1 at 2.2 m/s and 5.5 at 4.5 m/s.
- **Shuffle:** turning on the spot (under 0.3 m/s and faster than 1.6 rad/s) shuffles at 3 steps/s with ±12° legs.
- **Legs:** step length = v / cadence. Thigh swing = atan(step/2 / 0.42), where 0.42 m is the hip height. It is clamped to 15–40° walking (up to 50° running) and fades in over the first 1.2 m/s. That is about 25° at 1.4 m/s, 32° at 2.2 m/s and 44° at 4.5 m/s.
- **Knees:** the swing knee bends up to about 45° walking and 70° running, most at mid-swing. The stance knee stays soft (5°).
- **Feet:**
  - At full stride the pelvis drops by legLen·(1 − cos θ) so the feet stay on the floor.
  - Soles stay roughly level (foot pitch = 0.7 × (thigh − knee)).
  - On stopping, the gait phase eases to the nearest standing point so the feet come together.
- **Bob:** 0.025 m walking, 0.06 m running, lowest mid-swing.
- **Hips:** twist ±6° with the stride, while the spine counter-twists ±4.6°.
- **Sway:** the pelvis moves ±0.025 m and rolls ±3° toward the stance foot (×1.4 running: ±0.035 m, ±4.2°). A spring (2.2 Hz, ζ 0.5) drives it and flips at each footfall.
- **Torso lean:** 3.5° per m/s, up to 8° walking and 16° running. The speed behind it rises fast and falls slowly, so stopping can overshoot.
- **Arms:**
  - Swing targets: ±0.19 rad (11°) up to 1.4 m/s, rising to ±0.24 rad (14°) at 2.2 m/s, and ±0.59 rad (34°) running with a −0.26 rad (−15°) backward bias. The springs add about 1.3×, so on screen that reads as ±15–18° walking and ±45° running.
  - Splay: 17° at rest, about 22° standing or walking, 28° running.
  - Elbows: bent 10° walking, up to 17° more on the back-swing as the forearm trails, and about 75° running.
- **Head:** tips 2° down while moving and undoes half of the spine's lean and roll, so the gaze stays level.
- **Footfalls:** each plant flips the sway and squashes the body a little (a kick of −0.35, or −0.85 running). It also nods the head, bounces the hair, and fires the footstep callback (sound, dust puffs).
- **Inertia:** root acceleration kicks the springs. Each gain below is per m/s² of acceleration, per second.
  - Spine lean: 1.2 when starting and 3.0 when braking, so a stop throws the top half forward harder than a start pulls it back.
  - Side bend: 1.4 from sideways acceleration.
  - Arm pitch: 3.5 starting and 5 braking, so arms fly back on a start and forward on a stop. Arms also flare by 0.5 × |a|.
  - Head pitch: 1.2 starting and 2.4 braking. Hard brakes (over 4 m/s²) add a squash.
  - When the chest snaps forward the head tips back, then catches up.

### 2.6 Moments
| Moment | Root | Body |
| --- | --- | --- |
| Speeds | Manager walk 2.2 m/s and run 4.5 m/s (×1.3 for 25 s on coffee). The run blend fades in between 2.6 and 4.2 m/s. | — |
| Start | Velocity closes on the wish velocity at 9/s (63 % in 0.11 s). | The first foot lifts at once. The torso dips back slightly, then leans in, and the arms fly back. |
| Stop | 14/s on the ground (90 % in 0.16 s); only 2.2/s in the air. | Legs settle to a standing point. The torso tips forward and rocks back once, the arms swing forward, and the head nods. |
| Turn | Heading spring 3.0/0.6, aimed along the velocity above 0.25 m/s. | The head leads (0.6 × the heading error, clamped to ±50°). Bank 0.045 rad (about 2.6°) per m/s² of lateral acceleration, up to 10°. |
| Jump (manager) | A 75 ms wind-up, then 4.6 m/s up under 15 m/s² gravity: apex about 0.7 m, about 0.6 s in the air. Landing impact = 0.9 × fall speed. | A wind-up squash, a stretch on launch, and arms kicked up. In the air the arms go up about 100° and flap (~3 Hz), the legs bicycle (~2.4 Hz) and the brows go up. On landing: squash, knees bend, head nods, arms drop. On screen: crouch squash ≈ 0.9, stretch ≈ 1.08, landing ≈ 0.85. |
| Bump | The manager hits someone at over 0.9 m/s (at most once per 0.9 s per person) and loses 75 % of their speed. | A shove, never a fall. The torso peaks about 10° along the push, with the chest and head adding more. Arms flare, brows jump, the mouth opens for 0.7 s and the hair whips. A quip bubble ("Oof!", "Hey, boss!") shows for 1.8 s. Interns get 1.3× the shove. |
| Sit down | The chair slides out (0.32 s), then a 0.46 s hop in a 0.28 m arc into the seat. They land, scoot in with the chair, and wave hello. | Thighs fold forward 83° and knees 80°. They sit 0.13 m forward of the seat point and 0.13 m above the cushion. |
| Stand up | A 0.42 s hop in a 0.24 m arc back to the desk's approach point. | Legs unfold, arms flare, and they land. |
| Seated | — | Feet dangle (knees ±6° at 0.8–1.2 Hz, with a kick about every 7 s). Breathing ±1.2 % at about 0.25 Hz. When idle they lean back 13° and yawn-and-stretch every 15 s (2.6 s, arms up, eyes shut). |
| Needs-you (seated) | — | Right arm straight up (129°), stretched to 1.7×, waving from the elbow (±26° at 1.5 Hz). They bounce in the seat (4.5 cm) and lean aside, with worried brows, an open mouth, and a look around. Unmissable. |
| Celebrate (working → idle) | — | A 1.8 s two-arm stretch: arms up 126° and 1.3× long, a 13° lean back, eyes shut, and a little wiggle. |
| Thanks (answered in-game) | — | A happy 8 cm hop in the seat with a squint. |
| Wave | — | Right arm up 115°, waving from the elbow (±24° at 1.75 Hz) for 1.4 s, looking at the manager if within 9 m. |
| Look | — | The head turns 68 % of the way to the target, the spine twists 28 % and the head pitches 75 %, with the eyes darting ahead. People look at the manager within 4 m (12 m while they need you). |
| Idle (standing) | — | A weight shift every 3–7 s (pelvis ±1.5 cm, hip roll ±2.5°, the unloaded knee bending 7°). Breathing ±1.2 % at 0.22–0.3 Hz. Arm drift ±2°. |
| Sleeping | — | Head down on folded arms with the spine leaning 36° forward. Eyes shut, mouth open, slow deep breaths (0.2 Hz). |

## 3. Surfaces, lighting, post
### 3.1 Look principles
- **Shading and texture:** smooth standard PBR shading, with no outlines and no cel bands. Characters are untextured soft plastic with a rim (§3.3). Most world surfaces are flat vertex colour. Texture appears only where it carries information: wood planks, carpet pile, speckled desk tops, signs and screens.
- **Shape contrast:** characters are smooth, nature is faceted (low-poly trees and bushes), and the building and furniture are rounded or bevelled (§4).
- **Saturation hierarchy:** sky, clothes and accents sit near maximum (day sky `#2AABFF` at S 0.84; shirts such as `#FF6B6B` and `#4D96FF`). Big surfaces are calmer: pale walls, a honey floor. Skin stays natural and warm.
- **Shadows:** clearly darker than lit areas, but they keep their colour and gain saturation; the warm AO tint and the skin's warm lift see to that. Never grey.
- **Sky:** an almost flat, saturated azure (§3.5) with smooth white clouds tinted `#E6F4FC`.
- **Interiors:** soft, low-contrast light. The walls cast shadows, so window light pools near them, and vertical surfaces darken toward the floor.

### 3.2 Lighting and post
These are the shipped values, from `engine/index.ts` and `engine/post.ts`.
- **Sun:** `DirectionalLight('#FFF1D6', 2.8)` at elevation 55° and azimuth 40°, casting shadows.
- **Sky fill:** `HemisphereLight('#CFE6FF', '#EED7B0', 1.35)` plus `AmbientLight('#FFF6EA', 0.12)`. Lit floors are about 2.5× brighter than shadowed ones in linear light, so shadows sit at about 60 % brightness on screen.
- **Shadows:** `PCFShadowMap` (r186 removed `PCFSoftShadowMap`).
  - Map 2048, `radius` 3.5, `bias` −0.0004, `normalBias` 0.025, shadow intensity 0.85. The frustum is fitted to the office.
  - The roof, ceiling and everything on the roof never cast shadows, so the sun still lights the office.
- **AO:** N8AO at half resolution: `aoRadius` 1.0, `distanceFalloff` 1.0, `intensity` 2.5, tinted `#3B2A33` so darks stay warm. It can be switched off.
- **Blob shadows:** every character also gets one, a radial gradient in rgba(40, 34, 60) from 55 % to 0, 0.95 m across, that shrinks and fades as they rise.
- **Bloom:** `UnrealBloomPass(size, 0.35, 0.5, 1.15)` before `OutputPass`. The brightest lit surface reaches about 1.1, so only emissives glow; they are authored at 1.3–3 (screens, lamp bulbs, signs).
- **Tone mapping:** `NeutralToneMapping`, exposure 1.0.
- **Grade:** after `OutputPass`, saturation 1.08, warmth (1.02, 1.0, 0.975) and a 0.16 vignette, then SMAA.
- **Fog:** `Fog(PALETTE.skyDayHorizon, 60, 220)`.

### 3.3 Materials
Character plastics come from `chars/rig.ts`:

| Surface | Recipe |
| --- | --- |
| Skin | Roughness 0.62, rim, warm lift (§1.3) |
| Eyes | `#1E1B2E`, roughness 0.22, no rim |
| Shirt and pants | Roughness 0.8 and 0.82, rim, baked height shade |
| Shoes | Roughness 0.55 |
| Hair | Roughness 0.68 |
| Hats | Roughness 0.78; bands, pom-poms and headphone bands 0.6 |
| Glasses frames | Roughness 0.4, no rim |
| Tie, lanyard strap, badge, mug | Roughness 0.55, 0.6, 0.5, 0.45 |

- **Character rim** (every character plastic except the face details and glasses): after `#include <emissivemap_fragment>`, add
  `totalEmissiveRadiance += diffuseColor.rgb * 0.3 * pow(rimF, 2.6) + vec3(0.055, 0.05, 0.045) * pow(rimF, 5.0);`
  where `rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)))`.
- **World finishes** (`world/kit.ts`, per-vertex roughness, metalness always 0): paint and carpet 0.92, cloth 0.87, soft 0.75, wood 0.6, plastic 0.45, gloss 0.35. A per-vertex glow (an emissive multiple of the colour) above 1 blooms. Vertical surfaces darken 6–7 % over the bottom 0.8 m.
- **Glass:** `PALETTE.glass` `#BFE9FF`, roughness 0.05, opacity 0.3, `depthWrite: false`. An emissive glare texture (two soft diagonal highlights) at 0.5 makes panes read as glass with nothing behind them.
- **Albedo:** keep value between 0.08 and 0.92, so there is no pure black or pure white.

### 3.4 Procedural textures and scatter
- **Wood floor (honey, `world/building.ts`):**
  - A 1024² canvas covers 4 × 4 m (256 px/m), with staggered planks 0.2 m wide and 1.2–2.4 m long.
  - Each plank gets its own tint (±5 % value and a hair of hue).
  - Seams are soft, 2 px, and 12 % darker than the mid colour, never black.
  - 4–6 sine-warped grain streaks run at low contrast.
  - A ±3 % world-space tint at about 4 m scale hides the repeats.
- **Carpet:**
  - Pod carpets have a darker border (−7 %), a lighter stitched band (+5 %), then the field.
  - The pile is a shader texture whose fine octaves fade with screen-space size.
  - The runner from the door up the central boulevard is two nested slabs (`#F4A07A`, `#FFC4A0`) with a row of small diamonds down the middle.
- **Walls:**
  - Flat pale paint, with a 0.12 m skirting board (`#D9B98F`).
  - A mint band at 0.92–1.06 m, which is also the window sill line.
  - A soft cornice at the ceiling, and the bottom 0.8 m darkened 6–7 %.
- **Grass and garden (`world/outdoor.ts`):**
  - Grass tufts, about 400 triangles each, scattered along paths, walls and fence lines.
  - Faceted low-poly trees and bushes, drawn as instanced catalog models.
  - A hedge around the garden.

### 3.5 Time of day
Only day ships: the sky dome (`engine/sky.ts`) uses `PALETTE.skyDayTop` and `skyDayHorizon`. The other rows are kept for when time of day is built.

| | Sun | Hemi sky / ground / intensity | Sky top → horizon |
| --- | --- | --- | --- |
| Day (ships) | `#FFF1D6`, 2.8, 55° | `#CFE6FF` / `#EED7B0` / 1.35 | `#2AABFF` → `#6CC8FF` (almost flat); dome ground `#BFE6C8`; drifting clouds `#E6F4FC` |
| Golden hour (not built) | `#FFC58A`, 2.0, 15–20° | `#FFD9B8` / `#C9A0A0` / 0.9 | `#6FA8FF` → `#FFC89A` |
| Night (not built) | moon `#9DB4FF`, 0.35 | `#3A4590` / `#2A2440` / 0.5 | `#2B2F6B` → `#3F4A8C`. Lamps, screens and bloom light the room. |

## 4. World and props
`world/dimensions.json` is the source of truth. Most props are Blender catalog models, with rounded procedural fallbacks.
- **Shape language:** simple and chunky so everything reads at a glance. Use a few large props, and group clutter in tight clusters of 2–4.
- **Bevels:** everything is rounded or bevelled. Furniture edges take 2–4 cm (desk tops 3.8 cm, legs 3 cm) and small parts 1–2 cm. Keep silhouettes simple and colours flat.
- **Building:** an enclosed 28 × 20 m loft.
  - Walls 4.4 m high, under a beamed ceiling (beams every 4 m) with a skylight.
  - Windows from 0.95 to 2.45 m, plus a clerestory strip at 3.15–3.85 m.
  - Sliding glass doors 3.0 × 2.25 m.
- **Furniture:**
  - Desks: 1.44 × 0.70 m, 0.70 m high with 8 cm tops, 1.5 m apart, in pods of four on 4.2 × 4.8 m carpets.
  - Chairs: seats 0.45 m high, so seated characters' feet dangle.
  - Monitors: 0.70 × 0.48 m, centred 1.0 m up.
- **Interiors:** pale, low-saturation walls (`#FFF3DE`), a honey floor, saturated carpets and chairs, and warm wood. The room should feel as bright and clean as a gallery and as warm as a living room.
- **Outside:** faceted trees, a saturated lawn, a flat azure sky and smooth clouds. Smooth people against faceted nature is part of the look.

## 5. UI
`UX.md` §4 owns the tokens and components (`ui/theme.css`). This section sets the feel they serve.
- **Panels:** paper fill (amber means needs-you here), a 4 px ink border, a 3 px inner bevel band, and a solid, unblurred drop shadow.
- **Titles:** outlined, with a paper fill, a 5 px ink stroke (`paint-order: stroke fill`) and a 3 px solid drop, in Fredoka 700.
- **Speech:** blue glass, a gradient from `rgba(244,247,246,.92)` to `rgba(138,176,189,.88)` with a `#4396CA` edge.
- **Motion:** panels and chips pop (300 ms) on a spring easing sampled from `chars/spring.ts`, so the UI springs like the bodies. Big moments slam in (350 ms).
- **Icons:** 2D stickers with thick outlines.
- **Not built yet:**
  - Gradient fills for celebration titles: orange `#FFD23A → #FF8C1A`, green `#C8F55A → #5BC81E` or silver `#FFFFFF → #CAD8E3`, each with a 5–6 px `#3C3E3D` outline.
  - Green money and positive numbers: `#10F53A` with a 4 px `#003C01` outline.
  - Patterned full-screen backdrops, such as a checkerboard with item silhouettes at about 15 % opacity.

## 6. Camera and framing
`camera.ts` owns the camera; these are its current values.
- **Field of view:** 45°.
- **Defaults:** outdoors 10 m at a 45° pitch; indoors 7.5 m at 24°.
- **Range:** zoom runs 4–18 m and pitch 20–70°. Pitch tops out lower under the ceiling, which the camera never rises through.
- **Walls:** the camera never passes through them. When a wall crowds it, it looks over the manager's head instead.
- **Readable size:** design faces and silhouettes to read at 10 m (about 160 px for a character and 14 px for the eyes, §1.5). Closer framing only makes them bigger.
- **FOV limit:** keep it at or under about 55°. Wider bends the chunky shapes.
- **Light direction:** the sun's 40° azimuth keeps shadows diagonal to the default view. Never light from straight above or straight from the camera.
- **Where the polish goes:** at these distances, bevels and contact shadows (§4, §3.2) carry most of it.

## 7. Polish checklist (amateur tells to remove)
- [ ] Characters moving in sync (same phase, same springs). Randomise both per person.
- [ ] Sway that never settles (ζ < 0.3 on torso or arms), or no sway at all (ζ > 0.8).
- [ ] Constant-speed motion: linear lerps, instant starts and stops, rotations that pop. Everything should ease or spring.
- [ ] Feet that slide while idle, or turns on the spot with no steps.
- [ ] Objects that float or sink: no contact shadow, gaps under feet and chairs, or decals z-fighting (offset them 2–5 mm and use `polygonOffset`).
- [ ] Pure black or grey shadows; pure black or white albedo.
- [ ] One roughness for everything, or "plastic wrap" specular on skin (roughness < 0.35).
- [ ] Walls as saturated as characters. Keep the saturation hierarchy from §3.1.
- [ ] Visible texture repeats, stretched UVs, or blurry or pixelated canvas textures. Aim for at least 256 px/m on floors, with anisotropy on.
- [ ] Jaggies and shimmer on thin parts. Keep props at least 2 cm thick, with SMAA on when DPR < 1.5.
- [ ] Dead faces with no blinks or gaze shifts.
- [ ] A camera that jitters, clips into walls, or uses an FOV over about 55°.
- [ ] UI with mixed radii, stroke widths or fonts, default browser focus rings, or panels that appear without motion.
- [ ] Light pointing straight down (flattens shapes) or straight from the camera (hides form).
