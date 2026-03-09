/**
 * At-rest encryption for sensitive DB fields (api_keys.key, provider_connections.api_key).
 * Uses AES-256-GCM. Key derived from DB_ENCRYPTION_SECRET.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const SALT = "egs-proxy-ai-db-encryption-v1";

function getEncryptionKey() {
  const secret = process.env.DB_ENCRYPTION_SECRET;
  if (!secret || String(secret).trim() === "") {
    throw new Error(
      "DB_ENCRYPTION_SECRET is required for encrypting API keys in the database. Set it in .env (e.g. a 32+ character random string)."
    );
  }
  return crypto.createHash("sha256").update(secret + SALT).digest();
}

/**
 * Encrypt plaintext. Output format: iv:authTag:hexCiphertext (all hex).
 * @param {string} plaintext
 * @returns {string}
 */
export function encrypt(plaintext) {
  if (plaintext == null || plaintext === "") return plaintext;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt ciphertext (format iv:authTag:hexCiphertext). Returns null on failure.
 * @param {string} ciphertext
 * @returns {string|null}
 */
export function decrypt(ciphertext) {
  if (ciphertext == null || ciphertext === "") return ciphertext;
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return (
      decipher.update(Buffer.from(dataHex, "hex"), undefined, "utf8") +
      decipher.final("utf8")
    );
  } catch {
    return null;
  }
}

/**
 * SHA-256 hex digest for api_keys lookup (validateApiKey by hash).
 * @param {string} plaintext
 * @returns {string} 64-char hex
 */
export function hashForLookup(plaintext) {
  if (plaintext == null) return "";
  return crypto
    .createHash("sha256")
    .update(String(plaintext), "utf8")
    .digest("hex");
}

/**
 * Heuristic: true if value looks like our encrypted format (iv:tag:hex).
 * Used for backward compatibility when reading provider_connections.api_key.
 */
const ENCRYPTED_PATTERN = /^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/i;

export function looksEncrypted(value) {
  if (value == null || typeof value !== "string") return false;
  return ENCRYPTED_PATTERN.test(value.trim());
}

/**
 * Decrypt provider_connections.api_key with backward compatibility:
 * if value looks like plain text (not our cipher format), return as-is.
 * @param {string|null} stored
 * @returns {string|null}
 */
export function decryptProviderApiKey(stored) {
  if (stored == null || stored === "") return stored;
  if (!looksEncrypted(stored)) return stored;
  return decrypt(stored) ?? stored;
}
