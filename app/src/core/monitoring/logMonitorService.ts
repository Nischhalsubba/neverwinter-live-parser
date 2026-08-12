import chokidar, { type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import type { Dirent } from "node:fs";
import { open, readdir } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  AuxiliaryLogEvent,
  CombatEvent,
  MonitoringConfig,
  ParseIssue,
  RecordingArchiveSnapshot,
  RecordingMode,
  SessionArchiveSnapshot
} from "../../shared/types.js";
import { createInitialAuxiliarySummary } from "../../shared/auxiliaryLogs.js";
import { DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS } from "../../shared/constants.js";
import { CombatantTracker } from "../aggregation/combatantTracker.js";
import { detectActiveLogFile } from "../watcher/detectActiveLog.js";
import {
  createInitialReaderState,
  readAppendedLines,
  type ReaderState
} from "../reader/incrementalReader.js";
import { splitBufferedLines } from "../reader/lineBuffer.js";
import { parseLine } from "../parser/parseLine.js";
import {
  applyAuxiliaryEventToSummary,
  classifyAuxiliaryLogKind,
  parseAuxiliaryLogLine
} from "../parser/parseAuxiliaryLogLine.js";
import { EncounterManager } from "../encounter/encounterManager.js";

const MAX_DEBUG_ITEMS = 50;
const MAX_AUXILIARY_EVENTS = 120;
const MIN_EMIT_INTERVAL_MS = 100;
const IMPORT_WORKER_MIN_BYTES = 8 * 1024 * 1024;
const AUTO_RECORDING_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const IMPORT_WORKER_URL = new URL(
  path.extname(fileURLToPath(import.meta.url)) === ".ts"
    ? "./importWorker.ts"
    : "./importWorker.js",
  import.meta.url
);

const INSTANCE_NAME_BY_PREFIX: Record<string, string> = {
  M31_Trial: "The Crown of Keldegonn"
};

type RecordingRuntime = {
  id: string;
  mode: RecordingMode;
  title: string;
  instanceKind: string | null;
  instanceName: string | null;
  bossName: string | null;
  startedAt: number;
  sourcePath: string | null;
  activeLogFile: string | null;
  totalLines: number;
  parsedEvents: number;
  lastActivityAt: number;
  auxiliarySummary: ReturnType<typeof createInitialAuxiliarySummary>;
  encounterManager: EncounterManager;
  combatantTracker: CombatantTracker;
};

function humanizeIdentifier(value: string): string {
  return value
    .replace(/^M\d+_/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function extractInstancePrefix(code: string): string {
  const parts = code.split("_");
  return parts.length >= 2 ? `${parts[0]}_${parts[1]}` : code;
}

function inferInstanceContextFromEvent(event: CombatEvent): {
  instanceKind: string | null;
  instanceName: string | null;
  bossName: string | null;
} | null {
  const refs = [
    { ref: event.sourceId, name: event.sourceName },
    { ref: event.targetId, name: event.targetName }
  ];

  for (const entry of refs) {
    const ref = entry.ref ?? "";
    const match = ref.match(/\b(M\d+_(?:Trial|Instance|Dungeon|Skirmish|Arena)(?:_[A-Za-z]+)*)\b/i);
    if (!match) {
      continue;
    }

    const code = match[1];
    const prefix = extractInstancePrefix(code);
    const instanceName = INSTANCE_NAME_BY_PREFIX[prefix] ?? humanizeIdentifier(prefix);
    const lowerCode = code.toLowerCase();
    const instanceKind =
      lowerCode.includes("_trial") ? "trial" :
      lowerCode.includes("_dungeon") ? "dungeon" :
      lowerCode.includes("_skirmish") ? "skirmish" :
      lowerCode.includes("_arena") ? "arena" :
      lowerCode.includes("_instance") ? "instance" :
      "instance";
    const bossName =
      lowerCode.includes("_boss") && entry.name
        ? entry.name
        : null;

    return {
      instanceKind,
      instanceName,
      bossName
    };
  }

  return null;
}

function buildRecordingTitle(runtime: RecordingRuntime): string {
  if (runtime.instanceName && runtime.bossName) {
    return `${runtime.instanceName} • ${runtime.bossName}`;
  }
  if (runtime.instanceName) {
    return runtime.instanceName;
  }
  if (runtime.bossName) {
    return runtime.bossName;
  }
  return runtime.mode === "manual" ? "Manual live recording" : "Automatic dungeon recording";
}

function createInitialAppState(): AppState {
  return {
    watcherStatus: "idle",
    selectedLogFolder: null,
    activeLogFile: null,
    importedLogFile: null,
    encounterStatus: "idle",
    currentEncounter: null,
    recentEncounters: [],
    sessionArchives: [],
    activeRecording: null,
    recordingArchives: [],
    analysis: {
      mode: "idle",
      sourcePath: null,
      totalLines: 0,
      parsedEvents: 0,
      durationMs: 0,
      combatants: []
    },
    debug: {
      latestRawLines: [],
      unknownEvents: [],
      parseIssues: [],
      auxiliaryEvents: [],
      auxiliarySummary: createInitialAuxiliarySummary(),
      activeFilePath: null,
      currentOffset: 0
    },
    system: {
      sampledAt: Date.now(),
      processCpuPercent: 0,
      processMemoryMb: 0,
      systemMemoryUsedMb: 0,
      systemMemoryTotalMb: 0,
      systemMemoryPercent: 0,
      uptimeSec: 0
    }
  };
}

export class LogMonitorService extends EventEmitter {
  private state = createInitialAppState();
  private watcher: FSWatcher | null = null;
  private readonly pollIntervalMs = 250;
  private readerState: ReaderState = createInitialReaderState();
  private auxiliaryReaderStates = new Map<string, ReaderState>();
  private encounterManager = new EncounterManager(DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS);
  private combatantTracker = new CombatantTracker();
  private recordingRuntime: RecordingRuntime | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private liveTrackingFilePath: string | null = null;
  private lastEmittedAt = 0;
  private pendingEmitTimer: NodeJS.Timeout | null = null;
  private refreshInFlight = false;

  getState(): AppState {
    return structuredClone(this.state);
  }

  async startManualRecording(): Promise<AppState> {
    if (this.state.watcherStatus !== "watching" || this.state.analysis.mode !== "live") {
      throw new Error("Manual recording requires an active live combat-log session.");
    }
    if (this.recordingRuntime) {
      throw new Error("A recording is already active.");
    }

    this.startRecordingRuntime("manual", {
      title: "Manual live recording"
    });
    this.scheduleEmitState(true);
    return this.getState();
  }

  async stopActiveRecording(): Promise<AppState> {
    this.finishRecordingRuntime();
    this.scheduleEmitState(true);
    return this.getState();
  }

  async start(config: MonitoringConfig): Promise<AppState> {
    await this.stop();

    const targetFilePath = config.filePath?.trim() || null;
    const targetFolderPath = config.folderPath?.trim() || null;
    const resolvedFolderPath =
      targetFolderPath ?? (targetFilePath ? path.dirname(targetFilePath) : null);

    if (!resolvedFolderPath) {
      throw new Error("Monitoring requires a combat log folder or file path.");
    }

    this.state = {
      ...createInitialAppState(),
      watcherStatus: "watching",
      selectedLogFolder: resolvedFolderPath,
      analysis: {
        ...createInitialAppState().analysis,
        mode: "live",
        sourcePath: targetFilePath ?? resolvedFolderPath
      }
    };
    this.readerState = createInitialReaderState();
    this.auxiliaryReaderStates = new Map();
    this.encounterManager = new EncounterManager(config.inactivityTimeoutMs);
    this.combatantTracker = new CombatantTracker();
    this.recordingRuntime = null;
    this.liveTrackingFilePath = targetFilePath;

    const activeFile = targetFilePath
      ? await detectActiveLogFile(resolvedFolderPath, targetFilePath)
      : await detectActiveLogFile(resolvedFolderPath);
    this.state.activeLogFile = activeFile;
    this.state.debug.activeFilePath = activeFile;

    this.watcher = chokidar.watch(resolvedFolderPath, {
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50
      }
    });

    // Windows file notifications are not always reliable for game logs, so the
    // watcher and the poller both funnel through the same refresh path.
    const refresh = async () => {
      if (this.refreshInFlight) {
        return;
      }
      this.refreshInFlight = true;
      const previousActiveFile = this.state.activeLogFile;
      const previousOffset = this.state.debug.currentOffset;
      try {
        await this.refreshActiveFile(resolvedFolderPath);
        await this.readNewLines();
        await this.readAuxiliaryLogs(resolvedFolderPath);
        if (
          this.state.activeLogFile !== previousActiveFile ||
          this.state.debug.currentOffset !== previousOffset
        ) {
          this.scheduleEmitState();
        }
      } finally {
        this.refreshInFlight = false;
      }
    };

    this.watcher.on("add", () => void refresh());
    this.watcher.on("change", () => void refresh());
    this.watcher.on("unlink", () => void refresh());
    this.watcher.on("error", (error) => {
      this.state.watcherStatus = "error";
      this.pushIssue(`Watcher error: ${String(error)}`);
      this.scheduleEmitState(true);
    });

    this.flushTimer = setInterval(() => {
      void refresh();
      if (this.encounterManager.flush()) {
        this.syncEncounterState();
        this.scheduleEmitState();
      }
      if (this.recordingRuntime) {
        if (this.recordingRuntime.encounterManager.flush()) {
          this.syncActiveRecordingState();
          this.scheduleEmitState();
        }
        if (
          this.recordingRuntime.mode === "automatic" &&
          Date.now() - this.recordingRuntime.lastActivityAt >= AUTO_RECORDING_IDLE_TIMEOUT_MS &&
          !this.recordingRuntime.encounterManager.getCurrentSnapshot()
        ) {
          this.finishRecordingRuntime();
          this.scheduleEmitState(true);
        }
      }
    }, this.pollIntervalMs);

    await refresh();
    return this.getState();
  }

  async importLogFile(filePath: string): Promise<AppState> {
    await this.stop();

    const fileStats = await open(filePath, "r").then(async (handle) => {
      try {
        return await handle.stat();
      } finally {
        await handle.close();
      }
    });

    if (fileStats.size >= IMPORT_WORKER_MIN_BYTES) {
      this.state = await this.importLogFileInWorker(filePath);
      this.scheduleEmitState(true);
      return this.getState();
    }

    this.state = {
      ...createInitialAppState(),
      importedLogFile: filePath,
      analysis: {
        ...createInitialAppState().analysis,
        mode: "imported",
        sourcePath: filePath
      }
    };
    this.encounterManager = new EncounterManager(DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS);
    this.combatantTracker = new CombatantTracker();
    this.auxiliaryReaderStates = new Map();
    this.recordingRuntime = null;
    this.liveTrackingFilePath = null;

    await this.consumeImportedFile(filePath);
    this.encounterManager.flush(
      this.state.analysis.endedAt
        ? this.state.analysis.endedAt + DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS
        : Date.now()
    );
    this.syncEncounterState();
    this.scheduleEmitState(true);
    return this.getState();
  }

  async stop(): Promise<AppState> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingEmitTimer) {
      clearTimeout(this.pendingEmitTimer);
      this.pendingEmitTimer = null;
    }

    this.refreshInFlight = false;

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.encounterManager.flush()) {
      this.syncEncounterState();
    }
    this.finishRecordingRuntime();
    this.state.sessionArchives = this.archiveCurrentSession(this.state.sessionArchives);
    this.state.watcherStatus = "idle";
    this.liveTrackingFilePath = null;
    this.scheduleEmitState(true);
    return this.getState();
  }

  private resetLiveSession(activeFile: string | null): void {
    const preservedFolder = this.state.selectedLogFolder;
    const preservedArchives = this.archiveCurrentSession(this.state.sessionArchives);
    this.readerState = createInitialReaderState();
    this.auxiliaryReaderStates = new Map();
    this.encounterManager = new EncounterManager(DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS);
    this.combatantTracker = new CombatantTracker();
    this.finishRecordingRuntime();
    this.state = {
      ...createInitialAppState(),
      watcherStatus: "watching",
      selectedLogFolder: preservedFolder,
      activeLogFile: activeFile,
      sessionArchives: preservedArchives,
      analysis: {
        ...createInitialAppState().analysis,
        mode: "live",
        sourcePath: activeFile ?? preservedFolder
      },
      system: this.state.system
    };
    this.state.debug.activeFilePath = activeFile;
  }

  private async refreshActiveFile(folderPath: string): Promise<void> {
    const activeFile = await detectActiveLogFile(
      folderPath,
      this.state.activeLogFile ?? this.liveTrackingFilePath
    );
    if (activeFile !== this.state.activeLogFile) {
      const hadActiveFile = Boolean(this.state.activeLogFile);
      if (hadActiveFile) {
        this.resetLiveSession(activeFile);
      } else {
        this.state.activeLogFile = activeFile;
        this.state.debug.activeFilePath = activeFile;
        this.state.analysis.sourcePath = activeFile ?? folderPath;
      }
    }
  }

  private async readNewLines(): Promise<void> {
    const activeFile = this.state.activeLogFile;
    if (!activeFile) {
      return;
    }

    const result = await readAppendedLines(activeFile, this.readerState);
    this.readerState = result.state;
    this.state.debug.currentOffset = result.state.lastReadOffset;

    if (result.lines.length === 0) {
      return;
    }

    this.state.debug.latestRawLines = [
      ...result.lines,
      ...this.state.debug.latestRawLines
    ].slice(0, MAX_DEBUG_ITEMS);

    this.consumeLines(result.lines);
  }

  private async readAuxiliaryLogs(folderPath: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(folderPath, {
        withFileTypes: true,
        encoding: "utf8"
      }) as Dirent[];
    } catch {
      return;
    }

    const latestByKind = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = path.join(folderPath, entry.name);
      const kind = classifyAuxiliaryLogKind(filePath);
      if (kind === "other") {
        continue;
      }

      const current = latestByKind.get(kind);
      if (!current || filePath.localeCompare(current) > 0) {
        latestByKind.set(kind, filePath);
      }
    }

    for (const filePath of latestByKind.values()) {
      const previousState =
        this.auxiliaryReaderStates.get(filePath) ?? createInitialReaderState();
      const result = await readAppendedLines(filePath, previousState);
      this.auxiliaryReaderStates.set(filePath, result.state);

      for (const line of result.lines) {
        const parsed = parseAuxiliaryLogLine(filePath, line);
        if (!parsed) {
          continue;
        }
        this.pushAuxiliaryEvent(parsed);
      }
    }
  }

  private async consumeImportedFile(filePath: string): Promise<void> {
    const chunkSize = 512 * 1024;
    const fileHandle = await open(filePath, "r");
    const buffer = Buffer.allocUnsafe(chunkSize);
    let leftover = "";

    try {
      while (true) {
        const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, null);
        if (bytesRead <= 0) {
          break;
        }

        const chunk = buffer.toString("utf8", 0, bytesRead);
        const result = splitBufferedLines(leftover, chunk);
        leftover = result.leftover;

        if (result.lines.length > 0) {
          this.state.debug.latestRawLines = [
            ...result.lines.slice(-MAX_DEBUG_ITEMS),
            ...this.state.debug.latestRawLines
          ].slice(0, MAX_DEBUG_ITEMS);
          this.consumeLines(result.lines, false);
        }
      }

      if (leftover) {
        this.state.debug.latestRawLines = [
          leftover,
          ...this.state.debug.latestRawLines
        ].slice(0, MAX_DEBUG_ITEMS);
        this.consumeLines([leftover], false);
      }
    } finally {
      await fileHandle.close();
    }
  }

  private async importLogFileInWorker(filePath: string): Promise<AppState> {
    return new Promise<AppState>((resolve, reject) => {
      const worker = new Worker(fileURLToPath(IMPORT_WORKER_URL), {
        workerData: {
          filePath,
          inactivityTimeoutMs: DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS
        }
      });

      const cleanup = () => {
        worker.removeAllListeners("message");
        worker.removeAllListeners("error");
        worker.removeAllListeners("exit");
      };

      worker.once("message", (message: { ok: boolean; state?: AppState; error?: string }) => {
        cleanup();
        if (message.ok && message.state) {
          resolve(message.state);
          return;
        }
        reject(new Error(message.error ?? "Import worker failed without a message."));
      });

      worker.once("error", (error) => {
        cleanup();
        reject(error);
      });

      worker.once("exit", (code) => {
        if (code === 0) {
          return;
        }
        cleanup();
        reject(new Error(`Import worker exited with code ${code}.`));
      });
    });
  }

  private consumeEvent(event: CombatEvent): void {
    this.encounterManager.consume(event);
    this.combatantTracker.consume(event, this.encounterManager.getCurrentEncounterId());
    if (this.recordingRuntime) {
      this.recordingRuntime.parsedEvents += 1;
      this.recordingRuntime.encounterManager.consume(event);
      this.recordingRuntime.combatantTracker.consume(
        event,
        this.recordingRuntime.encounterManager.getCurrentEncounterId()
      );
      this.updateRecordingContextFromEvent(event);
    } else {
      const inferred = inferInstanceContextFromEvent(event);
      if (inferred && this.state.watcherStatus === "watching") {
        const recording = this.startRecordingRuntime("automatic", inferred);
        recording.parsedEvents += 1;
        recording.encounterManager.consume(event);
        recording.combatantTracker.consume(
          event,
          recording.encounterManager.getCurrentEncounterId()
        );
        this.updateRecordingContextFromEvent(event);
      }
    }
  }

  private syncEncounterState(): void {
    const currentEncounter = this.encounterManager.getCurrentSnapshot();
    this.state.currentEncounter = currentEncounter;
    this.state.encounterStatus = currentEncounter ? "active" : "idle";
    this.state.recentEncounters = this.encounterManager.getCompleted();
    const encounterSnapshots = currentEncounter
      ? [...this.state.recentEncounters, currentEncounter]
      : this.state.recentEncounters;
    this.state.analysis = this.combatantTracker.snapshot(
      this.state.analysis.mode,
      this.state.analysis.sourcePath,
      encounterSnapshots
    );
  }

  private startRecordingRuntime(
    mode: RecordingMode,
    options?: {
      title?: string;
      instanceKind?: string | null;
      instanceName?: string | null;
      bossName?: string | null;
    }
  ): RecordingRuntime {
    const now = Date.now();
    this.recordingRuntime = {
      id: `recording-${now}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      title: options?.title ?? (mode === "manual" ? "Manual live recording" : "Automatic dungeon recording"),
      instanceKind: options?.instanceKind ?? null,
      instanceName: options?.instanceName ?? null,
      bossName: options?.bossName ?? null,
      startedAt: now,
      sourcePath: this.state.analysis.sourcePath,
      activeLogFile: this.state.activeLogFile,
      totalLines: 0,
      parsedEvents: 0,
      lastActivityAt: now,
      auxiliarySummary: createInitialAuxiliarySummary(),
      encounterManager: new EncounterManager(DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS),
      combatantTracker: new CombatantTracker()
    };
    this.syncActiveRecordingState();
    return this.recordingRuntime;
  }

  private syncActiveRecordingState(): void {
    if (!this.recordingRuntime) {
      this.state.activeRecording = null;
      return;
    }

    const currentEncounter = this.recordingRuntime.encounterManager.getCurrentSnapshot();
    const recentEncounters = this.recordingRuntime.encounterManager.getCompleted();
    const encounterSnapshots = currentEncounter
      ? [...recentEncounters, currentEncounter]
      : recentEncounters;
    const analysis = this.recordingRuntime.combatantTracker.snapshot(
      "live",
      this.recordingRuntime.sourcePath,
      encounterSnapshots
    );

    const snapshot: RecordingArchiveSnapshot = {
      id: this.recordingRuntime.id,
      mode: this.recordingRuntime.mode,
      title: buildRecordingTitle(this.recordingRuntime),
      instanceKind: this.recordingRuntime.instanceKind,
      instanceName: this.recordingRuntime.instanceName,
      bossName: this.recordingRuntime.bossName,
      sourcePath: this.recordingRuntime.sourcePath,
      activeLogFile: this.recordingRuntime.activeLogFile,
      startedAt: this.recordingRuntime.startedAt,
      endedAt: undefined,
      durationMs: Math.max(0, Date.now() - this.recordingRuntime.startedAt),
      totalLines: this.recordingRuntime.totalLines,
      parsedEvents: this.recordingRuntime.parsedEvents,
      auxiliarySummary: structuredClone(this.recordingRuntime.auxiliarySummary),
      recentEncounters,
      topCombatants: analysis.combatants
        .filter((combatant) => combatant.type === "player" || combatant.ownerId.startsWith("P["))
        .sort((left, right) => right.totalDamage - left.totalDamage)
        .slice(0, 12)
        .map((combatant) => ({
          id: combatant.id,
          displayName: combatant.displayName,
          totalDamage: combatant.totalDamage,
          totalHealing: combatant.totalHealing,
          damageTaken: combatant.damageTaken,
          hits: combatant.hits
        }))
    };

    this.state.activeRecording = snapshot;
  }

  private finishRecordingRuntime(): void {
    if (!this.recordingRuntime) {
      this.state.activeRecording = null;
      return;
    }

    this.syncActiveRecordingState();
    if (this.state.activeRecording) {
      const finished: RecordingArchiveSnapshot = {
        ...this.state.activeRecording,
        endedAt: Date.now(),
        durationMs: Math.max(0, Date.now() - (this.state.activeRecording.startedAt ?? Date.now()))
      };
      this.state.recordingArchives = [finished, ...this.state.recordingArchives].slice(0, 30);
    }

    this.recordingRuntime = null;
    this.state.activeRecording = null;
  }

  private maybeStartAutomaticRecording(event: AuxiliaryLogEvent): void {
    if (this.recordingRuntime || this.state.watcherStatus !== "watching") {
      return;
    }

    if (
      event.kind === "voicechat" &&
      event.details?.action === "joined" &&
      typeof event.details.teamChannelType === "string"
    ) {
      const instanceName = `${event.details.teamChannelType} team run`;
      this.startRecordingRuntime("automatic", {
        instanceKind: String(event.details.teamChannelType).toLowerCase(),
        instanceName,
        title: instanceName
      });
    }
  }

  private maybeStopAutomaticRecording(event: AuxiliaryLogEvent): void {
    if (!this.recordingRuntime || this.recordingRuntime.mode !== "automatic") {
      return;
    }

    if (event.kind === "voicechat" && event.details?.action === "left") {
      this.finishRecordingRuntime();
    }
  }

  private updateRecordingContextFromEvent(event: CombatEvent): void {
    if (!this.recordingRuntime) {
      return;
    }

    this.recordingRuntime.lastActivityAt = event.timestamp;
    const inferred = inferInstanceContextFromEvent(event);
    if (inferred) {
      this.recordingRuntime.instanceKind ??= inferred.instanceKind;
      this.recordingRuntime.instanceName ??= inferred.instanceName;
      this.recordingRuntime.bossName ??= inferred.bossName;
      this.recordingRuntime.title = buildRecordingTitle(this.recordingRuntime);
      if (
        this.recordingRuntime.mode === "automatic" &&
        !this.recordingRuntime.instanceName &&
        (inferred.instanceName || inferred.bossName)
      ) {
        this.recordingRuntime.instanceName = inferred.instanceName;
        this.recordingRuntime.bossName = inferred.bossName;
      }
    }
  }

  private archiveCurrentSession(existing: SessionArchiveSnapshot[]): SessionArchiveSnapshot[] {
    const hasMeaningfulData =
      this.state.analysis.totalLines > 0 ||
      this.state.analysis.parsedEvents > 0 ||
      this.state.recentEncounters.length > 0;

    if (!hasMeaningfulData) {
      return existing;
    }

    const archive: SessionArchiveSnapshot = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourcePath: this.state.analysis.sourcePath,
      activeLogFile: this.state.activeLogFile,
      startedAt: this.state.analysis.startedAt,
      endedAt: this.state.analysis.endedAt ?? Date.now(),
      durationMs: this.state.analysis.durationMs,
      totalLines: this.state.analysis.totalLines,
      parsedEvents: this.state.analysis.parsedEvents,
      auxiliarySummary: structuredClone(this.state.debug.auxiliarySummary),
      recentEncounters: [...this.state.recentEncounters],
      topCombatants: this.state.analysis.combatants
        .filter((combatant) => combatant.type === "player" || combatant.ownerId.startsWith("P["))
        .sort((left, right) => right.totalDamage - left.totalDamage)
        .slice(0, 12)
        .map((combatant) => ({
          id: combatant.id,
          displayName: combatant.displayName,
          totalDamage: combatant.totalDamage,
          totalHealing: combatant.totalHealing,
          damageTaken: combatant.damageTaken,
          hits: combatant.hits
        }))
    };

    const deduped = existing.filter(
      (entry) =>
        !(
          entry.activeLogFile === archive.activeLogFile &&
          entry.totalLines === archive.totalLines &&
          entry.parsedEvents === archive.parsedEvents
        )
    );

    return [archive, ...deduped].slice(0, 30);
  }

  private pushUnknown(event: CombatEvent): void {
    this.state.debug.unknownEvents = [
      event,
      ...this.state.debug.unknownEvents
    ].slice(0, MAX_DEBUG_ITEMS);
  }

  private pushParseIssue(issue: ParseIssue): void {
    this.state.debug.parseIssues = [
      issue,
      ...this.state.debug.parseIssues
    ].slice(0, MAX_DEBUG_ITEMS);
  }

  private pushAuxiliaryEvent(event: AuxiliaryLogEvent): void {
    this.maybeStartAutomaticRecording(event);
    this.state.debug.auxiliaryEvents = [
      event,
      ...this.state.debug.auxiliaryEvents
    ].slice(0, MAX_AUXILIARY_EVENTS);
    this.state.debug.auxiliarySummary = applyAuxiliaryEventToSummary(
      this.state.debug.auxiliarySummary,
      event
    );
    if (this.recordingRuntime) {
      this.recordingRuntime.lastActivityAt = event.seenAt;
      this.recordingRuntime.auxiliarySummary = applyAuxiliaryEventToSummary(
        this.recordingRuntime.auxiliarySummary,
        event
      );
      this.syncActiveRecordingState();
    }
    this.maybeStopAutomaticRecording(event);
    this.scheduleEmitState();
  }

  private pushIssue(reason: string): void {
    this.pushParseIssue({
      line: "",
      reason,
      seenAt: Date.now()
    });
    this.scheduleEmitState();
  }

  private emitState(): void {
    this.lastEmittedAt = Date.now();
    // Emit the internal state object directly to the main process so live
    // updates do not pay for a full structured clone on every parser tick.
    // The main process treats this as read-only and Electron will still clone
    // when the snapshot is sent across IPC to the renderer.
    this.emit("state", this.state);
  }

  private scheduleEmitState(force = false): void {
    if (force) {
      if (this.pendingEmitTimer) {
        clearTimeout(this.pendingEmitTimer);
        this.pendingEmitTimer = null;
      }
      this.emitState();
      return;
    }

    if (this.pendingEmitTimer) {
      return;
    }

    const elapsed = Date.now() - this.lastEmittedAt;
    const delay = Math.max(0, MIN_EMIT_INTERVAL_MS - elapsed);
    this.pendingEmitTimer = setTimeout(() => {
      this.pendingEmitTimer = null;
      this.emitState();
    }, delay);
  }

  private consumeLines(lines: string[], syncAnalysis = true): void {
    for (const line of lines) {
      this.combatantTracker.registerLine();
      if (this.recordingRuntime) {
        this.recordingRuntime.totalLines += 1;
      }
      const parsed = parseLine(line);
      if (parsed.kind === "event") {
        this.consumeEvent(parsed.event);
        continue;
      }

      this.pushUnknown(parsed.event);
      this.pushParseIssue(parsed.issue);
    }

    if (syncAnalysis) {
      this.syncEncounterState();
      if (this.recordingRuntime) {
        this.syncActiveRecordingState();
      }
    }
  }
}
