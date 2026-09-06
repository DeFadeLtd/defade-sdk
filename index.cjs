'use strict';

// Thin client for the DeFade API (https://defade.org) — multi-chain memecoin
// risk analysis. Zero dependencies; Node 18+ (global fetch).
//
// The hosted API is the product; this file only shapes requests. Endpoint
// list, plans and limits are served live at https://api.defade.org/v1 —
// call DeFade.discover() to read them rather than trusting anything baked
// into an SDK release.

const DEFAULT_BASE_URL = 'https://api.defade.org';
const DEFAULT_TIMEOUT_MS = 120_000; // full scans walk funding graphs; they are not instant

class DeFadeError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'DeFadeError';
    this.status = status; // HTTP status, or 0 for network/timeout failures
    this.body = body;     // parsed JSON error body when the API sent one
  }
}

class DeFade {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey  DeFade API key (df_…) — https://defade.org/developers
   * @param {string} [opts.baseUrl]  Override the API origin (testing/proxies).
   * @param {number} [opts.timeoutMs]  Per-request timeout. Default 120000.
   * @param {typeof fetch} [opts.fetch]  Injectable fetch (testing).
   */
  constructor(opts = {}) {
    if (!opts.apiKey || typeof opts.apiKey !== 'string') {
      throw new DeFadeError('apiKey is required — get one at https://defade.org/developers', 0, null);
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this._fetch = opts.fetch || globalThis.fetch;
    if (!this._fetch) {
      throw new DeFadeError('global fetch not found — Node 18+ required, or pass {fetch}', 0, null);
    }
  }

  /**
   * Raw GET against any /v1 path. The typed methods below all route through
   * here, so an endpoint added server-side is reachable before an SDK update.
   * @param {string} path  e.g. '/v1/analyze/So11111111111111111111111111111111111111112'
   * @param {object} [params]  Query parameters (chain, mints, …).
   */
  async get(path, params) {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this._fetch(url, {
        headers: { 'x-api-key': this.apiKey, accept: 'application/json' },
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new DeFadeError(
        e.name === 'AbortError'
          ? `request timed out after ${this.timeoutMs}ms (full scans can be slow — raise timeoutMs)`
          : `network error: ${e.message}`,
        0, null);
    } finally {
      clearTimeout(timer);
    }
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON body; keep null */ }
    if (!res.ok) {
      const msg = (body && (body.error || body.message)) || `HTTP ${res.status}`;
      throw new DeFadeError(
        res.status === 429 ? `${msg} — rate limited; check client.usage() for your plan's limits` : msg,
        res.status, body);
    }
    return body;
  }

  _token(endpoint, mint, opts, extra) {
    // Validation failures reject rather than throw, so every failure mode of
    // an SDK call arrives through the same promise channel.
    if (!mint) return Promise.reject(new DeFadeError(`${endpoint}: token address is required`, 0, null));
    const params = { ...(opts && opts.chain ? { chain: opts.chain } : {}), ...(extra || {}) };
    return this.get(`/v1/${endpoint}/${encodeURIComponent(mint)}`,
      Object.keys(params).length ? params : undefined);
  }

  // --- full scan + scores -------------------------------------------------

  /**
   * Full token analysis. NOTE: analyze() returns a SAFETY score (100 = clean).
   * rugScore() returns a rug pull PROBABILITY (100 = dangerous). The two
   * scales point in opposite directions — do not mix them up.
   */
  analyze(mint, opts) { return this._token('analyze', mint, opts); }

  /** Rug pull probability 0–100 — HIGHER IS MORE DANGEROUS (see analyze()). */
  rugScore(mint, opts) { return this._token('rug-score', mint, opts); }

  // --- token state --------------------------------------------------------

  /**
   * Price, market data and OHLCV candles. `type` picks the candle size and
   * with it how far back the window reaches: 15m (default) ≈ 2.5 days,
   * 1H ≈ 10 days, 4H ≈ 40 days, 1D ≈ up to a year of daily candles.
   */
  tokenPrice(mint, opts) {
    return this._token('token-price', mint, opts, opts && opts.type ? { type: opts.type } : undefined);
  }
  holders(mint, opts) { return this._token('holders', mint, opts); }
  liquidity(mint, opts) { return this._token('liquidity', mint, opts); }
  socials(mint, opts) { return this._token('socials', mint, opts); }

  // --- behavioral forensics ----------------------------------------------

  whales(mint, opts) { return this._token('whales', mint, opts); }
  bundles(mint, opts) { return this._token('bundles', mint, opts); }
  bundlesPro(mint, opts) { return this._token('bundles-pro', mint, opts); }
  historicalBundles(mint, opts) { return this._token('historical-bundles', mint, opts); }
  insiderNetwork(mint, opts) { return this._token('insider-network', mint, opts); }
  smartMoney(mint, opts) { return this._token('smart-money', mint, opts); }
  snipers(mint, opts) { return this._token('snipers', mint, opts); }
  devTracker(mint, opts) { return this._token('dev-tracker', mint, opts); }
  copyTraders(mint, opts) { return this._token('copy-traders', mint, opts); }
  fundingOrigin(mint, opts) { return this._token('funding-origin', mint, opts); }
  fundingGraph(mint, opts) { return this._token('funding-graph', mint, opts); }
  sybilCluster(mint, opts) { return this._token('sybil-cluster', mint, opts); }
  feeFingerprint(mint, opts) { return this._token('fee-fingerprint', mint, opts); }
  kol(mint, opts) { return this._token('kol', mint, opts); }

  // --- cross-token + account ----------------------------------------------

  /** Shared holders across 2+ tokens. @param {string[]} mints */
  holderOverlap(mints, opts) {
    if (!Array.isArray(mints) || mints.length < 2) {
      return Promise.reject(new DeFadeError('holderOverlap: pass an array of 2+ token addresses', 0, null));
    }
    const params = { mints: mints.join(',') };
    if (opts && opts.chain) params.chain = opts.chain;
    return this.get('/v1/holder-overlap', params);
  }

  trending(opts) { return this.get('/v1/trending', opts && opts.chain ? { chain: opts.chain } : undefined); }

  /** Remaining units, rate limits and plan for this key. Free to call. */
  usage() { return this.get('/v1/usage'); }

  /**
   * The live API self-description: endpoint list, plans, unit costs, chains,
   * MCP connector details. No API key required.
   */
  static async discover(baseUrl) {
    const res = await fetch((baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '') + '/v1');
    if (!res.ok) throw new DeFadeError(`discovery failed: HTTP ${res.status}`, res.status, null);
    return res.json();
  }
}

module.exports = { DeFade, DeFadeError };
