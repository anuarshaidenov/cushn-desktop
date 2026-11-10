import { ipcMain, type WebFrameMain } from "electron";
import { cushnMethods } from "@shared/api";
import { fail } from "@shared/errors";
import {
  type CushnHandlers,
  type ErrorReporter,
  type HandlerContext,
  createDispatcher,
} from "./handler";
import { type TrustedRenderer, isTrustedSenderUrl } from "./sender";

export interface RegisterIpcOptions {
  context: HandlerContext;
  trusted: TrustedRenderer;
  report?: ErrorReporter;
}

/**
 * Binds every contract channel to its handler with `ipcMain.handle`. Calls
 * from any frame other than our renderer's top frame get FORBIDDEN without
 * running the handler. Call once, before the first window loads. Returns a
 * function that removes the handlers.
 */
export function registerIpc(handlers: CushnHandlers, options: RegisterIpcOptions): () => void {
  const dispatch = createDispatcher(handlers, options.context, options.report);
  for (const [, , channel] of cushnMethods) {
    ipcMain.handle(channel, (event, input: unknown) => {
      if (!isTrustedFrame(event.senderFrame, options.trusted)) {
        return fail({ code: "FORBIDDEN", message: "Forbidden" });
      }
      return dispatch(channel, input);
    });
  }
  return () => {
    for (const [, , channel] of cushnMethods) ipcMain.removeHandler(channel);
  };
}

function isTrustedFrame(frame: WebFrameMain | null, trusted: TrustedRenderer): boolean {
  return frame !== null && frame.parent === null && isTrustedSenderUrl(frame.url, trusted);
}
