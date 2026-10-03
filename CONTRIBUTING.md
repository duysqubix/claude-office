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
  one frame a second and the game suites time out.
- **The compat check** runs your `claude` against a pretend Anthropic API on localhost: no
  login, nothing sent to Anthropic, no cost. It hires, answers questions, calls an intern, lets
  go and calls back through the office's own API, and checks every place the office reads or
  drives Claude Code (command-line flags, `~/.claude/sessions`, transcripts, hooks, the status
  line). `--markdown report.md` writes the results as a table.
