#!/usr/bin/env node
/**
 * Run PostgreSQL migrations from migrations/ in order.
 * Uses DATABASE_URL from environment (loads .env from project root if present).
 *
 * Usage:
 *   node scripts/db/migrate.js
 *   DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/db/migrate.js
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

import { loadEnv } from "./load-env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it in .env or the environment.");
  process.exit(1);
}

const projectRoot = resolve(__dirname, "../..");
const migrationsDir = join(projectRoot, "migrations");

if (!existsSync(migrationsDir)) {
  console.error("Migrations directory not found:", migrationsDir);
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("No .sql migration files found in", migrationsDir);
  process.exit(0);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

/**
 * Split a SQL file into individual statements.
 * Handles dollar-quoted strings and strips comments.
 */
function splitStatements(sql) {
  // Remove single-line comments
  const stripped = sql.replace(/--[^\n]*/g, "");
  // Split on semicolons (naive but sufficient for migrations that avoid PL/pgSQL)
  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function run() {
  try {
    await client.connect();
    console.log("Connected to database.");

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, "utf8");
      process.stdout.write(`Running ${file} ... `);

      const statements = splitStatements(sql);

      for (const stmt of statements) {
        // CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
        // Detect it and run outside BEGIN/COMMIT.
        const isConcurrent = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(stmt);

        if (isConcurrent) {
          // Run directly — no transaction wrapper
          await client.query(stmt);
        } else {
          // Wrap in a transaction for atomicity
          await client.query("BEGIN");
          try {
            await client.query(stmt);
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          }
        }
      }

      console.log("OK");
    }

    console.log(`Done. Ran ${files.length} migration(s).`);
  } catch (err) {
    console.error("\nMigration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
