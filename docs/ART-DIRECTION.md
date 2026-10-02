# Art reference: Wobbly Life → Claude Office

This brief is for the world and character engineers working in Three.js r186 with procedural springs and no physics engine.
Sources are cited as [n] and listed at the end. Anything marked **(measured)** comes from official Steam screenshots or
30 fps trailer frames saved in `snaps/ref/`. All numbers are starting values. Tune them by eye with the reference images open beside the game.

## 0. Reference images (`snaps/ref/`, gitignored)

| File | What to take from it |
| --- | --- |
| `wl-01-closeup-face.jpg` | Face is two black ovals and nothing else. Rounded-box head, no neck, clothes worn as a shell. Translucent blue dialogue box. |
| `wl-02-fullbody-street.jpg` | Full body in clothes, arms splayed about 25°, crisp sun shadow, flat saturated azure sky. |
| `wl-03-clothes-shop-ui.jpg` | Near-orthographic front view for proportions. Amber panel, tabs, sticker icons, patterned backdrop. |
| `wl-04-hammer-job.jpg` | Two-handed tool pose with straight arms. Dark, warm, saturated shadows on sand. "Job Complete" juice with flying cash. |
| `wl-05-museum-interior.png` | The bright, clean interior closest to our office: pale walls, marble floor, soft shadows, gold accents. |
| `wl-06-temple-interior.jpg` | Warm point lights with falloff in a dark room. Character seen from behind (hat, coat). |
| `wl-07-board-ui.jpg` | Gradient title with outline, handwritten body font, green/yellow/red words, diegetic wood and paper UI. |
| `wl-08-houses-panel-ui.jpg` | World shapes (simple boxes, flat colour, faceted trees) and the standard panel and button style. |
| `wl-t1-bald-front.png` | Unclothed default Wobbly, front view. **This is the proportion reference** (§1.1). |
| `wl-t2-walk-cycle-30fps.jpg` | 38 consecutive frames of a walk from behind, for cadence, bob and sway (§2.1). |
| `wl-t3-fall-getup-walk.jpg` | Limp on the road, hops upright, head lifts, walks off (12 fps). |
| `wl-t4-turn-sprint-30fps.jpg` | Walk, then a head-led turn, then a sprint lean with a trailing arm. |
| `wl-t5-living-room.jpg` | Interior palette: pale walls, terracotta carpet, flat-shape rug, chunky wood furniture. |
| `wl-t6-grandma-hallway.jpg` | Faceted low-poly hair, patterned dress, warm light pool on the ceiling. |

## The five rules
1. **Same body, different clothes.** Everyone shares one saturated skin colour, a big rounded-box head, two black eyes and no mouth. Outfit, hair and hat carry identity.
2. **Responsive root, lagging body.** The character's position reacts within about 0.1 s. Torso, head and arms follow on springs that peak 0.15–0.25 s later with one overshoot (ζ ≈ 0.4–0.5) and never ring like jelly.
3. **Short quick steps, swinging tube arms.** About 4 steps/s, with a waddle bob and sway and straight arms that swing, splay and trail.
4. **Bright sun, saturated darks.** Use real shadows and AO, but shadows keep their colour (warm and saturated, never grey). Surfaces are flat colour, with texture only where it carries information.
5. **Chunky, juicy UI.** Amber panels with dark-brown double borders, gradient titles with outlines, green money, and things that pop.

## 1. Characters ("Wobblies")
Every Wobbly is "a stiff, humanoid blob" [2], a yellow jelly figure that players customise only through clothing ("over 500 clothing items" across Hats / Tops / Pants [1][4]).

### 1.1 Proportions for H = 1.25 m (measured on `wl-t1`, cross-checked on `wl-02` and `wl-03`)
| Part | Ratio | Metres | Build |
| --- | --- | --- | --- |
| Head | 43 % of H tall, 47 % wide | 0.54 tall × 0.58 wide × 0.50 deep, centre at y 0.98 | `RoundedBoxGeometry(0.58, 0.54, 0.50, 8, 0.19)`. Flat-ish top and front, jaw 6 % narrower. No neck: the bottom overlaps the torso by 3 cm. |
| Eyes | 62 % of head width apart, each 13 % of head width | centres at x ±0.18, y 0.93 (59 % of the way down the head), 0.077 × 0.09 | Black ellipsoids, 0.03 deep, sunk 5 mm into the head surface. |
| Torso | 44 % of H tall, 40 % wide at the belly | y 0.19 → 0.74, belly Ø 0.50 at y 0.38, shoulders 0.38, depth 0.42 | `LatheGeometry` egg with (r, y) = (0,.19) (.17,.20) (.24,.29) (.25,.38) (.235,.49) (.20,.60) (.15,.69) (.08,.73) (0,.74), then scale z by 0.84. |
| Arms | 32 % of H long, 10 % thick | pivot at (±0.22, 0.64), length 0.40, r 0.062 | Straight capsule with no elbow and no hand ball (the tip may swell to 1.1× r). The tip hangs just above the crotch. Rest splay 22–26°, which also keeps the arm clear of the belly. |
| Legs | hip at 21 % of H, 16 % visible | pivots at (±0.10, 0.26), r 0.075, hip to sole 0.26 | Capsule ending in a barefoot nub 0.16 long, shifted 0.03 forward. |

The top-heavy build is deliberate. Fall Guys' designers say "top-heavy characters were important so that the beans could fall easily" [9]. The big head is what makes lag and wobble readable.

### 1.2 Face
- Two solid black ovals in `#15110A` with roughness 0.3, so the moving sun glint acts as the catchlight. No eye whites, painted highlights, brows, nose, cheeks or **mouth**. In WL a mouth with a tongue is a novelty item sold in the Hats tab (`wl-03`).
- Expression comes from the body (head tilt, arm pose) and from short-lived extras: a blink (eye scale.y → 0.1 over 60 ms), an "O" mouth for alerts, a happy squint (scale.y 0.55), and dizzy stars after a hard knock. In WL, lightning makes a Wobbly "fall over with stars about their head" [8].

### 1.3 Skin
- On screen, WL skin reads `#FEE102` when lit (S 0.99) **(measured)**. The shadow side turns warm amber, never olive or grey.
- Material: `MeshStandardMaterial({ color: '#FFCC14', roughness: 0.5, metalness: 0 })` plus the fresnel rim from §3.3 at 0.15. Smooth normals, at least 48 segments, no texture.

### 1.4 Clothing and customisation
- Each garment is a separate shell 1–2 cm outside the body. WL's mod SDK splits clothing into Hat / Top / Bottom meshes, each recoloured through one shader colour (`_ReplaceColor`) [4]. Copy that: one material per piece, with the colour picked from `PALETTE`.
- Patterns are a big part of WL's charm: florals, plaid, hearts, checks and hi-vis stripes (`wl-03`, `wl-04`, `wl-t2`). Draw them on a 256² `CanvasTexture` with this mix: 55 % plain, about 10 % each of stripes, plaid, florals and dots. Use at most two colours per piece.
- Hats are oversized (1.05–1.25× head width) and silly: viking helmet, traffic cone, fried egg, party hat. Hair is chunky, built from clustered low-poly lumps (`wl-t6`).
- Characters are barefoot by default. Shoes, if used, are rounded caps no wider than 1.15× the leg.

### 1.5 Reading at a distance
At the default 10 m camera distance (FOV 45°, 1080p), a 1.25 m character is about 160 px tall and its eyes about 12 px. A WL character reads through four things: a skin colour used nowhere else in the scene, the head-plus-hat silhouette, two clothing colour blocks (top and bottom at least 25 % apart in value), and the wide-set eye pair. Keep skin-coloured props out of the office.

### 1.6 Differences from the current build (`snaps/lineup-*.png`)
- **Faces:** catchlight eyes, brows, mouth and blush → two plain black ovals (§1.2).
- **Skin:** six human skin tones → one shared skin. WL yellow is `#FFCC14`. A Claude apricot (`#FFB25B`) would keep the effect with brand flavour. This is a product call for the lead.
- **Head and torso:** sphere head on a cylinder torso → rounded-box head on an egg body, with no neck.
- **Arms:** short arms with ball hands → long straight tubes reaching the crotch, no hands.
- **Legs:** shoes on longer legs → stubby legs ending in barefoot nubs.
- **Run pose:** both arms raised, which reads as cheering → forward lean with pumping, trailing arms. Arms go up only in the air (jump) or to signal (needs-you).

## 2. Movement
### 2.1 What Wobbly Life does
- Characters are physics-driven. The stack is Unity plus NVIDIA PhysX, and "everything else is custom made" [3]. Reviewers describe "the same awkward, floppy physics as a Fall Guys contestant" [2] and characters "falling over at the lightest touch on a hard object" [5]. Each trigger raises one arm to grab or "hold on for dear life" [5][6].
- Measured from 30 fps trailer frames:
  - **Cadence:** about 4 steps/s, with a foot plant every 7–8 frames. Each foot is in the air for only about 4 frames (27 % of the cycle), so steps are short, quick and shuffling, with long double support (`wl-t2`).
  - **Bob:** the head top drops about 6 % of H twice per cycle. It is lowest mid-swing and highest just after a plant, like a toddler's waddle rather than a human gait.
  - **Sway:** once per cycle, the head top moves ±3 % of H toward the stance foot during each swing. It peaks as the swinging foot lands, a quarter-cycle late. Sway runs at half the bob frequency [16].
  - **Arms:** straight and splayed 20–30°, with only ±15–20° of swing at a walk. At a sprint the torso leans about 20° and the trailing arm reaches about 70° behind (`wl-t4`).
  - **Turns:** the head turns first and the body follows about 0.1 s later (`wl-t4`).
  - **Get-up:** limp for about 1 s, then hops upright in about 0.15 s with the head drooped about 40° and the arms limp. The head lifts back over 0.6–0.9 s (`wl-t3`).

### 2.2 What to keep and what to dial down
**Keep:** lagging torso, head and arms; quick short steps; waddle bob and sway; splayed swinging arms; head-led turns; overshoot on stopping.
**Dial down:** no stumbles or falls during normal movement; about 40 % of WL's bob; lean of at most 15° at a run; one overshoot and then settle (ζ ≥ 0.38 on big chains); no arm stretching or sticking.

### 2.3 Architecture: a fake active ragdoll
WL's internals aren't public. Its look matches the usual Unity active ragdoll, where a physics body chases an animated pose through joint motors, as in PuppetMaster [11]. Fake that pattern without physics:
1. Each frame, compute a **target pose** analytically from the gait and the character's intent.
2. Let **per-joint springs** chase that target. Lag, overshoot and follow-through come from the springs, so never keyframe them.

Per-frame order: root velocity and heading → gait phase → target pose (plus acceleration terms) → springs → write to bones. David Rosen's Overgrowth character uses "only 13 keyframes in total for everything" plus springs [12].

### 2.4 Spring settings (`Spring(freq Hz, ζ)` in `chars/spring.ts`)
For x'' = ω²(target − x) − 2ζωx' with ω = 2πf, overshoot is exp(−πζ/√(1−ζ²)):

| ζ | 0.2 | 0.3 | 0.4 | 0.45 | 0.5 | 0.6 | 0.7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Overshoot | 53 % | 37 % | 25 % | 21 % | 16 % | 9.5 % | 4.6 % |

- The first peak arrives at t = 1/(2f√(1−ζ²)). **"A little delayed"** means secondary chains peak 0.15–0.25 s after the cause, which gives f ≈ 2.2–3.5 Hz.
- **"Not exaggerated"** means ζ ≥ 0.38 on big chains, so the second overshoot stays under 3 %. Use ζ < 0.3 only for small dangling parts.
- The current `TUNING` runs ζ 0.17–0.26 on torso, arms and squash. That gives 43–58 % overshoot and 2–3 visible rings: the jelly look we are moving away from.

| `body.ts` key | now | recommended | effect |
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

Randomise f by ±8 % and ζ by ±0.04 per character so a room never moves in lockstep.
For anticipation, t3ssel8r's second-order system adds an initial-response term r: k1 = ζ/(πf), k2 = 1/(2πf)², k3 = rζ/(2πf). With r < 0 the system winds up before moving; with r > 1 it overshoots from the start [13]. For root smoothing with no overshoot, use Holden's critically damped spring with damping = 4·ln2/halflife [14].

### 2.5 Gait (H = 1.25 m, hip height 0.26 m)
- **Cadence** (steps/s) = clamp(2.8 + 0.6·v, 3.2, 5.6). That gives 3.6 at 1.4 m/s, 4.1 at 2.2 m/s and 5.5 at 4.5 m/s. Phase advances by cadence·dt, and one step is half a cycle.
- **Legs:** step length = v / cadence. Leg pitch amplitude = atan(step/2 / 0.26), clamped to 15–40° when walking and up to 50° when running. That gives 37° at 1.4 m/s and the 40° cap at 2.2 m/s. The slight foot slide at the top of the walk range is invisible at camera distance and keeps WL's short, shuffling steps.
- **Foot lift:** the swing foot lifts by h·sin²(π·u), with u the swing progress and h = 0.035 m walking or 0.07 m running. The run has a flight phase with both feet off the ground for about 15 % of the cycle.
- **Bob:** pelvis y = −A·sin²(π·s), where s is the step phase (0 at a plant). A is 0.03 m walking and 0.06 m running.
- **Sway:** pelvis moves ±0.025 m and rolls ±3° toward the stance foot (±0.035 m and ±5° when running), peaking at the next plant. The simplest version is a spring (2.2 Hz, ζ 0.5) chasing a ±sway target that flips at each plant.
- **Torso lean:** 3.5° per m/s, capped at 8° walking and 14° running. Subtract 0.5° per m/s² of forward acceleration (clamp ±8°) so the torso lags like a dragged ragdoll: it tips back on starting and forward on braking.
- **Arms:** pitch swings opposite to the same-side leg: ±15° at 1.4 m/s, ±18° at 2.2 m/s and ±45° running with a −15° backward bias. Splay goes from 22° at idle to 28° running. Add −1.5° per m/s² of forward acceleration (clamp ±25°). The arm springs lag the gait by 30–70° and amplify it 1.25–1.4×, so author about 0.75× of the amplitude you want on screen.
- **Head:** counter-rotate 50 % of the torso's pitch and roll so the gaze stays level. Kick the nod spring at each plant.
- **Feet and turns:** idle feet never slide. NPCs smooth path corners with a 0.6 m look-ahead. When turning more than 60° in place, take 2–3 shuffle steps at 3 steps/s rather than spinning on the spot.

### 2.6 Moments
| Moment | Root | Body |
| --- | --- | --- |
| Start | 0 to walk speed in 0.15 s (14 m/s²) | First foot lifts within 50 ms. Torso dips back slightly, then leans in. Arms fly back about 20°. |
| Stop | walk to 0 in about 0.11 s (20 m/s²) | Legs finish the current step (≤ 0.15 s). Torso tips a few degrees further forward, then rocks back past upright once. Arms swing forward 20–25°. Head nods 6°. |
| Turn | heading spring 3.0/0.6 | Head leads (yaw spring 4.5/0.7, clamp ±50°). Bank into the turn at 1.2° per m/s² of lateral acceleration, up to 10°. Outer arm splays an extra 8°. |
| Jump (manager) | 70 ms crouch, then v0 5.2 m/s under 20 m/s² gravity: apex 0.68 m, 0.52 s in the air | Crouch: squash −10 %, arms back −25°. Rise: stretch +8 %, arms up 100–140° (the springs make them flail late), legs tuck 25°. Land: squash −15 %, arms drop and overshoot, head nods. |
| Bump | 0.2 m stagger over 0.25 s with 2 shuffle steps | Velocity kicks so the torso peaks about 10° along the push (about 5 rad/s at 2.6 Hz), the head adds about 10°, and the arms flare about 20°. "!" pops. A hard bump adds 1.5 s of dizzy stars. Nobody falls. |
| Sit | hop 0.10 m into the seat over 0.25 s | Squash 8 % on landing. The stubby legs dangle as a pendulum (±8° at 0.8–1.2 Hz, with a kick every 4–9 s). |
| Idle | none | Breathing on scale.y ±1.2 % at 0.22–0.3 Hz, random per person. Weight shift every 3–7 s (pelvis ±0.015 m, spring 1.2/0.7). Look around every 2–5 s (yaw ±35°, pitch ±10°). Blink every 2–6 s (120 ms, 15 % chance of a double blink). Arm drift ±2°. |
| Get-up (only if full falls are ever added) | none | Limp 0.8–1.2 s, pop upright in 0.15 s with the head drooped 40°, then the head lifts on a 2 Hz / ζ 0.6 spring (`wl-t3`). |

## 3. Surfaces, lighting, post
### 3.1 What Wobbly Life does (measured from screenshots)
- **Shading and texture:** smooth Unity-standard shading with no outlines, no cel bands and no texture on characters. Most surfaces are flat colour. Texture appears only where it carries information: bricks, hedge leaves, grass blades, wood boards, fabric patterns.
- **Shape contrast:** characters are smooth, nature is faceted (flat-shaded low-poly trees, rocks and mountains), and buildings are simple hard-edged boxes.
- **Saturation hierarchy:** sky and characters sit near maximum (sky `#2AABFF` at S 0.84, skin `#FEE102` at S 0.99). Large world surfaces are mid-saturation (house red `#99413E` at S 0.59, building blue `#276189`). Interiors pair pale walls with saturated floors (`wl-t5`).
- **Outdoor sun:** hard and strong. Shadowed surfaces are 9–18 % as bright as lit ones in linear light (asphalt `#494949` → `#1B1B1B`, sand `#8D6D49` → `#3D2D1A`, dirt `#AA784A` → `#352414`). **Shadows gain saturation** (sand goes from S 0.48 to 0.57). They are never grey.
- **Sky:** almost flat saturated azure (`#2DB2FF` at the top, `#29A7FE` at the horizon). Clouds are puffy and faintly blue (`#E6F4FC`). Night is indigo (`#383F85`) with a flat moon disc and stars.
- **Interiors** (`wl-05`, `wl-t5`, `wl-t6`): soft, low-contrast light with gentle darkening in the corners and a warm light pool on the ceiling under each lamp.

### 3.2 Lighting recipe for the office
Units are physically correct. Current `engine/index.ts` values are in square brackets.
- **Sun:** `DirectionalLight('#FFF1D6', 2.6–3.0)` [2.4]. Elevation 50–58°, azimuth 35–45° off the default camera axis so shadows fall diagonally across the desks.
- **Sky fill:** `HemisphereLight('#CFE6FF', '#EED7B0', 1.2–1.5)` [1.35]. Aim for a lit floor about 2.5–3× brighter than a shadowed one in linear light, which makes shadows look about 60 % as bright on screen. That is deliberately softer than WL outdoors, matching WL's own interiors.
- **Shadows:** `PCFShadowMap` (r186 removed `PCFSoftShadowMap`). Map size 2048 (4096 on desktop), `radius` 3–4, `bias` −0.0004, `normalBias` 0.02–0.03. Fit the frustum to at most 32 × 24 m, which gives texels of about 1.5 cm.
- **AO:** N8AO with `aoRadius` 0.8–1.2, `distanceFalloff` 1 and `intensity` 2–3, tinted `#3B2A33` so darks stay warm and saturated. Also put blob shadows under characters: a radial gradient at opacity 0.3 and radius 0.4 m that shrinks and fades with jump height.
- **Bloom:** `UnrealBloomPass(size, 0.35, 0.5, 1.0)` placed before `OutputPass`. The composer's render targets are half-float, so HDR survives and only emissive values above 1 bloom: screens 1.3–1.8, signage 2, the needs-you "!" 2.5.
- **Tone mapping:** `NeutralToneMapping` at exposure 1.0–1.1. If the albedos can't reach WL's punch, add a final +8 % saturation pass rather than raising exposure.
- **Fog:** `Fog(horizon, 60, 220)`. WL softens distance only slightly.

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

Keep albedo value between 0.08 and 0.92: no pure black or pure white.
Fresnel rim (characters only, MeshStandard/MeshPhysical in r186): in `onBeforeCompile`, insert `totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);` after `#include <emissivemap_fragment>`, with `uRim` set to a warm white scaled by 0.12–0.18.

### 3.4 Procedural textures
Use `CanvasTexture` with `colorSpace = SRGBColorSpace`, mipmaps on and anisotropy 8.
- **Wood floor (honey):** a 1024² canvas covers 4 × 4 m. Staggered planks 0.2 m wide and 1.2–2.4 m long. Vary each plank by ±5 % value and ±3° hue. Seams are 2 px and 12 % darker, never black. Draw 4–6 soft, sine-warped grain streaks per plank at 3–5 % contrast, with no speckle noise. Hide repeats with a world-space tint of ±3 % at about 4 m scale.
- **Carpet:** flat colour plus 2–3 px noise at ±2 %, with a 4 cm border band 10 % darker. For the break-area rug, copy WL: 2–3 bold concentric shapes in two colours plus cream (`wl-t5`).
- **Grass (outside):** a base colour with 2 octaves of value noise at ±6 % over 1–3 m. Add clumps of blade cards (3–5 blades, 0.15–0.3 m tall, dark at the root and light at the tip) along edges only. Trees are flat-shaded icosphere clusters.
- **Walls:** flat paint with no texture. Darken the bottom 0.8 m by 6 % with vertex colours. Add a 0.12 m skirting board in a darker accent, and optionally a band at 0.9–1.1 m.

### 3.5 Time of day (if the office follows the real clock)
| | Sun | Hemi sky / ground / intensity | Sky top → horizon |
| --- | --- | --- | --- |
| Day | `#FFF1D6`, 2.8, 55° | `#CFE6FF` / `#EED7B0` / 1.35 | `#2AABFF` → `#6CC8FF` (WL is almost flat) |
| Golden hour | `#FFC58A`, 2.0, 15–20° | `#FFD9B8` / `#C9A0A0` / 0.9 | `#6FA8FF` → `#FFC89A` |
| Night | moon `#9DB4FF`, 0.35 | `#3A4590` / `#2A2440` / 0.5 | `#2B2F6B` → `#3F4A8C`. Lamps, screens and bloom light the room. |

## 4. World and props
- **Shape language:** simple and chunky so everything reads at a glance. Use a few large props and group clutter in tight clusters of 2–4.
- **Bevels (where we deviate from WL):** WL's props are hard-edged low-poly boxes. Bevel ours instead (RoundedBox radius 2–4 cm, 3–4 segments), because our camera hovers 4–18 m above the furniture and edge highlights are the cheapest polish. Keep WL's silhouettes and flat colours.
- **Scale:** furniture runs slightly large for the 1.25 m characters. WL tables sit at chest height on a Wobbly (`wl-t5`). Suggested sizes: seat 0.32 m (so feet dangle), desk 0.62 m, monitor centre 0.95 m, door 2.1 m.
- **Interiors:** pale, low-saturation walls (S ≤ 0.15, V ≈ 0.9), saturated floors and rugs, warm wood, and one or two strong upholstery colours. Aim for `wl-05` (museum) crossed with `wl-t5` (living room).
- **Outside the windows:** faceted trees, saturated lawn, flat azure sky and puffy clouds. Smooth people against faceted nature is part of the WL look.

## 5. UI (measured from `wl-01`, `wl-03`, `wl-07`, `wl-08`)
- **Panel:** `background:#DCA31E; border:4px solid #4C2502; box-shadow: inset 0 0 0 4px #B57422, 0 6px 0 rgba(43,24,2,.35); border-radius:14px`. That is an amber fill with a dark outer border and an inner bevel band.
- **Buttons:** same construction with a dark-brown label (`#3D1901`). Disabled buttons have a grey `#8A8A8A` fill. The primary action can be a green banner, like WL's "Buy".
- **Titles:** chunky rounded display type with a vertical gradient fill (by eye: orange `#FFD23A → #FF8C1A`, green `#C8F55A → #5BC81E`, or measured silver `#FFFFFF → #CAD8E3`). Add a 5–6 px `#3C3E3D` outline and a soft drop shadow. Fredoka 700 is a fair stand-in: `paint-order: stroke fill; -webkit-text-stroke: 6px #3C3E3D`.
- **Body copy:** a handwritten marker font in dark brown or grey. Close Google Fonts are Patrick Hand and Gochi Hand; keep Fredoka 500 if legibility suffers. Colour-code words: green for good, yellow for medium, red for bad.
- **Money and positive numbers:** `#10F53A` with a 4 px `#003C01` outline.
- **Dialogue and speech:** a translucent gradient from `rgba(244,247,246,.92)` to `rgba(138,176,189,.88)`, a 5 px `#4396CA` border, radius about 20 px, text in `#3A3A3A`.
- **HUD:** a thick orange ring (`#F6AC00` with a 2 px `#672B06` outline), a time pill with a sun or moon icon, and key hints as small rounded chips (`[M] Map`). Icons are 2D stickers with thick dark outlines.
- **Juice:** titles slam in (scale 1.4 → 0.95 → 1.0 over 0.35 s) and panels pop (0.85 → 1.04 → 1.0 over 0.25 s). Successes burst (WL throws cash bills) and counters tick up. Full-screen menus sit over a patterned backdrop (WL: blue checkerboard with item silhouettes at about 15 % opacity).

## 6. Comparable games
- **Human: Fall Flat** (No Brakes): "a vaguely human-shaped lump of clay named Bob", where "control over Bob is constantly and purposefully undermined by his wobbly movement, clumsy jumping, and awkward arm-flailing" [10]. **Take** the featureless clay body and arms that reach toward targets. **Skip** the undermined control and constant falls.
- **Gang Beasts** (Boneloaf): "surly gelatinous characters, brutal slapstick" [15]. **Take** the jelly mass and the jiggle on impact. **Skip** the drunken, always-on sway; that is the "too exaggerated" end of the dial.
- **Fall Guys** (Mediatonic): beans based on Kidrobot's Yetiguy vinyl toys and deliberately top-heavy [9]. It plays as animated, responsive running that goes floppy only on hits, which is the closest match to the user's brief. **Take** that split, the candy palette and the juicy UI. **Skip** tumbling as the default reaction.

## 7. Polish checklist (amateur tells to remove)
- [ ] Characters moving in sync (same phase, same springs). Randomise both per person.
- [ ] Wobble that never settles (ζ < 0.3 on torso or arms), or no wobble at all (ζ > 0.8).
- [ ] Constant-speed motion: linear lerps, instant starts and stops, rotations that pop. Everything should ease or spring.
- [ ] Feet that slide while idle, or turns on the spot with no steps.
- [ ] Objects that float or sink: no contact shadow, gaps under feet and chairs, decals z-fighting (offset them 2–5 mm and use `polygonOffset`).
- [ ] Pure black or grey shadows; pure black or white albedo.
- [ ] One roughness for everything, or "plastic wrap" specular on skin (roughness < 0.35).
- [ ] Walls as saturated as characters. Keep the saturation hierarchy from §3.1.
- [ ] Visible texture repeats, stretched UVs, or blurry or pixelated canvas textures. Aim for at least 256 px/m on floors with anisotropy on.
- [ ] Jaggies and shimmer on thin parts. Keep props at least 2 cm thick and SMAA on when DPR < 1.5.
- [ ] Dead faces with no blinks or gaze shifts.
- [ ] A camera that jitters, clips into walls, or uses an FOV over about 55°.
- [ ] UI with mixed radii, stroke widths or fonts, default browser focus rings, or panels that appear without motion.
- [ ] Light pointing straight down (flattens shapes) or straight from the camera (hides form).

## Sources
1. Wobbly Life on Steam (screenshots, trailers, "over 500 clothing items"): https://store.steampowered.com/app/1211020/Wobbly_Life/
2. Nintendo Life, Wobbly Life review: https://www.nintendolife.com/reviews/switch-eshop/wobbly-life
3. MCV/DEVELOP, Thomas Dunn on making Wobbly Life: https://mcvuk.com/business-news/thomas-dunn-on-making-wobbly-life-listening-to-the-community-and-leaving-room-for-players-to-make-their-own-fun/
4. Wobbly Life Mod SDK, Custom Clothing: https://www.rubberbandgames.com/wobblylife/modsdkdocs/clothingexamplepage.html
5. Xbox Tavern, Wobbly Life review: https://www.xboxtavern.com/wobbly-life-review/
6. Spottis, Wobbly Life controls (independent hand grabs, ragdoll button): https://spottis.com/games/wobbly-life-controls/
7. RubberBandGames official site (source of `wl-05`): https://www.rubberbandgames.com/
8. LadiesGamers, Wobbly Life review: https://ladiesgamers.com/wobbly-life-review/
9. Screen Rant, Fall Guys early bean designs (Jeff Tanton): https://screenrant.com/fall-guys-early-bean-designs-rejected-names/
10. Nintendo Life, Human: Fall Flat review: https://www.nintendolife.com/reviews/switch-eshop/human_fall_flat
11. RootMotion PuppetMaster overview: http://root-motion.com/puppetmasterdox/html/page3.html
12. David Rosen, "An Indie Approach to Procedural Animation" (GDC 2014): https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach and the "13 keyframes" quote: https://discussions.unity.com/t/an-indie-approach-to-procedural-animation-gdc-video-talk/538228
13. t3ssel8r, "Giving Personality to Procedural Animations using Math": https://www.youtube.com/watch?v=KPoeNZZ6H4s (code transcript: https://github.com/SalvatoreScalia/Giving-Personality-to-Procedural-Animations-using-Math)
14. Daniel Holden, "Spring-It-On: The Game Developer's Spring-Roll-Call": https://theorangeduck.com/page/spring-roll-call
15. Gang Beasts on Steam: https://store.steampowered.com/app/285900/Gang_Beasts/
16. Little Polygon, Procedural Animation: Locomotion: https://blog.littlepolygon.com/posts/loco1/
