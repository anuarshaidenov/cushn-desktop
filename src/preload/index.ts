import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import {
  CHANGED_CHANNEL,
  CUSHN_API_KEY,
  type ChangedEvent,
  type CushnBridge,
  createBridgeMethods,
} from "@shared/api";

// One function per contract method, generated from `cushnContract`, plus the
// change event; nothing else (in particular no raw `ipcRenderer`) reaches the page.
const bridge: CushnBridge = {
  platform: process.platform,
  ...createBridgeMethods((channel, args) => ipcRenderer.invoke(channel, args)),
  onChanged: (listener) => {
    // A wrapper per subscription: the page gets the payload, never the `IpcRendererEvent`.
    const forward = (_event: IpcRendererEvent, event: ChangedEvent) => listener(event);
    ipcRenderer.on(CHANGED_CHANNEL, forward);
    return () => {
      ipcRenderer.removeListener(CHANGED_CHANNEL, forward);
    };
  },
};

contextBridge.exposeInMainWorld(CUSHN_API_KEY, bridge);
