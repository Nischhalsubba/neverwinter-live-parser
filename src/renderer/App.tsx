import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, DiscoveredLogCandidate } from "../shared/types";
import {
  buildPlayerRows,
  getEncounterSnapshots,
  hasMeaningfulEncounter,
  type LiveScopeMode,
  type DetailTab,
  type View
} from "./analysisViewModel";
import {
  DEFAULT_SETTINGS,
  ObsidianScreens,
  type ProfileSettings
} from "./components/ObsidianScreens";

const INITIAL_STATE: AppState = {
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

const SETTINGS_STORAGE_KEY = "obsidian-renderer-settings";

function loadRendererSettings(): ProfileSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(raw)
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getParentDirectory(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  parts.pop();
  return parts.join("\\");
}

export function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [view, setView] = useState<View>("setup");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [folderInput, setFolderInput] = useState("");
  const [importFilePath, setImportFilePath] = useState("");
  const [starting, setStarting] = useState(false);
  const [includeCompanions, setIncludeCompanions] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState("all");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(Boolean(window.neverwinterApi));
  const [rendererSettings, setRendererSettings] = useState<ProfileSettings>(loadRendererSettings);
  const [pendingSnapshot, setPendingSnapshot] = useState<AppState | null>(null);
  const lastFrameAppliedAt = useRef(0);
  const [logCandidates, setLogCandidates] = useState<DiscoveredLogCandidate[]>([]);
  const [discoveringLogs, setDiscoveringLogs] = useState(false);
  const [hasScannedLogs, setHasScannedLogs] = useState(false);

  useEffect(() => {
    const api = window.neverwinterApi;
    setIsDesktopRuntime(Boolean(api));
    if (!api) {
      return;
    }

    void api.getState().then((snapshot) => {
      startTransition(() => {
        setState(snapshot);
        setFolderInput(snapshot.watcherStatus === "watching" ? snapshot.selectedLogFolder ?? "" : "");
        setImportFilePath(snapshot.importedLogFile ?? snapshot.activeLogFile ?? "");
      });
    });

    return api.onState((snapshot) => {
      setPendingSnapshot(snapshot);
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(rendererSettings));
  }, [rendererSettings]);

  useEffect(() => {
    if (!pendingSnapshot) {
      return;
    }

    const minFrameMs = rendererSettings.targetFps === 120 ? 8 : 16;
    const now = performance.now();
    const elapsed = now - lastFrameAppliedAt.current;

    if (elapsed >= minFrameMs) {
      // Keep renderer updates coalesced to the chosen cadence instead of re-rendering
      // on every main-process state emission.
      startTransition(() => {
        setState(pendingSnapshot);
        setImportFilePath((current) =>
          current.trim()
            ? current
            : pendingSnapshot.importedLogFile ?? pendingSnapshot.activeLogFile ?? ""
        );
      });
      setPendingSnapshot(null);
      lastFrameAppliedAt.current = now;
      return;
    }

    const timeout = window.setTimeout(() => {
      const appliedAt = performance.now();
      startTransition(() => {
        setState(pendingSnapshot);
        setImportFilePath((current) =>
          current.trim()
            ? current
            : pendingSnapshot.importedLogFile ?? pendingSnapshot.activeLogFile ?? ""
        );
      });
      setPendingSnapshot(null);
      lastFrameAppliedAt.current = appliedAt;
    }, minFrameMs - elapsed);

    return () => window.clearTimeout(timeout);
  }, [pendingSnapshot, rendererSettings.targetFps]);

  const deferredCombatants = useDeferredValue(state.analysis.combatants);
  const deferredCurrentEncounter = useDeferredValue(state.currentEncounter);
  const deferredRecentEncounters = useDeferredValue(state.recentEncounters);

  const playerRows = useMemo(
    () => buildPlayerRows(deferredCombatants, includeCompanions),
    [deferredCombatants, includeCompanions]
  );
  const encounterScopedLiveRows = useMemo(
    () =>
      buildPlayerRows(deferredCombatants, includeCompanions, {
        encounterId: deferredCurrentEncounter?.id ?? null,
        encounterDurationMs: deferredCurrentEncounter?.durationMs ?? 0
      }),
    [deferredCombatants, includeCompanions, deferredCurrentEncounter]
  );
  const hasEncounterScopedRows = useMemo(
    () =>
      encounterScopedLiveRows.some(
        (row) =>
          row.totalDamage > 0 ||
          row.totalHealing > 0 ||
          row.damageTaken > 0 ||
          row.hits > 0
      ),
    [encounterScopedLiveRows]
  );
  const liveScope: LiveScopeMode =
    hasMeaningfulEncounter(deferredCurrentEncounter) && hasEncounterScopedRows
      ? "encounter"
      : "session";
  const livePlayerRows = liveScope === "encounter" ? encounterScopedLiveRows : playerRows;
  const liveDiagnostics = useMemo(() => {
    const diagnostics: string[] = [];
    if (
      state.analysis.mode === "live" &&
      state.analysis.totalLines > 0 &&
      livePlayerRows.length === 0
    ) {
      diagnostics.push(
        "The tracked combat log has parsed lines, but the active live scope produced no visible player rows."
      );
    }
    diagnostics.push(
      liveScope === "encounter"
        ? "Live Scope: Current Encounter"
        : "Live Scope: Tracked Session"
    );
    return diagnostics;
  }, [livePlayerRows.length, liveScope, state.analysis.mode, state.analysis.totalLines]);

  const availableEncounters = useMemo(
    () => getEncounterSnapshots(deferredRecentEncounters, deferredCurrentEncounter),
    [deferredCurrentEncounter, deferredRecentEncounters]
  );

  useEffect(() => {
    if (!playerRows.length) {
      setSelectedPlayerId(null);
      return;
    }

    if (!selectedPlayerId || !playerRows.some((row) => row.id === selectedPlayerId)) {
      setSelectedPlayerId(playerRows[0].id);
    }
  }, [playerRows, selectedPlayerId]);

  useEffect(() => {
    if (
      selectedEncounterId !== "all" &&
      !availableEncounters.some((encounter) => encounter.id === selectedEncounterId)
    ) {
      setSelectedEncounterId("all");
    }
  }, [availableEncounters, selectedEncounterId]);

  const selectedPlayer =
    playerRows.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedEncounter =
    selectedEncounterId === "all"
      ? null
      : availableEncounters.find((encounter) => encounter.id === selectedEncounterId) ?? null;

  async function chooseFolder() {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    const folder = await api.selectFolder();
    if (folder) {
      setFolderInput(folder);
    }
  }

  async function chooseImportFile() {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    const filePath = await api.selectLogFile();
    if (filePath) {
      setImportFilePath(filePath);
      setFolderInput((current) => current || getParentDirectory(filePath));
    }
  }

  async function discoverLogs() {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    setDiscoveringLogs(true);
    setLogCandidates([]);
    setHasScannedLogs(true);
    try {
      const candidates = await api.discoverLogs();
      setLogCandidates(candidates);
    } finally {
      setDiscoveringLogs(false);
    }
  }

  async function startMonitoring() {
    const api = window.neverwinterApi;
    if (!api || !folderInput.trim()) {
      return;
    }

    setStarting(true);
    try {
      const snapshot = await api.startMonitoring({
        folderPath: folderInput.trim(),
        inactivityTimeoutMs: 10_000
      });
      setState(snapshot);
      setView("live");
    } finally {
      setStarting(false);
    }
  }

  async function startMonitoringFromFile() {
    const api = window.neverwinterApi;
    if (!api || !importFilePath.trim()) {
      return;
    }

    setStarting(true);
    try {
      const snapshot = await api.startMonitoring({
        filePath: importFilePath.trim(),
        inactivityTimeoutMs: 10_000
      });
      setState(snapshot);
      setFolderInput(snapshot.selectedLogFolder ?? "");
      setView("live");
    } finally {
      setStarting(false);
    }
  }

  async function importLogFile() {
    const api = window.neverwinterApi;
    if (!api || !importFilePath.trim()) {
      return;
    }

    setStarting(true);
    try {
      const snapshot = await api.importLogFile(importFilePath.trim());
      setState(snapshot);
      setView("players");
    } finally {
      setStarting(false);
    }
  }

  async function stopMonitoring() {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    const snapshot = await api.stopMonitoring();
    setState(snapshot);
    setFolderInput("");
    setImportFilePath("");
    setPendingSnapshot(null);
    setView("setup");
  }

  return (
    <ObsidianScreens
      state={state}
      view={view}
      detailTab={detailTab}
      playerRows={playerRows}
      livePlayerRows={livePlayerRows}
      liveScope={liveScope}
      liveDiagnostics={liveDiagnostics}
      selectedPlayer={selectedPlayer}
      selectedEncounter={selectedEncounter}
      availableEncounters={availableEncounters}
      includeCompanions={includeCompanions}
      isDesktopRuntime={isDesktopRuntime}
      notificationsOpen={notificationsOpen}
      diagnosticsOpen={diagnosticsOpen}
      folderInput={folderInput}
      importFilePath={importFilePath}
      logCandidates={logCandidates}
      discoveringLogs={discoveringLogs}
      hasScannedLogs={hasScannedLogs}
      starting={starting}
      onViewChange={setView}
      onDetailTabChange={setDetailTab}
      onFolderInputChange={setFolderInput}
      onImportFileChange={setImportFilePath}
      onChooseFolder={() => void chooseFolder()}
      onChooseImportFile={() => void chooseImportFile()}
      onDiscoverLogs={() => void discoverLogs()}
      onUseDiscoveredCandidate={(candidate) => {
        setFolderInput(candidate.folderPath);
        if (candidate.filePath) {
          setImportFilePath(candidate.filePath);
        }
      }}
      onStartMonitoring={() => void startMonitoring()}
      onStartMonitoringFromFile={() => void startMonitoringFromFile()}
      onImportLogFile={() => void importLogFile()}
      onStopMonitoring={() => void stopMonitoring()}
      onToggleCompanions={() => setIncludeCompanions((value) => !value)}
      onSelectPlayer={(playerId) => {
        setSelectedPlayerId(playerId);
        setView("players");
      }}
      onSelectEncounter={setSelectedEncounterId}
      onToggleNotifications={() => setNotificationsOpen((value) => !value)}
      onToggleDiagnostics={() => setDiagnosticsOpen((value) => !value)}
      onBackToPlayers={() => setView("live")}
      rendererSettings={rendererSettings}
      onRendererSettingsChange={setRendererSettings}
    />
  );
}
