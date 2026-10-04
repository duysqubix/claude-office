**A bug-fix release: every bug found while shipping v1.2, plus a Codex review on GPT-6-Astra.**

Spotify recovers from hiccups, chat only ever types into your own office's sessions, visitors stop walking through each other at the picnic blanket, and five more models stop shimmering.

## Fixed in v1.2.1

**Spotify on the laptop** (from the Codex review)
- **New sign-in, new songs:** signing into another account never shows the previous account's songs.
- **Player recovery:** if Spotify's player fails to load once, the next Play loads it again instead of hanging.
- **Speakers come back:** a token refusal mid-song gives the speakers back to the café band.
- **Small windows:** the laptop fits windows down to 700×420, with Stand up where it belongs.

**Chat and terminals**
- **Only your own sessions:** chat, Interrupt, Let go and the terminals only ever act on this office's own sessions, even if tmux restarts in between. Each action checks the session, the tmux server and the name together (also from the Codex review).
- **Custom tmux socket:** if you start the office inside tmux on its own socket, hires, Shell tabs and hot desks all open on that same server.
- **Emoji on older tmux:** emoji messages send on Debian 12's tmux 3.3a.
- **Right reason on refusal:** a refused message says why ("They have a question open" during a new hire's folder-trust prompt).
- **No strangers:** background sessions that Claude Code's agents view starts no longer walk in as strangers.
- **Containers:** sessions in another PID namespace (an office in a container, say) show as "can't check" instead of vanishing.
- **Stays up:** the office keeps serving after a server error instead of exiting.

**The office**
- **The picnic blanket:** visitors no longer walk through people sitting there. Its sitting area is solid now, and people sit down from straight behind.
- **No load hitch:** characters finish merging into single meshes behind the splash, so there's no hitch when it lifts, and each merge is cheaper.
- **No more shimmer** on the sun lounger, the tokens poster, the sliding door, the company sign and the cardboard box.

**Under the hood**
- **Checks never touch your office:** the browser checks refuse to run against your own office on port 4777.
- **Daily compat check:** the daily Claude Code check now also covers how Claude Code draws its input box, which chat relies on.
- **Depth-fight meter:** it measures wide models fully, compares near-parallel faces in neighbouring buckets, and holds animated parts still.
- **tmux 3.4+ recommended** on Linux. Debian 12's tmux 3.3a can knock Claude Code's own screen out of step after some emoji (#113).

## Upgrade
```bash
git pull && npm install && npm start
```
