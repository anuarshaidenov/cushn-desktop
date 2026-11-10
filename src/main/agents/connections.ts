/**
 * Connect and Disconnect for the user's own agent clients. Connect registers Cushn's stdio
 * launcher with the client as an MCP server named `cushn` and, for Claude Code and Codex, installs
 * the `cushn` skill (`skill.ts`). Disconnect removes exactly that. Electron-free: `index.ts`
 * injects fs, the process runner, the child env and the paths.
 *
 * - Claude Code: `claude mcp add|remove --scope user`, so Claude writes its own `.claude.json`.
 * - Codex: a delimited `[mcp_servers.cushn]` block appended to `config.toml`, cut out again on
 *   Disconnect. `codex mcp add|remove` (0.153.1) re-serializes every `[mcp_servers.*]` table,
 *   dropping comments and keys it doesn't know, so it would change the user's other servers.
 * - Claude Desktop: `mcpServers.cushn` in `claude_desktop_config.json`, no skill.
 *
 * `<userData>/agent-connections.json` records each write before it happens. Undo checks every
 * recorded item first: one that's no longer as Cushn wrote it belongs to the user now, so it stays
 * and a warning names it. Connect never adopts a `cushn` server or skill it has no record of.
 */
import { createHash, randomUUID } from "node:crypto";
import type * as fsPromises from "node:fs/promises";
import { posix, win32 } from "node:path";
import { z } from "zod";
import { AGENT_KINDS, type AgentKind } from "@shared/api";
import { CushnError } from "@shared/errors";
import type { DetectorDependencies, RunResult } from "./detect";
import { CUSHN_SKILL } from "./skill";

export const MANIFEST_FILE = "agent-connections.json";
const SERVER = "cushn";
const RUN_TIMEOUT_MS = 30_000;
const CODEX_BEGIN = "# >>> cushn (added by Cushn; Disconnect in Cushn removes this block)";
const CODEX_END = "# <<< cushn";
const CODEX_HEADER = /^\[\s*mcp_servers\s*\.\s*(?:cushn|"cushn")\s*\]$/;
const CODEX_SUBTABLE = /^\[\s*mcp_servers\s*\.\s*(?:cushn|"cushn")\s*\./;

const LABELS: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "claude-desktop": "Claude Desktop",
};

export type ConnectionsFs = Pick<
  typeof fsPromises,
  "readFile" | "writeFile" | "rename" | "rm" | "rmdir" | "mkdir" | "realpath" | "stat" | "chmod"
>;

export interface ConnectionsDependencies {
  fs: ConnectionsFs;
  run: DetectorDependencies["run"];
  /**
   * The allowlisted env the client CLIs run with (`Detector.childEnv`), so no API key reaches
   * them. Config paths follow its `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `APPDATA`, as the CLIs do.
   */
  childEnv(): Promise<Record<string, string>>;
  homeDir: string;
  platform: NodeJS.Platform;
  /** Holds the manifest. */
  userData: string;
  now(): number;
}

export interface Connections {
  /** Cushn has a record of connecting it, and the client still has the server as Cushn left it. */
  isConnected(kind: AgentKind): Promise<boolean>;
  /** `cliPath` is the resolved `claude` or `codex`, `null` for Claude Desktop. */
  connect(
    kind: AgentKind,
    options: { launcherPath: string; cliPath: string | null },
  ): Promise<void>;
  /** `cliPath` replaces the `claude` recorded at connect, e.g. after Claude Code moved. */
  disconnect(kind: AgentKind, options?: { cliPath?: string | null }): Promise<void>;
}

/**
 * How the server was registered, and so how to undo it:
 * - `claude-cli`: `cli add` ran with `env` over the child env, `cli remove` undoes it;
 *   `configFile` is only read, to confirm the server is still there;
 * - `toml-block`: `text` was appended to `file`;
 * - `json-entry`: `mcpServers.cushn` was set in `file`; `createdKey`: `mcpServers` was added too.
 */
const registrationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("claude-cli"),
    cli: z.string(),
    env: z.record(z.string(), z.string()),
    add: z.array(z.string()),
    remove: z.array(z.string()),
    configFile: z.string(),
  }),
  z.object({
    type: z.literal("toml-block"),
    file: z.string(),
    text: z.string(),
    createdFile: z.boolean(),
  }),
  z.object({
    type: z.literal("json-entry"),
    file: z.string(),
    createdFile: z.boolean(),
    createdKey: z.boolean(),
  }),
]);

const connectionSchema = z.object({
  connectedAt: z.string(),
  launcherPath: z.string(),
  registration: registrationSchema,
  /** Files Cushn created, with the SHA-256 of what it wrote. */
  files: z.array(z.object({ path: z.string(), sha256: z.string() })),
  /** Folders Cushn created, outermost first; removed only while empty. */
  dirs: z.array(z.string()),
});

const manifestSchema = z.object({
  version: z.literal(1),
  connections: z.partialRecord(z.enum(AGENT_KINDS), connectionSchema),
});

type ConnectionRecord = z.infer<typeof connectionSchema>;
type Registration = ConnectionRecord["registration"];
type Manifest = z.infer<typeof manifestSchema>;
type RegistrationState = "ours" | "changed" | "absent";

interface Plan {
  registration: Registration;
  /** Where the skill goes, or `null` for none. */
  skills: string | null;
  /** Registers the server; `ensureDir` records a missing folder, then creates it. */
  apply(ensureDir: (dir: string) => Promise<void>): Promise<void>;
}

export interface ClientPaths {
  claudeCode: { config: string; skills: string };
  codex: { config: string; skills: string };
  /** `null` where there's no Claude Desktop (Linux). */
  claudeDesktop: string | null;
}

export function clientPaths(
  platform: NodeJS.Platform,
  homeDir: string,
  env: Record<string, string>,
): ClientPaths {
  const path = platform === "win32" ? win32 : posix;
  const claudeHome = envValue(env, "CLAUDE_CONFIG_DIR", platform);
  const codexHome = envValue(env, "CODEX_HOME", platform) || path.join(homeDir, ".codex");
  const desktopRoot =
    platform === "darwin"
      ? path.join(homeDir, "Library", "Application Support")
      : platform === "win32"
        ? envValue(env, "APPDATA", platform) || path.join(homeDir, "AppData", "Roaming")
        : null;
  return {
    claudeCode: {
      config: path.join(claudeHome || homeDir, ".claude.json"),
      skills: path.join(claudeHome || path.join(homeDir, ".claude"), "skills"),
    },
    codex: { config: path.join(codexHome, "config.toml"), skills: path.join(codexHome, "skills") },
    claudeDesktop: desktopRoot && path.join(desktopRoot, "Claude", "claude_desktop_config.json"),
  };
}

export function createConnections(deps: ConnectionsDependencies): Connections {
  const { fs, platform } = deps;
  const path = platform === "win32" ? win32 : posix;
  const manifestPath = path.join(deps.userData, MANIFEST_FILE);
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  const readText = (file: string) => unlessMissing(fs.readFile(file, "utf8"));
  const exists = async (target: string) => (await unlessMissing(fs.stat(target))) !== null;

  /** Temp file and rename next to the real file (through a symlink), keeping its mode. */
  async function writeAtomic(file: string, text: string, newFileMode = 0o644) {
    const target = (await unlessMissing(fs.realpath(file))) ?? file;
    const mode = ((await unlessMissing(fs.stat(target)))?.mode ?? newFileMode) & 0o777;
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, text, { flag: "wx", mode });
      await fs.chmod(temp, mode);
      await fs.rename(temp, target);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
  }

  async function readJson(file: string) {
    const text = await readText(file);
    if (text === null) return null;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new CushnError(
        "INTERNAL",
        `${file} isn't valid JSON, so Cushn left it alone. Fix it, then try again.`,
      );
    }
    if (!isPlainObject(data)) {
      throw new CushnError(
        "INTERNAL",
        `${file} doesn't hold a JSON object, so Cushn left it alone.`,
      );
    }
    return { text, data };
  }

  async function readManifest(): Promise<Manifest> {
    const text = await readText(manifestPath);
    if (text === null) return { version: 1, connections: {} };
    try {
      return manifestSchema.parse(JSON.parse(text));
    } catch {
      throw new CushnError(
        "INTERNAL",
        `Cushn's record of agent connections, ${manifestPath}, is damaged, so Cushn won't ` +
          "change any agent's setup. Move the file away to start over.",
      );
    }
  }

  async function saveManifest(manifest: Manifest) {
    await fs.mkdir(deps.userData, { recursive: true });
    await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
  }

  async function runCli(kind: AgentKind, cli: string, args: string[], env: Record<string, string>) {
    const result = await deps
      .run(cli, args, { env, timeoutMs: RUN_TIMEOUT_MS })
      .catch((): RunResult => ({ code: null, stdout: "", stderr: "" }));
    if (result.code === null) {
      throw new CushnError(
        "NOT_FOUND",
        `Couldn't run ${LABELS[kind]} at ${cli}. Check that it's installed, then try again.`,
      );
    }
    return result;
  }

  async function codexServer(cli: string, env: Record<string, string>) {
    const result = await runCli("codex", cli, ["mcp", "get", SERVER, "--json"], env);
    if (result.code === 0) {
      let found: unknown;
      try {
        found = JSON.parse(result.stdout);
      } catch {
        found = null;
      }
      const transport = isPlainObject(found) ? found.transport : null;
      return {
        status: "found",
        command: isPlainObject(transport) ? transport.command : null,
      } as const;
    }
    if (/No MCP server named/.test(output(result))) return { status: "absent" } as const;
    return { status: "failed", detail: failureDetail(result) } as const;
  }

  async function registrationState(
    registration: Registration,
    launcherPath: string,
  ): Promise<RegistrationState> {
    if (registration.type === "toml-block") {
      const text = await readText(registration.file);
      return text === null ? "absent" : codexTable(text, registration.text, launcherPath).state;
    }
    const file = registration.type === "claude-cli" ? registration.configFile : registration.file;
    const config = await readJson(file);
    const entry = config === null ? undefined : serversOf(config.data, file)?.[SERVER];
    if (entry === undefined) return "absent";
    return isOurServer(entry, launcherPath) ? "ours" : "changed";
  }

  async function expectUnchanged(kind: AgentKind, file: string, before: string | null) {
    if ((await readText(file)) !== before) {
      throw new CushnError(
        "CONFLICT",
        `${LABELS[kind]}'s config changed while Cushn was connecting. Try again.`,
      );
    }
  }

  async function plan(
    kind: AgentKind,
    launcherPath: string,
    cliPath: string | null,
    env: Record<string, string>,
  ): Promise<Plan> {
    const paths = clientPaths(platform, deps.homeDir, env);
    if (kind === "claude-desktop") return planClaudeDesktop(launcherPath, paths.claudeDesktop);
    if (cliPath === null) throw new CushnError("NOT_FOUND", `${LABELS[kind]} isn't installed.`);
    return kind === "claude-code"
      ? planClaudeCode(launcherPath, cliPath, env, paths.claudeCode)
      : planCodex(launcherPath, cliPath, env, paths.codex);
  }

  async function planClaudeCode(
    launcherPath: string,
    cli: string,
    env: Record<string, string>,
    paths: ClientPaths["claudeCode"],
  ): Promise<Plan> {
    const current = await readJson(paths.config);
    if (current && serversOf(current.data, paths.config)?.[SERVER] !== undefined) {
      throw conflict(
        "claude-code",
        "Remove it with `claude mcp remove --scope user cushn`, then connect again.",
      );
    }
    const configDir = envValue(env, "CLAUDE_CONFIG_DIR", platform);
    const registration: Extract<Registration, { type: "claude-cli" }> = {
      type: "claude-cli",
      cli,
      env: configDir ? { CLAUDE_CONFIG_DIR: configDir } : {},
      add: ["mcp", "add", "--scope", "user", SERVER, "--", launcherPath],
      remove: ["mcp", "remove", "--scope", "user", SERVER],
      configFile: paths.config,
    };
    return {
      registration,
      skills: paths.skills,
      async apply() {
        const result = await runCli("claude-code", cli, registration.add, env);
        if (result.code !== 0) {
          if (/already exists/.test(output(result))) {
            throw conflict("claude-code", "Remove it, then connect again.");
          }
          throw new CushnError(
            "INTERNAL",
            `Claude Code couldn't add Cushn's server: ${failureDetail(result)}`,
          );
        }
        if ((await registrationState(registration, launcherPath)) !== "ours") {
          throw new CushnError(
            "INTERNAL",
            `Claude Code didn't add Cushn's server to ${paths.config}.`,
          );
        }
      },
    };
  }

  async function planCodex(
    launcherPath: string,
    cli: string,
    env: Record<string, string>,
    paths: ClientPaths["codex"],
  ): Promise<Plan> {
    const existing = await codexServer(cli, env);
    if (existing.status === "failed") {
      throw new CushnError(
        "INTERNAL",
        `Codex couldn't read its config, so Cushn left it alone: ${existing.detail}`,
      );
    }
    if (existing.status === "found") {
      throw conflict("codex", `Remove it from ${paths.config}, then connect again.`);
    }
    const original = await readText(paths.config);
    const eol = original?.includes("\r\n") ? "\r\n" : "\n";
    const block = [
      CODEX_BEGIN,
      "[mcp_servers.cushn]",
      `command = ${tomlString(launcherPath)}`,
      CODEX_END,
      "",
    ].join(eol);
    const registration: Extract<Registration, { type: "toml-block" }> = {
      type: "toml-block",
      file: paths.config,
      text: separator(original ?? "", eol) + block,
      createdFile: original === null,
    };
    return {
      registration,
      skills: paths.skills,
      async apply(ensureDir) {
        await expectUnchanged("codex", paths.config, original);
        if (original === null) await ensureDir(path.dirname(paths.config));
        await writeAtomic(paths.config, (original ?? "") + registration.text, 0o600);
        const added = await codexServer(cli, env);
        if (added.status !== "found" || added.command !== launcherPath) {
          throw new CushnError(
            "INTERNAL",
            `Codex couldn't read the server Cushn added to ${paths.config}: ` +
              (added.status === "failed" ? added.detail : "Codex doesn't list it."),
          );
        }
      },
    };
  }

  async function planClaudeDesktop(launcherPath: string, config: string | null): Promise<Plan> {
    if (config === null) {
      throw new CushnError("NOT_FOUND", "Claude Desktop isn't available on this system.");
    }
    if (!(await exists(path.dirname(config)))) {
      throw new CushnError(
        "NOT_FOUND",
        "Claude Desktop isn't installed, or hasn't been opened yet. Open it once, then connect.",
      );
    }
    const original = await readJson(config);
    const servers = original && serversOf(original.data, config);
    if (servers?.[SERVER] !== undefined) {
      throw conflict("claude-desktop", `Remove it from ${config}, then connect again.`);
    }
    return {
      registration: {
        type: "json-entry",
        file: config,
        createdFile: original === null,
        createdKey: !servers,
      },
      skills: null,
      async apply() {
        await expectUnchanged("claude-desktop", config, original?.text ?? null);
        const data = original?.data ?? {};
        data.mcpServers = { ...servers, [SERVER]: { command: launcherPath, args: [] } };
        await writeAtomic(config, formatJson(data, original?.text ?? null), 0o600);
      },
    };
  }

  async function unregister(
    registration: Registration,
    launcherPath: string,
    cliPath: string | null,
  ) {
    switch (registration.type) {
      case "claude-cli": {
        const env = { ...withoutClaudeConfigDir(await deps.childEnv()), ...registration.env };
        const cli = cliPath ?? registration.cli;
        const result = await runCli("claude-code", cli, registration.remove, env);
        if (result.code !== 0 && !/No MCP server named/.test(output(result))) {
          throw new CushnError(
            "INTERNAL",
            `Claude Code couldn't remove Cushn's server: ${failureDetail(result)}`,
          );
        }
        return;
      }
      case "toml-block": {
        const text = await readText(registration.file);
        const table = text === null ? null : codexTable(text, registration.text, launcherPath);
        if (table?.state !== "ours") return;
        if (registration.createdFile && table.without.trim() === "") {
          await fs.rm(registration.file, { force: true });
        } else {
          await writeAtomic(registration.file, table.without);
        }
        return;
      }
      case "json-entry": {
        const config = await readJson(registration.file);
        const servers = config && serversOf(config.data, registration.file);
        if (!config || !servers || !isOurServer(servers[SERVER], launcherPath)) return;
        delete servers[SERVER];
        if (registration.createdKey && Object.keys(servers).length === 0) {
          delete config.data.mcpServers;
        }
        if (registration.createdFile && Object.keys(config.data).length === 0) {
          await fs.rm(registration.file, { force: true });
        } else {
          await writeAtomic(registration.file, formatJson(config.data, config.text));
        }
      }
    }
  }

  /**
   * Undoes what's still as Cushn wrote it, the registration first so a failure leaves the whole
   * record for another try. Answers what it kept because the user changed it.
   */
  async function undo(record: ConnectionRecord, cliPath: string | null): Promise<string[]> {
    const { registration, launcherPath } = record;
    const kept: string[] = [];
    const state = await registrationState(registration, launcherPath);
    if (state === "changed") kept.push(describeRegistration(registration));
    if (state === "ours") await unregister(registration, launcherPath, cliPath);
    for (const file of record.files) {
      const content = await unlessMissing(fs.readFile(file.path));
      if (content === null) continue;
      if (sha256(content) === file.sha256) await fs.rm(file.path, { force: true });
      else kept.push(file.path);
    }
    for (const dir of [...record.dirs].reverse()) {
      try {
        await fs.rmdir(dir);
      } catch (error) {
        if (!isMissing(error) && !["ENOTEMPTY", "EEXIST"].includes(errorCode(error))) throw error;
      }
    }
    return kept;
  }

  async function forget(kind: AgentKind, manifest: Manifest, cliPath: string | null) {
    const record = manifest.connections[kind];
    if (!record) return;
    const kept = await undo(record, cliPath);
    delete manifest.connections[kind];
    await saveManifest(manifest);
    if (kept.length > 0) {
      console.warn(`[agents] ${LABELS[kind]}: kept what was changed after Cushn wrote it`, kept);
    }
  }

  async function connectClient(
    kind: AgentKind,
    launcherPath: string,
    cliPath: string | null,
  ): Promise<void> {
    const manifest = await readManifest();
    const previous = manifest.connections[kind];
    if (previous) {
      const state = await registrationState(previous.registration, previous.launcherPath);
      if (previous.launcherPath === launcherPath && state === "ours") return;
      await forget(kind, manifest, cliPath);
    }

    const { registration, skills, apply } = await plan(
      kind,
      launcherPath,
      cliPath,
      await deps.childEnv(),
    );
    const record: ConnectionRecord = {
      connectedAt: new Date(deps.now()).toISOString(),
      launcherPath,
      registration,
      files: [],
      dirs: [],
    };
    manifest.connections[kind] = record;
    const save = () => saveManifest(manifest);

    async function ensureDir(dir: string) {
      const missing: string[] = [];
      for (let current = dir; !(await exists(current)); current = path.dirname(current)) {
        missing.unshift(current);
        if (path.dirname(current) === current) break;
      }
      if (missing.length === 0) return;
      record.dirs.push(...missing);
      await save();
      await fs.mkdir(dir, { recursive: true });
    }

    async function installSkill(dir: string) {
      const file = path.join(dir, "SKILL.md");
      if (await exists(file)) {
        console.warn(`[agents] Left ${file} as it is: Cushn didn't write it.`);
        return;
      }
      await ensureDir(dir);
      record.files.push({ path: file, sha256: sha256(CUSHN_SKILL) });
      await save();
      await fs.writeFile(file, CUSHN_SKILL, { flag: "wx" });
    }

    await save();
    try {
      await apply(ensureDir);
      if (skills !== null) await installSkill(path.join(skills, SERVER));
    } catch (error) {
      try {
        await forget(kind, manifest, cliPath);
      } catch (undoError) {
        console.error(
          `[agents] Couldn't undo a failed connect to ${LABELS[kind]}; ${manifestPath} keeps ` +
            "its record for Disconnect",
          undoError,
        );
      }
      if (error instanceof CushnError) throw error;
      throw new CushnError("INTERNAL", `Couldn't connect ${LABELS[kind]}: ${errorMessage(error)}`);
    }
  }

  return {
    async isConnected(kind) {
      try {
        const record = (await readManifest()).connections[kind];
        if (!record) return false;
        return (await registrationState(record.registration, record.launcherPath)) === "ours";
      } catch (error) {
        console.warn(`[agents] Couldn't check whether ${LABELS[kind]} is connected`, error);
        return false;
      }
    },
    connect(kind, { launcherPath, cliPath }) {
      return exclusive(() => connectClient(kind, launcherPath, cliPath));
    },
    disconnect(kind, { cliPath = null } = {}) {
      return exclusive(async () => {
        const manifest = await readManifest();
        await forget(kind, manifest, cliPath);
      });
    },
  };
}

type CodexTable = { state: "ours"; without: string } | { state: "changed" | "absent" };

/** Cuts out exactly the text Cushn appended, or else the table Codex left of it. */
function codexTable(text: string, appended: string, launcherPath: string): CodexTable {
  for (const exact of new Set([appended, appended.replace(/^(?:\r?\n)+/, "")])) {
    const at = text.indexOf(exact);
    if (at !== -1 && text.indexOf(exact, at + 1) === -1) {
      return { state: "ours", without: text.slice(0, at) + text.slice(at + exact.length) };
    }
  }
  return rewrittenCodexTable(text, launcherPath);
}

/**
 * Another `codex mcp add` rewrites `[mcp_servers.*]`: Cushn's table moves, `args = []` and the
 * opening marker go, the closing marker stays behind. The table is still Cushn's while it holds
 * nothing but Cushn's `command` (and an empty `args`); then it goes, with any stray marker.
 */
function rewrittenCodexTable(text: string, launcherPath: string): CodexTable {
  const lines = text.split(/(?<=\n)/);
  const trimmed = lines.map((line) => line.trim());
  const header = trimmed.findIndex((line) => CODEX_HEADER.test(line));
  if (header === -1) return { state: "absent" };
  let last = header;
  let commands = 0;
  let comment = false;
  for (let i = header + 1; i < lines.length; i++) {
    const line = trimmed[i];
    if (line.startsWith("[")) {
      if (CODEX_SUBTABLE.test(line)) return { state: "changed" };
      break;
    }
    if (line === "" || line === CODEX_BEGIN || line === CODEX_END) continue;
    // A comment ends the table: it belongs to whatever follows, unless a key comes after it.
    if (line.startsWith("#")) {
      comment = true;
      continue;
    }
    const command = /^command\s*=\s*(.+)$/.exec(line)?.[1];
    if (comment) return { state: "changed" };
    if (command !== undefined && tomlStringValue(command) === launcherPath) commands++;
    else if (!/^args\s*=\s*\[\s*\]$/.test(line)) return { state: "changed" };
    last = i;
  }
  if (commands !== 1) return { state: "changed" };
  const drop = new Set<number>();
  for (let i = header; i <= last; i++) drop.add(i);
  if (trimmed[last + 1] === "") drop.add(last + 1);
  else if (trimmed[header - 1] === "") drop.add(header - 1);
  trimmed.forEach((line, i) => {
    if (line === CODEX_BEGIN || line === CODEX_END) drop.add(i);
  });
  return { state: "ours", without: lines.filter((_, i) => !drop.has(i)).join("") };
}

/** A TOML basic string: JSON's escapes are valid TOML ones, plus DEL, which TOML wants escaped. */
function tomlString(value: string) {
  return JSON.stringify(value).replace(/\x7f/g, "\\u007f");
}

/** A basic or literal TOML string's value, `null` for anything else. */
function tomlStringValue(value: string): string | null {
  if (/^'[^']*'$/.test(value)) return value.slice(1, -1);
  if (!/^"(?:[^"\\]|\\.)*"$/.test(value)) return null;
  try {
    return JSON.parse(value) as string;
  } catch {
    return null;
  }
}

/** What goes between the user's last line and the block: one blank line. */
function separator(text: string, eol: string) {
  if (text === "" || text.endsWith(eol + eol)) return "";
  return text.endsWith("\n") ? eol : eol + eol;
}

/** JSON in the file's own indent, final newline and line ends, so a round trip keeps its bytes. */
function formatJson(data: unknown, original: string | null) {
  const indent = original === null ? 2 : (/\n([ \t]+)"/.exec(original)?.[1] ?? "");
  const final = original === null || original.endsWith("\n") ? "\n" : "";
  const text = JSON.stringify(data, null, indent) + final;
  return original?.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text;
}

function serversOf(config: Record<string, unknown>, file: string) {
  const servers = config.mcpServers;
  if (servers === undefined) return undefined;
  if (!isPlainObject(servers)) {
    throw new CushnError(
      "INTERNAL",
      `${file} has an "mcpServers" that isn't an object, so Cushn left it alone.`,
    );
  }
  return servers;
}

/** The entry Cushn writes, `{ command, args: [] }`, plus the `type` and `env` Claude Code adds. */
function isOurServer(entry: unknown, launcherPath: string) {
  if (!isPlainObject(entry)) return false;
  const { type = "stdio", command, args = [], env = {}, ...rest } = entry;
  return (
    type === "stdio" &&
    command === launcherPath &&
    Array.isArray(args) &&
    args.length === 0 &&
    isPlainObject(env) &&
    Object.keys(env).length === 0 &&
    Object.keys(rest).length === 0
  );
}

function describeRegistration(registration: Registration) {
  switch (registration.type) {
    case "claude-cli":
      return `${registration.configFile} (mcpServers.cushn)`;
    case "toml-block":
      return `${registration.file} ([mcp_servers.cushn])`;
    case "json-entry":
      return `${registration.file} (mcpServers.cushn)`;
  }
}

function conflict(kind: AgentKind, fix: string) {
  return new CushnError(
    "CONFLICT",
    `${LABELS[kind]} already has an MCP server named "cushn" that Cushn didn't add. ${fix}`,
  );
}

/** Env keys are case-insensitive on Windows. */
function envValue(env: Record<string, string>, name: string, platform: NodeJS.Platform) {
  if (platform !== "win32") return env[name];
  return Object.entries(env).find(([key]) => key.toUpperCase() === name)?.[1];
}

/** Disconnect sets `CLAUDE_CONFIG_DIR` only as it was at connect. */
function withoutClaudeConfigDir(env: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => key.toUpperCase() !== "CLAUDE_CONFIG_DIR"),
  );
}

const output = ({ stdout, stderr }: RunResult) => `${stderr}\n${stdout}`;

/** The line that says what went wrong: Codex's root cause (`0: …`), else the first line. */
function failureDetail(result: RunResult) {
  const lines = output(result)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const line = lines.find((candidate) => candidate.startsWith("0: ")) ?? lines[0];
  return line === undefined ? "it gave no reason." : line.replace(/^(?:0: |Error: )/, "");
}

function sha256(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

function isMissing(error: unknown) {
  return errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function unlessMissing<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
