// Regulars checks (run by scripts/ui-check.mjs): NPC coworkers fill free desks in the demo
// office, never show up in the HUD counts, roster, toasts, edge faces, Q or panels, answer E
// with a quip, give a desk up to a session ("All yours!") instead of the office growing, keep
// the door open, and follow the Help panel's Off / Some / Lively switch.
// GAME_LIVE=1 also loads the live office read-only (presence never sent, every POST blocked).
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/regulars.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.GAME_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const SNAPS = process.env.SNAPS ?? 'snaps';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
mkdirSync(SNAPS, { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A page that never reports presence and (live) never POSTs. */
async function open(url, { live = false } = {}) {
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
  const posts = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/')) {
      posts.push(`${req.method()} ${req.url()}`);
      if (live) return void req.abort();
    }
    void req.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await wait(1500);
  return { page, logs, posts };
}

const pressE = (page) =>
  page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e' }));
  });

/** Everything the "sessions only" checks look at, in one go. */
const tally = (page) =>
  page.evaluate(() => {
    const o = window.office;
    // Everyone (the receptionist too) for the "never a session" checks; the crowd for counts.
    const regs = o.regulars.list();
    const ids = new Set(regs.map((r) => r.data.sessionId));
    const names = new Set(regs.map((r) => r.name));
    const sessions = o.director.list().filter((e) => e.phase !== 'leaving' && e.phase !== 'gone').length;
    return {
      regulars: o.regulars.crew().length,
      receptionist: o.regulars.frontDesk?.phase ?? null,
      sessions,
      staff: Number(/(\d+) staff/.exec(document.querySelector('.co-hud__badge')?.textContent ?? '')?.[1] ?? -1),
      statsStaff: o.director.stats().staff,
      inEmployees: [...o.director.employees.keys()].filter((id) => ids.has(id)).length,
      inStore: o.store.employees.filter((e) => ids.has(e.sessionId) || names.has(e.displayName)).length,
      edgeFaces: [...document.querySelectorAll('.co-edge')].map((b) => b.getAttribute('aria-label')).filter((l) => [...names].some((n) => l?.includes(n))).length,
      toasts: [...document.querySelectorAll('.co-toast')].map((t) => t.textContent).filter((t) => [...names].some((n) => t.includes(n))),
      lanyards: { sessions: o.director.list().every((e) => e.rig.looks.lanyard), regulars: regs.every((r) => !r.rig.looks.lanyard) },
    };
  });

try {
  // ------------------------------------------------------------------ demo office, Lively
  const { page, logs, posts } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively`);
  const t0 = await tally(page);
  check('Lively: regulars at work (at most 14)', t0.regulars > 0 && t0.regulars <= 14, `${t0.regulars} regulars, ${t0.sessions} sessions`);
  check('HUD staff counts sessions only', t0.staff === t0.sessions && t0.statsStaff === t0.sessions, `HUD ${t0.staff}, stats ${t0.statsStaff}, sessions ${t0.sessions}`);
  check('regulars are not in the director roster or the store', t0.inEmployees === 0 && t0.inStore === 0, JSON.stringify(t0));
  check('Claude sessions wear the lanyard, regulars never do', t0.lanyards.sessions && t0.lanyards.regulars, JSON.stringify(t0.lanyards));

  const desks = await page.evaluate(() => {
    const o = window.office;
    const r = o.regulars.crew().find((x) => x.seated);
    return { index: r?.desk.index, key: r ? o.director.deskKeys.get(r.desk.index) : null, screen: r?.screen };
  });
  check("a regular's desk shows their nameplate and screen", desks.key === 'regular' && desks.screen === 'working', JSON.stringify(desks));

  // Their labels: a quiet name pill, no state badge, not a button.
  const pill = await page.evaluate(() => {
    const o = window.office;
    const r = o.regulars.crew().find((x) => x.seated);
    const a = r.desk.approach;
    o.manager.teleport(a.clone().set(a.x + (a.x - r.desk.seat.x) * 0.3, 0, a.z + (a.z - r.desk.seat.z) * 0.6), 0);
    return r.name;
  });
  await wait(900);
  const pillState = await page.evaluate((name) => {
    const p = [...document.querySelectorAll('.co-pill--regular')].find((x) => x.textContent === name && !x.hidden);
    return p ? { badge: !!p.querySelector('svg'), events: getComputedStyle(p).pointerEvents, tag: p.tagName } : null;
  }, pill);
  check('up close, a regular has a muted name pill (no badge, not clickable)', !!pillState && !pillState.badge && pillState.events === 'none' && pillState.tag !== 'BUTTON', JSON.stringify(pillState));

  // E next to a regular: a quip, never a panel, never the server.
  const e = await page.evaluate(() => {
    const o = window.office;
    const r = o.regulars.crew().find((x) => x.seated);
    const a = r.desk.approach;
    const spot = a.clone().set(a.x + (a.x - r.desk.seat.x) * 0.3, 0, a.z + (a.z - r.desk.seat.z) * 0.6);
    const yaw = Math.atan2(r.position.x - spot.x, r.position.z - spot.z);
    o.manager.teleport(spot, yaw);
    o.manager.face(yaw);
    o.camera.yaw = yaw + Math.PI;
    return r.name;
  });
  await wait(700);
  const prompt = await page.evaluate(() => document.querySelector('.co-prompt')?.textContent ?? '');
  check('the E prompt offers a chat with the regular', prompt.includes(`Chat with ${e}`), prompt);
  const postsBefore = posts.length;
  await pressE(page);
  await wait(400);
  const said = await page.evaluate((name) => {
    const r = window.office.regulars.list().find((x) => x.name === name);
    return { quip: r.quipping ? r.quipText : '', panel: window.office.panels.openId, bubble: [...document.querySelectorAll('.co-bubble')].some((b) => !b.hidden && b.textContent === r.quipText) };
  }, e);
  check('E: they say something in a bubble', !!said.quip && said.bubble, JSON.stringify(said));
  check('E: no panel opens and nothing is sent', said.panel === null && posts.length === postsBefore, `${said.panel} / ${posts.slice(postsBefore).join(', ')}`);
  await page.screenshot({ path: `${SNAPS}/npc-check-e.png` });

  // Q never goes to a regular.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q' })));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'q' })));
  await wait(500);
  const q = await page.evaluate(() => {
    const o = window.office;
    const id = o.panels.openId ? (document.querySelector('.co-panel--person .co-panel__title')?.textContent ?? '') : '';
    return { open: o.panels.openId, title: id, regular: o.regulars.list().some((r) => r.name === id) };
  });
  check('Q goes to a session, never a regular', !!q.open && !q.regular, JSON.stringify(q));
  await page.evaluate(() => {
    const o = window.office;
    o.panels.close();
    o.manager.cancelWalk();
  });

  // A regular walks in: no toast, the door opens for them.
  const toastsBefore = await page.evaluate(() => document.querySelectorAll('.co-toast').length);
  await page.evaluate(() => window.office.regulars.spawn(false));
  let door = { near: false, open: false };
  for (let i = 0; i < 40 && !door.near; i++) {
    await wait(150);
    door = await page.evaluate(() => {
      const o = window.office;
      const d = o.director.doorPosition;
      const near = o.regulars.crew().some((r) => r.phase === 'entering' && Math.hypot(r.position.x - d.x, r.position.z - d.z) < 2.2);
      return { near, open: o.director.doorOpen === true };
    });
  }
  check('a regular at the front door keeps it open', door.near && door.open, JSON.stringify(door));
  const toastsAfter = await page.evaluate(() => document.querySelectorAll('.co-toast').length);
  check('a regular walking in makes no toast', toastsAfter <= toastsBefore, `${toastsBefore} → ${toastsAfter}`);

  // Bump one: they stagger and say something; the "!" pops.
  const bump = await page.evaluate(async () => {
    const o = window.office;
    const r = o.regulars.crew().find((x) => x.seated && !x.quipping) ?? o.regulars.crew()[0];
    const before = o.regulars.bumpables().includes(r);
    r.bump(r.position.clone().set(1, 0, 0), 0.8);
    await new Promise((res) => setTimeout(res, 120));
    return { before, said: r.quipping, pop: [...document.querySelectorAll('.co-bang')].some((b) => !b.hidden && b.closest('.co-tagstack')?.querySelector('.co-pill--regular')) };
  });
  check('regulars are bumpable (stagger, a word, the "!" pop)', bump.before && bump.said && bump.pop, JSON.stringify(bump));

  check('no page errors in the demo office', !logs.some((l) => l.startsWith('[pageerror]') || l.startsWith('[error]')), logs.filter((l) => /error/i.test(l)).slice(0, 5).join(' | '));
  const tEnd = await tally(page);
  check('still sessions only: HUD, store, edge faces, toasts', tEnd.staff === tEnd.sessions && tEnd.inStore === 0 && tEnd.edgeFaces === 0 && tEnd.toasts.length === 0, JSON.stringify(tEnd));
  await page.close();

  // ------------------------------------------------------------------ full office: a session needs a desk
  const full = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=7`);
  const before = await full.page.evaluate(() => ({ desks: window.office.world.desks.length, regulars: window.office.regulars.crew().map((r) => [r.name, r.desk.index]) }));
  await full.page.evaluate(() => {
    const b = window.office.panels.deps.backend;
    b.hire('/Users/you/alpha', 'Say hi');
    b.hire('/Users/you/beta', 'Say hi');
  });
  let yielded = [];
  for (let i = 0; i < 60 && yielded.length < 2; i++) {
    await wait(100);
    yielded = await full.page.evaluate(() => window.office.regulars.crew().filter((r) => r.plan === 'yield').map((r) => ({ name: r.name, desk: r.desk.index })));
  }
  check('a full office: each hire makes a regular give up a desk', yielded.length === 2, JSON.stringify({ before, yielded }));
  await wait(1200);
  const allYours = await full.page.evaluate(() => window.office.regulars.crew().filter((r) => r.quipping && r.quipText === 'All yours!').length);
  check('they say "All yours!"', allYours >= 1, String(allYours));
  let seated = [];
  for (let i = 0; i < 40; i++) {
    await wait(500);
    seated = await full.page.evaluate((desks) => desks.map((d) => window.office.director.list().find((e) => e.desk.index === d && e.seated)?.data.displayName ?? null), yielded.map((y) => y.desk));
    if (seated.every(Boolean)) break;
  }
  check('the newcomers sit at those desks', seated.every(Boolean), JSON.stringify(seated));
  // Whoever gave a desk up walks out the front door (a far desk is a 15 m stroll).
  let after = { desks: -1, stillHere: -1 };
  for (let i = 0; i < 40 && after.stillHere !== 0; i++) {
    after = await full.page.evaluate((names) => ({ desks: window.office.world.desks.length, stillHere: window.office.regulars.crew().filter((r) => names.includes(r.name)).length }), yielded.map((y) => y.name));
    if (after.stillHere) await wait(500);
  }
  check('the office did not grow, and the regulars went home', after.desks === before.desks && after.stillHere === 0, JSON.stringify(after));
  check('no page errors while displacing', !full.logs.some((l) => l.startsWith('[pageerror]')), full.logs.filter((l) => l.startsWith('[pageerror]')).join(' | '));
  await full.page.close();

  // ------------------------------------------------------------------ the Help switch
  const sw = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&panel=help`);
  const radios = await sw.page.evaluate(() => [...document.querySelectorAll('.co-regulars input')].map((i) => `${i.value}:${i.checked}`));
  check('Help has the Off / Some / Lively switch (Lively by default)', radios.join(',') === 'off:false,some:false,lively:true', radios.join(','));
  await sw.page.evaluate(() => document.querySelector('.co-regulars').scrollIntoView({ block: 'end' }));
  await sw.page.screenshot({ path: `${SNAPS}/npc-check-settings.png` });
  await sw.page.evaluate(() => document.querySelector('.co-regulars input[value="off"]').click());
  let left = -1;
  for (let i = 0; i < 50 && left !== 0; i++) {
    await wait(500);
    left = await sw.page.evaluate(() => window.office.regulars.crew().length);
  }
  const saved = await sw.page.evaluate(() => localStorage.getItem('claude-office:regulars'));
  check('Off: everyone heads home (walking out, not popping)', left === 0 && saved === 'off', `${left} left, saved ${saved}`);
  const stays = await sw.page.evaluate(() => window.office.regulars.frontDesk?.phase ?? null);
  check('Off sends the crowd home, not the receptionist', stays === 'seated', String(stays));
  await sw.page.evaluate(() => document.querySelector('.co-regulars input[value="lively"]').click());
  let back = 0;
  for (let i = 0; i < 40 && back < 2; i++) {
    await wait(500);
    back = await sw.page.evaluate(() => window.office.regulars.crew().filter((r) => r.phase === 'entering').length);
  }
  check('Lively again: they start walking back in', back >= 1, String(back));
  await sw.page.evaluate(() => localStorage.removeItem('claude-office:regulars'));
  await sw.page.close();

  // ------------------------------------------------------------------ the front desk (Mabel)
  const fd = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off`);
  const desk0 = await tally(fd.page);
  check('the receptionist is at the front desk from page load, regulars Off', desk0.receptionist === 'seated' && desk0.regulars === 0, JSON.stringify(desk0));
  check('the receptionist is never a session (HUD, roster, store)', desk0.staff === desk0.sessions && desk0.inEmployees === 0 && desk0.inStore === 0, JSON.stringify(desk0));
  // E at the front desk: Now hiring opens, and she has a word.
  await fd.page.evaluate(() => {
    const o = window.office;
    const it = o.world.interactables.find((i) => i.id === 'reception');
    const spot = it.position.clone().set(it.position.x - 0.7, 0, it.position.z - 0.7);
    const yaw = Math.atan2(it.position.x - spot.x, it.position.z - spot.z);
    o.manager.teleport(spot, yaw);
    o.manager.face(yaw);
    o.camera.yaw = yaw + Math.PI;
  });
  await wait(700);
  const fdPrompt = await fd.page.evaluate(() => document.querySelector('.co-prompt')?.textContent ?? '');
  await pressE(fd.page);
  await wait(500);
  const fdE = await fd.page.evaluate(() => {
    const rc = window.office.regulars.frontDesk;
    return { panel: window.office.panels.openId, said: rc.quipping ? rc.quipText : '' };
  });
  check('E at the front desk: Now hiring opens and the receptionist has a word', fdE.panel === 'hire' && !!fdE.said, `${fdPrompt} → ${JSON.stringify(fdE)}`);
  await fd.page.screenshot({ path: `${SNAPS}/npc-check-frontdesk.png` });
  await fd.page.evaluate(() => window.office.panels.close());
  // A session walks in through the front door: she waves.
  await fd.page.evaluate(() => window.office.panels.deps.backend.hire('/Users/you/front-door', 'Say hi'));
  let waved = false;
  for (let i = 0; i < 60 && !waved; i++) {
    await wait(200);
    waved = await fd.page.evaluate(() => window.office.regulars.frontDesk?.wavingAt ?? false);
  }
  check('a session walking in through the front door gets a wave', waved);
  // Her own switch: off sends her home on foot, on brings her back in.
  await fd.page.evaluate(() => window.office.panels.open('help'));
  await wait(600);
  const toggle = () => fd.page.evaluate(() => [...document.querySelectorAll('.co-panel--help label')].find((l) => l.textContent.includes('front desk'))?.querySelector('input')?.click());
  await toggle();
  let gone = false;
  let walked = false;
  for (let i = 0; i < 60 && !gone; i++) {
    await wait(300);
    const p = await fd.page.evaluate(() => window.office.regulars.frontDesk?.phase ?? null);
    if (p === 'leaving') walked = true;
    gone = p === null;
  }
  const deskSaved = await fd.page.evaluate(() => localStorage.getItem('claude-office:receptionist'));
  check("her own switch: off, and she walks out the door", gone && walked && deskSaved === '0', `gone ${gone}, walked ${walked}, saved ${deskSaved}`);
  await toggle();
  await wait(800);
  const backIn = await fd.page.evaluate(() => window.office.regulars.frontDesk?.phase ?? null);
  check('on again: she walks back in', backIn === 'entering', String(backIn));
  await fd.page.evaluate(() => localStorage.removeItem('claude-office:receptionist'));
  check('no page errors at the front desk', !fd.logs.some((l) => l.startsWith('[pageerror]')), fd.logs.filter((l) => l.startsWith('[pageerror]')).join(' | '));
  await fd.page.close();

  // ------------------------------------------------------------------ live office (read-only)
  if (process.env.GAME_LIVE) {
    const live = await open(`${BASE}/?debug=1`, { live: true });
    await wait(4000);
    const t = await tally(live.page);
    check('live: regulars at work, HUD counts sessions only', t.regulars > 0 && t.staff === t.sessions && t.inStore === 0, JSON.stringify(t));
    const who = await live.page.evaluate(() => {
      const o = window.office;
      const r = o.regulars.crew().find((x) => x.seated);
      if (!r) return null;
      const a = r.desk.approach;
      const spot = a.clone().set(a.x + (a.x - r.desk.seat.x) * 0.3, 0, a.z + (a.z - r.desk.seat.z) * 0.6);
      const yaw = Math.atan2(r.position.x - spot.x, r.position.z - spot.z);
      o.manager.teleport(spot, yaw);
      o.manager.face(yaw);
      o.camera.yaw = yaw + Math.PI;
      return r.name;
    });
    await wait(700);
    await pressE(live.page);
    await wait(500);
    const liveE = await live.page.evaluate((name) => ({ quip: window.office.regulars.crew().find((x) => x.name === name)?.quipping ?? false, panel: window.office.panels.openId }), who);
    check('live: E on a regular is a quip, no panel', !!who && liveE.quip && liveE.panel === null, JSON.stringify({ who, ...liveE }));
    check('live: nothing was posted', live.posts.length === 0, live.posts.join(' | '));
    check('live: no page errors', !live.logs.some((l) => l.startsWith('[pageerror]')), live.logs.filter((l) => l.startsWith('[pageerror]')).join(' | '));
    await live.page.close();
  }
} catch (err) {
  check('regulars checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
