// MCP stdio server. JSON-RPC 2.0 over stdin/stdout.
// Implements the minimum MCP-2024-11-05 protocol surface needed for tool use:
//   initialize, initialized notification, tools/list, tools/call.
// Larger MCP features (resources, prompts, logging, completions) are not
// implemented in v0.1 — this tool exposes two pure functions and nothing else.

import { TOOL_DEFINITIONS, readAgentContext, convertAgentContext } from "./tools.ts";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "@mbeato/agentcontext-mcp";
const SERVER_VERSION = "0.1.0";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type JsonRpcNotification = { jsonrpc: "2.0"; method: string; params?: unknown };

function send(msg: JsonRpcResponse | JsonRpcNotification): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

async function handle(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  switch (req.method) {
    case "initialize": {
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: {} },
      });
    }
    case "initialized":
    case "notifications/initialized":
      return null; // notification — no response

    case "tools/list":
      return ok(id, { tools: TOOL_DEFINITIONS });

    case "tools/call": {
      const params = (req.params ?? {}) as { name?: string; arguments?: unknown };
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        if (params.name === "read_agent_context") {
          const result = await readAgentContext({ path: typeof args["path"] === "string" ? (args["path"] as string) : undefined });
          return ok(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        }
        if (params.name === "convert_agent_context") {
          const result = await convertAgentContext({
            ir: args["ir"] as Parameters<typeof convertAgentContext>[0]["ir"],
            targets: args["targets"] as Parameters<typeof convertAgentContext>[0]["targets"],
          });
          return ok(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        }
        return err(id, -32601, `Unknown tool: ${params.name}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return err(id, -32000, `Tool execution failed: ${message}`);
      }
    }

    case "ping":
      return ok(id, {});

    default:
      // Unknown method — only error if it has an id (otherwise it's a notification).
      if (req.id === undefined) return null;
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}

export async function runStdioServer(): Promise<void> {
  // Buffered line reader over stdin.
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const req = JSON.parse(line) as JsonRpcRequest;
        const res = await handle(req);
        if (res) send(res);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send(err(null, -32700, `Parse error: ${message}`));
      }
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
