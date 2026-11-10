/**
 * The launcher's scripts run for real under `sh` against fake apps in a temp dir (a fake Electron
 * prints what it was run with), and its files are written to a temp home.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_ID } from "@shared/app";
import {
  type LauncherDependencies,
  type LauncherFs,
  type LauncherPaths,
  type LauncherTarget,
  launcherCmd,
  launcherFile,
  launcherPaths,
  launcherScript,
  removeLauncher,
  writeLauncher,
} from "./launcher";

const posixOnly = it.skipIf(process.platform === "win32");
const REPO = join(import.meta.dirname, "../../..");
const SOCKET = "/Users/ann/Library/Application Support/Cushn/mcp/cushn.sock";
const SECRET = "/Users/ann/Library/Application Support/Cushn/mcp/secret";
const FAKE_ELECTRON = `#!/bin/sh
printf '%s\\n' "ppid=$PPID" "ELECTRON_RUN_AS_NODE=$ELECTRON_RUN_AS_NODE" \\
  "NODE_OPTIONS=\${NODE_OPTIONS-unset}" "$@"
`;
const MISSING =
  "Can't find the Cushn app; it may have moved or been deleted. Open Cushn, then try again.\n";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cushn-launcher-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A packaged app's layout: the executable and the unpacked relay. */
function fakeApp(app: string): LauncherPaths {
  const paths = launcherPaths({
    isPackaged: true,
    execPath: join(app, "Contents", "MacOS", "Cushn"),
    appPath: join(app, "Contents", "Resources", "app.asar"),
    resourcesPath: join(app, "Contents", "Resources"),
  });
  mkdirSync(dirname(paths.electronPath), { recursive: true });
  writeFileSync(paths.electronPath, FAKE_ELECTRON, { mode: 0o755 });
  mkdirSync(dirname(paths.relayPath), { recursive: true });
  writeFileSync(paths.relayPath, "");
  return paths;
}

function run(script: string, env: Record<string, string> = {}) {
  const file = join(root, "cushn-mcp");
  writeFileSync(file, script, { mode: 0o755 });
  const result = spawnSync(file, [], {
    env: { PATH: `${join(root, "bin")}:/usr/bin:/bin`, ...env },
    encoding: "utf8",
  });
  return {
    code: result.status,
    lines: result.stdout.split("\n").slice(0, -1),
    stderr: result.stderr,
  };
}

describe("launcherPaths", () => {
  it("runs the stock Electron on the freshly built relay in development", () => {
    expect(
      launcherPaths({
        isPackaged: false,
        execPath: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        appPath: "/repo",
        resourcesPath: "/repo/node_modules/electron/dist/Electron.app/Contents/Resources",
      }),
    ).toEqual({
      electronPath: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      relayPath: "/repo/out/relay/index.js",
      appArgs: ["/repo"],
    });
  });

  it("runs the packaged app's binary on the relay unpacked from the asar", () => {
    expect(
      launcherPaths({
        isPackaged: true,
        execPath: "/Applications/Cushn.app/Contents/MacOS/Cushn",
        appPath: "/Applications/Cushn.app/Contents/Resources/app.asar",
        resourcesPath: "/Applications/Cushn.app/Contents/Resources",
      }),
    ).toEqual({
      electronPath: "/Applications/Cushn.app/Contents/MacOS/Cushn",
      relayPath: "/Applications/Cushn.app/Contents/Resources/app.asar.unpacked/out/relay/index.js",
      appArgs: [],
    });
  });

  it("runs an AppImage itself on a copy of the relay, never inside its per-launch mount", () => {
    expect(
      launcherPaths({
        isPackaged: true,
        execPath: "/tmp/.mount_CushnAb12Cd/cushn",
        appPath: "/tmp/.mount_CushnAb12Cd/resources/app.asar",
        resourcesPath: "/tmp/.mount_CushnAb12Cd/resources",
        appImage: "/home/ann/Apps/Cushn.AppImage",
      }),
    ).toEqual({
      electronPath: "/home/ann/Apps/Cushn.AppImage",
      relayPath: "/tmp/.mount_CushnAb12Cd/resources/app.asar.unpacked/out/relay/index.js",
      appArgs: [],
      copyRelay: true,
    });
  });

  it("matches the build and packaging config", () => {
    const viteConfig = readFileSync(join(REPO, "electron.vite.config.ts"), "utf8");
    const builderConfig = readFileSync(join(REPO, "electron-builder.yml"), "utf8");

    expect(viteConfig).toContain('outDir: resolve(__dirname, "out/relay")');
    expect(viteConfig).toContain('entryFileNames: "index.js"');
    expect(builderConfig).toMatch(/^ {2}- out\/relay\/\*\*$/m);
    expect(builderConfig).toMatch(new RegExp(`^appId: ${APP_ID.replaceAll(".", "\\.")}$`, "m"));
  });
});

describe("launcherScript", () => {
  posixOnly("execs the app's binary as Node on the relay, with every path quoted", () => {
    const app = fakeApp(join(root, `It's $HOME "here"`, "Cushn.app"));
    const socketPath = join(root, "Application Support", "Cushn's `mcp`", "cushn.sock");
    const secretPath = join(root, "Application Support", "Cushn's `mcp`", "$secret");

    const { code, lines, stderr } = run(launcherScript({ ...app, socketPath, secretPath }), {
      NODE_OPTIONS: "--require ./hook.js",
    });

    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(lines).toEqual([
      `ppid=${process.pid}`,
      "ELECTRON_RUN_AS_NODE=1",
      "NODE_OPTIONS=unset",
      app.relayPath,
      socketPath,
      secretPath,
      app.electronPath,
      "--background",
    ]);
  });

  posixOnly("passes the stock Electron the project to start in development", () => {
    const electronPath = join(root, `Electron's "dev"`, "Electron");
    mkdirSync(dirname(electronPath), { recursive: true });
    writeFileSync(electronPath, FAKE_ELECTRON, { mode: 0o755 });
    const relayPath = join(root, "repo", "out", "relay", "index.js");
    mkdirSync(dirname(relayPath), { recursive: true });
    writeFileSync(relayPath, "");
    const appPath = join(root, "repo $HOME");

    const { lines } = run(
      launcherScript({
        electronPath,
        relayPath,
        appArgs: [appPath],
        socketPath: SOCKET,
        secretPath: SECRET,
      }),
    );

    expect(lines.slice(3)).toEqual([
      relayPath,
      SOCKET,
      SECRET,
      electronPath,
      appPath,
      "--background",
    ]);
  });

  posixOnly("fails with a clear message when the app is gone, without searching for it", () => {
    const gone = join(root, "Applications", "Cushn.app");
    const script = launcherScript({
      electronPath: join(gone, "Contents", "MacOS", "Cushn"),
      relayPath: join(
        gone,
        "Contents",
        "Resources",
        "app.asar.unpacked",
        "out",
        "relay",
        "index.js",
      ),
      appArgs: [],
      socketPath: SOCKET,
      secretPath: SECRET,
    });

    const { code, lines, stderr } = run(script);

    expect(script).not.toContain("mdfind");
    expect(lines).toEqual([]);
    expect(stderr).toBe(MISSING);
    expect(code).toBe(1);
  });
});

describe("launcherCmd", () => {
  it("runs the app's binary as Node on the relay, with CRLF lines and % escaped", () => {
    const script = launcherCmd({
      electronPath: "C:\\Users\\Ann 100%\\Cushn\\Cushn.exe",
      relayPath: "C:\\Users\\Ann 100%\\Cushn\\resources\\app.asar.unpacked\\out\\relay\\index.js",
      appArgs: ["C:\\dev\\cushn 100%"],
      socketPath: "\\\\.\\pipe\\cushn-mcp-0123456789abcdef",
      secretPath: "C:\\Users\\Ann 100%\\AppData\\Roaming\\Cushn\\mcp\\secret",
    });

    expect(script.split("\r\n")).toEqual([
      "@echo off",
      "rem Cushn's tools for your agents: relays this stdio MCP session to the Cushn app, " +
        "starting it in the background if it isn't running.",
      "setlocal DisableDelayedExpansion",
      'set "electron=C:\\Users\\Ann 100%%\\Cushn\\Cushn.exe"',
      'set "relay=C:\\Users\\Ann 100%%\\Cushn\\resources\\app.asar.unpacked\\out\\relay\\index.js"',
      'set "socket=\\\\.\\pipe\\cushn-mcp-0123456789abcdef"',
      'set "secret=C:\\Users\\Ann 100%%\\AppData\\Roaming\\Cushn\\mcp\\secret"',
      'if not exist "%electron%" goto missing',
      'if not exist "%relay%" goto missing',
      "set NODE_OPTIONS=",
      "set ELECTRON_RUN_AS_NODE=1",
      '"%electron%" "%relay%" "%socket%" "%secret%" "%electron%" "C:\\dev\\cushn 100%%" --background',
      "exit /b %ERRORLEVEL%",
      ":missing",
      "echo Can't find the Cushn app; it may have moved or been deleted. Open Cushn, then try again. 1>&2",
      "exit /b 1",
      "",
    ]);
  });

  it("refuses a path a .cmd file can't hold", () => {
    expect(() =>
      launcherCmd({
        electronPath: 'C:\\a"b.exe',
        relayPath: "C:\\r.js",
        appArgs: [],
        socketPath: "\\\\.\\pipe\\p",
        secretPath: "C:\\s",
      }),
    ).toThrow();
  });
});

describe("writeLauncher and removeLauncher", () => {
  const target = {
    electronPath: "/Applications/Cushn.app/Contents/MacOS/Cushn",
    relayPath: "/Applications/Cushn.app/Contents/Resources/app.asar.unpacked/out/relay/index.js",
    appArgs: [],
    socketPath: SOCKET,
    secretPath: SECRET,
  };
  let home: string;
  let deps: LauncherDependencies;

  beforeEach(() => {
    home = join(root, "home");
    mkdirSync(home);
    deps = { fs: fsPromises, homeDir: home, platform: "darwin" };
  });

  const mode = (path: string) => statSync(path).mode & 0o777;

  posixOnly("writes an executable ~/.cushn/bin/cushn-mcp in user-only directories", async () => {
    const file = await writeLauncher(deps, target);

    expect(file).toBe(join(home, ".cushn", "bin", "cushn-mcp"));
    expect(file).toBe(launcherFile(deps));
    expect(readFileSync(file, "utf8")).toBe(launcherScript(target));
    expect(mode(file)).toBe(0o755);
    expect(mode(join(home, ".cushn"))).toBe(0o700);
    expect(mode(join(home, ".cushn", "bin"))).toBe(0o700);
  });

  posixOnly("leaves the mode of a directory it didn't create", async () => {
    mkdirSync(join(home, ".cushn"), { mode: 0o755 });

    await writeLauncher(deps, target);

    expect(mode(join(home, ".cushn"))).toBe(0o755);
    expect(mode(join(home, ".cushn", "bin"))).toBe(0o700);
  });

  it("replaces an existing launcher and leaves no temp file", async () => {
    await writeLauncher(deps, { ...target, socketPath: "/old.sock" });

    const file = await writeLauncher(deps, target);

    expect(readFileSync(file, "utf8")).toContain(`socket='${SOCKET}'`);
    expect(readdirSync(dirname(file))).toEqual(["cushn-mcp"]);
  });

  it("keeps the old launcher and drops the temp file when the swap fails", async () => {
    const file = await writeLauncher(deps, { ...target, socketPath: "/old.sock" });
    const failing: LauncherFs = {
      ...fsPromises,
      rename: () => Promise.reject(new Error("disk full")),
    };

    await expect(writeLauncher({ ...deps, fs: failing }, target)).rejects.toThrow("disk full");

    expect(readFileSync(file, "utf8")).toContain("socket='/old.sock'");
    expect(readdirSync(dirname(file))).toEqual(["cushn-mcp"]);
  });

  it("writes cushn-mcp.cmd on Windows", async () => {
    const files = new Map<string, string>();
    const fakeFs: LauncherFs = {
      mkdir: async () => undefined,
      writeFile: async (path, data) => void files.set(path, data),
      chmod: async () => {},
      copyFile: async () => {},
      rename: async (from, to) => {
        files.set(to, files.get(from) ?? "");
        files.delete(from);
      },
      rm: async (path) => void files.delete(path),
      rmdir: async () => {},
    };
    const windowsTarget = {
      electronPath: "C:\\Programs\\Cushn\\Cushn.exe",
      relayPath: "C:\\Programs\\Cushn\\resources\\app.asar.unpacked\\out\\relay\\index.js",
      appArgs: [],
      socketPath: "\\\\.\\pipe\\cushn-mcp-0123456789abcdef",
      secretPath: "C:\\Users\\ann\\AppData\\Roaming\\Cushn\\mcp\\secret",
    };

    const file = await writeLauncher(
      { fs: fakeFs, homeDir: "C:\\Users\\ann", platform: "win32" },
      windowsTarget,
    );

    expect(file).toBe("C:\\Users\\ann\\.cushn\\bin\\cushn-mcp.cmd");
    expect([...files]).toEqual([[file, launcherCmd(windowsTarget)]]);
  });

  describe("from an AppImage", () => {
    let appImage: LauncherTarget;

    beforeEach(() => {
      const mount = join(root, ".mount_CushnAb12Cd");
      appImage = {
        ...launcherPaths({
          isPackaged: true,
          execPath: join(mount, "cushn"),
          appPath: join(mount, "resources", "app.asar"),
          resourcesPath: join(mount, "resources"),
          appImage: join(root, "Apps", "Cushn.AppImage"),
        }),
        socketPath: SOCKET,
        secretPath: SECRET,
      };
      mkdirSync(dirname(appImage.electronPath), { recursive: true });
      writeFileSync(appImage.electronPath, FAKE_ELECTRON, { mode: 0o755 });
      mkdirSync(dirname(appImage.relayPath), { recursive: true });
      writeFileSync(appImage.relayPath, "// the relay", { mode: 0o755 });
      deps = { ...deps, platform: "linux" };
    });

    const copy = () => join(home, ".cushn", "bin", "cushn-relay.js");

    posixOnly(
      "copies the relay next to the launcher, which runs it after the mount is gone",
      async () => {
        const file = await writeLauncher(deps, appImage);
        rmSync(join(root, ".mount_CushnAb12Cd"), { recursive: true });

        expect(readFileSync(copy(), "utf8")).toBe("// the relay");
        expect(mode(copy())).toBe(0o644);
        expect(readFileSync(file, "utf8")).not.toContain(".mount_");
        const { code, lines, stderr } = run(readFileSync(file, "utf8"));
        expect(stderr).toBe("");
        expect(code).toBe(0);
        expect(lines.slice(3)).toEqual([
          copy(),
          SOCKET,
          SECRET,
          appImage.electronPath,
          "--background",
        ]);
      },
    );

    it("replaces an earlier copy and leaves no temp file", async () => {
      await writeLauncher(deps, appImage);
      writeFileSync(appImage.relayPath, "// the new relay");

      await writeLauncher(deps, appImage);

      expect(readFileSync(copy(), "utf8")).toBe("// the new relay");
      expect(readdirSync(dirname(copy())).sort()).toEqual(["cushn-mcp", "cushn-relay.js"]);
    });

    it("writes no launcher when the copy fails", async () => {
      const failing: LauncherFs = {
        ...fsPromises,
        copyFile: () => Promise.reject(new Error("disk full")),
      };

      await expect(writeLauncher({ ...deps, fs: failing }, appImage)).rejects.toThrow("disk full");

      expect(readdirSync(join(home, ".cushn", "bin"))).toEqual([]);
    });

    it("removes the copy with the launcher", async () => {
      await writeLauncher(deps, appImage);

      await removeLauncher(deps);

      expect(existsSync(join(home, ".cushn"))).toBe(false);
    });
  });

  it("copies no relay outside an AppImage", async () => {
    const file = await writeLauncher(deps, target);

    expect(readdirSync(dirname(file))).toEqual(["cushn-mcp"]);
  });

  it("removes the launcher and the directories it leaves empty", async () => {
    await writeLauncher(deps, target);

    await removeLauncher(deps);

    expect(existsSync(join(home, ".cushn"))).toBe(false);
  });

  it("keeps ~/.cushn and ~/.cushn/bin while they hold anything else", async () => {
    await writeLauncher(deps, target);
    writeFileSync(join(home, ".cushn", "bin", "notes.txt"), "mine");
    mkdirSync(join(home, ".cushn", "skills"));

    await removeLauncher(deps);

    expect(readdirSync(join(home, ".cushn", "bin"))).toEqual(["notes.txt"]);
    rmSync(join(home, ".cushn", "bin", "notes.txt"));
    await removeLauncher(deps);
    expect(readdirSync(join(home, ".cushn"))).toEqual(["skills"]);
  });

  it("does nothing when there is no launcher", async () => {
    await expect(removeLauncher(deps)).resolves.toBeUndefined();
    expect(readdirSync(home)).toEqual([]);
  });
});
