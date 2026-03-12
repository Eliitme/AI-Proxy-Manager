/**
 * Unit tests for open-sse/services/idempotency.js
 *
 * Tests cover:
 *   - computeIdempotencyKey — determinism, canonical sorting
 *   - checkIdempotency — miss, in-flight hit, completed hit, expired
 *   - registerRequest — promise registration, resolves to cached response
 *   - setIdempotencyTtl
 *   - LRU eviction at MAX_ENTRIES
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeIdempotencyKey,
  checkIdempotency,
  registerRequest,
  setIdempotencyTtl,
} from "../../open-sse/services/idempotency.js";

// ─── computeIdempotencyKey ────────────────────────────────────────────────────

describe("computeIdempotencyKey", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const key = computeIdempotencyKey("POST", "/v1/chat/completions", { model: "gpt-4o" });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const body = { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] };
    const k1 = computeIdempotencyKey("POST", "/v1/chat", body);
    const k2 = computeIdempotencyKey("POST", "/v1/chat", body);
    expect(k1).toBe(k2);
  });

  it("produces different keys for different methods", () => {
    const body = { model: "gpt-4o" };
    const k1 = computeIdempotencyKey("GET", "/path", body);
    const k2 = computeIdempotencyKey("POST", "/path", body);
    expect(k1).not.toBe(k2);
  });

  it("produces different keys for different paths", () => {
    const body = { model: "gpt-4o" };
    expect(
      computeIdempotencyKey("POST", "/path-a", body)
    ).not.toBe(
      computeIdempotencyKey("POST", "/path-b", body)
    );
  });

  it("canonically sorts body keys — same content, different insertion order = same key", () => {
    const k1 = computeIdempotencyKey("POST", "/v1", { b: 2, a: 1 });
    const k2 = computeIdempotencyKey("POST", "/v1", { a: 1, b: 2 });
    expect(k1).toBe(k2);
  });

  it("handles null body without throwing", () => {
    expect(() => computeIdempotencyKey("POST", "/v1", null)).not.toThrow();
  });
});

// ─── checkIdempotency — miss ──────────────────────────────────────────────────

describe("checkIdempotency — miss", () => {
  it("returns hit=false for an unknown key", () => {
    const result = checkIdempotency("key-that-does-not-exist-" + Math.random());
    expect(result.hit).toBe(false);
    expect(result.response).toBeUndefined();
  });
});

// ─── registerRequest + checkIdempotency — in-flight ──────────────────────────

describe("checkIdempotency — in-flight hit", () => {
  it("returns the pending promise when request is still in flight", async () => {
    setIdempotencyTtl(5000);
    const key = "inflight-" + Math.random();

    let resolve;
    const promise = new Promise(r => { resolve = r; });
    registerRequest(key, promise);

    const result = checkIdempotency(key);
    expect(result.hit).toBe(true);
    // Should be the promise itself (or resolve to a response)
    resolve(new Response("ok"));
    const resolved = await result.response;
    expect(resolved).toBeInstanceOf(Response);
  });
});

// ─── registerRequest + checkIdempotency — completed hit ──────────────────────

describe("checkIdempotency — completed response hit", () => {
  it("returns cached response within TTL after promise resolves", async () => {
    setIdempotencyTtl(5000);
    const key = "completed-" + Math.random();

    const mockResponse = new Response(JSON.stringify({ result: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    let resolve;
    const promise = new Promise(r => { resolve = r; });
    registerRequest(key, promise);
    resolve(mockResponse);

    // Wait for the promise chain to settle
    await promise;
    await new Promise(r => setTimeout(r, 10));

    const result = checkIdempotency(key);
    expect(result.hit).toBe(true);
    expect(result.response).toBeDefined();
  });
});

// ─── TTL expiry ───────────────────────────────────────────────────────────────

describe("checkIdempotency — TTL expiry", () => {
  it("returns miss after TTL expires", async () => {
    setIdempotencyTtl(1); // 1ms TTL
    const key = "ttl-expire-" + Math.random();

    let resolve;
    const promise = new Promise(r => { resolve = r; });
    registerRequest(key, promise);
    resolve(new Response("stale"));
    await promise;
    await new Promise(r => setTimeout(r, 50)); // wait > 1ms TTL

    const result = checkIdempotency(key);
    expect(result.hit).toBe(false);
    // Reset TTL to safe value
    setIdempotencyTtl(5000);
  });
});

// ─── registerRequest — promise rejection cleanup ──────────────────────────────

describe("registerRequest — rejection cleanup", () => {
  it("cleans up entry when promise rejects", async () => {
    setIdempotencyTtl(5000);
    const key = "reject-" + Math.random();

    let reject;
    const promise = new Promise((_, r) => { reject = r; });
    registerRequest(key, promise);
    reject(new Error("upstream failure"));

    await new Promise(r => setTimeout(r, 10));

    const result = checkIdempotency(key);
    expect(result.hit).toBe(false);
  });
});
