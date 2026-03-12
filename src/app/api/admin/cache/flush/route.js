/**
 * POST /api/admin/cache/flush — Flush all in-memory request caches.
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/helpers";
import { flushAll, getCacheStats } from "open-sse/services/requestCache.js";

export async function POST(request) {
  try {
    await requireAdmin(request);
    flushAll();
    const stats = getCacheStats();
    return NextResponse.json({ flushed: true, stats });
  } catch (error) {
    if (error.status === 401 || error.message?.includes("Unauthorized") || error.message?.includes("Admin")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
