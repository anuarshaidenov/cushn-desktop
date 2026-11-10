/**
 * The relay as the launcher runs it: a child process between pipes and a `net` server on a temp
 * socket, playing the app (or an impostor) side of the handshake from the wire format. Node runs
 * the TypeScript source as is; `--no-warnings` keeps its module-type notice off stderr.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type Server, type ServerOpts, type Socket, createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLine } from "./handshake";

const RELAY = join(import.meta.dirname, "index.ts");
const NOT_RUNNING = "Cushn isn't running. Open Cushn, then try again.\n";
const HELLO = "cushn-relay/1 ";

interface Exit {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

function startRelay(...args: string[]) {
  return startRelayWith({}, ...args);
}

function startRelayWith(env: Record<string, string>, ...args: string[]) {
  const child = spawn(process.execPath, ["--no-warnings", RELAY, ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
  const stdout: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
  const exit = new Promise<Exit>((resolve) =>
    child.once("close", (code) => resolve({ code, stdout: Buffer.concat(stdout), stderr })),
  );
  return { stdin: child.stdin, exit };
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve) => server.listen(path, resolve));
}

function randomHex(): string {
  return randomBytes(32).toString("hex");
}

function unverified(path: string): string {
  return (
    `Couldn't verify the Cushn app on the other end of ${path}; ` +
    "another program may be using its address. Quit Cushn and open it again.\n"
  );
}

/**
 * A stand-in for the app the relay starts: after a delay it writes a fresh secret, listens and
 * answers the handshake, then echoes one connection and exits. Each start appends a JSON line
 * to the log: its arguments, `ELECTRON_RUN_AS_NODE` and working directory.
 */
const FAKE_APP = `
import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
const [socketPath, secretPath, log, delayMs] = process.argv.slice(2);
appendFileSync(log, JSON.stringify({
  argv: process.argv.slice(2),
  runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
  cwd: process.cwd(),
}) + "\\n");
setTimeout(() => {
  const secret = randomBytes(32).toString("hex");
  writeFileSync(secretPath, secret);
  const server = createServer((socket) => {
    socket.once("data", (hello) => {
      const nonce = hello.toString().trim().split(" ")[1];
      socket.write(createHmac("sha256", secret).update(nonce).digest("hex") + "\\n");
      socket.pipe(socket);
    });
    socket.once("close", () => server.close());
  });
  server.listen(socketPath);
}, Number(delayMs));
setTimeout(() => process.exit(1), 10_000).unref();
`;

let root: string;
let socketPath: string;
let secretPath: string;
let secret: string;
let server: Server | undefined;
let hellos: string[];

/** Answers the handshake with `answerSecret`'s HMAC of the nonce, then hands the socket over. */
function answeringApp(
  answerSecret: string,
  session: (socket: Socket) => void,
  options: ServerOpts = {},
): Server {
  return createServer(options, (socket) => {
    readLine(socket, 1_000).then(
      (hello) => {
        hellos.push(hello);
        const nonce = hello.slice(HELLO.length);
        socket.write(`${createHmac("sha256", answerSecret).update(nonce).digest("hex")}\n`);
        session(socket);
      },
      () => socket.destroy(),
    );
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cushn-relay-"));
  socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\cushn-relay-test-${randomBytes(8).toString("hex")}`
      : join(root, "cushn.sock");
  secretPath = join(root, "secret");
  secret = randomHex();
  writeFileSync(secretPath, secret);
  hellos = [];
});

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("relay", () => {
  it("relays bytes both ways unchanged after the handshake and exits 0 after stdin EOF", async () => {
    server = answeringApp(secret, (socket) => socket.pipe(socket));
    await listen(server, socketPath);
    const payload = randomBytes(1024 * 1024);

    const relay = startRelay(socketPath, secretPath);
    relay.stdin.end(payload);
    const { code, stdout, stderr } = await relay.exit;

    expect(hellos).toEqual([expect.stringMatching(/^cushn-relay\/1 [0-9a-f]{64}$/)]);
    expect(stdout.equals(payload)).toBe(true);
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  it("half-closes the socket on stdin EOF and still relays the app's last reply", async () => {
    let session!: (socket: Socket) => void;
    const connection = new Promise<Socket>((resolve) => (session = resolve));
    server = answeringApp(secret, (socket) => session(socket), { allowHalfOpen: true });
    await listen(server, socketPath);

    const relay = startRelay(socketPath, secretPath);
    relay.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    const socket = await connection;
    let received = "";
    socket.on("data", (chunk: Buffer) => (received += chunk));
    socket.resume();
    const ended = new Promise<void>((resolve) => socket.once("end", resolve));
    relay.stdin.end();
    await ended;
    socket.end("last reply\n");
    const { code, stdout, stderr } = await relay.exit;

    expect(received).toBe('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    expect(stdout.toString()).toBe("last reply\n");
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  it("refuses an app that can't answer for the secret, and never forwards stdin", async () => {
    let received = "";
    let closed!: Promise<void>;
    server = createServer((socket) => {
      closed = new Promise((resolve) => socket.once("close", () => resolve()));
      socket.on("error", () => {});
      socket.on("data", (chunk: Buffer) => (received += chunk));
      // Slow to answer, so stdin forwarded early would show up here.
      setTimeout(() => {
        const nonce = received.slice(HELLO.length, received.indexOf("\n"));
        socket.write(`${createHmac("sha256", randomHex()).update(nonce).digest("hex")}\n`);
      }, 200);
    });
    await listen(server, socketPath);

    const relay = startRelay(socketPath, secretPath);
    relay.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
    const { code, stdout, stderr } = await relay.exit;
    await closed;

    expect(received).toMatch(/^cushn-relay\/1 [0-9a-f]{64}\n$/);
    expect(stdout.length).toBe(0);
    expect(stderr).toBe(unverified(socketPath));
    expect(code).toBe(1);
  });

  it.each<[string, (socket: Socket) => void]>([
    ["speaks before the handshake", (socket) => socket.write('{"jsonrpc":"2.0","id":0}\n')],
    ["closes without answering", (socket) => socket.end()],
    ["answers with an overlong line", (socket) => socket.write("a".repeat(300))],
  ])("refuses an app that %s, and writes nothing to stdout", async (_, impostor) => {
    server = createServer((socket) => {
      socket.on("error", () => {});
      socket.resume();
      impostor(socket);
    });
    await listen(server, socketPath);

    const relay = startRelay(socketPath, secretPath);
    relay.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
    const { code, stdout, stderr } = await relay.exit;

    expect(stdout.length).toBe(0);
    expect(stderr).toBe(unverified(socketPath));
    expect(code).toBe(1);
  });

  it("says Cushn isn't running when its secret file is missing", async () => {
    let connections = 0;
    server = createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await listen(server, socketPath);
    rmSync(secretPath);

    const { code, stdout, stderr } = await startRelay(socketPath, secretPath).exit;

    expect(stderr).toBe(NOT_RUNNING);
    expect(stdout.length).toBe(0);
    expect(code).toBe(1);
    expect(connections).toBe(0);
  });

  it("says Cushn isn't running when nothing listens at the path", async () => {
    const { code, stdout, stderr } = await startRelay(socketPath, secretPath).exit;

    expect(stderr).toBe(NOT_RUNNING);
    expect(stdout.length).toBe(0);
    expect(code).toBe(1);
  });

  it.skipIf(process.platform === "win32")(
    "says Cushn isn't running when a crashed app left its socket behind",
    async () => {
      const listenAndDie = `require("node:net")
        .createServer()
        .listen(process.argv[1], () => process.kill(process.pid, "SIGKILL"))`;
      try {
        execFileSync(process.execPath, ["-e", listenAndDie, socketPath]);
      } catch {
        // Killed on purpose; the socket file stays.
      }

      const { code, stdout, stderr } = await startRelay(socketPath, secretPath).exit;

      expect(stderr).toBe(NOT_RUNNING);
      expect(stdout.length).toBe(0);
      expect(code).toBe(1);
    },
  );

  it("exits 1 with a message when the app closes the connection after the handshake", async () => {
    server = answeringApp(secret, (socket) => socket.end());
    await listen(server, socketPath);

    const relay = startRelay(socketPath, secretPath);
    const { code, stdout, stderr } = await relay.exit;
    relay.stdin.destroy();

    expect(stderr).toBe("Cushn closed the connection.\n");
    expect(stdout.length).toBe(0);
    expect(code).toBe(1);
  });

  describe("with the app's command", () => {
    let fakeApp: string;
    let log: string;

    beforeEach(() => {
      fakeApp = join(root, "fake-app.mjs");
      writeFileSync(fakeApp, FAKE_APP);
      log = join(root, "launches.log");
    });

    function launches(): { argv: string[]; runAsNode: string | null; cwd: string }[] {
      return readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    it("starts the app once when it isn't running, waits for it, then relays", async () => {
      // `secret` is a crashed app's leftover; the fake app writes its own before it listens.
      const app = [process.execPath, fakeApp, socketPath, secretPath, log, "600", "--background"];
      const payload = randomBytes(64 * 1024);

      const relay = startRelayWith({ ELECTRON_RUN_AS_NODE: "1" }, socketPath, secretPath, ...app);
      relay.stdin.end(payload);
      const { code, stdout, stderr } = await relay.exit;

      expect(stderr).toBe("");
      expect(stdout.equals(payload)).toBe(true);
      expect(code).toBe(0);
      expect(launches()).toEqual([{ argv: app.slice(2), runAsNode: null, cwd: homedir() }]);
    });

    it("connects without starting anything when the app is already running", async () => {
      server = answeringApp(secret, (socket) => socket.pipe(socket));
      await listen(server, socketPath);

      const relay = startRelay(
        socketPath,
        secretPath,
        process.execPath,
        fakeApp,
        "-",
        "-",
        log,
        "0",
      );
      relay.stdin.end("ping\n");
      const { code, stdout } = await relay.exit;

      expect(stdout.toString()).toBe("ping\n");
      expect(code).toBe(0);
      expect(existsSync(log)).toBe(false);
    });

    it("says it couldn't start Cushn when the app's command fails", async () => {
      rmSync(secretPath);
      const missing = join(root, "Cushn.app", "Contents", "MacOS", "Cushn");

      const { code, stdout, stderr } = await startRelay(socketPath, secretPath, missing).exit;

      expect(stderr).toBe(`Couldn't start Cushn: spawn ${missing} ENOENT\n`);
      expect(stdout.length).toBe(0);
      expect(code).toBe(1);
    });
  });

  it("exits 1 with usage when the socket or secret path is missing", async () => {
    for (const args of [[], [socketPath]]) {
      const { code, stderr } = await startRelay(...args).exit;

      expect(stderr).toBe("Usage: relay <socket path> <secret path> [<app> [<arg>...]]\n");
      expect(code).toBe(1);
    }
  });

  it("imports node: builtins only, so it bundles to one file that runs from the packaged app", () => {
    const importsOf = (file: string) =>
      [
        ...readFileSync(join(import.meta.dirname, file), "utf8").matchAll(
          /^import [^;]* from "([^"]+)";$/gm,
        ),
      ].map((match) => match[1]);
    const builtin = (specifier: string) => specifier.startsWith("node:");

    expect(importsOf("index.ts").filter((specifier) => !builtin(specifier))).toEqual([
      "./handshake.ts",
    ]);
    expect(importsOf("handshake.ts").filter((specifier) => !builtin(specifier))).toEqual([]);
  });
});
