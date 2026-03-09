#!/usr/bin/env node
/**
 * One-time backfill: encrypt existing api_keys.key into key_hash + key_encrypted.
 * Run after migration 005. Requires DB_ENCRYPTION_SECRET in .env.
 *
 *   node scripts/db/backfill-encrypt-api-keys.js
 */
import { getPool } from "../../src/lib/db/postgres.js";
import { encrypt, hashForLookup } from "../../src/lib/db/encryption.js";
import { loadEnv } from "./load-env.js";

loadEnv();

if (!process.env.DB_ENCRYPTION_SECRET) {
  console.error("DB_ENCRYPTION_SECRET is required. Set it in .env.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

async function backfill() {
  const p = await getPool();
  if (!p) {
    console.error("PostgreSQL pool not available.");
    process.exit(1);
  }

  const res = await p.query(
    "SELECT id, key FROM api_keys WHERE key IS NOT NULL AND (key_hash IS NULL OR key_encrypted IS NULL)"
  );
  if (res.rows.length === 0) {
    console.log("No api_keys rows to backfill.");
    return;
  }

  console.log(`Backfilling ${res.rows.length} api_keys row(s)...`);
  for (const row of res.rows) {
    const keyHash = hashForLookup(row.key);
    const keyEncrypted = encrypt(row.key);
    await p.query(
      "UPDATE api_keys SET key_hash = $1, key_encrypted = $2 WHERE id = $3",
      [keyHash, keyEncrypted, row.id]
    );
  }
  console.log("Done.");
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
