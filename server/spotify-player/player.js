// The Spotify player frame's glue (#28), served by server/spotify-frame.ts on its own loopback
// port: it loads Spotify's Web Playback SDK, which plays here and nowhere else. The office page
// (our parent) drives it over postMessage, and every message both ways is checked for where it
// came from and only ever goes to the office:
//   office → frame  { t: 'connect', name }            make the player and connect it
//                   { t: 'cmd', id, cmd, arg? }        pause | resume | toggle | next | prev | seek | volume | activate | disconnect
//                   { t: 'token', id, token | error }  the access token we asked for
//   frame → office  { t: 'hello' }                     the glue is running
//                   { t: 'token?', id, refresh }       the SDK wants an access token (refresh: the last one was refused)
//                   { t: 'done', id, ok, error? }      a connect or command finished
//                   { t: 'event', name, data }         sdk | sdk_error | ready | not_ready | state | the SDK's errors | csp
// The refresh token never comes here: the office hands over short-lived access tokens only.
'use strict';
(() => {
  const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
  const meta = document.querySelector('meta[name="office"]');
  const office = (meta ? meta.getAttribute('content') || '' : '').split(/\s+/).filter(Boolean);
  // The office says who it is in our address (#origin); it must be one the server listed.
  const parentOrigin = decodeURIComponent(location.hash.slice(1));
  if (window.parent === window || !office.includes(parentOrigin)) return;

  const send = (msg) => window.parent.postMessage(msg, parentOrigin);
  const text = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

  // Anything this page's CSP blocked: the office logs it (it's how a stricter policy gets tuned).
  document.addEventListener('securitypolicyviolation', (e) => send({ t: 'event', name: 'csp', data: { directive: text(e.effectiveDirective), blocked: text(e.blockedURI) } }));

  let player = null;
  let sdkReady = false;
  let connecting = null;
  let serial = 0;
  let refusedAt = 0;
  const asked = new Map();

  /** An access token from the office (a fresh one if Spotify just refused the last). */
  const token = () =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      asked.set(id, { resolve, reject });
      send({ t: 'token?', id, refresh: Date.now() - refusedAt < 5000 });
      setTimeout(() => {
        if (asked.delete(id)) reject(new Error('No token from the office'));
      }, 15000);
    });

  /** The bits of the SDK's state the office shows, as plain data. */
  const stateOf = (s) => {
    const t = s.track_window && s.track_window.current_track;
    return {
      paused: !!s.paused,
      position: Number(s.position) || 0,
      duration: Number(s.duration) || 0,
      context: { uri: text(s.context && s.context.uri) },
      disallows: { skipping_next: !!(s.disallows && s.disallows.skipping_next), skipping_prev: !!(s.disallows && s.disallows.skipping_prev) },
      track_window: {
        current_track: t
          ? {
              uri: text(t.uri, 100),
              name: text(t.name),
              duration_ms: Number(t.duration_ms) || 0,
              album: { name: text(t.album && t.album.name), images: ((t.album && t.album.images) || []).slice(0, 6).map((i) => ({ url: text(i && i.url, 500), width: Number(i && i.width) || 0 })) },
              artists: (t.artists || []).slice(0, 12).map((a) => ({ name: text(a && a.name, 100) })),
            }
          : null,
      },
    };
  };

  const make = (name) => {
    player = new window.Spotify.Player({
      name: text(name, 60) || 'Claude Office',
      // Silent until the office hands it the speakers.
      volume: 0,
      getOAuthToken: (cb) => {
        token().then(cb, (err) => send({ t: 'event', name: 'authentication_error', data: { message: text(err && err.message) } }));
      },
    });
    const on = (event, fn) => player.addListener(event, fn);
    on('ready', ({ device_id }) => send({ t: 'event', name: 'ready', data: { device_id: text(device_id, 100) } }));
    on('not_ready', ({ device_id }) => send({ t: 'event', name: 'not_ready', data: { device_id: text(device_id, 100) } }));
    on('player_state_changed', (s) => send({ t: 'event', name: 'state', data: s ? stateOf(s) : null }));
    on('authentication_error', ({ message }) => {
      refusedAt = Date.now();
      send({ t: 'event', name: 'authentication_error', data: { message: text(message) } });
    });
    for (const name of ['initialization_error', 'account_error', 'playback_error']) on(name, ({ message }) => send({ t: 'event', name, data: { message: text(message) } }));
    on('autoplay_failed', () => send({ t: 'event', name: 'autoplay_failed', data: null }));
  };

  const connect = (m) => {
    if (!sdkReady) {
      connecting = m;
      return;
    }
    if (!player) make(m.name);
    player.connect().then(
      (ok) => send({ t: 'done', id: m.id, ok: !!ok }),
      (err) => send({ t: 'done', id: m.id, ok: false, error: text(err && err.message) }),
    );
  };

  const COMMANDS = {
    pause: (p) => p.pause(),
    resume: (p) => p.resume(),
    toggle: (p) => p.togglePlay(),
    next: (p) => p.nextTrack(),
    prev: (p) => p.previousTrack(),
    seek: (p, ms) => p.seek(Math.max(0, Math.round(Number(ms) || 0))),
    volume: (p, v) => p.setVolume(Math.max(0, Math.min(1, Number(v) || 0))),
    activate: (p) => p.activateElement(),
    disconnect: (p) => {
      p.disconnect();
      player = null;
    },
  };

  const command = (m) => {
    const run = COMMANDS[m.cmd];
    if (!run || !Object.prototype.hasOwnProperty.call(COMMANDS, m.cmd)) return send({ t: 'done', id: m.id, ok: false, error: 'Unknown command' });
    if (!player) return send({ t: 'done', id: m.id, ok: false, error: 'No player' });
    Promise.resolve()
      .then(() => run(player, m.arg))
      .then(
        () => send({ t: 'done', id: m.id, ok: true }),
        (err) => send({ t: 'done', id: m.id, ok: false, error: text(err && err.message) }),
      );
  };

  window.addEventListener('message', (ev) => {
    // The office, and only the office.
    if (ev.source !== window.parent || ev.origin !== parentOrigin) return;
    const m = ev.data;
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (m.t === 'token') {
      const w = asked.get(m.id);
      if (!w) return;
      asked.delete(m.id);
      if (typeof m.token === 'string' && m.token && m.token.length < 4096) w.resolve(m.token);
      else w.reject(new Error(text(m.error) || 'No token'));
    } else if (m.t === 'connect') connect(m);
    else if (m.t === 'cmd') command(m);
  });

  window.onSpotifyWebPlaybackSDKReady = () => {
    sdkReady = true;
    send({ t: 'event', name: 'sdk', data: null });
    if (connecting) {
      const m = connecting;
      connecting = null;
      connect(m);
    }
  };
  const s = document.createElement('script');
  s.src = SDK_URL;
  s.async = true;
  s.onerror = () => send({ t: 'event', name: 'sdk_error', data: { message: 'Spotify’s player didn’t load' } });
  document.head.append(s);
  send({ t: 'hello' });
})();
