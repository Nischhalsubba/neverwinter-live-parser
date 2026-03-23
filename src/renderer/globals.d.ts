import type { AppState, MonitoringConfig } from "../shared/types";

type NeverwinterApi = {
  startMonitoring: (config: MonitoringConfig) => Promise<AppState>;
  stopMonitoring: () => Promise<AppState>;
  getState: () => Promise<AppState>;
  selectFolder: () => Promise<string | null>;
  onState: (listener: (state: AppState) => void) => () => void;
};

declare global {
  interface Window {
    neverwinterApi: NeverwinterApi;
  }
}

export {};
