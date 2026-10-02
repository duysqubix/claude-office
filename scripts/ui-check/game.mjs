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
    window.__presence = [];
    WebSocket.prototype.send = function (d) {
      // Presence never leaves a test tab (it could make the office hold real prompts); we only note it.
      if (typeof d === 'string' && d.includes('"presence"')) {
        try {
          window.__presence.push(JSON.parse(d));
        } catch {
          // not JSON
        }
        return;
      }
      return send.call(this, d);
    };
    // The tree is edited live by other agents: no hot reload may restart the office mid-check.
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
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
  const sweep = async () => {
    const yaw0 = await page.evaluate(() => window.office.camera.yaw);
    for (let k = 0; k < 8 && !edges.length; k++) {
      await page.evaluate((y) => (window.office.camera.yaw = y), yaw0 + (k * Math.PI) / 4);
      await wait(900);
      edges = await page.evaluate(() => [...document.querySelectorAll('.co-edge')].map((b) => b.getAttribute('aria-label')));
    }
  };
  await sweep();
  if (!edges.length) {
    // Whoever needs you may be standing right by the manager: step well away and look again.
    await page.evaluate(() => {
      const o = window.office;
      const who = o.director.list().find((e) => e.handUp);
      if (!who) return;
      const away = o.manager.position.clone().sub(who.position).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      o.manager.teleport(who.position.clone().add(away.normalize().multiplyScalar(9)).setY(0), o.manager.yaw);
    });
    await wait(600);
    await sweep();
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
  // Who closes panels (for a failure report).
  await page.evaluate(() => {
    const host = window.office.panels;
    const close = host.close.bind(host);
    window.__closes = [];
    host.close = () => {
      window.__closes.push(new Error('close').stack.split('\n').slice(2, 6).join(' < '));
      close();
    };
  });
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
  // Let go: an in-place confirm; Esc backs out of the confirm, not the panel.
  await page.evaluate(() => [...document.querySelectorAll('.co-panel--person .co-panel__foot .co-btn')].find((b) => b.textContent.trim() === 'Let go')?.click());
  await wait(200);
  const confirmShown = await page.evaluate(() => ({ confirm: !!document.querySelector('.co-confirm'), focus: document.activeElement?.textContent?.trim() }));
  await page.keyboard.press('Escape');
  await wait(250);
  const afterConfirmEsc = await page.evaluate(() => ({ open: window.office.panels.openId, confirm: !!document.querySelector('.co-confirm') }));
  check('Let go asks first (Keep them focused); Esc backs out of the confirm only', confirmShown.confirm && confirmShown.focus === 'Keep them' && afterConfirmEsc.open === 'employee' && !afterConfirmEsc.confirm, JSON.stringify({ confirmShown, afterConfirmEsc }));
  await focusGame(page);
  await page.keyboard.press('KeyE');
  await wait(700);
  const chat = await page.evaluate(() => ({
    open: window.office.panels.openId,
    focused: document.activeElement?.classList.contains('co-chat__input') ?? false,
    composer: !document.querySelector('.co-chat__composer')?.hidden,
  }));
  const closes = await page.evaluate(() => window.__closes.join(' || '));
  check('E on the employee panel opens the chat with the composer focused', chat.open === 'chat' && chat.focused && chat.composer, `${JSON.stringify(chat)} closes: ${closes}`);
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

  // Quick terminal (T): their live terminal in the chat panel, no walking or sitting.
  const pos0 = await page.evaluate(() => window.office.manager.position.toArray());
  // Keys pressed right as it opens never reach their terminal (a reflexive Enter can't answer a prompt).
  await page.evaluate((id) => window.office.panels.peek(id), hosted.id);
  await page.keyboard.type('zzz');
  await wait(900);
  const early = await page.evaluate(() => ({
    rows: document.querySelector('.co-chat__term .xterm-rows')?.textContent ?? '',
    interrupt: [...document.querySelectorAll('.co-chat__termbar .co-btn')].some((b) => b.textContent.trim() === 'Interrupt'),
  }));
  check('the quick look ignores keys for its first moment; Interrupt sits by the terminal', !/zzz/.test(early.rows) && early.interrupt, JSON.stringify({ interrupt: early.interrupt, typed: /zzz/.test(early.rows) }));
  await page.evaluate(() => window.office.panels.close());
  await wait(300);
  // Mounted and attaching at once; the demo's pretend connection then waits 350 ms on purpose.
  const peekMs = await page.evaluate(async (id) => {
    const t0 = performance.now();
    window.office.panels.peek(id);
    const out = { mounted: -1, text: -1 };
    return await new Promise((res) => {
      const look = () => {
        const xt = document.querySelector('.co-chat__term .xterm');
        if (out.mounted < 0 && xt && xt.getBoundingClientRect().width > 300) out.mounted = Math.round(performance.now() - t0);
        const txt = document.querySelector('.co-chat__term .xterm-rows')?.textContent ?? '';
        if (txt.trim().length > 10) {
          out.text = Math.round(performance.now() - t0);
          res(out);
        } else if (performance.now() - t0 > 4000) res(out);
        else requestAnimationFrame(look);
      };
      look();
    });
  }, hosted.id);
  await wait(300);
  const peek = await page.evaluate(() => ({
    open: window.office.panels.openId,
    wide: document.querySelector('.co-panel--chat.co-panel--term')?.getBoundingClientRect().width ?? 0,
    focus: document.activeElement?.classList.contains('xterm-helper-textarea') ?? false,
    pressed: document.querySelector('.co-seg__btn[aria-pressed="true"]')?.textContent.trim(),
    walking: window.office.manager.autoWalking,
  }));
  check('T shows the terminal at once (< 300 ms) and their screen follows', peekMs.mounted >= 0 && peekMs.mounted < 300 && peekMs.text >= 0 && peekMs.text < 350 + 300, JSON.stringify(peekMs));
  check('terminal mode: wide panel, terminal focused, no walk', peek.open === 'chat' && peek.wide > 800 && peek.focus && !peek.walking && peek.pressed?.startsWith('Terminal'), JSON.stringify(peek));
  await page.keyboard.press('KeyW');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyQ');
  await wait(400);
  const typed = await page.evaluate((p0) => ({
    open: window.office.panels.openId,
    // A key reaching the game would walk the manager a metre or more (and close the panel);
    // a passing regular can still nudge them a little.
    moved: window.office.manager.position.distanceTo(new window.office.manager.position.constructor(...p0)) > 0.5,
    rows: document.querySelector('.co-chat__term .xterm-rows')?.textContent ?? '',
  }), pos0);
  check('game keys go to the terminal, not the game', typed.open === 'chat' && !typed.moved && /weq/.test(typed.rows.replace(/\s+/g, '')), JSON.stringify({ open: typed.open, moved: typed.moved }));
  await shot(page, '2b-terminal-panel');
  await page.keyboard.press('Escape');
  await wait(300);
  const back = await page.evaluate(() => ({
    open: window.office.panels.openId,
    term: !!document.querySelector('.co-panel--term'),
    feed: document.querySelector('.co-chat__feed')?.hidden === false,
    xterm: !!document.querySelector('.co-chat__term .xterm'),
    focus: document.activeElement?.className,
  }));
  check('Esc leaves the terminal for the chat (panel stays)', back.open === 'chat' && !back.term && back.feed && !back.xterm, JSON.stringify(back));
  const tKey = await page.evaluate(() => /peek/.test(String(window.office.panels.peek)));
  await page.keyboard.press('KeyT');
  await wait(500);
  const flip = await page.evaluate(() => !!document.querySelector('.co-panel--term .xterm'));
  if (flip) check('T flips back to the terminal', flip);
  else {
    await page.evaluate(() => window.office.panels.peek());
    await wait(500);
    check('peek() flips back to the terminal (T key not bound in main.ts yet)', await page.evaluate(() => !!document.querySelector('.co-panel--term .xterm')), String(tKey));
  }
  await page.evaluate(() => [...document.querySelectorAll('.co-seg__btn')].find((b) => b.textContent.startsWith('Chat'))?.click());
  await wait(300);
  check('the Chat button switches back', await page.evaluate(() => !document.querySelector('.co-panel--term') && document.querySelector('.co-chat__feed')?.hidden === false));
  await page.evaluate(() => window.office.panels.close());
  await wait(300);
  // Not office-hosted: no tmux to show; say so and offer to bring them in.
  await page.evaluate((id) => window.office.panels.peek(id), external.id);
  await wait(500);
  const extTerm = await page.evaluate(() => ({
    note: document.querySelector('.co-chat__termnote')?.textContent ?? '',
    xterm: !!document.querySelector('.co-chat__term .xterm'),
    button: document.querySelector('.co-chat__termnote .co-btn')?.textContent.trim(),
  }));
  check('external terminal mode explains and offers "Bring into the office"', /runs in their own terminal/.test(extTerm.note) && !extTerm.xterm && extTerm.button === 'Bring into the office', JSON.stringify(extTerm));
  await shot(page, '2b-terminal-external');
  await page.evaluate(() => window.office.panels.close());
  // T from anywhere: the nearest (or targeted) person's terminal, straight away.
  await wait(300);
  await focusGame(page);
  await page.keyboard.press('KeyT');
  await wait(600);
  const anywhere = await page.evaluate(() => ({ open: window.office.panels.openId, term: !!document.querySelector('.co-panel--term'), walking: window.office.manager.autoWalking }));
  check('T in the office opens someone\'s terminal without walking', anywhere.open === 'chat' && anywhere.term && !anywhere.walking, JSON.stringify(anywhere));
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
  // A go-to (focus: false) never puts focus in the card: one digit must not be able to approve.
  await focusGame(page);
  await page.evaluate((id) => window.office.panels.openAsk(id, { focus: false }), asker.id);
  await wait(500);
  const goToFocus = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
  check('a go-to leaves focus on the game, not the ask card', goToFocus === 'scene', String(goToFocus));
  await page.evaluate((id) => window.office.panels.openAsk(id), asker.id);
  await wait(500);
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
  await wait(2600);
  const arrival = await page.evaluate(() => [...document.querySelectorAll('.co-toast')].map((t) => t.textContent).join(' | '));
  check('the new hire arrives with their own toast, not "clocked in"', /just started on new-thing/.test(arrival) && !/clocked in for new-thing/.test(arrival), arrival);

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

  // ------------------------------------------------------------------ offline + "Got it" (fresh office)
  {
    const o = await open(`${BASE}/?demo=1&quiet=1&debug=1`);
    const op = o.page;
    const ppl = await roster(op);
    const host = ppl.find((p) => p.hosted && p.state !== 'needs-you');
    const asker2 = ppl.find((p) => !p.hosted && p.ask === 'permission');
    const state = (sel) => op.evaluate((s) => [...document.querySelectorAll(s)].map((b) => ({ text: b.textContent.trim(), off: b.dataset.offline === 'true', aria: b.getAttribute('aria-disabled'), tip: b.getAttribute('data-co-tip') })), sel);

    // Their panel: Let go and Sit disable with the reason; a click does nothing.
    await op.evaluate((id) => window.office.panels.openEmployee(id), host.id);
    await wait(400);
    await op.evaluate(() => window.officeOffline(true));
    await wait(100);
    const foot = await state('.co-panel--person .co-panel__foot .co-btn');
    const letGo = foot.find((b) => b.text === 'Let go');
    const sitB = foot.find((b) => b.text.startsWith('Sit at'));
    const talkB = foot.find((b) => b.text.startsWith('Talk'));
    check('offline: Let go and Sit disable and say why; Talk still works', letGo?.off && letGo.aria === 'true' && /Offline/.test(letGo.tip ?? '') && sitB?.off && !talkB?.off, JSON.stringify(foot));
    await op.evaluate(() => [...document.querySelectorAll('.co-panel--person .co-panel__foot .co-btn')].find((b) => b.textContent.trim() === 'Let go')?.click());
    await wait(200);
    check('offline: clicking Let go does nothing', await op.evaluate(() => !document.querySelector('.co-confirm')));

    // Chat: Send disables, Enter keeps the draft, the hint says why.
    await op.evaluate((id) => window.office.panels.openChat(id), host.id);
    await wait(900);
    await op.focus('.co-chat__input');
    await op.keyboard.type('are you there?');
    await op.keyboard.press('Enter');
    await wait(400);
    const chatOff = await op.evaluate(() => ({
      send: document.querySelector('.co-chat__send')?.dataset.offline,
      draft: document.querySelector('.co-chat__input')?.value,
      pending: document.querySelectorAll('.co-msg.is-pending').length,
      hint: document.querySelector('.co-chat__hint')?.textContent,
    }));
    check('offline: chat Send disables, Enter keeps the draft, the hint says why', chatOff.send === 'true' && chatOff.draft === 'are you there?' && chatOff.pending === 0 && /Offline/.test(chatOff.hint ?? ''), JSON.stringify(chatOff));

    // Hire: picking still works, hiring doesn't.
    await op.evaluate(() => window.office.panels.open('hire'));
    await wait(500);
    await op.keyboard.type('~/somewhere/offline-test');
    await op.keyboard.press('Enter');
    await op.keyboard.type('x');
    await op.keyboard.press('Enter');
    await wait(500);
    const hireOff = await op.evaluate(() => ({
      open: window.office.panels.openId,
      btn: document.querySelector('.co-panel--hire .co-panel__foot .co-btn')?.dataset.offline,
      toasts: [...document.querySelectorAll('.co-toast')].map((t) => t.textContent).join(' | '),
    }));
    check('offline: Hire disables and Enter does not hire', hireOff.open === 'hire' && hireOff.btn === 'true' && !/Interview went great/.test(hireOff.toasts), JSON.stringify(hireOff));

    // Personnel files and the ask card.
    await op.evaluate(() => window.office.panels.open('archive'));
    await wait(800);
    const files = await state('.co-panel--files .co-file .co-btn');
    check('offline: Call back in disables', files.filter((b) => b.text === 'Call back in').every((b) => b.off) && files.some((b) => b.text === 'Call back in'), `${files.length} rows`);
    await op.evaluate((id) => window.office.panels.openAsk(id), asker2.id);
    await wait(500);
    await op.keyboard.press('Digit1');
    await wait(500);
    const askOff = await op.evaluate(() => ({
      off: [...document.querySelectorAll('.co-ask__opt')].every((b) => b.dataset.offline === 'true'),
      folded: !!document.querySelector('.co-panel--person .co-ask.is-folded'),
    }));
    check('offline: ask answers disable; 1 answers nothing', askOff.off && !askOff.folded, JSON.stringify(askOff));

    // Back online: everything comes back.
    await op.evaluate(() => window.officeOffline(false));
    await wait(100);
    const askOn = await op.evaluate(() => [...document.querySelectorAll('.co-ask__opt')].map((b) => ({ off: b.dataset.offline, aria: b.getAttribute('aria-disabled'), tip: b.getAttribute('data-co-tip') })));
    check('online again: the ask buttons come back', askOn.length > 0 && askOn.every((b) => !b.off && b.aria === null && !/Offline/.test(b.tip ?? '')), JSON.stringify(askOn));

    // Got it: their own terminal, no question in the office (the ask went back to their terminal).
    await op.evaluate(() => [...document.querySelectorAll('.co-ask__opt')].find((b) => b.dataset.choice === 'terminal')?.click());
    await wait(1200);
    const note = await op.evaluate(() => ({
      text: document.querySelector('.co-panel--person .co-needsnote')?.textContent ?? '',
      gotIt: !!document.querySelector('.co-panel--person .co-needsnote .co-btn'),
    }));
    check('their own terminal: the needs-you note offers "Got it"', /your own terminal/.test(note.text) && note.gotIt, JSON.stringify(note));
    await op.evaluate(() => document.querySelector('.co-panel--person .co-needsnote .co-btn')?.click());
    await wait(200);
    const afterGot = await op.evaluate(() => document.querySelector('.co-panel--person .co-needsnote')?.hidden);
    await op.evaluate(() => window.office.panels.close());
    await wait(250);
    await op.evaluate((id) => window.office.panels.openEmployee(id), asker2.id);
    await wait(400);
    const reopened = await op.evaluate(() => document.querySelector('.co-panel--person .co-needsnote')?.hidden);
    check('"Got it" puts the note away, and it stays away for this wait', afterGot === true && reopened === true, JSON.stringify({ afterGot, reopened }));
    check('no page errors (offline and Got it)', !o.logs.some((l) => l.startsWith('[pageerror]')), o.logs.filter((l) => l.startsWith('[pageerror]')).join(' | '));
    await op.close();
  }

  // ------------------------------------------------------------------ thought bubbles (fresh office)
  {
    const o = await open(`${BASE}/?demo=1&quiet=1&debug=1&regulars=lively`);
    const tp = o.page;
    // Someone near the manager who doesn't need you.
    // Someone on screen (an off-screen head shows no bubble) and close, who doesn't need you.
    const thinker = await tp.evaluate(() => {
      const of = window.office;
      const onScreen = (x) => {
        const v = x.labelAnchor.getWorldPosition(x.position.clone()).project(of.engine.camera);
        return v.z < 1 && Math.abs(v.x) < 0.8 && v.y > -0.8 && v.y < 0.5;
      };
      const e = of.director
        .list()
        .filter((x) => !x.handUp && x.phase === 'seated' && onScreen(x))
        .sort((a, b) => a.position.distanceTo(of.manager.position) - b.position.distanceTo(of.manager.position))[0];
      return { id: e.data.sessionId, name: e.data.displayName };
    });
    const cloudOf = (name) =>
      tp.evaluate((n) => {
        const pill = [...document.querySelectorAll('.co-tagstack .co-pill')].find((p) => p.textContent.trim() === n);
        const c = pill?.closest('.co-tagstack')?.querySelector('.co-thought');
        if (!c) return null;
        const cs = getComputedStyle(c);
        return { shown: !c.hidden, text: c.querySelector('.co-thought__text')?.textContent, puffs: c.querySelectorAll('.co-thought__puff').length, italic: cs.fontStyle, imgs: c.querySelectorAll('img').length };
      }, name);
    await tp.evaluate((id) => window.officeThink(id, 'Come on server, time to think out loud.'), thinker.id);
    await wait(600);
    const c1 = await cloudOf(thinker.name);
    check('a session thought shows as a cloud: italic words, three trailing puffs', !!c1?.shown && c1.text === 'Come on server, time to think out loud.' && c1.puffs === 3 && c1.italic === 'italic', JSON.stringify(c1));
    await shot(tp, 'thought-session');
    await wait(6200);
    const c1b = await cloudOf(thinker.name);
    // (The demo's own pretend thoughts may land on them meanwhile: that's a new thought, not this one.)
    check('the thought fades after about 6 s', c1b && (!c1b.shown || c1b.text !== 'Come on server, time to think out loud.'), JSON.stringify(c1b));

    // Hostile text stays text.
    await tp.evaluate((id) => window.officeThink(id, '<img src=x onerror="window.__xss=9"> **not bold** \u202eevil'), thinker.id);
    await wait(500);
    const c2 = await cloudOf(thinker.name);
    const xss = await tp.evaluate(() => window.__xss ?? null);
    check('a thought is plain text (no markup runs)', !!c2?.shown && c2.imgs === 0 && xss === null && (c2.text ?? '').includes('<img src=x onerror='), JSON.stringify({ c2, xss }));

    // Needs-you beats a thought.
    const asker3 = await tp.evaluate(() => window.office.director.list().find((x) => x.handUp)?.data.displayName ?? null);
    if (asker3) {
      await tp.evaluate((n) => {
        const e = window.office.director.list().find((x) => x.data.displayName === n);
        window.officeThink(e.data.sessionId, 'This should never cover the question.');
      }, asker3);
      await wait(500);
      const c3 = await cloudOf(asker3);
      const needs = await tp.evaluate((n) => {
        const pill = [...document.querySelectorAll('.co-tagstack .co-pill')].find((p) => p.textContent.trim() === n);
        return !!pill?.closest('.co-tagstack')?.querySelector('.co-bubble--needs:not([hidden])');
      }, asker3);
      check('needs-you beats a thought (no cloud over a raised hand)', (!c3 || !c3.shown) && needs, JSON.stringify({ c3, needs }));
    } else check('needs-you beats a thought (no one needs you in this demo run)', false);

    // Regulars daydream on their own (first one within ~16 s), where you can see them: stand
    // the manager by one and look at them.
    await tp.evaluate(() => {
      const of = window.office;
      const r = of.regulars.list().find((x) => x.phase === 'seated');
      if (!r) return;
      of.manager.teleport(r.position.clone().add(r.position.clone().sub(of.manager.position).setY(0).normalize().multiplyScalar(-2.2)).setY(0), of.manager.yaw);
      const head = r.labelAnchor.getWorldPosition(r.position.clone());
      of.camera.snapShot({ position: head.clone().add(head.clone().set(0, 1.6, 4)), look: head });
    });
    let dream = null;
    for (let i = 0; i < 24 && !dream; i++) {
      await wait(1000);
      dream = await tp.evaluate(() => {
        const c = [...document.querySelectorAll('.co-tagstack')].find((s) => s.querySelector('.co-pill--regular') && s.querySelector('.co-thought:not([hidden])'));
        return c ? c.querySelector('.co-thought__text')?.textContent : null;
      });
    }
    check('a regular daydreams now and then', !!dream, String(dream));
    if (dream) await shot(tp, 'thought-daydream');
    await tp.evaluate(() => window.office.camera.setShot(null));

    // Help → Thought bubbles off: nothing shows (and the switch is saved).
    await tp.evaluate(() => window.office.panels.open('help'));
    await wait(400);
    await tp.evaluate(() => [...document.querySelectorAll('.co-panel--help label')].find((l) => l.textContent.includes('Thought bubbles'))?.querySelector('input')?.click());
    await wait(300);
    await tp.evaluate((id) => window.officeThink(id, 'Nobody should see this.'), thinker.id);
    await wait(500);
    const off = await tp.evaluate(() => ({ shown: document.querySelectorAll('.co-thought:not([hidden]):not(.is-out)').length, saved: localStorage.getItem('claude-office:thoughts') }));
    check('Thought bubbles off: none show, and the switch is saved', off.shown === 0 && off.saved === '0', JSON.stringify(off));
    await tp.evaluate(() => [...document.querySelectorAll('.co-panel--help label')].find((l) => l.textContent.includes('Thought bubbles'))?.scrollIntoView({ block: 'center' }));
    await wait(200);
    await shot(tp, 'thought-help');
    await tp.evaluate(() => [...document.querySelectorAll('.co-panel--help label')].find((l) => l.textContent.includes('Thought bubbles'))?.querySelector('input')?.click());
    check('no page errors (thoughts)', !o.logs.some((l) => l.startsWith('[pageerror]')), o.logs.filter((l) => l.startsWith('[pageerror]')).join(' | '));
    await tp.close();
  }

  // Bubbles stay whole on screen: a head at each edge of the window still has its whole bubble
  // inside (12 px margin), clear of the HUD's corners, with the tail or puffs toward the head.
  {
    const o = await open(`${BASE}/?demo=1&quiet=1&debug=1`);
    const bp = o.page;
    const who = await bp.evaluate(() => {
      const of = window.office;
      const e = of.director.list().find((x) => !x.handUp && x.phase === 'seated');
      of.manager.teleport(e.position.clone().add(e.position.clone().sub(of.manager.position).setY(0).normalize().multiplyScalar(-1.6)).setY(0), of.manager.yaw);
      return e.data.sessionId;
    });
    // Aim a fixed camera so their head lands at (tx, ty) on screen (a few bisection steps).
    const aim = (tx, ty) =>
      bp.evaluate(
        async (id, tx, ty) => {
          const of = window.office;
          const cam = of.engine.camera;
          const e = of.director.list().find((x) => x.data.sessionId === id);
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const head = e.labelAnchor.getWorldPosition(e.position.clone());
          const pos = head.clone().add(head.clone().set(0, 1.4, 3.6));
          const dir = head.clone().sub(pos).normalize();
          const right = dir.clone().cross(head.clone().set(0, 1, 0)).normalize();
          const up = right.clone().cross(dir).normalize();
          const screen = async (kx, ky) => {
            of.camera.snapShot({ position: pos, look: head.clone().addScaledVector(right, kx).addScaledVector(up, ky) });
            await frame();
            const v = e.labelAnchor.getWorldPosition(head.clone()).project(cam);
            return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
          };
          let kx = 0;
          let ky = 0;
          for (let round = 0; round < 3; round++) {
            let lo = -6, hi = 6;
            for (let i = 0; i < 14; i++) {
              kx = (lo + hi) / 2;
              const s = await screen(kx, ky);
              if (s.x > tx) lo = kx;
              else hi = kx;
            }
            lo = -6;
            hi = 6;
            for (let i = 0; i < 14; i++) {
              ky = (lo + hi) / 2;
              const s = await screen(kx, ky);
              if (s.y < ty) lo = ky;
              else hi = ky;
            }
          }
          return screen(kx, ky);
        },
        who,
        tx,
        ty,
      );
    const vw = 1440;
    const vh = 900;
    const spots = { left: [26, 470], right: [vw - 26, 470], top: [vw / 2, 70], bottom: [vw / 2, vh - 30], 'top-left (under the HUD)': [150, 210], 'top-right (under the buttons)': [vw - 120, 110] };
    const bad = [];
    const seen = [];
    for (const [edge, [tx, ty]] of Object.entries(spots)) {
      const head = await aim(tx, ty);
      await bp.evaluate((id) => window.officeThink(id, 'A long thought about the integration test, right at the edge of the screen.'), who);
      await wait(700);
      const r = await bp.evaluate((hx) => {
        const vw = innerWidth;
        const vh = innerHeight;
        const zones = [...document.querySelectorAll('.co-hud__badge, .co-hud__needs > *, .co-hud__row, .co-hud__right')].map((z) => z.getBoundingClientRect()).filter((z) => z.width > 0);
        const boxes = [...document.querySelectorAll('.co-bubble:not([hidden]), .co-thought:not([hidden])')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => {
          const r = b.getBoundingClientRect();
          const inside = r.left >= 10.5 && r.right <= vw - 10.5 && r.top >= 10.5 && r.bottom <= vh - 10.5;
          const clearHud = zones.every((z) => r.right <= z.left || r.left >= z.right || r.bottom <= z.top || r.top >= z.bottom);
          return { cls: b.className.split(' ')[0], l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), inside, clearHud };
        });
        const cloud = [...document.querySelectorAll('.co-thought:not([hidden])')].find((c) => c.textContent.includes('right at the edge'));
        const puff = cloud?.querySelector('.co-thought__puff')?.getBoundingClientRect();
        const cr = cloud?.getBoundingClientRect();
        // Slid sideways to stay on screen, the puffs still lean from the cloud's middle toward the head.
        const mid = cr ? (cr.left + cr.right) / 2 : hx;
        const toward = !cloud || !puff || Math.abs(mid - hx) < 24 || Math.abs(puff.left - hx) < Math.abs(mid - hx);
        return { boxes, shown: !!cloud, toward };
      }, head.x);
      seen.push(`${edge}:${r.shown ? 'shown' : 'none'}`);
      for (const b of r.boxes) if (!b.inside || !b.clearHud) bad.push({ edge, head, ...b });
      if (!r.shown || !r.toward) bad.push({ edge, head, shown: r.shown, toward: r.toward });
      if (edge === 'right') await shot(bp, 'thought-edge-right');
    }
    check('a head at each edge keeps its whole bubble on screen, clear of the HUD, puffs toward the head', bad.length === 0, JSON.stringify(bad.length ? bad : seen));
    // A head off the screen: no thought (it would only show as a sliver).
    await aim(-80, 470);
    await bp.evaluate((id) => window.officeThink(id, 'Nobody can see me think this.'), who);
    await wait(600);
    const offscreen = await bp.evaluate(() => [...document.querySelectorAll('.co-thought:not([hidden])')].some((c) => c.textContent.includes('Nobody can see')));
    check('a head off the screen shows no thought', !offscreen);
    await bp.evaluate(() => window.office.camera.setShot(null));
    await bp.close();
  }

  // Thought bubbles off tells the office to stop thinking (presence thoughts:false). Live page,
  // read-only: presence is only recorded, never sent, and nothing is posted.
  {
    const lv = await open(`${BASE}/?debug=1`, { live: true });
    await wait(800);
    const first = await lv.page.evaluate(() => window.__presence.at(-1) ?? null);
    await lv.page.evaluate(() => window.office.panels.open('help'));
    await wait(300);
    await lv.page.evaluate(() => [...document.querySelectorAll('.co-panel--help label')].find((l) => l.textContent.includes('Thought bubbles'))?.querySelector('input')?.click());
    await wait(300);
    const after = await lv.page.evaluate(() => window.__presence.at(-1) ?? null);
    check('presence says thoughts:true, and Help → off sends thoughts:false at once', first?.thoughts === true && after?.thoughts === false, JSON.stringify({ first, after }));
    await lv.page.evaluate(() => [...document.querySelectorAll('.co-panel--help label')].find((l) => l.textContent.includes('Thought bubbles'))?.querySelector('input')?.click());
    await wait(200);
    check('live: nothing was posted (thoughts)', lv.posts.length === 0, lv.posts.join(' | '));
    await lv.page.close();
  }

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
