/**
 * Unit tests for open-sse/services/ipFilter.js
 *
 * Tests cover:
 *   - initIpFilter / invalidateIpFilterCache
 *   - checkIpFilter — no rules, block rules, allow rules, priority
 *   - IPv4 CIDR matching
 *   - IPv6 CIDR matching
 *   - IP normalisation (port stripping, IPv4-mapped IPv6)
 *   - Cache TTL behaviour
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initIpFilter,
  invalidateIpFilterCache,
  checkIpFilter,
} from "../../open-sse/services/ipFilter.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGetRules(rules) {
  return vi.fn().mockResolvedValue(rules);
}

function setup(rules) {
  const getRules = makeGetRules(rules);
  initIpFilter({ getRules });
  invalidateIpFilterCache(null); // clear cache
  return getRules;
}

// ─── No rules ────────────────────────────────────────────────────────────────

describe("checkIpFilter — no rules", () => {
  it("allows all IPs when no rules exist", async () => {
    setup([]);
    const result = await checkIpFilter("1.2.3.4", null);
    expect(result.blocked).toBe(false);
  });

  it("allows when no getRules function is injected", async () => {
    initIpFilter({ getRules: null });
    const result = await checkIpFilter("1.2.3.4", null);
    expect(result.blocked).toBe(false);
  });
});

// ─── Block rules ─────────────────────────────────────────────────────────────

describe("checkIpFilter — block rules", () => {
  beforeEach(() => invalidateIpFilterCache(null));

  it("blocks IP that matches a /32 block rule", async () => {
    setup([{ mode: "block", cidr: "10.0.0.1/32" }]);
    const result = await checkIpFilter("10.0.0.1", null);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/10\.0\.0\.1\/32/);
  });

  it("does not block IP outside the block CIDR", async () => {
    setup([{ mode: "block", cidr: "10.0.0.0/24" }]);
    const result = await checkIpFilter("10.0.1.1", null);
    expect(result.blocked).toBe(false);
  });

  it("blocks any IP in /24 range", async () => {
    setup([{ mode: "block", cidr: "192.168.1.0/24" }]);
    for (const ip of ["192.168.1.0", "192.168.1.100", "192.168.1.255"]) {
      const result = await checkIpFilter(ip, null);
      expect(result.blocked).toBe(true);
    }
  });

  it("blocks any IP with /0 (block all)", async () => {
    setup([{ mode: "block", cidr: "0.0.0.0/0" }]);
    const result = await checkIpFilter("8.8.8.8", null);
    expect(result.blocked).toBe(true);
  });
});

// ─── Allow rules ─────────────────────────────────────────────────────────────

describe("checkIpFilter — allow rules", () => {
  beforeEach(() => invalidateIpFilterCache(null));

  it("allows IP that matches the allow CIDR", async () => {
    setup([{ mode: "allow", cidr: "10.0.0.0/8" }]);
    const result = await checkIpFilter("10.1.2.3", null);
    expect(result.blocked).toBe(false);
  });

  it("blocks IP NOT in allowlist when allowlist exists", async () => {
    setup([{ mode: "allow", cidr: "10.0.0.0/8" }]);
    const result = await checkIpFilter("192.168.1.1", null);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/not in allowlist/i);
  });

  it("no block if IP is in at least one allow rule", async () => {
    setup([
      { mode: "allow", cidr: "10.0.0.0/8" },
      { mode: "allow", cidr: "172.16.0.0/12" },
    ]);
    const result = await checkIpFilter("172.20.5.5", null);
    expect(result.blocked).toBe(false);
  });
});

// ─── Block takes priority over allow ─────────────────────────────────────────

describe("checkIpFilter — block takes priority over allow", () => {
  beforeEach(() => invalidateIpFilterCache(null));

  it("block rule wins over allow rule for same IP", async () => {
    setup([
      { mode: "allow", cidr: "10.0.0.0/8" },
      { mode: "block", cidr: "10.0.0.1/32" },
    ]);
    const result = await checkIpFilter("10.0.0.1", null);
    expect(result.blocked).toBe(true);
  });

  it("other IPs in the allow range are still allowed", async () => {
    setup([
      { mode: "allow", cidr: "10.0.0.0/8" },
      { mode: "block", cidr: "10.0.0.1/32" },
    ]);
    const result = await checkIpFilter("10.0.0.2", null);
    expect(result.blocked).toBe(false);
  });
});

// ─── IP Normalisation ────────────────────────────────────────────────────────

describe("checkIpFilter — IP normalisation", () => {
  beforeEach(() => invalidateIpFilterCache(null));

  it("strips port from IPv4:port format", async () => {
    setup([{ mode: "block", cidr: "1.2.3.4/32" }]);
    const result = await checkIpFilter("1.2.3.4:5678", null);
    expect(result.blocked).toBe(true);
  });

  it("handles IPv4-mapped IPv6 (::ffff:1.2.3.4)", async () => {
    setup([{ mode: "block", cidr: "1.2.3.4/32" }]);
    const result = await checkIpFilter("::ffff:1.2.3.4", null);
    expect(result.blocked).toBe(true);
  });

  it("strips brackets from [::1]:port IPv6", async () => {
    setup([{ mode: "block", cidr: "::1/128" }]);
    const result = await checkIpFilter("[::1]:1234", null);
    expect(result.blocked).toBe(true);
  });
});

// ─── IPv6 ────────────────────────────────────────────────────────────────────

describe("checkIpFilter — IPv6", () => {
  beforeEach(() => invalidateIpFilterCache(null));

  it("blocks exact IPv6 address with /128", async () => {
    setup([{ mode: "block", cidr: "::1/128" }]);
    const result = await checkIpFilter("::1", null);
    expect(result.blocked).toBe(true);
  });

  it("does not block a different IPv6 address", async () => {
    setup([{ mode: "block", cidr: "::1/128" }]);
    const result = await checkIpFilter("::2", null);
    expect(result.blocked).toBe(false);
  });

  it("blocks range with /64 prefix", async () => {
    setup([{ mode: "block", cidr: "2001:db8::/64" }]);
    const result = await checkIpFilter("2001:db8::1", null);
    expect(result.blocked).toBe(true);
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe("checkIpFilter — cache", () => {
  it("calls getRules only once per cache TTL window", async () => {
    const getRules = makeGetRules([{ mode: "block", cidr: "1.1.1.1/32" }]);
    initIpFilter({ getRules });
    invalidateIpFilterCache(null);

    await checkIpFilter("1.1.1.1", null);
    await checkIpFilter("2.2.2.2", null);
    await checkIpFilter("3.3.3.3", null);

    expect(getRules).toHaveBeenCalledOnce();
  });

  it("invalidateIpFilterCache(userId) clears only that user's cache", async () => {
    const getRules = makeGetRules([]);
    initIpFilter({ getRules });
    invalidateIpFilterCache(null);

    await checkIpFilter("1.1.1.1", "user-1");
    await checkIpFilter("1.1.1.1", "user-2");
    // Both loaded once each
    expect(getRules).toHaveBeenCalledTimes(2);

    invalidateIpFilterCache("user-1");
    await checkIpFilter("1.1.1.1", "user-1"); // should re-fetch
    expect(getRules).toHaveBeenCalledTimes(3);

    await checkIpFilter("1.1.1.1", "user-2"); // still cached
    expect(getRules).toHaveBeenCalledTimes(3);
  });

  it("invalidateIpFilterCache(null) clears all", async () => {
    const getRules = makeGetRules([]);
    initIpFilter({ getRules });
    invalidateIpFilterCache(null);

    await checkIpFilter("1.1.1.1", "user-a");
    expect(getRules).toHaveBeenCalledTimes(1);
    invalidateIpFilterCache(null);
    await checkIpFilter("1.1.1.1", "user-a");
    expect(getRules).toHaveBeenCalledTimes(2);
  });
});
