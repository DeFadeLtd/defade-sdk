/** Chain id accepted by every token endpoint. Omitted means "solana". */
export type Chain = 'solana' | 'ethereum' | 'base' | 'robinhood' | (string & {});

export interface DeFadeOptions {
  /** DeFade API key (df_…) — https://defade.org/developers */
  apiKey: string;
  /** Override the API origin. Default: https://api.defade.org */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 120000 — full scans are not instant. */
  timeoutMs?: number;
  /** Injectable fetch implementation (testing). */
  fetch?: typeof fetch;
}

export interface TokenCallOptions {
  /** Target chain. EVM chains require an All-Chains API plan. */
  chain?: Chain;
}

/** Candle size for tokenPrice(); it also sets how far back the window reaches. */
export type PriceTimeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D';

export interface TokenPriceOptions extends TokenCallOptions {
  /**
   * Candle size: 1m ≈ last 4 hours, 5m ≈ 20 hours, 15m ≈ 2.5 days (default),
   * 30m ≈ 5 days, 1H ≈ 10 days, 4H ≈ 40 days, 1D ≈ up to 365 days.
   * A token younger than the window returns candles from its first trade.
   */
  type?: PriceTimeframe;
}

export declare class DeFadeError extends Error {
  name: 'DeFadeError';
  /** HTTP status, or 0 for network/timeout/client-side failures. */
  status: number;
  /** Parsed JSON error body when the API returned one. */
  body: unknown;
}

/**
 * Thin client for the DeFade API. Responses are returned as parsed JSON
 * exactly as the API sends them — the API's own /v1 discovery document
 * (DeFade.discover()) is the source of truth for shapes and limits.
 */
export declare class DeFade {
  constructor(opts: DeFadeOptions);

  /** Raw GET against any /v1 path — escape hatch for endpoints newer than the SDK. */
  get(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<any>;

  /**
   * Full token analysis. Returns a SAFETY score where 100 = clean.
   * Opposite direction from rugScore() — do not mix the two scales.
   */
  analyze(mint: string, opts?: TokenCallOptions): Promise<any>;
  /** Rug pull probability 0–100 where HIGHER = MORE DANGEROUS. */
  rugScore(mint: string, opts?: TokenCallOptions): Promise<any>;

  /** Price, market data and OHLCV candles; `type: '1D'` returns up to a year of daily candles. */
  tokenPrice(mint: string, opts?: TokenPriceOptions): Promise<any>;
  holders(mint: string, opts?: TokenCallOptions): Promise<any>;
  liquidity(mint: string, opts?: TokenCallOptions): Promise<any>;
  socials(mint: string, opts?: TokenCallOptions): Promise<any>;

  whales(mint: string, opts?: TokenCallOptions): Promise<any>;
  bundles(mint: string, opts?: TokenCallOptions): Promise<any>;
  bundlesPro(mint: string, opts?: TokenCallOptions): Promise<any>;
  historicalBundles(mint: string, opts?: TokenCallOptions): Promise<any>;
  insiderNetwork(mint: string, opts?: TokenCallOptions): Promise<any>;
  smartMoney(mint: string, opts?: TokenCallOptions): Promise<any>;
  snipers(mint: string, opts?: TokenCallOptions): Promise<any>;
  devTracker(mint: string, opts?: TokenCallOptions): Promise<any>;
  copyTraders(mint: string, opts?: TokenCallOptions): Promise<any>;
  fundingOrigin(mint: string, opts?: TokenCallOptions): Promise<any>;
  fundingGraph(mint: string, opts?: TokenCallOptions): Promise<any>;
  sybilCluster(mint: string, opts?: TokenCallOptions): Promise<any>;
  feeFingerprint(mint: string, opts?: TokenCallOptions): Promise<any>;
  kol(mint: string, opts?: TokenCallOptions): Promise<any>;

  /** Shared holders across 2 or more tokens. */
  holderOverlap(mints: string[], opts?: TokenCallOptions): Promise<any>;
  trending(opts?: TokenCallOptions): Promise<any>;
  /** Remaining units, rate limits and plan for this key. */
  usage(): Promise<any>;

  /** Live API self-description (endpoints, plans, chains, MCP). No key needed. */
  static discover(baseUrl?: string): Promise<any>;
}

export default DeFade;
