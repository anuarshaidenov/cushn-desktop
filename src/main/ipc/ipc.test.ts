/**
 * The IPC seam end to end, minus Electron: main's dispatcher → structured
 * clone (what IPC does to values) → the preload's generated bridge → the
 * renderer's client. A repository error must reach the renderer-side caller
 * as a `CushnError` with its `code` and `message`.
 */
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CushnApi,
  channelName,
  createApiClient,
  createBridgeMethods,
  cushnMethods,
} from "@shared/api";
import { asId } from "@shared/domain";
import { CushnError } from "@shared/errors";
import { type DatabaseHandle, openDatabase } from "../db";
import {
  type CushnHandlers,
  type ErrorReporter,
  createDispatcher,
  noArgs,
  notImplemented,
} from "./handler";
import { createHandlers as createAllHandlers } from "./handlers";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

// Backup, files, rates, agents and updates have their own tests; here dialogs never open, rates
// never fetch, no agent CLI runs and nothing updates.
const createHandlers = () =>
  createAllHandlers({
    backup: {
      dialogs: {
        chooseExportPath: async () => null,
        chooseImportPath: async () => null,
      },
      safetyCopyDir: "/nonexistent",
      appVersion: "0.0.0",
      now: Date.now,
    },
    files: {
      chooseMarkdownPath: async () => null,
      showItemInFolder: () => {},
    },
    rates: { get: async () => null },
    agents: {
      list: async () => [],
      connect: async () => {
        throw new Error("unused");
      },
      disconnect: async () => {
        throw new Error("unused");
      },
      refreshLauncher: async () => {},
      socket: () => ({ state: "listening" }),
    },
    updater: {
      start: () => {},
      status: () => ({ state: "none" }),
      install: () => {
        throw new Error("unused");
      },
    },
  });

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

function connect(handlers: CushnHandlers = createHandlers(), report: ErrorReporter = () => {}) {
  const dispatch = createDispatcher(handlers, { db: handle.db }, report);
  const bridge = createBridgeMethods(async (channel, args) =>
    structuredClone(await dispatch(channel, structuredClone(args))),
  );
  return { dispatch, cushn: createApiClient(bridge) };
}

async function rejection(call: Promise<unknown>): Promise<CushnError> {
  const error = await call.then(
    () => {
      throw new Error("expected the call to reject");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CushnError);
  return error as CushnError;
}

describe("contract", () => {
  it("derives one cushn:<domain>.<method> channel per method", () => {
    expect(channelName("labels", "create")).toBe("cushn:labels.create");
    const channels = cushnMethods.map(([, , channel]) => channel);
    expect(channels).toHaveLength(64);
    expect(new Set(channels).size).toBe(64);
    expect(channels).toContain("cushn:budgets.exportMarkdown");
  });
});

describe("IPC round trip", () => {
  it("resolves to the handler's data on success", async () => {
    const { cushn } = connect();

    const { labelId } = await cushn.labels.create({ name: "Travel", color: "#123456" });
    const { labels } = await cushn.labels.list();

    expect(labels).toHaveLength(6);
    expect(labels.at(-1)).toMatchObject({ id: labelId, name: "Travel", color: "#123456" });
  });

  it("rethrows a repository CushnError with its code and message", async () => {
    const { dispatch, cushn } = connect();
    const args = { labelId: asId<"budgetLabels">("missing"), name: "x" };

    expect(await dispatch("cushn:labels.updateName", args)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Label not found" },
    });
    const error = await rejection(cushn.labels.updateName(args));
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Label not found");
  });

  it("answers BAD_REQUEST for args that fail validation, without running the handler", async () => {
    const { cushn } = connect();
    const untyped = cushn as unknown as { labels: { create(args: unknown): Promise<unknown> } };

    const error = await rejection(untyped.labels.create({ name: 42, color: "#000000" }));

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toMatch(/^Invalid arguments/);
    expect((await cushn.labels.list()).labels).toHaveLength(5);
  });

  it("rejects a backup token main doesn't hold with NOT_FOUND, and an unknown mode with BAD_REQUEST", async () => {
    const { cushn } = connect();
    const untyped = cushn as unknown as { backup: { import(args: unknown): Promise<unknown> } };

    const stale = await rejection(cushn.backup.import({ token: "stale", mode: "add" }));
    const merge = await rejection(untyped.backup.import({ token: "stale", mode: "merge" }));

    expect(stale.code).toBe("NOT_FOUND");
    expect(stale.message).toBe("That backup file is no longer open. Choose it again.");
    expect(merge.code).toBe("BAD_REQUEST");
  });

  it("answers INTERNAL for an unexpected error, reporting it in main but not leaking it", async () => {
    const boom = new Error("SQLITE_CORRUPT: /Users/someone/cushn.db");
    const report = vi.fn<ErrorReporter>();
    const handlers = createHandlers();
    handlers.labels.list = {
      args: noArgs,
      run: () => {
        throw boom;
      },
    };
    const { dispatch, cushn } = connect(handlers, report);

    const envelope = await dispatch("cushn:labels.list", undefined);
    expect(envelope).toEqual({ ok: false, error: { code: "INTERNAL", message: "Internal error" } });
    expect(JSON.stringify(envelope)).not.toMatch(/SQLITE|Users|at /);
    expect(report).toHaveBeenCalledWith(boom, "cushn:labels.list");

    const error = await rejection(cushn.labels.list());
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("Internal error");
  });

  it("answers NOT_IMPLEMENTED for every method of a domain that is not ported", async () => {
    const { dispatch, cushn } = connect({ ...createHandlers(), views: notImplemented("views") });

    const pending = cushnMethods.filter(([domain]) => domain === "views");
    expect(pending).toHaveLength(7);
    for (const [domain, name, channel] of pending) {
      expect(await dispatch(channel, {})).toEqual({
        ok: false,
        error: { code: "NOT_IMPLEMENTED", message: `${domain}.${name} is not implemented yet` },
      });
    }
    expect((await rejection(cushn.views.list())).code).toBe("NOT_IMPLEMENTED");
  });
});

describe("renderer client", () => {
  const bridgeReturning = (value: () => Promise<unknown>): CushnApi =>
    createApiClient(createBridgeMethods(value));

  it("turns a rejected bridge call (IPC failure) into an INTERNAL CushnError", async () => {
    const cushn = bridgeReturning(() => Promise.reject(new Error("No handler registered")));

    const error = await rejection(cushn.labels.list());

    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("No handler registered");
  });

  it("rejects a malformed envelope", async () => {
    const cushn = bridgeReturning(() => Promise.resolve({ labels: [] }));

    expect((await rejection(cushn.labels.list())).code).toBe("INTERNAL");
  });
});
