# Gameplay: Claude Code, as a game you can actually work in

Claude Office is two things at once: a **real interface for developing with Claude Code**
(it has to be at least as fast as the terminal for the everyday loop) and a **game**
(cosy, funny, rewarding). The utility comes first; the game layer makes it a place you
want to spend the day in.

## Principles

1. **Never slower than the terminal** for the daily loop: see who needs you, answer, hand
   out work. Keyboard-first, few clicks, no forced walking when you're in a hurry.
2. **Nothing pops.** Every arrival and departure is physical: people walk in through the
   front door, walk out when they're done. State changes are body language first, UI second.
3. **Reward real work, never token burn.** The economy pays for outcomes (finished tasks,
   commits, merged PRs, unblocking people quickly), never for usage or time spent.
4. **Purely cosmetic economy.** Coins buy looks and fun, never productivity. No dark
   patterns, no nagging, no streak guilt.

## v0: the office is alive (built)

| Claude Code | In the office |
| --- | --- |
| New session (yours or hired in-game) | Walks in the front door, pulls out a chair, sits |
| Session ends (`/exit`, closed, let go) | Stands up, walks out the door (with a packed box if let go) |
| Subagent starts / finishes | An intern walks in to their desk / walks back out |
| Busy | Types, reads, runs commands, browses: animation matches the tool |
| Permission prompt / question / dialog | Hand up, waving, big **!**, chime |
| Turn finished | Stretch, lean back, wait for you |
| Idle 15 min | Asleep on the keyboard |
| You need them | Walk over, `E`: see what they're doing; sit at their computer for the real terminal |

## v0.5: answer without the terminal (the utility unlock)

The manager walks to whoever has their hand up and answers **in the game**:

- **Permission prompts**: the speech bubble shows the real request ("Run `npm test`?",
  "Edit `auth.ts`?") with big buttons: **Allow**, **Always allow**, **Deny** (+ optional note).
- **Questions** (AskUserQuestion): the options appear as buttons; pick one or type an answer.
- **Trust / MCP dialogs**: same pattern.

How: Claude Code 2.1.286 ships a `PermissionRequest` hook. A tiny hook script forwards the
request to the office server and waits for the manager's answer; if the office isn't open
(or nobody answers in time), it steps aside and the normal terminal dialog appears. One
command installs it, one removes it. Sessions hired in-game can also be answered by reading
and driving their tmux screen, which needs no config change.

Also in v0.5: off-screen arrows to anyone waiting, browser notifications + tab badge when
the game is in the background, `N` = walk to the next person who needs you, `1`–`9` = jump
to an employee, quick message from the roster.

## Regulars: NPC coworkers (building now)

The office should never feel empty, even with one session running. **Regulars** are NPC
coworkers: they walk in, work at free desks, take coffee breaks, chat, and go home. They are
not Claude sessions. When a real session needs a desk and the room is full, a random regular
gives up their desk ("All yours!") and heads out.

| Decision | Choice |
| --- | --- |
| Density | Settings: **Off / Some / Lively** (default Lively), saved per browser. Lively fills every desk but one; Some fills about half. Never more than 14 regulars (frame budget). |
| Desks | Regulars only use existing desks; the office never grows for them. A session takes a truly free desk if there is one, else displaces a random regular. A returning session whose remembered desk has a regular on it displaces that regular. |
| Churn | Shifts of 4–12 min. A coffee or water-cooler break every few minutes (walk over, sip, sometimes chat with another regular, walk back). Below target, one new regular walks in every 20–60 s. On page load about 70% of the target are already seated. |
| Telling them apart | Claude sessions wear the orange staff lanyard; regulars never do. A regular's label is a small muted name pill (no status icon), shown only up close. Their nameplate says name and department (Sales, Design, Finance…), and their monitor shows ordinary office work (spreadsheets, email, slides), never a terminal. |
| Interaction | `E` near a regular: they say a quip in a speech bubble (no panel). Bumping them works like bumping anyone. They never appear in the roster, HUD counts, toasts, the Team Room board, `Q`/go-to, or any server request. |
| Night | After 9 pm the same crowd stays (the office is for working late), with yawns and night-owl quips. |
| Testing | `?regulars=off\|some\|lively\|<n>` and `?seed=<n>` for repeatable screenshots. |

Later: regulars as shop items (hire a barista, a cleaner, a DJ), and pets that follow them around.

## v1.1: the next round (queued)

- **Blender models everywhere**: swap the remaining procedural furniture for the 232 catalog
  models, and dress the characters with Rodin's kit (bodies, 13 hairstyles, hats, outfits).
- **Shell tab** on every computer: a real zsh in that employee's folder next to Claude (today:
  type `!command` in Claude for one-off shell commands).
- **Coffee-shop music**: gentle background lo-fi with a volume knob (generated in the browser,
  no licensing issues).
- **Spotify on the manager's laptop**: walk to your desk, sign in with Spotify (PKCE, Premium,
  Web Playback SDK), browse your playlists and change tracks in-game; the office speakers play it.

## v1: the game layer

### Currency: Beans ☕ (working name)
Earned from real outcomes:

| Event | Beans |
| --- | --- |
| An employee finishes a turn | +1 |
| You unblock someone within 2 min of their hand going up | +2 (responsive-manager bonus) |
| A commit lands from a session | +5 |
| A PR is merged | +20 |
| Daily first hire / everyone idle-or-done at end of day | small bonuses |

### Spend: the shop is the asset catalog
Every model in `docs/ASSETS.md` is a potential shop item:
- **Manager wardrobe**: Rodin's hair, hats, outfits, glasses, accessories (e.g. crown, propeller cap, hoodie).
- **Desk & office decor**: Cézanne's props, posters, plants, rugs; placed with a simple decorate mode.
- **Office upgrades**: Monet's game room (ping-pong, arcade cabinet, nap pod, massage chair), a bigger kitchen.
- **Pets**: office cat and dog that wander and nap.
- **Expansion**: more desk pods and new rooms as the team grows.

### Progression & delight
Office level (unlocks space as you hire), achievements ("First hire", "Inbox zero for an
hour", "Shipped it: 10 commits in a day", "Night owl"), seasonal events (birthday cake on the
repo's anniversary, Halloween hats), employees' moods reacting to how quickly you unblock them.

## v2 and beyond (ideas, not plans)
Team offices (a shared office for a team's agents), employee "skills" visible as desk
items (MCP servers, tools), meeting room = multi-agent workflows, a commute/outdoor area.
