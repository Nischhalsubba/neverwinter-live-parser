import chokidar, { type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AppState,
  CombatEvent,
  MonitoringConfig,
  ParseIssue
} from "../../shared/types.js";
import { CombatantTracker } from "../aggregation/combatantTracker.js";
import { detectActiveLogFile } from "../watcher/detectActiveLog.js";
import {
  createInitialReaderState,
  readAppendedLines,
  type ReaderState
} from "../reader/incrementalReader.js";
import { splitBufferedLines } from "../reader/lineBuffer.js";
import { parseLine } from "../parser/parseLine.js";
import { EncounterManager } from "../encounter/encounterManager.js";

const MAX_DEBUG_ITEMS = 50;

function createInitialAppState(): AppState {
  return {
    watcherStatus: "idle",
    selectedLogFolder: null,
    activeLogFile: null,
    importedLogFile: null,
    encounterStatus: "idle",
    currentEncounter: null,
    recentEncounters: [],
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
  private readonly pollIntervalMs = 1000;
  private readerState: ReaderState = createInitialReaderState();
  private encounterManager = new EncounterManager(10_000);
  private combatantTracker = new CombatantTracker();
  private flushTimer: NodeJS.Timeout | null = null;
  private liveTrackingFilePath: string | null = null;

  getState(): AppState {
    return structuredClone(this.state);
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
    this.encounterManager = new EncounterManager(config.inactivityTimeoutMs);
    this.combatantTracker = new CombatantTracker();
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

    const refresh = async () => {
      await this.refreshActiveFile(resolvedFolderPath);
      await this.readNewLines();
      this.emitState();
    };

    this.watcher.on("add", () => void refresh());
    this.watcher.on("change", () => void refresh());
    this.watcher.on("unlink", () => void refresh());
    this.watcher.on("error", (error) => {
      this.state.watcherStatus = "error";
      this.pushIssue(`Watcher error: ${String(error)}`);
      this.emitState();
    });

    this.flushTimer = setInterval(() => {
      this.encounterManager.flush();
      this.syncEncounterState();
      this.emitState();
    }, this.pollIntervalMs);

    await refresh();
    return this.getState();
  }

  async importLogFile(filePath: string): Promise<AppState> {
    await this.stop();

    this.state = {
      ...createInitialAppState(),
      importedLogFile: filePath,
      analysis: {
        ...createInitialAppState().analysis,
        mode: "imported",
        sourcePath: filePath
      }
    };
    this.encounterManager = new EncounterManager(10_000);
    this.combatantTracker = new CombatantTracker();
    this.liveTrackingFilePath = null;

    const contents = await readFile(filePath, "utf8");
    const { lines, leftover } = splitBufferedLines("", contents);
    const normalizedLines = leftover ? [...lines, leftover] : lines;

    this.consumeLines(normalizedLines);
    this.encounterManager.flush(
      this.state.analysis.endedAt
        ? this.state.analysis.endedAt + 10_000
        : Date.now()
    );
    this.syncEncounterState();
    this.emitState();
    return this.getState();
  }

  async stop(): Promise<AppState> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.encounterManager.flush();
    this.syncEncounterState();
    this.state.watcherStatus = "idle";
    this.liveTrackingFilePath = null;
    this.emitState();
    return this.getState();
  }

  private async refreshActiveFile(folderPath: string): Promise<void> {
    const activeFile = await detectActiveLogFile(
      folderPath,
      this.state.activeLogFile ?? this.liveTrackingFilePath
    );
    if (activeFile !== this.state.activeLogFile) {
      this.state.activeLogFile = activeFile;
      this.state.debug.activeFilePath = activeFile;
      this.state.analysis.sourcePath = activeFile ?? folderPath;
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

  private consumeEvent(event: CombatEvent): void {
    this.encounterManager.consume(event);
    this.combatantTracker.consume(event, this.encounterManager.getCurrentEncounterId());
    this.syncEncounterState();
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

  private pushIssue(reason: string): void {
    this.pushParseIssue({
      line: "",
      reason,
      seenAt: Date.now()
    });
  }

  private emitState(): void {
    this.emit("state", this.getState());
  }

  private consumeLines(lines: string[]): void {
    for (const line of lines) {
      this.combatantTracker.registerLine();
      const parsed = parseLine(line);
      if (parsed.kind === "event") {
        this.consumeEvent(parsed.event);
        continue;
      }

      this.pushUnknown(parsed.event);
      this.pushParseIssue(parsed.issue);
    }

    this.syncEncounterState();
  }
}
