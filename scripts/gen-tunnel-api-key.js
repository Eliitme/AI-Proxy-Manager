#!/usr/bin/env node
/**
 * Generate a tunnel API key (sk-{machineId}-{keyId}-{crc}) for testing or manual registration.
 * Uses API_KEY_SECRET and MACHINE_ID_SALT from .env if set; otherwise tunnel defaults.
 *
 * Usage: node scripts/gen-tunnel-api-key.js
 *   Or:  npm run gen-key
 */
import crypto from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  }
}

const MACHINE_ID_SALT = process.env.MACHINE_ID_SALT || "egs-proxy-ai-tunnel-salt";
const API_KEY_SECRET = process.env.API_KEY_SECRET || "egs-proxy-ai-tunnel-api-key-secret";
const SHORT_ID_CHARS = "abcdefghijklmnpqrstuvwxyz23456789";

function getMachineId() {
  try {
    const { machineIdSync } = require("node-machine-id");
    const raw = machineIdSync();
    return crypto.createHash("sha256").update(raw + MACHINE_ID_SALT).digest("hex").substring(0, 16);
  } catch {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  }
}

function generateShortId() {
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += SHORT_ID_CHARS.charAt(Math.floor(Math.random() * SHORT_ID_CHARS.length));
  }
  return result;
}

function generateApiKey(machineId) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let keyId = "";
  for (let i = 0; i < 6; i++) {
    keyId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const crc = crypto.createHmac("sha256", API_KEY_SECRET).update(machineId + keyId).digest("hex").slice(0, 8);
  return `sk-${machineId}-${keyId}-${crc}`;
}

const machineId = getMachineId();
const shortId = generateShortId();
const apiKey = generateApiKey(machineId);

console.log("Tunnel API key (use same API_KEY_SECRET + MACHINE_ID_SALT on worker):");
console.log(apiKey);
console.log("\nShort ID (subdomain):", shortId);
console.log("Machine ID:", machineId);
