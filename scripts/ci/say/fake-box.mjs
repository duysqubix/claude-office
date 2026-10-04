// A stand-in for Claude Code's input box (scratch): draws a 2.1-style box and takes bracketed
// pastes. argv: <log> <enter: sends|keeps> <ghost: dim|plain|plain-nocursor|grey|dim-nocursor|draft-home|draft-nocursor|none> <rule: plain|grey>
import { appendFileSync } from 'node:fs';
const [log, enter, ghost, rule = 'plain'] = process.argv.slice(2);
const R = (t) => (rule === 'grey' ? `\x1b[38;5;244m${t}\x1b[39m` : t);
let text = '';
const NB = '\u00a0';
const box = () => {
  if (text) return `❯${NB}${text}\x1b[7m \x1b[0m`;
  if (ghost === 'dim') return `❯${NB}\x1b[7mT\x1b[0;2mry "fix lint errors"\x1b[0m`;
  if (ghost === 'plain') return `❯${NB}\x1b[7mT\x1b[0mry "fix lint errors"`;
  if (ghost === 'plain-nocursor') return `❯${NB}Try "fix lint errors"`;
  if (ghost === 'grey') return `❯${NB}\x1b[7mT\x1b[0m\x1b[38;5;246mry "fix lint errors"\x1b[39m`;
  if (ghost === 'dim-nocursor') return `❯${NB}\x1b[2mTry "fix lint errors"\x1b[0m`;
  if (ghost === 'draft-home') return `❯${NB}\x1b[7mm\x1b[0my own draft`;
  if (ghost === 'draft-nocursor') return `❯${NB}my own draft`;
  if (ghost === 'plain-suggestion' || ghost === 'plain-suggestion-idle') return `❯${NB}\x1b[7mr\x1b[0mun the tests`;
  if (ghost === 'plain-queued') return `❯${NB}\x1b[7mP\x1b[0mress up to edit queued messages`;
  return `❯${NB}\x1b[7m \x1b[0m`;
};
const draw = () => process.stdout.write(`\x1b[2J\x1b[H● Done.\r\n\r\n${R(`${'─'.repeat(60)} Fake ─`)}\r\n${box()}\r\n${R('─'.repeat(68))}\r\n  ⏸ manual mode on${ghost.endsWith('-idle') && !text ? ' · ? for shortcuts' : ''}\r\n`);
process.stdin.setRawMode(true);
process.stdout.write('\x1b[?2004h');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  for (let m; (m = /\x1b\[200~([\s\S]*?)\x1b\[201~/.exec(buf)); ) {
    text += m[1];
    buf = buf.slice(0, m.index) + buf.slice(m.index + m[0].length);
  }
  if (buf.includes('\r')) {
    appendFileSync(log, `ENTER ${JSON.stringify(text)}\n`);
    if (enter === 'sends') text = '';
    buf = buf.replace(/\r/g, '');
  }
  draw();
});
draw();
