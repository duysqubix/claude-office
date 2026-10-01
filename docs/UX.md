# Claude Office: UX spec (v0)

How the office feels, reads and sounds. [SPEC.md](SPEC.md) §6.6–6.8 owns data and behaviour; this file owns layout,
copy, motion, sound and controls, and wins on those. **P0** ships in v0, **P1** is next. Sizes are CSS px and times
are ms unless marked.

## 0. Principles

1. **Needs-you beats everything.** A blocked session wastes real time, so it gets sound, motion, shape, colour, its
   own key (`Q`) and the screen edges. Amber + "!" means needs-you and nothing else.
2. **Faces are identity.** In 2D every person is a little portrait (§4.3) next to their name: shape + colour + text.
3. **Walking is fun, never a chore.** Any "go to" arrives in about 3.5 s (§1).
4. **The world stays visible.** Panels dock right and pause nothing; only the terminal takes the centre. Nothing
   ever steals keyboard focus. Every input answers within 100 ms.

## 1. Core loop and feel

Every minute: glance (HUD, "!" markers, edge faces) → go (walk or `Q`) → check (`E`) → act (sit down and answer,
message, let go) → drift (wander, coffee, watch them work). Every session: hire, call people back, let them go. Left
open on a second monitor, every state must read from the default camera with no HUD: pose + monitor + marker.

**Go to (hustle).** `Q`, the needs-you chip, an edge face, a roster row, clicking a character and a toast's [Go] all
path to the desk `approach`, auto-walk, face them and open their panel. Speed = clamp(path length / 3.5 s, 4.5, 9)
m/s; above run speed it's a cartoon hustle (run cycle ×1.4, 2 white speed streaks, a puff per step, FOV +4° over
300). A move key or `Esc` cancels; `Q` again retargets to the next person. No path: "Can't reach Claudette from here."

### 1.1 Juice (sounds in §4.5)

| Event | Feedback | Sound | P |
| --- | --- | --- | --- |
| Run footfall; jump | puff of 3 paper-white spheres (r 0.06→0.16 m, rise 0.12 m, fade 320); jump per ART-REFERENCE §2.6 (crouch squash 0.9, stretch 1.08, land 0.85) + ring of 6 puffs | `step`; `boing` `thud` | P0 |
| Bump someone | lean kick + "!" pop 400; running into them adds 1.5 s of dizzy stars; P1 a line: "Oof!", "Hey, boss!", "I'm in the zone!" | `boop` | P0 |
| Manager within 4 m | heads turn; free ones wave (90 s cooldown), working ones nod, needs-you ones wave faster | | P0 |
| Session starts | door slides, they walk in, wave, sit, chair scoots in; toast | `chime-in` `whoosh` | P0 |
| You hired them | 24 DOM confetti off the Hire button; 40 at the door on arrival (deskAccents, 1.2 s) | `bell` | P0 |
| Needs you | one arm up waving, bouncing "!" (emissive, blooms), amber bubble, monitor alert, edge face, HUD chip, tab title | `ding`; softer at 60 s and 180 s, then silent | P0 |
| Answered | "!" pops (1 → 1.3 → 0, 200), arm down, happy hop 0.08 m + squint, bubble "Thanks!" | `pop-up` | P0 |
| Turn done (busy ≥ 20 s) | both-arms stretch ≤ 1.2 s (one raised arm stays needs-you's), 3 star sparkles off the monitor, bubble "Done!" 3 s. Busy ≥ 2 min: toast "Claudette finished: Fix deck sync drift" [Go] | `tada` (≥ 2 min) | P0 |
| Clocks out | stands, walks to the door, turns and waves, leaves; toast "Klaus clocked out of crateswipe" | `chime-out` | P0 |
| Let go | cardboard-box exit (§3.4) | `wahwah` | P0 |
| Extras | amber floor ring under needs-you; coffee's 25 s ×1.3 boost as speed streaks; called-back people carry their box in; intern poofs with "+1"; startle hop on waking; walking footsteps; overview camera after 3 idle min | `slurp`, `pip` | P1 |

## 2. Information hierarchy and HUD

Always on: badge + clock, needs-you chip, counts, 4 buttons, "!" markers, edge faces, pills in range. Contextual: the
`[E]` prompt, bubbles, toasts, coach cards. On demand: panels and the terminal.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ╭─────────────────────╮     ╭───────────────────────────╮  ╭──╮╭──╮╭──╮╭──╮  │
│ │(o) Claude Office    │     │(o) Clyde clocked in for   │  │ R││ H││ M││ ?│  │
│ │    3:42 pm  7 staff │     │    blendscope             │  ╰──╯╰──╯╰──╯╰──╯  │
│ ╰─────────────────────╯     ╰───────────────────────────╯  ╭───────────────╮ │
│ ╭─────────────────────╮                                    │ panel: docked │ │
│ │ (!) 2 need you  [Q] │ amber, 44 tall                     │ right, 400    │ │
│ ╰─────────────────────╯                                    │ wide, top 88  │ │
│ (bolt 4 working) (check 2 free) (z 1 asleep) (3 interns)   │               │ │
│ <(o)! Klaus                  3D office         Clyde (o)!> │               │ │
│ ╭ coach card ─────────╮   ╭────────────────────────╮       ╰───────────────╯ │
│ ╰─────────────────────╯   │ [E] Talk to Claudette  │   72 from the bottom    │
│                           ╰────────────────────────╯                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Badge** (top-left, inset 16): paper, 3 px border, radius 16; 28 px face logo, "Claude Office" 20/700, then a sun
  (moon 19:00–06:00) sticker, the clock (`{hour: 'numeric', minute: '2-digit'}`) and "7 staff", 15/600 ink-2.
- **Needs-you chip** (12 below): amber, 44 tall, "!" disc + "1 needs you" / "3 need you" 18/700 + key cap `Q`,
  breathing 1 ↔ 1.04 every 1.6 s; click = `Q`. The last answer bumps it into a small paper chip "Nobody needs you"
  with a check (`pop-up`). While anyone waits the tab title reads "(2) Claude Office" and the favicon gets an amber dot.
- **Counts** (8 below): 30 px glyph chips "4 working", "2 free", "1 asleep", "1 starting", "3 interns"; zeros hide.
- **Buttons** (top-right): 48×48, radius 16, paper, 24 px icon, key cap hanging off the bottom edge: Roster `Tab`,
  Hire `H`, Sound `M`, Help `?`. Tooltip after 400 ("Roster (Tab)"). Muted shows the speaker-off icon.
- **Prompt** (bottom-centre): key cap + verb 18/600 in a paper pill; the cap presses when `E` goes down. Nearest
  interactable within ±100° of facing, else the nearest: "Help Claudette" (needs you), "Talk to Claudette" (free),
  "Check on Claudette" (other states), "Hire someone", "Open personnel files", "Check the roster", "Grab a coffee".
- **Toasts** (top-centre, 16 down): ≤ 440 wide, ≤ 3, newest on top, face or icon on the left; 3.5 s, 6 s with an
  action, 7 s for errors; hover pauses. "Clyde clocked in for blendscope"; 3+ in 2 s merge: "3 people clocked in".

### 2.1 Labels over people

- **Pill**: 0.22 m above the head, 26 tall, paper at 92 %, 2 px border, 14/600, 20 px state badge (state disc + ink
  glyph); none on the manager. Needs-you and hovered people always show; others within R = max(10, camera distance
  + 2) m of the manager, fading out over the last 3 m. Max 10, needs-you first. Nearer pills draw on top; a farther
  one overlapping a nearer one by more than 30 % drops to 0.3 opacity.
- **Bubble** (above the pill): WL dialogue glass (gradient rgba(244,247,246,.92) → rgba(138,176,189,.88), 3 px #4396CA
  border, radius 16, 12 px tail), ≤ 240 wide, 2 lines, ink 15/400. Working and free: within 7 m, nearest 3.
  Needs-you: always, solid amber with an ink border, line 1 at 700, collapsing to marker + pill beyond R.
  Text changes at most every 800 (crossfade 120, bump 1.04). Working → `activity.label`; free → "Done!" for 3 s,
  then `lastText` (70 chars); starting → "Getting settled…"; walking in → "Morning!" before noon, else "Hi!";
  leaving → "Bye!"; asleep → Z z z (14/18/22 px, stateSleeping, rising 40 over 2.4 s, staggered 800).
- **Off-screen faces**: needs-you people whose head projects outside the safe rect (inset 24; top 184; bottom 120;
  right = the open panel's left edge) or behind the camera get a 56 px edge disc: their face on their shirt colour, 4 px
  amber ring, 22 px "!" badge, 14 px notch toward them, name below. It sits where the ray from screen centre toward
  them (negated if behind) meets the safe rect, damped at 12/s; discs within 60 px merge (count "2"). Bobs 4 px every
  1.2 s; wiggles ±8° every 10 s after 3 min. Hover: "Go to Klaus (needs your permission)". Click → go to.
- **Needs-you lines** (bubble, panel, edge tooltip), picked by what `waitingFor` contains:

| `waitingFor` contains | Line 1 (them) | Line 2 (the fact) |
| --- | --- | --- |
| permission | "Can I do this?" | Needs your permission |
| input, question | "Quick question!" | Needs an answer |
| dialog | "I've got a menu open." | Needs you at the keyboard |
| sandbox | "Can I leave the sandbox?" | Sandbox request |
| trust | "Is this folder safe?" | Trust this folder? |
| anything else | "I need you!" | the raw `waitingFor` |

## 3. Key flows

### 3.1 First run (progress in localStorage `office.tips`)

1. Splash "Unlocking the front door…" until the world and first roster are in; the face winks, "Come on in!" (500),
   the splash pops out (280). The manager turns to the camera and waves.
2. Coach cards (bottom-left, 340 wide, one at a time, "Skip tips"): **"You're the manager."** "Walk with `W` `A` `S`
   `D` or the arrows. Hold `Shift` to run, `Space` to jump. Drag to look around, scroll to zoom." [Got it] (done
   after 3 m walked and one drag). **"These are your Claude Code sessions."** "Walk up to someone and press `E`."
   (empty office: **"Nobody's in yet."** "Hire someone at reception, or run `claude` in any terminal."). First
   needs-you: **"A raised hand means they're stuck."** "They can't go on until you answer. Press `Q` to go to them."
3. Then 3D tags (pill + bouncing ▼) over reception "Hire people here", the cabinet "Personnel files: call back past
   sessions", the whiteboard "Roster: who's doing what"; each goes after its first use. "Show tips again" resets.

### 3.2 Hiring

1. `E` at reception or `H` anywhere → panel "Now hiring!" (yellow band). No walk needed.
2. "Which project?": a focused search "Search projects or paste a path" over `/api/projects` by `lastActive` (name
   16/600, "~/path" 14 ink-2, "2h ago"); ↑↓ and Enter. Text starting with `/` or `~` adds "Use ~/that/path"; an
   unknown folder notes "New folder: they'll ask you to trust it first."
3. "First task (optional)": 3 rows, "What should they start on? Leave it empty to just say hi." Primary "Hire for
   blendscope" `⌘↵`, disabled until a project is picked (tooltip "Pick a project first").
4. "Calling them in…" → confetti, `bell` (the desk's `service_bell` hops), panel closes, toast "Interview went
   great! Your new hire is on the way." They walk in once the roster has them; after 20 s: "Your new hire is running
   late. If they don't show up, check the server terminal." Failure: panel stays, danger text "Couldn't hire: …".

### 3.3 Needs you, sit down, answer

1. Alert (§1.1). Find them with `Q`, the chip, an edge face, the roster or a click; arriving opens their panel with
   an amber chip "Needs you 0:42" (counting up) and both lines. Hosted: primary "Sit down and answer" `E` (at other
   times "Sit at their computer"). External: "They're in your own terminal (pid 66880). Answer them there." [Got it].
2. Sitting: panel out (160); the manager walks to 0.7 m behind the chair; the employee swivels ("Hey, boss!"); the
   camera eases over the shoulder (head + 0.35 right, 0.25 up, 0.5 back, looking at the screen; `setShot`, 900).
3. At blend 0.85 the bezel grows out of the desk monitor: FLIP from its projected rect, 420 `--spring-soft` (needs an
   additive `DeskSlot.screen` from world-builder; until then it grows from the centre). Backdrop rgba(43,45,66,.5)
   fades in over 300; labels and HUD fade out except the needs-you chip.
4. Bezel #2E3440, 22 px frame, radius 28, ≤ 1280×820, ≥ 32 from the edges; xterm 14 px `ui-monospace, "SF Mono",
   Menlo`, bg #1B2330, fg #E6EDF5, cursor #7FD8FF. Chin (52): face 32 + "Claudette's computer" 16/600 + project;
   state LED (12 px disc + glyph); secondary "Stand up" `Ctrl+]`.
5. Every key goes to the terminal (Esc, Tab, Ctrl+C too); only `Ctrl+]` is ours; Cmd+C/V copy and paste. Backdrop
   clicks refocus, never close. Someone else needs you: an amber tab on the bezel's top edge, face + "Klaus needs
   you" (click = stand up and go). This one answered: "!" pops, LED turns green, chin says "Back to work!" (2 s).
6. Stand up: the bezel shrinks into the monitor (260 ease-in), the camera returns (900), game keys resume 150 later.
   `/term` drops: "Connection lost. Reconnecting…" (1, 2, 4 s); session over: "Claudette's session has ended."

### 3.4 Panels, letting go, offline

- **Employee panel**: band in their shirt colour, their face (56) straddling its edge, name 26/700, state chip with
  time in state; icon chips for project, branch, model, uptime, cost; rows Now, Working on, Last said, You asked,
  Interns; collapsible "Recent chatter". Footer: primary with `E`, secondary "Quick message", "Let go" as danger
  text at the far left. External: "Started in your own terminal (pid 66880). Talk to them there." + a copy chip
  `claude --resume <id>`. **Help** (`?`): controls, the state legend (§5), "Calmer motion", "Show tips again".
- **Quick message** (hosted): inline composer "Message Claudette…" (grows to 4 rows; Enter sends, Shift+Enter new
  line, `Esc` closes). Working: "They'll read it after this step." Needs-you: disabled, "Answer them first: sit down
  at their computer." Sent: toast "Sent to Claudette", bubble "On it!".
- **Roster** (`Tab`, button, whiteboard): mint panel "Who's in", grouped Needs you, Working, Starting, Free, Asleep.
  Row 56: face 36, name 16/600, project, then activity or `lastText` 14 ink-2; right: "12m" in state, "+2" interns.
  Click or Enter → go to. Footer "Hire someone" `H`. Empty: "Nobody's in yet." (same line as the first-run card).
- **Personnel files** (`E` at the cabinet; its `Drawer1` slides out): manila panel with a folder tab, search "Search
  past sessions". Row: title (else last prompt, else "Untitled session"), chips for project, "3 days ago", "$1.24",
  small primary "Call back in"; live rows show "In the office" + "Go to them". Toast "Called back in. They're on their
  way."; on arrival "Welcome back, Claudette!". Empty: "No past sessions yet. Finished sessions end up here."
- **Let go** (hosted) turns the action row into an in-place confirm: **"Let Claudette go?"** "This ends their Claude
  session. You can call them back later from Personnel files." (+ "They're in the middle of something." while
  working). Secondary "Keep them" (focused), danger "Let go". Then `held_box` pops into their arms (stapler and plant
  poking out); they say "Bye, boss!", "I'll see myself out.", "Saving my notes. Bye!" or "It's been real.", walk to
  the door, turn, wave, leave. Toast "Claudette packed up and left. Their session has ended." The nameplate goes
  vacant and the chair rolls in.
- **Offline**: `/ws` drops → after 1.5 s a top-centre amber banner "Lost the office server. Reconnecting…"; canvas
  `saturate(.55)` over 600; pills grey; server actions disable (tooltip "Offline"); walking still works. Backoff 1,
  2, 4, 8, 10 s. After 30 s: "The office server isn't running. Start it with `npm run dev` in ~/claude-office."
  [Retry now]. Back: green "Back online" (1.2 s). Nothing pops (GAMEPLAY.md): the missed changes walk in and out as
  usual, but their toasts merge into one: "While you were away: Clyde clocked in, Klaus left." **Errors**: toast
  (7 s) "Couldn't <action>: <server error>", the action repeating the button ("hire", "call them back", "send that",
  "let Claudette go"); a server `notice` shows as-is. No stack traces on screen.

## 4. UI design system

### 4.1 Colour (CSS variables on `:root`, from PALETTE)

- `--ink` #2B2D42 (text, borders, glyphs), `--ink-2` #5C5F77 (secondary text, paper only: 6.2:1), `--paper` #FFFDF7,
  `--paper-2` #F3EBDA (inputs, rows, key caps), `--shade` rgba(43,45,66,.25). `--primary` #5CC8FF (the sky accent from
  deskAccents; shadow #2E9FDB): primary buttons, focus ring, selection. `--danger` #C92A3A (shadow #8E1C28).
- Panel bands: employee = their shirt colour; hire #FFC94A; files #F6B76E; roster #8FE0C8; help #7DB8F0.
- Text on any fill is ink (fills 4.3–9.8:1, states ≥ 4.9:1), except danger (paper on red, 5.3:1) and outlined
  titles. Buttons are primary, secondary (paper) or danger: no per-action colours, no white text with shadows.
- **Deliberate deviation from ART-REFERENCE §5:** panels stay paper, not WL amber, because amber means needs-you here.
  WL's construction carries the look: inner bevel, outlined titles, sticker icons, quick pops, blue-glass speech.

### 4.2 Type, space, shape

- **Type**: Fredoka, sentence case, no all-caps. Panel title 26/30 700; HUD title and section 20/24 700; prompt and
  needs-you chip 18/22 600–700; body 16/22 400; buttons and names 16/20 600; meta and pills 14/18 400–600; key caps,
  counts and badges 13/16 700. Ticking numbers use `tabular-nums`. Monospace is for the terminal only.
- **Space** 4, 8, 12, 16, 20, 24, 32, 48 (HUD inset 16, panel padding 20, list gap 8). **Radius**: panel 20, bezel 28,
  toast/bubble/HUD box 16, input/row 12, key cap 7, pill shapes 999. **Border** (ink): 4 for panels and the bezel; 3
  for buttons, chips, toasts, bubbles, HUD; 2 for inputs, pills, key caps, rows.
- **Shadow**, solid, never blurred: panel `inset 0 0 0 3px var(--paper-2), 0 6px 0 var(--shade)` (WL's bevel band),
  HUD and toast `0 4px 0`, button `0 4px 0 <its shadow>`; hover lifts 2, press drops 3. **Focus**: `0 0 0 3px
  var(--paper), 0 0 0 6px var(--primary)` on every control, never removed.

### 4.3 Components and icons

- **Panel**: right dock, width min(400, 100vw − 32), top 88, max-height calc(100vh − 112), body scrolls, actions in a
  sticky footer; 64 px header band in the theme colour; WL title: 26/700 paper fill, 5 px ink outline
  (`-webkit-text-stroke` + `paint-order: stroke fill`), `0 3px 0` shade drop; 40 px close ×. One at a time; under 900
  wide it becomes a bottom sheet (max 70vh). The only modal is the terminal; confirms happen inside panels.
- **Face**: `faceSvg(looks, size)` from `employeeLooks()` mirrors the 3D head (ART-REFERENCE §1: head shape, skin,
  eyes, hair or hat silhouette, glasses) on a disc of their shirt colour; 24/32/40/56. Favicon and logo too.
- **Button**: pill, 44 tall (36 small), padding 0 20, 16/600, optional key cap on the right; primary, secondary,
  danger or text. Disabled: 45 % opacity, no shadow, a tooltip that says why. **Chip** 30 tall, glyph 18 + 15/600.
  **Key cap** min 24×24, paper-2, 2 px border + 4 px bottom border, 13/700, labelled as on the keyboard.
- **Toast**: paper, 3 px border, radius 16, 6 px left stripe (state, primary or danger), face or icon 32, text 16 with
  the name at 600, optional small action button. **Tooltip**: ink fill, paper 14/600, radius 10, after 400 hover.
  **Banner**: top-centre pill, 44 tall, amber (offline) or working green (back), ink 16/600.
- **Icons**: inline SVG in `ui/icons.ts`, no icon fonts or emoji; 24 viewBox, filled shapes, 2 px ink stroke, round
  joins (WL stickers). State glyphs: bolt, "!", check, "z", three dots (§5); plus clipboard, bell, folder, speaker…

### 4.4 Motion (springs sampled from `chars/spring.ts`, so panels wobble like bodies)

```css
--spring-pop:  linear(0, .201, .605, .978, 1.198, 1.252, 1.191, 1.088, .997, .946, .937, .954, .981, 1.003, 1); /* 5.2 Hz, ζ .4, 300 ms */
--spring-soft: linear(0, .165, .497, .819, 1.042, 1.146, 1.158, 1.118, 1.062, 1.015, .985, .974, .976, .984, 1); /* 3.4 Hz, ζ .5, 420 ms */
--spring-bump: linear(0, .342, .917, 1.263, 1.282, 1.121, .965, .905, .932, .987, 1.023, 1.028, 1); /* 6 Hz, ζ .35, 300 ms */
--ease-in: cubic-bezier(.5, 0, .75, 0);  --ease-out: cubic-bezier(.2, .8, .2, 1);
```

- **Panel** in: scale .85 → rest (peaks 1.04, WL's pop), y +12, rotate 1.5°, 300 pop (opacity over the first 100);
  out: scale .92 + fade, 160 ease-in. **Toast** in: y −28, scale .9 → rest, 420 soft; out: y −12 + fade, 200 ease-in.
  **Prompt, bubble, edge face** in: scale .7 → 1, 300 pop. **Count change**: 1.3 → 1, 300 bump. **Button**: press y +3
  (60 linear), release 300 bump, hover y −2 (120 ease-out). **Bezel**: FLIP from the monitor, 420 soft; close 260
  ease-in. **Slam** (WL title slam: "Interview went great!", "Nobody needs you"): scale 1.4 → .95 → 1, 350.
- Origin = whatever opened it. **Reduced motion** (OS setting or "Calmer motion"): springs become 150 fades; no bob,
  breathing, wiggle, confetti, streaks or FOV kick; camera shots ease in 400; character wobble stays, bump kicks 50 %.

### 4.5 Sound

WebAudio synth via `sfx.ts`'s `tone()`; master 0.55 → compressor; no retrigger within 120 (steps exempt); max 6
voices. Until the first gesture starts the context, the Sound button shows a dot ("Click anywhere to turn on sound").
`M` mutes (localStorage `office.muted`, master to 0 in 50). P1: pan by screen x (±0.6), fade with distance (≥ 35 %).

| Name | Recipe (wave, Hz, ms) | Gain |
| --- | --- | --- |
| `pop` / `unpop` / `tick` | sine 520→880, 70 / sine 760→420, 80 / triangle 1800, 25 | .16 / .10 / .05 |
| `ding` | triangle 988 then 1319 (+90), 350 each, plus a sine an octave below at ×.3 | .22 (repeats .12) |
| `pop-up` / `tada` | triangle 659 then 988 (+70), 160 / triangle 1047, 1319, 1568, 60 apart, 250 each | .12 / .10 |
| `chime-in` / `chime-out` | sine 659 → 523 (+160), 500 / sine 523 → 392 | .16 / .12 |
| `whoosh` / `bell` | noise → bandpass 800→2400, Q .8, 350 / triangle 1319 + sine 2637 (×.3), 900 | .07 / .20 |
| `step` / `boing` / `thud` | noise 30, lowpass 600, ±6 % pitch / sine 260→520, 130 / sine 140→70, 90 | .035–.05 / .10 / .14 |
| `boop` / `error` / `pip` | square 440→330, 80 / square 220→180, 120 (both lowpass 1200) / sine 1568, 40 | .07 / .08 / .05 |
| `wahwah` / `slurp` | triangle 392, 330, 262 (160 each), the last bending −60 cents over 400 with a 6 Hz wobble / noise bandpass 900→400, 250 | .14 / .06 |

## 5. Controls and accessibility

| Input | Action |
| --- | --- |
| WASD / arrows, Shift, Space | walk (camera-relative; closes the panel, cancels a go to), run, jump |
| drag (left or right), wheel | orbit (pitch 20–70°), zoom 4–18 m |
| click a character | go to them (a click moved < 5 px in < 300 ms; otherwise it was a drag) |
| `E` | interact; with a panel open, press its button marked `E`, or close it if there is none (not in its first 250) |
| `Q` (also `N`, as in GAMEPLAY.md) | go to the next person who needs you, longest-waiting first; `Q` sits next to WASD |
| `1`–`9` (P1) | go to the person in that roster row |
| `Tab` / `H` / `M` / `?` | roster / hire / sound / help |
| `Esc` | close the composer, then the confirm, then the panel; cancel a go to. Never at a terminal |
| `Ctrl+]` | stand up from the computer |

- **Focus scope**: inside a panel, Tab, Space, Enter and arrows act like a web page (Tab moves focus, arrows walk
  lists) while WASD still closes it and walks; inputs, textareas and the terminal get every key; Cmd/Ctrl/Alt chords
  never reach the game. Gamepad later (sticks, A jump, X interact, Y roster, RB next needs-you) is just a mapping.
- **Readability**: text ≥ 13, body 16, targets ≥ 40, all text ≥ 4.5:1 (§4.1); 3D labels fade, never shrink. P1: UI size.
- **Screen readers**: panels are `role="dialog"` (non-modal) labelled by their title; focus moves in on open and back
  to the canvas on close. Toasts are `aria-live="polite"`; needs-you is announced once, assertively: "Clyde needs
  your permission." P1: Help → "Notify me when someone needs me" (desktop notification while the tab is hidden).
- **State is never colour alone.** Tell the user "free", never "idle": idle reads as stuck.

| State (user word) | Colour | Glyph | Body | Monitor |
| --- | --- | --- | --- | --- |
| working ("working") | stateWorking | bolt | typing, reading, running… | code bars |
| needs-you ("needs you") | stateNeedsYou | ! | arm up waving, bouncing "!" | amber "!" |
| idle ("free") | stateIdle | check | leans back, swivels | screensaver |
| sleeping ("asleep") | stateSleeping | z | head on the desk, Z z z | dark, z z z |
| starting ("starting") | stateStarting | three dots | looks around | screensaver |

## 6. Extension hooks (v0 must not block these)

- **Event bus** (`ui/events.ts`, P0): typed `clock-in`, `clock-out`, `hired`, `rehired`, `fired`, `needs-you`,
  `answered`, `turn-done`, `go-to`, `jump`, `bump`, `coffee`, `panel`. Sfx, fx, toasts, tab title and coach cards
  subscribe; achievements ("First hire", "10 hands answered", "Inbox zero for an hour") are counters on it later.
- **Answer in place** (GAMEPLAY.md v0.5): the needs-you panel keeps a slot above its footer for Allow / Always allow /
  Deny or question options; "Sit down and answer" stays the fallback. Beans counters use WL money green (#10F53A).
- **Emotes**: wave, stretch, shrug, hop, cheer as named `Body.play(emote)` clips, so a manager emote wheel (hold `G`)
  is content, not code. **Save**: all persistence under localStorage `office.*` + `office.version`. **World**: decor
  slots (posters, plants, rugs) for upgrades; a generic wandering NPC (nav + `Body`) becomes the office dog.
