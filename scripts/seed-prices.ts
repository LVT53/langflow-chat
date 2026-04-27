#!/usr/bin/env tsx
/**
 * Seed model price rules for cost tracking.
 *
 * Usage: npx tsx scripts/seed-prices.ts
 * Run after `npm run db:prepare`, re-run anytime to update prices.
 *
 * ── HOW PRICE MATCHING WORKS ──
 * The app matches your model to a price rule in this priority order:
 *   1. rule.modelId === modelId   (e.g. 'model1')  ← HIGHEST priority
 *   2. rule.providerId === providerId && rule.modelName === providerModelName
 *   3. rule.modelName === providerModelName        ← LOWEST priority
 *
 * Priority 1 entries (model1/model2 below) always apply to Model 1 / Model 2
 * in your admin settings, no matter what model name you type.
 * Priority 3 entries (provider model names) only apply when the "Model Name"
 * field in admin settings matches exactly (case-insensitive).
 *
 * ── CACHE PRICING ──
 * All rules include cache pricing. Cached tokens are priced separately.
 *
 * ── THIS IS STATIC ──
 * Neither Fireworks nor DeepSeek expose pricing via API.
 * To update prices, edit this file and re-run: npx tsx scripts/seed-prices.ts
 * Price sources:
 *   DeepSeek:  https://api-docs.deepseek.com/quick_start/pricing
 *   Fireworks: https://fireworks.ai/pricing
 *
 * ── PRICES ──
 * All prices are in DOLLARS per 1 million tokens.
 * Example: input: 0.14  means  $0.14 per 1M input tokens.
 * The script converts to micro-dollars internally.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = './data/chat.db';
}

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';

const databasePath = process.env.DATABASE_PATH;
const dbDir = dirname(databasePath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma('foreign_keys = ON');

const tableExists = sqlite.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='model_price_rules'"
).get();

if (!tableExists) {
  console.error('model_price_rules table does not exist. Run db:prepare first.');
  process.exit(1);
}

// Convert dollars-per-1M to micro-dollars-per-1M (what the DB stores)
function micro(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}

import { join } from 'path';

const scriptDir = import.meta.dirname ?? '.';

// Try user's custom prices.json first, fall back to prices.default.json
const userPricesPath = join(scriptDir, 'prices.json');
const defaultPricesPath = join(scriptDir, 'prices.default.json');
const pricesPath = existsSync(userPricesPath) ? userPricesPath : defaultPricesPath;

const raw = JSON.parse(readFileSync(pricesPath, 'utf-8'));
const rules: Array<{
  id: string; model_id?: string; model_name?: string;
  input: number; cached_input: number; output: number;
}> = [];

for (const group of Object.values(raw) as Array<Array<{
  id: string; model_id?: string; model_name?: string;
  input: number; cached_input: number; output: number;
}>>) {
  rules.push(...group);
}

console.log(`Reading prices from ${pricesPath.endsWith('prices.json') ? 'prices.json (your local copy)' : 'prices.default.json (tracked)'}`);

const insert = sqlite.prepare(`
  INSERT OR REPLACE INTO model_price_rules
    (id, provider_id, provider_name, model_id, model_name,
     input_usd_micros_per_1m, cached_input_usd_micros_per_1m,
     cache_hit_usd_micros_per_1m, cache_miss_usd_micros_per_1m,
     output_usd_micros_per_1m, enabled, created_at, updated_at)
  VALUES
    (?, NULL, ?, ?, ?,
     ?, ?, ?, ?, ?,
     1, unixepoch(), unixepoch())
`);

// Cache hit/miss default to the same as cached_input unless overridden
function fillCache(r: typeof rules[number]) {
  return {
    cache_hit: r.cached_input,
    cache_miss: r.input,
  };
}

const providerName = (id: string) =>
  id.startsWith('model') ? 'generic' :
  id.startsWith('deepseek') ? 'deepseek' : 'fireworks';

let count = 0;
const tx = sqlite.transaction(() => {
  for (const r of rules) {
    const c = fillCache(r);
    insert.run(
      r.id,
      providerName(r.id),
      r.model_id ?? null,
      r.model_name ?? '',
      micro(r.input), micro(r.cached_input),
      micro(c.cache_hit), micro(c.cache_miss),
      micro(r.output)
    );
    count++;
  }
});
tx();

console.log(`Seeded ${count} model price rules.`);
console.log('');
console.log('To change prices:');
console.log('  1. Edit this file, update the numbers (they are in $ per 1M tokens)');
console.log('  2. Re-run: npx tsx scripts/seed-prices.ts');
console.log('');
console.log('To check stored prices:');
console.log('  sqlite3 data/chat.db "SELECT id,');
console.log('    printf(\"$%.4f\", input_usd_micros_per_1m/1000000.0) AS input,');
console.log('    printf(\"$%.4f\", output_usd_micros_per_1m/1000000.0) AS output');
console.log('  FROM model_price_rules WHERE enabled = 1;"');

sqlite.close();
