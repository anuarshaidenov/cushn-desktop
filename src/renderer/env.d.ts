/// <reference types="vite/client" />

import type { CushnBridge } from "@shared/api";

declare global {
  interface Window {
    /** The preload bridge; only `src/renderer/data/` may use it. */
    cushn: CushnBridge;
  }
}
