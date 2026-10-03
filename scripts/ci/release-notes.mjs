// Claude Code's release notes between two versions, from its official changelog: CHANGELOG.md
// in anthropics/claude-code (code.claude.com/docs/en/changelog is generated from it).
//   node scripts/ci/release-notes.mjs <from> <to>
// Prints markdown: the lines that touch what the office relies on (hooks, the status line,
// sessions, transcripts, the flags it passes…), then every release after <from> up to and
// including <to>, newest first. The compat workflow hands both to Claude and to the PR.
const CHANGELOG = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const VERSION = /^\d+\.\d+\.\d+$/;

const [from, to] = process.argv.slice(2);
if (!VERSION.test(from ?? '') || !VERSION.test(to ?? '')) {
  console.error('usage: node scripts/ci/release-notes.mjs <from> <to>   (x.y.z versions)');
  process.exit(2);
}
const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/** What the office reads or drives (see scripts/compat.mjs): a release note line that mentions one is worth a look. */
const WATCH = [
  /\bhooks?\b|PermissionRequest|PreToolUse|AskUserQuestion|ExitPlanMode|\bplan (mode|file)/i,
  /status ?line|statusLine|rate.?limits?/i,
  /transcript|\.jsonl|session (file|registry|id|title|name)s?|~\/\.claude|CLAUDE_CONFIG_DIR|settings\.json/i,
  /`-p`|--(print|resume|session-id|name|permission-mode|model|tools|setting-sources|strict-mcp-config|system-prompt|no-session-persistence)\b/,
  /\bsubagents?\b|\btmux\b|trust (dialog|prompt)|workspace trust|bracketed paste|permission modes?/i,
];

let md;
try {
  const res = await fetch(CHANGELOG, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  md = await res.text();
} catch (err) {
  console.error(`Couldn't fetch ${CHANGELOG}: ${err.message}`);
  process.exit(1);
}

const releases = [];
for (const line of md.split('\n')) {
  const h = line.match(/^## (\d+\.\d+\.\d+)\s*$/);
  if (h) releases.push({ version: h[1], lines: [] });
  else if (releases.length && line.trim()) releases.at(-1).lines.push(line);
}
const picked = releases.filter((r) => cmp(r.version, from) > 0 && cmp(r.version, to) <= 0).sort((a, b) => cmp(b.version, a.version));
const watched = picked.flatMap((r) => r.lines.filter((l) => WATCH.some((w) => w.test(l))).map((l) => `- **${r.version}**: ${l.replace(/^\s*[-*]\s*/, '')}`));

const out = [`Release notes after ${from}, up to ${to} (${picked.length} release${picked.length === 1 ? '' : 's'}), from ${CHANGELOG.replace('raw.githubusercontent.com', 'github.com').replace('/main/', '/blob/main/')}`, ''];
if (!picked.some((r) => r.version === to)) out.push(`> ${to} isn't in the changelog yet; these are the notes published so far.`, '');
out.push('#### Lines that touch what the office relies on', '', ...(watched.length ? watched : ['- none']), '', '#### All release notes', '');
for (const r of picked) out.push(`##### ${r.version}`, '', ...r.lines, '');
console.log(out.join('\n'));
