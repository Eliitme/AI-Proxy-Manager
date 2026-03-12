#!/usr/bin/env node
/**
 * migrate-usage-json-to-pg.js
 *
 * One-time migration: reads usage.json (lowdb) and imports records into
 * the PostgreSQL `usage_history` table.
 *
 * Usage:
 *   node scripts/migrate-usage-json-to-pg.js [--dry-run] [--file <path>]
 *
 * Options:
 *   --dry-run   Print what would be inserted but don't write to DB
 *   --file      Path to usage.json (default: auto-detected from DATA_DIR)
 *
 * Requirements:
 *   DATABASE_URL must be set (or .env loaded).
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { pathToFileURL } from "url";

// Load .env if present (best-effort)
try {
  const dotenvPath = new URL("../node_modules/dotenv/lib/main.js", import.meta.url);
  const { config } = await import(dotenvPath.href);
  config();
} catch { /* dotenv not available — rely on environment */ }

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileArgIdx = args.indexOf("--file");
const fileArg = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;

// ── Resolve usage.json path ────────────────────────────────────────────────

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "egs-proxy-ai");
  }
  return path.join(home, ".egs-proxy-ai");
}

const usageJsonPath = fileArg || path.join(getDataDir(), "usage.json");

if (!fs.existsSync(usageJsonPath)) {
  console.log(`ℹ️  No usage.json found at: ${usageJsonPath}`);
  console.log("Nothing to migrate.");
  process.exit(0);
}

// ── Read source data ───────────────────────────────────────────────────────

let sourceData;
try {
  sourceData = JSON.parse(fs.readFileSync(usageJsonPath, "utf-8"));
} catch (err) {
  console.error(`❌ Failed to parse usage.json: ${err.message}`);
  process.exit(1);
}

const records = sourceData?.history;
if (!Array.isArray(records) || records.length === 0) {
  console.log("ℹ️  usage.json contains no history entries. Nothing to migrate.");
  process.exit(0);
}

console.log(`📂 Found ${records.length} records in ${usageJsonPath}`);
if (dryRun) console.log("🔍 DRY RUN — no data will be written.");

// ── Connect to PostgreSQL ──────────────────────────────────────────────────

const { default: pg } = await import("pg");
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

// ── Migrate ────────────────────────────────────────────────────────────────

let inserted = 0;
let skipped = 0;
let errors = 0;

const BATCH_SIZE = 100;

async function insertBatch(batch) {
  if (dryRun) {
    inserted += batch.length;
    return;
  }

  // Build a multi-row INSERT with ON CONFLICT DO NOTHING (idempotent).
  // We use timestamp + model + provider as a natural dedup key.
  const valuePlaceholders = [];
  const values = [];
  let p = 1;

  for (const r of batch) {
    const timestamp = r.timestamp ? new Date(r.timestamp) : new Date();
    if (isNaN(timestamp.getTime())) {
      skipped++;
      continue;
    }
    valuePlaceholders.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
    );
    values.push(
      r.userId || null,
      r.apiKeyId || null,
      r.model || null,
      r.provider || null,
      r.connectionId || null,
      JSON.stringify(r.tokens || {}),
      Number(r.cost) || 0,
      r.status || "ok",
      timestamp
    );
  }

  if (valuePlaceholders.length === 0) return;

  await pool.query(
    `INSERT INTO usage_history
       (user_id, api_key_id, model, provider, connection_id, tokens, cost, status, timestamp)
     VALUES ${valuePlaceholders.join(", ")}
     ON CONFLICT DO NOTHING`,
    values
  );
  inserted += valuePlaceholders.length;
}

try {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    process.stdout.write(`\r⏳ Migrating... ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`);
    try {
      await insertBatch(batch);
    } catch (err) {
      console.error(`\n⚠️  Batch ${i}-${i + BATCH_SIZE} error: ${err.message}`);
      errors++;
    }
  }
  console.log(`\n✅ Migration complete.`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped:  ${skipped}`);
  if (errors > 0) console.log(`   Errors:   ${errors}`);

  if (!dryRun && inserted > 0) {
    // Rename usage.json so it's not re-migrated accidentally
    const archivePath = usageJsonPath + ".migrated";
    fs.renameSync(usageJsonPath, archivePath);
    console.log(`📦 Original file archived to: ${archivePath}`);
  }
} finally {
  await pool.end();
}
