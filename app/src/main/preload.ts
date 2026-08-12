import { createRequire } from "node:module";
import type {
  AppState,
  DiscoveredLogCandidate,
  MonitoringConfig,
  SystemUsageSnapshot
} from "../shared/types.js";
import type { ErrorLogEntry } from "./errorLogger.js";

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
  startManualRecording: () =>
    ipcRenderer.invoke("monitoring:startManualRecording") as Promise<AppState>,
  stopActiveRecording: () =>
    ipcRenderer.invoke("monitoring:stopActiveRecording") as Promise<AppState>,
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
  listLogs: () =>
    ipcRenderer.invoke("maintenance:listLogs") as Promise<ErrorLogEntry[]>,
  readLog: (fileName: string) =>
    ipcRenderer.invoke("maintenance:readLog", fileName) as Promise<string>,
  logRendererError: (message: string, context?: string) =>
    ipcRenderer.invoke("maintenance:logRendererError", { message, context }) as Promise<void>,
  onState: (listener: StateListener) => {
    let latestState: AppState | null = null;
    const wrappedState = (_event: Electron.IpcRendererEvent, state: AppState) => {
      latestState = state;
      listener(state);
    };
    const wrappedSystem = (
      _event: Electron.IpcRendererEvent,
      system: SystemUsageSnapshot
    ) => {
      if (!latestState) {
        return;
      }
      latestState = {
        ...latestState,
        system
      };
      listener(latestState);
    };
    ipcRenderer.on("monitoring:state", wrappedState);
    ipcRenderer.on("monitoring:system", wrappedSystem);
    return () => {
      ipcRenderer.removeListener("monitoring:state", wrappedState);
      ipcRenderer.removeListener("monitoring:system", wrappedSystem);
    };
  }
};

contextBridge.exposeInMainWorld("neverwinterApi", api);

declare global {
  interface Window {
    neverwinterApi: typeof api;
  }
}
