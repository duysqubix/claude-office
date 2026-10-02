# Claude Office art direction

This is the look and motion spec for Claude Office. It is written for the world and character engineers, who work in Three.js r186 with
procedural springs and no physics engine. All numbers are starting values. Tune them by eye in the running game.

## The five rules
1. **Same body, different clothes.** Everyone shares one body plan: a big rounded-box head, two black eyes and no mouth. Outfit, hair and hat carry identity. For skin colour, see §1.3.
2. **Responsive root, lagging body.** The character's position reacts within about 0.1 s. Torso, head and arms follow on springs that peak 0.15–0.25 s later with one overshoot (ζ ≈ 0.4–0.5) and never ring like jelly.
3. **Short quick steps, swinging tube arms.** About 4 steps/s, with a waddle bob and sway and straight arms that swing, splay and trail.
4. **Bright sun, saturated darks.** Use real shadows and AO, but shadows keep their colour (warm and saturated, never grey). Surfaces are flat colour, with texture only where it carries information.
5. **Chunky, juicy UI.** Thick outlines, bevelled panels, outlined titles, green money, and things that pop (§5).

## 1. Characters
Every character shares one body plan. The only customisation is clothing (Hat / Top / Bottom), hair and hats.

### 1.1 Proportions (H = 1.25 m)
| Part | Ratio | Metres | Build |
| --- | --- | --- | --- |
| Head | 43 % of H tall, 47 % wide | 0.54 tall × 0.58 wide × 0.50 deep, centre at y 0.98 | `RoundedBoxGeometry(0.58, 0.54, 0.50, 8, 0.19)`. Flat-ish top and front, jaw 6 % narrower. No neck: the bottom overlaps the torso by 3 cm. |
| Eyes | 62 % of head width apart, each 13 % of head width | centres at x ±0.18, y 0.93 (59 % of the way down the head), 0.077 × 0.09 | Black ellipsoids, 0.03 deep, sunk 5 mm into the head surface. |
| Torso | 44 % of H tall, 40 % wide at the belly | y 0.19 → 0.74, belly Ø 0.50 at y 0.38, shoulders 0.38, depth 0.42 | `LatheGeometry` egg with (r, y) = (0,.19) (.17,.20) (.24,.29) (.25,.38) (.235,.49) (.20,.60) (.15,.69) (.08,.73) (0,.74), then scale z by 0.84. |
| Arms | 32 % of H long, 10 % thick | pivot at (±0.22, 0.64), length 0.40, r 0.062 | Straight capsule with no elbow and no hand ball (the tip may swell to 1.1× r). The tip hangs just above the crotch. Rest splay 22–26°, which also keeps the arm clear of the belly. |
| Legs | hip at 21 % of H, 16 % visible | pivots at (±0.10, 0.26), r 0.075, hip to sole 0.26 | Capsule ending in a barefoot nub 0.16 long, shifted 0.03 forward. |

The top-heavy build is deliberate: the big head is what makes lag and wobble readable.

### 1.2 Face
- Two solid black ovals in `#15110A` with roughness 0.3, so the moving sun glint acts as the catchlight. The default face has no eye whites, painted highlights, brows, nose, cheeks or **mouth**.
- Expression comes from the body (head tilt, arm pose) and from short-lived extras:
  - a blink (eye scale.y → 0.1 over 60 ms);
  - an "O" mouth for alerts;
  - a happy squint (scale.y 0.55);
  - dizzy stars after a hard knock.

### 1.3 Skin
- **Direction:** one shared, saturated skin colour for everyone, so skin reads as "a character" anywhere in the room. The default pick is sunny yellow `#FFCC14`; apricot `#FFB25B` adds brand flavour. This is still an open product call, and `PALETTE.skins` stays until it is made.
- **On screen:** lit yellow skin should read about `#FEE102` (S ≈ 0.99). The shadow side turns warm amber, never olive or grey.
- **Material:** `MeshStandardMaterial({ color: '#FFCC14', roughness: 0.5, metalness: 0 })` plus the fresnel rim from §3.3 at 0.15. Smooth normals, at least 48 segments, no texture.

### 1.4 Clothing and customisation
- **Construction:** each garment is a separate shell 1–2 cm outside the body. Hat, Top and Bottom are separate meshes, each with one recolourable material whose colour is picked from `PALETTE`.
- **Patterns:** florals, plaid, hearts, checks and hi-vis stripes, drawn on a 256² `CanvasTexture`. Mix: 55 % plain, about 10 % each of stripes, plaid, florals and dots. Use at most two colours per piece.
- **Hats and hair:** hats are oversized (1.05–1.25× head width) and silly: viking helmet, traffic cone, fried egg, party hat. Hair is chunky, built from clustered low-poly lumps.
- **Feet:** characters are barefoot by default. Shoes, if used, are rounded caps no wider than 1.15× the leg.

### 1.5 Reading at a distance
At 10 m (the outdoor default; indoors the camera sits closer), with FOV 45° on a 1080p screen, a 1.25 m character is about 160 px tall and its eyes about 12 px. Characters read through four things:
- a skin colour used nowhere else in the scene;
- the head-plus-hat silhouette;
- two clothing colour blocks (top and bottom at least 25 % apart in value);
- the wide-set eye pair.

Keep skin-coloured props out of the office.

### 1.6 Look rules
- **Default face:** two plain black ovals. No catchlights, brows, mouth or blush (§1.2).
- **Head:** a rounded box on an egg body, with no neck.
- **Arms:** long straight tubes reaching the crotch, with no ball hands.
- **Legs:** stubby, ending in barefoot nubs or low rounded shoe caps.
- **Running:** forward lean with pumping, trailing arms. Arms go up only in the air (jump) or to signal (needs-you).

## 2. Movement
### 2.1 Motion character
- **Overall feel:** a light ragdoll on snappy controls. Position responds at once; torso, head and arms catch up a beat later.
- **Cadence:** about 4 steps/s at a walk (§2.5). Each foot is in the air for only about 27 % of the cycle, so steps are short, quick and shuffling, with long double support.
- **Bob:** twice per cycle. Lowest mid-swing and highest just after a plant, like a toddler's waddle rather than an adult's gait.
- **Sway:** once per cycle, at half the bob frequency. The body moves toward the stance foot during each swing and peaks as the swinging foot lands, a quarter-cycle late.
- **Arms:** straight and splayed. A small swing at a walk; at a run, a big pump that trails behind (§2.5).
- **Turns:** the head turns first and the body follows about 0.1 s later.
- **Raised arms:** overshoot and wobble a little as they settle.

### 2.2 Always and never
**Always:** lagging torso, head and arms; quick short steps; waddle bob and sway; splayed swinging arms; head-led turns; a little overshoot on stopping.
**Never:**
- stumbles or falls during normal movement;
- a bob bigger than §2.5 allows;
- a lean beyond 15° at a run;
- more than one visible overshoot on big chains (keep ζ ≥ 0.38);
- arm stretching or sticking.

### 2.3 Architecture: a fake active ragdoll
A physics ragdoll gets this look by chasing an animated pose through joint motors. We fake the same thing without physics:
1. Each frame, compute a **target pose** analytically from the gait and the character's intent.
2. Let **per-joint springs** chase that target. Lag, overshoot and follow-through come from the springs, so never keyframe them.

Per-frame order: root velocity and heading → gait phase → target pose (plus acceleration terms) → springs → write to bones. A handful of key poses plus springs is enough for the whole character.

### 2.4 Spring settings (`Spring(freq Hz, ζ)` in `chars/spring.ts`)
For x'' = ω²(target − x) − 2ζωx' with ω = 2πf, overshoot is exp(−πζ/√(1−ζ²)):

| ζ | 0.2 | 0.3 | 0.4 | 0.45 | 0.5 | 0.6 | 0.7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Overshoot | 53 % | 37 % | 25 % | 21 % | 16 % | 9.5 % | 4.6 % |

- The first peak arrives at t = 1/(2f√(1−ζ²)).
- **"A little delayed"** means secondary chains peak 0.15–0.25 s after the cause, which gives f ≈ 2.2–3.5 Hz.
- **"Not exaggerated"** means ζ ≥ 0.38 on big chains, so the second overshoot stays under 3 %. Use ζ < 0.3 only for small dangling parts.
- Values of ζ between 0.17 and 0.26 on torso, arms and squash give 43–58 % overshoot and 2–3 visible rings. That is the jelly look we avoid.

| `body.ts` key | was | use | effect |
| --- | --- | --- | --- |
| lean / side | 2.8/0.26, 2.6/0.24 | 2.6/0.45, 2.4/0.45 | tips on start and stop, rocks back once |
| twist | 3.2/0.34 | 3.0/0.50 | |
| headPitch / headRoll | 3.6/0.30, 3.2/0.26 | 3.8/0.40, 3.5/0.40 | nod lags the body by about 0.1 s |
| headYaw | 3.4/0.38 | 4.5/0.70 | head leads turns without overshoot |
| arm*Pitch / arm*Roll | 4.2/0.22, 4.0/0.24 | 3.2/0.38, 3.2/0.40 | arms feel heavier, swing late, settle in about 0.5 s |
| arm*Yaw / arm*Stretch | 4.0/0.30, 5.5/0.20 | 3.5/0.45, 6.0/0.35 | |
| squash | 4.6/0.17 | 6.5/0.35 | quick squash, one rebound |
| hipRoll | 5/0.35 | 4.0/0.45 | sway |
| leg*, crouch, hipTwist | unchanged | unchanged | legs must track the gait tightly |
| heading (`AngleSpring`) | 3.1/0.42 | 3.0/0.60 | overshooting yaw reads as drunk |
| hair / jig | 5.2/0.12, 3.6/0.09 | 5.5/0.22, 4.5/0.20 | small danglers can ring a little |

- **Variation:** randomise f by ±8 % and ζ by ±0.04 per character so a room never moves in lockstep.
- **Anticipation:** use a second-order filter with an initial-response term r: k1 = ζ/(πf), k2 = 1/(2πf)², k3 = rζ/(2πf). With r < 0 it winds up before moving; with r > 1 it overshoots from the start.
- **Root smoothing** with no overshoot uses a critically damped spring with damping = 4·ln2/halflife.

### 2.5 Gait (H = 1.25 m, hip height 0.26 m)
- **Cadence** (steps/s) = clamp(2.8 + 0.6·v, 3.2, 5.6). That gives 3.6 at 1.4 m/s, 4.1 at 2.2 m/s and 5.5 at 4.5 m/s. Phase advances by cadence·dt; one step is half a cycle.
- **Legs:** step length = v / cadence. Leg pitch amplitude = atan(step/2 / 0.26), clamped to 15–40° when walking and up to 50° when running. That gives 37° at 1.4 m/s and the 40° cap at 2.2 m/s. The slight foot slide at the top of the walk range is invisible at camera distance and keeps steps short and shuffling.
- **Foot lift:** the swing foot lifts by h·sin²(π·u), where u is the swing progress and h is 0.035 m walking or 0.07 m running. The run has a flight phase with both feet off the ground for about 15 % of the cycle.
- **Bob:** pelvis y = −A·sin²(π·s), where s is the step phase (0 at a plant). A is 0.03 m walking and 0.06 m running.
- **Sway:** the pelvis moves ±0.025 m and rolls ±3° toward the stance foot (±0.035 m and ±5° when running), peaking at the next plant. The simplest version is a spring (2.2 Hz, ζ 0.5) chasing a ±sway target that flips at each plant.
- **Torso lean:** 3.5° per m/s, capped at 8° walking and 14° running. Subtract 0.5° per m/s² of forward acceleration (clamp ±8°) so the torso lags like a dragged ragdoll: it tips back when starting and forward when braking.
- **Arms:**
  - Pitch swings opposite to the same-side leg: ±15° at 1.4 m/s, ±18° at 2.2 m/s, and ±45° running with a −15° backward bias.
  - Splay goes from 22° at idle to 28° running.
  - Add −1.5° per m/s² of forward acceleration (clamp ±25°).
  - The arm springs lag the gait by 30–70° and amplify it 1.25–1.4×, so author about 0.75× of the amplitude you want on screen.
- **Head:** counter-rotate 50 % of the torso's pitch and roll so the gaze stays level. Kick the nod spring at each plant.
- **Feet and turns:**
  - Idle feet never slide.
  - NPCs smooth path corners with a 0.6 m look-ahead.
  - When turning more than 60° in place, take 2–3 shuffle steps at 3 steps/s rather than spinning on the spot.

### 2.6 Moments
| Moment | Root | Body |
| --- | --- | --- |
| Start | 0 to walk speed in 0.15 s (14 m/s²) | The first foot lifts within 50 ms. The torso dips back slightly, then leans in. Arms fly back about 20°. |
| Stop | walk to 0 in about 0.11 s (20 m/s²) | Legs finish the current step (≤ 0.15 s). The torso tips a few degrees further forward, then rocks back past upright once. Arms swing forward 20–25°. The head nods 6°. |
| Turn | heading spring 3.0/0.6 | The head leads (yaw spring 4.5/0.7, clamp ±50°). Bank into the turn at 1.2° per m/s² of lateral acceleration, up to 10°. The outer arm splays an extra 8°. |
| Jump (manager) | 70 ms crouch, then v0 5.2 m/s under 20 m/s² gravity: apex 0.68 m, 0.52 s in the air | Crouch: squash −10 %, arms back −25°. Rise: stretch +8 %, arms up 100–140° (the springs make them flail late), legs tuck 25°. Land: squash −15 %, arms drop and overshoot, the head nods. |
| Bump | 0.2 m stagger over 0.25 s with 2 shuffle steps | Velocity kicks make the torso peak about 10° along the push (about 5 rad/s at 2.6 Hz); the head adds about 10° and the arms flare about 20°. A "!" pops. A hard bump adds 1.5 s of dizzy stars. Nobody falls. |
| Sit | hop 0.10 m into the seat over 0.25 s | Squash 8 % on landing. The stubby legs dangle as a pendulum (±8° at 0.8–1.2 Hz), with a kick every 4–9 s. |
| Idle | none | Breathing on scale.y ±1.2 % at 0.22–0.3 Hz, random per person. A weight shift every 3–7 s (pelvis ±0.015 m, spring 1.2/0.7). A look around every 2–5 s (yaw ±35°, pitch ±10°). A blink every 2–6 s (120 ms; 15 % are double blinks). Arm drift ±2°. |
| Get-up (only if full falls are ever added) | none | Limp for 0.8–1.2 s. Pop upright in 0.15 s with the head drooped 40°, then the head lifts on a 2 Hz / ζ 0.6 spring. |

## 3. Surfaces, lighting, post
### 3.1 Look principles
- **Shading and texture:** smooth standard PBR shading, with no outlines, no cel bands and no texture on characters. Most surfaces are flat colour. Texture appears only where it carries information: bricks, hedge leaves, grass blades, wood boards, fabric patterns.
- **Shape contrast:** characters are smooth, nature is faceted (flat-shaded low-poly trees and rocks), and buildings are simple boxes, bevelled per §4.
- **Saturation hierarchy:**
  - Sky and characters sit near maximum: day sky `#2AABFF` at S 0.84, yellow skin reading `#FEE102` at S 0.99.
  - Large world surfaces are mid-saturation: brick red `#99413E` at S 0.59, building blue `#276189`.
  - Interiors pair pale walls with saturated floors.
- **Shadows:** clearly darker than lit areas, but they keep their colour and gain saturation. Sand-coloured ground goes from `#8D6D49` lit to `#3D2D1A` in hard shadow (S 0.48 → 0.57). Shadows are never grey.
- **Sky:** an almost flat, saturated azure (§3.5) with puffy, faintly blue clouds (`#E6F4FC`). Night is indigo (`#383F85`) with a flat moon disc and stars.
- **Interiors:** soft, low-contrast light, with gentle darkening in corners and warm pools of light under lamps.

### 3.2 Lighting recipe for the office
Units are physically correct. Current `engine/index.ts` values are in square brackets.
- **Sun:** `DirectionalLight('#FFF1D6', 2.6–3.0)` [2.4]. Elevation 50–58°, azimuth 35–45° off the default camera axis so shadows fall diagonally across the desks.
- **Sky fill:** `HemisphereLight('#CFE6FF', '#EED7B0', 1.2–1.5)` [1.35]. Aim for a lit floor about 2.5–3× brighter than a shadowed one in linear light. That makes shadows look about 60 % as bright on screen: soft, but clearly there.
- **Shadows:** `PCFShadowMap` (r186 removed `PCFSoftShadowMap`).
  - Map size 2048 (4096 on desktop), `radius` 3–4, `bias` −0.0004, `normalBias` 0.02–0.03.
  - Fit the frustum to at most 32 × 24 m, which gives texels of about 1.5 cm.
- **AO:** N8AO with `aoRadius` 0.8–1.2, `distanceFalloff` 1 and `intensity` 2–3, tinted `#3B2A33` so darks stay warm and saturated.
  - Add blob shadows under characters: a radial gradient at opacity 0.3 and radius 0.4 m that shrinks and fades with jump height.
- **Bloom:** `UnrealBloomPass(size, 0.35, 0.5, 1.0)` before `OutputPass`.
  - The composer's render targets are half-float, so HDR survives and only emissive values above 1 bloom.
  - Emissive levels: screens 1.3–1.8, signage 2, the needs-you "!" 2.5.
- **Tone mapping:** `NeutralToneMapping` at exposure 1.0–1.1. If albedos can't get punchy enough, add a final +8 % saturation pass rather than raising exposure.
- **Fog:** `Fog(horizon, 60, 220)`, softening distance only slightly.

### 3.3 Materials
| Surface | Recipe |
| --- | --- |
| Skin | `#FFCC14`, roughness 0.5, metalness 0, fresnel rim 0.15 |
| Eyes | `#15110A`, roughness 0.3 |
| Cloth | Roughness 0.85–0.9. Optionally `MeshPhysicalMaterial` with sheen 0.3, `sheenRoughness` 0.6 and `sheenColor` set to the cloth colour +30 % lightness, for a plush edge. |
| Hair and hats | Roughness 0.6–0.75. Hard hats and helmets 0.35. |
| Plastic (chairs, monitors, mugs) | Roughness 0.35–0.5 |
| Wood | Roughness 0.55–0.65 |
| Painted walls and carpet | Roughness 0.9–0.95, no normal maps |
| Glass | Opacity 0.25–0.35, roughness 0.05, `depthWrite: false` |
| Metal accents (chair bases only) | Metalness 0.4, roughness 0.4 |

- Keep albedo value between 0.08 and 0.92: no pure black or pure white.
- **Fresnel rim** (characters only, MeshStandard/MeshPhysical in r186): in `onBeforeCompile`, insert this line after `#include <emissivemap_fragment>`:
  `totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`
  Set `uRim` to a warm white scaled by 0.12–0.18.

### 3.4 Procedural textures
Use `CanvasTexture` with `colorSpace = SRGBColorSpace`, mipmaps on and anisotropy 8.
- **Wood floor (honey):**
  - A 1024² canvas covers 4 × 4 m, with staggered planks 0.2 m wide and 1.2–2.4 m long.
  - Vary each plank by ±5 % value and ±3° hue.
  - Seams are 2 px and 12 % darker, never black.
  - Draw 4–6 soft, sine-warped grain streaks per plank at 3–5 % contrast, with no speckle noise.
  - Hide repeats with a world-space tint of ±3 % at about 4 m scale.
- **Carpet:** flat colour plus 2–3 px noise at ±2 %, with a 4 cm border band 10 % darker. The break-area rug is 2–3 bold concentric shapes in two colours plus cream.
- **Grass (outside):**
  - Base colour with 2 octaves of value noise at ±6 % over 1–3 m.
  - Clumps of blade cards (3–5 blades, 0.15–0.3 m tall, dark at the root and light at the tip), along edges only.
  - Trees are flat-shaded icosphere clusters.
- **Walls:** flat paint with no texture. Darken the bottom 0.8 m by 6 % with vertex colours. Add a 0.12 m skirting board in a darker accent, and optionally a band at 0.9–1.1 m.

### 3.5 Time of day (if the office follows the real clock)
| | Sun | Hemi sky / ground / intensity | Sky top → horizon |
| --- | --- | --- | --- |
| Day | `#FFF1D6`, 2.8, 55° | `#CFE6FF` / `#EED7B0` / 1.35 | `#2AABFF` → `#6CC8FF` (almost flat) |
| Golden hour | `#FFC58A`, 2.0, 15–20° | `#FFD9B8` / `#C9A0A0` / 0.9 | `#6FA8FF` → `#FFC89A` |
| Night | moon `#9DB4FF`, 0.35 | `#3A4590` / `#2A2440` / 0.5 | `#2B2F6B` → `#3F4A8C`. Lamps, screens and bloom light the room. |

## 4. World and props
- **Shape language:** simple and chunky so everything reads at a glance. Use a few large props, and group clutter in tight clusters of 2–4.
- **Bevels:** every prop is bevelled (RoundedBox radius 2–4 cm, 3–4 segments). The camera works 4–18 m from the furniture, and edge highlights are the cheapest polish. Keep silhouettes simple and colours flat.
- **Scale:** furniture runs slightly large for the 1.25 m characters, so tables sit at chest height. Suggested sizes: seat 0.32 m (so feet dangle), desk 0.62 m, monitor centre 0.95 m, door 2.1 m.
- **Interiors:** pale, low-saturation walls (S ≤ 0.15, V ≈ 0.9), saturated floors and rugs, warm wood, and one or two strong upholstery colours. The room should feel as bright and clean as a gallery and as warm as a living room.
- **Outside the windows:** faceted trees, a saturated lawn, a flat azure sky and puffy clouds. Smooth people against faceted nature is part of the look.

## 5. UI
UX.md §4 owns the tokens and components. This section sets the feel they serve.
- **Panels:** paper fill (amber means needs-you here), a thick ink border, an inner bevel band and a solid drop shadow with no blur. If a surface ever does need amber, use this construction: fill `#DCA31E`, 4 px `#4C2502` border, 4 px `#B57422` inner band, radius 14 px.
- **Titles:** outlined, chunky and rounded (Fredoka 700 with `paint-order: stroke fill; -webkit-text-stroke`).
  - Big moments can use a vertical gradient fill: orange `#FFD23A → #FF8C1A`, green `#C8F55A → #5BC81E`, or silver `#FFFFFF → #CAD8E3`.
  - Gradient titles get a 5–6 px `#3C3E3D` outline and a soft drop shadow.
- **Words with meaning:** green means good, yellow medium, red bad. Money and positive numbers are `#10F53A` with a 4 px `#003C01` outline.
- **Speech:** blue glass. A translucent gradient from `rgba(244,247,246,.92)` to `rgba(138,176,189,.88)`, a 5 px `#4396CA` border, radius about 20 px, and text in `#3A3A3A`.
- **HUD accents:** thick rounded rings and pills with a 2 px dark outline (`#672B06` on orange `#F6AC00`; keep orange away from needs-you amber). Key hints are small rounded chips, and icons are 2D stickers with thick dark outlines.
- **Juice:**
  - Titles slam in (scale 1.4 → 0.95 → 1.0 over 0.35 s).
  - Panels pop (0.85 → 1.04 → 1.0 over 0.25 s).
  - Successes burst with confetti or flying cash, and counters tick up.
  - Full-screen menus sit over a patterned backdrop, such as a blue checkerboard with item silhouettes at about 15 % opacity.

## 6. Camera and framing
`camera.ts` owns the camera's distance and pitch. Zoom runs 4–18 m, and the camera sits closer by default indoors.
- **Readable size:** design faces and silhouettes to read at 10 m: about 160 px for a character and 12 px for the eyes on a 1080p screen (§1.5). Closer framing only makes them bigger.
- **FOV:** keep it at or under about 55°. Wider bends the chunky shapes.
- **Light direction:** the sun comes from 35–45° off the default camera axis (§3.2), never straight down and never straight from the camera.
- **Where the polish goes:** at these distances, bevels and contact shadows (§4, §3.2) carry most of it.

## 7. Polish checklist (amateur tells to remove)
- [ ] Characters moving in sync (same phase, same springs). Randomise both per person.
- [ ] Wobble that never settles (ζ < 0.3 on torso or arms), or no wobble at all (ζ > 0.8).
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
