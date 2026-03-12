/**
 * Wildcard Routes API
 *
 * GET    /api/wildcard-routes   — list routes
 * POST   /api/wildcard-routes   — create route
 */

import { NextResponse } from "next/server";
import { getWildcardRoutes, createWildcardRoute } from "@/lib/localDb";
import { invalidateWildcardCache } from "open-sse/services/wildcardRouting.js";
import { requireAdmin } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const routes = await getWildcardRoutes(null);
    return NextResponse.json({ routes });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to fetch wildcard routes" }, { status });
  }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    const { pattern, target, priority = 100 } = await request.json();

    if (!pattern || !target) {
      return NextResponse.json({ error: "pattern and target are required" }, { status: 400 });
    }

    const route = await createWildcardRoute({ userId: null, pattern, target, priority });
    invalidateWildcardCache(null);
    return NextResponse.json(route, { status: 201 });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to create wildcard route" }, { status });
  }
}
