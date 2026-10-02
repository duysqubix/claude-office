// Behaviour checks for client/src/ui (run by scripts/ui-check.mjs against /ui-kit.html).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));

const URL = BASE + '/ui-kit.html';
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
});
const results = [];
const check = (name, ok, detail = "") => { const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`; results.push(line); console.log(line); };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  check('no page errors', !logs.some((l) => l.startsWith('[pageerror]') || l.startsWith('[error]')), logs.filter((l) => l.includes('error')).join(' | '));

  // Failed answer shows the error and keeps the card.
  const err = await page.$$eval('.co-ask__error', (els) => els.filter((e) => !e.hidden).map((e) => e.textContent));
  check('failed answer shows its error', err.some((t) => t === "Couldn't answer: they already answered in their terminal"), JSON.stringify(err));

  // Folded lines.
  const done = await page.$$eval('.co-ask__done', (els) => els.map((e) => e.textContent.trim()));
  for (const t of ['Allowed', 'Answered in their terminal.', 'Moved to their terminal.']) check(`folded line "${t}"`, done.includes(t), JSON.stringify(done));

  // Number keys: ignored unless the card has focus.
  const before = logs.filter((l) => l.includes('/api/answer')).length;
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('1');
  await new Promise((r) => setTimeout(r, 900));
  const afterBody = logs.filter((l) => l.includes('/api/answer')).length;
  check('"1" with focus on the page answers nothing', afterBody === before, `${before} -> ${afterBody}`);

  // Focus the first permission card in the ask section and press 1 → Allow is sent, card folds.
  const cardIndex = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#ask .co-ask')];
    const i = cards.findIndex((c) => c.dataset.kind === 'permission' && !c.classList.contains('is-folded') && c.querySelector('[data-choice="allow"]'));
    cards[i].focus();
    return i;
  });
  await page.keyboard.press('1');
  await new Promise((r) => setTimeout(r, 1200));
  const sent = logs.filter((l) => l.includes('/api/answer'));
  check('"1" with the card focused sends allow', sent.length === before + 1 && sent.at(-1).includes('"choice":"allow"'), sent.at(-1) ?? 'none');
  const folded = await page.evaluate((i) => [...document.querySelectorAll('#ask .co-ask')][i].querySelector('.co-ask__done')?.textContent.trim(), cardIndex);
  check('that card folded to "Allowed"', folded === 'Allowed', folded);

  // Keep planning is two steps: first click opens the note, second sends revise + message.
  await page.evaluate(() => {
    const plan = document.querySelector('#ask .co-ask[data-kind="plan"]');
    plan.querySelector('[data-choice="revise"]').click();
  });
  const noteOpen = await page.evaluate(() => {
    const plan = document.querySelector('#ask .co-ask[data-kind="plan"]');
    return { hidden: plan.querySelector('.co-ask__note').hidden, label: plan.querySelector('[data-choice="revise"]').textContent };
  });
  check('Keep planning opens the note first', noteOpen.hidden === false && noteOpen.label.includes('Send back to planning'), JSON.stringify(noteOpen));
  await page.type('#ask .co-ask[data-kind="plan"] .co-ask__note input', 'Split the test into two');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 1200));
  const revise = logs.filter((l) => l.includes('"choice":"revise"')).at(-1) ?? '';
  check('Enter in the note sends revise with the message', revise.includes('"message":"Split the test into two"'), revise);

  // Questions: Send answers stays disabled until every question has a pick; answers are comma-joined.
  const q = await page.evaluate(() => {
    const card = document.querySelector('#ask .co-ask[data-kind="question"]');
    const send = card.querySelector('[data-choice="answer"]');
    const disabledFirst = send.disabled;
    const boxes = card.querySelectorAll('input[type="checkbox"]');
    boxes[0].click();
    boxes[2].click();
    return { disabledFirst, disabledAfter: send.disabled };
  });
  check('Send answers waits for every question', q.disabledFirst === true && q.disabledAfter === false, JSON.stringify(q));
  await page.evaluate(() => document.querySelector('#ask .co-ask[data-kind="question"] [data-choice="answer"]').click());
  await new Promise((r) => setTimeout(r, 1200));
  const ans = logs.filter((l) => l.includes('"choice":"answer"')).at(-1) ?? '';
  check('answers map question → labels, comma-joined', ans.includes('"What should the first tests cover?":"Roster diffing, The hire API"') && ans.includes('"Which test runner should I set up?":"Vitest"'), ans);

  // Toast stack: max 3, merge by key.
  const toasts = await page.evaluate(async () => {
    const { ToastStack } = window.__kit;
    const host = document.createElement('div');
    document.body.append(host);
    const s = new ToastStack(host);
    for (let i = 0; i < 5; i++) s.show({ text: `t${i}` });
    await new Promise((r) => setTimeout(r, 300));
    const count = s.el.querySelectorAll('.co-toast:not(.is-out)').length;
    s.clear();
    for (const n of ['Clyde', 'Klaus', 'Clod']) s.show({ text: `${n} clocked in`, key: 'arrive', merged: (k) => `${k} people clocked in` });
    const merged = [...s.el.querySelectorAll('.co-toast:not(.is-out)')].map((t) => t.textContent.trim());
    return { count, merged };
  });
  check('toast stack keeps at most 3', toasts.count === 3, String(toasts.count));
  check('3 clock-ins merge into one toast', toasts.merged.length === 1 && toasts.merged[0] === '3 people clocked in', JSON.stringify(toasts.merged));

  // Edge markers: one per off-screen person (merged pairs count once), each clickable.
  const edges = await page.$$eval('#edges .co-edge', (els) => els.map((e) => e.getAttribute('aria-label')));
  check('edge markers rendered', edges.length >= 5, `${edges.length}: ${edges.join(' | ')}`);
  await page.evaluate(() => document.querySelector('#edges .co-edge').click());
  await new Promise((r) => setTimeout(r, 200));
  check('clicking an edge marker calls go-to', logs.some((l) => l.includes('[ui-kit] go to')), '');

  // Bus: a throwing listener doesn't stop the others.
  const bus = await page.evaluate(async () => {
    const { Bus } = window.__kit;
    const b = new Bus();
    const got = [];
    b.on('jump', () => {
      throw new Error('boom');
    });
    b.on('jump', () => got.push('second'));
    const off = b.on('jump', () => got.push('third'));
    b.emit('jump');
    off();
    b.emit('jump');
    return got;
  });
  check('bus isolates a failing listener; off() works', JSON.stringify(bus) === JSON.stringify(['second', 'third', 'second']), JSON.stringify(bus));

  // Tab title + favicon helper.
  const title = await page.title();
  check('setTabAlert sets "(2) …" title', title === '(2) Claude Office UI kit', title);
} finally {
  await browser.close();
}
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
