// Agent text as rich, safe markdown (chat, plan asks, the employee panel), reading like Claude
// Code at its best: GFM tables, ~~strikethrough~~, task lists (☐/☑), nested lists, headings sized
// for a chat column, and fenced code with syntax colours (highlight.js, fetched on the first code
// block) and a copy button.
//
// Chatter is untrusted (web pages flow into it), and this origin can hire sessions and type into
// their terminals, so: raw HTML stays escaped (html: false); links are http(s) or mailto only and
// open in a new tab with rel="noopener noreferrer"; anything else renders as plain text; images
// become plain links and are never loaded.
import type { HLJSApi } from 'highlight.js';
import MarkdownIt from 'markdown-it';
import { esc, markup, type Markup } from './el';

const SAFE_URL = /^(?:https?:\/\/|mailto:)/i;
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const LINK_ATTRS = 'target="_blank" rel="noopener noreferrer"';
/** Code block languages: a short, safe token for the label and the highlighter. */
const LANG_RE = /^[a-z0-9_+#.-]{1,20}$/;

/** Per link_open while rendering: did it become a real link? (Its link_close must match.) Rendering is synchronous. */
let links: boolean[] = [];
const attr = (t: { attrGet(name: string): unknown }, name: string) => String(t.attrGet(name) ?? '');

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
// Link reference definitions vanish from the output, so a plan could hide a step inside one's
// title from whoever approves it. They render as the text they are.
md.disable('reference');
// Only explicit URLs become links: "README.md" or "main.ts" must stay file names.
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });
md.validateLink = (url) => SAFE_URL.test(url.trim());

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const t = tokens[idx];
  const ok = SAFE_URL.test(attr(t, 'href'));
  links.push(ok);
  if (!ok) return '<span class="co-md__nolink">';
  t.attrSet('target', '_blank');
  t.attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_close = (tokens, idx, options, _env, self) => (links.pop() === false ? '</span>' : self.renderToken(tokens, idx, options));

// Images never load: a link to the picture instead (or just its alt text).
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const t = tokens[idx];
  const src = attr(t, 'src');
  const alt = self.renderInlineAsText(t.children ?? [], options, env).trim();
  if (!SAFE_URL.test(src)) return esc(alt);
  return `<a class="co-md__img" href="${esc(src)}" ${LINK_ATTRS}>Image: ${esc(alt || src)}</a>`;
};

// Headings step down so a message never outranks the panel's own title: # → h4, ## → h5, ### + → h6.
md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const t = tokens[idx];
  t.tag = `h${Math.min(6, Number(t.tag.slice(1)) + 3)}`;
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.heading_close = (tokens, idx, options, _env, self) => {
  const t = tokens[idx];
  t.tag = `h${Math.min(6, Number(t.tag.slice(1)) + 3)}`;
  return self.renderToken(tokens, idx, options);
};

// Wide tables scroll sideways inside their own box.
md.renderer.rules.table_open = () => '<div class="co-md__table"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

md.renderer.rules.code_inline = (tokens, idx) => `<code>${esc(visibleText(tokens[idx].content))}</code>`;
md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx];
  return codeBlock(t.content, t.info.trim().split(/\s+/)[0] ?? '');
};
md.renderer.rules.code_block = (tokens, idx) => codeBlock(tokens[idx].content, '');

// Task lists: "- [ ] todo" / "- [x] done" → ☐ / ☑, without the bullet.
md.core.ruler.after('inline', 'co_tasks', (state) => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
    const first = t.children?.[0];
    const m = first?.type === 'text' ? /^\[([ xX])\]\s+/.exec(first.content) : null;
    if (!first || !m) continue;
    first.content = `${m[1] === ' ' ? '☐' : '☑'} ${first.content.slice(m[0].length)}`;
    tokens[i - 2].attrJoin('class', 'co-md__task');
  }
});

/**
 * Characters that make code look different from what it is (or what Copy puts on the clipboard):
 * C0/C1 controls (escape sequences), zero-width characters and bidi overrides. They become visible
 * escapes like \u{1b}, so the screen, the clipboard and the eye agree.
 */
const SNEAKY = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
export function visibleText(s: string): string {
  return s.replace(SNEAKY, (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`);
}

function codeBlock(raw: string, info: string): string {
  const code = visibleText(raw.replace(/\n$/, ''));
  const lang = LANG_RE.test(info.toLowerCase()) ? info.toLowerCase() : '';
  const known = !!lang && !!hljs?.getLanguage(lang);
  const body = known ? hljs!.highlight(code, { language: lang, ignoreIllegals: true }).value : esc(code);
  const state = known ? 'done' : lang ? 'pending' : 'none';
  return (
    `<div class="co-code"><div class="co-code__bar"><span class="co-code__lang">${esc(lang || 'text')}</span>` +
    `<button type="button" class="co-code__copy">Copy</button></div>` +
    `<pre tabindex="0"><code data-lang="${esc(lang)}" data-hl="${state}">${body}</code></pre></div>\n`
  );
}

const cache = new Map<string, Markup>();

/** Render agent markdown to safe HTML. Memoized, so a re-render of the same text is free. */
export function renderMarkdown(src: string): Markup {
  const hit = cache.get(src);
  // A copy rendered before the highlighter arrived is redone once it's here.
  if (hit !== undefined && (!hljs || !hit.includes('data-hl="pending"'))) return hit;
  links = [];
  // Bidi overrides and isolates can make prose read differently from what it says: shown, not obeyed.
  const out = markup(md.render(src.replace(/[\u202a-\u202e\u2066-\u2069]/g, (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`)).trimEnd());
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  cache.set(src, out);
  return out;
}

// ------------------------------------------------------------------ syntax colours, on demand

let hljs: HLJSApi | null = null;
let hljsLoad: Promise<HLJSApi> | null = null;

function loadHighlighter(): Promise<HLJSApi> {
  hljsLoad ??= Promise.all([
    import('highlight.js/lib/core'),
    import('highlight.js/lib/languages/typescript'),
    import('highlight.js/lib/languages/javascript'),
    import('highlight.js/lib/languages/json'),
    import('highlight.js/lib/languages/bash'),
    import('highlight.js/lib/languages/python'),
    import('highlight.js/lib/languages/diff'),
    import('highlight.js/lib/languages/css'),
    import('highlight.js/lib/languages/xml'),
    import('highlight.js/lib/languages/yaml'),
  ]).then(([core, ts, js, json, bash, python, diff, css, xml, yaml]) => {
    const h = core.default;
    const langs = { typescript: ts, javascript: js, json, bash, python, diff, css, xml, yaml };
    for (const [name, mod] of Object.entries(langs)) h.registerLanguage(name, mod.default);
    h.registerAliases(['sh', 'shell', 'zsh', 'console', 'terminal'], { languageName: 'bash' });
    h.registerAliases(['html', 'svg'], { languageName: 'xml' });
    h.registerAliases(['jsonc', 'json5'], { languageName: 'json' });
    hljs = h;
    return h;
  });
  return hljsLoad;
}

/**
 * Finish rendered markdown in the DOM: colour its code blocks (loading highlight.js the first
 * time one appears). Copy buttons work through one delegated listener, so nothing else is needed.
 */
export function enhanceMarkdown(root: ParentNode): void {
  const pending = [...root.querySelectorAll<HTMLElement>('code[data-hl="pending"]')];
  if (!pending.length) return;
  void loadHighlighter()
    .then((h) => {
      for (const code of pending) {
        if (code.dataset.hl !== 'pending') continue;
        const lang = code.dataset.lang ?? '';
        if (!h.getLanguage(lang)) {
          code.dataset.hl = 'none';
          continue;
        }
        // highlight.js escapes the text it is given; its output is markup we can trust.
        code.innerHTML = markup(h.highlight(code.textContent ?? '', { language: lang, ignoreIllegals: true }).value);
        code.dataset.hl = 'done';
      }
    })
    .catch(() => {
      for (const code of pending) code.dataset.hl = 'none';
    });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (ev) => {
    const btn = (ev.target as Element | null)?.closest?.('.co-code__copy');
    const code = btn?.closest('.co-code')?.querySelector('code');
    if (!btn || !code) return;
    void copyText(code.textContent ?? '').then((ok) => {
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      window.setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  });
}

// ------------------------------------------------------------------ one-liners

/** Markdown as plain text, for one-line summaries (bubbles, rows): no **, `, #, > or link syntax. */
export function plainText(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(LINK_RE, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, '$1$2')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1$2')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?=\S))/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
