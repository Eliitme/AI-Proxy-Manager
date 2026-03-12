/**
 * Model Deprecation Overrides API
 *
 * GET  /api/model-deprecation  — list overrides
 * POST /api/model-deprecation  — create override
 */

import { NextResponse } from "next/server";
import { getModelDeprecationOverrides, createModelDeprecationOverride } from "@/lib/localDb";
import { invalidateModelDeprecationCache } from "open-sse/services/modelDeprecation.js";
import { requireAdmin } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const overrides = await getModelDeprecationOverrides(null);
    return NextResponse.json({ overrides });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to fetch model deprecation overrides" }, { status });
  }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    const { fromModel, toModel } = await request.json();

    if (!fromModel || !toModel) {
      return NextResponse.json({ error: "fromModel and toModel are required" }, { status: 400 });
    }

    const override = await createModelDeprecationOverride({ userId: null, fromModel, toModel });
    invalidateModelDeprecationCache(null);
    return NextResponse.json(override, { status: 201 });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to create model deprecation override" }, { status });
  }
}
