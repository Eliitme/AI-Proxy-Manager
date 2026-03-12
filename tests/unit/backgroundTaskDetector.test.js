/**
 * Unit tests for open-sse/services/backgroundTaskDetector.js
 *
 * Tests cover all four detection heuristics:
 *   1. x-background-task: true header
 *   2. User-Agent CI/bot pattern matching
 *   3. Long non-streaming first message (> 2000 chars)
 *   4. body.metadata.task_type === 'background'
 */

import { describe, it, expect } from "vitest";
import { isBackgroundTask } from "../../open-sse/services/backgroundTaskDetector.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(headers = {}) {
  return {
    headers: {
      get: (key) => headers[key.toLowerCase()] ?? null,
    },
  };
}

function makeBody(overrides = {}) {
  return {
    model: "gpt-4o",
    messages: [{ role: "user", content: "hello" }],
    stream: false,
    ...overrides,
  };
}

// ─── Heuristic 1: x-background-task header ────────────────────────────────────

describe("isBackgroundTask — x-background-task header", () => {
  it("returns true when header is 'true'", () => {
    const req = makeRequest({ "x-background-task": "true" });
    expect(isBackgroundTask(req, makeBody())).toBe(true);
  });

  it("returns false when header is 'false'", () => {
    const req = makeRequest({ "x-background-task": "false" });
    expect(isBackgroundTask(req, makeBody())).toBe(false);
  });

  it("returns false when header is absent", () => {
    const req = makeRequest({});
    expect(isBackgroundTask(req, makeBody())).toBe(false);
  });

  it("returns false when header is '1' (not literally 'true')", () => {
    const req = makeRequest({ "x-background-task": "1" });
    expect(isBackgroundTask(req, makeBody())).toBe(false);
  });
});

// ─── Heuristic 2: User-Agent patterns ────────────────────────────────────────

describe("isBackgroundTask — User-Agent patterns", () => {
  const bgAgents = [
    ["GitHub-Actions", "GitHub-Actions/2.0"],
    ["CI keyword", "My-CI/1.0"],
    ["headless", "headless-browser/1.0"],
    ["bot (whole word)", "bot/1.0"],
    ["script (whole word)", "custom-script/1.0"],
  ];

  for (const [name, ua] of bgAgents) {
    it(`detects background for UA: ${name}`, () => {
      const req = makeRequest({ "user-agent": ua });
      expect(isBackgroundTask(req, makeBody())).toBe(true);
    });
  }

  it("returns false for normal browser UA", () => {
    const req = makeRequest({ "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120" });
    expect(isBackgroundTask(req, makeBody())).toBe(false);
  });

  it("returns false for curl (not a CI bot)", () => {
    const req = makeRequest({ "user-agent": "curl/7.88.1" });
    expect(isBackgroundTask(req, makeBody())).toBe(false);
  });

  it("returns false for missing UA", () => {
    const req = makeRequest({});
    expect(isBackgroundTask(req, makeBody())).toBe(false);
  });

  it("returns false for null request", () => {
    expect(isBackgroundTask(null, makeBody())).toBe(false);
  });
});

// ─── Heuristic 3: Long non-streaming message ──────────────────────────────────

describe("isBackgroundTask — long non-streaming message", () => {
  const LONG = "x".repeat(2001);
  const SHORT = "x".repeat(100);

  it("returns true for first user message > 2000 chars (non-streaming)", () => {
    const req = makeRequest({});
    const body = makeBody({
      stream: false,
      messages: [{ role: "user", content: LONG }],
    });
    expect(isBackgroundTask(req, body)).toBe(true);
  });

  it("returns false for message exactly 2000 chars", () => {
    const req = makeRequest({});
    const body = makeBody({
      stream: false,
      messages: [{ role: "user", content: "x".repeat(2000) }],
    });
    expect(isBackgroundTask(req, body)).toBe(false);
  });

  it("returns false for long message when stream=true", () => {
    const req = makeRequest({});
    const body = makeBody({
      stream: true,
      messages: [{ role: "user", content: LONG }],
    });
    expect(isBackgroundTask(req, body)).toBe(false);
  });

  it("returns false for short message", () => {
    const req = makeRequest({});
    const body = makeBody({
      stream: false,
      messages: [{ role: "user", content: SHORT }],
    });
    expect(isBackgroundTask(req, body)).toBe(false);
  });

  it("measures length for array content parts", () => {
    const req = makeRequest({});
    const body = makeBody({
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "x".repeat(1500) },
            { type: "text", text: "y".repeat(600) },
          ],
        },
      ],
    });
    expect(isBackgroundTask(req, body)).toBe(true);
  });

  it("skips system messages — only checks first user message", () => {
    const req = makeRequest({});
    const body = makeBody({
      stream: false,
      messages: [
        { role: "system", content: LONG }, // ignored
        { role: "user", content: SHORT },   // short
      ],
    });
    expect(isBackgroundTask(req, body)).toBe(false);
  });

  it("returns false when messages is empty", () => {
    const req = makeRequest({});
    const body = makeBody({ stream: false, messages: [] });
    expect(isBackgroundTask(req, body)).toBe(false);
  });
});

// ─── Heuristic 4: metadata.task_type ────────────────────────────────────────

describe("isBackgroundTask — metadata.task_type", () => {
  it("returns true when metadata.task_type === 'background'", () => {
    const req = makeRequest({});
    const body = makeBody({ metadata: { task_type: "background" } });
    expect(isBackgroundTask(req, body)).toBe(true);
  });

  it("returns false for other task_type values", () => {
    const req = makeRequest({});
    const body = makeBody({ metadata: { task_type: "interactive" } });
    expect(isBackgroundTask(req, body)).toBe(false);
  });

  it("returns false when metadata is absent", () => {
    const req = makeRequest({});
    const body = makeBody();
    delete body.metadata;
    expect(isBackgroundTask(req, body)).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("isBackgroundTask — edge cases", () => {
  it("returns false for null body", () => {
    const req = makeRequest({});
    expect(isBackgroundTask(req, null)).toBe(false);
  });

  it("returns false for empty body", () => {
    const req = makeRequest({});
    expect(isBackgroundTask(req, {})).toBe(false);
  });

  it("multiple heuristics match — still returns true (no double-count)", () => {
    const req = makeRequest({
      "x-background-task": "true",
      "user-agent": "GitHub-Actions",
    });
    const body = makeBody({ metadata: { task_type: "background" } });
    expect(isBackgroundTask(req, body)).toBe(true);
  });
});
