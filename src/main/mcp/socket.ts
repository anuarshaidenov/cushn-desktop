/**
 * The MCP server's one transport: a user-only local socket that the stdio
 * launcher (`~/.cushn/bin/cushn-mcp`) relays agents to. Each connection opens
 * with the relay's handshake (`src/relay/handshake.ts`), in which the app
 * proves it knows the secret it wrote to `<userData>/mcp/secret` at launch, so
 * a relay never hands an agent's traffic to a program that took the socket's
 * address first. Only then does the connection get its own MCP server,
 * speaking newline-delimited JSON-RPC like stdio. Electron-free: `index.ts`
 * passes the paths and the server factory.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { type Server, type Socket, createServer as createNetServer } from "node:net";
import { userInfo } from "node:os";
import { dirname, posix, win32 } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { APP_NAME } from "@shared/app";
import { parseHello, proofLine, randomHex, readLine } from "../../relay/handshake";

/** `sun_path` holds 104 bytes on macOS and the BSDs, 108 on Linux, NUL included. */
const UNIX_PATH_LIMIT: Partial<Record<NodeJS.Platform, number>> = { linux: 107 };
const DEFAULT_UNIX_PATH_LIMIT = 103;

const HANDSHAKE_TIMEOUT_MS = 5_000;

/**
 * Unix: `<userData>/mcp/cushn.sock`, its directory mode 0700. Throws when the
 * path is too long for a Unix socket; there is no fallback outside userData.
 *
 * Windows: a named pipe per user and userData. Its name can be guessed, so
 * another user could create it first: the relay then can't verify the app and
 * stops, and the app's listen fails (`describeListenError`). Its default ACL
 * gives Everyone read access; a reader can't send the handshake, so the app
 * never writes to it.
 */
export function mcpSocketPath(userDataDir: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    const hash = createHash("sha256")
      .update(`${userInfo().username}\0${userDataDir}`)
      .digest("hex")
      .slice(0, 16);
    return `\\\\.\\pipe\\cushn-mcp-${hash}`;
  }
  const path = posix.join(userDataDir, "mcp", "cushn.sock");
  const limit = UNIX_PATH_LIMIT[platform] ?? DEFAULT_UNIX_PATH_LIMIT;
  const bytes = Buffer.byteLength(path);
  if (bytes > limit) {
    throw new Error(
      `The MCP socket path is ${bytes} bytes, over the ${limit}-byte limit for Unix sockets: ${path}`,
    );
  }
  return path;
}

/** `<userData>/mcp/secret`: the per-launch secret the app proves to the relay. */
export function mcpSecretPath(userDataDir: string, platform: NodeJS.Platform): string {
  return (platform === "win32" ? win32 : posix).join(userDataDir, "mcp", "secret");
}

/** What Settings → Agents shows when `serveMcp` fails. */
export function describeListenError(
  error: unknown,
  platform: NodeJS.Platform = process.platform,
): string {
  const address = platform === "win32" ? "pipe" : "socket";
  switch ((error as NodeJS.ErrnoException | null | undefined)?.code) {
    case "EADDRINUSE":
      return (
        `Another program already holds ${APP_NAME}'s agent ${address}, so agents are off until ` +
        `${APP_NAME} restarts. If this keeps happening, restart your computer.`
      );
    case "EACCES":
      return `${APP_NAME} isn't allowed to open its agent ${address}, so agents are off until it restarts.`;
  }
  return error instanceof Error ? error.message : String(error);
}

export interface ServeMcpOptions {
  path: string;
  /** `mcpSecretPath(...)`: rewritten with a fresh secret on every start. */
  secretPath: string;
  /** Called once per connection, after its handshake. */
  createServer(): McpServer;
  /** How long a new connection has to send its hello line. */
  handshakeTimeoutMs?: number;
  /** The number of open connections, each time it changes (`src/main/lifetime.ts`). */
  onConnectionsChanged?(count: number): void;
}

export interface McpSocketServer {
  /** Stops listening, drops open connections and removes the socket and secret files. */
  close(): Promise<void>;
}

/**
 * Writes a fresh secret, then listens. A failed listen leaves the secret, so a
 * relay that reaches whatever holds the address says it can't verify the app
 * rather than that the app isn't running.
 */
export async function serveMcp({
  path,
  secretPath,
  createServer,
  handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS,
  onConnectionsChanged,
}: ServeMcpOptions): Promise<McpSocketServer> {
  const unix = process.platform !== "win32";
  if (unix) prepareSocketPath(path);
  const secret = writeSecret(secretPath, unix);

  const connections = new Set<Socket>();
  const server = createNetServer((socket) => {
    connections.add(socket);
    onConnectionsChanged?.(connections.size);
    socket.once("close", () => {
      connections.delete(socket);
      onConnectionsChanged?.(connections.size);
    });
    readLine(socket, handshakeTimeoutMs).then(
      (line) => {
        const nonce = parseHello(line);
        if (nonce === null) {
          socket.destroy();
          return;
        }
        socket.write(proofLine(secret, nonce));
        startSession(socket, createServer);
      },
      () => socket.destroy(),
    );
  });

  await listen(server, path);
  server.on("error", (error) => console.error("[mcp] Socket server error", error));
  if (unix) chmodSync(path, 0o600);

  return {
    close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      for (const socket of connections) socket.destroy();
      if (unix) rmSync(path, { force: true });
      rmSync(secretPath, { force: true });
      return closed;
    },
  };
}

function startSession(socket: Socket, createServer: () => McpServer): void {
  try {
    createServer()
      .connect(new SocketTransport(socket))
      .catch((error: unknown) => {
        console.error("[mcp] Could not start a connection", error);
        socket.destroy();
      });
  } catch (error) {
    console.error("[mcp] Could not create a server for a connection", error);
    socket.destroy();
  }
}

/**
 * Any file left at `path` is stale: the single-instance lock means no live app
 * owns it.
 */
function prepareSocketPath(path: string): void {
  prepareUserOnlyDir(posix.dirname(path));
  rmSync(path, { force: true });
}

/**
 * Swapped in whole (temp file, then rename), so a relay never reads half a
 * secret. On Unix it shares the socket's user-only directory; on Windows,
 * userData is already the user's own.
 */
function writeSecret(path: string, unix: boolean): string {
  const dir = dirname(path);
  if (unix) prepareUserOnlyDir(dir);
  else mkdirSync(dir, { recursive: true });
  const secret = randomHex();
  const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, secret, { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return secret;
}

/** No other user can reach what's inside, even before its own chmod. */
function prepareUserOnlyDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stats = lstatSync(dir);
  if (!stats.isDirectory() || stats.uid !== process.getuid?.()) {
    throw new Error(`${dir} is not a directory owned by this user`);
  }
  chmodSync(dir, 0o700);
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/** An MCP transport over a stream socket: newline-delimited JSON-RPC, like stdio. */
export class SocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private readonly buffer = new ReadBuffer();

  constructor(private readonly socket: Socket) {}

  async start(): Promise<void> {
    this.socket.on("data", (chunk: Buffer) => this.receive(chunk));
    this.socket.on("error", (error) => this.onerror?.(error));
    this.socket.once("close", () => {
      this.buffer.clear();
      this.onclose?.();
    });
    // The handshake leaves the socket paused.
    this.socket.resume();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket.writable) {
        reject(new Error("The MCP socket is closed"));
        return;
      }
      this.socket.write(serializeMessage(message), (error) => (error ? reject(error) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.socket.end();
  }

  private receive(chunk: Buffer): void {
    try {
      this.buffer.append(chunk);
    } catch (error) {
      // Over the SDK's 10 MB line limit: no client of ours sends that.
      this.onerror?.(error as Error);
      this.socket.destroy();
      return;
    }
    for (;;) {
      let message: JSONRPCMessage | null;
      try {
        message = this.buffer.readMessage();
      } catch (error) {
        // A line that isn't JSON-RPC is consumed and skipped.
        this.onerror?.(error as Error);
        continue;
      }
      if (message === null) return;
      this.onmessage?.(message);
    }
  }
}
