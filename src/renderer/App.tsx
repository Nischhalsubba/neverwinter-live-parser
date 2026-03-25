import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
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
  ObsidianScreens
} from "./components/ObsidianScreens";
import { DEFAULT_SETTINGS, type ProfileSettings } from "./rendererSettings";

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
const SETUP_HELP_STORAGE_KEY = "oa-setup-helper-dismissed";
const EMPTY_PLAYER_ROWS: ReturnType<typeof buildPlayerRows> = [];
const ANALYSIS_HEAVY_VIEWS: ReadonlySet<View> = new Set(["live", "players", "recent"]);

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

function isPlayerOwnedCombatant(combatant: AppState["analysis"]["combatants"][number]): boolean {
  return combatant.type === "player" || combatant.ownerId.startsWith("P[");
}

function toBootstrapState(snapshot: AppState): AppState {
  return {
    ...snapshot,
    analysis: {
      ...snapshot.analysis,
      combatants: []
    }
  };
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
  const [logCandidates, setLogCandidates] = useState<DiscoveredLogCandidate[]>([]);
  const [discoveringLogs, setDiscoveringLogs] = useState(false);
  const [hasScannedLogs, setHasScannedLogs] = useState(false);
  const [errorLogDirectory, setErrorLogDirectory] = useState("");

  useEffect(() => {
    const api = window.neverwinterApi;
    setIsDesktopRuntime(Boolean(api));
    if (!api) {
      return;
    }

    void api.getBootstrapState().then((snapshot) => {
      startTransition(() => {
        setState(snapshot);
        setFolderInput(snapshot.watcherStatus === "watching" ? snapshot.selectedLogFolder ?? "" : "");
        setImportFilePath(snapshot.importedLogFile ?? snapshot.activeLogFile ?? "");
      });
    });
    void api.getLogDirectory().then(setErrorLogDirectory).catch(() => {
      setErrorLogDirectory("");
    });

    return api.onState((snapshot) => {
      // Apply the latest monitoring snapshot immediately so live combat rows
      // never lag behind a previously buffered renderer frame.
      startTransition(() => {
        setState((current) =>
          ANALYSIS_HEAVY_VIEWS.has(view) ? snapshot : toBootstrapState(snapshot)
        );
        setImportFilePath((current) =>
          current.trim()
            ? current
            : snapshot.importedLogFile ?? snapshot.activeLogFile ?? ""
        );
        if (snapshot.watcherStatus === "watching" && snapshot.selectedLogFolder) {
          setFolderInput(snapshot.selectedLogFolder);
        }
      });
    });
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(rendererSettings));
  }, [rendererSettings]);

  useEffect(() => {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    // Persist renderer-side faults next to the main-process logs so future
    // debugging does not depend on an open DevTools session.
    const handleError = (event: ErrorEvent) => {
      void api.logRendererError(
        `${event.message}\n${event.filename}:${event.lineno}:${event.colno}\n${event.error?.stack ?? ""}`,
        "Renderer window error"
      );
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      void api.logRendererError(String(event.reason), "Renderer unhandled rejection");
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const shouldBuildHeavyAnalysis = ANALYSIS_HEAVY_VIEWS.has(view);

  useEffect(() => {
    const api = window.neverwinterApi;
    if (!api || !shouldBuildHeavyAnalysis) {
      return;
    }

    void api.getState().then((snapshot) => {
      startTransition(() => {
        setState(snapshot);
      });
    });
  }, [shouldBuildHeavyAnalysis]);
  const playerOwnedCombatants = useMemo(
    () =>
      shouldBuildHeavyAnalysis
        ? state.analysis.combatants.filter(isPlayerOwnedCombatant)
        : [],
    [shouldBuildHeavyAnalysis, state.analysis.combatants]
  );
  const deferredCombatants = useDeferredValue(playerOwnedCombatants);

  // Building player rows is the most expensive renderer-side operation.
  // Skip it entirely on non-analysis screens so startup remains lightweight.
  const playerRows = useMemo(
    () =>
      shouldBuildHeavyAnalysis
        ? buildPlayerRows(deferredCombatants, includeCompanions)
        : EMPTY_PLAYER_ROWS,
    [deferredCombatants, includeCompanions, shouldBuildHeavyAnalysis]
  );
  const encounterScopedLiveRows = useMemo(
    () =>
      shouldBuildHeavyAnalysis
        ? buildPlayerRows(deferredCombatants, includeCompanions, {
            encounterId: state.currentEncounter?.id ?? null,
            encounterDurationMs: state.currentEncounter?.durationMs ?? 0
          })
        : EMPTY_PLAYER_ROWS,
    [
      deferredCombatants,
      includeCompanions,
      shouldBuildHeavyAnalysis,
      state.currentEncounter
    ]
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
    hasMeaningfulEncounter(state.currentEncounter) && hasEncounterScopedRows
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
    () =>
      shouldBuildHeavyAnalysis
        ? getEncounterSnapshots(state.recentEncounters, state.currentEncounter)
        : [],
    [shouldBuildHeavyAnalysis, state.currentEncounter, state.recentEncounters]
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
    setView("setup");
  }

  async function clearRendererCache() {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    window.localStorage.removeItem(SETUP_HELP_STORAGE_KEY);
    setRendererSettings(DEFAULT_SETTINGS);
    setSearchParamsToDefault();
  }

  function setSearchParamsToDefault() {
    setSelectedEncounterId("all");
    setSelectedPlayerId(null);
    setNotificationsOpen(false);
    setDiagnosticsOpen(false);
    setIncludeCompanions(true);
    setHasScannedLogs(false);
    setLogCandidates([]);
  }

  async function clearAppData() {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    const snapshot = await api.clearData();
    setState(snapshot);
    setFolderInput("");
    setImportFilePath("");
    setView("setup");
    setSearchParamsToDefault();
  }

  async function clearLogs() {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    const logDirectory = await api.clearLogs();
    setErrorLogDirectory(logDirectory);
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
      errorLogDirectory={errorLogDirectory}
      onClearRendererCache={() => void clearRendererCache()}
      onClearAppData={() => void clearAppData()}
      onClearLogs={() => void clearLogs()}
    />
  );
}
