// Render the café music offline to WAV files, for listening tests (client/src/audio/lab.ts).
//   UI_KIT_BASE=http://127.0.0.1:4778 node scripts/music-render.mjs <outDir> [clip …]
// Clips: day, day2, night, night2, handoff (one tune into the next), stems (keys/bass/drums/lead solo),
// tonal (no drums or crackle: for click checks), murmur.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;

const BASE = process.env.MUSIC_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const [outDir = 'snaps/music', ...only] = process.argv.slice(2);
const seed = Number(process.env.SEED ?? 20261002);
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
mkdirSync(outDir, { recursive: true });

const clips = {
  // As heard in the office: crackle and the café murmur under the band.
  day: { seconds: 75, seed, skip: 10, murmur: 0.2 },
  day2: { seconds: 75, seed: seed + 7, skip: 40, murmur: 0.2 },
  night: { seconds: 75, seed: seed + 1, night: true, skip: 10, murmur: 0.2 },
  night2: { seconds: 75, seed: seed + 3, night: true, skip: 40, murmur: 0.2 },
  handoff: { seconds: 40, seed, skip: 0, firstTune: 0, handoff: true },
  keys: { seconds: 30, seed, skip: 12, parts: ['keys'], crackle: false },
  bass: { seconds: 30, seed, skip: 12, parts: ['bass'], crackle: false },
  drums: { seconds: 30, seed, skip: 12, parts: ['drums'], crackle: false },
  lead: { seconds: 40, seed, skip: 40, parts: ['lead'], crackle: false },
  clean: { seconds: 60, seed, skip: 10, crackle: false },
  tonal: { seconds: 90, seed, skip: 0, parts: ['keys', 'bass', 'lead'], crackle: false },
  nighttonal: { seconds: 60, seed: seed + 1, night: true, skip: 0, parts: ['keys', 'bass', 'lead'], crackle: false },
  murmur: { seconds: 30, seed, skip: 10, murmur: 0.2 },
  murmuronly: { seconds: 50, seed, skip: 0, parts: [], crackle: false, murmur: 0.2 },
  vinylonly: { seconds: 22, seed, skip: 0, parts: [] },
};

const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 900_000, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()));
  // Other agents edit the tree live: no hot reload may restart the page mid-render.
  await page.evaluateOnNewDocument(() => {
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
  });
  page.setDefaultTimeout(600_000);
  await page.goto(`${BASE}/music-lab.html`, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.musicLab, { timeout: 10_000 });
  for (const [name, o] of Object.entries(clips)) {
    if (only.length && !only.includes(name)) continue;
    let opts = o;
    if (o.handoff) {
      // Find where tune 0 ends, then render 20 s either side of it.
      const len = await page.evaluate((s) => window.musicLab.tuneLength(s, 0), o.seed);
      opts = { ...o, skip: Math.max(0, len - 20) };
    }
    const r = await page.evaluate((x) => window.musicLab.render(x), opts);
    const file = `${outDir}/${name}.wav`;
    writeFileSync(file, Buffer.from(r.wav, 'base64'));
    console.log(`${file}  (${(r.ms / 1000).toFixed(1)} s to render)  ${r.tunes.join(' | ')}`);
  }
  if (errors.length) console.log('Page errors:\n' + errors.join('\n'));
} finally {
  await browser.close();
}
