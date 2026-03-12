/**
 * DELETE /api/ip-filter-rules/[id] — delete an IP filter rule
 */

import { NextResponse } from "next/server";
import { deleteIpFilterRule } from "@/lib/localDb";
import { invalidateIpFilterCache } from "open-sse/services/ipFilter.js";
import { requireAdmin } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const deleted = await deleteIpFilterRule(id, null);
    if (!deleted) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    invalidateIpFilterCache(null);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to delete IP filter rule" }, { status });
  }
}
