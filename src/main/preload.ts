import { createRequire } from "node:module";
import type {
  AppState,
  DiscoveredLogCandidate,
  MonitoringConfig
} from "../shared/types.js";

type StateListener = (state: AppState) => void;
const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { contextBridge, ipcRenderer } = electron;

const api = {
  startMonitoring: (config: MonitoringConfig) =>
    ipcRenderer.invoke("monitoring:start", config) as Promise<AppState>,
  importLogFile: (filePath: string) =>
    ipcRenderer.invoke("monitoring:importFile", filePath) as Promise<AppState>,
  stopMonitoring: () =>
    ipcRenderer.invoke("monitoring:stop") as Promise<AppState>,
  getBootstrapState: () =>
    ipcRenderer.invoke("monitoring:getBootstrapState") as Promise<AppState>,
  getState: () => ipcRenderer.invoke("monitoring:getState") as Promise<AppState>,
  discoverLogs: () =>
    ipcRenderer.invoke("monitoring:discoverLogs") as Promise<DiscoveredLogCandidate[]>,
  selectFolder: () =>
    ipcRenderer.invoke("dialog:selectFolder") as Promise<string | null>,
  selectLogFile: () =>
    ipcRenderer.invoke("dialog:selectLogFile") as Promise<string | null>,
  clearData: () =>
    ipcRenderer.invoke("maintenance:clearData") as Promise<AppState>,
  clearLogs: () =>
    ipcRenderer.invoke("maintenance:clearLogs") as Promise<string>,
  getLogDirectory: () =>
    ipcRenderer.invoke("maintenance:getLogDirectory") as Promise<string>,
  logRendererError: (message: string, context?: string) =>
    ipcRenderer.invoke("maintenance:logRendererError", { message, context }) as Promise<void>,
  onState: (listener: StateListener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: AppState) => {
      listener(state);
    };
    ipcRenderer.on("monitoring:state", wrapped);
    return () => {
      ipcRenderer.removeListener("monitoring:state", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("neverwinterApi", api);

declare global {
  interface Window {
    neverwinterApi: typeof api;
  }
}
