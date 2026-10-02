#!/usr/bin/env node
// End-to-end test of in-game answering against a DEV office (never the user's :4777).
//
// Hires two throwaway Claude sessions in a fresh scratch folder (POST /api/hire with
// permissionMode 'manual', then 'plan') and makes them ask all three kinds of in-game
// question: AskUserQuestion, a permission prompt and ExitPlanMode. A real
// Chrome tab with real mouse input (so the office counts as "manager present") answers
// each one through the game UI: R → their roster row (the go-to opens their Ask panel) →
// the option button. For each, it checks the hand / "!" went up, POST /api/answer
// returned 200, the session carried on with that answer, and the terminal prompt never
// showed (tmux screen sampled every second while the ask was held). Then it checks the
// fallbacks: a hidden tab, and a manager idle for over 2 minutes, both send the prompt
// straight to the terminal. Finally it lets the throwaway go and deletes the folder.
//
//   node scripts/e2e-answer.mjs [--base http://127.0.0.1:4778] [--only question,permission,plan,hidden,idle]
//                               [--out snaps/e2e] [--keep] [--headful]
//
// Unlike snap.mjs, this tab DOES report presence: that is the point. Hired sessions carry
// CLAUDE_OFFICE_PORT, so their hooks ask only the office that hired them.
import puppeteer from 'puppeteer-core';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Options ──────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const BASE = opt('base', 'http://127.0.0.1:4778').replace(/\/+$/, '');
const OUT = opt('out', 'snaps/e2e');
const ONLY = new Set(opt('only', 'question,permission,plan,hidden,idle').split(','));
const KEEP = argv.includes('--keep');
const HEADFUL = argv.includes('--headful');

const target = new URL(BASE);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  console.error(`Refusing: ${BASE} is not a local office.`);
  process.exit(2);
}
if ((target.port || '80') === '4777') {
  console.error("Refusing: :4777 is the user's own office. Point --base at a dev office (e.g. :4778).");
  process.exit(2);
}

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

// ── Evidence ────────────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
const events = [];
const results = []; // { check, ok, detail }
function note(msg, data) {
  events.push({ t: Number(secs()), msg, ...(data === undefined ? {} : { data }) });
  console.log(`[${secs().padStart(6)}s] ${msg}`);
}
function check(name, ok, detail = '') {
  results.push({ check: name, ok: !!ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return !!ok;
}

// ── Office API ──────────────────────────────────────────────────────────────────────────
async function api(path, body) {
  const init = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(BASE + path, init);
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}

// The throwaway the helpers below talk to right now, and every one hired (for cleanup).
let sid = '';
let tmuxName = '';
let scratch = '';
const hired = [];

async function me() {
  const r = await api('/api/roster');
  return Array.isArray(r.json) ? r.json.find((e) => e.sessionId === sid) : undefined;
}

/** A compact roster excerpt for the report. */
function excerpt(e) {
  if (!e) return null;
  return {
    displayName: e.displayName,
    state: e.state,
    waitingFor: e.waitingFor,
    hosted: e.hosted,
    pid: e.pid,
    activity: e.activity?.label,
    ask: e.ask ? { id: e.ask.id, kind: e.ask.kind, title: e.ask.title, options: e.ask.options.map((o) => o.id), questions: e.ask.questions?.map((q) => q.question) } : undefined,
  };
}

async function waitFor(label, fn, timeoutMs, everyMs = 500) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${label}`);
    await sleep(everyMs);
  }
}

// ── Our throwaway's tmux session (exact-match target; nothing else is ever touched) ─────
async function tmux(...a) {
  return (await run('tmux', a)).stdout;
}
const screen = () => tmux('capture-pane', '-p', '-t', `=${tmuxName}:`);
const keys = (...k) => tmux('send-keys', '-t', `=${tmuxName}:`, ...k);

/**
 * Any of Claude Code's own terminal dialogs (permission, plan approval, question picker,
 * trust). Not a bare "❯": the idle input prompt starts with one too.
 */
const DIALOG = /Do you want to (proceed|make this edit|create|allow)|Would you like to proceed|Enter to (confirm|select)|❯\s*\d+\.\s/;
const TRUST = /Yes, I trust this folder|Do you trust the files/i;
/** The highlighted option of a select dialog: "❯ 1. Yes" or "❯ No, exit". */
const CURSOR = /^\s*❯\s+\S/;

/** Pick "Yes" in a terminal dialog (arrow down to it, Enter). Escape if there's no Yes. */
async function pickYes(what) {
  for (let i = 0; i < 6; i++) {
    // The dialog's cursor is the last "❯ <text>" line: earlier ones are echoed prompts.
    const lines = (await screen()).split('\n');
    const cursor = lines.findLast((l) => CURSOR.test(l)) ?? '';
    if (/\byes\b/i.test(cursor)) {
      await keys('Enter');
      note(`answered the ${what} in the terminal: ${cursor.trim()}`);
      return;
    }
    if (!cursor) break;
    await keys('Down');
    await sleep(350);
  }
  await keys('Escape');
  note(`no "Yes" in the ${what}; pressed Escape`);
}

/** Watch the tmux screen while an ask is (supposedly) held; collect any terminal dialog. */
function watchTerminal() {
  const hits = [];
  let stop = false;
  const loop = (async () => {
    while (!stop) {
      try {
        const s = await screen();
        const m = s.match(DIALOG);
        if (m) hits.push({ t: Number(secs()), match: m[0], screen: s.split('\n').filter((l) => l.trim()).slice(-14) });
      } catch {
        // session gone
      }
      await sleep(1000);
    }
  })();
  return {
    hits,
    stop: async () => {
      stop = true;
      await loop;
    },
  };
}

/** Is one of Claude Code's own dialogs on their screen right now? */
async function dialogShowing() {
  return DIALOG.test(await screen().catch(() => ''));
}

// ── The browser: a real manager looking at the office ───────────────────────────────────
const executablePath = CHROME.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}
const browser = await puppeteer.launch({
  executablePath,
  headless: !HEADFUL,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

// Freeze this tab against hot reloads from other people's edits. A reload closes the tab's
// socket, the office then (correctly) sees no manager and sends a pending question straight
// to the terminal, which would test our colleagues' typing speed rather than answering.
// The stub keeps Vite's five exports so CSS and hot-context modules still load.
const VITE_CLIENT_STUB = `
const sheets = new Map();
export function updateStyle(id, css) {
  let el = sheets.get(id);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
    sheets.set(id, el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  sheets.get(id)?.remove();
  sheets.delete(id);
}
export function injectQuery(url) {
  return url;
}
export function createHotContext() {
  const noop = () => {};
  return { data: {}, accept: noop, acceptExports: noop, dispose: noop, prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop };
}
export class ErrorOverlay extends HTMLElement {}
`;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (new URL(req.url()).pathname === '/@vite/client') req.respond({ status: 200, contentType: 'text/javascript', body: VITE_CLIENT_STUB });
  else req.continue();
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
const answerCalls = [];
page.on('response', (r) => {
  if (r.url().endsWith('/api/answer')) answerCalls.push({ t: Number(secs()), status: r.status(), body: r.request().postData() });
});
let loaded = false;
let reloads = 0;
page.on('framenavigated', (f) => {
  if (f === page.mainFrame() && loaded) {
    reloads++;
    note(`the page reloaded (HMR from someone's edit?): reload #${reloads}`);
  }
});

// Real input every few seconds so the office counts us as present.
let inputOn = true;
let wiggle = 0;
const jiggler = setInterval(() => {
  if (!inputOn) return;
  wiggle ^= 1;
  page.mouse.move(700 + wiggle * 60, 420 + wiggle * 30).catch(() => {});
}, 3000);

async function shot(name) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

async function setHidden(hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  note(`tab ${hidden ? 'hidden' : 'visible'} (visibilitychange sent)`);
}

/**
 * Answer the open ask through the game UI. `pick(ask)` returns the clicks to make:
 * [{ choice: 'Tea' } (a question option), { option: 'answer' } (an option button)].
 */
async function answerViaUi(kind, ask, clicks) {
  // Close anything open, open the roster, click their row: the go-to opens their Ask panel.
  await page.keyboard.press('Escape');
  await sleep(250);
  await page.keyboard.press('KeyR');
  const row = await page.waitForSelector(`[data-session="${sid}"]`, { visible: true, timeout: 6000 });
  await row.click();
  await page.waitForSelector('.co-ask', { visible: true, timeout: 6000 });
  const title = await page.$eval('.co-ask__title', (n) => n.textContent?.trim());
  check(`${kind}: the Ask panel opened from the roster`, title === ask.title, `panel "${title}"`);
  // Let the manager arrive so they're on screen for the evidence shot.
  await waitFor('the manager to arrive', () => page.evaluate(() => !window.office?.manager?.autoWalking), 9000, 250).catch(() => {});
  await sleep(500);
  const hand = await page.evaluate((id) => {
    const e = window.office?.director?.employees?.get(id);
    const bangs = [...document.querySelectorAll('.co-bang:not(.co-bang--bump)')].filter((b) => !b.hidden && b.offsetParent !== null);
    return { handUp: !!e?.handUp, bangs: bangs.length };
  }, sid);
  check(`${kind}: their hand is up with a "!" in the page`, hand.handUp && hand.bangs > 0, `handUp=${hand.handUp}, visible "!" markers=${hand.bangs}`);
  const before = await shot(`${kind}-1-hand-up-panel-open`);
  const callsBefore = answerCalls.length;
  for (const c of clicks) {
    if (c.choice) {
      const label = await page.waitForSelector(`label.co-choice:has(input[value="${c.choice}"])`, { visible: true, timeout: 4000 });
      await label.click();
    } else {
      const btn = await page.waitForSelector(`button.co-ask__opt[data-choice="${c.option}"]`, { visible: true, timeout: 4000 });
      await btn.click();
    }
    await sleep(300);
  }
  const call = await waitFor('POST /api/answer', () => answerCalls[callsBefore], 8000, 100);
  check(`${kind}: POST /api/answer returned 200`, call.status === 200, `${call.status} ${call.body}`);
  await sleep(900);
  const after = await shot(`${kind}-2-answered`);
  return { before, after, call };
}

/** Answer any extra ask that shows up while we wait (e.g. Write permission after a plan). */
async function drainExtraAsks(kind, seen) {
  const e = await me();
  if (!e?.ask || seen.has(e.ask.id)) return;
  seen.add(e.ask.id);
  note(`${kind}: extra ask "${e.ask.title}" (${e.ask.kind}); answering it in-game too`, excerpt(e));
  const option = e.ask.options.find((o) => o.id === 'allow' || o.id === 'approve')?.id;
  if (!option) throw new Error(`Unexpected extra ask: ${e.ask.title}`);
  await answerViaUi(`${kind}-extra-${seen.size}`, e.ask, [{ option }]);
}

/** Wait until they're idle again (their turn is over) so /api/say isn't refused. */
async function waitIdle(label, timeoutMs = 120_000, seen = new Set()) {
  return waitFor(
    `${label}: back to idle`,
    async () => {
      await drainExtraAsks(label, seen);
      const e = await me();
      return e && e.state === 'idle' ? e : null;
    },
    timeoutMs,
    1000,
  );
}

async function say(text) {
  const r = await api('/api/say', { sessionId: sid, text });
  if (r.status !== 200) throw new Error(`/api/say → ${r.status} ${JSON.stringify(r.json)}`);
  note(`said: ${text.slice(0, 90)}${text.length > 90 ? '…' : ''}`);
}

/** One in-game ask, end to end. */
async function inGame(kind, { prompt, expectKind, clicks, proceeded }) {
  const reloadsBefore = reloads;
  const watch = watchTerminal();
  if (prompt) await say(prompt);
  const seen = new Set();
  const e = await waitFor(
    `a ${expectKind} ask`,
    async () => {
      const x = await me();
      if (x?.ask && x.ask.kind !== expectKind && !seen.has(x.ask.id)) await drainExtraAsks(kind, seen);
      return x?.ask?.kind === expectKind && !seen.has(x.ask.id) ? x : null;
    },
    150_000,
    700,
  );
  seen.add(e.ask.id);
  note(`${kind}: ask held in-game`, excerpt(e));
  const ui = await answerViaUi(kind, e.ask, clicks(e.ask));
  // Stop watching as the answer goes out, so the next ask's dialog can't count against this one.
  await watch.stop();
  // Someone else's edit can hot-reload the tab mid-hold (presence drops, the office lets go).
  if (reloads !== reloadsBefore) note(`${kind}: WARNING the page reloaded during this step, which can release the hold`);
  if (expectKind === 'permission') {
    // Claude Code draws its own permission dialog while the PermissionRequest hook runs, so
    // the terminal shows it during the hold by design. What matters: the in-game answer
    // closes it, with no key ever pressed in their terminal.
    note(`${kind}: terminal dialog visible during the hold: ${watch.hits.length ? 'yes (expected for PermissionRequest)' : 'no'}`);
    const closed = await waitFor(`${kind}: the terminal dialog to close`, async () => !(await dialogShowing()), 5000, 250).catch(() => false);
    check(`${kind}: the in-game answer closed the terminal prompt (no terminal input)`, closed);
  } else {
    check(`${kind}: the terminal prompt never appeared while it was held`, watch.hits.length === 0, watch.hits.length ? `saw "${watch.hits[0].match}" at ${watch.hits[0].t}s` : 'tmux sampled every 1 s');
    if (watch.hits.length) note(`${kind}: terminal dialog seen`, watch.hits[0]);
  }
  const ok = await waitFor(
    `${kind}: the session to carry on with the answer`,
    async () => {
      await drainExtraAsks(kind, seen);
      return proceeded();
    },
    150_000,
    1000,
  ).catch((err) => {
    note(String(err.message));
    return false;
  });
  check(`${kind}: the session carried on with that answer`, ok, typeof ok === 'string' ? ok : '');
  const chatter = await api(`/api/session/${sid}/chatter`);
  note(`${kind}: chatter tail`, Array.isArray(chatter.json) ? chatter.json.slice(-6).map((l) => `${l.role}: ${String(l.text).slice(0, 140)}`) : chatter);
  await waitIdle(kind, 150_000, seen).catch((err) => note(`${kind}: ${err.message}`));
  return ui;
}

/** A permission prompt while the office shouldn't hold it: it must go straight to the terminal. */
async function fallback(kind, file, prepare, restore) {
  await prepare();
  await sleep(1500);
  const asked = [];
  let sawDialog = null;
  const started = Date.now();
  await say(`Next test step. Run exactly this shell command with the Bash tool, nothing else: touch ${file} — then reply with the single word done.`);
  try {
    sawDialog = await waitFor(
      `${kind}: the terminal permission prompt`,
      async () => {
        const e = await me();
        if (e?.ask) asked.push(excerpt(e));
        const s = await screen();
        return DIALOG.test(s) && /proceed|allow|Bash|touch/i.test(s) ? s : null;
      },
      60_000,
      700,
    );
  } catch (err) {
    note(String(err.message));
  }
  const waited = ((Date.now() - started) / 1000).toFixed(1);
  check(`${kind}: the prompt went straight to the terminal`, !!sawDialog && asked.length === 0, sawDialog ? `terminal dialog after ${waited} s, roster never showed an ask` : 'no terminal dialog');
  if (asked.length) note(`${kind}: the office held it anyway`, asked[0]);
  writeFileSync(join(OUT, `${kind}-terminal.txt`), sawDialog ?? (await screen()));
  await shot(`${kind}-terminal`);
  if (sawDialog) await pickYes(`${kind} permission prompt`);
  await restore();
  await waitIdle(kind).catch((err) => note(`${kind}: ${err.message}`));
  check(`${kind}: the command ran after answering in the terminal`, existsSync(join(scratch, file)));
}

/**
 * Hire a throwaway in the scratch folder and make it the current one. A new folder makes
 * Claude ask whether to trust it first; that dialog isn't a hook, so the manager answers it
 * at their computer (here: the tmux keys the terminal overlay would send).
 */
async function hireThrowaway(name, permissionMode, prompt) {
  const r = await api('/api/hire', { cwd: scratch, name, permissionMode, prompt });
  if (r.status !== 200 || !r.json?.sessionId) throw new Error(`/api/hire → ${r.status} ${JSON.stringify(r.json)}`);
  sid = r.json.sessionId;
  tmuxName = `office-${sid.slice(0, 8)}`;
  hired.push(sid);
  note(`hired ${name} (permissionMode ${permissionMode}): session ${sid}, tmux ${tmuxName}`);
  const first = await waitFor(
    `${name}: the trust dialog, an ask, or a running session`,
    async () => {
      const s = await screen().catch(() => '');
      if (TRUST.test(s)) return 'trust';
      const e = await me();
      if (e?.ask) return 'ask';
      return e && e.pid > 0 && (e.state === 'working' || e.state === 'idle') ? 'running' : null;
    },
    60_000,
    700,
  );
  note(`${name}: first stop ${first}`, excerpt(await me()));
  if (first === 'trust') {
    await shot(`0-trust-dialog-${name.replace(/\W+/g, '-').toLowerCase()}`);
    await pickYes('trust dialog');
    // Let it clear before watching for terminal prompts (its "❯" lines would count).
    await waitFor('the trust dialog to close', async () => !TRUST.test(await screen()), 20_000, 500);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────
let failed = null;
try {
  await page.goto(`${BASE}/?debug=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.office?.director && window.office?.panels, { timeout: 30000 });
  loaded = true;
  await page.mouse.move(700, 420);
  note(`office open at ${BASE}; presence on, mouse input every 3 s`);

  scratch = mkdtempSync('/private/tmp/office-e2e-');
  note(`scratch folder ${scratch}`);

  // Throwaway A, permissionMode 'manual': question, permission and both fallbacks.
  const needA = ['question', 'permission', 'hidden', 'idle'].some((k) => ONLY.has(k));
  if (needA) {
    await hireThrowaway(
      'E2E Tester',
      'manual',
      ONLY.has('question')
        ? 'This is an automated test of Claude Office. Use the AskUserQuestion tool to ask me exactly one question, "Tea or coffee?", with exactly two options labelled "Tea" and "Coffee". After I answer, write the label I picked (one word) to a file named answer.txt in the current directory, then stop.'
        : 'This is an automated test of Claude Office. Reply with the single word ready.',
    );
    if (ONLY.has('question')) {
      await inGame('question', {
        expectKind: 'question',
        clicks: () => [{ choice: 'Tea' }, { option: 'answer' }],
        proceeded: () => {
          const f = join(scratch, 'answer.txt');
          const text = existsSync(f) ? readFileSync(f, 'utf8').trim() : '';
          return /tea/i.test(text) && !/coffee/i.test(text) ? `answer.txt says "${text}"` : null;
        },
      });
    } else {
      await waitIdle('setup');
    }

    if (ONLY.has('permission')) {
      await inGame('permission', {
        prompt: 'Next test step. Run exactly this shell command with the Bash tool, nothing else: touch e2e-permission.txt — then reply with the single word done.',
        expectKind: 'permission',
        clicks: () => [{ option: 'allow' }],
        proceeded: () => (existsSync(join(scratch, 'e2e-permission.txt')) ? 'e2e-permission.txt exists' : null),
      });
    }

    if (ONLY.has('hidden')) {
      await fallback('hidden-tab', 'e2e-fallback-hidden.txt', () => setHidden(true), () => setHidden(false));
    }

    if (ONLY.has('idle')) {
      await fallback(
        'idle-manager',
        'e2e-fallback-idle.txt',
        async () => {
          inputOn = false;
          note('no input from now on; waiting 125 s so the last input is over 2 min old');
          await sleep(125_000);
        },
        async () => {
          inputOn = true;
          await page.mouse.move(640, 400);
        },
      );
    }
  }

  // Throwaway B, permissionMode 'plan': it plans, then asks to leave plan mode.
  if (ONLY.has('plan')) {
    await hireThrowaway(
      'E2E Planner',
      'plan',
      'This is an automated test of Claude Office. You are in plan mode. Write a two-bullet plan for creating a file named plan-approved.txt that contains the word approved, then call the ExitPlanMode tool with that plan straight away. Do not ask me anything else. Once the plan is approved, create the file.',
    );
    await inGame('plan', {
      expectKind: 'plan',
      clicks: () => [{ option: 'approve' }],
      proceeded: () => {
        const f = join(scratch, 'plan-approved.txt');
        return existsSync(f) && /approved/i.test(readFileSync(f, 'utf8')) ? 'plan-approved.txt says approved' : null;
      },
    });
  }
} catch (err) {
  failed = err;
  console.error(`\nERROR: ${err.message}`);
  try {
    if (tmuxName) writeFileSync(join(OUT, 'error-screen.txt'), await screen());
    await shot('error');
  } catch {
    // best effort
  }
} finally {
  clearInterval(jiggler);
  if (!KEEP) {
    for (const id of hired) {
      sid = id;
      const fired = await api('/api/fire', { sessionId: id }).catch((e) => ({ status: 0, json: String(e) }));
      check(`cleanup: POST /api/fire let ${id.slice(0, 8)} go`, fired.status === 200, `${fired.status}`);
      await waitFor('the throwaway to leave the roster', async () => !(await me()), 30_000, 1000).catch((e) => note(e.message));
    }
  }
  if (scratch && !KEEP && scratch.startsWith('/private/tmp/office-e2e-')) {
    rmSync(scratch, { recursive: true, force: true });
    note(`deleted ${scratch}`);
  }
  check('no page errors in the office tab', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  const report = { base: BASE, hired, scratch, failed: failed?.message ?? null, results, answerCalls, reloads, events };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const bad = results.filter((r) => !r.ok).length + (failed ? 1 : 0);
  console.log(`\n${bad ? 'FAILED' : 'PASSED'}: ${results.filter((r) => r.ok).length}/${results.length} checks${failed ? ', stopped early' : ''}. Evidence in ${OUT}/`);
  process.exit(bad ? 1 : 0);
}
