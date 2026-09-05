# DeFade SDK

[![npm](https://img.shields.io/npm/v/defade)](https://www.npmjs.com/package/defade)
[![CI](https://github.com/DeFadeLtd/defade-sdk/actions/workflows/test.yml/badge.svg)](https://github.com/DeFadeLtd/defade-sdk/actions)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![defade-sdk MCP server](https://glama.ai/mcp/servers/DeFadeLtd/defade-sdk/badges/score.svg)](https://glama.ai/mcp/servers/DeFadeLtd/defade-sdk)

Official JavaScript/TypeScript client for the [DeFade API](https://defade.org/api-docs) — rug pull risk scores and on-chain behavioral forensics for tokens on **Solana, Ethereum, Base and Robinhood Chain**: launch-block bundle detection, multi-hop funding-origin tracing, deployer history, insider networks, sniper bots, smart-money flow, liquidity verification.

DeFade answers a different question than contract scanners. Not "does this token's code look wrong?" but "did the wallets behind this launch behave like ruggers?" — [99.9% of confirmed Solana rugs had mint authority revoked and 72.9% had locked LP](https://defade.org/blog/state-of-solana-rugs-2026), so token state alone no longer separates safe from staged.

- **Zero dependencies.** Node 18+ (uses global `fetch`). CJS and ESM.
- **Thin by design.** Responses are the API's JSON, unmodified. `client.get()` reaches any endpoint the SDK hasn't wrapped yet.
- **Also an MCP server** — Claude and ChatGPT can run real scans through the same API. [See below](#mcp-connector-scan-from-claude--chatgpt).

## Install

```bash
npm install defade
```

Get an API key at **[defade.org/developers](https://defade.org/developers)** (keys start with `df_`).

## Quickstart

```js
import DeFade from 'defade';

const client = new DeFade({ apiKey: process.env.DEFADE_API_KEY });

// Full multi-module scan — returns a SAFETY score (100 = clean)
const scan = await client.analyze('6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');

// Rug pull probability (100 = dangerous) with the evidence behind it
const risk = await client.rugScore('6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');

// Any endpoint takes ?chain= — omitted means solana
const eth = await client.holders('0x6982508145454ce325ddbe47a25d4ec3d2311933', { chain: 'ethereum' });
```

> [!WARNING]
> **The two scores point in opposite directions.** `analyze()` returns a **safety score** — 100 is clean. `rugScore()` returns a **rug pull probability** — 100 is dangerous. Reading a 90 safety score as "90% chance of rug" produces exactly the wrong answer. Every method's JSDoc restates this.

## Endpoints

All token methods take `(address, { chain? })` and return the API's parsed JSON.

| Group | Methods |
|---|---|
| Scan & scores | `analyze`, `rugScore` |
| Token state | `tokenPrice`, `holders`, `liquidity`, `socials` |
| Launch forensics | `bundles`, `bundlesPro`, `historicalBundles`, `snipers`, `devTracker`, `feeFingerprint` |
| Wallet networks | `insiderNetwork`, `fundingOrigin`, `fundingGraph`, `sybilCluster` |
| Money flow | `whales`, `smartMoney`, `copyTraders`, `kol` |
| Cross-token | `holderOverlap(mints[])`, `trending` |
| Account | `usage` |
| Escape hatch | `get(path, params)` — any `/v1` path |

The API describes itself at [`GET https://api.defade.org/v1`](https://api.defade.org/v1) — endpoint list, plans, unit costs, rate limits and supported chains, always current. From code: `await DeFade.discover()`.

## Chains

`solana` (default), `ethereum`, `base`, `robinhood`. Pass `{ chain: 'base' }` on any token method. EVM chains require an All-Chains plan; a few EVM modules that walk funding graphs cost more units than a standard request — [the discovery document](https://api.defade.org/v1) lists which, and [defade.org/developers](https://defade.org/developers) has current pricing.

## Errors

Every failure throws `DeFadeError` with `.status` (HTTP status, `0` for network/timeout) and `.body` (the API's error JSON when present). Rate-limited calls throw with status `429`; `client.usage()` shows your remaining units and limits. Full scans can take tens of seconds on fresh tokens — the default timeout is 120s, configurable via `timeoutMs`.

```js
import DeFade, { DeFadeError } from 'defade';

try {
  await client.analyze(mint);
} catch (e) {
  if (e instanceof DeFadeError && e.status === 429) {
    // back off; e.body has details
  }
}
```

## MCP connector: scan from Claude & ChatGPT

The same API is exposed as a remote [MCP](https://modelcontextprotocol.io) server, so AI assistants can run real scans in-conversation instead of recalling stale training data:

- **URL:** `https://api.defade.org/mcp` (transport: `streamable-http`)
- **Auth:** `x-api-key` header, or `?api_key=YOUR_KEY` for clients that can't set headers
- **Registry:** published as [`org.defade/defade`](https://registry.modelcontextprotocol.io/v0/servers?search=defade) in the official MCP Registry

Add it to **Claude Code**:

```bash
claude mcp add --transport http defade "https://api.defade.org/mcp?api_key=YOUR_KEY"
```

In **Claude** or **ChatGPT**, add a custom connector with the URL above. Tool calls are metered against your key exactly like REST calls. Full instructions: [defade.org/api-docs#mcp](https://defade.org/api-docs#mcp).

### stdio transport (Claude Desktop, local clients)

This package also ships `defade-mcp`, a local stdio MCP server that proxies to the hosted endpoint — for clients that only launch local commands:

```json
{
  "mcpServers": {
    "defade": {
      "command": "npx",
      "args": ["-y", "defade-mcp"],
      "env": { "DEFADE_API_KEY": "df_your_key" }
    }
  }
}
```

Keyless runs still handshake and list tools; scan tools then reply with instructions to get a key. `DEFADE_MCP_URL` overrides the upstream endpoint for testing.

## Links

- [API docs](https://defade.org/api-docs) · [get a key](https://defade.org/developers) · [live API self-description](https://api.defade.org/v1)
- [The State of Solana Rugs, 2026](https://defade.org/blog/state-of-solana-rugs-2026) — what 18,884 flagged tokens reveal
- [Why tokens with perfect safety scores still rug](https://defade.org/blog/why-tokens-with-good-scores-still-rug)
- [defade.org](https://defade.org) — the web scanner (free tier, no key needed)

## License

MIT © DeFade Ltd. This SDK is open source; the DeFade API it talks to is a hosted commercial service with a free tier.
