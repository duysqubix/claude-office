// In-game UI checks (run by scripts/ui-check.mjs): the HUD, panels, chat, ask card, edge faces
// and terminal in the real game page, driven in the demo office (?demo=1), where every button is
// pretend. GAME_LIVE=1 adds read-only screenshots of the live office: panels open, nothing is
// clicked, every POST is blocked and presence is never sent.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/game.mjs
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
  });
  const posts = [];
  if (live) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/')) {
        posts.push(`${req.method()} ${req.url()}`);
        void req.abort();
      } else void req.continue();
    });
  }
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await wait(1200);
  return { page, logs, posts };
}

const shot = (page, name) => page.screenshot({ path: `${SNAPS}/${name}.png` });
const focusGame = (page) => page.evaluate(() => document.getElementById('scene').focus());
const openId = (page) => page.evaluate(() => window.office.panels.openId);
const roster = (page) => page.evaluate(() => window.office.store.employees.map((e) => ({ id: e.sessionId, name: e.displayName, hosted: e.hosted, state: e.state, ask: e.ask?.kind ?? null })));

try {
  // ------------------------------------------------------------------ demo office
  const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1`);
  const people = await roster(page);
  const hosted = people.find((p) => p.hosted && p.state !== 'needs-you');
  const external = people.find((p) => !p.hosted && p.state !== 'needs-you');
  const asker = people.find((p) => p.ask === 'permission') ?? people.find((p) => p.ask);
  check('demo roster has a hosted, an external and an asker', !!hosted && !!external && !!asker, JSON.stringify(people.map((p) => [p.name, p.hosted, p.state, p.ask])));

  // HUD
  const hud = await page.evaluate(() => ({
    badge: document.querySelector('.co-hud__badge')?.textContent,
    needs: document.querySelector('.co-hud__needs')?.textContent,
    buttons: [...document.querySelectorAll('.co-hud__right button')].map((b) => b.getAttribute('aria-label')),
    counts: [...document.querySelectorAll('.co-hud__counts .co-chip')].map((c) => c.textContent),
    title: document.title,
  }));
  check('HUD badge says Claude Office and staff count', /Claude Office/.test(hud.badge ?? '') && /\d+ staff/.test(hud.badge ?? ''), hud.badge);
  check('HUD buttons: Roster, Hire, Sound, Help', hud.buttons.join('|') === 'Roster (R)|Hire (H)|Sound is on (M)|Help (?)' || hud.buttons.join('|') === 'Roster (R)|Hire (H)|Sound is off (M)|Help (?)', hud.buttons.join('|'));
  check('needs-you chip counts and tab title follows', /\d+ needs? you/.test(hud.needs ?? '') && /^\(\d+\) Claude Office$/.test(hud.title), `${hud.needs} / ${hud.title}`);
  check('count chips hide zeros', hud.counts.every((c) => !/^0/.test(c)), hud.counts.join(', '));
  await shot(page, '2b-hud');

  // Edge faces: turn the camera away from whoever needs you
  let edges = [];
  const yaw0 = await page.evaluate(() => window.office.camera.yaw);
  for (let k = 1; k < 8 && !edges.length; k++) {
    await page.evaluate((y) => (window.office.camera.yaw = y), yaw0 + (k * Math.PI) / 4);
    await wait(900);
    edges = await page.evaluate(() => [...document.querySelectorAll('.co-edge')].map((b) => b.getAttribute('aria-label')));
  }
  check('needs-you people off screen get edge faces', edges.length > 0 && edges.every((l) => /^Go to /.test(l)), edges.join(' | '));
  await shot(page, '2b-edges');
  if (edges.length) {
    await page.evaluate(() => document.querySelector('.co-edge')?.click());
    await wait(400);
    const e2 = await page.evaluate(() => ({ open: window.office.panels.openId, auto: window.office.manager.autoWalking }));
    check('clicking an edge face goes to them', !!e2.open && e2.auto, JSON.stringify(e2));
    await wait(3800);
    await page.evaluate(() => window.office.panels.close());
  }

  // Employee panel → E → chat
  await page.evaluate((id) => window.office.panels.openEmployee(id), hosted.id);
  await wait(500);
  const emp = await page.evaluate(() => {
    const p = document.querySelector('.co-panel--person');
    return {
      title: p?.querySelector('.co-panel__title')?.textContent,
      foot: [...(p?.querySelectorAll('.co-panel__foot .co-btn') ?? [])].map((b) => `${b.textContent.trim()}${b.classList.contains('co-btn--primary') ? '*' : ''}`),
      face: !!p?.querySelector('.co-panel__face svg'),
      chip: p?.querySelector('.co-panel__head .co-chip')?.textContent,
    };
  });
  check('employee panel: face, title, state chip', emp.face && emp.title === hosted.name && !!emp.chip, JSON.stringify(emp));
  check('employee footer: Talk (primary, E), Sit, Let go', emp.foot.some((t) => /^Talk.*E\*$/.test(t)) && emp.foot.some((t) => t.startsWith('Sit at their computer')) && emp.foot.includes('Let go'), emp.foot.join(' | '));
  await shot(page, '2b-employee');
  await focusGame(page);
  await page.keyboard.press('KeyE');
  await wait(700);
  const chat = await page.evaluate(() => ({
    open: window.office.panels.openId,
    focused: document.activeElement?.classList.contains('co-chat__input') ?? false,
    composer: !document.querySelector('.co-chat__composer')?.hidden,
  }));
  check('E on the employee panel opens the chat with the composer focused', chat.open === 'chat' && chat.focused && chat.composer, JSON.stringify(chat));
  await wait(1500);
  await page.keyboard.type('Can you run the tests?');
  await page.keyboard.press('Enter');
  await wait(400);
  const pending = await page.evaluate(() => [...document.querySelectorAll('.co-msg--user')].map((m) => m.textContent).at(-1));
  check('sending shows your message at once', /Can you run the tests\?/.test(pending ?? ''), pending);
  await wait(1500);
  const typing = await page.evaluate(() => ({ shown: document.querySelector('.co-typing')?.hidden === false, label: document.querySelector('.co-typing__label')?.textContent }));
  check('while they work, the typing indicator shows what they are doing', typing.shown && !!typing.label, JSON.stringify(typing));
  await wait(5500);
  const reply = await page.evaluate(() => ({
    last: [...document.querySelectorAll('.co-msg--assistant')].map((m) => m.textContent).at(-1),
    mine: [...document.querySelectorAll('.co-msg--user')].filter((m) => m.textContent.includes('Can you run the tests?')).length,
    pending: document.querySelectorAll('.co-msg.is-pending').length,
  }));
  check('their reply arrives in the chat', /Sure thing, boss/.test(reply.last ?? ''), reply.last);
  check('your message reconciles with the feed (one copy, not pending)', reply.mine === 1 && reply.pending === 0, JSON.stringify(reply));
  await shot(page, '2b-chat');
  await page.keyboard.press('Escape');
  await wait(200);
  const afterEsc = await page.evaluate(() => ({ open: window.office.panels.openId, typing: document.activeElement?.tagName }));
  check('Esc in the composer hands the keys back, chat stays open', afterEsc.open === 'chat' && afterEsc.typing !== 'TEXTAREA', JSON.stringify(afterEsc));
  await page.keyboard.press('Escape');
  await wait(400);
  check('second Esc closes the chat', (await openId(page)) === null, String(await openId(page)));

  // External: Talk → read-only chat with "Bring into the office"
  await page.evaluate((id) => window.office.panels.openEmployee(id), external.id);
  await wait(400);
  const extFoot = await page.evaluate(() => [...document.querySelectorAll('.co-panel--person .co-panel__foot .co-btn')].map((b) => b.textContent.trim()));
  check('external employee: Talk only', extFoot.length === 1 && extFoot[0].startsWith('Talk'), extFoot.join(' | '));
  await page.evaluate(() => document.querySelector('.co-panel--person .co-panel__foot .co-btn')?.click());
  await wait(1200);
  const adopt = await page.evaluate(() => ({
    composer: document.querySelector('.co-chat__composer')?.hidden,
    adopt: document.querySelector('.co-chat__adopt')?.hidden === false,
    button: document.querySelector('.co-chat__adopt .co-btn')?.textContent.trim(),
  }));
  check('external chat: no composer, "Bring into the office"', adopt.composer === true && adopt.adopt && adopt.button === 'Bring into the office', JSON.stringify(adopt));
  await shot(page, '2b-chat-external');
  await page.evaluate(() => window.office.panels.close());

  // Ask card in the person panel: E focuses it, 1 answers
  await page.evaluate((id) => window.office.panels.openAsk(id), asker.id);
  await wait(500);
  const ask = await page.evaluate(() => ({
    open: window.office.panels.openId,
    card: !!document.querySelector('.co-panel--person .co-ask'),
    focused: document.activeElement?.classList.contains('co-ask') ?? false,
    talk: [...document.querySelectorAll('.co-panel--person .co-panel__foot .co-btn')].map((b) => b.textContent.trim()),
  }));
  check('openAsk: person panel with the ask card focused', ask.open === 'ask' && ask.card && ask.focused, JSON.stringify(ask));
  check('with an ask open, Talk has no E cap', ask.talk.some((t) => t === 'Talk'), ask.talk.join(' | '));
  await shot(page, '2b-ask');
  await page.keyboard.press('Digit1');
  await wait(900);
  const folded = await page.evaluate(() => document.querySelector('.co-panel--person .co-ask__done')?.textContent.trim());
  check('1 on the focused card answers and folds it', folded === 'Allowed', folded);
  await page.evaluate(() => window.office.panels.close());

  // Hire: type a path, Enter picks it, Enter in the task hires (pretend), confetti + slam toast
  await page.evaluate(() => window.office.panels.open('hire'));
  await wait(700);
  const searchFocused = await page.evaluate(() => document.activeElement?.getAttribute('placeholder'));
  check('hire opens with the project search focused', searchFocused === 'Search projects or paste a path', searchFocused);
  await page.keyboard.type('~/somewhere/new-thing');
  await wait(150);
  const useRow = await page.evaluate(() => document.querySelector('.co-hire__list .co-person')?.textContent);
  check('a typed path offers "Use ~/…"', /Use ~\/somewhere\/new-thing/.test(useRow ?? ''), useRow);
  await page.keyboard.press('Enter');
  await wait(150);
  const hireState = await page.evaluate(() => ({
    label: document.querySelector('.co-panel--hire .co-panel__foot .co-btn')?.textContent.trim(),
    first: !document.querySelector('.co-panel--hire p.co-muted:not(.co-hire__list *)')?.hidden,
    focus: document.activeElement?.tagName,
  }));
  check('Enter picks it: "Hire for new-thing", first-time note, focus in the task', /^Hire for new-thing/.test(hireState.label ?? '') && hireState.focus === 'TEXTAREA', JSON.stringify(hireState));
  await shot(page, '2b-hire');
  await page.keyboard.type('say hi');
  await page.keyboard.press('Enter');
  await wait(900);
  const toast = await page.evaluate(() => [...document.querySelectorAll('.co-toast')].map((t) => t.textContent).join(' | '));
  check('hiring closes the panel with the slam toast', (await openId(page)) === null && /Interview went great!/.test(toast), toast);
  await shot(page, '2b-hired-toast');

  // Roster, files, help, Team Room, intern desk
  for (const [id, cls, name] of [
    ['roster', 'co-panel--roster', '2b-roster'],
    ['archive', 'co-panel--files', '2b-files'],
    ['help', 'co-panel--help', '2b-help'],
    ['stats', 'co-panel--help', '2b-teamroom'],
    ['interns', 'co-panel--interns', '2b-interns'],
  ]) {
    await page.evaluate((p) => window.office.panels.open(p), id);
    await wait(900);
    const ok = await page.evaluate((c) => !!document.querySelector(`.${c}:not(.is-out)`), cls);
    check(`${id} panel opens`, ok);
    await shot(page, name);
  }
  // Roster row: go to them (panel opens as you set off, focus stays in the game)
  await page.evaluate(() => window.office.panels.open('roster'));
  await wait(500);
  await page.evaluate(() => document.querySelector('.co-panel--roster .co-person')?.click());
  await wait(500);
  const go = await page.evaluate(() => ({ open: window.office.panels.openId, auto: window.office.manager.autoWalking, focus: document.activeElement?.id || document.activeElement?.tagName }));
  check('roster row: walks there with their panel already open', (go.open === 'employee' || go.open === 'ask') && go.auto, JSON.stringify(go));
  await wait(3800);
  await page.evaluate(() => window.office.panels.close());

  check('no page errors in the demo office', !logs.some((l) => l.startsWith('[pageerror]') || l.startsWith('[error]')), logs.filter((l) => /error/i.test(l)).slice(0, 5).join(' | '));
  await page.close();

  // Sitting at a computer (demo terminal)
  const t = await open(`${BASE}/?demo=1&quiet=1&debug=1&term=1`);
  await wait(2500);
  const term = await t.page.evaluate(() => ({
    seated: document.body.classList.contains('seated'),
    chin: document.querySelector('.term-chin')?.textContent,
    hudHidden: getComputedStyle(document.querySelector('.co-hud__right')).visibility,
    toastsHeld: document.querySelectorAll('.co-toast').length,
  }));
  check('sitting down: seated, chin with name and Stand up, HUD steps back', term.seated && /computer/.test(term.chin ?? '') && /Stand up/.test(term.chin ?? '') && term.hudHidden === 'hidden', JSON.stringify(term));
  await shot(t.page, '2b-terminal');
  await t.page.close();

  // ------------------------------------------------------------------ live office (read-only)
  if (process.env.GAME_LIVE) {
    const live = await open(`${BASE}/?debug=1`, { live: true });
    const people = await roster(live.page);
    await shot(live.page, '2b-live');
    for (const p of people.slice(0, 3)) {
      await live.page.evaluate((id) => window.office.panels.openEmployee(id), p.id);
      await wait(900);
      await shot(live.page, `2b-live-employee-${p.hosted ? 'hosted' : 'external'}`);
      await live.page.evaluate((id) => window.office.panels.openChat(id), p.id);
      await wait(2500);
      await shot(live.page, `2b-live-chat-${p.hosted ? 'hosted' : 'external'}`);
    }
    for (const id of ['hire', 'archive', 'roster', 'stats']) {
      await live.page.evaluate((x) => window.office.panels.open(x), id);
      await wait(1500);
      await shot(live.page, `2b-live-${id}`);
    }
    await live.page.evaluate(() => window.office.panels.close());
    check('live: nothing was posted', live.posts.length === 0, live.posts.join(' | '));
    check('live: no page errors', !live.logs.some((l) => l.startsWith('[pageerror]')), live.logs.filter((l) => l.startsWith('[pageerror]')).join(' | '));
    await live.page.close();
  }
} catch (err) {
  check('game checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
