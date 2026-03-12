/**
 * DELETE /api/wildcard-routes/[id] — delete a wildcard route
 */

import { NextResponse } from "next/server";
import { deleteWildcardRoute } from "@/lib/localDb";
import { invalidateWildcardCache } from "open-sse/services/wildcardRouting.js";
import { requireAdmin } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    const deleted = await deleteWildcardRoute(id, null);
    if (!deleted) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }
    invalidateWildcardCache(null);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const status = error.message?.includes("Admin") || error.message?.includes("Auth") ? 403 : 500;
    return NextResponse.json({ error: error.message || "Failed to delete wildcard route" }, { status });
  }
}
