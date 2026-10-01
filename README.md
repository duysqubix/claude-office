# Claude Office 🏢

**Your Claude Code sessions, as a wobbly little 3D office. You're the manager.**

Every Claude Code session running on your machine is an employee at a desk. New
sessions walk in the front door and sit down. Sessions that need your permission
raise their hand. Sessions that finish go home. You walk around in third person,
check on people, hire new ones, call old ones back in, and sit down at their
computer to talk to them through the real Claude Code terminal.

It's not really a game. It's Claude Code, but fun.

## The idea

| In Claude Code | In the office |
| --- | --- |
| A running session | An employee at a desk |
| Session is busy | Typing away (reading, running commands, browsing, thinking…) |
| Permission prompt / question / dialog | Hand up, big **!** over their head |
| Finished its turn | Leans back, waits for you |
| Idle for 15+ minutes | Asleep on the keyboard |
| Subagents | Interns crowding around their desk |
| `claude` (new session) | **Hire** someone at reception |
| `claude --resume` | **Call someone back in** from the Personnel Files |
| Typing into the session | Sit at their computer (real terminal, in-game) |
| `/exit` | Pack up and walk out |

Art direction: chunky, sunny, toy-like, wobbly. Think *Wobbly Life*: round heads,
stubby limbs, springy physics-y movement, bright colours, soft shadows.

## Quickstart

```bash
npm install
npm run dev        # http://127.0.0.1:4777
```

Requirements: macOS or Linux, Node 20+, `tmux`, and Claude Code (`claude`) on your PATH.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Walk (relative to the camera) |
| `Shift` | Run |
| `Space` | Jump |
| `V` | First / third person |
| Mouse drag / wheel | Orbit / zoom the camera |
| `E` | Interact (employee, reception, filing cabinet, whiteboard, coffee) |
| `Tab` | Roster |
| `H` | Hire |
| `M` | Mute |

## How it works

```
~/.claude/sessions/<pid>.json ─┐   live sessions + status (busy / idle / waiting)
~/.claude/projects/**.jsonl ───┼─► server/ (Node, 127.0.0.1:4777) ──ws──► client/ (Three.js)
~/.claude/projects/*/<id>/subagents ┘        │
                                             └─ tmux ─► sessions you hire in-game
```

- **Who's in the office**: Claude Code keeps a registry of live sessions in
  `~/.claude/sessions/<pid>.json` (pid, session id, cwd, name, status). The server
  polls it and checks each pid is still a running `claude`.
- **What they're doing**: the server tails each session's transcript
  (`~/.claude/projects/<project>/<session>.jsonl`) for the current tool, last message,
  title, branch and cost, and reads `subagents/*.meta.json` for interns.
- **Hiring**: new sessions start inside `tmux` (`office-<id>`), so they survive a
  server restart and you can also `tmux attach -t office-<id>` from any terminal.
  In-game, "sit at their computer" attaches an xterm.js terminal to that tmux session.
- **Sessions you started yourself** in a normal terminal show up too (read-only):
  you can see what they're doing and what they said, but you talk to them in
  their own terminal.

Nothing is installed into your Claude Code config. No hooks, no settings changes.

## Safety

The server binds to `127.0.0.1` only and rejects requests whose `Host` or `Origin`
isn't the office itself, because it can start Claude sessions and type into them.

## Roadmap

See [docs/SPEC.md](docs/SPEC.md) for the full design. Next up after v0:

- Talk to sessions you started outside the office (via Claude Code's local peer messaging)
- Employees wander to the coffee machine when idle; break room chatter
- Physics props you can knock over; office pets
- Hire with a role (agent type / model / effort), team pods per project
- Sound design, day/night cycle synced to your clock
