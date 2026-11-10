/**
 * Offers to move Cushn into the Applications folder. Opened from Downloads or straight from the
 * disk image, macOS runs it from a random read-only path (App Translocation): Squirrel.Mac can't
 * update it there, and the `cushn-mcp` launcher would record that path. Asked on a packaged macOS
 * build's own launch, never an agent relay's (`BACKGROUND_FLAG`), and before the database opens,
 * since a move quits and relaunches the app from its new place. "Don't ask again" leaves a file in
 * userData. Electron-free: `index.ts` passes `app`, `dialog` and the file system.
 */
import { join } from "node:path";
import type { MessageBoxOptions, MessageBoxReturnValue } from "electron";
import { APP_NAME } from "@shared/app";

/** While this file exists in userData, the app never asks. */
export const DONT_ASK_FILE = "dont-move-to-applications";

const DONT_ASK_NOTE = `${APP_NAME} won't offer to move itself to the Applications folder while this file exists.\n`;

const MOVE = 0;

const PROMPT: MessageBoxOptions = {
  type: "question",
  message: `Move ${APP_NAME} to the Applications folder?`,
  detail: `From there, ${APP_NAME} can keep itself up to date, and your agents can always find it.`,
  buttons: ["Move to Applications", "Not Now"],
  defaultId: MOVE,
  cancelId: 1,
  checkboxLabel: "Don't ask again",
};

export interface ApplicationsFolderFs {
  access(path: string): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
}

export interface MoveToApplicationsOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  /** Started with `BACKGROUND_FLAG`: an agent's relay is waiting for this launch. */
  background: boolean;
  isInApplicationsFolder(): boolean;
  /** Electron's: true once the app is in place and quitting to relaunch from there. */
  moveToApplicationsFolder(): boolean;
  showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
  fs: ApplicationsFolderFs;
  userData: string;
  logError(message: string, error: unknown): void;
}

/**
 * Asks, and moves if the user agrees. Resolves true when the app is relaunching from the
 * Applications folder, so this launch goes no further; false to launch as usual, whatever failed.
 */
export async function offerMoveToApplications(
  options: MoveToApplicationsOptions,
): Promise<boolean> {
  const { platform, isPackaged, background, fs, logError } = options;
  if (platform !== "darwin" || !isPackaged || background || options.isInApplicationsFolder()) {
    return false;
  }
  const dontAskFile = join(options.userData, DONT_ASK_FILE);
  try {
    if (await exists(fs, dontAskFile)) return false;
    const { response, checkboxChecked } = await options.showMessageBox(PROMPT);
    if (checkboxChecked) {
      await fs.writeFile(dontAskFile, DONT_ASK_NOTE).catch((error: unknown) => {
        logError("Failed to save Don't ask again", error);
      });
    }
    // False when the user cancels the authorization prompt; throws when the copy fails.
    return response === MOVE && options.moveToApplicationsFolder();
  } catch (error) {
    logError("Failed to move to the Applications folder", error);
    return false;
  }
}

async function exists(fs: ApplicationsFolderFs, path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
