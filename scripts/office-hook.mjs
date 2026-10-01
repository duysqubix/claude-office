#!/usr/bin/env node
// Claude Code hook → Claude Office. Installed by `npm run hooks:install` for:
//   PermissionRequest (all tools)  and  PreToolUse (AskUserQuestion | ExitPlanMode)
// Sends the hook input to the office and waits for the manager's in-game answer.
// Prints nothing (= no decision, Claude shows its normal prompt) when the office isn't
// running, nobody is looking at it, or nobody answers in time. Never blocks a session
// longer than the office's hold window, and never fails a tool call by itself.
const PORT = Number(process.env.CLAUDE_OFFICE_PORT ?? 4777);
const MAX_WAIT_MS = 100_000; // the office answers within ~90 s; this is only a safety net

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

try {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: input,
    signal: AbortSignal.timeout(MAX_WAIT_MS),
  });
  if (res.ok) {
    const { output } = await res.json();
    if (output && typeof output === 'object') process.stdout.write(JSON.stringify(output));
  }
} catch {
  // Office closed or unreachable: stay silent so Claude asks in the terminal as usual.
}
process.exit(0);
