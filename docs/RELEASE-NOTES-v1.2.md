**Your Spotify on the office speakers, and a lighter, faster office.**

Walk to the boss desk and your laptop plays your own Spotify through the office speakers. Everyone in the office now costs a fraction of what they did to draw, so a full office runs smoother, especially out in the garden.

![The Spotify app on the manager's laptop: Liked Songs, playlists down the side, a song playing](https://raw.githubusercontent.com/duysqubix/claude-office/v1.2.0/docs/media/spotify-laptop.jpg)

## What's new in v1.2.0

**Spotify on your laptop**
- **Press `E` at the laptop on the boss desk:** you sit down behind your chair and the laptop opens like the other computers.
- **One-time setup:** the first time, it walks you through making your own Spotify app, with the exact redirect address to paste and a box for its Client ID. Playing music needs Spotify Premium.
- **Your music:** Liked Songs first, then your playlists and their songs. Play, pause (`Space` too), next, previous, seek, and the office music volume.
- **The office speakers are yours:** playing hands them to Spotify, the café band fades out, and the laptop's screen shows what's playing from across the room. Pause, and the band comes back.
- **The music plays on:** `Esc` stands you up and the song keeps going.

**Lighter and faster**
- **Characters cost a fraction to draw:**
  - Once dressed, each person is merged into a single mesh, and people far away are drawn in one go.
  - A busy office makes about 3× fewer draw calls: 1,440 → 478 in the demo office.
  - People still look the same up close, cast their shadows and shade correctly in any pose.
- **The garden draws only what's in view:** from inside the office, the meadow costs 75% fewer triangles.
- **Adding desks no longer stutters** if a desk model fails to load.

**Fixed**
- **No more shimmer:**
  - the flag no longer sparkles;
  - the donut box's label and base no longer shimmer up close;
  - the cork board, the Ship-it poster and the ping-pong table no longer shimmer at a distance.
- **Lava lamps** keep their wax inside the glass, whatever shape the glass is.

**Safer**
- **Spotify is walled off:**
  - Spotify's player runs in its own frame on its own local port, and only once you've signed in and opened the laptop. It has no way to reach the office's terminals or hiring.
  - Your Spotify sign-in stays on the server, one per office, in a file only you can read.
- **Chat never answers for you:** a message you send can't land on a permission prompt or question Claude just raised, and text someone is typing at their computer is left alone.
- **Clear rehire errors:** rehiring a name that another office or a live session already holds tells you how to free it, instead of showing a raw tmux error.
- **Big pastes arrive whole:** large pastes into a terminal arrive intact (tested with 9 MB).
- **Signal deaths are reported:** a session killed by a signal says so ("stopped by SIGKILL").
- **On Linux,** a reused process id is never mistaken for the old session.
- **Re-checks before acting:** the office re-checks that it owns a session right before letting it go, interrupting it, typing to it or sitting at its computer.

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.2.0/docs/media/laptop-now-playing.jpg" alt="The laptop on the boss desk, its screen showing a NOW PLAYING band with the song and artist"></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/duysqubix/claude-office/v1.2.0/docs/media/yard-trail.jpg" alt="Eye level on the garden's stepping-stone trail: someone stretched out on a lounger, two people at the picnic table under string lights"></td>
  </tr>
  <tr>
    <td align="center"><sub>Now playing, on the laptop's own screen.</sub></td>
    <td align="center"><sub>The garden draws only the parts in view.</sub></td>
  </tr>
</table>

## Upgrade
```bash
git pull && npm install && npm start
```
New here? Clone it and run `npm install` and `npm start` (see the README). You need macOS, Linux or Windows (WSL2), Node 22+, Claude Code on your PATH, and `tmux` for hiring, the Shell tab and hot desks. For Spotify you also need Premium and your own free Spotify developer app; the laptop walks you through it.

**Next:** hire with a role (agent type, model and effort), and a cosmetic shop where finished turns earn Beans for hats and decor.
