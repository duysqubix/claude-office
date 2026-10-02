# Claude Office: design spec (v0)

The pitch lives in the [README](../README.md). This document is the build plan: data
sources, protocol, module ownership, art direction, and behaviour. Read it fully
before touching code.

## 1. Goals for v0

1. Open `http://127.0.0.1:4777` and see a bright, cartoony 3D office.
2. Every live Claude Code session on the machine is an employee at a desk, with body
   language that matches its real state (working / needs you / idle / sleeping).
3. Sessions that start after the page loads **walk in through the front door** and sit
   down at a free desk. Sessions that end **stand up and walk out**.
4. You control the manager in third person (WASD + mouse orbit camera).
5. Walk up to someone and press `E`: see what they're doing and what they last said.
   For sessions hired in-game: **sit at their computer** (real Claude Code terminal
   in an xterm.js overlay), send a quick message, or let them go.
6. **Hire** at reception (new session in a chosen project, optional first task).
   **Call back in** from the filing cabinet (resume a past session).

Non-goals for v0: multiplayer, sound assets, real ragdoll physics engine, controlling
sessions that were started outside the office (read-only for now).

## 2. Data sources (verified on Claude Code 2.1.286)

### 2.1 Live session registry: `~/.claude/sessions/<pid>.json`

One JSON file per running Claude Code process. Example:

```json
{"pid":66880,"sessionId":"ea6801f4-…","cwd":"/Users/duan.uys","startedAt":1790868096719,
 "version":"2.1.286","kind":"interactive","entrypoint":"cli",
 "messagingSocketPath":"/tmp/cc-socks/66880.sock","name":"duan-uys-b3","nameSource":"derived",
 "status":"idle","statusUpdatedAt":1790873390425,"updatedAt":1790873390425}
```

- `status` ∈ `busy` | `idle` | `waiting`. `waiting` means blocked on the human; the
  optional `waitingFor` string says why ("permission", "input needed", "dialog open",
  "sandbox request", …).
- Files can be stale: always confirm the pid is alive **and** is the same process.
  `procStart` is written in **UTC**, so compare it against `TZ=UTC ps -o lstart=`; fall
  back to "comm is a claude binary". Skip entries with a truthy `spare` field.
- `name` is Claude's peer name; `nameSource: "user"` means a human chose it (e.g. via
  `claude -n <name>`), so the office keeps it as the employee's name.
- Sibling `<pid>.<hash>.key` files are secrets. Never read them.

### 2.2 Transcripts: `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`

`<encoded-cwd>` = `cwd.replace(/[^a-zA-Z0-9]/g, '-')` (e.g. `/Users/duan.uys/.repos/x` →
`-Users-duan-uys--repos-x`). Fall back to scanning all project dirs for `<sessionId>.jsonl`.

One JSON object per line. Relevant `type`s:

| type | use |
| --- | --- |
| `ai-title` | `.aiTitle`: session title (repeated; take the latest) |
| `last-prompt` | `.lastPrompt`: last human prompt |
| `user` | `.message.content` string or blocks; `tool_result` blocks carry `tool_use_id` (completes a pending tool) |
| `assistant` | `.message.content[]` blocks: `text`, `thinking`, `tool_use` {id, name, input}; `.message.model`; `.gitBranch` |
| `cost-state` | `.totalCostUSD` |
| `system`, `attachment`, `mode`, `permission-mode`, `queue-operation`, `file-history-*` | ignore for v0 |

Files reach 10+ MB. Read only the last ~1 MB on first sight (skip the partial first
line), then tail incrementally by byte offset.

Activity = most recent `tool_use` with no matching `tool_result`, while the registry
says `busy`. No pending tool + busy = "Thinking…".

### 2.3 Subagents (interns): `~/.claude/projects/<enc>/<sessionId>/subagents/`

`agent-<id>.jsonl` + `agent-<id>.meta.json` (`{agentType, description, …}`). An intern
is **active** while its `.jsonl` was modified in the last 30 s. Show active interns only.

### 2.4 Past sessions (for "call back in")

All `*.jsonl` directly under `~/.claude/projects/*/`, newest first (limit 60). Title from
the last `ai-title` in the last 256 KB. The launch folder is the first `cwd` whose encoding
matches the project dir name: later entries carry wherever the session `cd`'d to, and
`claude --resume` only finds the session from its launch folder.

## 3. Hosted sessions (hired in-game)

```
tmux new-session -d -s office-<first 8 of uuid> -x 160 -y 48 -c <cwd> \
     -e PATH=<server PATH> -e CLAUDE_OFFICE=1 -- <abs path to claude> \
     --session-id <uuid> -n <displayName> [-- <first task>]
```

- Multi-argument commands are exec'd directly by tmux (no shell), so prompts are never
  shell-parsed. Verified.
- Target sessions as `=office-xxxx:` (exact match + colon). tmux 3.6 rejects `=name`
  without the colon for `set-option`. Office sessions get `status off` and
  `remain-on-exit on` (a crashed hire is reported as a notice, then reaped).
- A hire into a never-used folder opens Claude's trust dialog first, and its default
  answer is **"No, exit"**. Until Claude registers, the server reports the hire as
  `needs-you` / "Trust this folder?" (detected from the tmux screen). The manager answers
  it in the terminal overlay. Quick messages are refused (409) while `needs-you`.
- Hosted detection: tmux execs claude directly, so `#{pane_pid}` is claude's pid.
- Resume: same, with `--resume <sessionId>` instead of `--session-id`. Refuse if live.
- `hosted` = the registry pid equals a `#{pane_pid}` of a tmux session named `office-*`.
- Fire: `tmux kill-session -t office-…` (only `office-*` sessions, never anything else).
- Say: `tmux load-buffer` + `paste-buffer -p` (bracketed paste) + `send-keys Enter`.
- Terminal: node-pty runs `tmux attach-session -t office-…` (env without `TMUX`),
  bridged to the browser over `/term`. Closing the overlay kills only the attach client.
- Monitor text: every 2 s, `tmux capture-pane -p -t office-…`, keep the last 18
  non-empty lines (≤ 80 cols) in `Employee.screen`.

## 4. Protocol

See [`shared/protocol.ts`](../shared/protocol.ts). The server pushes the full roster over
`/ws` whenever it changes (poll every 1 s). Display names are assigned server-side,
stable per session id, from this list (deduplicate with a numeric suffix):

Claudette, Claudius, Clyde, Claudia, Klaus, Claudine, Clod, Claudio, Clawdia,
Claudson, Clancy, Claudel, Clover, Clementine, Claude Jr., Clint.

## 5. Module ownership

```
shared/protocol.ts           wire types (orchestrator)
server/                      Node server (orchestrator)
client/index.html            page shell (gameplay)
client/src/main.ts           bootstrap + game loop (gameplay)
client/src/net.ts            /ws + REST client, roster store (gameplay)
client/src/engine/           renderer, lights, sky, post-processing (world)
client/src/world/            office building, furniture, nav grid, World impl (world)
client/src/world/types.ts    THE CONTRACT between world and gameplay. Change only by agreement.
client/src/style/palette.ts  shared colours (both read; edits additive only)
client/src/chars/            character rig, looks, manager, employees, interns, director (gameplay)
client/src/camera.ts         follow/orbit camera (gameplay)
client/src/ui/               HUD, panels, labels, toasts, terminal overlay, sfx (gameplay)
```

Entry points: `client/src/engine/index.ts` exports `createEngine(canvas): Engine`.
`client/src/world/index.ts` exports `createWorld(engine): World`. Both per `world/types.ts`.

## 6. Art direction

Toy-box world: chunky rounded shapes, saturated sunny
colours, smooth soft shading, soft shadows, no outlines, no hard edges anywhere.
Everything should look like it's made of soft plastic or jelly. Use `PALETTE`.

### 6.1 Rendering

- `WebGLRenderer({ antialias: true })`, pixel ratio ≤ 2, `outputColorSpace = SRGB`,
  `toneMapping = NeutralToneMapping` (keeps colours true), exposure ≈ 1.0.
- Shadows: `PCFSoftShadowMap`, one directional "sun" (warm `#FFF1D6`) casting shadows,
  2048² map, frustum tightly fitted to the office, small `normalBias`. Hemisphere light
  (sky `#BFE3FF`, ground `#E8D3B0`). Optional low ambient.
- Materials: `MeshStandardMaterial`, roughness 0.6–0.9, metalness 0 (screens emissive).
  A subtle fresnel rim on characters is welcome (onBeforeCompile), not required.
- Geometry: `RoundedBoxGeometry` (three/examples) for every box-like thing, capsules,
  spheres, cylinders with generous segments. Nothing sharp.
- Sky: large sphere with a vertical gradient (`skyTop` → `skyHorizon`) and a handful of
  puffy clouds (clustered spheres) drifting slowly. Light distance fog toward horizon.
- Ambient occlusion is a plus (N8AO or a cheap fake: dark soft blob decals under
  furniture and characters). Blob shadows under characters are required either way.

### 6.2 The office (≈ 28 × 20 m, entrance on the south wall, +Z)

- Floor: honey wood (`floorWood`), carpet zones (`carpet`) under desk pods.
- **Enclosed building** (user request): loft-style interior ≈ 4.2–4.8 m high with a ceiling
  (soft panels or rounded beams, pendant lamps, skylight strips) and a real roof outside.
  Walls in `wall` colour with a `wallAccent` band; big windows on east and west walls
  showing the lawn. Roof and ceiling don't cast shadows, so sunlight still comes in.
- **Entrance** (south wall centre): wide glass sliding doors that animate open. Outside:
  path, doormat, lawn, a couple of round trees, a bench. New hires spawn ~4 m outside.
- **Reception** just inside the door (right side): curved desk, a bell, a bright
  "NOW HIRING!" sign. Interactable `reception` → Hire panel.
- **Open plan**: pods of 4 desks (2 × 2 facing each other), ≥ 16 desks to start. Each
  desk: rounded white top with coloured accent panel, chunky monitor (screen is a canvas
  texture: see 6.3), keyboard, mug, small random clutter (plant, rubber duck, stack of
  papers), wheeled office chair in a bright colour, nameplate facing the aisle.
- **Manager's corner** (north-east): bigger desk, fancy chair, "WORLD'S OKAYEST
  MANAGER" mug. **Filing cabinet** ("Personnel Files") next to it: interactable
  `archive` → Call-back-in panel.
- **Break area** (north-west): coffee machine (interactable `coffee`, steam particles),
  water cooler, couch, plant, fridge.
- **Whiteboard** on the north wall (interactable `whiteboard` → roster): canvas texture
  with live stats (`setStats`), a doodle, and the current time.
- Posters with jokes: "SHIP IT", "Have you tried /compact?", "Tokens are temporary,
  commits are forever". A wall clock with real time.
- Aisles ≥ 1.6 m wide. Every desk `approach` point must be reachable from `entrance`.

### 6.3 Desk monitors

Canvas texture per monitor (256×160 is plenty), redrawn only when content changes
(plus a cheap cursor blink):

- `off`: dark. `idle`: calm gradient + floating logo/screensaver. `working`: scrolling
  coloured "code" bars (or real `lines` in a small monospace font when provided).
  `alert`: amber background pulsing with a big "!". `sleeping`: dark with "z z z".

### 6.4 Characters (total height ≈ 1.25 m, chunky)

Built from primitives in a hierarchy so parts can be animated:

```
root (feet at y=0, yaw)
└─ pelvis (y≈0.42)
   ├─ torso: bean/capsule r≈0.24, h≈0.7, shirt colour (scale z 0.85)
   │  ├─ head (y≈+0.55 above pelvis): sphere r≈0.27, skin
   │  │  ├─ eyes: black ellipsoids (r≈0.045, 0.8×1.2×0.5) at x±0.085 + white catchlights
   │  │  ├─ mouth: small dark half-torus smile;  cheeks: pink translucent discs
   │  │  └─ hair/hat (variant): tuft, bob, cap, beanie, bun, headphones, bald
   │  ├─ armL / armR: pivot at shoulder (x±0.27): capsule r≈0.075 + hand sphere r≈0.085
   │  └─ accessory: tie (manager), lanyard badge (every Claude session; regulars never), glasses (30%)
   ├─ legL / legR: pivot at hip (x±0.11): capsule r≈0.085, pants colour
   │  └─ foot: rounded ellipsoid shoe, forward offset
   └─ blob shadow (on the floor, under root)
```

Head ≈ 45 % of height. Big eyes, tiny smile, pink cheeks. Looks are deterministic from
the session id (`hash32`/`pick` in palette.ts): skin, shirt, pants, shoes, hair colour,
hair style, glasses. The manager: white shirt, red tie, navy pants, slick dark hair,
holds a coffee mug, slightly taller (scale 1.08).

### 6.5 Wobble (the whole point)

No physics engine. Everything is springs:

- Damped springs (`x'' = k(target − x) − c·x'`, underdamped so it overshoots) on:
  torso lean (forward from acceleration/speed, sideways into turns), head lag, arm
  swing, hat/hair jiggle, squash-and-stretch.
- Walk: legs swing ±35° on a phase driven by speed, arms counter-swing (floppy), body
  bobs, slight side-to-side roll, step squash. Run: bigger, faster, more lean.
- Idle: breathing scale, blinks every 2–6 s, occasional look-around. Heads turn to look
  at the manager when within 4 m (characters notice you).
- Jump (manager): squash, launch, arms flail up, stretch in air, squash on landing.
- Bumping into an employee gives them a wobble impulse (lean spring kick + "!" bounce).

### 6.6 Employee behaviour

State machine per employee: `entering → sitting-down → seated → standing-up → leaving → gone`.

- On first roster after page load, existing employees are **already seated**.
- New session: door opens, they walk in from `entrance.outside` along `findPath`, pull
  the chair out, hop into it, chair slides in, wave hello. Toast: "Claudette clocked in
  · blendscope".
- Session ends: stand, walk to the door, wave, walk out, fade. Toast.
- Desk assignment is stable per session id (remember in localStorage).
- Seated animation by state:
  - `working` + activity kind: `typing` (fast alternating hands), `reading` (lean in,
    head close to screen), `running` (type, then lean back and watch), `browsing`
    (scroll motion), `thinking` (hand on chin, "…" thought bubble), `delegating`
    (turn toward interns, pointing), `asking`/`planning` (scribbling on paper).
  - `needs-you`: arm straight up, waving, big bouncing amber "!" over their head,
    speech bubble with `waitingFor`. Monitor `alert`. This must be unmissable.
  - `idle`: leans back, swivels a little, looks around, looks at you when near.
  - `sleeping`: head down on the desk, slow breathing, floating "Z z z".
  - `starting`: sits, looks around, monitor `idle`.
  - On `working → idle`: a small celebratory stretch (arms up).
- Interns: mini characters (scale 0.7, backwards cap) standing at `internSpots`, bobbing
  and typing on a tiny laptop. Walk in/out like employees. Max 4 shown, "+N" bubble.

### 6.7 Manager + camera

- WASD/arrows relative to camera yaw, Shift run (≈ 2.2 → 4.5 m/s), Space jump.
- Circle-vs-AABB collision against `world.colliders`.
- Camera, **third person**: smooth follow, orbit with mouse drag, wheel zoom. It never
  leaves the manager's side of a wall: raycast against `world.cameraBlockers`, pull in
  on hits, stay under `world.interior.ceilingY` indoors. `world.updateOcclusion` fades only
  tall interior props and partitions.
- Camera, **first person** (`V`, or scroll all the way in): eye height ≈ 1.2 m, pointer-lock
  mouse-look, manager's body hidden with the coffee mug in view, crosshair targeting.
- Door: keep open while anyone is within 2.5 m.

### 6.8 UI (HTML overlay, toy-box energy)

- Font: Fredoka (`@fontsource/fredoka`, weights 400/600/700).
- Panels: `PALETTE.paper` background, 4 px `PALETTE.ink` border, 20 px radius, chunky
  offset shadow (`0 6px 0 rgba(43,45,66,.25)`), coloured header strip. Pop-in with a
  springy scale animation. Buttons: pill-shaped, bright, bottom "3D" shadow that
  compresses on press.
- Labels in 3D (`CSS2DRenderer`): small name pill above each head (fades with
  distance); activity speech bubble when the manager is within ~7 m or the employee
  needs you; "!" marker and "Z z z" are 3D or CSS, whichever looks better.
- HUD: top-left company badge "Claude Office" + clock + chips (staff, working,
  needs-you, interns). Top-right: Roster (Tab), Hire (H), Mute (M), Help (?).
  Bottom-centre: interaction prompt `[E] Talk to Claudette`. Toasts top-centre.
- **Employee panel** (`E` at a desk): name, project, branch, model, uptime, cost, state
  chip, "Now:" activity, title, "Last said:" lastText, "You asked:" lastPrompt, interns,
  recent chatter (`GET /api/session/:id/chatter`). Hosted: buttons **Sit at their
  computer**, **Quick message**, **Let go** (confirm). External: note "Started in your
  own terminal (pid N). Talk to them there." plus a copyable `claude --resume <id>` hint.
- **Hire panel** (reception): project picker (from `/api/projects`, plus a free-text
  path), optional first task, Hire button. On success: toast "Interview went great!"
  and the new hire walks in once the registry sees them (a few seconds).
- **Personnel Files** (archive): past sessions (`/api/archive`), title / project / when
  / cost, **Call back in** (disabled if live).
- **Roster** (whiteboard or Tab): everyone + state; click one to walk the manager there
  (auto-path with `findPath`).
- **Terminal overlay** ("Sit at their computer"): the manager walks behind their chair,
  camera eases to an over-the-shoulder view, then a chunky monitor-bezel modal opens
  with xterm.js on `/term`. All keys go to the terminal (do not steal Esc: Claude uses
  it). Leave with the **Stand up** button or `Ctrl+]`. Fit addon + resize messages.
- Game keys are ignored while focus is in an input, textarea, or the terminal.
- Sfx (optional, WebAudio synth, no assets): door chime, "ding" on needs-you, soft
  footsteps. Muted state persists in localStorage.

## 7. Server

- `server/index.ts`: HTTP on `127.0.0.1:${PORT||4777}`. Rejects requests whose `Host`
  isn't `127.0.0.1:PORT` / `localhost:PORT` and any POST/WS whose `Origin` (if present)
  isn't the same. POST bodies must be JSON. Dev: Vite middleware (HMR on the same
  server). Prod: static `dist/client`.
- `server/registry.ts`, `server/transcript.ts`, `server/roster.ts`, `server/tmux.ts`,
  `server/terminal.ts`, `server/archive.ts`. Poll 1 s; broadcast only on change.
- Env: `PORT`, `CLAUDE_HOME` (default `~/.claude`), `CLAUDE_BIN` (default: resolved from PATH).

## 8. Verification

- `npm run typecheck` clean.
- `npm run dev`, open the page: current live sessions appear seated; this very build
  session is one of them.
- Start `claude` in another terminal: an employee walks in within ~2 s. `/exit`: they leave.
- Hire from reception into a scratch dir: walks in; Sit at their computer shows the real
  TUI; typing works; Stand up detaches; Let go makes them leave and kills only that tmux
  session.
- `npm run snap` saves a headless screenshot to `snaps/` for visual review.
