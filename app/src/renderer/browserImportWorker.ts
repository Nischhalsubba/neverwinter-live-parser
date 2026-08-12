/// <reference lib="webworker" />

import { CombatantTracker } from "../core/aggregation/combatantTracker";
import { EncounterManager } from "../core/encounter/encounterManager";
import { parseLine } from "../core/parser/parseLine";
import { splitBufferedLines } from "../core/reader/lineBuffer";
import { createInitialAuxiliarySummary } from "../shared/auxiliaryLogs";
import { DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS } from "../shared/constants";
import type { AppState, CombatEvent, ParseIssue } from "../shared/types";

const MAX_DEBUG_ITEMS = 50;
const PROGRESS_INTERVAL_BYTES = 4 * 1024 * 1024;

type BrowserImportRequest = {
  file: File;
  inactivityTimeoutMs?: number;
};

type BrowserImportResponse =
  | { kind: "progress"; loadedBytes: number; totalBytes: number }
  | { kind: "complete"; state: AppState }
  | { kind: "error"; error: string };

function createInitialAppState(file: File): AppState {
  return {
    watcherStatus: "idle",
    selectedLogFolder: null,
    activeLogFile: null,
    importedLogFile: file.name,
    encounterStatus: "idle",
    currentEncounter: null,
    recentEncounters: [],
    sessionArchives: [],
    activeRecording: null,
    recordingArchives: [],
    analysis: {
      mode: "imported",
      sourcePath: file.name,
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
      activeFilePath: file.name,
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
  state.debug.unknownEvents = [event, ...state.debug.unknownEvents].slice(0, MAX_DEBUG_ITEMS);
}

function pushParseIssue(state: AppState, issue: ParseIssue): void {
  state.debug.parseIssues = [issue, ...state.debug.parseIssues].slice(0, MAX_DEBUG_ITEMS);
}

function processLines(
  state: AppState,
  lines: string[],
  encounterManager: EncounterManager,
  combatantTracker: CombatantTracker
): void {
  if (lines.length > 0) {
    state.debug.latestRawLines = [
      ...lines.slice(-MAX_DEBUG_ITEMS),
      ...state.debug.latestRawLines
    ].slice(0, MAX_DEBUG_ITEMS);
  }

  for (const line of lines) {
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

async function runImport({
  file,
  inactivityTimeoutMs
}: BrowserImportRequest): Promise<AppState> {
  const effectiveInactivityTimeoutMs =
    inactivityTimeoutMs ?? DEFAULT_ENCOUNTER_INACTIVITY_TIMEOUT_MS;
  const state = createInitialAppState(file);
  const encounterManager = new EncounterManager(effectiveInactivityTimeoutMs);
  const combatantTracker = new CombatantTracker();
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8");
  let leftover = "";
  let lastProgressAt = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    state.debug.currentOffset += value.byteLength;
    const result = splitBufferedLines(
      leftover,
      decoder.decode(value, { stream: true })
    );
    leftover = result.leftover;
    processLines(state, result.lines, encounterManager, combatantTracker);

    if (state.debug.currentOffset - lastProgressAt >= PROGRESS_INTERVAL_BYTES) {
      lastProgressAt = state.debug.currentOffset;
      self.postMessage({
        kind: "progress",
        loadedBytes: state.debug.currentOffset,
        totalBytes: file.size
      } satisfies BrowserImportResponse);
    }
  }

  const decoderTail = decoder.decode();
  if (decoderTail) {
    const result = splitBufferedLines(leftover, decoderTail);
    leftover = result.leftover;
    processLines(state, result.lines, encounterManager, combatantTracker);
  }

  if (leftover) {
    processLines(state, [leftover], encounterManager, combatantTracker);
  }

  state.debug.currentOffset = file.size;
  const snapshotSeed = combatantTracker.snapshot("imported", file.name, []);
  encounterManager.flush(
    snapshotSeed.endedAt
      ? snapshotSeed.endedAt + effectiveInactivityTimeoutMs
      : Date.now()
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
    analysis: combatantTracker.snapshot("imported", file.name, encounterSnapshots)
  };
}

self.onmessage = (event: MessageEvent<BrowserImportRequest>) => {
  void runImport(event.data)
    .then((state) => {
      self.postMessage({ kind: "complete", state } satisfies BrowserImportResponse);
    })
    .catch((error) => {
      self.postMessage({
        kind: "error",
        error: error instanceof Error ? error.message : String(error)
      } satisfies BrowserImportResponse);
    });
};

export {};
