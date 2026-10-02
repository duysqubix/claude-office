<div align="center">

# Claude Office

**Your Claude Code sessions, as a wobbly little 3D office. You're the manager.**

[![Node 20+](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)](package.json)
[![macOS | Linux | Windows (WSL2)](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows%20%28WSL2%29-555)](#quick-start)
[![Three.js](https://img.shields.io/badge/three.js-0.186-000000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![For Claude Code](https://img.shields.io/badge/for-Claude%20Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)

[Quick start](#quick-start) · [What you'll see](#what-youll-see) · [Features](#features) · [Controls](#controls) · [How it works](#how-it-works) · [Roadmap](#roadmap)

<img src="docs/media/office.jpg" alt="Overhead view of the office: desk pods on blue and pink carpets, a Team Room with a big wall screen, the manager's corner, a break area and the intern bench, with a lawn and trees outside" width="900">

</div>

Every Claude Code session running on your machine is an employee at a desk. New
sessions walk in the front door and sit down. Sessions that need your permission
raise their hand. Sessions that finish go home. You walk around in third person,
check on people, hire new ones, call old ones back in, and sit down at their
computer to talk to them through the real Claude Code terminal.

It's Claude Code, but fun.

## Quick start

```bash
git clone https://github.com/duysqubix/claude-office && cd claude-office
npm install
npm start          # builds, serves http://127.0.0.1:4777 and opens your browser
```

Every Claude Code session already running on your machine walks into the office. The
office only **reads** Claude Code's own files and changes nothing in your Claude setup.

**Requirements:** macOS, Linux or Windows ([with WSL2](#windows-wsl2)), Node 20+, Claude
Code (`claude`) on your PATH, and `tmux` if you want to hire, resume or let go of sessions
from inside the game.

### Windows (WSL2)

Run the office inside [WSL2](https://learn.microsoft.com/windows/wsl/install), in the same
distro as Claude Code. It's then the Linux setup: install Node 20+, `tmux` and Claude Code
in WSL and run the three commands above.

- **Open it in your Windows browser.** WSL2 forwards `localhost` to Windows, so
  `http://127.0.0.1:4777` works there. If `npm start` doesn't open it for you, paste the
  address into your browser.
- **Only sessions running in WSL join.** The office reads `~/.claude` in your WSL home.
  Claude Code running natively on Windows (PowerShell or CMD) keeps its sessions in your
  Windows home, so those don't appear.
- **Sluggish on a laptop with two GPUs?** Windows often runs the browser on the
  power-saving integrated GPU, and below 20 fps the whole game slows down, not just the
  picture. In **Settings → System → Display → Graphics**, set your browser to **High
  performance**, then quit the browser completely (every window) and reopen it. Task
  Manager's **GPU engine** column shows which GPU it's using.

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
| `/exit` | Pack up and walk out |

<table>
  <tr>
    <td width="33%"><img src="docs/media/desks.jpg" alt="Two desk pods with colourful office chairs; one monitor glows orange with an exclamation mark"></td>
    <td width="33%"><img src="docs/media/team-room.jpg" alt="The Team Room: a wall screen with plan-usage rings, context-window bars and team counts above a conference table"></td>
    <td width="33%"><img src="docs/media/interns.jpg" alt="The intern bench: a long plywood desk of little beige monitors and pink stools under an INTERNS banner"></td>
  </tr>
  <tr>
    <td align="center"><sub>Desk pods. An orange screen means that employee needs you.</sub></td>
    <td align="center"><sub>The Team Room board: plan usage, context windows, headcount, commits and session costs.</sub></td>
    <td align="center"><sub>Subagents sit at the intern bench.</sub></td>
  </tr>
</table>

Art direction: chunky, sunny, toy-like, wobbly. Think *Wobbly Life*: round heads,
stubby limbs, springy physics-y movement, bright colours, soft shadows.

## Features

- **Answer without the terminal.** With the optional hooks, permission prompts, questions
  and plan approvals appear in the game: Allow, Deny, or pick an option.
- **Sit at their computer.** Sessions you hire run in `tmux`, and sitting down attaches the
  real terminal (xterm.js) in-game.
- **Chat with any employee.** Watch their tool steps as they happen ("Editing `auth.ts`"),
  send a message, or interrupt a hosted session with `Esc`. A session you started in your own terminal
  can be adopted: when it exits there, the office resumes it with the whole conversation.
- **Interns.** Subagents walk in, sit at the intern bench, and go home 5 minutes after they
  go idle.
- **Team Room.** A wall screen with your 5-hour and weekly plan usage, every employee's
  context window, and who's working or waiting.
- **Triage in one key.** `Q` walks you to whoever has waited longest.

## Optional extras

| Want | Do | Undo |
| --- | --- | --- |
| Answer permission prompts, questions and plan approvals **in the game** (Allow / Deny / pick an option) | `npm run hooks:install` | `npm run hooks:uninstall` |
| Plan-usage gauges (5-hour / weekly) on the Team Room board, if you don't use oh-my-claudecode's HUD | `npm run statusline:install` (wraps your current status line, which keeps working) | `npm run statusline:uninstall` |
| Develop the client with hot reload | `npm run dev` | |

With the hooks installed, the office only steps in while you're looking at it (visible
tab, recent input). After 90 s, or when the office is closed, the question goes back to
the normal terminal prompt. Each change to `~/.claude/settings.json` is backed up.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Walk (relative to the camera) |
| `Shift` | Run |
| `Space` | Jump |
| `V` | First / third person |
| Mouse drag / wheel | Orbit / zoom the camera (scroll all the way in for first person) |
| `E` | Interact (employee, reception, filing cabinet, whiteboard, coffee) |
| `R` | Roster |
| `Q` | Walk to whoever needs you (longest wait first) |
| `H` | Hire |
| `M` | Mute |

## How it works

```
~/.claude/sessions/<pid>.json ─┐   live sessions + status (busy / idle / waiting)
~/.claude/projects/**.jsonl ───┼─► server/ (Node, 127.0.0.1:4777) ──ws──► client/ (Three.js)
~/.claude/projects/*/<id>/subagents ┘        │
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

Nothing is installed into your Claude Code config unless you opt into the hooks above.

## The models

The office is built from 232 chunky `.glb` models in `client/public/models`. Four AI
artist sessions (Claude Monet, Cézanne, Lorrain and Rodin) made them in Blender from
the build scripts in `assets/blender/`. You don't need Blender to run the office. See
[docs/ASSETS.md](docs/ASSETS.md) to remake a model or add one, and run `npm run catalog`
to browse them all at `http://127.0.0.1:4777/catalog.html`.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Server with hot reload |
| `npm run typecheck` | Type-check the client (`npm run typecheck:server` for the server) |
| `npm run smoke` | Read-only smoke test of the office server |
| `npm run catalog` | Rebuild the model catalog from the GLBs |

## Safety

The server binds to `127.0.0.1` only and rejects requests whose `Host` or `Origin`
isn't the office itself, because it can start Claude sessions and type into them.

## Roadmap

See [docs/SPEC.md](docs/SPEC.md) for the full design and [docs/GAMEPLAY.md](docs/GAMEPLAY.md)
for the game layer. Next up:

- Employees wander to the coffee machine when idle; break room chatter
- Physics props you can knock over; office pets
- Hire with a role (agent type / model / effort), team pods per project
- A cosmetic shop: earn Beans for finished turns, commits and merged PRs, spend them on hats and decor
- Sound design, day/night cycle synced to your clock
