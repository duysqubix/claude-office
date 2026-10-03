// The browser checks (scripts/ui-check.mjs) against an office of its own (scripts/ci/office.mjs)
// in dev mode, where the ui-kit pages live: a throwaway HOME, a private tmux server and a free
// port. The game pages they open are the demo office (?demo=1); nothing is hired or answered.
// First it makes sure this Chrome can draw WebGL at all, and warms up Vite so its first-load
// dependency scan can't reload a page halfway through a check.
//   node scripts/ci/ui.mjs          (CHROME_PATH picks the browser)
// The game suites need a GPU: with software WebGL the office draws a frame or so a second, and
// the game's capped time step makes everything in it that much slower.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { freePort, makeHome, ROOT, startOffice, wait } from './office.mjs';

const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}

const home = makeHome('office-ui-');
const port = Number(process.env.PORT) || (await freePort());
let office;
let code = 1;
const t0 = Date.now();
try {
  office = await startOffice({ home, port, dev: true });
  console.log(`office on :${port} (dev mode), Chrome ${executablePath}`);

  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage();
    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl2');
      if (!c) return null;
      const info = c.getExtension('WEBGL_debug_renderer_info');
      return info ? c.getParameter(info.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER);
    });
    if (!gl) throw new Error('this Chrome has no WebGL2');
    console.log(`WebGL2: ${gl}`);
    // Vite pre-bundles dependencies on the first visit and reloads the page once it has: do it now.
    const inFlight = new Set();
    page.on('request', (r) => inFlight.add(r.url()));
    for (const done of ['requestfinished', 'requestfailed']) page.on(done, (r) => inFlight.delete(r.url()));
    for (const path of ['/?demo=1&quiet=1', '/ui-kit.html']) {
      const t = Date.now();
      await page.goto(office.base + path, { waitUntil: 'networkidle2', timeout: 120_000 }).catch((err) => console.log(`  (warm-up of ${path}: ${err.message}; still loading: ${[...inFlight].slice(0, 5).join(', ')})`));
      await wait(1500);
      console.log(`  warmed up ${path} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    console.log('');
  } finally {
    await browser.close();
  }

  const env = { ...home.env, UI_KIT_BASE: office.base, GAME_BASE: office.base };
  code = spawnSync(process.execPath, [join(ROOT, 'scripts', 'ui-check.mjs')], { cwd: ROOT, env, stdio: 'inherit' }).status ?? 1;
} catch (err) {
  console.error(`✘ ${err.message}`);
  if (office) console.error(office.log().split('\n').slice(-30).join('\n'));
} finally {
  await office?.stop();
  home.cleanup();
}
console.log(`\nui-check ${code ? 'failed' : 'passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(code ? 1 : 0);
