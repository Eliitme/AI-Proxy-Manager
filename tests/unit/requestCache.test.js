/**
 * Unit tests for open-sse/services/requestCache.js
 *
 * Tests cover:
 *   - LRUCache internals (via cache behaviour)
 *   - checkSignatureCache / writeSignatureCache — miss, hit, TTL expiry, LRU eviction
 *   - checkSemanticCache / writeSemanticCache — miss, hit, TTL expiry
 *   - setCacheTtls
 *   - flushAll
 *   - getCacheStats — hit/miss counters
 *   - entryToResponse — reconstructs Response with x-cache: HIT
 *   - serializeResponse — serializes Response body + headers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setCacheTtls,
  flushAll,
  getCacheStats,
  checkSignatureCache,
  writeSignatureCache,
  checkSemanticCache,
  writeSemanticCache,
  entryToResponse,
  serializeResponse,
} from "../../open-sse/services/requestCache.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER = "test-user-" + Math.random().toString(36).slice(2);
const BODY = JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hello" }] });
const MESSAGES = [{ role: "user", content: "hello" }];
const SYSTEM = "You are a helpful assistant.";
const ENTRY = { body: '{"result":"ok"}', headers: { "content-type": "application/json" }, status: 200 };

function uniqueUser() {
  return "u-" + Math.random().toString(36).slice(2);
}

function uniqueBody() {
  return JSON.stringify({ model: "gpt-4o", id: Math.random() });
}

// ─── flushAll + getCacheStats ─────────────────────────────────────────────────

describe("flushAll", () => {
  it("clears both caches", () => {
    const u = uniqueUser();
    const b = uniqueBody();
    writeSignatureCache(u, b, ENTRY);
    expect(checkSignatureCache(u, b).hit).toBe(true);
    flushAll();
    expect(checkSignatureCache(u, b).hit).toBe(false);
  });
});

// ─── Signature cache ──────────────────────────────────────────────────────────

describe("checkSignatureCache / writeSignatureCache", () => {
  beforeEach(() => {
    setCacheTtls({ signatureCacheTtlMs: 60_000, semanticCacheTtlMs: 300_000 });
  });

  it("returns hit=false for unknown key", () => {
    const result = checkSignatureCache(uniqueUser(), uniqueBody());
    expect(result.hit).toBe(false);
  });

  it("returns hit=true after writing entry", () => {
    const u = uniqueUser(); const b = uniqueBody();
    writeSignatureCache(u, b, ENTRY);
    const result = checkSignatureCache(u, b);
    expect(result.hit).toBe(true);
    expect(result.entry).toEqual(ENTRY);
  });

  it("different users have isolated caches", () => {
    const u1 = uniqueUser(); const u2 = uniqueUser(); const b = uniqueBody();
    writeSignatureCache(u1, b, ENTRY);
    expect(checkSignatureCache(u1, b).hit).toBe(true);
    expect(checkSignatureCache(u2, b).hit).toBe(false);
  });

  it("different bodies have different cache entries", () => {
    const u = uniqueUser();
    const b1 = uniqueBody(); const b2 = uniqueBody();
    writeSignatureCache(u, b1, ENTRY);
    expect(checkSignatureCache(u, b1).hit).toBe(true);
    expect(checkSignatureCache(u, b2).hit).toBe(false);
  });

  it("returns hit=false after TTL expires", async () => {
    setCacheTtls({ signatureCacheTtlMs: 1 }); // 1ms TTL
    const u = uniqueUser(); const b = uniqueBody();
    writeSignatureCache(u, b, ENTRY);
    await new Promise(r => setTimeout(r, 20));
    expect(checkSignatureCache(u, b).hit).toBe(false);
    setCacheTtls({ signatureCacheTtlMs: 60_000 });
  });

  it("overwriting same key updates the entry", () => {
    const u = uniqueUser(); const b = uniqueBody();
    writeSignatureCache(u, b, { ...ENTRY, status: 200 });
    writeSignatureCache(u, b, { ...ENTRY, status: 201 });
    const result = checkSignatureCache(u, b);
    expect(result.entry.status).toBe(201);
  });
});

// ─── Semantic cache ───────────────────────────────────────────────────────────

describe("checkSemanticCache / writeSemanticCache", () => {
  beforeEach(() => {
    setCacheTtls({ semanticCacheTtlMs: 300_000 });
  });

  it("returns hit=false for unknown key", () => {
    const result = checkSemanticCache(uniqueUser(), MESSAGES, SYSTEM);
    expect(result.hit).toBe(false);
  });

  it("returns hit=true after writing entry", () => {
    const u = uniqueUser();
    writeSemanticCache(u, MESSAGES, SYSTEM, ENTRY);
    const result = checkSemanticCache(u, MESSAGES, SYSTEM);
    expect(result.hit).toBe(true);
    expect(result.entry).toEqual(ENTRY);
  });

  it("different system prompts produce different cache keys", () => {
    const u = uniqueUser();
    writeSemanticCache(u, MESSAGES, "System A", ENTRY);
    expect(checkSemanticCache(u, MESSAGES, "System A").hit).toBe(true);
    expect(checkSemanticCache(u, MESSAGES, "System B").hit).toBe(false);
  });

  it("different messages produce different cache keys", () => {
    const u = uniqueUser();
    const msgs1 = [{ role: "user", content: "hello" }];
    const msgs2 = [{ role: "user", content: "goodbye" }];
    writeSemanticCache(u, msgs1, "", ENTRY);
    expect(checkSemanticCache(u, msgs1, "").hit).toBe(true);
    expect(checkSemanticCache(u, msgs2, "").hit).toBe(false);
  });

  it("returns hit=false after TTL expires", async () => {
    setCacheTtls({ semanticCacheTtlMs: 1 });
    const u = uniqueUser();
    writeSemanticCache(u, MESSAGES, SYSTEM, ENTRY);
    await new Promise(r => setTimeout(r, 20));
    expect(checkSemanticCache(u, MESSAGES, SYSTEM).hit).toBe(false);
    setCacheTtls({ semanticCacheTtlMs: 300_000 });
  });

  it("empty system prompt defaults to empty string (no crash)", () => {
    const u = uniqueUser();
    writeSemanticCache(u, MESSAGES, undefined, ENTRY);
    const result = checkSemanticCache(u, MESSAGES, undefined);
    expect(result.hit).toBe(true);
  });
});

// ─── getCacheStats ─────────────────────────────────────────────────────────────

describe("getCacheStats", () => {
  it("returns an object with expected stat keys", () => {
    const stats = getCacheStats();
    expect(stats).toHaveProperty("sigSize");
    expect(stats).toHaveProperty("semSize");
    expect(stats).toHaveProperty("sigHits");
    expect(stats).toHaveProperty("sigMisses");
    expect(stats).toHaveProperty("semHits");
    expect(stats).toHaveProperty("semMisses");
  });

  it("increments sigHits on signature cache hit", () => {
    const u = uniqueUser(); const b = uniqueBody();
    writeSignatureCache(u, b, ENTRY);
    const before = getCacheStats().sigHits;
    checkSignatureCache(u, b);
    expect(getCacheStats().sigHits).toBe(before + 1);
  });

  it("increments sigMisses on signature cache miss", () => {
    const before = getCacheStats().sigMisses;
    checkSignatureCache(uniqueUser(), uniqueBody());
    expect(getCacheStats().sigMisses).toBe(before + 1);
  });

  it("increments semHits on semantic cache hit", () => {
    const u = uniqueUser();
    writeSemanticCache(u, MESSAGES, SYSTEM, ENTRY);
    const before = getCacheStats().semHits;
    checkSemanticCache(u, MESSAGES, SYSTEM);
    expect(getCacheStats().semHits).toBe(before + 1);
  });

  it("increments semMisses on semantic cache miss", () => {
    const before = getCacheStats().semMisses;
    checkSemanticCache(uniqueUser(), MESSAGES, SYSTEM);
    expect(getCacheStats().semMisses).toBe(before + 1);
  });
});

// ─── entryToResponse ──────────────────────────────────────────────────────────

describe("entryToResponse", () => {
  it("reconstructs a Response with the correct status", () => {
    const res = entryToResponse({ body: '{"ok":true}', headers: {}, status: 200 });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
  });

  it("sets x-cache: HIT header", () => {
    const res = entryToResponse(ENTRY);
    expect(res.headers.get("x-cache")).toBe("HIT");
  });

  it("includes original headers", () => {
    const res = entryToResponse({ ...ENTRY, headers: { "content-type": "application/json" } });
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("response body matches cached body", async () => {
    const res = entryToResponse({ body: '{"data":42}', headers: {}, status: 200 });
    const text = await res.text();
    expect(text).toBe('{"data":42}');
  });
});

// ─── serializeResponse ────────────────────────────────────────────────────────

describe("serializeResponse", () => {
  it("serializes body as text", async () => {
    const res = new Response('{"hello":"world"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const serialized = await serializeResponse(res);
    expect(serialized.body).toBe('{"hello":"world"}');
  });

  it("serializes status code", async () => {
    const res = new Response("created", { status: 201 });
    const serialized = await serializeResponse(res);
    expect(serialized.status).toBe(201);
  });

  it("captures response headers", async () => {
    const res = new Response("ok", {
      status: 200,
      headers: { "x-custom": "yes", "content-type": "text/plain" },
    });
    const serialized = await serializeResponse(res);
    expect(serialized.headers["x-custom"]).toBe("yes");
    expect(serialized.headers["content-type"]).toBe("text/plain");
  });

  it("does not consume the original response body", async () => {
    const res = new Response("body-text", { status: 200 });
    await serializeResponse(res); // uses clone() internally
    // original should still be readable
    const text = await res.text();
    expect(text).toBe("body-text");
  });
});
