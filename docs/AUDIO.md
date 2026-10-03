# Claude Office: sound and music

Everything you hear is synthesized in the browser with WebAudio: no audio files, no samples. UX.md §4.5 owns the
sound table and the controls; this file is how the speakers, the café music and the sound effects are built, and how
to listen to the music without opening the office.

## Speakers (`client/src/audio/index.ts`)

One `AudioContext` for every sound, created on the first click or key press (browsers allow no sound before that).
`audio.arm()` (called once by `Sfx`) listens for that gesture; nothing is created or played before it.

```
band (MusicPlayer.output, fades) → music bus (volume² × duck) ┐
sound effects (Sfx voices)        → sfx bus (0.55 × volume²)   ├→ master (mute) → limiter → speakers
```

- **Mute** (`M`, the HUD Sound button): master to 0 in ~50 ms; a moment later the band stops and the context
  suspends (no CPU while muted). Saved as `claude-office:muted`.
- **Help → Music and sound** (`audio/controls.ts`): Music on/off, music volume, sound-effects volume. Saved as
  `claude-office:music`, `claude-office:music-volume`, `claude-office:sfx-volume` (0–1, slider position; the gain is
  its square). Other tabs follow changes through the `storage` event.
- **Ducking**: while focus is inside `.term-modal` or `.co-panel--chat`, the music bus dips to 0.55.
- **One tab plays**: tabs share a `BroadcastChannel`; the tab clicked or typed in most recently keeps the music, and
  the others fade theirs out until you use them again.
- **Evening**: from 21:00 to 05:00 on the office clock (local time, as the HUD shows; `?hour=22` pretends), new tunes
  are slower (64–70 bpm) and softer, and the band eases 3 dB quieter and darker over about half a minute.
- URL params: `?music=0|1` (this visit only), `?musicseed=<n>` (same tunes every time), `?hour=<h>`, and in dev
  builds `?debug=1` exposes `window.officeAudio` (`state()`, `level()`).

### Handing the speakers to another source (#28)

```ts
const handBack = audio.handOver({
  name: 'Spotify',
  setLevel(level) { /* 0–1: music volume with mute, Music off and ducking applied; called on every change */ },
  release() { /* the office wants the speakers back: Music turned off, or another source took over */ },
});
// …later, when the source stops:
handBack(); // the café band fades back in
```

While a source holds the speakers the band is stopped, `audio.nowPlaying` is `{ by: 'external', label: name }`
and Help says "Playing from Spotify".

## The café band (`client/src/audio/`)

| File | What it does |
| --- | --- |
| `composer.ts` | A seed in, a whole tune out: key, tempo (72–85 day), form (intro, A, B, outro), two progressions, voicings, a swung beat, a bass line, a sparse vibes motif. Pure data, so it runs in Node too. |
| `theory.ts` | Chord qualities (maj9, m9, 13, 7b9…), progressions as roman numerals (`'ii9 \| V13 \| Imaj9 \| Imaj9'`), voice leading: each chord takes the voicing nearest the last one. |
| `instruments.ts` | The voices, all plain nodes: an electric piano (a sine tine through a pickup curve, so hard notes bark and soft ones are pure, plus a short bell on the strike), a round bass, kick, stick, side-stick, brushes and brush swirls, hats, shaker, vibes. |
| `fx.ts` | The room reverb (rendered once in an `OfflineAudioContext`), vinyl crackle, the café murmur loop, the limiter. |
| `music.ts` | The mix (buses, kick-driven pump on the keys, tape saturation and wow, a muffled-to-open sweep at each tune's start) and the lookahead scheduler. |

A tune runs about two and a half minutes. It ends on its tonic chord ringing out behind a closing filter, takes a
breath, and the next tune starts in a neighbouring key, muffled at first, keys alone, then bass, then drums. Tune n of
a visit is always the same tune, so a restart (unmute, Music on) carries on with the next one.

**Scheduling.** Nothing runs per frame. A 100 ms timer calls `pump()`, which queues bars ahead and creates the nodes
for notes starting within the next 0.8 s (2.5 s in a hidden tab). The next tune is composed in an idle callback while
the current one plays its last bars; the reverb, the vinyl loop and the murmur are rendered in `OfflineAudioContext`s,
off the main thread. Measured in the demo office (`scripts/ui-check/audio.mjs`): about 0.04 ms per pump (0.4 ms of
main thread per second), no change in frame times, no late notes.

**Audio-thread cost.** About 6 % of one core above an idle context while the band plays (8 % in all; a silent
context alone is 2 %). What it took to get there, worth keeping: no per-note filter sweeps (an automated
`BiquadFilterNode` recomputes its coefficients every sample), no oversampled waveshapers, a 1 s room instead of a long
convolution, k-rate for slow LFOs, and finished voices disconnected on `ended`. Muted, the context is suspended.

**Levels.** A `DynamicsCompressorNode` adds make-up gain by itself; `fx.ts`'s `limiter()` takes it back so it is
transparent below −3 dBFS. Sound effects come out at the UX.md gains; the band has its own `LEVEL` in `music.ts`.

## Listening without the office

`/music-lab.html` (dev server) plays the band live, and renders it offline:

```
UI_KIT_BASE=http://127.0.0.1:4778 node scripts/music-render.mjs <outDir> [day night handoff keys bass drums lead tonal murmur …]
```

writes WAV files (`day.wav`, `day2.wav`, `night.wav`, `night2.wav`, `handoff.wav` across a tune change, solo stems,
and `tonal.wav`, the band without drums or crackle, for click checks). Useful numbers for a change: the day mix sits
near −15 LUFS before the volume slider (about −26 at the default 55 %), the evening mix about 5.5 LU below it, peaks
below −1.5 dBFS, the keys stem a few LU above bass and drums, and nothing below 40 Hz worth mentioning.
