import { parentPort, workerData } from "node:worker_threads";
import { open } from "node:fs/promises";
import { splitBufferedLines } from "../reader/lineBuffer.js";
import { parseLine } from "../parser/parseLine.js";
import { EncounterManager } from "../encounter/encounterManager.js";
import { CombatantTracker } from "../aggregation/combatantTracker.js";
import type { AppState, CombatEvent, ParseIssue } from "../../shared/types.js";

const MAX_DEBUG_ITEMS = 50;

type WorkerInput = {
  filePath: string;
  inactivityTimeoutMs: number;
};

function createInitialAppState(filePath: string): AppState {
  return {
    watcherStatus: "idle",
    selectedLogFolder: null,
    activeLogFile: null,
    importedLogFile: filePath,
    encounterStatus: "idle",
    currentEncounter: null,
    recentEncounters: [],
    analysis: {
      mode: "imported",
      sourcePath: filePath,
      totalLines: 0,
      parsedEvents: 0,
      durationMs: 0,
      combatants: []
    },
    debug: {
      latestRawLines: [],
      unknownEvents: [],
      parseIssues: [],
      activeFilePath: filePath,
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

function pushUnknown(state: AppState, event: CombatEvent): void {
  state.debug.unknownEvents = [event, ...state.debug.unknownEvents].slice(
    0,
    MAX_DEBUG_ITEMS
  );
}

function pushParseIssue(state: AppState, issue: ParseIssue): void {
  state.debug.parseIssues = [issue, ...state.debug.parseIssues].slice(
    0,
    MAX_DEBUG_ITEMS
  );
}

async function runImport({ filePath, inactivityTimeoutMs }: WorkerInput): Promise<AppState> {
  const state = createInitialAppState(filePath);
  const encounterManager = new EncounterManager(inactivityTimeoutMs);
  const combatantTracker = new CombatantTracker();
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

      state.debug.currentOffset += bytesRead;
      const chunk = buffer.toString("utf8", 0, bytesRead);
      const result = splitBufferedLines(leftover, chunk);
      leftover = result.leftover;

      if (result.lines.length > 0) {
        state.debug.latestRawLines = [
          ...result.lines.slice(-MAX_DEBUG_ITEMS),
          ...state.debug.latestRawLines
        ].slice(0, MAX_DEBUG_ITEMS);
      }

      for (const line of result.lines) {
        combatantTracker.registerLine();
        const parsed = parseLine(line);
        if (parsed.kind === "event") {
          encounterManager.consume(parsed.event);
          combatantTracker.consume(parsed.event, encounterManager.getCurrentEncounterId());
          continue;
        }

        pushUnknown(state, parsed.event);
        pushParseIssue(state, parsed.issue);
      }
    }

    if (leftover) {
      state.debug.latestRawLines = [
        leftover,
        ...state.debug.latestRawLines
      ].slice(0, MAX_DEBUG_ITEMS);
      combatantTracker.registerLine();
      const parsed = parseLine(leftover);
      if (parsed.kind === "event") {
        encounterManager.consume(parsed.event);
        combatantTracker.consume(parsed.event, encounterManager.getCurrentEncounterId());
      } else {
        pushUnknown(state, parsed.event);
        pushParseIssue(state, parsed.issue);
      }
    }
  } finally {
    await fileHandle.close();
  }

  const snapshotSeed = combatantTracker.snapshot("imported", filePath, []);
  encounterManager.flush(
    snapshotSeed.endedAt ? snapshotSeed.endedAt + inactivityTimeoutMs : Date.now()
  );
  const currentEncounter = encounterManager.getCurrentSnapshot();
  const recentEncounters = encounterManager.getCompleted();
  const encounterSnapshots = currentEncounter
    ? [...recentEncounters, currentEncounter]
    : recentEncounters;

  return {
    ...state,
    currentEncounter,
    encounterStatus: currentEncounter ? "active" : "idle",
    recentEncounters,
    analysis: combatantTracker.snapshot("imported", filePath, encounterSnapshots)
  };
}

async function main(): Promise<void> {
  if (!parentPort) {
    throw new Error("Import worker must be started as a worker thread.");
  }

  const input = workerData as WorkerInput;
  try {
    const state = await runImport(input);
    parentPort.postMessage({ ok: true, state });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

void main();
