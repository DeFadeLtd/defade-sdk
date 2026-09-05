#!/usr/bin/env node
'use strict';

// Local MCP server (stdio transport) proxying to the hosted DeFade MCP
// endpoint. For clients that only speak stdio — Claude Desktop config,
// `claude mcp add defade -- npx -y defade-mcp`, inspectors — while the
// remote streamable-http endpoint stays the single implementation.
//
// The remote server is stateless and answers plain JSON per POST, so the
// proxy is one HTTP round trip per JSON-RPC message: read a line from
// stdin, POST it, write the response line to stdout. Notifications (no id)
// are forwarded and produce no output line, per JSON-RPC.
//
// Auth: DEFADE_API_KEY env var or --api-key=df_… argument. Keyless runs
// still handshake and list tools (directory health checks rely on that);
// scan tools then answer with instructions to get a key.

const ENDPOINT = process.env.DEFADE_MCP_URL || 'https://api.defade.org/mcp';
const VERSION = require('../package.json').version;

let apiKey = process.env.DEFADE_API_KEY || '';
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--api-key=(.+)$/);
  if (m) apiKey = m[1];
  if (a === '--help' || a === '-h') {
    process.stderr.write(
      'defade-mcp — stdio MCP server proxying to ' + ENDPOINT + '\n' +
      'usage: DEFADE_API_KEY=df_… defade-mcp   (or --api-key=df_…)\n' +
      'Get a key at https://defade.org/developers — docs at https://defade.org/api-docs#mcp\n');
    process.exit(0);
  }
}

const TIMEOUT_MS = 150000; // above the remote server's own 120s upstream budget
const RETRYABLE_STATUS = new Set([502, 503, 504, 522, 524]); // gateway hiccups, not tool errors

async function post(msg) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(ENDPOINT, {
    method: 'POST', headers, body: JSON.stringify(msg),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { res, text: await res.text() };
}

const backoff = () => new Promise((r) => setTimeout(r, 500));

// stdout is the protocol channel, so diagnostics go to stderr — hosted
// runners surface stderr in their log views, which is where these lines
// are read when a tool call fails in the wild.
const log = (line) => process.stderr.write(`[defade-mcp v${VERSION}] ${line}\n`);

// Every DeFade tool is read-only and idempotent, so retrying a message once
// is always safe. Hosted containers (Glama instances and the like) see
// transient egress failures a laptop never does, and without the retry each
// one surfaces to the assistant as a failed tool call.
async function forward(msg) {
  const what = `${msg.method}${msg.id !== undefined && msg.id !== null ? `#${msg.id}` : ''}`;
  let out;
  try {
    out = await post(msg);
  } catch (e) {
    log(`${what}: network failure (${e.message}), retrying once`);
    await backoff();
    out = await post(msg); // a second network failure propagates to the caller
  }
  if (RETRYABLE_STATUS.has(out.res.status)) {
    log(`${what}: gateway HTTP ${out.res.status}, retrying once`);
    await backoff();
    try { out = await post(msg); } catch { /* keep the gateway response we have */ }
  }
  const { res, text } = out;
  if (!text) return null; // accepted notification
  try { return JSON.parse(text); } catch {
    return { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: `upstream sent non-JSON (HTTP ${res.status})` } };
  }
}

function reply(obj) {
  if (obj != null) process.stdout.write(JSON.stringify(obj) + '\n');
}

log(`started, proxying to ${ENDPOINT} (key: ${apiKey ? 'set' : 'none'})`);

let buffer = '';
let pending = 0;
let stdinDone = false;
function maybeExit() { if (stdinDone && pending === 0) process.exit(0); }
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch {
      reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      continue;
    }
    const isNotification = msg.id === undefined || msg.id === null;
    pending++;
    forward(msg)
      .then((res) => { if (!isNotification) reply(res); })
      .catch((e) => {
        log(`${msg.method}: giving up after retry (${e.message})`);
        if (!isNotification) {
          reply({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `upstream unreachable: ${e.message}` } });
        }
      })
      .finally(() => { pending--; maybeExit(); });
  }
});
// A closed stdin means the client is done SENDING — replies for requests
// already in flight still have to go out before the process may exit.
process.stdin.on('end', () => { stdinDone = true; maybeExit(); });
