# Model wiring notes

How to put catalog models into the game: pivots, animated nodes, swappable materials.
Every model's sidecar (`assets/catalog/<id>.json`, merged into `/models/catalog.json`)
has its anchors and tintable materials; this page collects what sidecars don't say.
Load models with `client/src/models` (`model`, `swapIn`, `findMaterial`, `findNode`).

## Conventions (all artists)

- One joined mesh per model plus separate child nodes for moving parts.
- Front faces three.js +Z. Origin at the floor-contact point (wall items: the wall back).
- AO is baked into the base-colour texture; the palette colour is the material colour, so
  tinting a `tintable` material = setting its colour.
- `Screen`, `Board`, `Label` have planar 0..1 UVs and no AO: put a CanvasTexture on them.
- Glass: alpha-blended material named `Glass` (alpha ≈ 0.35–0.4).

## Furniture & appliances (Claude Monet)

- desk: `Accent` panel (recolour per desk). monitor: `Screen`. computer_mouse pad: `Accent`.
- office_chair, manager_chair, couch, armchair, stool, beanbag, meeting_chair,
  conference_chair, nap_pod, massage_chair, intern_stool: `Seat`.
- filing_cabinet: `Drawer1..3`, pivot at each drawer's front centre, slide along +Z.
- fridge: `Door`, pivot on the left hinge, rotate about +Y. focus_pod: `Door`.
- wall_clock: `HourHand`, `MinuteHand` at rest on 12, rotate about −Z for clockwise; origin at the wall back.
- whiteboard / flipchart: `Board` (origin at the wall back, board centred on it).
- wall_screen: 3.2 × 1.8 `Screen`, origin at the wall back, picture centred on it (Team Room stats).
- tv_stand, arcade_cabinet, intern_station: `Screen`.
- server_rack `Accent` = emissive blink light. floor_lamp `Shade`, desk_lamp `Bulb` emissive.
  jukebox `Accent` emissive tubes. coffee_machine `Light` = green indicator.
- dj_booth: `PlatterL` / `PlatterR` spin about +Y; DJ anchor on +Y side.
- aquarium: `Fish1..3`. hat_propeller (character kit): `Propeller` spins about +Y.
- intern_bench: 1.6 m module chainable along X (square ends); anchors `station0/1`, `stool0/1`.
  intern_station origin at the desk surface. intern_stool seat at 0.41.
- conference_table: 8 seat anchors. glass_partition: 2 m module, `Glass`.
- Tint `Accent` on: locker, standing_desk, bins, ping_pong_table, foosball_table, printer_copier,
  kitchen_counter doors, reception_desk, desk_divider, intern_bench.

## Environment (Claude Lorrain)

- sliding_door: fits the 3.0 × 2.25 opening in a 0.3 m wall. Origin at the floor centre of the
  opening, centred in the wall, +Z outside. `DoorL` / `DoorR` pivot at each panel's bottom
  centre (x ∓0.765); open by moving ∓X 1.47. `Glass` swappable.
- office_window: origin at the bottom centre of the 2.2 × 1.17 opening (sill line); place at
  wallPoint(side, mid, 0.95); scale X for other bay widths.
- mailbox `Flag` raises with rotate X −90°. flag_pole `Flag` flutters about Y (pivot on the pole at y 4.4).
- plant_hanging is wall-mounted: origin at the bracket plate, hangs toward +Z; mount ≈2 m up.
- Tint `Accent`: plant_monstera, plant_snake, plant_hanging, mailbox, bicycle, toy_car, coffee_truck.
- Emissive: street_lamp `LampGlow` (PointLight anchor y 2.92), car/truck headlights, door sensor,
  hot_air_balloon `Flame`.
- fence_picket and hedge tile every 2.0 m along X; the fence post is at the −X end.
- Nature (trees, bushes, hedge, rocks, grass) is faceted on purpose; clouds are smooth (cloud_a/b/c).

## Characters (Claude Rodin, hats and accessories by Claude Monet)

- Fit `client/src/chars/rig-dimensions.json` (head radius 0.27).
- Head-worn items (hair, hats, glasses, headphones, eyes, brows, mouths) pivot at the HEAD CENTRE:
  parent to the head with zero offset. `anchors.headTop` where given.
- Held items (`held_*`) pivot at the hand-grip point. Torso-worn items pivot at the torso origin.
- Tintable: `Skin`, `Shirt`, `Pants`, `Shoes`, `Hair`, `Accent`.

## Open follow-ups

- ~15 GLBs exceed 250 KB (geometry-bound heroes: company_sign 526 KB, coffee_truck 483 KB,
  dj_booth 383 KB). Option: meshopt compression in the exporter or with gltfpack, plus
  `loader.setMeshoptDecoder(MeshoptDecoder)` in client/src/models and the catalog viewer.
