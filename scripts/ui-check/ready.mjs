// Ready-for-you checks (#162, run by scripts/ui-check.mjs): in the demo office, someone who
// finishes their turn holds up a "Done!" card, the HUD gets an "N ready" chip, a toast says what
// they said with Go and Open chat, and the roster groups them after needs-you. Opening their chat
// clears it; finishing while you already have their chat open never raises it. Q visits whoever
// needs you first, then the ready ones (first finished first). Monitor lists them right after
// needs-you. Help switches the cue off and on. The frame time doesn't move with the cue on.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/ready.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = (await import('./base.mjs')).officeBase('GAME_BASE', 'UI_KIT_BASE');
const SNAPS = process.env.SNAPS ?? 'snaps';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
mkdirSync(SNAPS, { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const out = [];
const check = (name, ok, detail = '') => {
  const l = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`;
  out.push(l);
  console.log(l);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A demo page that never reports presence and never hot-reloads mid-check. */
async function open(extra = '', { monitor = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument((monitor) => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
    if (monitor) localStorage.setItem('claude-office:laptop-app', 'monitor');
  }, monitor);
  await page.goto(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off&seed=7${extra}`, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 30_000 });
  await wait(1200);
  return { page, logs };
}

/** Who is ready (characters), the chip, and the toasts on show. */
const look = (page) =>
  page.evaluate(() => {
    const o = window.office;
    const people = o.director.list();
    return {
      ready: people.filter((e) => e.readyForYou).map((e) => e.data.displayName).sort(),
      chip: document.querySelector('.co-hud__ready .co-ready')?.textContent.trim() ?? '',
      toasts: [...document.querySelectorAll('.co-toast:not(.is-out)')].map((t) => ({ text: t.textContent.trim(), buttons: [...t.querySelectorAll('button')].map((b) => b.textContent.trim()) })),
    };
  });

const idOf = (page, name) => page.evaluate((n) => window.office.director.list().find((e) => e.data.displayName === n)?.data.sessionId, name);

try {
  // --- the cue, the chip, the toast; opening the chat clears it ----------------------------
  {
    const { page, logs } = await open();
    const start = await look(page);
    // The demo cast has one free (Claudine) and one asleep (Claudia), both unseen: no first-visit
    // baseline in the demo office, so they show the cue straight away.
    check('demo: the free and the asleep start ready', JSON.stringify(start.ready) === JSON.stringify(['Claudia', 'Claudine']), JSON.stringify(start.ready));
    check('HUD chip says "2 ready"', /^2\s*ready$/.test(start.chip), start.chip);

    const finished = await page.evaluate(() => window.officeDemo.finish('Klaus', 'All done! The flaky test is fixed.'));
    await wait(700);
    const after = await look(page);
    check('Klaus finishing makes him ready', finished && after.ready.includes('Klaus'), JSON.stringify(after.ready));
    check('HUD chip says "3 ready"', /^3\s*ready$/.test(after.chip), after.chip);
    const toast = after.toasts.find((t) => t.text.startsWith('Klaus finished'));
    check('toast "Klaus finished" with his last line', !!toast && toast.text.includes('The flaky test is fixed'), toast?.text);
    check('toast has Go and Open chat', !!toast && JSON.stringify(toast.buttons) === JSON.stringify(['Go', 'Open chat']), JSON.stringify(toast?.buttons));

    // The cue on him: his "Done!" card over his head, or (off screen) a mint edge face.
    const cue = await page.evaluate(() => {
      const o = window.office;
      const k = o.director.list().find((e) => e.data.displayName === 'Klaus');
      return { pill: k && !!document.querySelector('.co-tagstack.is-ready'), cards: [...document.querySelectorAll('.co-bang--ready')].filter((c) => !c.hidden).length, edges: document.querySelectorAll('.co-edge--ready').length };
    });
    check('a "Done!" card or a ready edge face shows', cue.pill && cue.cards + cue.edges >= 1, JSON.stringify(cue));

    // Roster: a "Ready for you" group right after needs-you.
    await page.evaluate(() => window.office.panels.open('roster'));
    await wait(400);
    const sections = await page.evaluate(() => [...document.querySelectorAll('.co-section--state')].map((h) => h.textContent.trim()));
    check('roster: "Ready for you (3)" right after needs-you', sections[0]?.startsWith('Needs you') && sections[1] === 'Ready for you (3)', JSON.stringify(sections));
    await page.evaluate(() => window.office.panels.close());
    await wait(300);

    // A close-up of the cue (for the PR).
    await page.evaluate(() => window.officeDemo.finish('Clod', 'Shipped. Want me to write the changelog entry too?'));
    await wait(2500);
    await page.screenshot({ path: `${SNAPS}/ready-office.png` });

    // Open chat (the toast's button) clears it.
    const clicked = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.co-toast:not(.is-out)')].find((x) => x.textContent.startsWith('Klaus finished'));
      const b = t && [...t.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open chat');
      b?.click();
      return !!b;
    });
    await wait(600);
    const opened = await page.evaluate(() => ({ panel: window.office.panels.openId, who: window.office.panels.employeeId }));
    const cleared = await look(page);
    const klausId = await idOf(page, 'Klaus');
    check('toast Open chat opens his chat', clicked && opened.panel === 'chat' && opened.who === klausId, JSON.stringify(opened));
    check('opening his chat clears his cue', !cleared.ready.includes('Klaus') && /^3\s*ready$/.test(cleared.chip), `${JSON.stringify(cleared.ready)} chip=${cleared.chip}`);
    const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('claude-office:ready-seen') ?? '{}')[id] ?? null, klausId);
    check('seen is saved in this browser', typeof saved === 'number', String(saved));

    // Finishing while you have their chat open: you saw it, so no cue and no toast.
    await page.evaluate(() => window.officeDemo.work('Klaus'));
    await wait(400);
    await page.evaluate(() => window.officeDemo.finish('Klaus', 'Done again, you watched.'));
    await wait(600);
    const watched = await look(page);
    check('finishing with their chat open: not ready', !watched.ready.includes('Klaus'), JSON.stringify(watched.ready));
    check('...and no new toast', !watched.toasts.some((t) => t.text.includes('Done again')), JSON.stringify(watched.toasts.map((t) => t.text)));
    await page.evaluate(() => window.office.panels.close());
    await wait(300);

    // Walking right past someone ready never clears it.
    const before = (await look(page)).ready;
    await page.evaluate(() => {
      const o = window.office;
      const e = o.director.list().find((x) => x.data.displayName === 'Claudine');
      o.manager.teleport(e.desk.approach.clone(), 0);
    });
    await wait(800);
    const passed = (await look(page)).ready;
    check('walking past never clears it', JSON.stringify(before) === JSON.stringify(passed), JSON.stringify(passed));

    // Help: the cue off hides everything; on brings it back. The chime switch is there too.
    await page.evaluate(() => window.office.panels.open('help'));
    await wait(400);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.co-choice--toggle')].map((l) => l.textContent.trim().split(/\s{2,}|(?<=[a-z])(?=[A-Z])/)[0]));
    check('Help has "Ready for you" and "Ready chime" switches', labels.some((l) => l.startsWith('Ready for you')) && labels.some((l) => l.startsWith('Ready chime')), JSON.stringify(labels));
    const toggle = (name) =>
      page.evaluate((n) => {
        const l = [...document.querySelectorAll('.co-choice--toggle')].find((x) => x.textContent.trim().startsWith(n));
        l.querySelector('input').click();
        return l.querySelector('input').checked;
      }, name);
    const off = await toggle('Ready for you');
    await wait(300);
    const hidden = await look(page);
    check('cue off: nobody ready, no chip', off === false && hidden.ready.length === 0 && hidden.chip === '', `${JSON.stringify(hidden.ready)} chip=${hidden.chip}`);
    const on = await toggle('Ready for you');
    await wait(300);
    const back = await look(page);
    check('cue on again: they come back', on === true && back.ready.length === before.length, JSON.stringify(back.ready));
    const chimeOff = await toggle('Ready chime');
    const stored = await page.evaluate(() => localStorage.getItem('claude-office:ready-chime'));
    check('chime switch saves', chimeOff === false && stored === '0', String(stored));
    await toggle('Ready chime');
    await page.evaluate(() => window.office.panels.close());
    check('no page errors', logs.length === 0, logs.join(' | '));
    await page.close();
  }

  // --- Q: needs-you first, then the ready ones, first finished first -----------------------
  {
    const { page, logs } = await open();
    await page.evaluate(() => window.officeDemo.finish('Klaus'));
    await wait(500);
    const expected = await page.evaluate(() => {
      const o = window.office;
      const people = o.director.list();
      const needs = people.filter((e) => e.handUp).sort((a, b) => a.data.stateSince - b.data.stateSince);
      // A sleeper finished 15 minutes before they nodded off (ready.ts).
      const done = (e) => (e.data.state === 'sleeping' ? e.data.stateSince - 15 * 60_000 : e.data.stateSince);
      const ready = people.filter((e) => e.readyForYou).sort((a, b) => done(a) - done(b));
      return [...needs, ...ready].map((e) => e.data.displayName);
    });
    const visited = [];
    for (let i = 0; i < expected.length + 1; i++) {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q' })));
      await wait(120);
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'q' })));
      await wait(300);
      visited.push(await page.evaluate(() => window.office.director.employees.get(window.office.panels.employeeId)?.data.displayName ?? null));
    }
    check('Q visits needs-you, then ready (first finished first), then round again', JSON.stringify(visited) === JSON.stringify([...expected, expected[0]]), `${JSON.stringify(visited)} want ${JSON.stringify(expected)}`);
    check('the ready ones are in Q after needs-you', expected.length >= 4, JSON.stringify(expected));
    // The chip goes to the ready ones only.
    await page.evaluate(() => window.office.panels.close());
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })));
    await wait(300);
    await page.click('.co-hud__ready .co-ready');
    await wait(400);
    const firstReady = await page.evaluate(() => window.office.director.employees.get(window.office.panels.employeeId)?.data.displayName ?? null);
    const readyOnly = expected.filter((n) => n !== expected[0]);
    check('the ready chip goes to the first ready one', firstReady === readyOnly[0], `${firstReady} want ${readyOnly[0]}`);
    check('no page errors (Q)', logs.length === 0, logs.join(' | '));
    await page.close();
  }

  // --- Monitor: ready right after needs-you; showing them clears it ------------------------
  {
    const { page, logs } = await open('&laptop=1', { monitor: true });
    await page.waitForSelector('.mon-row', { timeout: 15_000 });
    await wait(500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.mon-row')].map((r) => ({ state: r.dataset.state, ready: r.hasAttribute('data-ready'), name: r.querySelector('.mon-row__name')?.textContent ?? '' })));
    const kinds = rows.map((r) => (r.state === 'needs-you' ? 'N' : r.ready ? 'R' : 'o')).join('');
    check('Monitor lists needs-you, then ready, then the rest', /^N+R+o*$/.test(kinds), kinds);
    await page.screenshot({ path: `${SNAPS}/ready-monitor.png` });
    const pickedReady = await page.evaluate(() => {
      const r = document.querySelector('.mon-row[data-ready]');
      const id = r?.dataset.id;
      r?.click();
      return id;
    });
    await wait(600);
    const stillReady = await page.evaluate((id) => window.office.director.employees.get(id)?.readyForYou, pickedReady);
    check('Monitor showing them clears it', pickedReady && stillReady === false, String(stillReady));
    check('no page errors (Monitor)', logs.length === 0, logs.join(' | '));
    await page.close();
  }

  // --- A close-up of the cue on a character ------------------------------------------------
  {
    const { page, logs } = await open('&cam=closeup&focus=Claudine&cy=-35&cd=3.6&ch=0.35');
    await wait(2500);
    await page.screenshot({ path: `${SNAPS}/ready-closeup.png` });
    check('close-up screenshot taken', true, `${SNAPS}/ready-closeup.png`);
    check('no page errors (close-up)', logs.length === 0, logs.join(' | '));
    await page.close();
  }

  // --- Frame time: the same with the cue on as off ------------------------------------------
  {
    const { page } = await open();
    await page.evaluate(() => ['Klaus', 'Clod', 'Clyde'].forEach((n) => window.officeDemo.finish(n)));
    await wait(1500);
    const cdp = await page.target().createCDPSession();
    await cdp.send('Performance.enable');
    const measure = async () => {
      const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      const a = await metric();
      const frames = await page.evaluate(
        () =>
          new Promise((res) => {
            let n = 0;
            const t0 = performance.now();
            const tick = () => {
              n++;
              if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
              else res({ n, ms: performance.now() - t0 });
            };
            requestAnimationFrame(tick);
          }),
      );
      const b = await metric();
      return { frameMs: frames.ms / frames.n, scriptMsPerFrame: ((b.ScriptDuration - a.ScriptDuration) * 1000) / frames.n };
    };
    const on = await measure();
    // Flip the switch the way Help does.
    await page.evaluate(() => window.office.panels.open('help'));
    await wait(300);
    await page.evaluate(() => {
      const l = [...document.querySelectorAll('.co-choice--toggle')].find((x) => x.textContent.trim().startsWith('Ready for you'));
      const i = l.querySelector('input');
      if (i.checked) i.click();
      window.office.panels.close();
    });
    await wait(1000);
    const off = await measure();
    const fmt = (m) => `${m.frameMs.toFixed(2)} ms/frame, script ${m.scriptMsPerFrame.toFixed(2)} ms`;
    console.log(`  cue on:  ${fmt(on)}\n  cue off: ${fmt(off)}`);
    check('frame time with the cue on is within 10% (or 0.5 ms) of off', on.frameMs <= Math.max(off.frameMs * 1.1, off.frameMs + 0.5), `${fmt(on)} vs ${fmt(off)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
