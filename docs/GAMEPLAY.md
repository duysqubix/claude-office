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
