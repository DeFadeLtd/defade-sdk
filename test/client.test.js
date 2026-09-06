'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { DeFade, DeFadeError } = require('../index.cjs');

// A fetch stub that records the request and answers with a canned response.
function stub(status, body) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  fn.calls = calls;
  return fn;
}

const KEY = 'df_test_key';
const MINT = 'So11111111111111111111111111111111111111112';

test('requires an api key', () => {
  assert.throws(() => new DeFade({}), DeFadeError);
});

test('sends the key in x-api-key and hits the right path', async () => {
  const f = stub(200, { ok: true });
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await c.analyze(MINT);
  assert.strictEqual(f.calls.length, 1);
  assert.strictEqual(f.calls[0].url, `https://api.defade.org/v1/analyze/${MINT}`);
  assert.strictEqual(f.calls[0].opts.headers['x-api-key'], KEY);
});

test('chain option becomes ?chain=', async () => {
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await c.holders('0xabc', { chain: 'base' });
  assert.strictEqual(f.calls[0].url, 'https://api.defade.org/v1/holders/0xabc?chain=base');
});

test('tokenPrice type option becomes ?type=, alongside chain', async () => {
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await c.tokenPrice(MINT, { type: '1D' });
  assert.strictEqual(f.calls[0].url, `https://api.defade.org/v1/token-price/${MINT}?type=1D`);
  await c.tokenPrice('0xabc', { chain: 'base', type: '4H' });
  assert.strictEqual(f.calls[1].url, 'https://api.defade.org/v1/token-price/0xabc?chain=base&type=4H');
  await c.tokenPrice(MINT);
  assert.strictEqual(f.calls[2].url, `https://api.defade.org/v1/token-price/${MINT}`, 'no type means the API picks its default');
});

test('every wrapped token endpoint builds its documented path', async () => {
  // Method name -> /v1 path segment. This is the SDK's contract with the API;
  // https://api.defade.org/v1 lists the live surface.
  const map = {
    analyze: 'analyze', rugScore: 'rug-score', tokenPrice: 'token-price',
    holders: 'holders', liquidity: 'liquidity', socials: 'socials',
    whales: 'whales', bundles: 'bundles', bundlesPro: 'bundles-pro',
    historicalBundles: 'historical-bundles', insiderNetwork: 'insider-network',
    smartMoney: 'smart-money', snipers: 'snipers', devTracker: 'dev-tracker',
    copyTraders: 'copy-traders', fundingOrigin: 'funding-origin',
    fundingGraph: 'funding-graph', sybilCluster: 'sybil-cluster',
    feeFingerprint: 'fee-fingerprint', kol: 'kol',
  };
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f });
  for (const m of Object.keys(map)) await c[m](MINT);
  const paths = f.calls.map((x) => new URL(x.url).pathname);
  assert.deepStrictEqual(paths, Object.values(map).map((p) => `/v1/${p}/${MINT}`));
});

test('holderOverlap joins mints and validates arity', async () => {
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await c.holderOverlap(['a', 'b', 'c']);
  assert.strictEqual(f.calls[0].url, 'https://api.defade.org/v1/holder-overlap?mints=a%2Cb%2Cc');
  await assert.rejects(() => c.holderOverlap(['only-one']), DeFadeError);
});

test('trending and usage take no token', async () => {
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await c.trending({ chain: 'ethereum' });
  await c.usage();
  assert.strictEqual(f.calls[0].url, 'https://api.defade.org/v1/trending?chain=ethereum');
  assert.strictEqual(f.calls[1].url, 'https://api.defade.org/v1/usage');
});

test('API errors become DeFadeError with status and body', async () => {
  const f = stub(401, { error: 'Invalid API key' });
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await assert.rejects(() => c.analyze(MINT), (e) => {
    assert.ok(e instanceof DeFadeError);
    assert.strictEqual(e.status, 401);
    assert.strictEqual(e.body.error, 'Invalid API key');
    assert.match(e.message, /Invalid API key/);
    return true;
  });
});

test('429 message points at usage()', async () => {
  const f = stub(429, { error: 'Rate limit exceeded' });
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await assert.rejects(() => c.analyze(MINT), /usage\(\)/);
});

test('missing mint fails client-side, before any request', async () => {
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f });
  await assert.rejects(() => c.analyze(''), DeFadeError);
  assert.strictEqual(f.calls.length, 0);
});

test('baseUrl override and trailing-slash tolerance', async () => {
  const f = stub(200, {});
  const c = new DeFade({ apiKey: KEY, fetch: f, baseUrl: 'http://localhost:3000/' });
  await c.usage();
  assert.strictEqual(f.calls[0].url, 'http://localhost:3000/v1/usage');
});

test('ESM wrapper re-exports the same classes', async () => {
  const esm = await import('../index.mjs');
  assert.strictEqual(esm.DeFade, DeFade);
  assert.strictEqual(esm.default, DeFade);
  assert.strictEqual(esm.DeFadeError, DeFadeError);
});
