// Scan one token and print both scores, labeled correctly.
// Usage: DEFADE_API_KEY=df_... node examples/scan.mjs <token-address> [chain]
import DeFade from 'defade';

const [mint, chain] = process.argv.slice(2);
if (!mint) {
  console.error('usage: DEFADE_API_KEY=df_... node examples/scan.mjs <token-address> [chain]');
  process.exit(1);
}

const client = new DeFade({ apiKey: process.env.DEFADE_API_KEY });

const scan = await client.analyze(mint, chain ? { chain } : undefined);
console.log(`safety score (100 = clean):        ${scan?.risk?.score ?? 'n/a'}`);

const rug = await client.rugScore(mint, chain ? { chain } : undefined);
console.log(`rug probability (100 = dangerous): ${rug?.rugScore ?? 'n/a'}`);
console.log(rug?.verdict ? `verdict: ${rug.verdict}` : '');
