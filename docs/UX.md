# Claude Office: UX spec (v0)

How the office feels, reads and sounds. [SPEC.md](SPEC.md) §2–4 own data and §6.6–6.7 behaviour; this file replaces §6.8
and owns layout, copy, motion, sound, controls and feedback. **P0** ships in v0, **P1** next. Sizes px, times ms.

## 0. Principles

1. **Needs-you beats everything.** A blocked session wastes real time, so it gets sound, motion, shape, colour, its own
   key (`Q`) and the screen edges. Amber + "!" means needs-you and nothing else.
2. **Faces are identity.** In 2D every person is a little portrait (§4.3) next to their name: shape + colour + text.
3. **Walking is fun, never a chore.** Any "go to" arrives in about 3.5 s, and its panel opens as you set off (§1).
4. **The world stays visible.** Panels dock right and pause nothing; only the terminal takes the centre. Nothing ever
   steals keyboard focus, and approving anything always takes a deliberate second step (§3.3).

## 1. Core loop and feel

Every minute: glance (HUD, "!" markers, edge faces) → go (walk or `Q`) → check (`E`) → act (answer, sit down, message,
let go) → drift (wander, coffee, watch them work). Every session: hire, call people back, let them go. Left open on a
second monitor, every state must read from the default camera with no HUD: pose + monitor + marker.

**Go to (hustle).** `Q`, the needs-you chip, an edge face, a roster row, a click on a person or pill, or a toast's [Go]
opens their panel at once and auto-walks to their desk, so you can answer while you run: clamp(path / 3.5 s, 4.5, 9)
m/s, a cartoon hustle above run speed (run cycle ×1.4, 2 speed streaks, a puff per step, FOV +4°) that nudges people
aside. A move key or `Esc` cancels; `Q` retargets; no path: "Can't reach Claudette from here."

### 1.1 Juice (sounds in §4.5)

| Event | Feedback | Sound | P |
| --- | --- | --- | --- |
| Run footfall; jump | puff of 3 paper-white spheres (r 0.06→0.16 m, rise 0.12 m, fade 320); jump per ART-REFERENCE §2.6 (crouch squash 0.9, stretch 1.08, land 0.85) + ring of 6 puffs | `step`; `boing` `thud` | P0 |
| Bump someone | lean kick + ink "!" pop 400 (never amber); running into them adds 1.5 s of dizzy stars; P1 a line: "Oof!", "Hey, boss!", "I'm in the zone!" | `boop` | P0 |
| Manager within 4 m | heads turn; free ones wave (90 s cooldown), working ones nod, needs-you ones wave faster | | P0 |
| Session starts | door slides, they walk in, wave, sit, chair scoots in; toast "Clyde clocked in for blendscope" | `chime-in` `whoosh` | P0 |
| You hired them | 24 DOM confetti off the Hire button; 40 at the door on arrival (deskAccents, 1.2 s) | `bell` | P0 |
| Needs you | one arm up waving, "!" marker (§2.1), amber bubble, monitor alert, edge face, HUD chip, tab title | `ding`; softer at 60 s and 180 s, then silent | P0 |
| Answered (anywhere) | "!" pops (1 → 1.3 → 0, 200), arm down, happy hop 0.08 m + squint, bubble "Thanks!" (denied: a shrug, "Okay, I won't.") | `pop-up` | P0 |
| Turn done (busy ≥ 20 s since the turn began) | both-arms stretch ≤ 1.2 s (one raised arm stays needs-you's), 3 star sparkles off the monitor, bubble "Done!" 3 s. Busy ≥ 2 min: toast "Claudette finished: make the bpm detection…" (`lastPrompt`, 40 chars; else "Claudette finished a task") [Go] | `tada` (≥ 2 min) | P0 |
| Clocks out; let go | stands, walks to the door, turns and waves, leaves; toast "Klaus clocked out of crateswipe". Let go: the cardboard-box exit (§3.5) | `chime-out`; `wahwah` | P0 |
| Extras | amber floor ring under needs-you; coffee's 25 s ×1.3 boost as speed streaks; called-back people carry their box in; startle hop on waking; walking footsteps; reception bell hops and files drawer slides (need an additive `World.prop(id)`) | `slurp`, `pip` | P1 |

## 2. Information hierarchy and HUD

Always on: badge + clock, needs-you chip, counts, plan meter, 4 buttons, "!" markers, edge faces, pills in range.
Contextual: the `[E]` prompt, bubbles, toasts, coach cards. On demand: panels, the board, the terminal.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ╭─────────────────────╮     ╭───────────────────────────╮  ╭──╮╭──╮╭──╮╭──╮  │
│ │(o) Claude Office    │     │(o) Clyde clocked in for   │  │ R││ H││ M││ ?│  │
│ │    3:42 pm  7 staff │     │    blendscope             │  ╰──╯╰──╯╰──╯╰──╯  │
│ ╰─────────────────────╯     ╰───────────────────────────╯  ╭───────────────╮ │
│ ╭─────────────────────╮                                    │ panel: docked │ │
│ │ (!) 2 need you  [Q] │ amber, 44 tall                     │ right, 400    │ │
│ ╰─────────────────────╯                                    │ wide, top 88  │ │
│ (bolt 4 working) (check 2 free) (z 1 asleep) (5-hour 42%)  │               │ │
│ <(o)! Klaus                  3D office         Clyde (o)!> │               │ │
│ (coach card, first run)  ( [E] Talk to Claudette ) ↑72     ╰───────────────╯ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Badge** (top-left, inset 16): paper, 3 px border, radius 16; 32 px face logo, "Claude Office" 20/700, then a sun
  (moon 19:00–06:00) sticker, the clock (`{hour: 'numeric', minute: '2-digit'}`) and "7 staff", 15/600 ink-2.
- **Needs-you chip** (12 below): amber, 44 tall, "!" disc + "1 needs you" / "3 need you" 18/700 + key cap `Q` (hidden
  seated), breathing 1 ↔ 1.04 every 1.6 s; click = `Q`; an open ask rings the "!" with its countdown. The last answer
  slams it into a paper chip "Nobody needs you" with a check (`pop-up`). Meanwhile: tab "(2) Claude Office", amber
  favicon dot.
- **Counts** (8 below): 30 px glyph chips "4 working", "2 free", "1 asleep", "1 starting", "3 interns" (zeros hide),
  then the **plan meter**: an 18 px ring per `plan.limits` ("5-hour 42%", "Weekly 18%"), ink, danger red at ≥ 80 %;
  tooltip "5-hour limit: 42% used, resets in 1h 12m"; click = go to the board; hidden while `plan.updatedAt` is null.
- **Buttons** (top-right): 48×48, radius 16, paper, 24 px icon, key cap hanging off the bottom edge: Roster `R`, Hire
  `H`, Sound `M`, Help `?`. Tooltip after 400 ("Roster (R)"). Muted shows the speaker-off icon.
- **Prompt** (bottom-centre): key cap + verb 18/600 in a paper pill; the cap presses on `E`. Nearest interactable within
  ±100° of facing: "Help Claudette" (needs you), "Talk to Claudette" (free), "Check on Claudette" (others), "Hire
  someone", "Open personnel files", "Check the roster", "Check the numbers", "Check on the interns", "Grab a coffee".
- **Toasts** (top-centre, 16 down, below the banner): ≤ 440 wide, ≤ 3, newest on top, face or icon left; 3.5 s, 6 s with
  an action, 7 s for errors; hover pauses. 3+ clock-ins in 2 s merge ("3 people clocked in"); hires, call-backs and
  let-gos use their own toast, never the generic one. Seated, only errors show; the rest wait.

### 2.1 Labels over people

- **Pill**: 0.22 m above the head, 26 tall, paper at 92 %, 2 px border, 14/600, 20 px state badge (state disc + ink
  glyph); none on the manager; click = go to. Shown for needs-you and hovered people, others within R = max(10, camera
  distance + 2) m of the manager, fading over the last 3 m; max 10, needs-you first. Nearer pills draw on top; a farther
  one overlapping by > 30 % drops to 0.3 (projected anchors × cached widths, no per-frame layout reads).
- **Bubble** (above the pill): WL dialogue glass (gradient rgba(244,247,246,.92) → rgba(138,176,189,.88), 3 px #4396CA
  border, radius 16, 12 px tail), ≤ 240 wide, 2 lines then ellipsis, ink 15/400; within 7 m, nearest 3 not needing you.
  Working → `activity.label` or "Thinking…"; free → "Done!" 3 s after a turn, then `lastText` if any; starting →
  "Getting settled…"; arriving → "Morning!" (before noon) or "Hi!"; leaving → "Bye!"; asleep → Z z z (14/18/22 px,
  stateSleeping, 2 px ink stroke, rising 40 over 2.4 s, staggered 800). Changes ≤ every 800 (crossfade 120, bump 1.04).
  Needs-you: always, solid amber, ink border, line 1 at 700; beyond R just marker + pill.
- **"!" marker** (needs-you, above the bubble): 52 px amber disc, 4 px ink border, ink "!" 34/700; bobs 6 px every 900
  with a squash at the bottom; pops out when answered.
- **Off-screen faces**: needs-you people whose head projects outside the safe rect (inset 24, top 184, bottom 120, right
  = an open panel's edge) or behind the camera get a 56 px edge disc: face on shirt colour, 4 px amber ring, 22 px "!"
  badge, 14 px notch toward them, name below; placed where the ray from screen centre to them (negated if behind) meets
  the rect, damped 12/s; discs within 60 px merge ("2"). Bob 4 px / 1.2 s; after 3 min, wiggle ±8° every 10 s. Hover:
  "Go to Klaus (needs your permission)". Click → go to.
- **Needs-you lines** (bubble, panel, edge tooltip, screen reader; line 1 is them, line 2 the fact). With an ask:
  `ask.title` ("Run a command?") / the first line of `detail` in 13 px monospace. Otherwise by `waitingFor`
  (case-insensitive): permission → "Can I do this?" / Needs your permission; input or question → "Quick question!" /
  Needs an answer; dialog → "I've got a menu open." / Needs you at the keyboard; sandbox → "Can I leave the sandbox?" /
  Sandbox request; trust → "Is this folder safe?" / Trust this folder?; else "I need you!" / the raw text.

## 3. Key flows

### 3.1 First run (progress in localStorage `claude-office:tips`)

1. Splash "Unlocking the front door…" until the world and first roster are in, then "Come on in!" (500) and it pops out
   (280); the manager turns to the camera and waves.
2. Coach cards (bottom-left, 340 wide, one at a time, "Skip tips"): **"You're the manager."** "Walk with `W` `A` `S` `D`
   or the arrows. Hold `Shift` to run, `Space` to jump. Drag to look around, scroll to zoom." [Got it] (done after 3 m
   walked and one drag). **"These are your Claude Code sessions."** "Walk up to someone and press `E`." (empty office:
   **"Nobody's in yet."** "Hire someone at reception, or run `claude` in any terminal."). First needs-you: **"A raised
   hand means they're stuck."** "They can't go on until you answer. Press `Q` to go to them." First ask: **"You can
   answer right here."** "Pick a button, or it goes back to their terminal in 1:30."
3. Then 3D tags (pill + bouncing ▼) over reception "Hire people here", the cabinet "Personnel files: call back past
   sessions", the whiteboard "Roster: who's doing what"; each goes after its first use. Help → "Show tips again".

### 3.2 Hiring

1. `E` at reception or `H` anywhere → panel "Now hiring!" (yellow band), no walk needed. "Which project?": a focused
   search "Search projects or paste a path" over `/api/projects` by `lastActive` (name 16/600, "~/path" 14 ink-2, "2h
   ago"); ↑↓, Enter. Text starting with `/` or `~` adds "Use ~/that/path"; an unlisted folder notes "First time here:
   they'll ask you to trust this folder."
2. "First task (optional)": "What should they start on? Leave it empty to just say hi." "Name (optional)": "We'll pick
   one" (≤ 32; becomes their office name). Enter hires (Shift+Enter: new line). Primary "Hire for blendscope", disabled
   until a project is picked ("Pick a project first").
3. "Interviewing…" → confetti, `bell`, panel closes, slam-in toast "Interview went great! Your new hire is on the way."
   After 20 s without them: "Your new hire is running late. If they don't show up, check the server terminal." Failure:
   the panel stays, with danger text "Couldn't hire: …".

### 3.3 Needs you: answer in place, or sit down

Their panel shows the **ask card** if they have an ask; otherwise an amber chip "Needs you 0:42" (counting up), both
lines, and hosted → primary "Sit down and answer" `E` (§3.4), external → "They're in your own terminal (crateswipe, pid
66880). Answer them there." [Got it]. Asks (any session, via hooks) reach the office only while you're here: tab
visible, game input in the last 2 min (`presence` goes out on visibility changes and at most every 10 s of input).
- **Card** (under the band): amber strip with `ask.title` 20/700 and a tool chip ("Bash", "chrome › navigate"); `detail`
  in a dark well (#1B2330, paper monospace 13/18, ≤ 8 lines, then scrolls); plans render as markdown on paper-2 (max
  50vh) in a 560-wide panel. A 4 px bar drains to `expiresAt` beside "Back to their terminal in 1:12" (13 ink-2),
  pulsing for the last 10 s; screen readers hear it at 30 s and 10 s.
- **Buttons** follow `style` (primary, secondary, danger; ghost → text) with `hint` under the label (13 ink-2), so
  "Always allow…" always says where it applies. Key caps `1`, `2`, `3`… in option order (Claude Code's own: Allow,
  Always allow…, Deny) work only while the card has focus: `E` on the person focuses it, a go-to never does, and `E`
  never answers. "Add a note" opens a one-line `message`: "Tell them why (optional)" (Deny), "What should change?" (Keep
  planning). **Questions**: per question a `header` chip, the question 16/600, radio rows (checkboxes if `multiSelect`)
  with descriptions 14 ink-2; "Send answers" waits for a pick on each ("Pick an answer for each").
- **After**: the pressed button spins, then the card folds to one line: "Allowed", "Always allowed", "Denied", "Plan
  approved", "Sent back to planning", "Answers sent" (+ Answered juice). "Answer in their terminal" folds to "Moved to
  their terminal." and, if hosted, sits you down. Expired or answered elsewhere: "Moved to their terminal." or "Answered
  in their terminal." Failure: toast "Couldn't answer: <error>"; the card stays.

### 3.4 Sit at their computer (hosted)

1. Panel out (160); the manager walks to 0.7 m behind the chair; the employee swivels ("Hey, boss!"); the camera eases
   over the shoulder (head + 0.35 right, 0.25 up, 0.5 back, at the screen; `setShot`, 900). Until the bezel settles,
   keys are swallowed and `Esc` cancels the sit; then xterm takes focus.
2. At blend 0.85 the bezel grows from the monitor's projected rect (FLIP, 420 `--spring-soft`; needs additive
   `DeskSlot.screen`, else from the centre). Backdrop rgba(43,45,66,.5) over 300; labels and HUD fade, not the chip.
3. Bezel #2E3440, 22 px frame, radius 28, ≤ 1280×820, ≥ 32 from the edges; xterm 14 px `ui-monospace, "SF Mono", Menlo`,
   bg #1B2330, fg #E6EDF5, cursor #7FD8FF. Chin (52, paper text): face 32, "Claudette's computer" 16/600, project; state
   LED; hint "Esc goes to Claude" at 70 %; secondary "Stand up" `Ctrl+]`.
4. Every key goes to Claude (Esc, Tab, Ctrl+C, Ctrl+B: office tmux runs `prefix None`) except `Ctrl+]`; Cmd+C/V copy and
   paste; the wheel is swallowed (in tmux's alt screen it sends ↑/↓ into Claude's prompts). Backdrop clicks refocus.
   Someone else needs you: amber tab on the bezel top, face + "Klaus needs you" (click = stand up and go).
5. Stand up: bezel back into the monitor (260 ease-in), camera returns (900), game keys 150 after. `/term` closes
   1000/1008 or they leave the roster: "Claudette's session has ended.", stand up after 2 s. Other drops:
   "Reconnecting…" (1, 2, 4 s), then [Try again]. The chin says "Connecting…" until it opens.

### 3.5 Panels, the board, letting go, offline

- **Employee panel**: shirt-colour band, face (56) straddling its edge, name as the outlined title, state chip + time;
  icon chips for project, branch, model, uptime, cost; "Context" bar (`pct`, "128k of 200k"; danger from 85 %: "Nearly
  full: expect a /compact"); rows Now, Working on, Last said, You asked, Interns; collapsible "Recent chatter". Footer:
  primary with `E`, "Quick message", danger text "Let go" far left. External: "Started in your own terminal (crateswipe,
  pid 66880). Talk to them there." **Help** (`?`): controls, legend, "Calmer motion".
- **Quick message** (hosted): inline composer "Message Claudette…" (≤ 4 rows; Enter sends, Shift+Enter new line, `Esc`
  closes). Working: "They'll read it after this step." Needs-you: disabled, "Answer them first: sit down at their
  computer." (a 409 shows it too and keeps the draft). Sent: toast "Sent to Claudette", bubble "On it!".
- **Roster** (`R`, button, whiteboard): mint panel "Roster", grouped Needs you, Working, Starting, Free, Asleep. Row 56:
  face 40, name 16/600, project, activity or `lastText` 14 ink-2; right: "12m" in state, "+2" interns. Click or Enter →
  go to. Footer "Hire someone" `H`. Empty: "Nobody's in yet." (as the first-run card).
- **Personnel files** (`E` at the cabinet): manila panel "Personnel files" with a folder tab, search "Search past
  sessions". Row: title (else last prompt, else "Untitled session"), project, "3 days ago", "$1.24", small primary "Call
  back in" (live: "In the office" + "Go to them"). Toast "Called back in. They're on their way."; arrival "Welcome back,
  Claudette!". Empty: "No past sessions yet. Finished sessions end up here."
- **Team Room board** (`E` at the wall, or the plan meter): no panel; the camera eases to the board (2.4 m out, eye
  height, 900) and the HUD fades but for the needs-you chip. The world draws `TeamStats` there (plan gauges with reset
  countdowns, team numbers, a context bar per employee). "[E] Step back", any move key or `Esc` returns.
- **Intern desk** (`E` there): panel "Intern desk", one row per intern: type, description, "for" + their boss's face and
  name (click → go to the boss). Empty: "No interns right now. They show up when someone hands off work."
- **Let go** (hosted) turns the action row into an in-place confirm: **"Let Claudette go?"** "This ends their Claude
  session. You can call them back later from Personnel files." (+ "They're in the middle of something." if working).
  Secondary "Keep them" (focused), danger "Let go". A cardboard box (procedural until `held_box` ships) pops into their
  arms; they say "Bye, boss!", "I'll see myself out.", "Saving my notes. Bye!" or "It's been real.", walk out, wave at
  the door. Toast "Claudette packed up and left. Their session has ended." Nameplate vacant, chair rolls in.
- **Offline**: `/ws` drops → after 1.5 s a top-centre ink banner "Lost the office server. Reconnecting…"; canvas
  `saturate(.55)` over 600; pills grey; server actions disable ("Offline"); walking still works. Backoff 1, 2, 4, 8, 10
  s; after 30 s: "The office server isn't running. Start it with `npm run dev` in the claude-office folder." [Retry
  now]. Back: green "Back online" (1.2 s); nothing pops: missed changes walk in and out, with one toast "While you were
  away: Clyde clocked in, Klaus left." (`npm run dev` reloads instead.) **Errors**: toast (7 s) "Couldn't <action>:
  <server error>", echoing the button ("hire", "call them back", "send that", "let Claudette go", "answer").

## 4. UI design system

### 4.1 Colour (CSS variables on `:root`, from PALETTE)

- `--ink` #2B2D42 (text, borders, glyphs, focus ring), `--ink-2` #5C5F77 (secondary text, paper only: 6.2:1), `--paper`
  #FFFDF7, `--paper-2` #F3EBDA (inputs, rows, key caps), `--shade` rgba(43,45,66,.25). `--primary` #5CC8FF (the sky
  accent from deskAccents; shadow #2E9FDB): primary buttons, selection. `--danger` #C92A3A (shadow #8E1C28).
- Text on any fill is ink (fills 4.3–9.8:1, states ≥ 4.9:1), except paper on danger (5.3:1), on the ink banner, on dark
  wells (bezel chin, ask detail) and outlined titles. Buttons are primary, secondary (paper), danger or text.
- **Our palette, WL's energy (ART-REFERENCE §5):** panels stay paper, not WL amber, because amber means needs-you here.
  From WL we take the construction: inner bevel, outlined titles, sticker icons, pops and slams, blue-glass speech.

### 4.2 Type, space, shape

- **Type**: Fredoka, sentence case, no all-caps. Panel title 26/30 700; HUD title, section, ask title 20/24 700; prompt,
  needs-you chip 18/22 600–700; body 16/22 400; buttons, names 16/20 600; chips, HUD meta, bubbles 15/20 400–600; meta,
  pills 14/18; key caps, badges, hints 13/16 700. `tabular-nums` for ticking numbers. Monospace only in the terminal and
  ask details.
- **Space** 4, 8, 12, 16, 20, 24, 32, 48 (HUD inset 16, panel padding 20, list gap 8). **Radius**: panel 20, bezel 28,
  toast/bubble/HUD box 16, input/row/well 12, key cap 7, pills 999. **Border** (ink): 4 panels and bezel; 3 buttons,
  chips, toasts, bubbles, HUD; 2 inputs, pills, key caps, rows.
- **Shadow**, solid, never blurred: panel `inset 0 0 0 3px var(--paper-2), 0 6px 0 var(--shade)` (WL's bevel band), HUD
  and toast `0 4px 0`, button `0 4px 0 <its shadow>`; hover lifts 2, press drops 3. **Focus**: `0 0 0 3px var(--paper),
  0 0 0 6px var(--ink)` on every control, never removed.

### 4.3 Components and icons

- **Panel**: right dock, width min(400, 100vw − 32) (560 for plan asks), top 88, max-height calc(100vh − 112), body
  scrolls, sticky action footer; 64 px band (employee: their shirt; hire #FFC94A; files #F6B76E; roster #8FE0C8;
  interns, help #7DB8F0); WL title 26/700, paper fill, 5 px ink outline (`-webkit-text-stroke`, `paint-order: stroke
  fill`), `0 3px 0` shade drop; 40 px close ×. One at a time; under 900 wide a bottom sheet (max 70vh). The terminal is
  the only modal.
- **Face**: `faceSvg(looks, size)` from `employeeLooks()` mirrors the 3D head (ART-REFERENCE §1: head shape, skin, eyes,
  hair or hat silhouette, glasses) on a disc of their shirt colour; 24/32/40/56. Favicon and logo too.
- **Button**: pill, 44 tall (40 small), padding 0 20, 16/600, optional key cap right; primary, secondary, danger or
  text. Disabled: 45 % opacity, no shadow, a tooltip saying why. **Chip** 30 tall, glyph 18 + 15/600. **Key cap** min
  24×24, paper-2, 2 px border + 4 px bottom border, 13/700; US labels, bound by `e.code`.
- **Toast**: paper, 3 px border, radius 16, 6 px left stripe (state, primary or danger), face or icon 32, text 16 (name
  600), optional small action. **Tooltip**: ink, paper 14/600, radius 10, after 400. **Banner**: top-centre pill, 44
  tall, 16/600: ink with paper text (offline), working green with ink text (back).
- **Icons**: inline SVG in `ui/icons.ts`, no icon fonts or emoji; 24 viewBox, filled shapes, 2 px ink stroke, round
  joins (WL stickers). State glyphs: bolt, "!", check, "z", three dots (§5); plus clipboard, bell, folder, speaker…

### 4.4 Motion (springs sampled from `chars/spring.ts`, so panels wobble like bodies)

```css
--spring-pop:  linear(0, .201, .605, .978, 1.198, 1.252, 1.191, 1.088, .997, .946, .937, .954, .981, 1.003, 1); /* 5.2 Hz, ζ .4, 300 ms */
--spring-soft: linear(0, .165, .497, .819, 1.042, 1.146, 1.158, 1.118, 1.062, 1.015, .985, .974, .976, .984, 1); /* 3.4 Hz, ζ .5, 420 ms */
--spring-bump: linear(0, .342, .917, 1.263, 1.282, 1.121, .965, .905, .932, .987, 1.023, 1.028, 1); /* 6 Hz, ζ .35, 300 ms */
--ease-in: cubic-bezier(.5, 0, .75, 0);  --ease-out: cubic-bezier(.2, .8, .2, 1);
```

- **Panel** in: scale .85 → rest (peaks 1.04, WL's pop), y +12, rotate 1.5°, 300 pop (opacity over the first 100); out:
  scale .92 + fade, 160 ease-in. **Toast** in: y −28, scale .9 → rest, 420 soft; out: y −12 + fade, 200 ease-in.
  **Prompt, bubble, edge face, ask card** in: scale .7 → 1, 300 pop; card fold to one line 300 soft. **Count**: 1.3 → 1,
  300 bump. **Button**: press y +3 (60 linear), release 300 bump, hover y −2 (120 ease-out). **Bezel**: FLIP 420 soft;
  close 260 ease-in. **Slam** ("Interview went great!", "Nobody needs you"): scale 1.4 → .95 → 1, 350.
- Origin = whatever opened it. **Reduced motion** (OS setting or "Calmer motion"): springs become 150 fades; no bob,
  breathing, wiggle, confetti or streaks; go-tos and camera shots become 150 fade-cuts; wobble stays, bump kicks 50 %.

### 4.5 Sound

WebAudio synth via `sfx.ts`'s `tone()`; master 0.55 → compressor; no retrigger within 120 (steps exempt); max 6 voices,
stealing `step` first, never `ding`. Before the first gesture the Sound button shows a dot ("Click anywhere to turn on
sound"). `M` mutes (`claude-office:muted`, master to 0 in 50). P1: pan by screen x (±0.6), fade with distance (≥ 35 %).

| Name (use) | Recipe (wave, Hz, ms) | Gain |
| --- | --- | --- |
| `pop` / `unpop` (panel, toast in / out) / `tick` (press) | sine 520→880, 70 / sine 760→420, 80 / triangle 1800, 25 | .16 / .10 / .05 |
| `ding` (needs you, new ask) | triangle 988 then 1319 (+90), 350 each, plus a sine an octave below at ×.3 | .22 (repeats .12) |
| `pop-up` / `tada` | triangle 659 then 988 (+70), 160 / triangle 1047, 1319, 1568, 60 apart, 250 each | .12 / .10 |
| `chime-in` / `chime-out` | sine 659 → 523 (+160), 500 / sine 523 → 392 | .16 / .12 |
| `whoosh` / `bell` | noise → bandpass 800→2400, Q .8, 350 / triangle 1319 + sine 2637 (×.3), 900 | .07 / .20 |
| `step` / `boing` / `thud` | noise 30, lowpass 600, ±6 % pitch / sine 260→520, 130 / sine 140→70, 90 | .035–.05 / .10 / .14 |
| `boop` / `error` (error toast) / `pip` | square 440→330, 80 / square 220→180, 120 (both lowpass 1200) / sine 1568, 40 | .07 / .08 / .05 |
| `wahwah` / `slurp` | triangle 392, 330, 262 (160 each), the last bending −60 cents over 400 with a 6 Hz wobble / noise bandpass 900→400, 250 | .14 / .06 |

## 5. Controls and accessibility

| Input | Action |
| --- | --- |
| WASD / arrows, Shift, Space | walk (camera-relative; closes the panel, cancels a go to), run, jump |
| drag (left or right), wheel | orbit (pitch 20–70°), zoom 4–18 m |
| `V` (or zoom all the way in) | first / third person. First person: pointer lock; a crosshair (8 px ink dot, 2 px paper ring) picks the `E` target and the prompt sits 48 below it; panels and the terminal release the lock ("Click to look around" until the next click); the first `Esc` only releases the lock (browser rule) |
| click a character or their pill | go to them (a click moved < 5 px in < 300 ms; otherwise it was a drag) |
| `E` | interact; with a panel open, press its button marked `E` (an ask card has none: `E` focuses it), else close it; ignored in a panel's first 250 |
| `Q` (also `N`, as in GAMEPLAY.md) | go to the next person who needs you, longest-waiting first; `Q` sits next to WASD |
| `1`–`9` | with an ask card focused: its buttons in order; otherwise (P1) the person in that roster row |
| `R` / `H` / `M` / `?` | roster / hire / sound / help |
| `Esc` | clear a search field, then close the composer, the confirm, the panel; cancel a go to. Never at a terminal |
| `Ctrl+]` | stand up from the computer |

- **Focus**: Tab is the browser's, never a game key, so every button, toast action and card is reachable. A panel you
  open (key, `E`, click) takes focus on its title, or its ask card; one opened by a go-to leaves focus on the canvas. In
  a panel, Space, Enter and arrows act like a web page; WASD still closes it and walks. Inputs, textareas and the
  terminal get every key; Cmd/Ctrl/Alt chords never reach the game. Gamepad later: a mapping onto the same actions.
- **Readability**: text ≥ 13 (body 16), targets ≥ 40, contrast ≥ 4.5:1 (3:1 at ≥ 24 px or 19 px/700); labels fade.
- **Screen readers**: panels are `role="dialog"` (non-modal) labelled by their title; toasts `aria-live="polite"`;
  needs-you is announced once, assertively: "Clyde: needs your permission." P1: desktop notification while hidden.
- **State is never colour alone.** Say "free", never "idle" (it reads as stuck), on the whiteboard too.

| State (user word) | Colour | Glyph | Body | Monitor |
| --- | --- | --- | --- | --- |
| working ("working") | stateWorking | bolt | typing, reading, running… | code bars |
| needs-you ("needs you") | stateNeedsYou | ! | arm up waving, bouncing "!" | amber "!" |
| idle ("free") | stateIdle | check | leans back, swivels | screensaver |
| sleeping ("asleep") | stateSleeping | z | head on the desk, Z z z | dark, z z z |
| starting ("starting") | stateStarting | three dots | looks around | screensaver |

## 6. Extension hooks (v0 must not block these)

- **Event bus** (`ui/events.ts`, P0): typed `clock-in`, `clock-out`, `hired`, `rehired`, `fired`, `needs-you`, `ask`,
  `answered`, `turn-done`, `go-to`, `jump`, `bump`, `coffee`, `panel`; sfx, fx, toasts, tab title, coach cards and later
  achievements and Beans ("First hire", "10 hands answered", "Inbox zero for an hour") all subscribe.
- **Emotes** (wave, stretch, shrug, hop, cheer) are named `Body.play(emote)` clips, so a manager emote wheel is content.
  Persistence stays under `claude-office:*`. The world exposes decor slots; a wandering NPC becomes the office dog.
