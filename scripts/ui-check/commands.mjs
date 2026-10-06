// The "/" picker in the chat composer (#151), run by scripts/ui-check.mjs in the demo office
// (?demo=1: its pretend commands, demo.ts): "/" opens it above the box, typing filters (prefix,
// then fuzzy), the arrows and Enter or Tab fill in "/name ", and Esc closes only the picker.
// In the docked chat, then in Monitor on the laptop.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/commands.mjs
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
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A demo office page that never reports presence, hot-reloads or POSTs. */
async function open() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('pageerror', (e) => logs.push(e.message));
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
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/')) return void req.abort();
    void req.continue();
  });
  await page.goto(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off&tips=0`, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await wait(1200);
  return { page, logs };
}

/** The picker and the box, as the manager (and a screen reader) sees them. `scope`: the chat's container. */
const look = (page, scope) =>
  page.evaluate((scope) => {
    const root = document.querySelector(scope);
    const box = root?.querySelector('.co-chat__input');
    const picker = root?.querySelector('.co-slash');
    const rows = [...(picker?.querySelectorAll('.co-slash__row') ?? [])];
    const active = box?.getAttribute('aria-activedescendant');
    return {
      open: !!picker && !picker.hidden,
      names: rows.map((r) => r.dataset.name),
      sources: rows.map((r) => r.querySelector('.co-slash__source')?.textContent),
      descs: rows.map((r) => r.querySelector('.co-slash__desc')?.textContent),
      active: active ? document.getElementById(active)?.dataset.name : null,
      selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.dataset.name),
      listbox: picker?.querySelector('[role="listbox"]')?.id ?? null,
      controls: box?.getAttribute('aria-controls'),
      expanded: box?.getAttribute('aria-expanded'),
      role: box?.getAttribute('role'),
      value: box?.value,
      focused: document.activeElement === box,
    };
  }, scope);

async function type(page, text) {
  await page.keyboard.type(text);
  await wait(120);
}
async function clear(page, sel) {
  await page.evaluate((sel) => {
    const b = document.querySelector(sel);
    b.value = '';
    b.dispatchEvent(new Event('input', { bubbles: true }));
  }, sel);
}

let code = 0;
try {
  const { page, logs } = await open();
  const people = await page.evaluate(() => window.office.store.employees.map((e) => ({ id: e.sessionId, hosted: e.hosted, state: e.state })));
  const hosted = people.find((p) => p.hosted && p.state !== 'needs-you');
  check('the demo has someone hosted to talk to', !!hosted, JSON.stringify(people.length));

  // ------------------------------------------------------------------ the docked chat
  const DOCK = '.co-panel--chat';
  const BOX = `${DOCK} .co-chat__input`;
  await page.evaluate((id) => window.office.panels.openChat(id), hosted.id);
  await wait(700);
  await page.focus(BOX);
  await type(page, '/');
  await wait(300);
  const all = await look(page, DOCK);
  check('"/" opens the picker above the box, with their commands', all.open && all.names.length >= 10 && all.names.includes('clear') && all.names.includes('garden:water'), JSON.stringify(all.names));
  check('each row: the name, where it comes from, a description', all.sources.includes('built-in') && all.sources.includes('project') && all.sources.includes('user · skill') && all.sources.includes('garden') && all.descs.every((d) => d && d.length > 5), JSON.stringify(all.sources));
  check('a listbox the box controls, the first row active (aria-activedescendant)', all.role === 'combobox' && all.expanded === 'true' && all.controls === all.listbox && !!all.listbox && all.active === all.names[0] && all.selected.length === 1, JSON.stringify({ role: all.role, expanded: all.expanded, active: all.active }));
  await page.evaluate(() => document.querySelector('.co-slash')?.scrollTo(0, 0));
  await page.screenshot({ path: `${SNAPS}/151-picker.png` });

  await type(page, 'co');
  const co = await look(page, DOCK);
  check('typing filters, prefix first: /co → compact, context, cost, then fuzzy changelog', JSON.stringify(co.names) === JSON.stringify(['compact', 'context', 'cost', 'changelog']), JSON.stringify(co.names));
  await clear(page, BOX);
  await type(page, '/wat');
  const ns = await look(page, DOCK);
  check('…a part after ":" counts as a prefix: /wat → garden:water', ns.names[0] === 'garden:water', JSON.stringify(ns.names));
  await clear(page, BOX);
  await type(page, '/tdyim');
  const fz = await look(page, DOCK);
  check('…then fuzzy: /tdyim → tidy-imports', fz.names[0] === 'tidy-imports', JSON.stringify(fz.names));
  await clear(page, BOX);
  await type(page, '/te');
  await page.keyboard.press('ArrowDown');
  await type(page, 'st');
  const narrowed = await look(page, DOCK);
  check('a new query starts at its best match (not the row picked for the last one)', narrowed.names[0] === 'test' && narrowed.active === 'test', JSON.stringify({ names: narrowed.names, active: narrowed.active }));
  await clear(page, BOX);
  await type(page, '/tdyim');
  await type(page, 'zzz');
  const none = await look(page, DOCK);
  check('nothing matches → the picker steps aside', !none.open && none.expanded === 'false', JSON.stringify(none));

  await clear(page, BOX);
  await type(page, '/co');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const moved = await look(page, DOCK);
  await page.keyboard.press('ArrowUp');
  const back = await look(page, DOCK);
  check('Down and Up move the active row', moved.active === 'cost' && moved.selected[0] === 'cost' && back.active === 'context', JSON.stringify([moved.active, back.active]));
  await page.keyboard.press('Enter');
  await wait(150);
  const filled = await look(page, DOCK);
  const said = await page.evaluate(() => document.querySelectorAll('.co-msg.is-pending').length);
  check('Enter fills in "/context " (nothing sent) and closes the picker', filled.value === '/context ' && !filled.open && filled.focused && said === 0, JSON.stringify({ value: filled.value, open: filled.open, said }));

  await clear(page, BOX);
  await type(page, '/gar');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await wait(150);
  const tabbed = await look(page, DOCK);
  check('Tab picks too (and keeps the cursor in the box)', /^\/garden:\w+ $/.test(tabbed.value ?? '') && tabbed.focused && !tabbed.open, JSON.stringify(tabbed.value));

  await clear(page, BOX);
  await type(page, '/');
  await page.keyboard.press('Escape');
  await wait(250);
  const esc = await look(page, DOCK);
  const stillOpen = await page.evaluate(() => window.office.panels.openId);
  check('Esc closes only the picker: the chat stays open, the cursor in the box', !esc.open && esc.focused && esc.value === '/' && stillOpen === 'chat', JSON.stringify({ open: esc.open, focused: esc.focused, panel: stillOpen }));
  await type(page, 'he');
  const again = await look(page, DOCK);
  check('typing on opens it again', again.open && again.names[0] === 'help', JSON.stringify(again.names));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await wait(400);
  const sent = await page.evaluate(() => [...document.querySelectorAll('.co-msg--user .co-msg__body')].map((b) => b.textContent).at(-1));
  check('Say sends the picked command as typed', sent === '/help', JSON.stringify(sent));
  await page.focus(BOX);
  await type(page, '/cost');
  const typedFull = await look(page, DOCK);
  await page.keyboard.press('Enter');
  await wait(400);
  const sentFull = await page.evaluate(() => [...document.querySelectorAll('.co-msg--user .co-msg__body')].map((b) => b.textContent).at(-1));
  check('a name typed in full: Enter sends it at once, as in Claude Code', typedFull.open && sentFull === '/cost', JSON.stringify({ open: typedFull.open, sentFull }));
  await page.keyboard.press('Escape');
  await wait(200);
  const after = await page.evaluate(() => ({ open: window.office.panels.openId, typing: document.activeElement?.tagName }));
  check('…and with the picker shut, Esc is the usual: out of the box, chat still open', after.open === 'chat' && after.typing !== 'TEXTAREA', JSON.stringify(after));
  await page.evaluate(() => window.office.panels.close());
  await wait(400);

  // ------------------------------------------------------------------ Monitor, on the laptop
  const MON = '.mon-chat';
  const MBOX = `${MON} .co-chat__input`;
  await page.evaluate((id) => {
    const lap = window.office.laptop;
    lap.open();
    lap.setApp('monitor');
    document.querySelector(`.mon-row[data-id="${CSS.escape(id)}"]`)?.click();
  }, hosted.id);
  await wait(900);
  await page.focus(MBOX);
  await type(page, '/re');
  const mon = await look(page, MON);
  check('Monitor: "/" opens the picker in their chat on the laptop', mon.open && mon.names[0] === 'review', JSON.stringify(mon.names));
  await page.screenshot({ path: `${SNAPS}/151-monitor-picker.png` });
  await page.keyboard.press('Escape');
  await wait(300);
  const monEsc = await look(page, MON);
  const seated = await page.evaluate(() => ({ laptop: !!document.querySelector('.sp-modal:not(.out)'), app: document.querySelector('.sp-screen')?.dataset.app }));
  check('Monitor: Esc closes only the picker (still at the laptop, cursor in the box)', !monEsc.open && monEsc.focused && seated.laptop && seated.app === 'monitor', JSON.stringify({ open: monEsc.open, focused: monEsc.focused, ...seated }));
  await clear(page, MBOX);
  await type(page, '/d');
  await page.keyboard.press('Enter');
  await wait(150);
  const monPick = await look(page, MON);
  check('Monitor: Enter fills in the command', monPick.value === '/deploy ' && !monPick.open, JSON.stringify(monPick.value));
  await page.keyboard.press('Escape');
  await wait(300);
  const monOut = await page.evaluate(() => ({ laptop: !!document.querySelector('.sp-modal:not(.out)'), typing: document.activeElement?.tagName }));
  check('Monitor: then Esc leaves the box as before, still seated', monOut.laptop && monOut.typing !== 'TEXTAREA', JSON.stringify(monOut));

  check('no page errors', logs.length === 0, logs.join(' | '));
} catch (err) {
  check('the checks ran', false, err.stack ?? String(err));
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
