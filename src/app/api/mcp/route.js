/**
 * MCP HTTP/SSE Transport Route
 *
 * GET  /api/mcp  — establishes SSE stream (MCP server → client)
 * POST /api/mcp  — accepts MCP client messages
 *
 * Both endpoints require a valid API key in Authorization: Bearer header.
 * Admin-only tools require the key to belong to an admin user.
 */

import { NextResponse } from "next/server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { validateApiKey } from "@/lib/localDb";
import { createMcpServer } from "@/lib/mcp/server";
import { getSettings } from "@/lib/localDb";

/**
 * Extract API key from Authorization: Bearer header.
 * @param {Request} request
 * @returns {string|null}
 */
function extractApiKey(request) {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Authenticate request and return keyObj or null.
 */
async function authenticate(request) {
  const key = extractApiKey(request);
  if (!key) return null;
  return validateApiKey(key);
}

// In-memory store for active SSE transports (keyed by sessionId).
// This is an in-process store — horizontal scaling requires a shared store.
const _transports = new Map();

/**
 * GET /api/mcp — Open SSE stream
 */
export async function GET(request) {
  // Check mcpServerEnabled setting
  try {
    const settings = await getSettings();
    if (settings.mcpServerEnabled === false) {
      return NextResponse.json({ error: "MCP server is disabled" }, { status: 503 });
    }
  } catch {
    // Non-fatal: continue
  }

  const keyObj = await authenticate(request);
  if (!keyObj) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = keyObj.isAdmin === true;
  const server = createMcpServer({ isAdmin });

  // Create SSE transport — SSEServerTransport takes (path, response)
  // We use a TransformStream to pipe the SSE output to the response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Create a mock response-like object that SSEServerTransport can write to
  const mockRes = {
    write: (data) => {
      writer.write(encoder.encode(data)).catch(() => {});
    },
    end: () => {
      writer.close().catch(() => {});
    },
    on: () => {},
    setHeader: () => {},
    writeHead: () => {},
  };

  const transport = new SSEServerTransport("/api/mcp", mockRes);
  const sessionId = transport.sessionId;
  _transports.set(sessionId, transport);

  // Clean up on stream close
  request.signal?.addEventListener("abort", () => {
    _transports.delete(sessionId);
    writer.close().catch(() => {});
  });

  await server.connect(transport);

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-mcp-session-id": sessionId,
    },
  });
}

/**
 * POST /api/mcp — Handle MCP client message
 */
export async function POST(request) {
  const keyObj = await authenticate(request);
  if (!keyObj) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the session
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId query parameter" }, { status: 400 });
  }

  const transport = _transports.get(sessionId);
  if (!transport) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const body = await request.text();
  await transport.handlePostMessage(body);
  return new Response(null, { status: 202 });
}
