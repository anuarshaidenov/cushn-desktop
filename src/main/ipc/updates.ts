import type { Updater } from "../updater";
import { type CushnHandlers, noArgs } from "./handler";

export function createUpdateHandlers(updater: Updater): CushnHandlers["updates"] {
  return {
    status: {
      args: noArgs,
      run: () => updater.status(),
    },
    install: {
      args: noArgs,
      run: () => {
        updater.install();
        return { success: true };
      },
    },
  };
}
