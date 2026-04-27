#!/usr/bin/env tsx
/**
 * Seed model price rules for common providers.
 *
 * Usage: npx tsx scripts/seed-prices.ts
 *
 * Prices sourced from:
 *   - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 *   - Fireworks: https://fireworks.ai/pricing
 *
 * Prices in usd_micros per 1M tokens (1 usd_micro = $0.000001).
 * Run any time to upsert latest prices (idempotent via INSERT OR REPLACE).
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

// Check if table exists
const tableExists = sqlite.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='model_price_rules'"
).get();

if (!tableExists) {
  console.error('model_price_rules table does not exist. Run db:prepare first.');
  process.exit(1);
}

// Define all price rules
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
  // ── DeepSeek (sourced from api-docs.deepseek.com) ──
  { id: 'deepseek-v4-flash', provider_name: 'deepseek', model_id: null, model_name: 'deepseek-v4-flash', input: 140_000, cached_input: 2_800, cache_hit: 2_800, cache_miss: 140_000, output: 280_000 },
  { id: 'deepseek-v4-pro',   provider_name: 'deepseek', model_id: null, model_name: 'deepseek-v4-pro',   input: 1_740_000, cached_input: 3_625, cache_hit: 3_625, cache_miss: 1_740_000, output: 3_480_000 },
  // Note: deepseek-chat and deepseek-reasoner deprecated 2026/07/24, mapped to v4-flash modes
  { id: 'deepseek-chat',     provider_name: 'deepseek', model_id: null, model_name: 'deepseek-chat',     input: 280_000, cached_input: 28_000, cache_hit: 28_000, cache_miss: 280_000, output: 420_000 },
  { id: 'deepseek-reasoner', provider_name: 'deepseek', model_id: null, model_name: 'deepseek-reasoner', input: 280_000, cached_input: 28_000, cache_hit: 28_000, cache_miss: 280_000, output: 420_000 },

  // ── Fireworks (sourced from fireworks.ai/pricing) ──
  // Tier: < 4B parameters
  { id: 'fireworks-sub4b',   provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-2-3b', input: 100_000, cached_input: 50_000, cache_hit: 50_000, cache_miss: 100_000, output: 100_000 },
  // Tier: 4B-16B parameters
  { id: 'fireworks-4b-16b',  provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-1-8b', input: 200_000, cached_input: 100_000, cache_hit: 100_000, cache_miss: 200_000, output: 200_000 },
  // Tier: > 16B parameters (dense)
  { id: 'fireworks-gt16b',   provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/llama-v3-1-70b', input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
  // Tier: MoE 0-56B (e.g. Mixtral 8x7B)
  { id: 'fireworks-moe-56b', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/mixtral-8x7b', input: 500_000, cached_input: 250_000, cache_hit: 250_000, cache_miss: 500_000, output: 500_000 },
  // Tier: MoE 56.1B-176B
  { id: 'fireworks-moe-176b', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/dbrx-instruct', input: 1_200_000, cached_input: 600_000, cache_hit: 600_000, cache_miss: 1_200_000, output: 1_200_000 },
  // DeepSeek V3 on Fireworks
  { id: 'fireworks-deepseek-v3', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/deepseek-v3', input: 560_000, cached_input: 280_000, cache_hit: 280_000, cache_miss: 560_000, output: 1_680_000 },
  // Qwen 2.5 72B
  { id: 'fireworks-qwen-72b', provider_name: 'fireworks', model_id: null, model_name: 'accounts/fireworks/models/qwen2-5-72b', input: 900_000, cached_input: 450_000, cache_hit: 450_000, cache_miss: 900_000, output: 900_000 },
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
sqlite.close();
