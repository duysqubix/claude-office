// Desk and keyboard checks (run by scripts/ui-check.mjs), in the demo office (?demo=1):
// - nobody ever shares a desk: a session that comes back while walking out finds its desk
//   handed to another session (they get a fresh desk) or to a regular (who makes room);
// - nobody hangs getting up: standing up finishes even when someone else has the chair;
// - the keys belong to the game unless you're typing in a text field (a clicked Help
//   checkbox or radio doesn't swallow W/A/S/D/R).
// The roster is driven straight through the director with crafted rosters (the frozen demo,
// quiet=1, never sends its own), then the office is watched every 100 ms.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/desks.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.GAME_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A demo page that never reports presence, never hot-reloads and never POSTs. */
async function open(url) {
  if (!url.includes('demo=1')) throw new Error('demo pages only');
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
    // The tree is edited live: no hot reload may restart the office halfway through a check.
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/')) return void req.abort();
    void req.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await wait(1500);
  // The watch: every 100 ms, any desk with two people at it (getting in, sitting, getting
  // out), and the longest anyone has spent standing up.
  await page.evaluate(() => {
    const o = window.office;
    const W = (window.__watch = { shared: [], standing: new Map(), worstStand: 0 });
    window.setInterval(() => {
      const people = [...o.director.list(), ...o.regulars.crew()];
      const at = new Map();
      for (const c of people) {
        if (!c.atDesk) continue;
        at.set(c.desk.index, [...(at.get(c.desk.index) ?? []), c.name ?? c.data.displayName]);
      }
      for (const [desk, who] of at) {
        const k = `desk ${desk}: ${who.join(' + ')}`;
        if (who.length > 1 && !W.shared.includes(k)) W.shared.push(k);
      }
      const now = performance.now();
      for (const c of people) {
        const id = c.data.sessionId;
        if (c.phase !== 'standing-up') W.standing.delete(id);
        else {
          if (!W.standing.has(id)) W.standing.set(id, now);
          W.worstStand = Math.max(W.worstStand, (now - W.standing.get(id)) / 1000);
        }
      }
    }, 100);
  });
  return { page, logs };
}

const watch = (page) => page.evaluate(() => ({ shared: window.__watch.shared, worstStand: +window.__watch.worstStand.toFixed(2) }));
const errors = (logs) => logs.filter((l) => l.startsWith('[pageerror]'));

/** Poll `fn` in the page every 250 ms until it returns something truthy (or time runs out). */
async function until(page, fn, arg, ms) {
  let v;
  for (let t = 0; t < ms; t += 250) {
    v = await page.evaluate(fn, arg);
    if (v?.done) return v;
    await wait(250);
  }
  return v;
}

/**
 * In the page: `who` (a seated session) clocks out and is walking to the door. Returns their
 * id, desk and the roster to put them back with.
 */
const SEND_HOME = async () => {
  const o = window.office;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const roster = o.store.employees.map((e) => ({ ...e }));
  const x = o.director.list().find((e) => e.seated && e.data.hosted) ?? o.director.list().find((e) => e.seated);
  window.__x = x;
  window.__roster = roster;
  o.director.sync(roster.filter((e) => e.sessionId !== x.data.sessionId));
  for (let i = 0; i < 60 && x.phase !== 'leaving'; i++) await sleep(100);
  return { name: x.data.displayName, desk: x.desk.index, phase: x.phase };
};

try {
  // ------------------------------------------------------------------ back to a desk another session got
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off`);
    const out = await page.evaluate(SEND_HOME);
    const setup = await page.evaluate((desk) => {
      const o = window.office;
      const x = window.__x;
      const away = window.__roster.filter((e) => e.sessionId !== x.data.sessionId);
      // A newcomer is handed that desk while they walk out (it's remembered as theirs).
      const n = { ...x.data, sessionId: 'probe-newcomer', displayName: 'Newcomer', interns: [] };
      o.director.desks.set(n.sessionId, desk);
      o.director.sync([...away, n]);
      // ...and before they reach the door, their session comes back.
      o.director.sync([...window.__roster, n]);
      return { newcomerDesk: o.director.employees.get('probe-newcomer')?.desk.index, back: x.phase, nowAt: x.desk.index };
    }, out.desk);
    check('setup: they were walking out, and the newcomer got their desk', out.phase === 'leaving' && setup.newcomerDesk === out.desk, JSON.stringify({ out, setup }));
    check('coming back to a desk another session has: a fresh desk, walking to it', setup.back === 'entering' && setup.nowAt !== out.desk, JSON.stringify(setup));
    const end = await until(
      page,
      (desk) => {
        const o = window.office;
        const x = window.__x;
        const n = o.director.employees.get('probe-newcomer');
        return { done: x.seated && !!n?.seated, x: [x.phase, x.desk.index], newcomer: [n?.phase, n?.desk.index], desk };
      },
      out.desk,
      30_000,
    );
    check('both end up seated, each at their own desk', !!end?.done && end.x[1] !== out.desk && end.newcomer[1] === out.desk, JSON.stringify(end));
    const w = await watch(page);
    check('nobody shared a desk', w.shared.length === 0, w.shared.join(' | '));
    check('nobody spent more than 5 s standing up', w.worstStand <= 5, `worst ${w.worstStand} s`);
    check('no page errors (session vs session)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ back to a desk a regular took
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively`);
    const out = await page.evaluate(SEND_HOME);
    const setup = await page.evaluate((desk) => {
      const o = window.office;
      const reg = o.regulars;
      // A regular sits down at the desk they left (a leaver's desk counts as free).
      reg.freeDesk = () => o.world.desks[desk];
      const spawned = reg.spawn(true);
      delete reg.freeDesk;
      const r = reg.crew().find((c) => c.desk.index === desk);
      window.__r = r;
      // Their session comes back.
      o.director.sync(window.__roster);
      return { spawned, regular: r?.name, regularPhase: r?.phase, back: window.__x.phase, nowAt: window.__x.desk.index };
    }, out.desk);
    check('setup: a regular sat down at their desk while they walked out', setup.spawned && !!setup.regular, JSON.stringify({ out, setup }));
    check('coming back to a desk a regular has: same desk, walking back', setup.back === 'entering' && setup.nowAt === out.desk, JSON.stringify(setup));
    const end = await until(
      page,
      (desk) => {
        const x = window.__x;
        const r = window.__r;
        return { done: x.seated && !r?.holdsDesk, x: [x.phase, x.desk.index], regular: [r?.name, r?.phase, r?.plan], desk };
      },
      out.desk,
      30_000,
    );
    check('the regular makes room ("All yours!") and they sit back down at their desk', !!end?.done && end.x[1] === out.desk && end.regular[2] === 'yield', JSON.stringify(end));
    const w = await watch(page);
    check('nobody shared a desk (with a regular)', w.shared.length === 0, w.shared.join(' | '));
    check('nobody spent more than 5 s standing up (with a regular)', w.worstStand <= 5, `worst ${w.worstStand} s`);
    check('no page errors (session vs regular)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ standing up next to a chair someone else has
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off`);
    const pinned = await page.evaluate(() => {
      const o = window.office;
      const x = o.director.list().find((e) => e.seated);
      window.__x = x;
      // Someone else takes the chair and keeps it pushed in (a regular scooting in, say).
      const other = { name: 'someone else' };
      window.__other = other;
      x.chair.release(x);
      const theirs = x.chair.drive(other, 0);
      const mine = x.chair.drive(x, 0.45);
      o.director.sync(o.store.employees.filter((e) => e.sessionId !== x.data.sessionId));
      return { theirs, mine, phase: x.phase };
    });
    check('a chair has one driver: while someone else has it, nobody else can move it', pinned.theirs && !pinned.mine && pinned.phase === 'standing-up', JSON.stringify(pinned));
    const t0 = Date.now();
    const up = await until(page, () => ({ done: window.__x.phase !== 'standing-up', phase: window.__x.phase }), null, 8000);
    const took = (Date.now() - t0) / 1000;
    check('standing up still finishes (they get up anyway, then head out)', !!up?.done && up.phase === 'leaving' && took < 5, `${up?.phase} after ${took.toFixed(1)} s`);
    await page.evaluate(() => window.__x.chair.release(window.__other));
    check('no page errors (pinned chair)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ a busy office for a minute
  {
    const { page, logs } = await open(`${BASE}/?demo=1&debug=1&seed=7&regulars=lively`);
    await wait(60_000);
    const w = await watch(page);
    const churn = await page.evaluate(() => ({ sessions: window.office.director.list().length, regulars: window.office.regulars.crew().length }));
    check('a busy minute (arrivals, departures, breaks): nobody shared a desk', w.shared.length === 0, w.shared.join(' | ') || JSON.stringify(churn));
    check('a busy minute: nobody spent more than 5 s standing up', w.worstStand <= 5, `worst ${w.worstStand} s`);
    check('no page errors (busy minute)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ keys after clicking a Help checkbox or radio
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&panel=help`);
    const pos = () => page.evaluate(() => window.office.manager.position.toArray().map((v) => +v.toFixed(2)));
    const moved = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    const hold = async (code, ms = 700) => {
      await page.keyboard.down(code);
      await wait(ms);
      await page.keyboard.up(code);
      await wait(250);
    };
    await page.waitForSelector('.co-regulars input[type=radio]', { timeout: 5000 });
    const box = await page.evaluateHandle(() => [...document.querySelectorAll('label.co-choice--toggle')].find((l) => l.textContent.includes('Thought bubbles'))?.querySelector('input'));
    await box.click();
    const focused = await page.evaluate(() => document.activeElement?.type ?? null);
    const before = await pos();
    await hold('KeyW');
    const afterW = await pos();
    const panel = await page.evaluate(() => window.office.panels.openId);
    check('after clicking a Help checkbox, W walks (and the panel gets out of the way)', focused === 'checkbox' && moved(before, afterW) > 0.3 && panel === null, JSON.stringify({ focused, moved: +moved(before, afterW).toFixed(2), panel }));

    // Space on a focused checkbox still toggles it (the panel keeps Space for itself).
    await page.evaluate(() => window.office.panels.open('help'));
    await wait(400);
    const box2 = await page.evaluateHandle(() => [...document.querySelectorAll('label.co-choice--toggle')].find((l) => l.textContent.includes('Thought bubbles'))?.querySelector('input'));
    await box2.click();
    const was = await page.evaluate((b) => b.checked, box2);
    await page.keyboard.press('Space');
    await wait(200);
    const now = await page.evaluate((b) => b.checked, box2);
    check('Space still toggles a focused checkbox', now === !was, `${was} → ${now}`);

    // A radio: D walks and the preset stays; R still opens the roster.
    const radio = await page.$('.co-regulars input[value=some]');
    await radio.click();
    const preset = await page.evaluate(() => document.querySelector('.co-regulars input:checked')?.value);
    const b2 = await pos();
    await hold('KeyD');
    const a2 = await pos();
    const presetAfter = await page.evaluate(() => window.office.regulars.density);
    check('after clicking a Help radio, D walks and the preset stays put', preset === 'some' && moved(b2, a2) > 0.3 && presetAfter === 'some', JSON.stringify({ preset, presetAfter, moved: +moved(b2, a2).toFixed(2) }));
    await page.evaluate(() => window.office.panels.open('help'));
    await wait(400);
    await (await page.$('.co-regulars input[value=lively]')).click();
    await page.keyboard.press('KeyR');
    await wait(300);
    check('after clicking a Help radio, R opens the roster', (await page.evaluate(() => window.office.panels.openId)) === 'roster');

    // Text fields still keep the keys: typing "wasd" types it and nobody moves.
    await page.evaluate(() => window.office.panels.open('hire'));
    await wait(500);
    const field = await page.$('.co-panel input[type=search], .co-panel input[type=text], .co-panel input:not([type])');
    await field.click();
    const b3 = await pos();
    await page.keyboard.type('wasd', { delay: 60 });
    await wait(300);
    const a3 = await pos();
    const typed = await page.evaluate((f) => f.value, field);
    check('typing in a text field types, and the manager stays put', typed.includes('wasd') && moved(b3, a3) < 0.05, JSON.stringify({ typed, moved: +moved(b3, a3).toFixed(2) }));
    check('no page errors (keys)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }
} catch (err) {
  check('desk checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
