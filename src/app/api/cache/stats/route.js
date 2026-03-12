/**
 * GET /api/cache/stats — Return request cache hit/miss statistics.
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/helpers";
import { getCacheStats } from "open-sse/services/requestCache.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const stats = getCacheStats();
    return NextResponse.json(stats);
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to fetch cache stats" }, { status });
  }
}
