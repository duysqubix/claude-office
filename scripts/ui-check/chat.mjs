// Behaviour checks for client/src/ui (run by scripts/ui-check.mjs against /ui-kit.html).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = (await import('./base.mjs')).officeBase('UI_KIT_BASE');
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath, headless: true });
// Never report presence: a test tab must not make the office hold real sessions' permission prompts.
const newPage = browser.newPage.bind(browser);
browser.newPage = async () => {
  const p = await newPage();
  await p.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
  });
  return p;
};
const out = [];
const check = (n, ok, d = '') => { const l = `${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`; out.push(l); console.log(l); };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/ui-kit.html?only=tokens', { waitUntil: 'networkidle2' });

  // Set up a chat with a scriptable mock api inside the page.
  await page.evaluate(() => {
    const { openChat, ASK_BASH } = window.__kit;
    const iso = (t) => new Date(t).toISOString();
    const T = Date.now();
    const store = [
      { seq: 1, role: 'user', text: 'why is the door stuck?', ts: iso(T - 600000) },
      { seq: 2, role: 'tool', text: 'Searching for setDoorOpen', tool: 'Grep' },
      { seq: 3, role: 'tool', text: 'Reading world/index.ts', tool: 'Read' },
      { seq: 4, role: 'tool', text: 'Reading main.ts', tool: 'Read' },
      { seq: 5, role: 'assistant', text: 'Found it:\n\n1. one\n   - nested\n2. two\n3. three\n\n```ts\nconst x = 1;\n```', ts: iso(T - 590000) },
    ];
    let seq = 5;
    const calls = { chatter: 0, say: [], adopt: 0, interrupt: 0 };
    let failNext = null;
    const api = {
      async chatter(_id, q) { calls.chatter++; return q.after !== undefined ? store.filter((l) => l.seq > q.after) : store.slice(-(q.n ?? 60)); },
      async say(_id, text) {
        calls.say.push(text);
        await new Promise((r) => setTimeout(r, 150));
        if (failNext) { const e = failNext; failNext = null; return { ok: false, error: e }; }
        setTimeout(() => store.push({ seq: ++seq, role: 'user', text, ts: iso(Date.now()) }), 300);
        setTimeout(() => store.push({ seq: ++seq, role: 'assistant', text: 'On it!', ts: iso(Date.now()) }), 500);
        return { ok: true };
      },
      async interrupt() { calls.interrupt++; return { ok: true }; },
      async adopt() { calls.adopt++; return { ok: true }; },
      async answer() { return { ok: true }; },
      sit() {},
    };
    const host = document.createElement('div');
    host.style.cssText = 'height:700px;display:flex';
    document.body.prepend(host);
    const emp = { sessionId: 's1', pid: 1, name: 'c', displayName: 'Claudette', cwd: '/x', project: 'office', branch: 'main', kind: 'interactive', hosted: true, state: 'working', stateSince: T - 1000, interns: [], startedAt: T - 100000, activity: { kind: 'typing', label: 'Editing main.ts' } };
    const view = openChat(host, emp, api, { pollMs: 150 });
    window.__t = { view, api, calls, store, emp, setFail: (e) => (failNext = e), ASK_BASH };
  });
  await new Promise((r) => setTimeout(r, 600));

  const s1 = await page.evaluate(() => {
    const el = window.__t.view.el;
    const toggle = el.querySelector('.co-steps .co-step--toggle');
    const collapsedText = toggle?.textContent;
    toggle?.click();
    const chips = el.querySelectorAll('.co-steps .co-step:not(.co-step--toggle)').length;
    const ol = el.querySelector('.co-msg--assistant ol');
    return {
      collapsedText,
      chipsAfterExpand: chips,
      olItems: ol ? ol.querySelectorAll(':scope > li').length : -1,
      nested: !!el.querySelector('.co-msg--assistant ol li ul li'),
      code: el.querySelector('.co-msg--assistant pre code')?.textContent,
      typing: !el.querySelector('.co-typing').hidden && el.querySelector('.co-typing__label').textContent,
    };
  });
  check('3+ tool steps collapse into one chip', /3 steps/.test(s1.collapsedText ?? ''), s1.collapsedText);
  check('clicking the chip shows every step', s1.chipsAfterExpand === 3, String(s1.chipsAfterExpand));
  check('numbered list keeps its 3 items across a sub-bullet', s1.olItems === 3 && s1.nested, JSON.stringify(s1));
  check('fenced code renders', s1.code === 'const x = 1;', s1.code);
  check('typing indicator shows the activity', s1.typing === 'Editing main.ts', String(s1.typing));

  // Send: optimistic bubble, then reconciled (no duplicate), then the reply.
  await page.focus('.co-chat__input');
  await page.keyboard.type('run the door tests');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.keyboard.type('please');
  const draft = await page.$eval('.co-chat__input', (t) => t.value);
  check('Shift+Enter adds a line', draft === 'run the door tests\nplease', JSON.stringify(draft));
  await page.keyboard.press('Enter');
  const pendingNow = await page.evaluate(() => {
    const p = window.__t.view.el.querySelector('.co-msg.is-pending');
    return p ? p.textContent : null;
  });
  check('your message shows at once (pending)', !!pendingNow && pendingNow.includes('run the door tests'), pendingNow ?? 'none');
  await new Promise((r) => setTimeout(r, 1200));
  const after = await page.evaluate(() => {
    const el = window.__t.view.el;
    const users = [...el.querySelectorAll('.co-msg--user .co-msg__body')].map((b) => b.textContent);
    return {
      users,
      pending: el.querySelectorAll('.co-msg.is-pending').length,
      reply: [...el.querySelectorAll('.co-msg--assistant .co-msg__body')].map((b) => b.textContent).at(-1),
      input: el.querySelector('.co-chat__input').value,
      say: window.__t.calls.say,
    };
  });
  check('sent the multi-line text as typed', after.say[0] === 'run the door tests\nplease', JSON.stringify(after.say));
  check('reconciled: one bubble, none pending', after.users.filter((u) => u.startsWith('run the door tests')).length === 1 && after.pending === 0, JSON.stringify(after));
  check('the reply arrives in the feed', after.reply === 'On it!', after.reply);
  check('composer cleared after sending', after.input === '', JSON.stringify(after.input));

  // Esc gives the keys back to the game.
  await page.focus('.co-chat__input');
  await page.keyboard.press('Escape');
  const blurred = await page.evaluate(() => document.activeElement?.classList.contains('co-chat__input') === false);
  check('Esc blurs the composer', blurred);

  // Failed send → Edit puts the text back.
  await page.evaluate(() => window.__t.setFail('They have a question open.'));
  await page.focus('.co-chat__input');
  await page.keyboard.type('one more thing');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 400));
  const failed = await page.evaluate(() => {
    const el = window.__t.view.el;
    const f = el.querySelector('.co-msg.is-failed');
    const text = f?.querySelector('.co-msg__status')?.textContent;
    [...(f?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Edit')?.click();
    return { text, input: el.querySelector('.co-chat__input').value, stillThere: !!el.querySelector('.co-msg.is-failed') };
  });
  check('a refused send says why', /answer their question/.test(failed.text ?? ''), failed.text);
  check('Edit puts the text back in the composer', failed.input === 'one more thing' && !failed.stillThere, JSON.stringify(failed));

  // Needs you: the ask inline, send disabled even with text.
  const needs = await page.evaluate(async () => {
    const { view, emp, ASK_BASH } = window.__t;
    view.update({ ...emp, state: 'needs-you', ask: { ...ASK_BASH, createdAt: Date.now(), expiresAt: Date.now() + 60000 } });
    const el = view.el;
    return {
      askCard: !!el.querySelector('.co-chat__ask .co-ask'),
      sendDisabled: el.querySelector('.co-chat__send').disabled,
      hint: el.querySelector('.co-chat__hint').textContent,
      typingHidden: el.querySelector('.co-typing').hidden,
    };
  });
  check('needs you: the ask sits inline', needs.askCard);
  check('needs you: send is disabled', needs.sendDisabled === true);
  check('needs you: the hint says why', needs.hint === 'Answer their question above first.', needs.hint);
  check('needs you: no typing indicator', needs.typingHidden === true);

  // Keys inside the panel don't reach the game.
  const keys = await page.evaluate(() => {
    let reached = 0;
    const spy = (e) => { if (e.key === ' ') reached++; };
    window.addEventListener('keydown', spy);
    const btn = window.__t.view.el.querySelector('.co-chat__actions .co-btn:not([hidden])');
    btn.focus();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    window.removeEventListener('keydown', spy);
    return reached;
  });
  check('Space on a panel button never reaches the game', keys === 0, String(keys));

  // External → adopt → waiting → hosted.
  const ext = await page.evaluate(async () => {
    const { view, emp, calls } = window.__t;
    view.update({ ...emp, hosted: false, state: 'idle', ask: undefined, adopting: false });
    const el = view.el;
    const r = { composerHidden: el.querySelector('.co-chat__composer').hidden, adoptShown: !el.querySelector('.co-chat__adopt').hidden };
    [...el.querySelectorAll('.co-chat__adopt .co-btn')].find((b) => b.textContent.includes('Bring into the office'))?.click();
    await new Promise((res) => setTimeout(res, 50));
    r.adoptCalls = calls.adopt;
    r.waiting = el.querySelector('.co-chat__adopt-text').textContent;
    view.update({ ...emp, hosted: true, state: 'idle', adopting: false, ask: undefined });
    r.hostedComposer = !el.querySelector('.co-chat__composer').hidden && el.querySelector('.co-chat__adopt').hidden;
    return r;
  });
  check('external: adopt card instead of the composer', ext.composerHidden && ext.adoptShown, JSON.stringify(ext));
  check('Bring into the office calls adopt and waits', ext.adoptCalls === 1 && /Waiting for Claudette/.test(ext.waiting), ext.waiting);
  check('back as hosted: the live composer returns', ext.hostedComposer);

  // Hired in another office: never "Bring into the office" (that office has them), and it says why.
  const other = await page.evaluate(async () => {
    const { view, emp } = window.__t;
    view.update({ ...emp, hosted: false, otherOffice: true, state: 'idle', ask: undefined, adopting: false });
    const el = view.el;
    const visible = (b) => !b.hidden && b.getBoundingClientRect().width > 0;
    const bring = () => [...el.querySelectorAll('.co-btn')].some((b) => visible(b) && b.textContent.includes('Bring into the office'));
    const r = { footer: el.querySelector('.co-chat__adopt-text')?.textContent ?? '', bringChat: bring() };
    view.setMode('terminal');
    await new Promise((res) => setTimeout(res, 50));
    r.bringTerm = bring();
    view.setMode('chat');
    view.update({ ...emp, hosted: true, otherOffice: false, state: 'idle', adopting: false, ask: undefined });
    return r;
  });
  check('hired in another office: no "Bring into the office" anywhere, and it says why', !other.bringChat && !other.bringTerm && /another office/.test(other.footer), JSON.stringify(other));

  // Close stops polling.
  const polls = await page.evaluate(async () => {
    const { view, calls } = window.__t;
    view.close();
    const before = calls.chatter;
    await new Promise((r) => setTimeout(r, 600));
    return { before, after: calls.chatter, gone: !document.contains(view.el) };
  });
  check('close removes the panel and stops polling', polls.gone && polls.after === polls.before, JSON.stringify(polls));
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
