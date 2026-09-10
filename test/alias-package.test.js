'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const root = require('../package.json');
const alias = require('../packages/defade-mcp/package.json');

// The two packages are published together from this repo. A version drift
// would ship a `defade-mcp` whose dependency range can't reach the `defade`
// it was cut alongside, so pin the relationship here rather than in the
// release workflow, where it would only surface after a bad publish.
test('the alias package stays in lockstep with the SDK', () => {
  assert.strictEqual(alias.version, root.version, 'same version');
  assert.strictEqual(alias.dependencies.defade, `^${root.version}`, 'depends on exactly this SDK version line');
  assert.strictEqual(alias.name, 'defade-mcp');
});

// `require('defade/bin/defade-mcp.js')` only resolves while the SDK's
// exports map names that subpath — an exports map is a closed door, so
// dropping the entry would break `npx defade-mcp` with no other signal.
test('the SDK exports the bin path the alias requires', () => {
  assert.strictEqual(root.exports['./bin/defade-mcp.js'], './bin/defade-mcp.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'bin', 'defade-mcp.js')));
  assert.ok(root.files.includes('bin/defade-mcp.js'), 'and publishes it');
});

// End to end: run the alias bin the way npm would — its own directory, the
// SDK resolvable as an installed dependency — and check a JSON-RPC round
// trip comes back out of it.
test('the alias bin boots the real proxy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defade-alias-'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.copyFileSync(path.join(ROOT, 'packages', 'defade-mcp', 'bin', 'defade-mcp.js'), path.join(dir, 'bin', 'defade-mcp.js'));
  fs.symlinkSync(ROOT, path.join(dir, 'node_modules', 'defade'), 'dir');

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const child = spawn(process.execPath, [path.join(dir, 'bin', 'defade-mcp.js')], {
    env: { ...process.env, DEFADE_MCP_URL: `http://127.0.0.1:${server.address().port}/mcp`, DEFADE_API_KEY: 'df_stub' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let out = '';
  child.stdout.setEncoding('utf8');
  const line = new Promise((resolve) => {
    child.stdout.on('data', (c) => {
      out += c;
      const nl = out.indexOf('\n');
      if (nl !== -1) resolve(out.slice(0, nl));
    });
  });

  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  const reply = JSON.parse(await line);
  child.stdin.end();
  await new Promise((r) => child.on('exit', r));
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });

  assert.strictEqual(reply.id, 1);
  assert.strictEqual(reply.result.echo, 'initialize', 'the alias forwarded through the SDK proxy');
});
