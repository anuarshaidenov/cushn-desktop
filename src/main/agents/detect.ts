/**
 * Finds each client Cushn can connect to, its version and its account. Electron-free: `index.ts`
 * passes `nodeDetectorDependencies()`. Child processes get an allowlisted env, so an
 * `ANTHROPIC_API_KEY` / `CODEX_API_KEY` in the app's env never switches the user's auth or billing.
 */
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import type { AgentAccount, AgentKind, AgentStatus } from "@shared/api";

export interface RunResult {
  /** `null` when the process didn't exit on its own: timeout, signal or spawn failure. */
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface DetectorDependencies {
  run(
    file: string,
    args: string[],
    options: { env: Record<string, string>; timeoutMs: number },
  ): Promise<RunResult>;
  /** `null` when the file can't be read. */
  readFile(path: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  homeDir: string;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
}

export type Detection = Pick<AgentStatus, "installation" | "account">;

export interface Detector {
  detect(kind: AgentKind): Promise<Detection>;
  resolveCli(kind: AgentKind): Promise<string | null>;
  /** The allowlisted env with the resolved PATH, for spawning a client CLI. */
  childEnv(): Promise<Record<string, string>>;
}

const RUN_TIMEOUT_MS = 10_000;
const SHELL_TIMEOUT_MS = 5_000;
const PATH_START = "__CUSHN_PATH_START__";
const PATH_END = "__CUSHN_PATH_END__";

const CLIS = {
  "claude-code": { name: "claude", override: "CUSHN_CLAUDE_PATH" },
  codex: { name: "codex", override: "CUSHN_CODEX_PATH" },
} as const;

const ENV_ALLOWLIST = [
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TERM",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "USERPROFILE",
  "USERNAME",
  "APPDATA",
  "LOCALAPPDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "PROGRAMFILES",
  "PROGRAMDATA",
];

export function createDetector(deps: DetectorDependencies): Detector {
  const isWindows = deps.platform === "win32";
  const path = isWindows ? win32 : posix;
  const allowedEnv = new Set(
    isWindows ? ENV_ALLOWLIST.map((name) => name.toUpperCase()) : ENV_ALLOWLIST,
  );
  let searchPath: Promise<string[]> | undefined;

  function getEnv(name: string) {
    if (!isWindows) return deps.env[name];
    const key = Object.keys(deps.env).find((k) => k.toUpperCase() === name.toUpperCase());
    return key === undefined ? undefined : deps.env[key];
  }

  function allowlistedEnv() {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(deps.env)) {
      if (value !== undefined && allowedEnv.has(isWindows ? key.toUpperCase() : key)) {
        env[key] = value;
      }
    }
    return env;
  }

  async function run(file: string, args: string[], env: Record<string, string>, timeoutMs: number) {
    try {
      return await deps.run(file, args, { env, timeoutMs });
    } catch {
      return { code: null, stdout: "", stderr: "" };
    }
  }

  async function loginShellPath(): Promise<string[]> {
    if (isWindows) return [];
    const shell = deps.env.SHELL || (deps.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
    const script = `printf '%s' ${PATH_START}; printenv PATH; printf '%s' ${PATH_END}`;
    const env = { ...allowlistedEnv(), DISABLE_AUTO_UPDATE: "true" };
    const { code, stdout } = await run(shell, ["-ilc", script], env, SHELL_TIMEOUT_MS);
    if (code === null) return [];
    const match = new RegExp(`${PATH_START}([^]*?)${PATH_END}`).exec(stdout);
    return match ? splitPath(match[1].trim()) : [];
  }

  function splitPath(value: string | undefined) {
    return (value ?? "").split(path.delimiter).filter(Boolean);
  }

  function wellKnownDirs() {
    const home = deps.homeDir;
    if (isWindows) {
      const appData = getEnv("APPDATA") ?? path.join(home, "AppData", "Roaming");
      return [path.join(home, ".local", "bin"), path.join(appData, "npm")];
    }
    return [
      path.join(home, ".local", "bin"),
      path.join(home, ".claude", "local"),
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".bun", "bin"),
      path.join(home, ".local", "share", "fnm", "aliases", "default", "bin"),
      path.join(home, "Library", "Application Support", "fnm", "aliases", "default", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/home/linuxbrew/.linuxbrew/bin",
      "/usr/bin",
      "/bin",
    ];
  }

  function resolvedPath() {
    searchPath ??= loginShellPath().then((shellPath) => [
      ...new Set([...shellPath, ...splitPath(getEnv("PATH")), ...wellKnownDirs()]),
    ]);
    return searchPath;
  }

  async function childEnv() {
    return { ...allowlistedEnv(), PATH: (await resolvedPath()).join(path.delimiter) };
  }

  async function firstExisting(candidates: string[]) {
    for (const candidate of candidates) {
      if (await deps.exists(candidate)) return candidate;
    }
    return null;
  }

  async function resolveCli(kind: AgentKind) {
    if (kind === "claude-desktop") return null;
    const { name, override } = CLIS[kind];
    const overridden = getEnv(override);
    if (overridden) return (await deps.exists(overridden)) ? overridden : null;

    const names = isWindows ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name];
    const candidates = (await resolvedPath()).flatMap((dir) =>
      names.map((file) => path.join(dir, file)),
    );
    if (kind === "codex" && deps.platform === "darwin") {
      for (const app of ["/Applications", path.join(deps.homeDir, "Applications")]) {
        const resources = path.join(app, "ChatGPT.app", "Contents", "Resources");
        candidates.push(
          path.join(resources, "codex-cli", "bin", "codex"),
          path.join(resources, "codex"),
        );
      }
    }
    return firstExisting(candidates);
  }

  async function detectCli(
    kind: "claude-code" | "codex",
    statusArgs: string[],
    readAccount: (result: RunResult) => AgentAccount | Promise<AgentAccount>,
  ): Promise<Detection> {
    const cli = await resolveCli(kind);
    if (cli === null) return { installation: null, account: { status: "unknown" } };
    const env = await childEnv();
    const [version, status] = await Promise.all([
      run(cli, ["--version"], env, RUN_TIMEOUT_MS),
      run(cli, statusArgs, env, RUN_TIMEOUT_MS),
    ]);
    return {
      installation: {
        path: cli,
        version: version.code === 0 ? parseVersion(version.stdout) : null,
      },
      account: status.code === null ? { status: "unknown" } : await readAccount(status),
    };
  }

  async function codexAccount({ stdout, stderr }: RunResult): Promise<AgentAccount> {
    const output = `${stdout}\n${stderr}`;
    if (/^Not logged in/m.test(output)) return { status: "signed-out" };
    const method = /^Logged in using (.+)$/m.exec(output)?.[1].trim();
    if (method === undefined) return { status: "unknown" };
    if (method.startsWith("an API key"))
      return { status: "signed-in", email: null, plan: "API key" };
    if (method !== "ChatGPT") return { status: "signed-in", email: null, plan: null };
    const codexHome = getEnv("CODEX_HOME") || path.join(deps.homeDir, ".codex");
    const claims = idTokenClaims(await deps.readFile(path.join(codexHome, "auth.json")));
    return { status: "signed-in", ...chatgptIdentity(claims) };
  }

  async function detectClaudeDesktop(): Promise<Detection> {
    const account = { status: "unknown" } as const;
    if (deps.platform === "darwin") {
      const app = await firstExisting([
        "/Applications/Claude.app",
        path.join(deps.homeDir, "Applications", "Claude.app"),
      ]);
      if (app === null) return { installation: null, account };
      const plist = await deps.readFile(path.join(app, "Contents", "Info.plist"));
      return { installation: { path: app, version: plistVersion(plist) }, account };
    }
    if (isWindows) {
      const localAppData = getEnv("LOCALAPPDATA") ?? path.join(deps.homeDir, "AppData", "Local");
      const app = await firstExisting([path.join(localAppData, "AnthropicClaude")]);
      return { installation: app === null ? null : { path: app, version: null }, account };
    }
    return { installation: null, account };
  }

  return {
    detect(kind) {
      switch (kind) {
        case "claude-code":
          return detectCli(kind, ["auth", "status", "--json"], claudeAccount);
        case "codex":
          return detectCli(kind, ["login", "status"], codexAccount);
        case "claude-desktop":
          return detectClaudeDesktop();
      }
    },
    resolveCli,
    childEnv,
  };
}

function parseVersion(output: string) {
  return /\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?/.exec(output)?.[0] ?? null;
}

function plistVersion(plist: string | null) {
  return (
    /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist ?? "")?.[1] ??
    null
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function claudeAccount({ stdout }: RunResult): AgentAccount {
  let status: unknown;
  try {
    status = JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
  } catch {
    return { status: "unknown" };
  }
  if (typeof status !== "object" || status === null) return { status: "unknown" };
  const { loggedIn, email, subscriptionType, authMethod } = status as Record<string, unknown>;
  if (loggedIn === false) return { status: "signed-out" };
  if (loggedIn !== true) return { status: "unknown" };
  const plan =
    typeof subscriptionType === "string" && subscriptionType
      ? capitalize(subscriptionType)
      : authMethod === "api_key"
        ? "API key"
        : null;
  return { status: "signed-in", email: typeof email === "string" ? email : null, plan };
}

/** The `id_token` payload from Codex's auth.json, decoded but not verified. */
function idTokenClaims(authJson: string | null): Record<string, unknown> {
  try {
    const { tokens } = JSON.parse(authJson ?? "") as { tokens?: { id_token?: unknown } };
    const payload = typeof tokens?.id_token === "string" ? tokens.id_token.split(".")[1] : "";
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims === "object" && claims !== null ? (claims as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function chatgptIdentity(claims: Record<string, unknown>) {
  const auth = asRecord(claims["https://api.openai.com/auth"]);
  const profile = asRecord(claims["https://api.openai.com/profile"]);
  const email = [claims.email, profile.email].find((value) => typeof value === "string");
  const plan = auth.chatgpt_plan_type;
  return {
    email: (email as string | undefined) ?? null,
    plan: typeof plan === "string" && plan ? capitalize(plan) : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export function nodeDetectorDependencies(): DetectorDependencies {
  const platform = process.platform;
  return {
    run(file, args, { env, timeoutMs }) {
      // Node refuses to spawn .cmd/.bat without a shell; the args here are fixed literals.
      const shell = platform === "win32" && /\.(cmd|bat)$/i.test(file);
      return new Promise((resolve) => {
        const child = execFile(
          shell ? `"${file}"` : file,
          args,
          { env, timeout: timeoutMs, shell, windowsHide: true, encoding: "utf8" },
          (error, stdout, stderr) => {
            const code =
              error === null
                ? 0
                : typeof error.code === "number" && !error.killed
                  ? error.code
                  : null;
            resolve({ code, stdout, stderr });
          },
        );
        child.stdin?.end();
      });
    },
    async readFile(path) {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null;
      }
    },
    async exists(path) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    homeDir: homedir(),
    platform,
    env: process.env,
  };
}
