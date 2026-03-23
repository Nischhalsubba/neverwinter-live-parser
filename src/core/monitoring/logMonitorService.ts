import chokidar, { type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import type {
  AppState,
  CombatEvent,
  MonitoringConfig,
  ParseIssue
} from "../../shared/types.js";
import { detectActiveLogFile } from "../watcher/detectActiveLog.js";
import {
  createInitialReaderState,
  readAppendedLines,
  type ReaderState
} from "../reader/incrementalReader.js";
import { parseLine } from "../parser/parseLine.js";
import { EncounterManager } from "../encounter/encounterManager.js";

const MAX_DEBUG_ITEMS = 50;

function createInitialAppState(): AppState {
  return {
    watcherStatus: "idle",
    selectedLogFolder: null,
    activeLogFile: null,
    encounterStatus: "idle",
    currentEncounter: null,
    recentEncounters: [],
    debug: {
      latestRawLines: [],
      unknownEvents: [],
      parseIssues: [],
      activeFilePath: null,
      currentOffset: 0
    }
  };
}

export class LogMonitorService extends EventEmitter {
  private state = createInitialAppState();
  private watcher: FSWatcher | null = null;
  private readonly pollIntervalMs = 1000;
  private readerState: ReaderState = createInitialReaderState();
  private encounterManager = new EncounterManager(10_000);
  private flushTimer: NodeJS.Timeout | null = null;

  getState(): AppState {
    return structuredClone(this.state);
  }

  async start(config: MonitoringConfig): Promise<AppState> {
    await this.stop();

    this.state = {
      ...createInitialAppState(),
      watcherStatus: "watching",
      selectedLogFolder: config.folderPath
    };
    this.readerState = createInitialReaderState();
    this.encounterManager = new EncounterManager(config.inactivityTimeoutMs);

    const activeFile = await detectActiveLogFile(config.folderPath);
    this.state.activeLogFile = activeFile;
    this.state.debug.activeFilePath = activeFile;

    this.watcher = chokidar.watch(config.folderPath, {
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50
      }
    });

    const refresh = async () => {
      await this.refreshActiveFile(config.folderPath);
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
    this.emitState();
    return this.getState();
  }

  private async refreshActiveFile(folderPath: string): Promise<void> {
    const activeFile = await detectActiveLogFile(folderPath);
    if (activeFile !== this.state.activeLogFile) {
      this.state.activeLogFile = activeFile;
      this.state.debug.activeFilePath = activeFile;
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

    for (const line of result.lines) {
      const parsed = parseLine(line);
      if (parsed.kind === "event") {
        this.consumeEvent(parsed.event);
        continue;
      }

      this.pushUnknown(parsed.event);
      this.pushParseIssue(parsed.issue);
    }
  }

  private consumeEvent(event: CombatEvent): void {
    this.encounterManager.consume(event);
    this.syncEncounterState();
  }

  private syncEncounterState(): void {
    const currentEncounter = this.encounterManager.getCurrentSnapshot();
    this.state.currentEncounter = currentEncounter;
    this.state.encounterStatus = currentEncounter ? "active" : "idle";
    this.state.recentEncounters = this.encounterManager.getCompleted();
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
}
