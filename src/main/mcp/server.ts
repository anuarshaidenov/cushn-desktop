/**
 * Cushn's MCP server: the tools in `tools/`, registered on one `McpServer`.
 * Transport-agnostic and Electron-free: the caller connects it to a
 * transport and injects how the renderer hears about an agent's writes.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { QueryRoot } from "@shared/api";
import { type CushnErrorCode, CushnError } from "@shared/errors";
import { type CushnTool, type ToolContext, toolAnnotations } from "./tool";
import { cushnTools } from "./tools";

/** Clients put this in the model's context. */
export const CUSHN_INSTRUCTIONS = [
  "Cushn is the user's local budgeting app. A budget plans one income in one currency, split " +
    "into allocations (from a template's percentage categories); expenses are filed under an " +
    "allocation. Budgets are active, archived or in the trash.",
  "Take ids from the list_* and get_* tools; never guess them.",
  "Money is in major units of each budget's own currency (5000 means 5000 USD). Stored amounts " +
    "are never converted, and nothing is summed across currencies; get_exchange_rates converts " +
    "when needed.",
  "Writes apply at once, with no confirmation, and every one can be undone: trash_budgets ↔ " +
    "restore_budgets, archive_budgets ↔ unarchive_budgets, delete_expenses returns the removed " +
    "rows for restore_expenses, a created or duplicated budget or expense is undone by trashing " +
    "or deleting it, and an update by setting the previous values. Nothing can be deleted for " +
    "good, and labels only by the user in the app. Tell the user what you changed.",
].join("\n\n");

export interface CushnMcpDependencies extends ToolContext {
  /** Tells the renderer to refetch these query roots after an agent's write. */
  notifyChanged(roots: readonly QueryRoot[]): void;
  /** Reported to clients as the server's version. */
  appVersion: string;
}

export function createCushnMcpServer(
  deps: CushnMcpDependencies,
  tools: readonly CushnTool[] = cushnTools,
): McpServer {
  const server = new McpServer(
    { name: "cushn", version: deps.appVersion },
    { instructions: CUSHN_INSTRUCTIONS },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        annotations: toolAnnotations(tool),
      },
      (args) => callTool(tool, deps, args),
    );
  }
  return server;
}

/**
 * Runs one tool with `invokeHandler`'s rules. The SDK has already answered
 * args that fail `tool.input` with its own error result. Then:
 * - success → the result as one JSON text block (no output schemas, so no
 *   `structuredContent`); a write then notifies its `changes`;
 * - `CushnError` → an error result, "CODE: message";
 * - anything else → "INTERNAL: Internal error", logged here; the error and
 *   its stack never reach the agent.
 */
async function callTool(
  tool: CushnTool,
  { db, rates, notifyChanged }: CushnMcpDependencies,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  let text: string;
  try {
    text = JSON.stringify((await tool.run({ db, rates }, args)) ?? null);
  } catch (error) {
    if (error instanceof CushnError) return errorResult(error.code, error.message);
    console.error(`[mcp] ${tool.name} failed`, error);
    return errorResult("INTERNAL", "Internal error");
  }
  if (tool.kind === "write") {
    try {
      notifyChanged(tool.changes);
    } catch (error) {
      // The write happened: failing the call would invite the agent to repeat it.
      console.error(`[mcp] ${tool.name}: notifyChanged failed`, error);
    }
  }
  return { content: [{ type: "text", text }] };
}

function errorResult(code: CushnErrorCode, message: string): CallToolResult {
  return { content: [{ type: "text", text: `${code}: ${message}` }], isError: true };
}
