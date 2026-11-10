/**
 * An agent tool as a plain object: what the model sees (name, description,
 * input schema) and what runs (one repository call). `server.ts` registers
 * each one; the tools themselves live in `tools/<domain>.ts`.
 *
 * Agent tools only do reversible things (trash, never hard-delete), so there
 * is no destructive kind, and the MCP annotations follow from `kind`.
 */
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { QueryRoot } from "@shared/api";
import type { AppDatabase } from "../db";
import type { Rates } from "../repositories/rates";

/** What every tool's `run` receives. */
export interface ToolContext {
  db: AppDatabase;
  rates: Pick<Rates, "get">;
}

interface ToolBase<Input extends z.ZodObject> {
  /** What the model calls, in snake_case: `list_budgets`. */
  name: string;
  /** For the model: what the tool does and returns, in Cushn's terms. It learns the domain from these. */
  description: string;
  /** The SDK validates args against it before `run`. Every field needs a `.describe()`. */
  input: Input;
  /** The result goes back to the model as JSON. */
  run(context: ToolContext, args: z.output<Input>): unknown;
}

export interface ReadTool<Input extends z.ZodObject = z.ZodObject> extends ToolBase<Input> {
  kind: "read";
}

export interface WriteTool<Input extends z.ZodObject = z.ZodObject> extends ToolBase<Input> {
  kind: "write";
  /** Calling it again with the same args changes nothing more (archive, set a label). */
  idempotent: boolean;
  /** The query roots the renderer refetches after a successful call: the matching hook's roots. */
  changes: readonly [QueryRoot, ...QueryRoot[]];
}

export type CushnTool<Input extends z.ZodObject = z.ZodObject> = ReadTool<Input> | WriteTool<Input>;

/** Returns `tool` as is; it exists so `run`'s args are inferred from `input`. */
export function defineTool<Input extends z.ZodObject>(tool: CushnTool<Input>): CushnTool<Input> {
  return tool;
}

export function toolAnnotations(tool: CushnTool): ToolAnnotations {
  return tool.kind === "read"
    ? { readOnlyHint: true }
    : { readOnlyHint: false, destructiveHint: false, idempotentHint: tool.idempotent };
}
