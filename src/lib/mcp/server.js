/**
 * MCP Server factory — creates and configures an MCP Server instance with all tools.
 *
 * Used by both transports:
 *   - stdio: bin/mcp-server.js
 *   - HTTP/SSE: src/app/api/mcp/route.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, ADMIN_TOOLS } from "./tools.js";
import { HANDLERS } from "./handlers.js";

/**
 * Create a configured MCP Server instance.
 *
 * @param {{ isAdmin?: boolean }} opts
 * @returns {Server}
 */
export function createMcpServer({ isAdmin = false } = {}) {
  const server = new Server(
    { name: "9router", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = isAdmin ? TOOLS : TOOLS.filter(t => !ADMIN_TOOLS.has(t.name));
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Admin gate
    if (ADMIN_TOOLS.has(name) && !isAdmin) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Admin access required" }) }],
        isError: true,
      };
    }

    const handler = HANDLERS[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
    }

    try {
      const result = await handler(args || {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
        isError: true,
      };
    }
  });

  return server;
}
