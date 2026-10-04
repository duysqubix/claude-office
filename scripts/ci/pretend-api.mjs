// A pretend Anthropic API on localhost, for the checks that run a real Claude Code with no login,
// nothing sent to Anthropic and no cost (scripts/compat.mjs, scripts/ci/say/live.mjs). It answers
// POST /v1/messages the way the real one does, streamed or not, with what `reply(request,
// headers)` returns: { content: [text and tool_use blocks], delay?: ms before answering }.
import http from 'node:http';

export const text = (t) => ({ type: 'text', text: t });
/** A message's content as blocks (a plain string is one text block). */
export const blocks = (m) => (typeof m?.content === 'string' ? [text(m.content)] : Array.isArray(m?.content) ? m.content : []);
/** The latest user turn (Claude Code may put a system-role message after it). */
export const lastUser = (j) => (j?.messages ?? []).findLast((m) => m?.role === 'user');
/** What the latest user turn says: its text blocks, joined. */
export const said = (j) => blocks(lastUser(j)).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');

/** Start it on a free port. `usage` is what every reply reports; count_tokens answers with its input total. */
export function startPretendApi(reply, { usage = { input_tokens: 1000, output_tokens: 20 } } = {}) {
  let n = 0;
  const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const send = (status, v) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(v));
    };
    if (req.url.startsWith('/api/hello')) return send(200, {});
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) return send(404, { type: 'error', error: { type: 'not_found_error', message: 'Not in the pretend API' } });
    let j;
    try {
      j = JSON.parse(body);
    } catch {
      return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Bad JSON' } });
    }
    if (req.url.startsWith('/v1/messages/count_tokens')) return send(200, { input_tokens: inputTokens });
    const r = await reply(j, req.headers);
    if (r.delay) await new Promise((done) => setTimeout(done, r.delay));
    const msg = {
      id: `msg_pretend_${++n}`,
      type: 'message',
      role: 'assistant',
      model: j.model ?? 'claude-pretend',
      content: r.content,
      stop_reason: r.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage,
    };
    if (j.stream) sse(res, msg);
    else send(200, msg);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

function sse(res, msg) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': `req_${msg.id}` });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { ...msg, content: [], stop_reason: null, usage: { ...msg.usage, output_tokens: 1 } } });
  msg.content.forEach((b, index) => {
    if (b.type === 'text') {
      ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
      ev('content_block_delta', { index, delta: { type: 'text_delta', text: b.text } });
    } else {
      ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    ev('content_block_stop', { index });
  });
  ev('message_delta', { delta: { stop_reason: msg.stop_reason, stop_sequence: null }, usage: { output_tokens: msg.usage.output_tokens } });
  ev('message_stop', {});
  res.end();
}
