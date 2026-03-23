import { contextBridge, ipcRenderer } from "electron";
import type { AppState, MonitoringConfig } from "../shared/types.js";

type StateListener = (state: AppState) => void;

const api = {
  startMonitoring: (config: MonitoringConfig) =>
    ipcRenderer.invoke("monitoring:start", config) as Promise<AppState>,
  stopMonitoring: () =>
    ipcRenderer.invoke("monitoring:stop") as Promise<AppState>,
  getState: () => ipcRenderer.invoke("monitoring:getState") as Promise<AppState>,
  selectFolder: () =>
    ipcRenderer.invoke("dialog:selectFolder") as Promise<string | null>,
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
