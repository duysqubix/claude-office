// Behaviour checks for client/src/ui (run by scripts/ui-check.mjs against /ui-kit.html).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath, headless: true });
const out = [];
const check = (n, ok, d = '') => { const l = `${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`; out.push(l); console.log(l); };
try {
  const page = await browser.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(e.message));
  await page.goto(BASE + '/ui-kit.html?only=ask', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));

  const r = await page.evaluate(async () => {
    const { renderAsk, ASK_BASH, ASK_QUESTION, placeEdge, THREE } = window.__kit;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const host = document.createElement('div');
    document.body.append(host);
    const res = {};

    // 1. settle('elsewhere') while the answer is in flight → the real outcome wins.
    let settled = [];
    const slow = () => new Promise((ok) => setTimeout(() => ok({ ok: true }), 400));
    const v1 = renderAsk(host, { ...ASK_BASH, id: 'd1', createdAt: Date.now(), expiresAt: Date.now() + 60000 }, slow, { onSettled: (o, c) => settled.push(o + ':' + c) });
    v1.el.querySelector('[data-choice="allow"]').click();
    v1.settle('elsewhere');
    await wait(600);
    res.deferredSuccess = v1.el.querySelector('.co-ask__done')?.textContent.trim();
    res.settledEvents = settled.join(',');

    // 2. same, but the answer fails → the deferred outcome shows.
    const failing = () => new Promise((ok) => setTimeout(() => ok({ ok: false, error: 'gone' }), 300));
    const v2 = renderAsk(host, { ...ASK_BASH, id: 'd2', createdAt: Date.now(), expiresAt: Date.now() + 60000 }, failing);
    v2.el.querySelector('[data-choice="deny"]').click();
    v2.settle('elsewhere');
    await wait(500);
    res.deferredFail = v2.el.querySelector('.co-ask__done')?.textContent.trim();

    // 3. expiry during the POST → still the server's outcome.
    let t = 1_000_000;
    const v3 = renderAsk(host, { ...ASK_BASH, id: 'd3', createdAt: t - 89_000, expiresAt: t + 400 }, slow, { now: () => t });
    v3.el.querySelector('[data-choice="allow"]').click();
    t += 1000; // the clock passes expiry while the answer is in flight
    await wait(700);
    res.expiryDuringPost = v3.el.querySelector('.co-ask__done')?.textContent.trim();

    // 4. already expired when rendered: folds, no interval leak, onSettled async.
    let syncCalled = false;
    let view4;
    view4 = renderAsk(host, { ...ASK_BASH, id: 'd4', createdAt: 0, expiresAt: 1 }, slow, { onSettled: () => { syncCalled = view4 === undefined; view4?.destroy(); } });
    await wait(50);
    res.expiredOnRender = { folded: !host.contains(view4.el) || view4.el.classList.contains('is-folded'), calledBeforeReturn: syncCalled };

    // 5. announcements at 30 s and 10 s.
    let clock = 5_000_000;
    const v5 = renderAsk(host, { ...ASK_BASH, id: 'd5', createdAt: clock - 50_000, expiresAt: clock + 40_000 }, slow, { now: () => clock, name: 'Klaus' });
    const live = () => v5.el.querySelector('[aria-live]').textContent;
    clock += 10_500; await wait(300); res.announce30 = live();
    clock += 20_000; await wait(300); res.announce10 = live();

    // 6. digits: 3 numbered buttons (Allow, Always, Deny); '4' must not reach "Answer in their terminal".
    const sent = [];
    const v6 = renderAsk(host, { ...ASK_BASH, id: 'd6', createdAt: Date.now(), expiresAt: Date.now() + 60000 }, (a) => { sent.push(a.choice); return { ok: true }; });
    v6.el.focus();
    v6.el.dispatchEvent(new KeyboardEvent('keydown', { key: '4', code: 'Digit4', bubbles: true }));
    await wait(50);
    res.digit4 = sent.slice();
    const ghostCap = v6.el.querySelector('[data-choice="terminal"] .co-key');
    res.ghostHasNoDigit = ghostCap === null;

    // 7. digits inside a question pick that question's options.
    const v7 = renderAsk(host, { ...ASK_QUESTION, id: 'd7', createdAt: Date.now(), expiresAt: Date.now() + 60000 }, () => ({ ok: true }));
    const firstRadio = v7.el.querySelector('input[type=radio]');
    firstRadio.focus();
    firstRadio.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', bubbles: true }));
    await wait(50);
    res.questionDigit = [...v7.el.querySelectorAll('input[type=radio]')].map((i) => i.checked);

    // 8. edge: a point behind the camera maps to the bottom, mirrored through the screen centre.
    const cam = new THREE.PerspectiveCamera(50, 1440 / 900, 0.1, 100);
    cam.position.set(0, 1.6, 0);
    cam.lookAt(0, 1.6, -1);
    cam.updateMatrixWorld();
    const behind = placeEdge(cam, { width: 1440, height: 900, inset: { right: 440 } }, new THREE.Vector3(0.5, 1.6, 10));
    res.behind = behind && { x: Math.round(behind.x), y: Math.round(behind.y) };
    const onPlane = placeEdge(cam, { width: 1440, height: 900 }, new THREE.Vector3(3, 1.6, 0));
    res.onPlane = onPlane && { x: Math.round(onPlane.x), y: Math.round(onPlane.y), finite: Number.isFinite(onPlane.x) && Number.isFinite(onPlane.y) };
    return res;
  });

  check('settle while answering: real outcome wins', r.deferredSuccess === 'Allowed', r.deferredSuccess);
  check('onSettled reports answered:allow', r.settledEvents === 'answered:allow', r.settledEvents);
  check('settle while answering + failure: deferred outcome shows', r.deferredFail === 'Answered in their terminal.', r.deferredFail);
  check('expiry during the POST: server outcome wins', r.expiryDuringPost === 'Allowed', r.expiryDuringPost);
  check('expired on render: onSettled runs after renderAsk returns', r.expiredOnRender.calledBeforeReturn === false, JSON.stringify(r.expiredOnRender));
  check('announces at 30 s', /in 30 seconds/.test(r.announce30) && /request/.test(r.announce30), r.announce30);
  check('announces at 10 s', /in 10 seconds/.test(r.announce10), r.announce10);
  check('digit 4 never sends to the terminal', r.digit4.length === 0, JSON.stringify(r.digit4));
  check('"Answer in their terminal" has no digit', r.ghostHasNoDigit === true);
  check('digit inside a question picks its option', JSON.stringify(r.questionDigit) === JSON.stringify([false, true]), JSON.stringify(r.questionDigit));
  check('behind-right of the camera → right edge of the safe rect (panel open)', r.behind && r.behind.x === 956 && r.behind.y === 482, JSON.stringify(r.behind));
  check('point on the camera plane gives a finite placement', r.onPlane && r.onPlane.finite, JSON.stringify(r.onPlane));
  check('no page errors', logs.length === 0, logs.join(' | '));
} finally {
  await browser.close();
}
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
