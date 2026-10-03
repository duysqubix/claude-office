// Hot desk checks (run by scripts/ui-check.mjs), in the demo office (?demo=1, pretend shells):
// - an empty desk says "Use the computer"; E walks you behind its chair and the bezel grows out
//   of its monitor with one terminal (no tabs): your shell, in ~;
// - Esc reaches the shell; Ctrl+] stands you up, and the desk is hot: "Hot desk" on the
//   nameplate, a prompt on the monitor, and still "Use the computer";
// - sitting again finds the same shell; exit closes it (Shell closed, New shell); Shut down
//   closes it and stands you up;
// - a desk whose regular is on a break hands over; regulars never take a hot desk, nor yours;
// - a hire while you walk over or sit never gets your desk, even when it's the only one left.
// HOTDESK_LIVE=<a dev office's url> adds the same sit-down with a real shell there (never your
// game on 4777): an echo round-trips, the desk goes hot, the same shell comes back, Shut down.
//   GAME_BASE=http://127.0.0.1:4778 HOTDESK_LIVE=http://127.0.0.1:4793 node scripts/ui-check/hotdesk.mjs
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.GAME_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const LIVE = process.env.HOTDESK_LIVE ?? '';
/** Your own office: real shells are never opened there. */
const YOUR_GAME = '4777';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A page that never reports presence or hot-reloads, and never POSTs (live: only Shut down). */
async function open(url, { live = false } = {}) {
  if (!live && !url.includes('demo=1')) throw new Error('demo pages only');
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
    const write = req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/');
    // Live, the one write allowed is shutting down the shell this check opened.
    if (write && !(live && new URL(req.url()).pathname === '/api/desk/close')) return void req.abort();
    void req.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await wait(1500);
  return { page, logs };
}

const errors = (logs) => logs.filter((l) => l.startsWith('[pageerror]'));

/** Poll `fn` in the page every 200 ms until it returns something with `done` (or time runs out). */
async function until(page, fn, arg, ms) {
  let v;
  for (let t = 0; t < ms; t += 200) {
    v = await page.evaluate(fn, arg);
    if (v?.done) return v;
    await wait(200);
  }
  return v;
}

const pressE = (page) =>
  page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e' }));
  });

async function ctrl(page, code) {
  await page.keyboard.down('Control');
  await page.keyboard.press(code);
  await page.keyboard.up('Control');
}

/**
 * In the page: an empty indoor desk (no session, no regular, no shell), with its nameplate and
 * screen calls recorded in window.__desk.
 */
const EMPTY_DESK = () => {
  const o = window.office;
  const hd = o.director.hotDesks;
  const desk = o.world.desks.find((d) => hd.canSit(d.index) && !o.regulars.holderOf(d.index) && !hd.isHot(d.index) && o.world.interactables.find((i) => i.id === `desk:${d.index}`)?.label === 'Empty desk');
  if (!desk) return null;
  const rec = (window.__desk = { index: desk.index, plate: null, screen: null });
  const plate = desk.setNameplate;
  const screen = desk.setScreen;
  desk.setNameplate = (name, sub) => {
    rec.plate = [name, sub ?? ''];
    plate(name, sub);
  };
  desk.setScreen = (state, lines, app) => {
    rec.screen = [state, lines ?? null];
    screen(state, lines, app);
  };
  return desk.index;
};

/** Stand at desk `i`'s side, facing its chair, the way you walk up to one. */
const STAND_AT = (i) => {
  const o = window.office;
  const d = o.world.desks[i];
  const yaw = Math.atan2(d.seat.x - d.approach.x, d.seat.z - d.approach.z);
  o.manager.teleport(d.approach.clone().setY(0), yaw);
  o.manager.face(yaw);
  o.camera.yaw = yaw + Math.PI;
};

const prompt = (page) => page.evaluate(() => (document.querySelector('.co-hud__prompt:not([hidden]) .co-prompt')?.textContent ?? '').replace(/^E/, '').trim());

/** The bezel (if open), you, and desk `i` as the director sees it. */
const look = (page, i) =>
  page.evaluate((i) => {
    const o = window.office;
    const m = document.querySelector('.term-modal');
    const d = o.world.desks[i];
    const behind = d.seat.clone().setY(0).add({ x: -Math.sin(d.yaw) * 0.95, y: 0, z: -Math.cos(d.yaw) * 0.95 });
    const visible = (b) => !b.hidden && b.getBoundingClientRect().width > 0;
    return {
      open: !!m && !m.classList.contains('out'),
      tabs: !!m?.querySelector('.term-tabs'),
      text: [...(m?.querySelectorAll('.term-screen') ?? [])].filter((s) => !s.hidden).map((s) => s.querySelector('.xterm-rows')?.textContent ?? '').join('|'),
      chin: (m?.querySelector('.term-chin')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      buttons: [...(m?.querySelectorAll('button') ?? [])].filter(visible).map((b) => b.textContent.trim()),
      focus: document.activeElement?.classList.contains('xterm-helper-textarea') ?? false,
      behind: +Math.hypot(o.manager.position.x - behind.x, o.manager.position.z - behind.z).toFixed(2),
      yours: o.director.hotDesks.yours,
      hot: [...o.director.hotDesks.hot],
      plate: window.__desk?.index === i ? window.__desk.plate : null,
      screen: window.__desk?.index === i ? window.__desk.screen : null,
    };
  }, i);

const clickButton = (page, label) => page.evaluate((label) => [...document.querySelectorAll('.term-modal button')].find((b) => b.textContent.trim() === label)?.click(), label);

/**
 * Sit at desk `i` with E from its side; the bezel once it's open (or, if it never opens, as it
 * is). `justAfter` is read in the page a moment after E (`early`).
 */
async function sitDown(page, i, justAfter) {
  await page.evaluate(STAND_AT, i);
  await wait(500);
  const said = await prompt(page);
  await pressE(page);
  await wait(300);
  const early = justAfter ? await page.evaluate(justAfter) : undefined;
  await until(page, () => ({ done: !!document.querySelector('.term-modal') }), null, 15_000);
  await wait(1000);
  return { said, m: await look(page, i), early };
}

try {
  // ------------------------------------------------------------------ sit, stand, sit again, exit, Shut down
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off`);
    const D = await page.evaluate(EMPTY_DESK);
    check('setup: an empty desk indoors', D !== null, String(D));
    let { said, m } = await sitDown(page, D);
    check('an empty desk says "Use the computer"', said === 'Use the computer', said);
    check('E: you walk behind its chair and the bezel opens with one terminal (no tabs)', m.open && !m.tabs && m.behind < 0.35, JSON.stringify({ open: m.open, tabs: m.tabs, behind: m.behind }));
    check('inside: your shell in ~, live and focused, and the chin says so', /you@office/.test(m.text) && /~/.test(m.chin) && m.focus, JSON.stringify({ text: m.text.slice(0, 90), chin: m.chin }));
    check('the desk is yours while you sit there', m.yours === D && m.hot.includes(D), JSON.stringify({ yours: m.yours, hot: m.hot }));
    await page.keyboard.type('pwd', { delay: 30 });
    await page.keyboard.press('Enter');
    await wait(300);
    m = await look(page, D);
    check('typing runs commands in your home folder', m.text.includes('/Users/you'), m.text.slice(-120));
    await page.keyboard.press('Escape');
    await wait(400);
    m = await look(page, D);
    check('Esc goes to the shell: you stay seated', m.open && /Esc goes to the shell/.test(m.chin), m.chin);
    await ctrl(page, 'BracketRight');
    await wait(900);
    m = await look(page, D);
    check('Ctrl+] stands you up: the shell keeps running, the desk is hot', !m.open && m.yours === null && m.hot.includes(D), JSON.stringify({ open: m.open, yours: m.yours, hot: m.hot }));
    check('the hot desk: "Hot desk" on its nameplate, a prompt and cursor on its monitor', m.plate?.[0] === 'Hot desk' && m.screen?.[0] === 'working' && /%/.test((m.screen?.[1] ?? []).join('\n')), JSON.stringify({ plate: m.plate, screen: m.screen }));
    ({ said, m } = await sitDown(page, D));
    check('the hot desk still says "Use the computer", and sitting again finds the same shell', said === 'Use the computer' && m.open && m.text.includes('/Users/you'), JSON.stringify({ said, text: m.text.slice(-120) }));
    await page.keyboard.type('exit', { delay: 30 });
    await page.keyboard.press('Enter');
    await wait(700);
    m = await look(page, D);
    check('exit closes the shell: "Shell closed", New shell offered, the desk not hot', m.open && /Shell closed/.test(m.chin) && m.buttons.includes('New shell') && !m.hot.includes(D), JSON.stringify({ chin: m.chin, buttons: m.buttons, hot: m.hot }));
    await clickButton(page, 'New shell');
    await wait(800);
    m = await look(page, D);
    // The old shell's lines stay above, as on the Shell tab; the fresh prompt comes after the note.
    const fresh = m.text.split('New shell opens another.').pop() ?? '';
    check('New shell: a fresh prompt, and the desk is hot again', m.text.includes('New shell opens another.') && /you@office/.test(fresh) && !fresh.includes('/Users/you') && m.hot.includes(D), JSON.stringify({ fresh: fresh.slice(-100), hot: m.hot }));
    await clickButton(page, 'Shut down');
    await wait(1000);
    m = await look(page, D);
    check('Shut down closes the shell and stands you up; the desk is empty again', !m.open && m.yours === null && !m.hot.includes(D) && m.plate?.[0] === '' && m.screen?.[0] === 'off', JSON.stringify({ open: m.open, hot: m.hot, plate: m.plate, screen: m.screen }));
    check('no page errors (sit, stand, sit again)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ hires never get your desk
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off`);
    const D = await page.evaluate(EMPTY_DESK);
    await page.evaluate(STAND_AT, D);
    await wait(500);
    await pressE(page);
    await wait(150);
    // On your way to the chair, a newcomer whose remembered desk is this one walks in.
    const walking = await page.evaluate((D) => {
      const o = window.office;
      const t = o.store.employees[0];
      const n = { ...t, sessionId: 'probe-walk', displayName: 'Walker', state: 'idle', ask: undefined, interns: [] };
      o.director.desks.set(n.sessionId, D);
      window.__roster = [...o.store.employees, n];
      o.director.sync(window.__roster);
      return { yours: o.director.hotDesks.yours, theirs: o.director.employees.get('probe-walk')?.desk.index };
    }, D);
    check('while you walk over, a hire who sat there before gets another desk', walking.yours === D && walking.theirs !== undefined && walking.theirs !== D, JSON.stringify({ D, ...walking }));
    await page.waitForSelector('.term-modal', { timeout: 15_000 });
    await wait(800);
    // Seated: fill every other desk with sessions, then one more arrives.
    const full = await page.evaluate((D) => {
      const o = window.office;
      const t = o.store.employees[0];
      const before = o.world.desks.length;
      let n = 0;
      const next = () => ({ ...t, sessionId: `probe-fill-${++n}`, displayName: `Filler ${n}`, state: 'idle', ask: undefined, interns: [] });
      const taken = (i) => o.director.list().some((e) => e.desk.index === i && e.phase !== 'leaving' && e.phase !== 'gone');
      const free = () => o.world.desks.filter((d) => d.index !== D && !taken(d.index));
      while (free().length && n < 200) {
        window.__roster.push(next());
        o.director.sync(window.__roster);
      }
      const last = next();
      o.director.desks.set(last.sessionId, D);
      window.__roster.push(last);
      o.director.sync(window.__roster);
      return {
        filled: n - 1,
        lastAt: o.director.employees.get(last.sessionId)?.desk.index,
        desks: [before, o.world.desks.length],
        atYours: o.director.list().filter((e) => e.desk.index === D).map((e) => e.data.displayName),
        open: !!document.querySelector('.term-modal'),
      };
    }, D);
    check('every other desk taken: the next hire never gets yours (the office grows instead)', full.open && full.lastAt !== D && full.desks[1] > full.desks[0] && full.atYours.length === 0, JSON.stringify(full));
    check('no page errors (hires)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ a regular on a break hands over
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=8`);
    const reg = await page.evaluate(() => {
      const o = window.office;
      const r = o.regulars.crew().find((x) => x.seated && x.desk.index <= 99);
      window.__r = r;
      return r ? { name: r.name, desk: r.desk.index } : null;
    });
    check('setup: a regular at their desk', !!reg, JSON.stringify(reg));
    await page.evaluate(STAND_AT, reg.desk);
    await wait(500);
    const seatedSays = await prompt(page);
    check('a desk whose regular sits there never says "Use the computer"', seatedSays !== 'Use the computer', seatedSays);
    // Off to the coffee machine (or, with every break spot busy, the water cooler).
    const broke = await page.evaluate(() => {
      const o = window.office;
      const r = window.__r;
      return o.regulars.startBreak(r) || r.takeBreak(null, o.regulars.hangs[0], 30);
    });
    // Gone from the desk, and far enough off that E there isn't a chat with them.
    const away = await until(
      page,
      () => {
        const r = window.__r;
        const far = Math.hypot(r.position.x - r.desk.approach.x, r.position.z - r.desk.approach.z);
        return { done: !r.atDesk && r.onBreak && far > 3, phase: r.phase, far: +far.toFixed(1) };
      },
      null,
      15_000,
    );
    check('setup: they went on a break', broke && !!away?.done, JSON.stringify(away));
    const D = reg.desk;
    await page.evaluate((D) => {
      // Record that desk's nameplate and screen from here on.
      const o = window.office;
      const desk = o.world.desks[D];
      const rec = (window.__desk = { index: D, plate: null, screen: null });
      const plate = desk.setNameplate;
      const screen = desk.setScreen;
      desk.setNameplate = (name, sub) => {
        rec.plate = [name, sub ?? ''];
        plate(name, sub);
      };
      desk.setScreen = (state, lines, app) => {
        rec.screen = [state, lines ?? null];
        screen(state, lines, app);
      };
    }, D);
    const { said, m, early: gave } = await sitDown(page, D, () => ({ yielded: window.__r.yielded, holds: window.__r.holdsDesk, line: window.__r.quipping ? window.__r.quipText : '' }));
    check('their desk counts as empty: "Use the computer", and E sits you down', said === 'Use the computer' && m.open && m.yours === D, JSON.stringify({ said, open: m.open, yours: m.yours }));
    check('sitting down makes them give it up, with a word', gave.yielded && !gave.holds && gave.line.length > 0, JSON.stringify(gave));
    // While you sit, and once it's hot: regulars never pick it, however many walk in.
    const picks = async () =>
      page.evaluate((D) => {
        const o = window.office;
        const chosen = Array.from({ length: 40 }, () => o.regulars.freeDesk()?.index);
        for (let k = 0; k < 4; k++) o.regulars.spawn(true);
        return { picked: chosen.filter((i) => i === D).length, holders: o.regulars.crew().filter((r) => r.holdsDesk && r.desk.index === D).map((r) => r.name) };
      }, D);
    const sitting = await picks();
    await ctrl(page, 'BracketRight');
    await wait(900);
    const hot = await picks();
    const after = await look(page, D);
    check('regulars never take the desk you sit at, nor a hot desk', sitting.picked === 0 && sitting.holders.length === 0 && hot.picked === 0 && hot.holders.length === 0 && after.hot.includes(D), JSON.stringify({ sitting, hot, hotDesks: after.hot }));
    check('…and it shows the hot desk, not a regular\'s', after.plate?.[0] === 'Hot desk', JSON.stringify(after.plate));
    check('no page errors (hand-over)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ live: a real shell (opt-in)
  if (!LIVE) console.log('  (HOTDESK_LIVE unset: the real-shell checks are skipped)');
  else if (new URL(LIVE).port === YOUR_GAME) check('the real-shell checks never run against your game (4777)', false, LIVE);
  else {
    const port = new URL(LIVE).port;
    const { page, logs } = await open(`${LIVE}/?debug=1&seed=11&regulars=off`, { live: true });
    const D = await until(page, () => (window.office.director.hasRoster ? { done: true } : null), null, 10_000).then(() => page.evaluate(EMPTY_DESK));
    const name = `office-desk${port}-${String(D).padStart(2, '0')}`;
    const tmuxHas = () => {
      try {
        execFileSync('tmux', ['has-session', '-t', `=${name}`], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };
    try {
      check('live: an empty desk with no shell', D !== null && !tmuxHas(), `${D} (${name})`);
      let { said, m } = await sitDown(page, D);
      await until(page, () => ({ done: /\S/.test(document.querySelector('.term-modal .xterm-rows')?.textContent ?? '') }), null, 8000);
      await wait(700);
      const marker = randomUUID().slice(0, 8);
      await page.keyboard.type(`echo $((6*7))-${marker}`, { delay: 20 });
      await page.keyboard.press('Enter');
      const echoed = await until(page, (mk) => ({ done: (document.querySelector('.term-modal .xterm-rows')?.textContent ?? '').includes(`42-${mk}`) }), marker, 8000);
      check('live: "Use the computer", E, and an echo round-trips in your shell', said === 'Use the computer' && m.open && !!echoed?.done && tmuxHas(), JSON.stringify({ said, open: m.open, session: tmuxHas() }));
      await ctrl(page, 'BracketRight');
      const hot = await until(page, (D) => ({ done: window.office.director.hotDesks.isHot(D) && window.__desk?.plate?.[0] === 'Hot desk', hot: [...window.office.director.hotDesks.hot] }), D, 8000);
      check('live: standing up, the office pushes the desk as hot and it shows "Hot desk"', !!hot?.done && tmuxHas(), JSON.stringify(hot));
      ({ said, m } = await sitDown(page, D));
      const same = await until(page, (mk) => ({ done: (document.querySelector('.term-modal .xterm-rows')?.textContent ?? '').includes(`42-${mk}`) }), marker, 6000);
      check('live: sitting again, the same shell', m.open && !!same?.done, m.text.slice(-120));
      await clickButton(page, 'Shut down');
      const gone = await until(page, (D) => ({ done: !document.querySelector('.term-modal') && !window.office.director.hotDesks.isHot(D) }), D, 8000);
      check('live: Shut down ends the shell and stands you up', !!gone?.done && !tmuxHas(), JSON.stringify({ gone, session: tmuxHas() }));
      check('no page errors (live)', !errors(logs).length, errors(logs).join(' | '));
    } finally {
      // Whatever happened, the shell this opened is closed (the desk had none to start with).
      if (D !== null && tmuxHas()) execFileSync('tmux', ['kill-session', '-t', `=${name}`], { stdio: 'ignore' });
      await page.close();
    }
  }
} catch (err) {
  check('hot desk checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
