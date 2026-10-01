// Headless screenshot of the running office, for visual review.
//   npm run snap                       -> snaps/office-<time>.png of http://127.0.0.1:4777
//   npm run snap -- <url> <out.png> [waitMs] [width] [height]
// Uses the locally installed Google Chrome via puppeteer-core (no browser download).
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const [url = 'http://127.0.0.1:4777', out = `snaps/office-${Date.now()}.png`, waitMs = '4000', width = '1440', height = '900'] =
  process.argv.slice(2);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=' + width + ',' + height],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: Number(width), height: Number(height), deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, Number(waitMs)));
  await page.screenshot({ path: out });
  console.log(out);
  const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  if (errors.length) console.log('Console errors:\n' + errors.slice(0, 20).join('\n'));
} finally {
  await browser.close();
}
