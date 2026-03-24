import { app, BrowserWindow, dialog, ipcMain } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import { LogMonitorService } from "../core/monitoring/logMonitorService.js";
import type { AppState, MonitoringConfig } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const monitor = new LogMonitorService();
const settingsStore = new Store<{ selectedLogFolder: string | null }>({
  defaults: {
    selectedLogFolder: null
  }
});

let mainWindow: BrowserWindow | null = null;
let telemetryTimer: NodeJS.Timeout | null = null;
let lastCpuUsage = process.cpuUsage();
let lastCpuSampleAt = process.hrtime.bigint();

function toMegabytes(value: number): number {
  return Number((value / (1024 * 1024)).toFixed(1));
}

function getSystemUsage() {
  const now = process.hrtime.bigint();
  const elapsedMicros = Number(now - lastCpuSampleAt) / 1000;
  const cpuUsage = process.cpuUsage(lastCpuUsage);
  const cpuTimeMicros = cpuUsage.user + cpuUsage.system;
  const processCpuPercent =
    elapsedMicros > 0
      ? Number(
          (
            (cpuTimeMicros / elapsedMicros / Math.max(1, os.cpus().length)) *
            100
          ).toFixed(1)
        )
      : 0;

  lastCpuUsage = process.cpuUsage();
  lastCpuSampleAt = now;

  const processMemoryMb = toMegabytes(process.memoryUsage().rss);
  const systemMemoryTotalMb = toMegabytes(os.totalmem());
  const systemMemoryFreeMb = toMegabytes(os.freemem());
  const systemMemoryUsedMb = Number(
    Math.max(0, systemMemoryTotalMb - systemMemoryFreeMb).toFixed(1)
  );
  const systemMemoryPercent =
    systemMemoryTotalMb > 0
      ? Number(((systemMemoryUsedMb / systemMemoryTotalMb) * 100).toFixed(1))
      : 0;

  return {
    sampledAt: Date.now(),
    processCpuPercent,
    processMemoryMb,
    systemMemoryUsedMb,
    systemMemoryTotalMb,
    systemMemoryPercent,
    uptimeSec: Math.floor(process.uptime())
  };
}

function withTelemetry(state: AppState): AppState {
  return {
    ...state,
    system: getSystemUsage()
  };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0f1624",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function canEmitToWindow(): boolean {
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
  );
}

function emitState(state: AppState): void {
  if (!canEmitToWindow()) {
    return;
  }
  mainWindow!.webContents.send("monitoring:state", withTelemetry(state));
}

monitor.on("state", (state) => emitState(state));

ipcMain.handle("monitoring:start", async (_event, config: MonitoringConfig) => {
  settingsStore.set("selectedLogFolder", config.folderPath);
  return withTelemetry(await monitor.start(config));
});

ipcMain.handle("monitoring:importFile", async (_event, filePath: string) =>
  withTelemetry(await monitor.importLogFile(filePath))
);
ipcMain.handle("monitoring:stop", async () => withTelemetry(await monitor.stop()));
ipcMain.handle("monitoring:getState", async () => {
  const state = monitor.getState();
  const savedFolder = settingsStore.get("selectedLogFolder");
  return withTelemetry({
    ...state,
    selectedLogFolder: state.selectedLogFolder ?? savedFolder
  });
});

ipcMain.handle("dialog:selectFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0] ?? null;
});

ipcMain.handle("dialog:selectLogFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Neverwinter combat logs", extensions: ["log", "txt"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0] ?? null;
});

app.whenReady().then(() => {
  createWindow();
  telemetryTimer = setInterval(() => {
    emitState(monitor.getState());
  }, 2000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
