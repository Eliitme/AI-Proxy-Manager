/**
 * DELETE /api/model-deprecation/[id] — delete a model deprecation override
 */

import { NextResponse } from "next/server";
import { deleteModelDeprecationOverride } from "@/lib/localDb";
import { invalidateModelDeprecationCache } from "open-sse/services/modelDeprecation.js";
import { requireAdmin } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const deleted = await deleteModelDeprecationOverride(id, null);
    if (!deleted) {
      return NextResponse.json({ error: "Override not found" }, { status: 404 });
    }
    invalidateModelDeprecationCache(null);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to delete model deprecation override" }, { status });
  }
}
