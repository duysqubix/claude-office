**Any empty desk is a terminal now, and the office has a soundtrack.**

Walk up to any empty desk and it's your terminal. Every employee's computer gets a shell next to Claude. A little café band plays while you work, people say "After you!" in the doorway, and the yard turns into a garden worth taking a break in.

![Claude and Shell tabs in the quick look](https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/shell-tabs.jpg)

## What's new in v1.1.0

**Computers**
- **Hot desks:** walk up to any empty desk and press `E` to use its computer: your own shell, in your home folder. It keeps running after you stand up, so a long command keeps going, and the desk says "Hot desk" until you shut it down.
- **Claude | Shell tabs:** every employee's computer has a second tab, a shell in their project folder, next to Claude. It's in the quick look (`T`) too, and `` Ctrl+` `` switches. People running in your own terminal get the Shell tab as well.

**Sound**
- **Coffee-shop music,** made up as it plays (no audio files): softer and slower after 9 pm, and a little quieter while you type to someone. It starts after your first click, because browsers keep a page quiet until then.
- **Interface sounds:** a bell for a new hire, a sad trombone when you let someone go, a soft pip for news. **Help → Music and sound** has the switch and both volumes, and `M` mutes everything.
- **First-run tips:** a few small cards teach the basics on your first visit. Help → **Show tips again** brings them back.

**A livelier office**
- **People step around each other** instead of walking through each other: a "Sorry!" when they brush, an "After you!" in a tight spot.
- **A garden out back:** a stepping-stone trail with rose arches winds through thick planting past a bench, a picnic table, loungers under a parasol, a hammock and the pond, with lights that come on at dusk. People on their break lounge and stroll out there.
- **Lava lamps with real moving wax,** in each desk's own colours.
- **Auto-walks face where you're going,** go around people sitting at their desks instead of bumping them, and arrive facing the person.

**Smoother**
- **No slow motion on slow machines:** below 20 fps the office keeps real time, just choppier.
- **No haze up close:** pull the camera in and you fade out crisply instead of turning into a blur.
- **The camera glides through the front door** instead of dropping onto you.
- **Growing the office no longer hitches:** adding a desk pod went from a 40–56 ms frame to about 28 ms, and shared model geometry takes about 20% less memory.

**Fixed**
- The ceiling above the front door no longer flickers.
- The wall clock no longer sinks into the wall, and the ledge no longer cuts through the posters.
- The wall calendar, the tokens poster and the Team Room glass no longer shimmer at a distance.
- The MY STUFF box is packed full and no longer floats.
- The mustache sits close to the face, so every mouth shape shows.
- Dark specks and streaks are gone from a dozen models: the desk fan and the globe, the focus pod, the wall clock, the mailbox, the flag pole, the DJ booth, and a few hats and hairdos.

**Under the hood**
- **CI:** type checks, a build and a server smoke test on every pull request, plus the browser checks nightly.
- **Keeps up with Claude Code:** a daily job tries each new Claude Code release against the office and, once a Claude token is set up for the repo, opens a pull request with whatever needs adapting. Until then it posts each new release's results on an issue.
- **Security hardening:** an office only touches the sessions it hired, so a second copy can never let go of yours. Terminals and their input are capped, every new kind of terminal is checked before anything attaches, and the new endpoints went through a security review.

<table>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/hot-desk.jpg" alt="A hot desk's computer open: your own shell in your home folder, with Shut down and Stand up"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/lava-lamp.jpg" alt="A lava lamp on a desk, its pink wax rising in the glass"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/doorway.jpg" alt="People meeting in the front doorway, one saying Go ahead"></td>
  </tr>
  <tr>
    <td align="center"><sub>A hot desk: your own shell, still running after you stand up.</sub></td>
    <td align="center"><sub>Lava lamps with real moving wax.</sub></td>
    <td align="center"><sub>Five clock in, five go home: "Go ahead!"</sub></td>
  </tr>
  <tr>
    <td width="33%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/yard-trail.jpg" alt="Eye level on the garden's stepping-stone trail: someone stretched out on a lounger, two people at the picnic table under string lights"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/yard-dusk.jpg" alt="The picnic table at dusk: string lights glowing, two people on their break, loungers under a parasol and a picnic blanket"></td>
    <td width="33%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.1.0/docs/media/yard-above.jpg" alt="The office from above: the building in a meadow garden, the stepping-stone trail looping round it past the pond, the hammock and the picnic area"></td>
  </tr>
  <tr>
    <td align="center"><sub>On the trail, people on their break.</sub></td>
    <td align="center"><sub>The picnic table when the lights come on.</sub></td>
    <td align="center"><sub>The whole garden, from above.</sub></td>
  </tr>
</table>

## Upgrade
```bash
git pull && npm install && npm start
```
New here? Clone it and run `npm install` and `npm start` (see the README). macOS, Linux or Windows (WSL2), Node 22+, Claude Code on your PATH, and `tmux` for hiring, the Shell tab and hot desks.

**Next ([v1.2](https://github.com/duysqubix/claude-office/milestone/3)):** Spotify on the manager's laptop, lighter characters, and the server hardening follow-ups.
