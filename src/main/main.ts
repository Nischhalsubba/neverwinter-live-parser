import type { Dirent } from "node:fs";
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LogMonitorService } from "../core/monitoring/logMonitorService.js";
import {
  clearErrorLogs,
  getLogDirectory,
  listErrorLogs,
  readErrorLog,
  writeErrorLog,
  writeRendererLog
} from "./errorLogger.js";
import type {
  AppState,
  DiscoveredLogCandidate,
  MonitoringConfig
} from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const { app, BrowserWindow, dialog, ipcMain } = electron;

function configureRuntimePaths(): void {
  const runtimeRoot = isDev
    ? path.join(os.tmpdir(), "neverwinter-live-parser", `dev-${process.pid}`)
    : path.join(os.tmpdir(), "neverwinter-live-parser", "runtime");
  const userDataPath = path.join(runtimeRoot, "user-data");
  const sessionDataPath = path.join(runtimeRoot, "session-data");
  const gpuCachePath = path.join(runtimeRoot, "gpu-cache");

  try {
    mkdirSync(userDataPath, { recursive: true });
    mkdirSync(sessionDataPath, { recursive: true });
    mkdirSync(gpuCachePath, { recursive: true });
    app.setPath("userData", userDataPath);
    app.setPath("sessionData", sessionDataPath);

    // Keep Chromium's profile and cache files out of locked/synced Windows
    // folders, and avoid cache collisions between rapid dev restarts.
    app.commandLine.appendSwitch("disk-cache-dir", gpuCachePath);
    app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  } catch {
    // Fall back to Electron defaults if the temp directory is unavailable.
  }
}

configureRuntimePaths();
app.setName("neverwinter-live-parser");
const monitor = new LogMonitorService();

type StoredSettings = {
  selectedLogFolder: string | null;
};

const DEFAULT_SETTINGS: StoredSettings = {
  selectedLogFolder: null
};

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let telemetryTimer: NodeJS.Timeout | null = null;
let lastCpuUsage = process.cpuUsage();
let lastCpuSampleAt = process.hrtime.bigint();

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSettings(): Promise<StoredSettings> {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(raw)
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function writeSettings(next: StoredSettings): Promise<void> {
  try {
    await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
    await fs.writeFile(getSettingsPath(), JSON.stringify(next, null, 2), "utf8");
  } catch (error) {
    void writeErrorLog(error, "Failed to write settings.json");
  }
}

async function clearStoredAppData(): Promise<void> {
  try {
    await fs.rm(getSettingsPath(), { force: true });
  } catch (error) {
    void writeErrorLog(error, "Failed to remove settings.json during clear data");
  }
}

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

function toBootstrapState(state: AppState): AppState {
  return {
    ...state,
    analysis: {
      ...state.analysis,
      combatants: []
    }
  };
}

function getDriveRoots(): string[] {
  const drives: string[] = [];
  for (let charCode = 65; charCode <= 90; charCode += 1) {
    drives.push(`${String.fromCharCode(charCode)}:\\`);
  }
  return drives;
}

function parseCombatLogTimestamp(filePath: string): string {
  const match = path
    .basename(filePath)
    .match(/combatlog_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:\.(?:log|txt))?$/i);
  if (!match) {
    return "Unknown timestamp";
  }

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findLatestCombatLog(folderPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const logFiles = await Promise.all(
      entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^combatlog_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:\.(?:log|txt))?$/i.test(entry.name)
      )
      .map(async (entry) => {
        const fullPath = path.join(folderPath, entry.name);
        const stats = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stats.mtimeMs };
      })
    );

    logFiles.sort((left, right) => {
      if (left.mtimeMs !== right.mtimeMs) {
        return right.mtimeMs - left.mtimeMs;
      }
      return right.fullPath.localeCompare(left.fullPath);
    });

    return logFiles[0]?.fullPath ?? null;
  } catch {
    return null;
  }
}

async function discoverCombatLogCandidates(): Promise<DiscoveredLogCandidate[]> {
  const candidates = new Map<string, DiscoveredLogCandidate>();

  const roots = [];
  for (const drive of getDriveRoots()) {
    if (await pathExists(drive)) {
      roots.push(drive);
    }
  }

  const ignoredDirectoryNames = new Set([
    "$recycle.bin",
    "system volume information",
    "windows",
    "programdata",
    "recovery",
    "msocache",
    "perflogs",
    "temp",
    "tmp"
  ]);

  const queue = [...roots];

  while (queue.length) {
    const folderPath = queue.shift()!;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(folderPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const latestLog = await findLatestCombatLog(folderPath);

    if (latestLog) {
      candidates.set(folderPath.toLowerCase(), {
        folderPath,
        filePath: latestLog,
        timestampLabel: parseCombatLogTimestamp(latestLog),
        sourceHint: `Detected on drive ${path.parse(folderPath).root}`
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const normalizedName = entry.name.toLowerCase();
      if (
        ignoredDirectoryNames.has(normalizedName) ||
        normalizedName.startsWith("$") ||
        normalizedName === "node_modules"
      ) {
        continue;
      }
      queue.push(path.join(folderPath, entry.name));
    }
  }

  return Array.from(candidates.values()).sort((left, right) => {
    if (left.filePath && right.filePath) {
      return right.filePath.localeCompare(left.filePath);
    }
    if (left.filePath) {
      return -1;
    }
    if (right.filePath) {
      return 1;
    }
    return left.folderPath.localeCompare(right.folderPath);
  }).slice(0, 20);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: "#0E1117",
    titleBarStyle: process.platform === "win32" ? "hidden" : "default",
    titleBarOverlay:
      process.platform === "win32"
        ? {
            color: "#111722",
            symbolColor: "#F4F1E8",
            height: 46
          }
        : false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("render-process-gone", (_event: unknown, details: { reason: string; exitCode: number }) => {
    void writeErrorLog(
      new Error(`Renderer process exited: ${details.reason} (exitCode=${details.exitCode})`),
      "Renderer process gone"
    );
  });
}

function canEmitToWindow(): boolean {
  const webContents = mainWindow?.webContents;
  const mainFrame = webContents?.mainFrame;

  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      webContents &&
      !webContents.isDestroyed() &&
      !webContents.isCrashed() &&
      mainFrame &&
      !mainFrame.isDestroyed() &&
      !webContents.isLoadingMainFrame()
  );
}

function isDisposedRendererError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Render frame was disposed before WebFrameMain could be accessed/i.test(error.message)
  );
}

function emitState(state: AppState): void {
  if (!canEmitToWindow()) {
    return;
  }
  try {
    // Renderer disposal can race with the telemetry timer during reloads or window close.
    mainWindow!.webContents.send("monitoring:state", withTelemetry(state));
  } catch (error) {
    if (isDisposedRendererError(error)) {
      return;
    }
    void writeErrorLog(error, "Failed to send monitoring state to renderer");
  }
}

monitor.on("state", (state) => emitState(state));

ipcMain.handle("monitoring:start", async (_event, config: MonitoringConfig) => {
  await writeSettings({
    selectedLogFolder:
      config.folderPath ?? (config.filePath ? path.dirname(config.filePath) : null)
  });
  return withTelemetry(await monitor.start(config));
});

ipcMain.handle("monitoring:importFile", async (_event, filePath: string) =>
  withTelemetry(await monitor.importLogFile(filePath))
);
ipcMain.handle("monitoring:stop", async () => withTelemetry(await monitor.stop()));
ipcMain.handle("monitoring:getState", async () => {
  const state = monitor.getState();
  const savedFolder = (await readSettings()).selectedLogFolder;
  return withTelemetry({
    ...state,
    selectedLogFolder: state.selectedLogFolder ?? savedFolder
  });
});
ipcMain.handle("monitoring:getBootstrapState", async () => {
  const state = monitor.getState();
  const savedFolder = (await readSettings()).selectedLogFolder;
  return withTelemetry(
    toBootstrapState({
      ...state,
      selectedLogFolder: state.selectedLogFolder ?? savedFolder
    })
  );
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
  const selected = result.filePaths[0] ?? null;
  if (!selected) {
    return null;
  }
  if (!/^combatlog_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:\.(?:log|txt))?$/i.test(path.basename(selected))) {
    await dialog.showMessageBox({
      type: "warning",
      title: "Invalid log file",
      message: "Please select a Neverwinter combat log file.",
      detail:
        "Only files named like combatlog_YYYY-MM-DD_HH-MM-SS are supported for live parsing and recorded analysis."
    });
    return null;
  }
  return selected;
});

ipcMain.handle("monitoring:discoverLogs", async () => discoverCombatLogCandidates());
ipcMain.handle("maintenance:clearData", async () => {
  await monitor.stop();
  await clearStoredAppData();
  const state = monitor.getState();
  return withTelemetry({
    ...state,
    selectedLogFolder: null,
    activeLogFile: null,
    importedLogFile: null,
    analysis: {
      ...state.analysis,
      sourcePath: null
    },
    debug: {
      ...state.debug,
      activeFilePath: null
    }
  });
});
ipcMain.handle("maintenance:clearLogs", async () => {
  await clearErrorLogs();
  return getLogDirectory();
});
ipcMain.handle("maintenance:getLogDirectory", async () => getLogDirectory());
ipcMain.handle("maintenance:listLogs", async () => listErrorLogs());
ipcMain.handle("maintenance:readLog", async (_event, fileName: string) => readErrorLog(fileName));
ipcMain.handle("maintenance:logRendererError", async (_event, payload: { context?: string; message: string }) => {
  await writeRendererLog(payload.message, payload.context ?? "Renderer error");
});

app.whenReady().then(() => {
  createWindow();
  telemetryTimer = setInterval(() => {
    if (!canEmitToWindow()) {
      return;
    }
    emitState(monitor.getState());
  }, 3000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

process.on("uncaughtException", (error) => {
  void writeErrorLog(error, "Uncaught exception in main process");
});

process.on("unhandledRejection", (reason) => {
  void writeErrorLog(reason, "Unhandled rejection in main process");
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
