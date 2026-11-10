/**
 * The MCP socket end to end: `serveMcp` on a temp Unix socket, an SDK
 * `Client` connected over `net` after the relay's handshake (or through the
 * relay itself), and real tool calls against an in-memory database.
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type Socket, connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLine } from "../../relay/handshake";
import type { DatabaseHandle } from "../db";
import { insertLabel, openTestDatabase } from "../repositories/budgets.fixtures";
import { createCushnMcpServer } from "./server";
import {
  type ServeMcpOptions,
  SocketTransport,
  describeListenError,
  mcpSecretPath,
  mcpSocketPath,
  serveMcp,
} from "./socket";

const unixOnly = it.skipIf(process.platform === "win32");
const RELAY = join(import.meta.dirname, "..", "..", "relay", "index.ts");

function errno(code: string, message = `listen ${code}`): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

describe("mcpSocketPath", () => {
  it("puts the Unix socket in its own directory under userData", () => {
    expect(mcpSocketPath("/Users/ann/Library/Application Support/Cushn", "darwin")).toBe(
      "/Users/ann/Library/Application Support/Cushn/mcp/cushn.sock",
    );
    expect(mcpSocketPath("/home/ann/.config/Cushn", "linux")).toBe(
      "/home/ann/.config/Cushn/mcp/cushn.sock",
    );
  });

  it("refuses a path over the platform's Unix socket limit", () => {
    const userData = `/Users/${"a".repeat(85)}`;
    expect(() => mcpSocketPath(userData, "darwin")).toThrow(/over the 103-byte limit/);
    expect(mcpSocketPath(userData, "linux")).toBe(`${userData}/mcp/cushn.sock`);
    expect(() => mcpSocketPath(`/home/${"é".repeat(45)}`, "linux")).toThrow(/107-byte/);
  });

  it("names a stable named pipe per userData on Windows", () => {
    const pipe = mcpSocketPath("C:\\Users\\ann\\AppData\\Roaming\\Cushn", "win32");

    expect(pipe).toMatch(/^\\\\\.\\pipe\\cushn-mcp-[0-9a-f]{16}$/);
    expect(mcpSocketPath("C:\\Users\\ann\\AppData\\Roaming\\Cushn", "win32")).toBe(pipe);
    expect(mcpSocketPath("C:\\Users\\bob\\AppData\\Roaming\\Cushn", "win32")).not.toBe(pipe);
  });
});

describe("mcpSecretPath", () => {
  it("keeps the secret next to the socket, under userData", () => {
    expect(mcpSecretPath("/Users/ann/Library/Application Support/Cushn", "darwin")).toBe(
      "/Users/ann/Library/Application Support/Cushn/mcp/secret",
    );
    expect(mcpSecretPath("C:\\Users\\ann\\AppData\\Roaming\\Cushn", "win32")).toBe(
      "C:\\Users\\ann\\AppData\\Roaming\\Cushn\\mcp\\secret",
    );
  });
});

describe("describeListenError", () => {
  it("says another program holds the address, and what to do", () => {
    const pipe = describeListenError(errno("EADDRINUSE"), "win32");

    expect(pipe).toMatch(/another program already holds Cushn's agent pipe/i);
    expect(pipe).toMatch(/until Cushn restarts/);
    expect(pipe).toMatch(/restart your computer/);
    expect(describeListenError(errno("EADDRINUSE"), "darwin")).toMatch(/agent socket/);
  });

  it("says Cushn isn't allowed to open its address", () => {
    expect(describeListenError(errno("EACCES"), "linux")).toMatch(
      /Cushn isn't allowed to open its agent socket/,
    );
  });

  it("falls back to the error's own message", () => {
    expect(describeListenError(errno("EPERM", "listen EPERM: nope"), "darwin")).toBe(
      "listen EPERM: nope",
    );
    expect(describeListenError(new Error("/x/mcp is not a directory owned by this user"))).toBe(
      "/x/mcp is not a directory owned by this user",
    );
    expect(describeListenError("odd")).toBe("odd");
  });
});

describe("serveMcp", () => {
  let root: string;
  let path: string;
  let secretPath: string;
  let handle: DatabaseHandle;
  let servers: McpServer[];
  let clients: Client[];
  let sockets: Socket[];
  let mcp: { close(): Promise<void> } | undefined;

  function createServer(): McpServer {
    const server = createCushnMcpServer({
      db: handle.db,
      rates: { get: async () => null },
      notifyChanged: () => {},
      appVersion: "0.0.0",
    });
    servers.push(server);
    return server;
  }

  async function start(options: Partial<ServeMcpOptions> = {}) {
    mcp = await serveMcp({ path, secretPath, createServer, ...options });
    return mcp;
  }

  async function open(): Promise<Socket> {
    const socket = connect(path);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    return socket;
  }

  /** Everything the server sends until it closes the connection. */
  function received(socket: Socket): Promise<Buffer> {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", () => {});
    return new Promise((resolve) => socket.once("close", () => resolve(Buffer.concat(chunks))));
  }

  function proof(nonce: string): string {
    return createHmac("sha256", readFileSync(secretPath, "utf8")).update(nonce).digest("hex");
  }

  /** The relay's side of the handshake, written out from the wire format. */
  async function handshake(socket: Socket, after = ""): Promise<void> {
    const nonce = randomBytes(32).toString("hex");
    socket.write(`cushn-relay/1 ${nonce}\n${after}`);
    expect(await readLine(socket, 1_000)).toBe(proof(nonce));
  }

  async function connectClient(): Promise<Client> {
    const socket = await open();
    await handshake(socket);
    const client = new Client({ name: "cushn-test", version: "0.0.0" });
    await client.connect(new SocketTransport(socket));
    clients.push(client);
    return client;
  }

  async function labelNames(client: Client): Promise<string[]> {
    const { content, isError } = CallToolResultSchema.parse(
      await client.callTool({ name: "list_labels", arguments: {} }),
    );
    const [block] = content;
    if (isError || block.type !== "text") throw new Error("list_labels failed");
    return (JSON.parse(block.text) as { labels: { name: string }[] }).labels.map((l) => l.name);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cushn-mcp-"));
    path = mcpSocketPath(root, process.platform);
    secretPath = mcpSecretPath(root, process.platform);
    handle = openTestDatabase();
    servers = [];
    clients = [];
    sockets = [];
    mcp = undefined;
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    for (const socket of sockets) socket.destroy();
    await mcp?.close();
    handle.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("answers real tool calls over the socket", async () => {
    insertLabel(handle.db, "Monthly");
    await start();

    const client = await connectClient();

    expect(client.getServerVersion()).toMatchObject({ name: "cushn" });
    expect(await labelNames(client)).toEqual(["Monthly"]);
  });

  it("serves an agent through the relay, as the launcher runs it", async () => {
    insertLabel(handle.db, "Monthly");
    await start();
    const client = new Client({ name: "cushn-test", version: "0.0.0" });
    clients.push(client);

    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--no-warnings", RELAY, path, secretPath],
        stderr: "pipe",
      }),
    );

    expect(client.getServerVersion()).toMatchObject({ name: "cushn" });
    expect(await labelNames(client)).toEqual(["Monthly"]);
  });

  it("gives each connection its own MCP server", async () => {
    insertLabel(handle.db, "Monthly");
    await start();

    const [first, second] = await Promise.all([connectClient(), connectClient()]);

    expect(servers).toHaveLength(2);
    expect(await Promise.all([labelNames(first), labelNames(second)])).toEqual([
      ["Monthly"],
      ["Monthly"],
    ]);
  });

  it("disconnects a connection's server when its client leaves", async () => {
    await start();
    const [first, second] = await Promise.all([connectClient(), connectClient()]);

    await first.close();

    await expect.poll(() => servers.map((server) => server.isConnected())).toEqual([false, true]);
    expect(await labelNames(second)).toEqual([]);
  });

  it("keeps the MCP bytes that arrive with the handshake", async () => {
    await start();
    const socket = await open();
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "cushn-test", version: "0.0.0" },
      },
    };

    await handshake(socket, `${JSON.stringify(initialize)}\n`);
    const line = await new Promise<string>((resolve) => {
      let text = "";
      socket.on("data", (chunk: Buffer) => {
        text += chunk;
        if (text.includes("\n")) resolve(text.slice(0, text.indexOf("\n")));
      });
      socket.resume();
    });
    const reply = JSON.parse(line) as { id: number; result: { serverInfo: { name: string } } };

    expect(reply.id).toBe(1);
    expect(reply.result.serverInfo.name).toBe("cushn");
  });

  it("writes nothing to a connection that never sends the handshake, and drops it", async () => {
    await start({ handshakeTimeoutMs: 100 });
    const socket = await open();
    const bytes = received(socket);

    socket.write("cushn-relay/1 ");

    expect((await bytes).length).toBe(0);
    expect(servers).toHaveLength(0);
  });

  it.each([
    ["a JSON-RPC request", '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'],
    ["another protocol version", `cushn-relay/2 ${"ab".repeat(32)}\n`],
    ["a short nonce", `cushn-relay/1 ${"ab".repeat(8)}\n`],
    ["an uppercase nonce", `cushn-relay/1 ${"AB".repeat(32)}\n`],
    ["an empty line", "\n"],
    ["an overlong line", "a".repeat(300)],
  ])("writes nothing to a connection that opens with %s, and drops it", async (_, opening) => {
    await start();
    const socket = await open();
    const bytes = received(socket);

    socket.write(opening);

    expect((await bytes).length).toBe(0);
    expect(servers).toHaveLength(0);
  });

  it("writes a fresh user-only secret on every start and removes it on close", async () => {
    await start();
    const first = readFileSync(secretPath, "utf8");
    if (process.platform !== "win32") expect(statSync(secretPath).mode & 0o777).toBe(0o600);
    await mcp?.close();
    expect(() => statSync(secretPath)).toThrow(/ENOENT/);

    await start();
    const second = readFileSync(secretPath, "utf8");

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  unixOnly(
    "makes the socket, the secret and their directory reachable by the user only",
    async () => {
      await start();

      expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(dirname(secretPath)).toBe(dirname(path));
      expect(statSync(secretPath).mode & 0o777).toBe(0o600);
    },
  );

  unixOnly("replaces a stale socket file", async () => {
    await start();
    await mcp?.close();
    writeFileSync(path, "");

    await start();

    expect(await labelNames(await connectClient())).toEqual([]);
  });

  it("reports how many connections are open as they come and go", async () => {
    const counts: number[] = [];
    await start({ onConnectionsChanged: (count) => counts.push(count) });

    const [first, second] = await Promise.all([connectClient(), connectClient()]);
    await first.close();
    await expect.poll(() => counts).toEqual([1, 2, 1]);
    await second.close();

    await expect.poll(() => counts).toEqual([1, 2, 1, 0]);
  });

  it("closes open connections and removes the socket and the secret on close", async () => {
    await start();
    const client = await connectClient();
    const closed = new Promise<void>((resolve) => (client.onclose = resolve));

    await mcp?.close();
    mcp = undefined;

    await closed;
    if (process.platform !== "win32") expect(() => statSync(path)).toThrow(/ENOENT/);
    expect(() => statSync(secretPath)).toThrow(/ENOENT/);
    await expect(connectClient()).rejects.toThrow();
  });
});
