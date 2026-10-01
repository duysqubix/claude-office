// Motion contact sheet: captures N frames of a page into one PNG grid, so motion
// (arm swing, follow-through, settling) can be judged from a single image.
//   npm run filmstrip -- "<url>" <out.png> [frames=12] [intervalMs=80] [warmMs=5000] [cols=4] [clip=x,y,w,h]
// Example: npm run filmstrip -- "http://127.0.0.1:5182/?demo=1&autowalk=1" snaps/walk.png 16 60
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const [url, out = `snaps/strip-${Date.now()}.png`, framesArg = '12', intervalArg = '80', warmArg = '5000', colsArg = '4', clipArg] =
  process.argv.slice(2);
if (!url) {
  console.error('usage: npm run filmstrip -- "<url>" <out.png> [frames] [intervalMs] [warmMs] [cols] [x,y,w,h]');
  process.exit(1);
}
const frames = Math.max(2, Math.min(48, Number(framesArg)));
const interval = Math.max(0, Number(intervalArg));
const cols = Math.max(1, Number(colsArg));
const clip = clipArg ? (([x, y, width, height]) => ({ x, y, width, height }))(clipArg.split(',').map(Number)) : undefined;

const executablePath = CHROME.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, Number(warmArg)));

  const shots = [];
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const started = Date.now();
    const data = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 82, ...(clip ? { clip } : {}) });
    shots.push({ data, t: started - t0 });
    const wait = interval - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  const cellW = clip ? Math.min(clip.width, 480) : 400;
  const sheet = await browser.newPage();
  const rows = Math.ceil(shots.length / cols);
  await sheet.setViewport({ width: cols * (cellW + 8) + 8, height: 600, deviceScaleFactor: 1 });
  await sheet.setContent(`<!doctype html><html><body style="margin:0;padding:4px;background:#1e1e2e;font:12px system-ui;color:#eee">
    <div style="display:grid;grid-template-columns:repeat(${cols}, ${cellW}px);gap:8px;padding:4px">
    ${shots
      .map(
        (s, i) => `<figure style="margin:0"><img style="width:${cellW}px;display:block;border-radius:6px" src="data:image/jpeg;base64,${s.data}">
        <figcaption style="padding:2px 4px">#${i + 1} · t=${s.t}ms</figcaption></figure>`,
      )
      .join('')}
    </div></body></html>`);
  await sheet.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  await sheet.screenshot({ path: out, fullPage: true });
  console.log(`${out}  (${shots.length} frames, ${rows}×${cols}, ~${Math.round((shots.at(-1).t || 1) / (shots.length - 1))}ms apart)`);
  if (errors.length) console.log('Page errors:\n' + errors.slice(0, 10).join('\n'));
} finally {
  await browser.close();
}
