**A small fix release: the Spotify laptop recovers by itself, the building loses its stray stripe, and the office stays up.**

## Fixed in v1.2.2

**Spotify on the laptop**
- **Recovers by itself:** if the office was restarting when you opened the laptop, it used to stay on "The office's Spotify isn't answering" for good. Now it keeps asking, at 2 s and then a little longer each time, and carries on to your library as soon as the office answers. Try again still works.
- **Says when the office is out of date:** if the page is newer than the office's server, the laptop says so: restart the office (`npm start`) and press Try again.
- **No stale answers:** a late reply from an earlier attempt can no longer cover up a newer one, or start Spotify behind a closed laptop.

**The office**
- **No more blue stripe outside:** the mint band from the inside walls stuck out of the building and cut through every window frame. The trims now stay on the inside walls, and a low stone base runs round the outside.
- **Stays up:** the office no longer shuts down if a roster refresh or a stats build fails. It logs the error and carries on.

**Under the hood**
- **Steadier music checks:** the music's frame-budget checks failed at random on a busy machine. They now play a fixed tune, compare short back-to-back music-on and music-off turns, and time the scheduler offline. They still fail when real work is added. There was no regression: v1.2.1's music costs the same as v1.2.0's.
- **Building check:** a new browser check fails if a wall trim leaves the room or crosses a window or the door.

## Upgrade
```bash
git pull && npm install && npm start
```
