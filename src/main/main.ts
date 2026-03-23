import { app, BrowserWindow, dialog, ipcMain } from "electron";
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
}

function emitState(state: AppState): void {
  mainWindow?.webContents.send("monitoring:state", state);
}

monitor.on("state", (state) => emitState(state));

ipcMain.handle("monitoring:start", async (_event, config: MonitoringConfig) => {
  settingsStore.set("selectedLogFolder", config.folderPath);
  return monitor.start(config);
});

ipcMain.handle("monitoring:importFile", async (_event, filePath: string) =>
  monitor.importLogFile(filePath)
);
ipcMain.handle("monitoring:stop", async () => monitor.stop());
ipcMain.handle("monitoring:getState", async () => {
  const state = monitor.getState();
  const savedFolder = settingsStore.get("selectedLogFolder");
  return {
    ...state,
    selectedLogFolder: state.selectedLogFolder ?? savedFolder
  };
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
