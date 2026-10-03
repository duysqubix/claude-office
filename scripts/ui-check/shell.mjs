// Shell tab checks (run by scripts/ui-check.mjs), in the demo office (?demo=1, pretend shells):
// Claude | Shell tabs on the top edge of the screen in the quick look (T) and at their computer,
// Ctrl+` to switch (once per press, and a key held across the switch never repeats into the
// other terminal), the arrows on the tabs (never typed into a terminal), the last tab remembered
// per person, "Shell in ~/project", Interrupt only by Claude's screen, a screen that never jumps
// on a switch, and a shell for someone who runs in your own terminal.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/shell.mjs
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
/** CPU_THROTTLE=4 runs every page on a 4× slower CPU (like a small CI runner). */
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 0);

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
  // Once it's loaded (with request interception on, a throttled load never goes network-idle).
  if (THROTTLE > 1) await (await page.target().createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await wait(1200);
  return { page, logs };
}

const errors = (logs) => logs.filter((l) => l.startsWith('[pageerror]'));

/** What the tabs and the showing terminal look like, inside `root` (the quick look or the monitor). */
const look = (page, root) =>
  page.evaluate((root) => {
    const r = document.querySelector(root);
    if (!r) return null;
    const pressed = r.querySelector('.term-tabs [aria-selected="true"]')?.getAttribute('data-tab') ?? null;
    const screens = [...r.querySelectorAll('.term-screen')].filter((s) => !s.hidden && !s.classList.contains('term-note'));
    const text = screens.map((s) => s.querySelector('.xterm-rows')?.textContent ?? '').join('|');
    const note = [...r.querySelectorAll('.term-note, .co-chat__termnote')].find((n) => !n.hidden)?.textContent ?? '';
    const bar = [...r.querySelectorAll('.term-tabbar, .term-chin, .co-chat__termbar')].map((b) => b.textContent).join(' ');
    return { pressed, shown: screens.length, text, note, bar: bar.replace(/\s+/g, ' ').trim() };
  }, root);

/**
 * `look` until `ok(view)` (a terminal's first words arrive after its pretend connection opens,
 * later on a slow machine), at most `ms`. Returns the last view either way.
 */
async function settle(page, root, ok, ms = 8000) {
  const t0 = Date.now();
  let v = await look(page, root);
  while (!ok(v) && Date.now() - t0 < ms) {
    await wait(100);
    v = await look(page, root);
  }
  return v;
}

async function ctrlBackquote(page, { held = 0 } = {}) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Backquote');
  // Holding it: auto-repeat keydowns.
  for (let i = 0; i < held; i++) await page.keyboard.down('Backquote');
  await page.keyboard.up('Backquote');
  await page.keyboard.up('Control');
  await wait(250);
}

try {
  const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1`);
  const people = await page.evaluate(() => window.office.store.employees.map((e) => ({ id: e.sessionId, name: e.displayName, hosted: e.hosted, project: e.project })));
  const hosted = people.find((p) => p.hosted);
  const external = people.find((p) => !p.hosted);
  check('demo roster has someone hired here and someone in your own terminal', !!hosted && !!external, JSON.stringify(people.map((p) => [p.name, p.hosted])));

  // ------------------------------------------------------------------ the quick look (T)
  const Q = '.co-panel--chat';
  await page.evaluate((id) => window.office.panels.openChat(id, { mode: 'terminal' }), hosted.id);
  await wait(900);
  let q = await look(page, Q);
  check('quick look: Claude | Shell tabs, Claude first for someone hired here', q?.pressed === 'claude' && q.shown === 1 && /Welcome to Claude Code/.test(q.text), JSON.stringify(q));
  check('quick look: the bar shows the switch key', /Ctrl\+`/.test(q?.bar ?? ''), q?.bar);
  // The tabs stand on their screen's top edge; Interrupt sits by Claude's screen, not in the header.
  const geo = (root) =>
    page.evaluate((root) => {
      const r = document.querySelector(root);
      const tab = r?.querySelector('.term-tabs [aria-selected="true"]')?.getBoundingClientRect();
      const screen = [...(r?.querySelectorAll('.term-screen, .co-chat__termnote') ?? [])].find((s) => !s.hidden)?.getBoundingClientRect();
      const btn = (sel) => [...(r?.querySelectorAll(sel) ?? [])].some((b) => !b.hidden && b.getBoundingClientRect().width > 0 && b.textContent.includes('Interrupt'));
      return tab && screen ? { gap: Math.round(screen.top - tab.bottom), inside: tab.left >= screen.left && tab.right <= screen.right, screen: [Math.round(screen.top), Math.round(screen.height)], head: btn('.co-chat__actions .co-btn'), bar: btn('.co-chat__termbar .co-btn') } : null;
    }, root);
  const g1 = await geo(Q);
  check('the tabs stand on the top edge of their screen', !!g1 && Math.abs(g1.gap) <= 1 && g1.inside, JSON.stringify(g1));
  check('terminal mode: Interrupt by their screen, not in the header too', !!g1 && g1.bar && !g1.head, JSON.stringify(g1));
  await page.evaluate(() => document.querySelector('.co-panel--chat .term-screen:not([hidden]) textarea')?.focus());
  // Held Ctrl+`: one switch, not one per repeat.
  await ctrlBackquote(page, { held: 3 });
  q = await look(page, Q);
  check('Ctrl+` switches to Shell once, however long it is held', q?.pressed === 'shell' && q.shown === 1, JSON.stringify({ pressed: q?.pressed, shown: q?.shown }));
  await wait(400);
  q = await look(page, Q);
  check('the Shell tab: a shell prompt in their folder, "Shell in ~/…" in the bar, no Interrupt', /you@office/.test(q?.text ?? '') && q.bar.includes(`Shell in ~/${hosted.project}`) && !(await page.$eval(Q, (r) => [...r.querySelectorAll('.co-chat__termbar .co-btn')].some((b) => !b.hidden && b.textContent.includes('Interrupt')))), q?.bar);
  await page.keyboard.type('pwd', { delay: 30 });
  await page.keyboard.press('Enter');
  await wait(300);
  q = await look(page, Q);
  check('typing in the shell runs commands there', q?.text.includes(`/Users/you/${hosted.project}`), q?.text.slice(-160));
  const g2 = await geo(Q);
  check('switching tabs never resizes their screen', !!g1 && !!g2 && g1.screen.join() === g2.screen.join(), JSON.stringify({ claude: g1?.screen, shell: g2?.screen }));
  // From the keyboard: the arrows show the other tab and keep you on the tabs; Enter on a tab
  // never reaches a terminal (it could answer Claude).
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.co-panel--chat .term-screen')].map((s) => s.querySelector('.xterm-rows')?.textContent ?? '').join('|'));
  await page.evaluate(() => document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.focus());
  const before = await rows();
  await page.keyboard.press('ArrowLeft');
  await wait(300);
  const arrow = await page.evaluate(() => ({ pressed: document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.dataset.tab, focus: document.activeElement?.dataset?.tab ?? document.activeElement?.className }));
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await wait(300);
  const after = await rows();
  const kb = await page.evaluate(() => ({ pressed: document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.dataset.tab, focus: document.activeElement?.dataset?.tab ?? null }));
  check('the arrows switch tabs and keep you on them', arrow.pressed === 'claude' && arrow.focus === 'claude' && kb.pressed === 'shell' && kb.focus === 'shell', JSON.stringify({ arrow, kb }));
  check('keys on the tabs never reach a terminal', before === after, JSON.stringify({ before: before.slice(-80), after: after.slice(-80) }));
  await page.evaluate(() => document.querySelector('.co-panel--chat .term-screen:not([hidden]) textarea')?.focus());

  // A key held across the switch never repeats into the other terminal.
  await page.keyboard.down('KeyZ');
  await ctrlBackquote(page);
  for (let i = 0; i < 4; i++) await page.keyboard.down('KeyZ');
  await page.keyboard.up('KeyZ');
  await wait(300);
  q = await look(page, Q);
  const claudeText = q?.text ?? '';
  check('back on Claude: still there, and the held Z never repeated into it', q?.pressed === 'claude' && /Welcome to Claude Code/.test(claudeText) && !/>\s*z/.test(claudeText), claudeText.slice(-120));

  // Remembered per person.
  await ctrlBackquote(page);
  await page.evaluate(() => window.office.panels.close());
  await wait(400);
  await page.evaluate((id) => window.office.panels.openChat(id, { mode: 'terminal' }), hosted.id);
  await wait(900);
  q = await look(page, Q);
  const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('claude-office:term-tabs') ?? '{}')[id], hosted.id);
  check('their last tab is remembered (Shell again next time)', q?.pressed === 'shell' && saved === 'shell', JSON.stringify({ pressed: q?.pressed, saved }));
  // On the tabs, Esc and Ctrl+] come back to the chat too (the panel stays), as from inside a terminal.
  const backFromTabs = async (press) => {
    await page.evaluate(() => window.office.panels.chatView?.setMode('terminal'));
    await wait(300);
    await page.evaluate(() => document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.focus());
    await press();
    await wait(300);
    return page.evaluate(() => ({ open: window.office.panels.openId, term: !!document.querySelector('.co-panel--term'), feed: document.querySelector('.co-chat__feed')?.hidden === false }));
  };
  const viaEsc = await backFromTabs(() => page.keyboard.press('Escape'));
  const viaCtrl = await backFromTabs(async () => {
    await page.keyboard.down('Control');
    await page.keyboard.press('BracketRight');
    await page.keyboard.up('Control');
  });
  check('on the tabs, Esc and Ctrl+] come back to the chat', [viaEsc, viaCtrl].every((b) => b.open === 'chat' && !b.term && b.feed), JSON.stringify({ viaEsc, viaCtrl }));
  await page.evaluate(() => window.office.panels.close());
  await wait(400);

  // Someone in your own terminal: Shell first; the Claude tab explains.
  await page.evaluate((id) => window.office.panels.openChat(id, { mode: 'terminal' }), external.id);
  await wait(900);
  q = await look(page, Q);
  check('in your own terminal: the quick look opens on their Shell', q?.pressed === 'shell' && /you@office/.test(q.text), JSON.stringify({ pressed: q?.pressed, text: q?.text.slice(0, 80) }));
  await page.click(`${Q} .term-tabs [data-tab="claude"]`);
  await wait(300);
  q = await look(page, Q);
  check('…and their Claude tab says why there is no screen', q?.pressed === 'claude' && q.shown === 0 && /runs in their own terminal/.test(q.note), q?.note.slice(0, 90));
  const noScreen = await page.evaluate((id) => {
    const r = document.querySelector('.co-panel--chat');
    const lit = [...r.querySelectorAll('.co-chat__termbar .term-led')].some((l) => !l.hidden);
    const interrupt = [...r.querySelectorAll('.co-btn')].some((b) => !b.hidden && b.getBoundingClientRect().width > 0 && b.textContent.includes('Interrupt'));
    const bring = r.querySelector('.co-chat__termnote .co-btn');
    bring?.focus();
    // A roster update while you're on the button (it must keep its focus).
    const host = window.office.panels;
    host.chatView?.update({ ...window.office.store.get(id) });
    return { lit, interrupt, kept: !!bring && document.activeElement === bring };
  }, external.id);
  check('no screen, no light and no Interrupt; "Bring into the office" keeps focus through updates', !noScreen.lit && !noScreen.interrupt && noScreen.kept, JSON.stringify(noScreen));
  await page.evaluate(() => window.office.panels.close());
  await wait(400);

  // ------------------------------------------------------------------ at their computer
  const M = '.term-modal';
  await page.evaluate((id) => window.office.panels.deps.actions.sitAt(id), external.id);
  await page.waitForSelector(M, { timeout: 15000 });
  const externalShell = (v) => v?.pressed === 'shell' && /you@office/.test(v.text) && v.bar.includes(`${external.name}'s computer`) && v.bar.includes(`Shell in ~/${external.project}`);
  let m = await settle(page, M, externalShell);
  check('sitting at the computer of someone in your own terminal opens their Shell', externalShell(m), m?.bar);
  await ctrlBackquote(page);
  m = await look(page, M);
  check('at their computer: Ctrl+` to their Claude tab, which says why it is empty', m?.pressed === 'claude' && /runs in their own terminal/.test(m.note), m?.note.slice(0, 80));
  await page.keyboard.down('Control');
  await page.keyboard.press('BracketRight');
  await page.keyboard.up('Control');
  await wait(800);
  check('Ctrl+] stands up', !(await page.$(M)), '');

  await page.evaluate((id) => window.office.panels.deps.actions.sitAt(id), hosted.id);
  await page.waitForSelector(M, { timeout: 15000 });
  const leftOff = (v) => v?.pressed === 'shell' && /you@office/.test(v.text) && /Esc goes to the shell/.test(v.bar);
  m = await settle(page, M, leftOff);
  check('sitting down where you left off (their Shell)', leftOff(m), m?.bar);
  await page.click(`${M} .term-tabs [data-tab="claude"]`);
  // Their Claude terminal opens on this first visit: its welcome arrives once it's connected.
  const claudeTab = (v) => v?.pressed === 'claude' && /Welcome to Claude Code/.test(v.text) && /Esc goes to Claude/.test(v.bar);
  m = await settle(page, M, claudeTab);
  check('the Claude tab at their computer: their session, "Esc goes to Claude"', claudeTab(m), m?.bar);
  const g3 = await geo(M);
  check('at their computer too, the tabs stand on the top edge of the screen', !!g3 && Math.abs(g3.gap) <= 1 && g3.inside, JSON.stringify(g3));
  // A click on the monitor itself (their name on the chin, not a button) leaves the keyboard in
  // their terminal.
  await page.click(`${M} .term-name b`);
  await wait(200);
  check('a click on the monitor keeps the keyboard in their terminal', await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea') ?? false));
  // An exited shell: "Shell closed", and New shell opens another.
  await ctrlBackquote(page);
  await page.keyboard.type('exit', { delay: 30 });
  await page.keyboard.press('Enter');
  await wait(600);
  m = await look(page, M);
  const freshShown = await page.evaluate(() => [...document.querySelectorAll('.term-modal .co-btn')].some((b) => !b.hidden && b.textContent.trim() === 'New shell'));
  check('typing exit closes the shell, and New shell is offered', /Shell closed/.test(m?.bar ?? '') && freshShown && !!(await page.$(M)), m?.bar);
  await page.evaluate(() => [...document.querySelectorAll('.term-modal .co-btn')].find((b) => b.textContent.trim() === 'New shell')?.click());
  await wait(700);
  m = await look(page, M);
  check('New shell: a fresh prompt', /Connected/.test(m?.bar ?? '') && (m?.text.match(/you@office/g) ?? []).length >= 1, m?.bar);
  // Wherever the focus went (here: nowhere), Ctrl+] still stands you up.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('Control');
  await page.keyboard.press('BracketRight');
  await page.keyboard.up('Control');
  await wait(800);
  check('Ctrl+] stands you up wherever the focus is', !(await page.$(M)));

  // ------------------------------------------------------------------ keys, focus and endings
  const active = () => page.evaluate(() => ({ tab: document.activeElement?.dataset?.tab ?? null, term: document.activeElement?.classList.contains('xterm-helper-textarea') ?? false, text: document.activeElement?.textContent?.trim().slice(0, 40) ?? '' }));
  const ctrlBq = async () => {
    await page.keyboard.down('Control');
    await page.keyboard.press('Backquote');
    await page.keyboard.up('Control');
    await wait(300);
  };
  // T, Esc, T: one screen in the quick look, the live one (an old emptied one once pushed it out of view).
  await page.evaluate((id) => window.office.panels.openChat(id, { mode: 'terminal' }), hosted.id);
  await wait(900);
  await page.click(`${Q} .term-tabs [data-tab="claude"]`);
  await wait(500);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Escape');
    await wait(300);
    await page.keyboard.press('KeyT');
    await wait(900);
  }
  const screens = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.co-panel--chat .co-chat__termslot .term-screen')];
    const shown = all.filter((x) => !x.hidden && x.getBoundingClientRect().height > 200);
    return { all: all.length, shown: shown.length, inView: shown.every((x) => x.getBoundingClientRect().top < innerHeight - 100), focused: shown.some((x) => x.contains(document.activeElement)) };
  });
  check('T, Esc, T: one screen, in view, and the keyboard in it', screens.all === 1 && screens.shown === 1 && screens.inView && screens.focused, JSON.stringify(screens));

  // Ctrl+` from the tabs switches and keeps you on the tabs (never pulled into a terminal).
  await page.evaluate(() => document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.focus());
  await ctrlBq();
  const fromTabs = await active();
  check('Ctrl+` on the tabs keeps you on the tabs', fromTabs.tab === 'shell' && !fromTabs.term, JSON.stringify(fromTabs));
  // A held arrow switches once and leaves you on the tab that's showing.
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 3; i++) await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('ArrowLeft');
  await wait(300);
  const held = await page.evaluate(() => ({ pressed: document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.dataset.tab, focus: document.activeElement?.dataset?.tab ?? null }));
  check('a held arrow switches once, and you stay on the tab showing', held.pressed === 'claude' && held.focus === 'claude', JSON.stringify(held));
  // Their session ends while you're in their Shell: the shell stays, and so does your keyboard.
  await page.click(`${Q} .term-tabs [data-tab="shell"]`);
  await wait(600);
  await page.evaluate((id) => window.office.panels.chatView?.end(`${id} ended`), hosted.name);
  await wait(400);
  const afterEnd = await page.evaluate(() => {
    const shown = [...document.querySelectorAll('.co-panel--chat .co-chat__termslot .term-screen')].filter((x) => !x.hidden);
    return { shown: shown.length, focused: shown.some((x) => x.contains(document.activeElement)), pressed: document.querySelector('.co-panel--chat .term-tabs [aria-selected="true"]')?.dataset.tab };
  });
  check('their session ends while you are in their Shell: it stays, keyboard and all', afterEnd.shown === 1 && afterEnd.focused && afterEnd.pressed === 'shell', JSON.stringify(afterEnd));
  await page.evaluate(() => window.office.panels.close());
  await wait(400);

  // Someone in your own terminal: Ctrl+` from their Shell to their Claude tab lands on the tab,
  // never on "Bring into the office"; and the Shell they're forced onto isn't remembered.
  await page.evaluate((id) => {
    const all = JSON.parse(localStorage.getItem('claude-office:term-tabs') ?? '{}');
    delete all[id];
    localStorage.setItem('claude-office:term-tabs', JSON.stringify(all));
  }, external.id);
  await page.evaluate((id) => window.office.panels.openChat(id, { mode: 'terminal' }), external.id);
  await wait(900);
  await page.evaluate(() => document.querySelector('.co-panel--chat .term-screen:not([hidden]) textarea')?.focus());
  await ctrlBq();
  const ext = await active();
  const extSaved = await page.evaluate((id) => JSON.parse(localStorage.getItem('claude-office:term-tabs') ?? '{}')[id] ?? null, external.id);
  check('their Claude tab by Ctrl+`: the keyboard is on the tab, not "Bring into the office"', ext.tab === 'claude' && !/Bring/.test(ext.text), JSON.stringify(ext));
  check('their Shell (the only screen they have here) is not remembered as a choice', extSaved === null, String(extSaved));
  await page.evaluate(() => window.office.panels.close());
  await wait(400);
  await page.evaluate((id) => window.office.panels.deps.actions.sitAt(id), external.id);
  await page.waitForSelector(M, { timeout: 15000 });
  await wait(1000);
  await ctrlBq();
  const extSit = await active();
  check('…and at their computer, on the tab, not on Stand up', extSit.tab === 'claude' && !/Stand up/.test(extSit.text), JSON.stringify(extSit));
  await page.keyboard.down('Control');
  await page.keyboard.press('BracketRight');
  await page.keyboard.up('Control');
  await wait(800);

  // Sitting down, the keyboard can go to the tabs while the monitor grows; it stays there.
  await page.evaluate(() => {
    const b = window.office.panels.deps.backend;
    if (b.__links) return;
    const orig = b.terminal.bind(b);
    b.__links = [];
    b.terminal = (id, c, r, kind) => {
      const l = orig(id, c, r, kind);
      b.__links.push({ id, kind: kind ?? 'claude', l });
      return l;
    };
  });
  await page.evaluate((id) => {
    const all = JSON.parse(localStorage.getItem('claude-office:term-tabs') ?? '{}');
    all[id] = 'claude';
    localStorage.setItem('claude-office:term-tabs', JSON.stringify(all));
    window.office.panels.deps.actions.sitAt(id);
  }, hosted.id);
  await page.waitForSelector(M, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.term-modal .term-tabs [aria-selected="true"]')?.focus());
  await wait(900);
  const kept = await active();
  check('the bezel opening never pulls you off the tabs', kept.tab === 'claude' && !kept.term, JSON.stringify(kept));
  // Claude's session ends while you type in their Shell: you stay until you're done there; on
  // their Claude tab, you stand up once you stop typing.
  await page.click(`${M} .term-tabs [data-tab="shell"]`);
  await wait(700);
  await page.evaluate((id) => {
    const link = window.office.panels.deps.backend.__links.filter((x) => x.id === id && x.kind === 'claude').pop();
    link?.l.onClose?.(1000, 'detached');
  }, hosted.id);
  await page.keyboard.type('echo still here', { delay: 120 });
  await page.keyboard.press('Enter');
  await wait(2600);
  const stayed = await look(page, M);
  check('Claude ends while you type in their Shell: you stay seated, typing there', !!stayed && stayed.pressed === 'shell' && /still here/.test(stayed.text), stayed?.text.slice(-80));
  await ctrlBq();
  await page.keyboard.type('abc', { delay: 400 });
  await wait(900);
  const typing = !!(await page.$(M));
  await wait(2600);
  const gone = !(await page.$(M));
  check('on their ended Claude tab you stand up, but only once the keyboard goes quiet', typing && gone, JSON.stringify({ typing, gone }));

  // Claude ends while you're on their Claude tab, and you go to their Shell: a pause there never
  // stands you up (the next key, T say, would open someone's quick look).
  const sitOnClaude = async () => {
    await page.evaluate((id) => {
      const all = JSON.parse(localStorage.getItem('claude-office:term-tabs') ?? '{}');
      all[id] = 'claude';
      localStorage.setItem('claude-office:term-tabs', JSON.stringify(all));
      window.office.panels.deps.actions.sitAt(id);
    }, hosted.id);
    await page.waitForSelector(M, { timeout: 15000 });
    await wait(1200);
  };
  const endClaude = (code, reason) =>
    page.evaluate(
      (id, code, reason) => window.office.panels.deps.backend.__links.filter((x) => x.id === id && x.kind === 'claude').pop()?.l.onClose?.(code, reason),
      hosted.id,
      code,
      reason,
    );
  await sitOnClaude();
  await endClaude(1000, 'detached');
  await wait(300);
  await ctrlBq();
  await page.keyboard.type('echo still working', { delay: 40 });
  await page.keyboard.press('Enter');
  await wait(3200);
  const paused = !!(await page.$(`${M}:not(.out)`));
  await page.keyboard.press('KeyT');
  await wait(600);
  const afterT = await page.evaluate(() => ({ seated: !!document.querySelector('.term-modal:not(.out)'), quickLook: window.office.panels.openId }));
  check('Claude ends, you go to their Shell and pause: still seated, and T goes to the shell', paused && afterT.seated && afterT.quickLook === null, JSON.stringify({ paused, ...afterT }));
  await page.keyboard.down('Control');
  await page.keyboard.press('BracketRight');
  await page.keyboard.up('Control');
  await wait(800);

  // The office refuses their Claude screen while you're in their Shell: you stay, and their Claude
  // tab says why.
  await sitOnClaude();
  await ctrlBq();
  await wait(400);
  await endClaude(1008, 'Not in the office');
  await wait(400);
  const stay = !!(await page.$(`${M}:not(.out)`));
  await ctrlBq();
  const refused = await look(page, M);
  check('their Claude screen refused while you are in their Shell: you stay, and the Claude tab says why', stay && !!refused && refused.pressed === 'claude' && /Can't show Claude/.test(refused.bar), JSON.stringify({ stay, bar: refused?.bar }));
  await page.keyboard.down('Control');
  await page.keyboard.press('BracketRight');
  await page.keyboard.up('Control');
  await wait(800);

  // Someone in your own terminal moves into the office while you look: "Bring into the office"
  // had the keyboard; their new Claude screen never takes it by itself.
  const ext2 = await page.evaluate(() => window.office.store.employees.find((e) => !e.hosted && !e.otherOffice)?.sessionId);
  await page.evaluate((id) => window.office.panels.openChat(id, { mode: 'terminal' }), ext2);
  await wait(900);
  await page.click(`${Q} .term-tabs [data-tab="claude"]`);
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.co-chat__termnote button')].find((b) => /Bring/.test(b.textContent))?.focus());
  const moveIn = (patch) =>
    page.evaluate(
      (id, patch) => {
        const s = window.office.store;
        s.set(s.employees.map((e) => (e.sessionId === id ? { ...e, ...patch } : e)), Date.now());
      },
      ext2,
      patch,
    );
  await moveIn({ adopting: true });
  await wait(300);
  const waiting = await active();
  await moveIn({ adopting: false, hosted: true });
  await wait(900);
  const movedIn = await page.evaluate(() => {
    const a = document.activeElement;
    return { inScreen: !!a?.closest('.term-screen'), tab: a?.dataset?.tab ?? null, body: a === document.body };
  });
  check('they move in: the keyboard stays on the tabs, never in their new Claude screen', waiting.tab === 'claude' && !movedIn.inScreen && !movedIn.body && movedIn.tab === 'claude', JSON.stringify({ waiting, movedIn }));
  await page.evaluate(() => window.office.panels.close());
  await wait(400);

  check('no page errors', !errors(logs).length, errors(logs).join(' | '));
  await page.close();
} catch (err) {
  check('shell checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
