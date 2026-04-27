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
 * For built-in models (Model 1 / Model 2 in admin settings):
 *   → The "Flow ID / Model Name" field you type under "Edit Model"
 *     is stored as `providerModelName` in usage events.
 *   → If that value matches a `model_name` below, the price applies
 *     via priority 3.
 *   → To make model1/model2 always get a price regardless of what
 *     you type as model name, set `model_id: 'model1'` below.
 *     This matches by priority 1 (highest).
 *
 * For third-party/provider models:
 *   → Matched by priority 2 (provider + model name) or priority 3
 *     (just model name).
 *
 * ── CACHE PRICING ──
 * All rules include cache hit/miss fields. The app already subtracts
 * cached tokens from regular input cost and prices them separately.
 *
 * ── THIS IS STATIC ──
 * Neither Fireworks nor DeepSeek expose pricing via API.
 * To update prices, edit this file and re-run the script.
 * Price sources:
 *   DeepSeek:  https://api-docs.deepseek.com/quick_start/pricing
 *   Fireworks: https://fireworks.ai/pricing
 *
 * Prices in usd_micros per 1M tokens (1 usd_micro = $0.000001).
 *   Example: input=140_000 means $0.14 per 1M input tokens.
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = './data/chat.db';
}

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

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

const rules: Array<{
  id: string;
  provider_name: string;
  model_id: string | null;
  model_name: string;
  input: number;
  cached_input: number;
  cache_hit: number;
  cache_miss: number;
  output: number;
}> = [

  // ═══════════════════════════════════════════════════════════
  // Built-in model slots (match by modelId, priority 1)
  // These cover Model 1 / Model 2 in admin settings regardless
  // of what model name the user types.
  // Update the prices below to match whatever model you actually
  // use for each slot.
  // ═══════════════════════════════════════════════════════════
  { id: 'model1-default', provider_name: 'generic', model_id: 'model1', model_name: '', input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
  { id: 'model2-default', provider_name: 'generic', model_id: 'model2', model_name: '', input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },

  // ═══════════════════════════════════════════════════════════
  // DeepSeek (match by model_name, priority 3)
  // Set your model's "Model Name" in admin settings to one of
  // these values to get the correct price.
  // ═══════════════════════════════════════════════════════════
  { id: 'deepseek-v4-flash', provider_name: 'deepseek', model_id: null, model_name: 'deepseek-v4-flash', input: 140_000, cached_input: 2_800, cache_hit: 2_800, cache_miss: 140_000, output: 280_000 },
  { id: 'deepseek-v4-pro',   provider_name: 'deepseek', model_id: null, model_name: 'deepseek-v4-pro',   input: 1_740_000, cached_input: 3_625, cache_hit: 3_625, cache_miss: 1_740_000, output: 3_480_000 },
  { id: 'deepseek-chat',     provider_name: 'deepseek', model_id: null, model_name: 'deepseek-chat',     input: 280_000, cached_input: 28_000, cache_hit: 28_000, cache_miss: 280_000, output: 420_000 },
  { id: 'deepseek-reasoner', provider_name: 'deepseek', model_id: null, model_name: 'deepseek-reasoner', input: 280_000, cached_input: 28_000, cache_hit: 28_000, cache_miss: 280_000, output: 420_000 },

  // ═══════════════════════════════════════════════════════════
  // Fireworks (match by model_name, priority 3)
  // Set your model's "Model Name" to the exact provider path.
  // ═══════════════════════════════════════════════════════════
  { id: 'fw-llama-3-2-3b',  provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-2-3b',   input: 100_000, cached_input: 50_000, cache_hit: 50_000, cache_miss: 100_000, output: 100_000 },
  { id: 'fw-llama-3-1-8b',  provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-1-8b',   input: 200_000, cached_input: 100_000, cache_hit: 100_000, cache_miss: 200_000, output: 200_000 },
  { id: 'fw-llama-3-1-70b', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-1-70b',  input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
  { id: 'fw-llama-3-3-70b', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-3-70b',  input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
  { id: 'fw-mixtral-8x7b',  provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/mixtral-8x7b',   input: 500_000, cached_input: 250_000, cache_hit: 250_000, cache_miss: 500_000, output: 500_000 },
  { id: 'fw-mixtral-8x22b', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/mixtral-8x22b',  input: 1_200_000, cached_input: 600_000, cache_hit: 600_000, cache_miss: 1_200_000, output: 1_200_000 },
  { id: 'fw-dbrx-instruct', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/dbrx-instruct',  input: 1_200_000, cached_input: 600_000, cache_hit: 600_000, cache_miss: 1_200_000, output: 1_200_000 },
  { id: 'fw-deepseek-v3',   provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/deepseek-v3',    input: 560_000, cached_input: 280_000, cache_hit: 280_000, cache_miss: 560_000, output: 1_680_000 },
  { id: 'fw-qwen2-5-72b',   provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/qwen2-5-72b',   input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
  { id: 'fw-qwen2-5-32b',   provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/qwen2-5-32b',   input: 200_000, cached_input: 100_000, cache_hit: 100_000, cache_miss: 200_000, output: 200_000 },
  { id: 'fw-llama-v4-scout', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v4-scout', input: 200_000, cached_input: 100_000, cache_hit: 100_000, cache_miss: 200_000, output: 200_000 },
  { id: 'fw-llama-v4-maverick', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v4-maverick', input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
];

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

let count = 0;
const tx = sqlite.transaction(() => {
  for (const r of rules) {
    insert.run(r.id, r.provider_name, r.model_id, r.model_name,
      r.input, r.cached_input, r.cache_hit, r.cache_miss, r.output);
    count++;
  }
});
tx();

console.log(`Seeded ${count} model price rules.`);
console.log('To verify: SELECT * FROM model_price_rules WHERE enabled = 1;');
sqlite.close();
