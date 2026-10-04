# Contributing

## Pull requests

1. Branch off `main` and name the branch for what it is: `fix/…`, `feat/…`, `assets/…`,
   `docs/…` or `ci/…`. Nobody pushes to `main` directly.
2. Open a pull request into `main`. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
   runs on every push to it:

   | Check | What it runs | Needed to merge |
   | --- | --- | --- |
   | **Fast checks** | `npm run typecheck`, `npm run typecheck:server`, `npm run build`, and the smoke test | yes |
   | **Claude Code compat** | `scripts/compat.mjs` against the Claude Code version in `.github/claude-code-version` | no, but look before merging |

   The **browser checks** ([`.github/workflows/browser.yml`](.github/workflows/browser.yml)), the
   ui-check suites in headless Chrome on macOS, run every night and on demand (Actions →
   Browser checks → Run workflow). Label a pull request `release` to run them on it too. They
   never block a merge.

3. The maintainer reviews and merges with a merge commit (no squash, no rebase), so the
   branch's own commits stay in the history.

## Running the checks yourself

```bash
npm ci
npm run typecheck && npm run typecheck:server && npm run build
node scripts/ci/smoke.mjs                                  # the smoke test
node scripts/ci/ui.mjs                                     # the browser checks (needs Chrome)
CLAUDE_BIN=$(command -v claude) node scripts/compat.mjs    # Claude Code compat
```

Each of these starts an office of its own: a throwaway `HOME` (so its own `~/.claude`), a
private tmux server and a free port. They never touch your office on :4777, your tmux
sessions or your Claude Code login, and nothing they do shows up in your office.

- **The smoke test** gives its office one pretend Claude session, so the Shell tab gets
  tested too, and needs no Claude Code at all. `npm run smoke` still runs it
  against an office that's already open (`PORT=4778 npm run smoke`).
- **The browser checks** run `scripts/ui-check.mjs` against a dev-mode office. They need
  Chrome and a GPU: CI runs them on macOS, because with software WebGL the office draws about
  one frame a second and the game suites time out. To run a suite against a dev office you
  already have open, set `GAME_BASE` or `UI_KIT_BASE` (default `http://127.0.0.1:4778`):
  `GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/game.mjs`. The suites refuse your own
  game on 4777, even when you name it, unless you set `UI_CHECK_ALLOW_4777=1`.
- **The compat check** runs your `claude` against a pretend Anthropic API on localhost: no
  login, nothing sent to Anthropic, no cost. It hires, answers questions, calls an intern, lets
  go and calls back through the office's own API, and checks every place the office reads or
  drives Claude Code (command-line flags, `~/.claude/sessions`, transcripts, hooks, the status
  line, the input box Say types into). `--markdown report.md` writes the results as a table.
  The input-box checks in `scripts/ci/say/` take a few minutes, and `COMPAT_SAY=0` skips them.
  To run them on their own: `node --import tsx scripts/ci/say/synthetic.mjs` (server/tmux.ts
  on drawn screens, no Claude Code needed) and
  `CLAUDE_BIN=$(command -v claude) node --import tsx scripts/ci/say/live.mjs` (a real one).

## The Claude Code compat bot

[`.github/workflows/claude-compat.yml`](.github/workflows/claude-compat.yml) runs every day at
06:41 UTC, and on demand from Actions → Claude Code compat → Run workflow. When npm has a
Claude Code newer than `.github/claude-code-version`, it runs the compat check against it.

- **With a Claude secret**, Claude reads the release notes and the check's results and adapts
  the code. The workflow then re-runs every check itself and opens a draft pull request from
  `compat/claude-code-<version>`, labelled `claude-compat`, saying what changed and why. If
  nothing needed changing, the PR only moves `.github/claude-code-version`. GitHub starts no
  workflows for a PR that a workflow opened, so read it, then mark it ready for review
  (`gh pr ready <number>`). That starts CI, and it merges like any other PR once Fast checks
  passes. A newer release closes an older bot PR it supersedes.
- **Without one**, it opens a single issue labelled `claude-compat`, and updates it on later
  runs, saying the new version is out and whether the compat check passed.

To turn the pull requests on:

1. On a computer where you're signed in to Claude Code with a Pro or Max plan, run
   `claude setup-token` and copy the token it prints. It lasts a year.
2. In the repository, go to Settings → Secrets and variables → Actions → New repository secret.
   Name it `CLAUDE_CODE_OAUTH_TOKEN` and paste the token. An Anthropic API key works too, saved
   as `ANTHROPIC_API_KEY`.
3. Go to Settings → Actions → General → Workflow permissions and tick "Allow GitHub Actions to
   create and approve pull requests". Without it, the bot pushes its branch and links it from
   the issue for you to open the PR.

Claude only ever gets read access: it works in one job and hands its changes over as a patch.
A second job, with no Claude in it, checks the patch, re-runs the checks and opens the PR.
