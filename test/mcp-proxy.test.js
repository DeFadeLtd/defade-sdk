'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

// Spin up a stub "remote MCP endpoint", point the proxy at it over
// DEFADE_MCP_URL, and speak stdio JSON-RPC to the child process.
test('stdio proxy forwards requests, drops notification replies, sends the key', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      seen.push({ msg, key: req.headers['x-api-key'] });
      res.setHeader('content-type', 'application/json');
      if (msg.id === undefined || msg.id === null) return res.end(''); // notification: 202-style empty body
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'defade-mcp.js')], {
    env: { ...process.env, DEFADE_MCP_URL: url, DEFADE_API_KEY: 'df_stub' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const lines = [];
  let out = '';
  child.stdout.setEncoding('utf8');
  const gotLines = (n) => new Promise((resolve) => {
    const check = () => { if (lines.length >= n) resolve(); };
    child.stdout.on('data', (c) => {
      out += c;
      let nl;
      while ((nl = out.indexOf('\n')) !== -1) { lines.push(out.slice(0, nl)); out = out.slice(nl + 1); }
      check();
    });
    check();
  });

  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await gotLines(2);
  child.stdin.end();
  await new Promise((r) => child.on('exit', r));
  server.close();

  const replies = lines.map((l) => JSON.parse(l));
  assert.deepStrictEqual(replies.map((r) => r.id), [1, 2], 'one reply per request, none for the notification');
  assert.strictEqual(replies[0].result.echo, 'initialize');
  assert.strictEqual(replies[1].result.echo, 'tools/list');
  assert.strictEqual(seen.length, 3, 'notification was forwarded upstream too');
  assert.ok(seen.every((s) => s.key === 'df_stub'), 'api key travels on every upstream call');
});
