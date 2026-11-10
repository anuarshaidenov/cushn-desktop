// Connect and Disconnect against a real temp home. `claude` and `codex` are fakes that print and
// write what claude 2.1.314 and codex-cli 0.153.1 did in sandboxed runs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CushnError } from "@shared/errors";
import {
  type ConnectionsDependencies,
  type ConnectionsFs,
  MANIFEST_FILE,
  clientPaths,
  createConnections,
} from "./connections";
import { CUSHN_SKILL } from "./skill";

type Run = ConnectionsDependencies["run"];
type RunResult = Awaited<ReturnType<Run>>;

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const CLAUDE = "/Users/me/.local/bin/claude";
const CODEX = "/Applications/ChatGPT.app/Contents/Resources/codex";
const CODEX_GET = ["mcp", "get", "cushn", "--json"];
const CODEX_BAD_TOML = [
  "Error: failed to load bootstrap configuration",
  "",
  "Caused by:",
  "    0: /Users/me/.codex/config.toml:1:9: string values must be quoted, expected literal string",
  "    1: TOML parse error at line 1, column 9",
  "",
].join("\n");

let root: string;
let home: string;
let userData: string;
let launcher: string;

const claudeJson = () => join(home, ".claude.json");
const claudeSkill = () => join(home, ".claude", "skills", "cushn", "SKILL.md");
const codexConfig = () => join(home, ".codex", "config.toml");
const codexSkill = () => join(home, ".codex", "skills", "cushn", "SKILL.md");
const desktopDir = () => join(home, "Library", "Application Support", "Claude");
const desktopConfig = () => join(desktopDir(), "claude_desktop_config.json");
const manifestPath = () => join(userData, MANIFEST_FILE);

beforeEach(async () => {
  root = await fsp.realpath(await fsp.mkdtemp(join(tmpdir(), "cushn-connections-")));
  home = join(root, "home");
  userData = join(root, "userData");
  launcher = join(home, ".cushn", "bin", "cushn-mcp");
  await fsp.mkdir(home);
  await fsp.mkdir(userData);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(root, { recursive: true, force: true });
});

const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: "" });
const failed = (stderr: string): RunResult => ({ code: 1, stdout: "", stderr });

/** `claude mcp add|remove --scope user cushn`: Claude rewrites its JSON, no final newline. */
function fakeClaude(args: string[], env: Record<string, string>): RunResult {
  const file = join(env.CLAUDE_CONFIG_DIR ?? env.HOME, ".claude.json");
  const config = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const servers = (config.mcpServers ??= {});
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(config, null, 2));
  };
  if (args[1] === "add") {
    if (servers.cushn) return failed("MCP server cushn already exists in user config\n");
    servers.cushn = { type: "stdio", command: args.at(-1), args: [], env: {} };
    save();
    return ok(`Added stdio MCP server cushn with command: ${args.at(-1)}  to user config\n`);
  }
  if (args[1] === "remove") {
    if (!servers.cushn) return failed('No MCP server named "cushn" in user scope\n');
    delete servers.cushn;
    save();
    return ok("Removed MCP server cushn from user config\n");
  }
  throw new Error(`unexpected: claude ${args.join(" ")}`);
}

/** `codex mcp get cushn --json`, reading just enough TOML for these tests. */
function fakeCodex(args: string[], env: Record<string, string>): RunResult {
  if (args.join(" ") !== CODEX_GET.join(" "))
    throw new Error(`unexpected: codex ${args.join(" ")}`);
  const file = join(env.CODEX_HOME ?? join(env.HOME, ".codex"), "config.toml");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const match = /^\[mcp_servers\.cushn\]\r?\ncommand = (?:("(?:[^"\\]|\\.)*")|'([^']*)')/m.exec(
    text,
  );
  if (!match) return failed("Error: No MCP server named 'cushn' found.\n");
  const command = match[1] === undefined ? match[2] : JSON.parse(match[1]);
  const transport = { type: "stdio", command, args: [], env: null, env_vars: [], cwd: null };
  return ok(JSON.stringify({ name: "cushn", enabled: true, transport }, null, 2));
}

function setup({
  env = {},
  platform = "darwin",
  fs = fsp,
}: { env?: Record<string, string>; platform?: NodeJS.Platform; fs?: ConnectionsFs } = {}) {
  const run = vi.fn<Run>(async (file, args, options) => {
    if (basename(file) === "claude") return fakeClaude(args, options.env);
    if (file === CODEX) return fakeCodex(args, options.env);
    return { code: null, stdout: "", stderr: "" };
  });
  const childEnv = { PATH: "/usr/bin:/bin", HOME: home, ...env };
  const connections = createConnections({
    fs,
    run,
    childEnv: async () => ({ ...childEnv }),
    homeDir: home,
    platform,
    userData,
    now: () => NOW,
  });
  return { run, childEnv, connections };
}

const read = (path: string) => fsp.readFile(path, "utf8");
const lines = (...text: string[]) => `${text.join("\n")}\n`;
const exists = (path: string) =>
  fsp.access(path).then(
    () => true,
    () => false,
  );
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const manifest = async () => JSON.parse(await read(manifestPath()));

async function write(path: string, text: string) {
  await fsp.mkdir(dirname(path), { recursive: true });
  await fsp.writeFile(path, text);
}

async function rejection(promise: Promise<unknown>): Promise<CushnError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(CushnError);
  return error as CushnError;
}

describe("claude-code", () => {
  const connect = (connections: ReturnType<typeof setup>["connections"]) =>
    connections.connect("claude-code", { launcherPath: launcher, cliPath: CLAUDE });

  it("registers with `claude mcp add --scope user`, installs the skill, records both", async () => {
    const { run, childEnv, connections } = setup();

    await connect(connections);

    expect(run.mock.calls).toEqual([
      [
        CLAUDE,
        ["mcp", "add", "--scope", "user", "cushn", "--", launcher],
        { env: childEnv, timeoutMs: expect.any(Number) },
      ],
    ]);
    expect(JSON.parse(await read(claudeJson())).mcpServers.cushn).toEqual({
      type: "stdio",
      command: launcher,
      args: [],
      env: {},
    });
    expect(await read(claudeSkill())).toBe(CUSHN_SKILL);
    expect(await connections.isConnected("claude-code")).toBe(true);
    expect(await manifest()).toEqual({
      version: 1,
      connections: {
        "claude-code": {
          connectedAt: "2026-10-30T12:00:00.000Z",
          launcherPath: launcher,
          registration: {
            type: "claude-cli",
            cli: CLAUDE,
            env: {},
            add: ["mcp", "add", "--scope", "user", "cushn", "--", launcher],
            remove: ["mcp", "remove", "--scope", "user", "cushn"],
            configFile: claudeJson(),
          },
          files: [{ path: claudeSkill(), sha256: sha256(CUSHN_SKILL) }],
          dirs: [
            join(home, ".claude"),
            join(home, ".claude", "skills"),
            join(home, ".claude", "skills", "cushn"),
          ],
        },
      },
    });
    expect(await fsp.readdir(userData)).toEqual([MANIFEST_FILE]);
  });

  it("disconnects with `claude mcp remove --scope user`, leaving files as they were", async () => {
    const before = JSON.stringify(
      { numStartups: 3, mcpServers: { moonjar: { type: "stdio", command: "/m" } }, projects: {} },
      null,
      2,
    );
    await write(claudeJson(), before);
    await fsp.mkdir(join(home, ".claude", "backups"), { recursive: true });
    const { run, connections } = setup();
    await connect(connections);

    await connections.disconnect("claude-code");

    expect(run).toHaveBeenLastCalledWith(
      CLAUDE,
      ["mcp", "remove", "--scope", "user", "cushn"],
      expect.anything(),
    );
    expect(await read(claudeJson())).toBe(before);
    expect(await fsp.readdir(join(home, ".claude"))).toEqual(["backups"]);
    expect(await connections.isConnected("claude-code")).toBe(false);
    expect(await manifest()).toEqual({ version: 1, connections: {} });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("refuses a cushn server it has no record of, even one on its own launcher", async () => {
    const before = JSON.stringify({ mcpServers: { cushn: { type: "stdio", command: launcher } } });
    await write(claudeJson(), before);
    const { run, connections } = setup();

    expect(await rejection(connect(connections))).toMatchObject({
      code: "CONFLICT",
      message:
        'Claude Code already has an MCP server named "cushn" that Cushn didn\'t add. Remove it ' +
        "with `claude mcp remove --scope user cushn`, then connect again.",
    });
    expect(run).not.toHaveBeenCalled();
    expect(await read(claudeJson())).toBe(before);
    expect(await exists(join(home, ".claude"))).toBe(false);
    expect(await exists(manifestPath())).toBe(false);
    expect(await connections.isConnected("claude-code")).toBe(false);
  });

  it.each([
    ["claude-code", "Claude Code isn't installed."],
    ["codex", "Codex isn't installed."],
  ] as const)("answers NOT_FOUND for %s without its CLI", async (kind, message) => {
    const { run, connections } = setup();

    expect(
      await rejection(connections.connect(kind, { launcherPath: launcher, cliPath: null })),
    ).toMatchObject({ code: "NOT_FOUND", message });
    expect(run).not.toHaveBeenCalled();
  });

  it("leaves a .claude.json that isn't JSON alone, without running claude", async () => {
    await write(claudeJson(), "{ broken");
    const { run, connections } = setup();

    expect(await rejection(connect(connections))).toMatchObject({
      code: "INTERNAL",
      message: expect.stringContaining(`${claudeJson()} isn't valid JSON`),
    });
    expect(run).not.toHaveBeenCalled();
    expect(await read(claudeJson())).toBe("{ broken");
  });

  it("is disconnected once the user removes the server, and connects again cleanly", async () => {
    const { connections } = setup();
    await connect(connections);

    fakeClaude(["mcp", "remove", "--scope", "user", "cushn"], { HOME: home });
    expect(await connections.isConnected("claude-code")).toBe(false);

    await connect(connections);
    expect(await connections.isConnected("claude-code")).toBe(true);
    expect(await read(claudeSkill())).toBe(CUSHN_SKILL);
    expect((await manifest()).connections["claude-code"].files).toHaveLength(1);
  });

  it("connects once when asked twice at the same time", async () => {
    const { run, connections } = setup();

    await Promise.all([connect(connections), connect(connections)]);

    expect(run).toHaveBeenCalledOnce();
    expect(await connections.isConnected("claude-code")).toBe(true);
  });

  it("keeps a server the user changed, and logs what it kept", async () => {
    const { run, connections } = setup();
    await connect(connections);
    const config = JSON.parse(await read(claudeJson()));
    config.mcpServers.cushn.args = ["--debug"];
    await write(claudeJson(), JSON.stringify(config, null, 2));

    await connections.disconnect("claude-code");

    expect(run).toHaveBeenCalledOnce();
    expect(JSON.parse(await read(claudeJson())).mcpServers.cushn.args).toEqual(["--debug"]);
    expect(await exists(join(home, ".claude"))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Claude Code"), [
      `${claudeJson()} (mcpServers.cushn)`,
    ]);
    expect(await manifest()).toEqual({ version: 1, connections: {} });
  });

  it("keeps a skill the user edited, and the folders it sits in", async () => {
    const { connections } = setup();
    await connect(connections);
    await write(claudeSkill(), `${CUSHN_SKILL}\nAlways answer in euros.\n`);

    await connections.disconnect("claude-code");

    expect(await read(claudeSkill())).toBe(`${CUSHN_SKILL}\nAlways answer in euros.\n`);
    expect(JSON.parse(await read(claudeJson())).mcpServers).toEqual({});
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), [claudeSkill()]);
  });

  it("leaves a cushn skill it didn't write, and never records it", async () => {
    await write(claudeSkill(), "my own cushn notes");
    const { connections } = setup();

    await connect(connections);
    expect(await read(claudeSkill())).toBe("my own cushn notes");
    expect((await manifest()).connections["claude-code"]).toMatchObject({ files: [], dirs: [] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(claudeSkill()));

    await connections.disconnect("claude-code");
    expect(await read(claudeSkill())).toBe("my own cushn notes");
  });

  it("follows CLAUDE_CONFIG_DIR, and disconnects there after it's unset", async () => {
    const configDir = join(root, "claude-config");
    await connect(setup({ env: { CLAUDE_CONFIG_DIR: configDir } }).connections);

    expect(JSON.parse(await read(join(configDir, ".claude.json"))).mcpServers.cushn).toMatchObject({
      command: launcher,
    });
    expect(await read(join(configDir, "skills", "cushn", "SKILL.md"))).toBe(CUSHN_SKILL);
    expect(await exists(claudeJson())).toBe(false);
    expect(await exists(join(home, ".claude"))).toBe(false);

    const later = setup();
    expect(await later.connections.isConnected("claude-code")).toBe(true);
    await later.connections.disconnect("claude-code");

    expect(later.run).toHaveBeenCalledWith(CLAUDE, ["mcp", "remove", "--scope", "user", "cushn"], {
      env: expect.objectContaining({ CLAUDE_CONFIG_DIR: configDir }),
      timeoutMs: expect.any(Number),
    });
    expect(JSON.parse(await read(join(configDir, ".claude.json"))).mcpServers).toEqual({});
    expect(await exists(join(configDir, "skills"))).toBe(false);
  });

  it("disconnects with the claude it's given, when Claude Code moved", async () => {
    const { run, connections } = setup();
    await connect(connections);

    await connections.disconnect("claude-code", { cliPath: "/opt/homebrew/bin/claude" });

    expect(run).toHaveBeenLastCalledWith(
      "/opt/homebrew/bin/claude",
      ["mcp", "remove", "--scope", "user", "cushn"],
      expect.anything(),
    );
    expect(await connections.isConnected("claude-code")).toBe(false);
  });

  it("undoes nothing and keeps the record when claude can't be run to disconnect", async () => {
    const { connections } = setup();
    await connect(connections);

    expect(
      await rejection(connections.disconnect("claude-code", { cliPath: "/gone/claude-old" })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(await read(claudeSkill())).toBe(CUSHN_SKILL);
    expect(await connections.isConnected("claude-code")).toBe(true);
  });

  it("writes nothing it keeps when `claude mcp add` fails", async () => {
    const { run, connections } = setup();
    run.mockResolvedValueOnce(failed("Error: EACCES: permission denied, open '.claude.json'\n"));

    expect(await rejection(connect(connections))).toMatchObject({
      code: "INTERNAL",
      message:
        "Claude Code couldn't add Cushn's server: EACCES: permission denied, open '.claude.json'",
    });
    expect(await exists(join(home, ".claude"))).toBe(false);
    expect(await manifest()).toEqual({ version: 1, connections: {} });
  });

  it("removes the server again when the skill can't be written", async () => {
    const { run, connections } = setup({ fs: failingSkillWrites() });

    expect(await rejection(connect(connections))).toMatchObject({
      code: "INTERNAL",
      message: expect.stringContaining("Couldn't connect Claude Code: EACCES"),
    });
    expect(run).toHaveBeenLastCalledWith(
      CLAUDE,
      ["mcp", "remove", "--scope", "user", "cushn"],
      expect.anything(),
    );
    expect(JSON.parse(await read(claudeJson())).mcpServers).toEqual({});
    expect(await exists(join(home, ".claude"))).toBe(false);
    expect(await manifest()).toEqual({ version: 1, connections: {} });
  });

  it("keeps the record when that rollback fails too, so Disconnect can finish it", async () => {
    const failing = setup({ fs: failingSkillWrites() });
    failing.run.mockImplementation(async (_file, args, options) =>
      args[1] === "remove" ? failed("Error: config is locked\n") : fakeClaude(args, options.env),
    );

    await rejection(connect(failing.connections));
    expect(await failing.connections.isConnected("claude-code")).toBe(true);
    expect(console.error).toHaveBeenCalled();

    const { connections } = setup();
    await connections.disconnect("claude-code");
    expect(JSON.parse(await read(claudeJson())).mcpServers).toEqual({});
    expect(await exists(join(home, ".claude"))).toBe(false);
    expect(await manifest()).toEqual({ version: 1, connections: {} });
  });
});

function failingSkillWrites(): ConnectionsFs {
  const writeFile = (async (path: string, ...rest: [string, object]) => {
    if (String(path).endsWith("SKILL.md")) {
      throw Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
        code: "EACCES",
      });
    }
    return fsp.writeFile(path, ...rest);
  }) as typeof fsp.writeFile;
  return { ...fsp, writeFile };
}

describe("codex", () => {
  const block = (eol = "\n") =>
    [
      "# >>> cushn (added by Cushn; Disconnect in Cushn removes this block)",
      "[mcp_servers.cushn]",
      `command = ${JSON.stringify(launcher)}`,
      "# <<< cushn",
      "",
    ].join(eol);
  const connect = (connections: ReturnType<typeof setup>["connections"], launcherPath = launcher) =>
    connections.connect("codex", { launcherPath, cliPath: CODEX });

  const userConfig = [
    "# my Codex setup",
    'model = "gpt-5.5"   # inline comment',
    "",
    "[mcp_servers.moonjar]",
    "# why moonjar",
    'command = "/m"',
    "args    = []",
    'future_key = "a key this Codex doesn\'t know"',
    "",
  ].join("\n");

  it("appends a delimited [mcp_servers.cushn] block, checked with `codex mcp get`", async () => {
    await write(codexConfig(), userConfig);
    const { run, childEnv, connections } = setup();

    await connect(connections);

    expect(await read(codexConfig())).toBe(`${userConfig}\n${block()}`);
    const get = [CODEX, CODEX_GET, { env: childEnv, timeoutMs: expect.any(Number) }];
    expect(run.mock.calls).toEqual([get, get]);
    expect(await read(codexSkill())).toBe(CUSHN_SKILL);
    expect(await exists(join(home, ".agents"))).toBe(false);
    expect(await connections.isConnected("codex")).toBe(true);
    expect((await manifest()).connections.codex).toEqual({
      connectedAt: "2026-10-30T12:00:00.000Z",
      launcherPath: launcher,
      registration: {
        type: "toml-block",
        file: codexConfig(),
        text: `\n${block()}`,
        createdFile: false,
      },
      files: [{ path: codexSkill(), sha256: sha256(CUSHN_SKILL) }],
      dirs: [join(home, ".codex", "skills"), join(home, ".codex", "skills", "cushn")],
    });
  });

  it.each([
    ["a final newline", userConfig, "\n", "\n"],
    ["no final newline", 'model = "x"', "\n\n", "\n"],
    ["a blank line at the end", 'model = "x"\n\n', "", "\n"],
    ["CRLF line ends", 'model = "x"\r\n[features]\r\nshell_tool = true\r\n', "\r\n", "\r\n"],
    ["nothing in it", "", "", "\n"],
  ])(
    "disconnects without running Codex, restoring a config with %s byte for byte",
    async (_, before, separator, eol) => {
      await write(codexConfig(), before);
      const { run, connections } = setup();
      await connect(connections);
      expect(await read(codexConfig())).toBe(before + separator + block(eol));
      run.mockClear();

      await connections.disconnect("codex");

      expect(await read(codexConfig())).toBe(before);
      expect(run).not.toHaveBeenCalled();
      expect(await exists(join(home, ".codex", "skills"))).toBe(false);
      expect(await connections.isConnected("codex")).toBe(false);
    },
  );

  it("removes its table after Codex rewrote the file around it", async () => {
    const before = lines(
      'model = "gpt-5.5"',
      "",
      "[mcp_servers.moonjar]",
      'command = "/m"',
      "",
      "[profiles.work]",
      'model = "o3"',
    );
    await write(codexConfig(), before);
    const { connections } = setup();
    await connect(connections);
    // What `codex mcp add other -- /bin/echo` (0.153.1) made of it: the table moved, the opening
    // marker gone, the closing one left at the end.
    await write(
      codexConfig(),
      [
        'model = "gpt-5.5"',
        "",
        "[mcp_servers.moonjar]",
        'command = "/m"',
        "",
        "[mcp_servers.cushn]",
        `command = ${JSON.stringify(launcher)}`,
        "",
        "[mcp_servers.other]",
        'command = "/bin/echo"',
        "",
        "[profiles.work]",
        'model = "o3"',
        "# <<< cushn",
        "",
      ].join("\n"),
    );
    expect(await connections.isConnected("codex")).toBe(true);

    await connections.disconnect("codex");

    expect(await read(codexConfig())).toBe(
      lines(
        'model = "gpt-5.5"',
        "",
        "[mcp_servers.moonjar]",
        'command = "/m"',
        "",
        "[mcp_servers.other]",
        'command = "/bin/echo"',
        "",
        "[profiles.work]",
        'model = "o3"',
      ),
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("recognizes a Windows launcher Codex rewrote as a literal string", async () => {
    const windowsLauncher = "C:\\Users\\me\\.cushn\\bin\\cushn-mcp.cmd";
    await write(codexConfig(), 'model = "x"\n');
    const { connections } = setup();
    await connect(connections, windowsLauncher);
    expect(await read(codexConfig())).toContain(
      'command = "C:\\\\Users\\\\me\\\\.cushn\\\\bin\\\\cushn-mcp.cmd"',
    );
    await write(
      codexConfig(),
      `model = "x"\n\n[mcp_servers.cushn]\ncommand = '${windowsLauncher}'\n`,
    );

    await connections.disconnect("codex");

    expect(await read(codexConfig())).toBe('model = "x"\n');
  });

  it("keeps a table the user changed, and logs what it kept", async () => {
    await write(codexConfig(), userConfig);
    const { connections } = setup();
    await connect(connections);
    const changed = (await read(codexConfig())).replace(
      "# <<< cushn",
      'enabled_tools = ["list_budgets"]\n# <<< cushn',
    );
    await write(codexConfig(), changed);
    expect(await connections.isConnected("codex")).toBe(false);

    await connections.disconnect("codex");

    expect(await read(codexConfig())).toBe(changed);
    expect(await exists(codexSkill())).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Codex"), [
      `${codexConfig()} ([mcp_servers.cushn])`,
    ]);
  });

  it("refuses a cushn server Codex already has", async () => {
    const before = '[mcp_servers.cushn]\ncommand = "/elsewhere/cushn"\n';
    await write(codexConfig(), before);
    const { connections } = setup();

    expect(await rejection(connect(connections))).toMatchObject({
      code: "CONFLICT",
      message:
        `Codex already has an MCP server named "cushn" that Cushn didn't add. ` +
        `Remove it from ${codexConfig()}, then connect again.`,
    });
    expect(await read(codexConfig())).toBe(before);
    expect(await exists(join(home, ".codex", "skills"))).toBe(false);
  });

  it("leaves a config Codex can't read alone", async () => {
    await write(codexConfig(), "model = \n");
    const { run, connections } = setup();
    run.mockResolvedValueOnce(failed(CODEX_BAD_TOML));

    expect(await rejection(connect(connections))).toMatchObject({
      code: "INTERNAL",
      message:
        `Codex couldn't read its config, so Cushn left it alone: ` +
        "/Users/me/.codex/config.toml:1:9: string values must be quoted, expected literal string",
    });
    expect(await read(codexConfig())).toBe("model = \n");
    expect(await exists(manifestPath())).toBe(false);
  });

  it("puts the config back when Codex can't read it with the block", async () => {
    const before = 'mcp_servers = { moonjar = { command = "/m" } }\n';
    await write(codexConfig(), before);
    const { run, connections } = setup();
    run
      .mockResolvedValueOnce(failed("Error: No MCP server named 'cushn' found.\n"))
      .mockResolvedValueOnce(failed(CODEX_BAD_TOML));

    expect(await rejection(connect(connections))).toMatchObject({
      code: "INTERNAL",
      message: expect.stringContaining("Codex couldn't read the server Cushn added"),
    });
    expect(await read(codexConfig())).toBe(before);
    expect(await exists(join(home, ".codex", "skills"))).toBe(false);
    expect(await manifest()).toEqual({ version: 1, connections: {} });
  });

  it("creates config.toml when there's none, and deletes it with its folder", async () => {
    const { connections } = setup();

    await connect(connections);
    expect(await read(codexConfig())).toBe(block());
    expect((await manifest()).connections.codex).toMatchObject({
      registration: { createdFile: true, text: block() },
      dirs: [
        join(home, ".codex"),
        join(home, ".codex", "skills"),
        join(home, ".codex", "skills", "cushn"),
      ],
    });

    await connections.disconnect("codex");
    expect(await exists(join(home, ".codex"))).toBe(false);
  });

  it("keeps config.toml it created once something else is in it", async () => {
    const { connections } = setup();
    await connect(connections);
    await fsp.appendFile(codexConfig(), '\n[projects."/Users/me/dev"]\ntrust_level = "trusted"\n');

    await connections.disconnect("codex");

    expect(await read(codexConfig())).toBe(
      '\n[projects."/Users/me/dev"]\ntrust_level = "trusted"\n',
    );
  });

  it("writes through a symlinked config.toml and keeps its mode", async () => {
    const target = join(root, "dotfiles", "codex.toml");
    await write(target, 'model = "x"\n');
    await fsp.chmod(target, 0o600);
    await fsp.mkdir(join(home, ".codex"));
    await fsp.symlink(target, codexConfig());
    const { connections } = setup();

    await connect(connections);
    expect((await fsp.lstat(codexConfig())).isSymbolicLink()).toBe(true);
    expect(await read(target)).toBe(`model = "x"\n\n${block()}`);
    expect((await fsp.stat(target)).mode & 0o777).toBe(0o600);

    await connections.disconnect("codex");
    expect((await fsp.lstat(codexConfig())).isSymbolicLink()).toBe(true);
    expect(await read(target)).toBe('model = "x"\n');
  });

  it("follows CODEX_HOME", async () => {
    const codexHome = join(root, "codex-home");
    const { connections } = setup({ env: { CODEX_HOME: codexHome } });

    await connect(connections);

    expect(await read(join(codexHome, "config.toml"))).toBe(block());
    expect(await read(join(codexHome, "skills", "cushn", "SKILL.md"))).toBe(CUSHN_SKILL);
    expect(await exists(join(home, ".codex"))).toBe(false);
  });
});

describe("claude-desktop", () => {
  const connect = (connections: ReturnType<typeof setup>["connections"]) =>
    connections.connect("claude-desktop", { launcherPath: launcher, cliPath: null });
  const userConfig = {
    globalShortcut: "Alt+Space",
    mcpServers: { moonjar: { command: "/m", args: [], env: { MOONJAR_LOG: "1" } } },
    preferences: { quickEntry: true },
  };

  it("adds mcpServers.cushn, keeps every other key, and installs no skill", async () => {
    await write(desktopConfig(), `${JSON.stringify(userConfig, null, 2)}\n`);
    const { run, connections } = setup();

    await connect(connections);

    expect(JSON.parse(await read(desktopConfig()))).toEqual({
      ...userConfig,
      mcpServers: { ...userConfig.mcpServers, cushn: { command: launcher, args: [] } },
    });
    expect(run).not.toHaveBeenCalled();
    expect(await exists(join(home, ".claude"))).toBe(false);
    expect(await connections.isConnected("claude-desktop")).toBe(true);
    expect((await manifest()).connections["claude-desktop"]).toEqual({
      connectedAt: "2026-10-30T12:00:00.000Z",
      launcherPath: launcher,
      registration: {
        type: "json-entry",
        file: desktopConfig(),
        createdFile: false,
        createdKey: false,
      },
      files: [],
      dirs: [],
    });
  });

  it.each([
    ["2 spaces and a final newline", `${JSON.stringify(userConfig, null, 2)}\n`],
    ["4 spaces", JSON.stringify(userConfig, null, 4)],
    ["tabs", `${JSON.stringify(userConfig, null, "\t")}\n`],
    ["no mcpServers", `${JSON.stringify({ globalShortcut: "Alt+Space" }, null, 2)}\n`],
  ])("disconnects back to the same bytes from %s", async (_, before) => {
    await write(desktopConfig(), before);
    const { connections } = setup();
    await connect(connections);

    await connections.disconnect("claude-desktop");

    expect(await read(desktopConfig())).toBe(before);
    expect(await connections.isConnected("claude-desktop")).toBe(false);
  });

  it("creates a missing config, and deletes it when only its entry is left", async () => {
    await fsp.mkdir(desktopDir(), { recursive: true });
    const { connections } = setup();

    await connect(connections);
    expect(JSON.parse(await read(desktopConfig()))).toEqual({
      mcpServers: { cushn: { command: launcher, args: [] } },
    });
    expect((await fsp.stat(desktopConfig())).mode & 0o777).toBe(0o600);

    await connections.disconnect("claude-desktop");
    expect(await fsp.readdir(desktopDir())).toEqual([]);
  });

  it("keeps a config it created once Claude Desktop added its own keys", async () => {
    await fsp.mkdir(desktopDir(), { recursive: true });
    const { connections } = setup();
    await connect(connections);
    const config = JSON.parse(await read(desktopConfig()));
    await write(desktopConfig(), JSON.stringify({ ...config, preferences: { a: 1 } }, null, 2));

    await connections.disconnect("claude-desktop");

    expect(JSON.parse(await read(desktopConfig()))).toEqual({ preferences: { a: 1 } });
  });

  it("keeps an entry the user changed", async () => {
    await write(desktopConfig(), "{}");
    const { connections } = setup();
    await connect(connections);
    const config = JSON.parse(await read(desktopConfig()));
    config.mcpServers.cushn.env = { DEBUG: "1" };
    await write(desktopConfig(), JSON.stringify(config));

    await connections.disconnect("claude-desktop");

    expect(JSON.parse(await read(desktopConfig())).mcpServers.cushn.env).toEqual({ DEBUG: "1" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Claude Desktop"), [
      `${desktopConfig()} (mcpServers.cushn)`,
    ]);
  });

  it("answers NOT_FOUND when Claude Desktop hasn't run here, and on Linux", async () => {
    expect(await rejection(connect(setup().connections))).toMatchObject({
      code: "NOT_FOUND",
      message:
        "Claude Desktop isn't installed, or hasn't been opened yet. Open it once, then connect.",
    });
    expect(await exists(join(home, "Library"))).toBe(false);

    expect(await rejection(connect(setup({ platform: "linux" }).connections))).toMatchObject({
      code: "NOT_FOUND",
      message: "Claude Desktop isn't available on this system.",
    });
  });

  it.each([
    ["a cushn server", '{ "mcpServers": { "cushn": { "command": "/x" } } }', "CONFLICT"],
    ["broken JSON", "{ mcpServers: ", "INTERNAL"],
    ["an array", "[]", "INTERNAL"],
    ["mcpServers that isn't an object", '{ "mcpServers": [] }', "INTERNAL"],
  ])("leaves a config holding %s alone", async (_, before, code) => {
    await write(desktopConfig(), before);
    const { connections } = setup();

    expect(await rejection(connect(connections))).toMatchObject({ code });
    expect(await read(desktopConfig())).toBe(before);
  });
});

describe("the manifest", () => {
  it("disconnects nothing it has no record of", async () => {
    await write(claudeJson(), JSON.stringify({ mcpServers: { cushn: { command: launcher } } }));
    const { run, connections } = setup();

    await connections.disconnect("claude-code");

    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(await read(claudeJson())).mcpServers.cushn).toEqual({ command: launcher });
  });

  it("when damaged, stops Connect and Disconnect and reads as not connected", async () => {
    await write(manifestPath(), "{ not json");
    const { run, connections } = setup();

    expect(await connections.isConnected("claude-code")).toBe(false);
    for (const attempt of [
      () => connections.connect("claude-code", { launcherPath: launcher, cliPath: CLAUDE }),
      () => connections.disconnect("claude-code"),
    ]) {
      expect(await rejection(attempt())).toMatchObject({
        code: "INTERNAL",
        message: expect.stringContaining(manifestPath()),
      });
    }
    expect(run).not.toHaveBeenCalled();
    expect(await read(manifestPath())).toBe("{ not json");
  });

  it("keeps each client's record apart", async () => {
    await fsp.mkdir(desktopDir(), { recursive: true });
    const { connections } = setup();
    await connections.connect("claude-code", { launcherPath: launcher, cliPath: CLAUDE });
    await connections.connect("claude-desktop", { launcherPath: launcher, cliPath: null });

    await connections.disconnect("claude-code");

    expect(Object.keys((await manifest()).connections)).toEqual(["claude-desktop"]);
    expect(await connections.isConnected("claude-desktop")).toBe(true);
  });
});

describe("clientPaths", () => {
  it("finds Claude Desktop's config under %APPDATA% on Windows", () => {
    expect(clientPaths("win32", "C:\\Users\\me", { AppData: "D:\\Roaming" }).claudeDesktop).toBe(
      "D:\\Roaming\\Claude\\claude_desktop_config.json",
    );
    expect(clientPaths("win32", "C:\\Users\\me", {})).toEqual({
      claudeCode: {
        config: "C:\\Users\\me\\.claude.json",
        skills: "C:\\Users\\me\\.claude\\skills",
      },
      codex: {
        config: "C:\\Users\\me\\.codex\\config.toml",
        skills: "C:\\Users\\me\\.codex\\skills",
      },
      claudeDesktop: "C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
    });
  });

  it("has no Claude Desktop config on Linux", () => {
    expect(clientPaths("linux", "/home/me", {}).claudeDesktop).toBeNull();
  });
});
