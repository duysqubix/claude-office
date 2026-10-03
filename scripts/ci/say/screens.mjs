// Synthetic Claude Code screens for the office's Say (server/tmux.ts: say() and dialogOnScreen()),
// drawn into a private tmux server by scripts/ci/say/synthetic.mjs. Hand-written from the 2.x
// layouts while Say was built (PRs #79, #85, #87, #89), each with what a careful office does:
//   dialog  dialogOnScreen(screen, typing) === want: true when Enter would answer a dialog or
//           send something other than `typing` from the box, false when it sends `typing`
//   paste   say()'s decision before it pastes: 'paste', 'draft' (unsent text in their box) or
//           'not-pasted' (the box isn't on screen)
//   box     say() on a stand-in input box (fake-box.mjs) that takes the paste and Enter: what
//           say() returns, and what the box received ("ENTER <text>")
const E = '\x1b';
const DIM = (s) => `${E}[2m${s}${E}[22m`;
const INV = (s) => `${E}[7m${s}${E}[27m`;
const GRAY = (s) => `${E}[38;5;244m${s}${E}[39m`;
const COL = (s) => `${E}[38;5;75m${s}${E}[39m`;
const RULE = '─'.repeat(100);
const RULE_C = GRAY(RULE);
const FOOT = '  ⏵⏵ accept edits on (shift+tab to cycle)';
const HINT = '  ? for shortcuts';
const talk = ['● Sure. I updated the parser and the tests pass.', ''];
const box = (rule, rows, foot = FOOT) => [...talk, rule, ...rows, rule, foot];

// ── Which screens have a dialog Enter would answer (PR #79) ──────────────────────────────────
const RULE76 = '─'.repeat(76);
const sided = (rows) => ['╭' + '─'.repeat(74) + '╮', ...rows.map((r) => '│ ' + r.padEnd(72) + ' │'), '╰' + '─'.repeat(74) + '╯'];
const input = (glyph, text = '') => [RULE76, `${glyph} ${text}`, RULE76, FOOT];
const prose = ['● I can take two approaches here:', '', '  1. Refactor the parser into smaller functions', '  2. Patch the regex in place', '', '  Would you like to proceed with option 1?', ''];
const bash = (choices) => [RULE76, ' Bash command', '', '   rm -rf build', '   Remove the build folder', '', ' Do you want to proceed?', ...choices, '', ' Esc to cancel · Tab to amend'];
const dialogs = [
  { want: true, name: 'Bash permission, numbered (1.x box)', lines: sided(['Bash command', '', '  rm -rf build', '', 'Do you want to proceed?', '❯ 1. Yes', "  2. Yes, and don't ask again for rm commands in /Users/me/proj", '  3. No, and tell Claude what to do differently (esc)']) },
  { want: true, name: 'Bash permission, numbered', lines: bash([' ❯ 1. Yes', "   2. Yes, and don't ask again for rm commands in /Users/me/proj", '   3. No, and tell Claude what to do differently (esc)']) },
  { want: true, name: 'Bash permission, numbered, our text numbered too', typing: '1. also run the tests', lines: bash([' ❯ 1. Yes', "   2. Yes, and don't ask again for rm commands in /Users/me/proj", '   3. No, and tell Claude what to do differently (esc)']) },
  { want: true, name: 'Bash permission, unnumbered', lines: bash([' ❯ Yes', "   Yes, and don't ask again for rm commands in /Users/me/proj", '   No, and tell Claude what to do differently (esc)']) },
  { want: true, name: 'Edit permission', lines: [RULE76, ' Edit file', '', ' src/parse.ts', '', ' Do you want to make this edit to parse.ts?', ' ❯ 1. Yes', '   2. Yes, allow all edits during this session (shift+tab)', '   3. No, and tell Claude what to do differently (esc)'] },
  { want: true, name: '"Do you want to continue?", our text plain', typing: 'thanks', lines: [RULE76, ' Do you want to continue?', ' ❯ 1. Yes', '   2. No'] },
  { want: true, name: '"Do you want to continue?", our text numbered', typing: '1. thanks', lines: [RULE76, ' Do you want to continue?', ' ❯ 1. Yes', '   2. No'] },
  { want: true, name: 'AskUserQuestion list, our text numbered', typing: '1. use tea', lines: [RULE76, ' ☐ Drink', '', ' Tea or coffee?', '', ' ❯ 1. Tea', '      Hot and calm', '   2. Coffee', '   3. Type something.', '', ' Enter to select · ↑/↓ to navigate · Esc to cancel'] },
  { want: true, name: 'plan approval', lines: [RULE76, ' Ready to code?', '', ' Would you like to proceed?', '', ' ❯ 1. Yes, and auto-accept edits', '   2. Yes, and manually approve edits', '   3. No, keep planning'] },
  { want: true, name: 'trust dialog (unnumbered)', lines: [RULE76, ' Accessing workspace:', '', ' /Users/me/proj', '', ' Quick safety check: Is this a project you created or one you trust?', '', ' ❯ Yes, I trust this folder', '   No, exit'] },
  { want: false, name: 'working, empty box', lines: [...prose, '✻ Thinking… (esc to interrupt)', '', ...input('❯')] },
  { want: false, name: 'our plain reply in the box', typing: 'yes, go ahead', lines: [...prose, ...input('❯', 'yes, go ahead')] },
  { want: false, name: 'Claude asked "Would you like to proceed?" in prose; our reply "1. go with the refactor"', typing: '1. go with the refactor', lines: [...prose, ...input('❯', '1. go with the refactor')] },
  { want: false, name: 'same, prompt glyph ">"', typing: '1. go with the refactor', lines: [...prose, ...input('>', '1. go with the refactor')] },
  { want: false, name: 'before the paste: a reply still in the box', lines: [...prose, ...input('❯', '1. go with the refactor')] },
  { want: false, name: 'before the paste: a numbered draft in the box, no question on screen', lines: ['● Done. Tests pass.', '', ...input('❯', '1. now update the docs'), '  2. and the changelog'] },
  { want: false, name: 'our multi-line numbered message, no question on screen', typing: '1. update docs\n2. bump version', lines: ['● Done.', '', RULE76, '❯ 1. update docs', '  2. bump version', RULE76] },
  { want: false, name: 'a big paste folded to its placeholder', typing: 'x'.repeat(5000), lines: [...prose, ...input('❯', '[Pasted text #1 +40 lines]')] },
].map((c) => ({ check: 'dialog', typing: '', ...c }));

// ── The box with SGR attributes: empty or not before the paste, our text or not before Enter (PR #85) ─
const long = 'please look at the parser again because the regex still misses the case where '.repeat(2);
const attrs = [
  { check: 'paste', want: 'paste', name: 'empty box, dim "Try …" placeholder, inverse cursor', lines: box(RULE, [`❯ ${INV('T')}${DIM('ry "fix lint errors"')}`]) },
  { check: 'paste', want: 'paste', name: 'empty box, cursor only', lines: box(RULE, [`❯ ${INV(' ')}`]) },
  { check: 'paste', want: 'paste', name: 'Claude Code\'s own "Try …" in grey, not dim, under a plain rule: known words, so ghost text', lines: box(RULE, [`❯ ${INV('T')}${GRAY('ry "fix lint errors"')}`]) },
  { check: 'paste', want: 'draft', name: 'a half-typed draft', lines: box(RULE, [`❯ half-typed thought${INV(' ')}`]) },
  { check: 'paste', want: 'draft', name: 'shell mode left on ("!", nothing typed)', lines: box(RULE, [`! ${INV(' ')}`]) },
  { check: 'paste', want: 'not-pasted', name: 'a permission dialog (box hidden)', lines: [...talk, RULE, ' Bash command', '', '   rm -rf build', '', ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No, and tell Claude what to do differently (esc)'] },
  { check: 'paste', want: 'not-pasted', name: 'the transcript view (no box on screen)', lines: ['  ⎿  Agent: explore the repo', '     Read 12 files', '', '  Showing detailed transcript · ctrl+o to toggle'] },
  { check: 'dialog', want: false, name: 'our text, cursor after it', typing: 'yes, go ahead', lines: box(RULE, [`❯ yes, go ahead${INV(' ')}`]) },
  { check: 'dialog', want: false, name: 'our text, then a dim suggestion', typing: 'yes', lines: box(RULE, [`❯ yes${INV(' ')}${DIM(' and run the tests')}`]) },
  { check: 'dialog', want: false, name: 'our numbered 3-line text', typing: '1. update docs\n2. bump version\n3. tag it', lines: box(RULE, ['❯ 1. update docs', '  2. bump version', `  3. tag it${INV(' ')}`]) },
  { check: 'dialog', want: false, name: 'a long line wrapped over 2 rows', typing: long, lines: box(RULE, [`❯ ${long.slice(0, 96)}`, `  ${long.slice(96)}${INV(' ')}`]) },
  { check: 'dialog', want: false, name: 'a long paste folded to [Pasted text #1 +40 lines]', typing: 'x\n'.repeat(41), lines: box(RULE, [`❯ [Pasted text #1 +40 lines]${INV(' ')}`]) },
  { check: 'dialog', want: false, name: 'shell mode: "!ls -la" drawn as "! ls -la"', typing: '!ls -la', lines: box(RULE, [`! ls -la${INV(' ')}`]) },
  { check: 'dialog', want: true, name: 'a numbered permission dialog took the keys', typing: 'yes', lines: [...talk, RULE, ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No'] },
  { check: 'dialog', want: true, name: 'an unnumbered permission dialog took the keys', typing: 'yes', lines: [...talk, RULE, ' Do you want to proceed?', ' ❯ Yes', '   No'] },
  { check: 'dialog', want: false, name: 'memory mode: "# note" drawn with a # glyph', typing: '# note: use pnpm', lines: box(RULE, [`# note: use pnpm${INV(' ')}`]) },
  { check: 'dialog', want: false, name: 'the / menu marks its pick with ❯ under the box', typing: '/compact', lines: [...box(RULE, [`❯ /compact${INV(' ')}`]), '  ❯ /compact   Clear history but keep a summary', '    /config    Open config panel'] },
  { check: 'dialog', want: false, name: 'the top rule starts with the session name', typing: 'yes', lines: [...talk, `── Compat Tester ${'─'.repeat(80)}`, `❯ yes${INV(' ')}`, RULE, FOOT] },
  { check: 'dialog', want: false, name: '1.x box with sides, short first line', typing: 'hi\nthere how are you', lines: [...talk, `╭${'─'.repeat(60)}╮`, `│ > hi${' '.repeat(54)}│`, `│   there how are you${INV(' ')}${' '.repeat(38)}│`, `╰${'─'.repeat(60)}╯`] },
];

// ── Ghost text or a real draft, with and without colours (PR #87) ─────────────────────────────
const ghost = [
  { want: 'paste', name: 'colours: empty, dim placeholder, cursor at start', lines: box(RULE_C, [`❯ ${INV('T')}${DIM('ry "fix lint errors"')}`]) },
  { want: 'paste', name: 'NO_COLOR: empty, plain placeholder, cursor at start', lines: box(RULE, [`❯ ${INV('T')}ry "fix lint errors"`]) },
  { want: 'paste', name: 'NO_COLOR: empty, plain placeholder, no cursor (unfocused)', lines: box(RULE, ['❯ Try "fix lint errors"']) },
  { want: 'draft', name: 'colours: plain draft, cursor at its end', lines: box(RULE_C, [`❯ half-typed thought${INV(' ')}`]) },
  { want: 'draft', name: 'colours: plain draft, cursor at its start', lines: box(RULE_C, [`❯ ${INV('h')}alf-typed thought`]) },
  { want: 'draft', name: 'colours: plain draft, no cursor', lines: box(RULE_C, ['❯ half-typed thought']) },
  { want: 'draft', name: 'colours: only a coloured @mention, no cursor', lines: box(RULE_C, [`❯ ${COL('@src/parse.ts')}`]) },
  { want: 'draft', name: 'colours: a leftover coloured [Pasted text #1 +40 lines], no cursor', lines: box(RULE_C, [`❯ ${COL('[Pasted text #1 +40 lines]')}`]) },
  { want: 'draft', name: 'colours: a leftover dim [Pasted text #1 +40 lines], cursor at its end', lines: box(RULE_C, [`❯ ${DIM('[Pasted text #1 +40 lines]')}${INV(' ')}`]) },
  { want: 'draft', name: 'NO_COLOR: plain draft, cursor at its end', lines: box(RULE, [`❯ half-typed thought${INV(' ')}`]) },
  { want: 'draft', name: 'NO_COLOR: plain draft, cursor at its start', lines: box(RULE, [`❯ ${INV('h')}alf-typed thought`]) },
  { want: 'draft', name: 'NO_COLOR: plain draft, no cursor (unfocused)', lines: box(RULE, ['❯ half-typed thought']) },
  { want: 'paste', name: 'a footer tip under the box: "Shift+Enter to add a new line"', lines: [...box(RULE_C, [`❯ ${INV(' ')}`]), '  Tip: Shift+Enter to add a new line'] },
].map((c) => ({ check: 'paste', ...c }));
const merged = [
  { want: true, name: 'before Enter: a leftover coloured [Pasted text …] plus our "probe text"', typing: 'probe text', lines: [RULE_C, `❯ ${COL('[Pasted text #1 +40 lines]')}probe text${INV(' ')}`, RULE_C] },
  { want: true, name: 'before Enter, NO_COLOR: our "probe text" pasted onto the start of an old draft', typing: 'probe text', lines: [RULE, `❯ probe text${INV('h')}alf-typed thought`, RULE] },
].map((c) => ({ check: 'dialog', ...c }));

// ── No false refusals in normal use (PR #89) ─────────────────────────────────────────────────
const wrap = (text, width = 96) => {
  const out = [];
  for (const line of text.split('\n')) {
    const cps = [...line];
    if (!cps.length) out.push('');
    for (let i = 0; i < cps.length; i += width) out.push(cps.slice(i, i + width).join(''));
  }
  return out.map((r, i) => (i ? `  ${r}` : `❯ ${r}`));
};
const shown = (text) => {
  const rows = wrap(text);
  rows[rows.length - 1] += INV(' ');
  return box(RULE_C, rows);
};
const everyday = [
  { want: 'paste', name: 'dim suggested reply after Claude answered', lines: box(RULE_C, [`❯ ${INV('r')}${DIM('un the tests again')}`], HINT) },
  { want: 'paste', name: 'unfocused (no cursor): dim placeholder', lines: box(RULE_C, [`❯ ${DIM('Try "fix lint errors"')}`], HINT) },
  { want: 'paste', name: 'unfocused: dim suggested reply', lines: box(RULE_C, [`❯ ${DIM('run the tests again')}`], HINT) },
  { want: 'paste', name: 'NO_COLOR: plain suggested reply, cursor at start, "? for shortcuts" under the box', lines: box(RULE, [`❯ ${INV('r')}un the tests again`], HINT) },
  { want: 'paste', name: 'NO_COLOR, unfocused: plain suggested reply, "? for shortcuts" under the box', lines: box(RULE, ['❯ run the tests again'], HINT) },
].map((c) => ({ check: 'paste', ...c }));
const nfd = 'café naïve résumé'.normalize('NFD');
const long700 = 'please check the parser again, the empty-string case still slips through when the input ends early; '.repeat(7).slice(0, 700);
const typed = [
  { name: 'emoji with VS16 and a skin tone', typing: 'thanks ❤️ 👍🏽 🎉' },
  { name: 'newer emoji, a ZWJ family', typing: 'new ones 🫨 🪿 🫠 🧑‍🧑‍🧒' },
  { name: 'a flag and keycaps', typing: 'go 🇺🇦 1️⃣ #️⃣' },
  { name: 'CJK', typing: '日本語のテキストを確認してください' },
  { name: 'accents, composed (NFC)', typing: 'café naïve résumé' },
  { name: 'accents typed decomposed (NFD), drawn composed', typing: nfd, show: nfd.normalize('NFC') },
  { name: 'a 700-character line, wrapped over 8 rows', typing: long700 },
  { name: 'tabs, drawn as spaces', typing: 'col1\tcol2\tcol3', show: 'col1    col2    col3' },
  { name: 'a 3-line message, drawn in full', typing: 'one\ntwo\nthree' },
  { name: 'a 4-line paste folded to [Pasted text #1 +3 lines]', typing: 'a\nb\nc\nd', show: '[Pasted text #1 +3 lines]' },
  { name: 'a 900-character paste folded to [Pasted text #1]', typing: 'x'.repeat(900), show: '[Pasted text #1]' },
].map((c) => ({ check: 'dialog', want: false, name: `our text in the box: ${c.name}`, typing: c.typing, lines: shown(c.show ?? c.typing) }));

/** Every drawn screen, with its group for the report. */
export const screens = [
  ...dialogs.map((c) => ({ group: 'dialogs (PR #79)', ...c })),
  ...attrs.map((c) => ({ group: 'box with attributes (PR #85)', ...c })),
  ...ghost.map((c) => ({ group: 'ghost text or a draft (PR #87)', ...c })),
  ...merged.map((c) => ({ group: 'ghost text or a draft (PR #87)', ...c })),
  ...everyday.map((c) => ({ group: 'everyday text (PR #89)', ...c })),
  ...typed.map((c) => ({ group: 'everyday text (PR #89)', ...c })),
];

/**
 * say() against fake-box.mjs: [name, enter (sends|keeps), ghost, text, want, what the box got, rule].
 * Covers the check after Enter (sent or held) and the trailing space after :word, @word and \.
 */
export const boxes = [
  ['Enter sends: sent', 'sends', 'dim', 'hello there', 'sent', 'ENTER "hello there"'],
  ['Enter does nothing: held', 'keeps', 'dim', 'hello there', 'held', 'ENTER "hello there"'],
  ['a last word :tada gets a space (no emoji menu pick)', 'sends', 'none', 'great job :tada', 'sent', 'ENTER "great job :tada "'],
  ['a last word @READ gets a space (no file menu pick)', 'sends', 'none', 'please read @READ', 'sent', 'ENTER "please read @READ "'],
  ['a last \\ gets a space (no new line)', 'sends', 'none', 'C:\\temp\\', 'sent', 'ENTER "C:\\\\temp\\\\ "'],
  ['10:30 at the end: no space', 'sends', 'none', 'meet at 10:30', 'sent', 'ENTER "meet at 10:30"'],
  ['NO_COLOR placeholder after the cursor: pasted, sent', 'sends', 'plain', 'hi', 'sent', 'ENTER "hi"'],
  ['NO_COLOR placeholder, no cursor (unfocused): pasted, sent', 'sends', 'plain-nocursor', 'hi', 'sent', 'ENTER "hi"'],
  ['colours: dim placeholder after the cursor: pasted, sent', 'sends', 'dim', 'hi', 'sent', 'ENTER "hi"', 'grey'],
  ['colours: a grey (not dim) placeholder: refused as a draft', 'sends', 'grey', 'hi', 'draft', '', 'grey'],
  ['colours, unfocused: dim placeholder, no cursor: pasted, sent', 'sends', 'dim-nocursor', 'hi', 'sent', 'ENTER "hi"', 'grey'],
  ['colours: a real draft, cursor at its start: draft', 'sends', 'draft-home', 'hi', 'draft', '', 'grey'],
  ['colours, unfocused: a real draft, no cursor: draft', 'sends', 'draft-nocursor', 'hi', 'draft', '', 'grey'],
  ['NO_COLOR: a suggested reply, no "? for shortcuts": refused as a draft', 'sends', 'plain-suggestion', 'hi', 'draft', ''],
  ['NO_COLOR: a suggested reply over "? for shortcuts": pasted, sent', 'sends', 'plain-suggestion-idle', 'hi', 'sent', 'ENTER "hi"'],
  ['NO_COLOR: the queued-messages placeholder: pasted, sent', 'sends', 'plain-queued', 'hi', 'sent', 'ENTER "hi"'],
  ['a combining accent and a zero-width space: sent', 'sends', 'none', 'cafe\u0301 zero\u200bwidth', 'sent', 'ENTER "cafe\u0301 zero\u200bwidth"'],
].map(([name, enter, ghost, text, want, logged, rule = 'plain']) => ({ group: 'say() on a live box', check: 'box', name, enter, ghost, text, want, logged, rule }));
