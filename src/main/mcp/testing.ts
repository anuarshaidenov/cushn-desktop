/**
 * Test harness for the MCP tools: a migrated in-memory database (no seed),
 * the Cushn MCP server, and an SDK `Client` linked to it in memory, so tests
 * speak real MCP (`tools/list`, `tools/call`) with no process or socket.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { QueryRoot } from "@shared/api";
import type { AppDatabase } from "../db";
import { openTestDatabase } from "../repositories/budgets.fixtures";
import { type CushnMcpDependencies, createCushnMcpServer } from "./server";
import type { CushnTool } from "./tool";

/** A tool call's outcome, shaped like the IPC envelope: the parsed JSON result, or the error text. */
export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: string };

export interface McpHarness {
  db: AppDatabase;
  client: Client;
  /** The roots of every `notifyChanged` call, in order. */
  changes: (readonly QueryRoot[])[];
  call(name: string, args?: Record<string, unknown>): Promise<ToolOutcome>;
  close(): Promise<void>;
}

export interface McpHarnessOptions {
  /** Defaults to every Cushn tool. */
  tools?: readonly CushnTool[];
  /** Defaults to offline: no rates. */
  rates?: CushnMcpDependencies["rates"];
  /** Runs after the harness records the call. */
  notifyChanged?: CushnMcpDependencies["notifyChanged"];
}

export async function connectMcp(options: McpHarnessOptions = {}): Promise<McpHarness> {
  const handle = openTestDatabase();
  const changes: (readonly QueryRoot[])[] = [];
  const server = createCushnMcpServer(
    {
      db: handle.db,
      rates: options.rates ?? { get: async () => null },
      notifyChanged: (roots) => {
        changes.push(roots);
        options.notifyChanged?.(roots);
      },
      appVersion: "0.0.0",
    },
    options.tools,
  );
  const client = new Client({ name: "cushn-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    db: handle.db,
    client,
    changes,
    async call(name, args = {}) {
      const { content, isError } = CallToolResultSchema.parse(
        await client.callTool({ name, arguments: args }),
      );
      const [block] = content;
      if (content.length !== 1 || block.type !== "text") {
        throw new Error(`${name} did not answer with one text block`);
      }
      return isError
        ? { ok: false, error: block.text }
        : { ok: true, data: JSON.parse(block.text) };
    },
    async close() {
      // Closing one end of the linked pair closes the other.
      await client.close();
      handle.close();
    },
  };
}
