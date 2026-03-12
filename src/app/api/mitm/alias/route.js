/**
 * GET /api/mitm/alias
 *
 * Internal endpoint consumed by the MITM subprocess (src/mitm/server.js).
 * Returns the full mitmAlias map: { [tool]: { [originalModel]: mappedModel } }
 *
 * Access policy:
 *  - Requests with `x-request-source: local` are treated as trusted internal
 *    calls from the MITM process running on the same host.
 *  - No JWT / session cookie is required for local requests.
 *  - All other callers receive a 403.
 */
import { NextResponse } from "next/server";
import { getMitmAlias } from "@/models";

export async function GET(request) {
  const source = request.headers.get("x-request-source");
  if (source !== "local") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tool = request.nextUrl.searchParams.get("tool") || undefined;
    const aliases = await getMitmAlias(tool);
    return NextResponse.json({ aliases });
  } catch (error) {
    console.error("GET /api/mitm/alias error:", error.message);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}
