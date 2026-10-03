// The Spotify player frame (#28): the only place Spotify's Web Playback SDK runs. It's served
// from a second listener on 127.0.0.1 with a port the OS picks, so the SDK lives on its own
// origin, never with the office page's power (the office can open shells and hire Claude in
// any folder; a request from this origin carries this origin and the office refuses it).
//   GET /player     the frame's page: our glue script and nothing else
//   GET /player.js  the glue (spotify-player/player.js): loads the SDK and talks to the office
// Everything else is 404, and any Host but its own is refused. Its page may only be framed by
// the office, and may only run our glue and the SDK, and frame the SDK's own player.
import { readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { ROOT } from './config';

const SDK = 'https://sdk.scdn.co';

export interface PlayerFrame {
  /** http://127.0.0.1:<its port>: what the office's CSP frames and its page checks messages against. */
  origin: string;
  close(): void;
}

const escAttr = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Start the frame's listener. `office`: the office's own origins, the only pages that may frame it. */
export function startPlayerFrame(office: string[]): Promise<PlayerFrame> {
  const glue = readFileSync(join(ROOT, 'server', 'spotify-player', 'player.js'));
  const page = Buffer.from(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Claude Office: Spotify player</title>
<meta name="office" content="${escAttr(office.join(' '))}">
<script src="/player.js"></script>
</head><body></body></html>
`);
  const csp = [
    "default-src 'none'",
    `script-src 'self' ${SDK}`,
    `frame-src ${SDK}`,
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${office.join(' ')}`,
  ].join('; ');
  let host = '';

  const send = (res: ServerResponse, status: number, type: string, body: Buffer | string, extra: Record<string, string> = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extra,
    });
    res.end(body);
  };
  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    // Its own Host only: another name for this address (a rebinding attack) gets nothing.
    if (String(req.headers.host ?? '').toLowerCase() !== host) return send(res, 403, 'text/plain; charset=utf-8', 'Unexpected Host header');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', { Allow: 'GET, HEAD' });
    const path = (req.url ?? '').split(/[?#]/)[0];
    if (path === '/player') return send(res, 200, 'text/html; charset=utf-8', page, { 'Content-Security-Policy': csp });
    // Only its own page may load the glue.
    if (path === '/player.js') return send(res, 200, 'text/javascript; charset=utf-8', glue, { 'Cross-Origin-Resource-Policy': 'same-origin' });
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  });
  // A malformed request never takes the office down.
  server.on('clientError', (_err, socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      host = `127.0.0.1:${port}`;
      // Listening: from here on an error is logged, never thrown at the office (an unhandled one would end it).
      server.off('error', reject);
      server.on('error', (err) => console.warn('[spotify] player frame:', err));
      // It never keeps the office running on its own.
      server.unref();
      resolve({ origin: `http://${host}`, close: () => server.close() });
    });
  });
}
