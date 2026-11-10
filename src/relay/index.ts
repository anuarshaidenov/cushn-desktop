/**
 * The relay behind `~/.cushn/bin/cushn-mcp`: an agent launches it as a stdio MCP server. It
 * connects to the app's socket and opens with the handshake (`./handshake.ts`): a fresh nonce out,
 * and back the app's proof that it knows the secret it wrote at launch. Only then does it pipe
 * stdin → the socket and the socket → stdout, so a program holding the app's address gets none of
 * the agent's traffic. Nothing else goes to stdout. When the app isn't running and the launcher
 * passed its command, the relay starts it (without a window: the command carries `--background`)
 * and retries until it listens. Run by the app's own binary with `ELECTRON_RUN_AS_NODE=1`
 * (`src/main/agents/launcher.ts`), so it imports `node:` builtins only, and the handshake, which
 * the bundle inlines.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { helloLine, isProof, randomHex, readLine } from "./handshake.ts";

const NOT_RUNNING_CODES = ["ENOENT", "ECONNREFUSED"];
const NOT_RUNNING = "Cushn isn't running. Open Cushn, then try again.";
const DIDNT_START = "Cushn didn't start in time. Open Cushn, then try again.";
const ANSWER_TIMEOUT_MS = 10_000;
/** A first launch after an update can be slow (migrations, the OS checking the app). */
const START_TIMEOUT_MS = 30_000;
const RETRY_MS = 250;
/** A launch that lost the race to a quitting instance's single-instance lock gets another go. */
const RELAUNCH_MS = 5_000;

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

/** The app writes it on every start and removes it on quit: `undefined` while it isn't running. */
function readSecret(secretPath: string): string | undefined {
  try {
    return readFileSync(secretPath, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** One connection attempt; `notRunning` when no app is there to answer. */
function relay(socketPath: string, secretPath: string, notRunning: () => void): void {
  try {
    if (readSecret(secretPath) === undefined) {
      notRunning();
      return;
    }
  } catch (error) {
    fail(`Couldn't read Cushn's secret: ${(error as Error).message}`);
    return;
  }

  const socket = connect(socketPath);
  let phase: "connecting" | "verifying" | "relaying" = "connecting";
  // The agent hung up first (stdin EOF, or stdout gone), so the socket closing is expected.
  let agentDone = false;

  function refuse(): void {
    fail(
      `Couldn't verify the Cushn app on the other end of ${socketPath}; ` +
        "another program may be using its address. Quit Cushn and open it again.",
    );
    socket.destroy();
  }

  function pipeStdio(): void {
    phase = "relaying";
    process.stdin.once("end", () => (agentDone = true));
    process.stdin.pipe(socket);
    socket.pipe(process.stdout);
    process.stdout.on("error", () => {
      agentDone = true;
      socket.destroy();
    });
  }

  function verify(secret: string): void {
    const nonce = randomHex();
    socket.write(helloLine(nonce));
    readLine(socket, ANSWER_TIMEOUT_MS).then(
      (answer) => (isProof(answer, secret, nonce) ? pipeStdio() : refuse()),
      refuse,
    );
  }

  socket.once("connect", () => {
    phase = "verifying";
    // Read again: an app that started since the first read wrote a new secret before listening.
    let secret: string | undefined;
    try {
      secret = readSecret(secretPath);
    } catch {
      // Unreadable now: `refuse` below says the app can't be verified.
    }
    if (secret === undefined) refuse();
    else verify(secret);
  });

  socket.on("error", (error: NodeJS.ErrnoException) => {
    if (phase === "connecting") {
      if (NOT_RUNNING_CODES.includes(error.code ?? "")) notRunning();
      else fail(`Couldn't connect to Cushn: ${error.message}`);
    } else if (phase === "relaying") {
      fail(`Lost the connection to Cushn: ${error.message}`);
    }
    // While verifying, `refuse` reports it.
  });

  socket.once("close", (hadError) => {
    // A failed connect may be retried, so stdin stays open for the next attempt.
    if (phase === "connecting") return;
    process.stdin.unpipe(socket);
    process.stdin.destroy();
    if (phase === "relaying" && !hadError && !agentDone) fail("Cushn closed the connection.");
  });
}

/**
 * Starts the app as its own process, detached so it outlives this relay. The app runs as itself,
 * not as Node, so `ELECTRON_RUN_AS_NODE` stays behind.
 */
function launch([command, ...args]: string[], onError: (error: Error) => void): void {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, args, { cwd: homedir(), detached: true, env, stdio: "ignore" });
  child.once("error", onError);
  child.unref();
}

/**
 * Relays to the running app. Without `app`, an app that isn't running is an error; with it, the
 * relay starts the app and retries until it answers or `START_TIMEOUT_MS` passes. Launching twice
 * is harmless: the app's single-instance lock sends the second launch to the first.
 */
function start(socketPath: string, secretPath: string, app: string[]): void {
  let firstLaunch: number | undefined;
  let lastLaunch = 0;
  let launchError: Error | undefined;

  function notRunning(): void {
    if (app.length === 0) return fail(NOT_RUNNING);
    if (launchError) return fail(`Couldn't start Cushn: ${launchError.message}`);
    const now = Date.now();
    firstLaunch ??= now;
    if (now - firstLaunch >= START_TIMEOUT_MS) return fail(DIDNT_START);
    if (now - lastLaunch >= RELAUNCH_MS) {
      lastLaunch = now;
      launch(app, (error) => (launchError = error));
    }
    setTimeout(() => relay(socketPath, secretPath, notRunning), RETRY_MS);
  }

  relay(socketPath, secretPath, notRunning);
}

const [socketPath, secretPath, ...app] = process.argv.slice(2);
if (socketPath && secretPath) start(socketPath, secretPath, app);
else fail("Usage: relay <socket path> <secret path> [<app> [<arg>...]]");
