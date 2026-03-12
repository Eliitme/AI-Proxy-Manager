/**
 * IP Filter Rules API
 *
 * GET  /api/ip-filter-rules  — list rules
 * POST /api/ip-filter-rules  — create rule
 */

import { NextResponse } from "next/server";
import { getIpFilterRules, createIpFilterRule } from "@/lib/localDb";
import { invalidateIpFilterCache } from "open-sse/services/ipFilter.js";
import { requireAdmin } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const rules = await getIpFilterRules(null);
    return NextResponse.json({ rules });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to fetch IP filter rules" }, { status });
  }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    const { mode, cidr } = await request.json();

    if (!mode || !cidr) {
      return NextResponse.json({ error: "mode and cidr are required" }, { status: 400 });
    }
    if (mode !== "allow" && mode !== "block") {
      return NextResponse.json({ error: "mode must be 'allow' or 'block'" }, { status: 400 });
    }

    const rule = await createIpFilterRule({ userId: null, mode, cidr });
    invalidateIpFilterCache(null);
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to create IP filter rule" }, { status });
  }
}
