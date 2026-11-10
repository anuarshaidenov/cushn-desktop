/**
 * `~/.cushn/bin/cushn-mcp`: the one command every agent registers as Cushn's stdio MCP server. It
 * runs the app's own binary as Node (`ELECTRON_RUN_AS_NODE=1`) on the relay (`src/relay/`), which
 * pipes stdio to the app's socket, and passes the command that starts the app in the background
 * for when it isn't running. Electron-free: `index.ts` passes the app's paths.
 */
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
import { APP_NAME } from "@shared/app";
import { BACKGROUND_FLAG } from "../lifetime";

/** Built by `electron.vite.config.ts`, unpacked from the asar by `electron-builder.yml`. */
const RELAY_FILE = ["out", "relay", "index.js"];

const HEADER =
  `${APP_NAME}'s tools for your agents: relays this stdio MCP session ` +
  `to the ${APP_NAME} app, starting it in the background if it isn't running.`;
const MISSING_APP =
  `Can't find the ${APP_NAME} app; it may have moved or been deleted. ` +
  `Open ${APP_NAME}, then try again.`;

export interface LauncherPaths {
  /** The app's executable, or `node_modules/electron`'s in development. */
  electronPath: string;
  relayPath: string;
  /** What `electronPath` needs to run the app rather than stock Electron: the project in development. */
  appArgs: string[];
  /** The relay sits in an AppImage's per-launch mount: the launcher runs a copy in `~/.cushn/bin`. */
  copyRelay?: true;
}

export interface LauncherTarget extends LauncherPaths {
  /** `mcpSocketPath(...)`. */
  socketPath: string;
  /** The per-launch secret file the relay presents to the socket. */
  secretPath: string;
}

export interface LauncherFs {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  writeFile(path: string, data: string, options: { mode: number; flag: string }): Promise<void>;
  copyFile(from: string, to: string, mode: number): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
  rmdir(path: string): Promise<void>;
}

export interface LauncherDependencies {
  fs: LauncherFs;
  homeDir: string;
  platform: NodeJS.Platform;
}

export function nodeLauncherDependencies(): LauncherDependencies {
  return { fs: fsPromises, homeDir: homedir(), platform: process.platform };
}

/**
 * Development runs the stock Electron on the freshly built relay; a packaged build, its own
 * executable on the relay unpacked next to `app.asar`. An AppImage (`$APPIMAGE`) is mounted afresh
 * under `/tmp` on each launch, so the launcher runs the AppImage itself on a copy of the relay.
 */
export function launcherPaths(app: {
  isPackaged: boolean;
  execPath: string;
  appPath: string;
  resourcesPath: string;
  appImage?: string;
}): LauncherPaths {
  const root = app.isPackaged ? join(app.resourcesPath, "app.asar.unpacked") : app.appPath;
  const relayPath = join(root, ...RELAY_FILE);
  if (app.isPackaged && app.appImage) {
    return { electronPath: app.appImage, relayPath, appArgs: [], copyRelay: true };
  }
  return { electronPath: app.execPath, relayPath, appArgs: app.isPackaged ? [] : [app.appPath] };
}

function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The POSIX `sh` launcher for macOS and Linux. */
export function launcherScript({
  electronPath,
  relayPath,
  appArgs,
  socketPath,
  secretPath,
}: LauncherTarget): string {
  const app = ['"$electron"', ...appArgs.map(shQuote), BACKGROUND_FLAG].join(" ");
  return `#!/bin/sh
# ${HEADER}
electron=${shQuote(electronPath)}
relay=${shQuote(relayPath)}
socket=${shQuote(socketPath)}
secret=${shQuote(secretPath)}

if [ ! -x "$electron" ] || [ ! -f "$relay" ]; then
  printf '%s\\n' ${shQuote(MISSING_APP)} >&2
  exit 1
fi

unset NODE_OPTIONS
export ELECTRON_RUN_AS_NODE=1
exec "$electron" "$relay" "$socket" "$secret" ${app}
`;
}

/** `%` doubles to stay literal in a batch file; a Windows path can't hold `"` anyway. */
function cmdValue(value: string): string {
  if (/["\r\n]/.test(value)) throw new Error(`A .cmd file can't hold this path: ${value}`);
  return value.replaceAll("%", "%%");
}

/** The Windows launcher, `cushn-mcp.cmd`. */
export function launcherCmd({
  electronPath,
  relayPath,
  appArgs,
  socketPath,
  secretPath,
}: LauncherTarget): string {
  const app = ['"%electron%"', ...appArgs.map((arg) => `"${cmdValue(arg)}"`), BACKGROUND_FLAG];
  return [
    "@echo off",
    `rem ${HEADER}`,
    "setlocal DisableDelayedExpansion",
    `set "electron=${cmdValue(electronPath)}"`,
    `set "relay=${cmdValue(relayPath)}"`,
    `set "socket=${cmdValue(socketPath)}"`,
    `set "secret=${cmdValue(secretPath)}"`,
    'if not exist "%electron%" goto missing',
    'if not exist "%relay%" goto missing',
    "set NODE_OPTIONS=",
    "set ELECTRON_RUN_AS_NODE=1",
    `"%electron%" "%relay%" "%socket%" "%secret%" ${app.join(" ")}`,
    "exit /b %ERRORLEVEL%",
    ":missing",
    `echo ${MISSING_APP} 1>&2`,
    "exit /b 1",
    "",
  ].join("\r\n");
}

function locations({ homeDir, platform }: Pick<LauncherDependencies, "homeDir" | "platform">) {
  const path = platform === "win32" ? win32 : posix;
  const root = path.join(homeDir, ".cushn");
  const bin = path.join(root, "bin");
  return {
    root,
    bin,
    file: path.join(bin, platform === "win32" ? "cushn-mcp.cmd" : "cushn-mcp"),
    relayCopy: path.join(bin, "cushn-relay.js"),
  };
}

export function launcherFile(deps: Pick<LauncherDependencies, "homeDir" | "platform">): string {
  return locations(deps).file;
}

/** Written to a temp file and renamed over `file`, so a reader sees the old file or the new one. */
async function replaceFile(
  fs: LauncherFs,
  file: string,
  mode: number,
  write: (temp: string) => Promise<void>,
): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await write(temp);
    await fs.chmod(temp, mode);
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

/**
 * Writes the launcher (0755, in directories it creates 0700), after the relay's copy if it needs
 * one, and returns its path.
 */
export async function writeLauncher(
  deps: LauncherDependencies,
  target: LauncherTarget,
): Promise<string> {
  const { fs } = deps;
  const { bin, file, relayCopy } = locations(deps);
  await fs.mkdir(bin, { recursive: true, mode: 0o700 });
  let relayPath = target.relayPath;
  if (target.copyRelay) {
    await replaceFile(fs, relayCopy, 0o644, (temp) =>
      fs.copyFile(target.relayPath, temp, constants.COPYFILE_EXCL),
    );
    relayPath = relayCopy;
  }
  const launcher = { ...target, relayPath };
  const script = deps.platform === "win32" ? launcherCmd(launcher) : launcherScript(launcher);
  await replaceFile(fs, file, 0o755, (temp) =>
    fs.writeFile(temp, script, { mode: 0o755, flag: "wx" }),
  );
  return file;
}

/** Deletes the launcher and the relay's copy, then `~/.cushn/bin` and `~/.cushn` while empty. */
export async function removeLauncher(deps: LauncherDependencies): Promise<void> {
  const { root, bin, file, relayCopy } = locations(deps);
  await deps.fs.rm(file, { force: true });
  await deps.fs.rm(relayCopy, { force: true });
  for (const dir of [bin, root]) {
    try {
      await deps.fs.rmdir(dir);
    } catch (error) {
      // Not empty: something else lives there, so it and its parent stay.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
    }
  }
}
