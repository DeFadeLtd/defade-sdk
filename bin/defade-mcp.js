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

async function forward(msg) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(msg) });
  const text = await res.text();
  if (!text) return null; // accepted notification
  try { return JSON.parse(text); } catch {
    return { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: `upstream sent non-JSON (HTTP ${res.status})` } };
  }
}

function reply(obj) {
  if (obj != null) process.stdout.write(JSON.stringify(obj) + '\n');
}

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
