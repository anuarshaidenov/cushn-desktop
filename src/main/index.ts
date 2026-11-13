import * as fsPromises from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  Menu,
  nativeTheme,
  net,
  screen,
  shell,
} from "electron";
import { autoUpdater } from "electron-updater";
import type { McpSocketStatus } from "@shared/api";
import { APP_ID, APP_NAME } from "@shared/app";
import icon from "../../build/icon-padded.png?asset";
import { createConnections } from "./agents/connections";
import { createDetector, nodeDetectorDependencies } from "./agents/detect";
import {
  launcherPaths,
  nodeLauncherDependencies,
  removeLauncher,
  writeLauncher,
} from "./agents/launcher";
import { type AgentService, createAgentService } from "./agents/service";
import { offerMoveToApplications } from "./applicationsFolder";
import { electronBackupDependencies } from "./backupDialogs";
import { createChangeNotifier } from "./changes";
import { electronFileDependencies } from "./fileDialogs";
import { type AppDatabase, type DatabaseHandle, openDatabase } from "./db";
import { createHandlers } from "./ipc/handlers";
import { registerIpc } from "./ipc/register";
import { BACKGROUND_FLAG, IDLE_QUIT_MS, type Lifetime, createLifetime } from "./lifetime";
import { createCushnMcpServer } from "./mcp/server";
import {
  type McpSocketServer,
  describeListenError,
  mcpSecretPath,
  mcpSocketPath,
  serveMcp,
} from "./mcp/socket";
import { menuTemplate } from "./menu";
import * as budgets from "./repositories/budgets";
import { type Rates, createRates } from "./repositories/rates";
import * as settings from "./repositories/settings";
import { windowTheme } from "./theme";
import { withThemeSync } from "./themeSync";
import { UPDATE_CHECK_INTERVAL_MS, createUpdater } from "./updater";
import { MIN_WINDOW_SIZE, restoreWindowSize, saveWindowSize } from "./windowState";

let database: DatabaseHandle | undefined;
let mcpSocket: McpSocketServer | undefined;
let mcpSocketStatus: McpSocketStatus = { state: "starting" };

/** An agent's relay started the app: no window or dock icon until the user asks for one. */
const background = process.argv.includes(BACKGROUND_FLAG);

/**
 * Migrations ship next to the app: `drizzle/` at the project root in
 * development, copied to `resources/drizzle` by `extraResources` when packaged.
 */
function migrationsFolder(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), "drizzle");
}

const rendererIndexFile = join(__dirname, "../renderer/index.html");
const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;

/**
 * macOS: no title bar; the traffic lights sit in the app's top header row, centred on it
 * (`styles.css` `app-drag`). `titleBarOverlay` exposes their extent to CSS as
 * `env(titlebar-area-x)`, unset in fullscreen where they hide.
 *
 * The window is vibrant and the page transparent where the sidebar is (`styles.css` `vibrant`).
 * No `backgroundColor` there: Electron would paint the page with it, over the blur.
 */
const trafficLightPosition = { x: 20, y: 20 };
const platformOptions = (backgroundColor: string): BrowserWindowConstructorOptions =>
  process.platform === "darwin"
    ? { titleBarStyle: "hidden", trafficLightPosition, titleBarOverlay: true, vibrancy: "sidebar" }
    : { backgroundColor };

function createWindow(db: AppDatabase, lifetime: Lifetime): void {
  // Before the window exists, so its first paint already has the stored theme.
  const { themeSource, backgroundColor } = windowTheme(settings.get(db).settings.theme);
  nativeTheme.themeSource = themeSource;

  const userData = app.getPath("userData");
  // A window given no position opens on the primary display.
  const { width, height } = restoreWindowSize(userData, screen.getPrimaryDisplay().workAreaSize);

  const window = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    ...platformOptions(backgroundColor),
    // macOS and Windows take the icon from the packaged app; Linux windows have none to take.
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
    purgeTrash();
  });
  lifetime.windowOpened();
  // Not while running windowless for an agent: an update would swap the app under its relay.
  updater.start();
  window.once("closed", () => lifetime.windowClosed());
  // The normal bounds, so a maximized or fullscreen window doesn't save the screen's size.
  window.on("close", () => saveWindowSize(userData, window.getNormalBounds()));

  // On resize, Electron reports `titlebar-area-x` while macOS still has the traffic lights at
  // their default spot, so the header padding jitters. Re-applying the position re-reports it.
  if (process.platform === "darwin") {
    window.on("resize", () => {
      if (!window.isFullScreen()) window.setWindowButtonPosition(trafficLightPosition);
    });
  }

  // Open external links in the default browser; never spawn new Electron windows.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) void shell.openExternal(url);
    return { action: "deny" };
  });

  // The renderer is a hash-routed SPA: it never navigates the page itself.
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(rendererIndexFile);
  }
}

/** The user asked for Cushn: a background app gets its dock icon back and a window. */
function showWindow(db: AppDatabase, lifetime: Lifetime): void {
  void app.dock?.show();
  const [window] = BrowserWindow.getAllWindows();
  if (!window) return createWindow(db, lifetime);
  if (window.isMinimized()) window.restore();
  window.focus();
}

/** Every open window refetches these query roots after an agent's write. */
const notifyChanged = createChangeNotifier(() =>
  BrowserWindow.getAllWindows().map((window) => window.webContents),
);

const updater = createUpdater({
  backend: autoUpdater,
  enabled: app.isPackaged,
  intervalMs: UPDATE_CHECK_INTERVAL_MS,
  onStatusChanged: () => notifyChanged(["updates"]),
  logError: (message, error) => console.error(message, error),
});

/** When to purge the trash with no window to wait for (started for an agent). */
const TRASH_PURGE_DELAY_MS = 5000;
let trashPurged = false;

/**
 * Hard-deletes expired trash once per launch, off the path to the first paint: when the first
 * window is ready to show, else after `TRASH_PURGE_DELAY_MS`. Open screens refetch after it.
 */
function purgeTrash(): void {
  if (trashPurged || !database) return;
  trashPurged = true;
  try {
    if (budgets.purgeTrash(database.db) > 0) notifyChanged(["budgets", "expenses", "home"]);
  } catch (error) {
    // The trash is retried on the next launch; it never blocks opening the app.
    console.error("Failed to purge the trash", error);
  }
}

function mcpPaths() {
  const userData = app.getPath("userData");
  return {
    socketPath: mcpSocketPath(userData, process.platform),
    secretPath: mcpSecretPath(userData, process.platform),
  };
}

/**
 * Agents reach the MCP server through this socket; the app runs without it if it fails, and
 * Settings → Agents says why.
 */
async function startMcpSocket(db: AppDatabase, rates: Rates, lifetime: Lifetime): Promise<void> {
  try {
    const { socketPath, secretPath } = mcpPaths();
    mcpSocket = await serveMcp({
      path: socketPath,
      secretPath,
      createServer: () =>
        createCushnMcpServer({ db, rates, notifyChanged, appVersion: app.getVersion() }),
      onConnectionsChanged: lifetime.connectionsChanged,
    });
    mcpSocketStatus = { state: "listening" };
  } catch (error) {
    console.error("Failed to start the MCP socket", error);
    mcpSocketStatus = { state: "failed", message: describeListenError(error) };
  }
}

/** Detection, the `cushn-mcp` launcher and each client's registration, on the real machine. */
function createAgents(): AgentService {
  const detectorDeps = nodeDetectorDependencies();
  const detector = createDetector(detectorDeps);
  const launcherDeps = nodeLauncherDependencies();
  const paths = launcherPaths({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    appImage: process.platform === "linux" ? process.env.APPIMAGE : undefined,
  });
  return createAgentService({
    detector,
    connections: createConnections({
      fs: fsPromises,
      run: detectorDeps.run,
      childEnv: detector.childEnv,
      homeDir: homedir(),
      platform: process.platform,
      userData: app.getPath("userData"),
      now: Date.now,
    }),
    launcher: {
      write: () => writeLauncher(launcherDeps, { ...paths, ...mcpPaths() }),
      remove: () => removeLauncher(launcherDeps),
    },
    socketStatus: () => mcpSocketStatus,
  });
}

/** Resolves true when the app is relaunching from the Applications folder. */
function offerMove(): Promise<boolean> {
  return offerMoveToApplications({
    platform: process.platform,
    isPackaged: app.isPackaged,
    background,
    isInApplicationsFolder: () => app.isInApplicationsFolder(),
    moveToApplicationsFolder: () => app.moveToApplicationsFolder(),
    showMessageBox: (options) => dialog.showMessageBox(options),
    fs: fsPromises,
    userData: app.getPath("userData"),
    logError: (message, error) => console.error(message, error),
  });
}

// One instance owns the database and the MCP socket; a second launch focuses the first.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();
else if (background) app.dock?.hide();

app.setAppUserModelId(APP_ID);

void app.whenReady().then(async () => {
  if (!isFirstInstance) return;

  const menu = menuTemplate({
    platform: process.platform,
    isPackaged: app.isPackaged,
    openExternal: (url) => void shell.openExternal(url),
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

  // `pnpm dev` runs the stock Electron.app; a packaged build carries `build/icon.icon` instead.
  if (!app.isPackaged) app.dock?.setIcon(icon);

  // A move quits and relaunches the app, so it is offered before the database opens.
  if (await offerMove()) return;

  try {
    database = openDatabase(join(app.getPath("userData"), "cushn.db"), {
      migrationsFolder: migrationsFolder(),
    });
  } catch (error) {
    dialog.showErrorBox(
      `${APP_NAME} could not open its database`,
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
    return;
  }

  // Before any window exists, so no renderer call can race the registration.
  const { db } = database;
  // Shared by IPC and MCP, so concurrent callers share one request.
  const rates = createRates({ fetch: (url, init) => net.fetch(url, init), now: Date.now });
  const agents = createAgents();
  const handlers = withThemeSync(
    createHandlers({
      backup: electronBackupDependencies(),
      files: electronFileDependencies,
      rates,
      agents,
      updater,
    }),
    (theme) => {
      nativeTheme.themeSource = windowTheme(theme).themeSource;
    },
  );
  registerIpc(handlers, {
    context: { db },
    trusted: { devServerUrl, indexFileUrl: pathToFileURL(rendererIndexFile).href },
  });

  const lifetime = createLifetime({
    background,
    platform: process.platform,
    idleMs: IDLE_QUIT_MS,
    quit: () => app.quit(),
  });
  if (!background) createWindow(db, lifetime);
  setTimeout(purgeTrash, TRASH_PURGE_DELAY_MS);
  void startMcpSocket(db, rates, lifetime);
  agents.refreshLauncher().catch((error: unknown) => {
    console.error("Failed to refresh the cushn-mcp launcher", error);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) showWindow(db, lifetime);
  });

  // Another relay's launch while this one runs (or still starts) asks for no window.
  app.on("second-instance", (_event, argv) => {
    if (!argv.includes(BACKGROUND_FLAG)) showWindow(db, lifetime);
  });
});

// Without a listener Electron quits when the last window closes; `lifetime` decides instead.
app.on("window-all-closed", () => {});

app.on("will-quit", () => {
  // Drops agent connections synchronously, before the database they use closes.
  void mcpSocket?.close();
  mcpSocket = undefined;
  database?.close();
  database = undefined;
});
