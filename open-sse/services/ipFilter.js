/**
 * IP Filter — per-user allowlist/blocklist with CIDR support.
 *
 * Rules are loaded from the `ip_filter_rules` table and cached in-memory (5s TTL).
 * Uses Node.js built-in `net` module for CIDR matching — no extra dependencies.
 *
 * Evaluation logic:
 *   1. If any 'block' rule matches → block (highest priority)
 *   2. If any 'allow' rule exists AND none match → block
 *   3. Otherwise → allow
 */

import { isIPv4, isIPv6 } from "net";

/** @type {Map<string, { rules: Array, ts: number }>} */
const _cache = new Map();
const CACHE_TTL_MS = 5000;

/** Injected DB function */
let _getRules = null;

/**
 * @param {{ getRules: Function }} fns
 */
export function initIpFilter({ getRules }) {
  _getRules = getRules;
}

/**
 * Invalidate cache for a user (call after rule create/delete).
 * @param {string|null} userId
 */
export function invalidateIpFilterCache(userId) {
  if (userId) {
    _cache.delete(userId);
  } else {
    _cache.clear();
  }
}

/**
 * Check if a request IP should be blocked.
 *
 * @param {string} ip         — raw IP string (may include port, IPv4-mapped IPv6, etc.)
 * @param {string|null} userId
 * @returns {Promise<{ blocked: boolean, reason: string }>}
 */
export async function checkIpFilter(ip, userId = null) {
  if (!_getRules) return { blocked: false, reason: "" };

  const normalised = _normaliseIp(ip);
  const rules = await _loadRules(userId);
  if (!rules.length) return { blocked: false, reason: "" };

  const blockRules = rules.filter(r => r.mode === "block");
  const allowRules = rules.filter(r => r.mode === "allow");

  // Block rules take priority
  for (const rule of blockRules) {
    if (_cidrMatch(normalised, rule.cidr)) {
      return { blocked: true, reason: `IP blocked by rule: ${rule.cidr}` };
    }
  }

  // Allowlist: if any allow rules exist and none match → block
  if (allowRules.length > 0) {
    const allowed = allowRules.some(rule => _cidrMatch(normalised, rule.cidr));
    if (!allowed) {
      return { blocked: true, reason: "IP not in allowlist" };
    }
  }

  return { blocked: false, reason: "" };
}

async function _loadRules(userId) {
  const key = userId || "__global__";
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.rules;
  }
  const rules = await _getRules(userId);
  _cache.set(key, { rules, ts: Date.now() });
  return rules;
}

/**
 * Normalise an IP string: strip port, handle IPv4-mapped IPv6.
 */
function _normaliseIp(ip) {
  if (!ip) return "";
  // Strip port from IPv4:port
  const v4port = ip.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  if (v4port) return v4port[1];
  // Strip brackets from [::1]:port
  const v6bracket = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (v6bracket) return v6bracket[1];
  // Strip IPv4-mapped IPv6 prefix
  if (ip.startsWith("::ffff:") && ip.includes(".")) return ip.slice(7);
  return ip;
}

/**
 * CIDR match using Node.js built-in net module arithmetic.
 * @param {string} ip
 * @param {string} cidr  e.g. "192.168.1.0/24" or "::1/128"
 */
function _cidrMatch(ip, cidr) {
  try {
    const [cidrIp, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);

    if (isIPv4(ip) && isIPv4(cidrIp)) {
      return _ipv4CidrMatch(ip, cidrIp, prefix);
    } else if (isIPv6(ip) && isIPv6(cidrIp)) {
      return _ipv6CidrMatch(ip, cidrIp, prefix);
    }
    return false;
  } catch {
    return false;
  }
}

function _ipv4CidrMatch(ip, network, prefix) {
  const ipNum = _ipv4ToNum(ip);
  const netNum = _ipv4ToNum(network);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (netNum & mask);
}

function _ipv4ToNum(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function _ipv6CidrMatch(ip, network, prefix) {
  const ipBits = _ipv6ToBits(ip);
  const netBits = _ipv6ToBits(network);
  if (!ipBits || !netBits) return false;
  return ipBits.slice(0, prefix) === netBits.slice(0, prefix);
}

function _ipv6ToBits(ip) {
  try {
    // Expand :: notation
    const parts = _expandIPv6(ip).split(":").map(p => parseInt(p, 16));
    return parts.map(p => p.toString(2).padStart(16, "0")).join("");
  } catch {
    return null;
  }
}

function _expandIPv6(ip) {
  if (!ip.includes("::")) return ip;
  const [left, right] = ip.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = 8 - leftParts.length - rightParts.length;
  const middle = Array(missing).fill("0000");
  return [...leftParts, ...middle, ...rightParts].join(":");
}
