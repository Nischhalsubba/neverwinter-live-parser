import type {
  AppState,
  DiscoveredLogCandidate,
  MonitoringConfig
} from "../shared/types";

type NeverwinterApi = {
  startMonitoring: (config: MonitoringConfig) => Promise<AppState>;
  importLogFile: (filePath: string) => Promise<AppState>;
  stopMonitoring: () => Promise<AppState>;
  getBootstrapState: () => Promise<AppState>;
  getState: () => Promise<AppState>;
  discoverLogs: () => Promise<DiscoveredLogCandidate[]>;
  selectFolder: () => Promise<string | null>;
  selectLogFile: () => Promise<string | null>;
  clearData: () => Promise<AppState>;
  clearLogs: () => Promise<string>;
  getLogDirectory: () => Promise<string>;
  logRendererError: (message: string, context?: string) => Promise<void>;
  onState: (listener: (state: AppState) => void) => () => void;
};

declare global {
  interface Window {
    neverwinterApi?: NeverwinterApi;
  }
}

export {};
