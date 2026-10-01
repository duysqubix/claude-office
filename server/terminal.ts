// "Sit at their computer": a tmux attach client in a pty, bridged to an xterm.js WebSocket.
// Closing the socket kills only the attach client; the session keeps running in tmux.
import pty from 'node-pty';
import type { WebSocket } from 'ws';
import type { TermClientMessage } from '../shared/protocol';
import { HOME } from './config';
import { cleanEnv } from './exec';
import { isOfficeName, tmuxPath } from './tmux';

const clampDim = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

export function attachTerminal(ws: WebSocket, tmuxName: string, cols: number, rows: number): void {
  if (!isOfficeName(tmuxName)) {
    ws.close(1008, 'not an office session');
    return;
  }
  const env = cleanEnv();
  delete env.TMUX;
  delete env.TMUX_PANE;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';

  const term = pty.spawn(tmuxPath(), ['attach-session', '-t', `=${tmuxName}`], {
    name: 'xterm-256color',
    cols: clampDim(cols, 20, 400, 120),
    rows: clampDim(rows, 5, 200, 36),
    cwd: HOME,
    env: env as Record<string, string>,
  });

  let open = true;
  term.onData((data) => {
    if (open && ws.readyState === ws.OPEN) ws.send(data);
  });
  term.onExit(() => {
    open = false;
    if (ws.readyState === ws.OPEN) ws.close(1000, 'detached');
  });

  ws.on('message', (raw) => {
    let msg: TermClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.t === 'in' && typeof msg.d === 'string') term.write(msg.d);
    else if (msg.t === 'resize') term.resize(clampDim(msg.cols, 20, 400, 120), clampDim(msg.rows, 5, 200, 36));
  });
  ws.on('close', () => {
    if (open) {
      open = false;
      term.kill();
    }
  });
}
