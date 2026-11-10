/**
 * Main-process side of the IPC contract: the handler map type and the
 * envelope. Electron-free, so tests drive it directly.
 */
import { z } from "zod";
import {
  type ArgsOf,
  type CushnChannel,
  type Domain,
  type MethodName,
  type ResultOf,
  cushnContract,
  cushnMethods,
} from "@shared/api";
import { CushnError, type IpcResult, fail, ok } from "@shared/errors";
import type { AppDatabase } from "../db";

/** What every handler receives. Repositories get `db` from here, never from a global. */
export interface HandlerContext {
  db: AppDatabase;
}

/** Turns untrusted IPC input into typed args, throwing on invalid input. A zod schema fits. */
export interface ArgsParser<Args> {
  parse(input: unknown): Args;
}

export interface Handler<Args, Result> {
  args: ArgsParser<Args>;
  run(context: HandlerContext, args: Args): Result | Promise<Result>;
}

/**
 * One handler per contract method. A missing domain or method, or a handler
 * whose args or result disagree with the contract, is a compile error.
 */
export type CushnHandlers = {
  [D in Domain]: { [M in MethodName<D>]: Handler<ArgsOf<D, M>, ResultOf<D, M>> };
};

/** Args parser for methods that take no argument. */
export const noArgs: ArgsParser<void> = z.undefined();

/** Every method of `domain` answering NOT_IMPLEMENTED: the placeholder until its repository lands. */
export function notImplemented<D extends Domain>(domain: D): CushnHandlers[D] {
  const handlers: Record<string, Handler<unknown, never>> = {};
  for (const name of Object.keys(cushnContract[domain])) {
    handlers[name] = {
      args: { parse: (input) => input },
      run: () => {
        throw new CushnError("NOT_IMPLEMENTED", `${domain}.${name} is not implemented yet`);
      },
    };
  }
  return handlers as unknown as CushnHandlers[D];
}

/** Reports errors that are not `CushnError`s (bugs, SQLite failures). */
export type ErrorReporter = (error: unknown, channel: CushnChannel) => void;

const defaultReporter: ErrorReporter = (error, channel) => {
  console.error(`[ipc] ${channel} failed`, error);
};

/**
 * Runs one handler and wraps the outcome in the envelope:
 * - success → `{ ok: true, data }`;
 * - `CushnError` → its `code` and `message`;
 * - invalid args → BAD_REQUEST;
 * - anything else → INTERNAL with a generic message. The error itself (and
 *   its stack) is reported in main and never reaches the renderer.
 */
export async function invokeHandler<Args, Result>(
  handler: Handler<Args, Result>,
  context: HandlerContext,
  input: unknown,
  channel: CushnChannel,
  report: ErrorReporter = defaultReporter,
): Promise<IpcResult<Result>> {
  let args: Args;
  try {
    args = handler.args.parse(input);
  } catch (error) {
    if (error instanceof CushnError) return fail(error);
    const detail = error instanceof z.ZodError ? z.prettifyError(error) : "malformed input";
    return fail({ code: "BAD_REQUEST", message: `Invalid arguments: ${detail}` });
  }
  try {
    return ok(await handler.run(context, args));
  } catch (error) {
    if (error instanceof CushnError) return fail(error);
    report(error, channel);
    return fail({ code: "INTERNAL", message: "Internal error" });
  }
}

export type IpcDispatcher = (channel: CushnChannel, input: unknown) => Promise<IpcResult<unknown>>;

/** Routes a channel to its handler through `invokeHandler`. `registerIpc` binds it to `ipcMain`. */
export function createDispatcher(
  handlers: CushnHandlers,
  context: HandlerContext,
  report?: ErrorReporter,
): IpcDispatcher {
  const byChannel = new Map<CushnChannel, Handler<unknown, unknown>>();
  const table = handlers as unknown as Record<string, Record<string, Handler<unknown, unknown>>>;
  for (const [domain, name, channel] of cushnMethods) {
    byChannel.set(channel, table[domain][name]);
  }
  return (channel, input) => {
    const handler = byChannel.get(channel);
    if (!handler) {
      return Promise.resolve(fail({ code: "NOT_FOUND", message: `Unknown channel ${channel}` }));
    }
    return invokeHandler(handler, context, input, channel, report);
  };
}
