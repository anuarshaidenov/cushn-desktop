import { describe, expect, it } from "vitest";
import { createDetector, type DetectorDependencies, type RunResult } from "./detect";

const HOME = "/Users/me";
const SHELL_PATH = `${HOME}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin`;
const CLAUDE = `${HOME}/.local/bin/claude`;
// ChatGPT 26.1027 (com.openai.codex) bundles codex-cli 0.166 here; earlier builds at `Resources/codex`.
const CHATGPT_CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";
const LEGACY_CHATGPT_CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex";

// Real outputs, Claude Code 2.1.314 and codex-cli 0.153.1 on macOS (2026-10-30), redacted.
const CLAUDE_VERSION = { code: 0, stdout: "2.1.314 (Claude Code)\n", stderr: "" };
const CLAUDE_SIGNED_IN = {
  code: 0,
  stdout: `{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/Users/me/.claude/projects",
  "configDirectory": "/Users/me/.claude",
  "email": "user@example.com",
  "orgId": "00000000-0000-0000-0000-000000000000",
  "orgName": "Example LLC",
  "subscriptionType": "team"
}
`,
  stderr: "",
};
const CLAUDE_SIGNED_OUT = {
  code: 1,
  stdout: `{
  "loggedIn": false,
  "authMethod": "none",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/Users/me/.claude/projects",
  "configDirectory": "/Users/me/.claude"
}
`,
  stderr: "",
};
const CLAUDE_API_KEY = {
  code: 0,
  stdout: `{
  "loggedIn": true,
  "authMethod": "api_key",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  "projectsDirectory": "/Users/me/.claude/projects",
  "configDirectory": "/Users/me/.claude",
  "apiKeySource": "ANTHROPIC_API_KEY"
}
`,
  stderr: "",
};
const CODEX_VERSION = { code: 0, stdout: "codex-cli 0.153.1\n", stderr: "" };
const CODEX_SIGNED_OUT = { code: 1, stdout: "", stderr: "Not logged in\n" };
const CODEX_CHATGPT = { code: 0, stdout: "", stderr: "Logged in using ChatGPT\n" };
const CODEX_API_KEY = { code: 0, stdout: "", stderr: "Logged in using an API key - ***\n" };
const GARBAGE = { code: 0, stdout: "Segmentation fault\n<html>", stderr: "" };

type Reply = RunResult | "timeout" | "throw";

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function chatgptAuthJson(claims: Record<string, unknown>) {
  const idToken = [base64url({ alg: "RS256", typ: "JWT" }), base64url(claims), "signature"].join(
    ".",
  );
  return JSON.stringify({
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: idToken,
      access_token: "secret-access-token",
      refresh_token: "secret-refresh-token",
      account_id: "acc-1",
    },
    last_refresh: "2026-10-30T00:00:00Z",
  });
}

const CHATGPT_CLAIMS = {
  email: "user@example.com",
  "https://api.openai.com/auth": { chatgpt_plan_type: "plus", chatgpt_account_id: "acc-1" },
  "https://api.openai.com/profile": { email: "user@example.com", email_verified: true },
};

interface Setup {
  platform?: NodeJS.Platform;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  files?: Record<string, string>;
  paths?: string[];
  shell?: Reply;
  replies?: Record<string, Reply>;
}

function setup({
  platform = "darwin",
  homeDir = HOME,
  env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME, SHELL: "/bin/zsh" },
  files = {},
  paths = [],
  shell = {
    code: 0,
    stdout: `Last login: today\n__CUSHN_PATH_START__${SHELL_PATH}\n__CUSHN_PATH_END__`,
    stderr: "",
  },
  replies = {},
}: Setup = {}) {
  const calls: { file: string; args: string[]; env: Record<string, string>; timeoutMs: number }[] =
    [];
  const deps: DetectorDependencies = {
    async run(file, args, options) {
      calls.push({ file, args, ...options });
      const reply = args[0] === "-ilc" ? shell : replies[[file, ...args].join(" ")];
      if (reply === "throw") throw new Error("spawn failed");
      if (reply === "timeout" || reply === undefined) return { code: null, stdout: "", stderr: "" };
      return reply;
    },
    async readFile(path) {
      return files[path] ?? null;
    },
    async exists(path) {
      return paths.includes(path) || path in files;
    },
    homeDir,
    platform,
    env,
  };
  return { detector: createDetector(deps), calls };
}

describe("resolveCli", () => {
  it("searches the login shell's PATH, which a GUI app doesn't inherit", async () => {
    const { detector, calls } = setup({ paths: [CLAUDE] });

    expect(await detector.resolveCli("claude-code")).toBe(CLAUDE);
    expect(calls[0]).toMatchObject({ file: "/bin/zsh", args: ["-ilc", expect.any(String)] });
  });

  it("asks the login shell once", async () => {
    const { detector, calls } = setup({ paths: [CLAUDE] });

    await detector.resolveCli("claude-code");
    await detector.resolveCli("codex");
    await detector.detect("claude-code");

    expect(calls.filter((call) => call.args[0] === "-ilc")).toHaveLength(1);
  });

  it("falls back to well-known install dirs when the shell times out", async () => {
    const { detector } = setup({ shell: "timeout", paths: [`${HOME}/.claude/local/claude`] });

    expect(await detector.resolveCli("claude-code")).toBe(`${HOME}/.claude/local/claude`);
  });

  it("falls back to well-known install dirs when the shell prints no markers", async () => {
    const { detector } = setup({ shell: GARBAGE, paths: ["/opt/homebrew/bin/codex"] });

    expect(await detector.resolveCli("codex")).toBe("/opt/homebrew/bin/codex");
  });

  it("prefers the login shell's PATH order over the fallbacks", async () => {
    const { detector } = setup({ paths: ["/opt/homebrew/bin/claude", CLAUDE] });

    expect(await detector.resolveCli("claude-code")).toBe(CLAUDE);
  });

  it("finds the Codex binary bundled in ChatGPT.app", async () => {
    const { detector } = setup({ paths: [CHATGPT_CODEX] });

    expect(await detector.resolveCli("codex")).toBe(CHATGPT_CODEX);
  });

  it("finds Codex in an older ChatGPT.app layout, or one in ~/Applications", async () => {
    const legacy = setup({ paths: [LEGACY_CHATGPT_CODEX] });
    const user = `${HOME}/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`;
    const perUser = setup({ paths: [user] });

    expect(await legacy.detector.resolveCli("codex")).toBe(LEGACY_CHATGPT_CODEX);
    expect(await perUser.detector.resolveCli("codex")).toBe(user);
  });

  it("prefers a codex on PATH over the one in ChatGPT.app", async () => {
    const { detector } = setup({ paths: [CHATGPT_CODEX, "/opt/homebrew/bin/codex"] });

    expect(await detector.resolveCli("codex")).toBe("/opt/homebrew/bin/codex");
  });

  it("honours the override env vars", async () => {
    const { detector } = setup({
      env: { HOME, CUSHN_CLAUDE_PATH: "/opt/claude", CUSHN_CODEX_PATH: "/opt/codex" },
      paths: [CLAUDE, "/opt/claude", "/opt/codex"],
    });

    expect(await detector.resolveCli("claude-code")).toBe("/opt/claude");
    expect(await detector.resolveCli("codex")).toBe("/opt/codex");
  });

  it("doesn't search further when the override doesn't exist", async () => {
    const { detector } = setup({ env: { HOME, CUSHN_CLAUDE_PATH: "/nope" }, paths: [CLAUDE] });

    expect(await detector.resolveCli("claude-code")).toBeNull();
  });

  it("returns null when nothing is found", async () => {
    const { detector } = setup();

    expect(await detector.resolveCli("claude-code")).toBeNull();
    expect(await detector.resolveCli("codex")).toBeNull();
  });

  it("has no CLI for Claude Desktop", async () => {
    const { detector } = setup({ paths: [CLAUDE, "/Applications/Claude.app"] });

    expect(await detector.resolveCli("claude-desktop")).toBeNull();
  });

  it("on Windows, searches Path for .exe and .cmd without a login shell", async () => {
    const { detector, calls } = setup({
      platform: "win32",
      homeDir: "C:\\Users\\me",
      env: { Path: "C:\\Windows\\system32;C:\\Users\\me\\AppData\\Roaming\\npm" },
      paths: [
        "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
        "C:\\Users\\me\\.local\\bin\\claude.exe",
      ],
    });

    expect(await detector.resolveCli("codex")).toBe(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
    );
    expect(await detector.resolveCli("claude-code")).toBe("C:\\Users\\me\\.local\\bin\\claude.exe");
    expect(calls).toEqual([]);
  });
});

describe("detect claude-code", () => {
  const replies = {
    [`${CLAUDE} --version`]: CLAUDE_VERSION,
    [`${CLAUDE} auth status --json`]: CLAUDE_SIGNED_IN,
  };

  it("reports not installed", async () => {
    const { detector } = setup();

    expect(await detector.detect("claude-code")).toEqual({
      installation: null,
      account: { status: "unknown" },
    });
  });

  it("reads the version and the signed-in account", async () => {
    const { detector } = setup({ paths: [CLAUDE], replies });

    expect(await detector.detect("claude-code")).toEqual({
      installation: { path: CLAUDE, version: "2.1.314" },
      account: { status: "signed-in", email: "user@example.com", plan: "Team" },
    });
  });

  it("reports signed out (exit 1 with JSON)", async () => {
    const { detector } = setup({
      paths: [CLAUDE],
      replies: { ...replies, [`${CLAUDE} auth status --json`]: CLAUDE_SIGNED_OUT },
    });

    expect((await detector.detect("claude-code")).account).toEqual({ status: "signed-out" });
  });

  it("labels an API key login", async () => {
    const { detector } = setup({
      paths: [CLAUDE],
      replies: { ...replies, [`${CLAUDE} auth status --json`]: CLAUDE_API_KEY },
    });

    expect((await detector.detect("claude-code")).account).toEqual({
      status: "signed-in",
      email: null,
      plan: "API key",
    });
  });

  it("maps garbage output to an unknown account and version", async () => {
    const { detector } = setup({
      paths: [CLAUDE],
      replies: {
        [`${CLAUDE} --version`]: GARBAGE,
        [`${CLAUDE} auth status --json`]: GARBAGE,
      },
    });

    expect(await detector.detect("claude-code")).toEqual({
      installation: { path: CLAUDE, version: null },
      account: { status: "unknown" },
    });
  });

  it("maps a timeout to unknown", async () => {
    const { detector, calls } = setup({
      paths: [CLAUDE],
      replies: { [`${CLAUDE} --version`]: "timeout", [`${CLAUDE} auth status --json`]: "timeout" },
    });

    expect(await detector.detect("claude-code")).toEqual({
      installation: { path: CLAUDE, version: null },
      account: { status: "unknown" },
    });
    expect(calls.filter((call) => call.file === CLAUDE).map((call) => call.timeoutMs)).toEqual([
      10_000, 10_000,
    ]);
  });

  it("maps a failed spawn to unknown", async () => {
    const { detector } = setup({
      paths: [CLAUDE],
      replies: { [`${CLAUDE} --version`]: "throw", [`${CLAUDE} auth status --json`]: "throw" },
    });

    expect(await detector.detect("claude-code")).toEqual({
      installation: { path: CLAUDE, version: null },
      account: { status: "unknown" },
    });
  });
});

describe("detect codex", () => {
  const CODEX = "/opt/homebrew/bin/codex";
  const AUTH_JSON = `${HOME}/.codex/auth.json`;
  const withStatus = (status: Reply) => ({
    [`${CODEX} --version`]: CODEX_VERSION,
    [`${CODEX} login status`]: status,
  });

  it("reports signed out (stderr, exit 1)", async () => {
    const { detector } = setup({ paths: [CODEX], replies: withStatus(CODEX_SIGNED_OUT) });

    expect(await detector.detect("codex")).toEqual({
      installation: { path: CODEX, version: "0.153.1" },
      account: { status: "signed-out" },
    });
  });

  it("reads the email and plan from the ChatGPT id token, and nothing else", async () => {
    const { detector } = setup({
      paths: [CODEX],
      replies: withStatus(CODEX_CHATGPT),
      files: { [AUTH_JSON]: chatgptAuthJson(CHATGPT_CLAIMS) },
    });

    const { account } = await detector.detect("codex");

    expect(account).toEqual({ status: "signed-in", email: "user@example.com", plan: "Plus" });
    expect(JSON.stringify(account)).not.toMatch(/secret|acc-1/);
  });

  it("falls back to the profile claim for the email", async () => {
    const { detector } = setup({
      paths: [CODEX],
      replies: withStatus(CODEX_CHATGPT),
      files: {
        [AUTH_JSON]: chatgptAuthJson({
          "https://api.openai.com/profile": { email: "user@example.com" },
        }),
      },
    });

    expect((await detector.detect("codex")).account).toEqual({
      status: "signed-in",
      email: "user@example.com",
      plan: null,
    });
  });

  it("reads auth.json from CODEX_HOME", async () => {
    const { detector } = setup({
      env: { HOME, CODEX_HOME: "/data/codex" },
      paths: [CODEX],
      replies: withStatus(CODEX_CHATGPT),
      files: { "/data/codex/auth.json": chatgptAuthJson(CHATGPT_CLAIMS) },
    });

    expect((await detector.detect("codex")).account).toMatchObject({ email: "user@example.com" });
  });

  it.each([
    ["missing", undefined],
    ["not JSON", "{oops"],
    ["a malformed token", JSON.stringify({ tokens: { id_token: "not.a-jwt" } })],
  ])("stays signed in without details when auth.json is %s", async (_, content) => {
    const { detector } = setup({
      paths: [CODEX],
      replies: withStatus(CODEX_CHATGPT),
      files: content === undefined ? {} : { [AUTH_JSON]: content },
    });

    expect((await detector.detect("codex")).account).toEqual({
      status: "signed-in",
      email: null,
      plan: null,
    });
  });

  it("labels an API key login without reading auth.json", async () => {
    const { detector } = setup({
      paths: [CODEX],
      replies: withStatus(CODEX_API_KEY),
      files: { [AUTH_JSON]: chatgptAuthJson(CHATGPT_CLAIMS) },
    });

    expect((await detector.detect("codex")).account).toEqual({
      status: "signed-in",
      email: null,
      plan: "API key",
    });
  });

  it("maps garbage and timeouts to unknown", async () => {
    for (const status of [GARBAGE, "timeout" as const]) {
      const { detector } = setup({ paths: [CODEX], replies: withStatus(status) });
      expect((await detector.detect("codex")).account).toEqual({ status: "unknown" });
    }
  });
});

describe("detect claude-desktop", () => {
  const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>CFBundleShortVersionString</key>
    <string>1.2.3</string>
  </dict>
</plist>`;

  it("finds Claude.app in /Applications with its version", async () => {
    const { detector } = setup({
      paths: ["/Applications/Claude.app"],
      files: { "/Applications/Claude.app/Contents/Info.plist": PLIST },
    });

    expect(await detector.detect("claude-desktop")).toEqual({
      installation: { path: "/Applications/Claude.app", version: "1.2.3" },
      account: { status: "unknown" },
    });
  });

  it("finds Claude.app in ~/Applications, without a readable plist", async () => {
    const { detector } = setup({ paths: [`${HOME}/Applications/Claude.app`] });

    expect(await detector.detect("claude-desktop")).toEqual({
      installation: { path: `${HOME}/Applications/Claude.app`, version: null },
      account: { status: "unknown" },
    });
  });

  it("finds the Windows install under LOCALAPPDATA", async () => {
    const { detector } = setup({
      platform: "win32",
      homeDir: "C:\\Users\\me",
      env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
      paths: ["C:\\Users\\me\\AppData\\Local\\AnthropicClaude"],
    });

    expect((await detector.detect("claude-desktop")).installation).toEqual({
      path: "C:\\Users\\me\\AppData\\Local\\AnthropicClaude",
      version: null,
    });
  });

  it("reports not installed", async () => {
    for (const platform of ["darwin", "linux"] as const) {
      const { detector } = setup({ platform, paths: ["/usr/bin/claude"] });
      expect(await detector.detect("claude-desktop")).toEqual({
        installation: null,
        account: { status: "unknown" },
      });
    }
  });
});

describe("child env", () => {
  it("passes an allowlist with the resolved PATH, never API keys", async () => {
    const { detector, calls } = setup({
      env: {
        PATH: "/usr/bin:/bin",
        HOME,
        USER: "me",
        LANG: "en_US.UTF-8",
        SHELL: "/bin/zsh",
        TMPDIR: "/tmp/",
        CODEX_HOME: "/data/codex",
        ANTHROPIC_API_KEY: "sk-ant-secret",
        OPENAI_API_KEY: "sk-secret",
        CODEX_API_KEY: "sk-secret",
        CLAUDE_CODE_OAUTH_TOKEN: "secret",
        CLAUDECODE: "1",
        AWS_SECRET_ACCESS_KEY: "secret",
      },
      paths: [CLAUDE],
      replies: {
        [`${CLAUDE} --version`]: CLAUDE_VERSION,
        [`${CLAUDE} auth status --json`]: CLAUDE_SIGNED_IN,
      },
    });

    await detector.detect("claude-code");

    for (const call of calls) expect(JSON.stringify(call.env)).not.toMatch(/secret|CLAUDECODE/);
    const env = calls.find((call) => call.file === CLAUDE)!.env;
    expect(env).toEqual({
      PATH: expect.any(String),
      HOME,
      USER: "me",
      LANG: "en_US.UTF-8",
      SHELL: "/bin/zsh",
      TMPDIR: "/tmp/",
      CODEX_HOME: "/data/codex",
    });
    expect(env.PATH.split(":").slice(0, 4)).toEqual(SHELL_PATH.split(":"));
    expect(env.PATH.split(":")).toContain(`${HOME}/.claude/local`);
    expect(await detector.childEnv()).toEqual(env);
  });
});
