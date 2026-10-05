<div align="center">

# Claude Office

**Your Claude Code sessions, as a cosy little 3D office. You're the manager.**

[![Node 22+](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](package.json)
[![macOS | Linux | Windows (WSL2)](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows%20%28WSL2%29-555)](#quick-start)
[![Three.js](https://img.shields.io/badge/three.js-0.186-000000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![For Claude Code](https://img.shields.io/badge/for-Claude%20Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)

[Quick start](#quick-start) · [What you'll see](#what-youll-see) · [Features](#features) · [Controls](#controls) · [How it works](#how-it-works) · [Roadmap](#roadmap)

<img src="docs/media/office.jpg" alt="The office from above in its garden: two employees asking to run a command, a thought bubble, desk pods and the intern bench inside; a stepping-stone trail, the pond, loungers and flowering trees outside" width="900">

</div>

Every Claude Code session running on your machine is an employee at a desk. New
sessions walk in the front door and sit down. Sessions that need your permission
raise their hand. Sessions that exit go home. You walk around in third person,
check on people, hire new ones, call old ones back in, and sit down at your hires'
computers to work in their real Claude Code terminal.

It's Claude Code, but fun.

## Quick start

```bash
git clone https://github.com/duysqubix/claude-office && cd claude-office
npm install
npm start          # builds, serves http://127.0.0.1:4777 and opens your browser
```

The office only **reads** Claude Code's own files and changes nothing in your Claude setup.
The café music starts after your first click or key press (browsers keep a page quiet
until then); `M` mutes it.

**Requirements:** macOS, Linux or Windows ([with WSL2](#windows-wsl2)), Node 22+, Claude
Code (`claude`) on your PATH, and `tmux` if you want to hire, resume or let go of sessions
from inside the game, or use the Shell tab and hot desks. On Linux and WSL, `npm install`
compiles the terminal module, so it also needs build tools (Debian/Ubuntu:
`sudo apt install build-essential python3`). Use tmux 3.4 or newer if you can: with Debian
12's tmux 3.3a, some newer emoji knock Claude Code's own screen out of step, and the office
then won't type into that session until it redraws.

### Windows (WSL2)

Run the office inside [WSL2](https://learn.microsoft.com/windows/wsl/install), in the same
distro as Claude Code. It's then the Linux setup: install Node 22+, `tmux`, Claude Code and
build tools (`sudo apt install build-essential python3`) in WSL, and run the three commands
above.

- **Open it in your Windows browser.** WSL2 forwards `localhost` to Windows, so
  `http://127.0.0.1:4777` works there. If `npm start` doesn't open it for you, paste the
  address into your browser.
- **Only sessions running in WSL join.** The office reads `~/.claude` in your WSL home.
  Claude Code running natively on Windows (PowerShell or CMD) keeps its sessions in your
  Windows home, so those don't appear.
- **Choppy on a laptop with two GPUs?** Windows often runs the browser on the
  power-saving integrated GPU. In **Settings → System → Display → Graphics**, set your
  browser to **High performance**, then quit the browser completely (every window) and
  reopen it. Task Manager's **GPU engine** column shows which GPU it's using.

## What you'll see

| In Claude Code | In the office |
| --- | --- |
| A running session | An employee at a desk |
| Session is busy | Typing away (reading, running commands, browsing, thinking…) |
| Permission prompt / question / dialog | Hand up, big **!** over their head |
| Finished its turn | Leans back, waits for you |
| Idle for 15+ minutes | Asleep on the keyboard |
| Subagents | Interns at the intern bench |
| `claude` (new session) | **Hire** someone at reception |
| `claude --resume` | **Call someone back in** from the Personnel Files |
| Typing into the session | Sit at their computer (real terminal, in-game) |
| A shell of your own | Any empty desk: sit down and it's your terminal (a hot desk) |
| `/exit` | Pack up and walk out |

<table>
  <tr>
    <td width="33%"><img src="docs/media/desks.jpg" alt="Two desk pods with colourful office chairs; Claudius has a hand up under an orange Run a command? bubble"></td>
    <td width="33%"><img src="docs/media/team-room.jpg" alt="The Team Room: a wall screen with plan-usage rings, context-window bars and team counts above a conference table"></td>
    <td width="33%"><img src="docs/media/interns.jpg" alt="The intern bench: a long plywood desk of little beige monitors and pink stools under an INTERNS banner"></td>
  </tr>
  <tr>
    <td align="center"><sub>Desk pods. A raised hand and an orange bubble: they need you.</sub></td>
    <td align="center"><sub>The Team Room board: plan usage, context windows, headcount, commits and session costs.</sub></td>
    <td align="center"><sub>Each intern shows its type and who it works for.</sub></td>
  </tr>
</table>

Art direction: chunky, sunny and toy-like: round heads, stubby limbs, springy movement,
bright colours and soft shadows.

<p align="center"><img src="docs/media/cast.jpg" alt="A row of characters in the office: round heads, stubby limbs, bright jumpers, hats, glasses and a headset" width="900"></p>

## Features

### Answer, chat and type

- **Answer without the terminal.** With the optional hooks, permission prompts, questions
  and plan approvals appear in the game: Allow, Deny, or pick an option.
- **Chat with any employee.** Their replies render as real markdown (tables, highlighted
  code with Copy), tool steps show as they happen ("Editing `auth.ts`"), and you can send a
  message to, or interrupt, any session the office started. While they have a question
  open, your message isn't sent. A session you started in your own terminal can join too:
  press **Bring into the office** in their chat, and once you exit it there, the office
  picks it up with the whole conversation.
- **Sit at their computer.** Sessions you hire run in `tmux`, and sitting down attaches the
  real terminal (xterm.js) in-game. Every computer has a second tab, **Shell**: a shell in
  that employee's folder (`` Ctrl+` `` switches).
- **Quick look.** `T` near anyone shows their live terminal at once, without sitting down.
- **Hot desks.** Press `E` at any empty desk for your own shell in your home folder. It keeps
  running after you stand up, and the desk says "Hot desk" until you shut it down.

<table>
  <tr>
    <td width="50%"><img src="docs/media/asks.jpg" alt="Claudius has a hand up; the panel asks to run npm test with Allow, Always allow and Deny, while Claudette's question waits across the room"></td>
    <td width="50%"><img src="docs/media/chat.jpg" alt="The chat panel open on an employee: their reply renders as a markdown table and highlighted code with a Copy button, with Chat and Terminal tabs, Interrupt, and Sit at their computer"></td>
  </tr>
  <tr>
    <td align="center"><sub>A permission prompt, answered in the game.</sub></td>
    <td align="center"><sub>Chat: real markdown, live tool steps.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/media/shell-tabs.jpg" alt="The quick look open on an employee's Shell tab: git status and ls in their project folder, next to the Claude tab"></td>
    <td width="50%"><img src="docs/media/hot-desk.jpg" alt="A hot desk's computer open: your own shell in your home folder, with Shut down and Stand up"></td>
  </tr>
  <tr>
    <td align="center"><sub>The Shell tab: a shell in their project folder.</sub></td>
    <td align="center"><sub>A hot desk: any empty desk is your terminal.</sub></td>
  </tr>
</table>

### Run the office

- **Hire.** `H`, or Mabel at reception: pick a project, give them a first task and a name.
- **Call people back in.** The Personnel Files cabinet lists past sessions; one click
  resumes any of them with its whole conversation.
- **Roster and triage.** `R` lists who needs you, who's working and who's free. `Q` walks
  you to whoever has waited longest.
- **Team Room.** A wall screen with your 5-hour and weekly plan usage, every employee's
  context window, and who's working or waiting.
- **Interns.** Subagents walk in, sit at the intern bench and go home when they finish.

<table>
  <tr>
    <td width="50%"><img src="docs/media/hire.jpg" alt="The manager at reception with the Now hiring panel open: which project, an optional first task and name, and Hire for claude-office"></td>
    <td width="50%"><img src="docs/media/archive.jpg" alt="The Personnel Files panel open by the filing cabinet: past sessions with their projects, ages and costs, each with Call back in"></td>
  </tr>
  <tr>
    <td align="center"><sub>Hiring at reception.</sub></td>
    <td align="center"><sub>Personnel Files: call anyone back in.</sub></td>
  </tr>
</table>

<p align="center"><img src="docs/media/roster.jpg" alt="The Roster panel: one person who needs you, six working with what they're doing, and one free, next to the desk pods" width="900"></p>

### A place to spend the day

- **A lively office.** NPC regulars fill free desks, take coffee breaks and chat, and give a
  desk up to a real session when the room is full ("All yours!"). Mabel runs the front desk.
  None of them are Claude sessions; real sessions wear the orange lanyard. Everyone steps
  around everyone else ("Sorry!", "After you!"), and lava lamps bubble on the desks.
- **A garden out back.** A stepping-stone trail with rose arches winds past loungers, a
  hammock, a picnic table and the pond, with lights that come on at dusk and people on their
  break.
- **Your Spotify on the office speakers.** Press `E` at the laptop on the boss desk: Liked
  Songs and your playlists, with play, pause, skip and seek. While it plays, the café band
  steps aside and the laptop's screen shows the song from across the room
  ([setup](#spotify)).
- **Music and sounds.** Coffee-shop music made up as it plays (softer after 9 pm, a little
  quieter while you type to someone) and small interface sounds. Help (`?`) has the volumes,
  calmer motion and how many regulars come in; `M` mutes everything.
- **Thought bubbles.** Now and then a working session thinks one short line about what it's
  really doing (written by Haiku on your Claude login, at most 20 an hour, only while you're
  watching); regulars daydream. Turn them off in Help.
- **First person.** `V` puts you behind your own eyes, mug in hand.
- **First-run tips.** A few small cards teach the basics on your first visit.

<table>
  <tr>
    <td width="50%"><img src="docs/media/spotify-laptop.jpg" alt="The Spotify app on the manager's laptop: Liked Songs, playlists down the side, a song playing"></td>
    <td width="50%"><img src="docs/media/laptop-now-playing.jpg" alt="The laptop on the boss desk, its screen showing a NOW PLAYING band with the song and artist"></td>
  </tr>
  <tr>
    <td align="center"><sub>Your Spotify on the manager's laptop.</sub></td>
    <td align="center"><sub>Now playing, on the laptop's own screen.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/media/doorway.jpg" alt="People meeting in the front doorway: newcomers say Morning, one gives way with Go ahead"></td>
    <td width="50%"><img src="docs/media/lava-lamp.jpg" alt="A lava lamp on a desk, its pink wax rising in the glass, the window and garden behind"></td>
  </tr>
  <tr>
    <td align="center"><sub>Everyone gives way in the doorway.</sub></td>
    <td align="center"><sub>Lava lamps with real moving wax.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/media/yard-trail.jpg" alt="Eye level on the garden's stepping-stone trail: someone stretched out on a lounger, two people at the picnic table under string lights"></td>
    <td width="50%"><img src="docs/media/yard-dusk.jpg" alt="The picnic table with its string lights on: two people on their break, loungers under a parasol and a picnic blanket"></td>
  </tr>
  <tr>
    <td align="center"><sub>Out back: a stepping-stone trail and people on their break.</sub></td>
    <td align="center"><sub>The picnic table when the lights come on.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/media/first-person.jpg" alt="First person: the manager's hand holds a mug in the foreground, looking across the desk pods to the Team Room screen"></td>
    <td width="50%"><img src="docs/media/help.jpg" alt="The Help panel by the kitchen: calmer motion, thought bubbles, music and sound volumes, and how many office regulars come in"></td>
  </tr>
  <tr>
    <td align="center"><sub>First person: the office over the rim of your mug.</sub></td>
    <td align="center"><sub>Help: sound, motion and how busy the office gets.</sub></td>
  </tr>
</table>

## Optional extras

| Want | Do | Undo |
| --- | --- | --- |
| Answer permission prompts, questions and plan approvals **in the game** (Allow / Deny / pick an option) | `npm run hooks:install` | `npm run hooks:uninstall` |
| Plan-usage gauges (5-hour / weekly) on the Team Room board, if you don't use oh-my-claudecode's HUD | `npm run statusline:install` (wraps your current status line, which keeps working) | `npm run statusline:uninstall` |
| Play your Spotify on the office speakers | [Make your own Spotify app](#spotify), then press `E` at the laptop on the boss desk | **Sign out** on the laptop |

With the hooks installed, the office only steps in while you're looking at it (visible
tab, recent input). After 90 s, or when the office is closed, the question goes back to
the normal terminal prompt. Each change to `~/.claude/settings.json` is backed up.

### Spotify

The laptop walks you through this the first time. It takes a couple of minutes, once, and
playing music needs Spotify Premium.

1. At [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an
   app (any name).
2. Add the redirect URI `http://127.0.0.1:4777/callback` (your office's port; the laptop shows
   the exact address). It must be `127.0.0.1`: Spotify refuses `localhost`.
3. Tick **Web API** and **Web Playback SDK**, then save.
4. Paste the app's **Client ID** into the laptop and press **Sign in with Spotify**.

Your sign-in stays on the server in `~/.claude-office/spotify-<port>.json`, readable only by
you. Each office has its own. **Sign out** on the laptop forgets it; to cut the app off
entirely, remove it at [spotify.com/account/apps](https://www.spotify.com/account/apps/).

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Walk (relative to the camera) |
| `Shift` | Run |
| `Space` | Jump |
| `V` | First / third person |
| Mouse drag / wheel | Orbit / zoom the camera (scroll all the way in for first person) |
| `E` | Talk to someone, or use reception, the Personnel Files, the whiteboard, the Team Room board, the intern bench or the coffee machine |
| `E` at an empty desk | Hot desk: your own shell |
| `E` at the boss desk | Your laptop: Spotify (`Space` plays and pauses) |
| `T` | Quick look at someone's live terminal |
| `Q` or `N` | Walk to whoever needs you (longest wait first) |
| `R` | Roster |
| `H` | Hire |
| `M` | Mute music and sounds |
| `?` | Help |
| `Esc` | Close a panel or the quick look. At a computer it goes to the terminal; at the laptop it stands you up |
| `` Ctrl+` `` | At a computer: switch between Claude and Shell |
| `Ctrl+]` | Stand up from a computer |

## How it works

```
~/.claude/sessions/<pid>.json ──────┐   live sessions + status (busy / idle / waiting)
~/.claude/projects/**.jsonl ────────┼─► server/ (Node, 127.0.0.1:4777) ──ws──► client/ (Three.js)
~/.claude/projects/*/<id>/subagents ┘             │
                                                  └─ tmux ─► sessions you hire in-game
```

- **Who's in the office.** Claude Code keeps a registry of live sessions in
  `~/.claude/sessions/<pid>.json` (pid, session id, cwd, name, status). The server
  polls it and checks each pid is still a running `claude`.
- **What they're doing.** The server tails each session's transcript
  (`~/.claude/projects/<project>/<session>.jsonl`) for the current tool, last message,
  title, branch and cost, and reads `subagents/*.meta.json` for interns.
- **Hiring.** New sessions start inside `tmux` (`office-<id>`), so they survive a
  server restart and you can also `tmux attach -t office-<id>` from any terminal.
  In-game, "sit at their computer" attaches an xterm.js terminal to that tmux session.
- **Sessions you started yourself** in a normal terminal show up too. You can see what
  they're doing and what they said; to type into them, adopt them or use their own terminal.
  Sessions a program drives through the Agent SDK (a plugin's helpers, like claude-mem's
  observers) don't: nobody's at a terminal there.

Nothing is installed into your Claude Code config unless you run one of the installs above.

## The models

There are 253 chunky `.glb` models in `client/public/models`. Four AI
artist sessions (Claude Monet, Cézanne, Lorrain and Rodin) made them in Blender from
the build scripts in `assets/blender/`. You don't need Blender to run the office. See
[docs/ASSETS.md](docs/ASSETS.md) to remake a model or add one. Browse them all at
`http://127.0.0.1:4777/catalog.html` (`npm run catalog` rebuilds its list after a change).

<p align="center"><img src="docs/media/catalog.jpg" alt="The Model Catalog page: 253 of 253 models built, a progress card per artist, and a grid of model cards with sizes" width="900"></p>

## Development

| Command | What it does |
| --- | --- |
| `PORT=4778 npm run dev` | A dev office with hot reload, on 4778 so it doesn't collide with your own office |
| `npm run typecheck` | Type-check the client, server and shared code (`npm run typecheck:server` checks the server with its Node settings) |
| `PORT=4778 npm run smoke` | Smoke test of a running dev office. It opens and closes real shells, so it refuses your own game (4777) |
| `UI_KIT_BASE=http://127.0.0.1:4778 node scripts/ui-check.mjs` | The browser suites, in headless Chrome against a dev office |
| `npm run depth-fight -- <model id>` | Measure a model's shimmer (two surfaces fighting for depth) from 2 to 22 m |
| `npm run catalog` | Rebuild the model catalog from the GLBs |

Every pull request runs the type checks, a build, the smoke test and a Claude Code
compatibility check; the browser suites run nightly. A daily job tries each new Claude Code
release against the office. [CONTRIBUTING.md](CONTRIBUTING.md) has the details and how to
run each check yourself.

## Safety

The office can start Claude sessions and type into them, so:

- The server binds to `127.0.0.1` only and rejects requests whose `Host` or `Origin` isn't
  the office itself. Other sites can't frame it (`X-Frame-Options: DENY`).
- The production build only runs its own scripts. Session text renders as markdown with raw
  HTML escaped: links work only for http(s) and mailto, and images never load.
- In-game answers need a deliberate click or key on the question itself, and a chat message
  is never typed into a session while it's asking something.
- An office only drives the tmux sessions it started: a second copy of the office never
  types into, attaches to or closes yours.
- Thought-bubble calls run with no tools, no settings and no file attachments.
- Spotify's player script never runs in the office page. It runs in its own frame on a
  separate local port that the office refuses, and only once you've signed in and opened
  the laptop.

## Roadmap

See [docs/SPEC.md](docs/SPEC.md) for the full design and [docs/GAMEPLAY.md](docs/GAMEPLAY.md)
for the game layer. Next up:

- Hire with a role (agent type / model / effort)
- A cosmetic shop: earn Beans for finished turns, commits and merged PRs, spend them on hats
  and decor
