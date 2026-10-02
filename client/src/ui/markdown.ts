// Light, safe markdown for plans (ask cards) and chat: everything is escaped first and only our
// own tags are added. Paragraphs keep their line breaks; lists nest by indent and numbered lists
// keep their numbers; fenced code; `code` (nothing inside is touched); **bold**; *italics*;
// [links](https://…) and bare https URLs; > quotes; headings; pipe tables as monospace text.
import { esc, markup, type Markup } from './el';

const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g;

const anchor = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

function emphasis(t: string): string {
  return t
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?!\w)/g, '$1<em>$2</em>');
}

/** Inline markdown for one line of text. Code spans are cut out first so nothing inside them changes. */
export function inline(s: string): string {
  return s
    .split(/(`[^`\n]+`)/g)
    .map((part, i) => {
      if (i % 2 === 1) return `<code>${esc(part.slice(1, -1))}</code>`;
      // Links become placeholders, so the bare-URL pass and emphasis can't reach inside them.
      const links: string[] = [];
      let t = esc(part).replace(LINK_RE, (_m, text: string, url: string) => {
        links.push(anchor(url, text));
        return `\u0000${links.length - 1}\u0000`;
      });
      t = t.replace(URL_RE, (url) => {
        links.push(anchor(url, url));
        return `\u0000${links.length - 1}\u0000`;
      });
      return emphasis(t).replace(/\u0000(\d+)\u0000/g, (_m, n: string) => links[Number(n)]);
    })
    .join('');
}

interface OpenList {
  type: 'ul' | 'ol';
  indent: number;
  open: boolean;
}

export function renderMarkdown(md: string): Markup {
  const out: string[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let table: string[] = [];
  let code: { fence: string; lang: string; lines: string[] } | null = null;
  const lists: OpenList[] = [];

  const flushText = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    if (quote.length) out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    if (table.length) out.push(`<pre class="co-md-table">${esc(table.join('\n'))}</pre>`);
    para = [];
    quote = [];
    table = [];
  };
  const closeListsDeeperThan = (indent: number) => {
    while (lists.length && lists[lists.length - 1].indent > indent) {
      const l = lists.pop()!;
      if (l.open) out.push('</li>');
      out.push(`</${l.type}>`);
    }
  };
  const flushAll = () => {
    flushText();
    closeListsDeeperThan(-1);
  };

  for (const raw of md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (code) {
      if (raw.trimStart().startsWith(code.fence)) {
        out.push(`<pre${code.lang ? ` data-lang="${esc(code.lang)}"` : ''}><code>${esc(code.lines.join('\n'))}</code></pre>`);
        code = null;
      } else code.lines.push(raw);
      continue;
    }
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(raw);
    if (fence) {
      flushAll();
      code = { fence: fence[1], lang: fence[2], lines: [] };
      continue;
    }
    if (!raw.trim()) {
      // A blank line ends paragraphs; lists stay open for a following item or indented line.
      flushText();
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    const item = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(raw);
    if (item) {
      flushText();
      const type: OpenList['type'] = item[1] ? 'ol' : 'ul';
      const n = item[1] ? Number(item[1]) : 1;
      closeListsDeeperThan(indent);
      let top: OpenList | undefined = lists[lists.length - 1];
      if (top && top.indent === indent && top.type !== type) {
        if (top.open) out.push('</li>');
        out.push(`</${top.type}>`);
        lists.pop();
        top = lists[lists.length - 1];
      }
      if (!top || top.indent < indent) {
        // A new list; a nested one stays inside its parent's open <li>.
        out.push(type === 'ol' && n !== 1 ? `<ol start="${n}">` : `<${type}>`);
        top = { type, indent, open: false };
        lists.push(top);
      } else if (top.open) out.push('</li>');
      out.push(`<li>${inline(item[2])}`);
      top.open = true;
      continue;
    }
    if (lists.length && indent > 0) {
      // Indented text under an item continues it.
      out.push(`<br>${inline(raw.trim())}`);
      continue;
    }
    closeListsDeeperThan(-1);
    const h = /^\s*(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      flushText();
      out.push(h[1].length <= 2 ? `<h4>${inline(h[2])}</h4>` : `<h5>${inline(h[2])}</h5>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      flushText();
      out.push('<hr>');
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(raw);
    if (q) {
      if (para.length || table.length) flushText();
      quote.push(q[1]);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (para.length || quote.length) flushText();
      table.push(raw.trim());
      continue;
    }
    if (quote.length || table.length) flushText();
    para.push(raw.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.lines.join('\n'))}</code></pre>`);
  flushAll();
  return markup(out.join(''));
}
