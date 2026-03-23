import { useEffect, useMemo, useState } from "react";
import type { AppState } from "../shared/types";
import {
  buildPlayerRows,
  getEncounterSnapshots,
  type DetailTab,
  type View
} from "./analysisViewModel";
import { ObsidianScreens } from "./components/ObsidianScreens";

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
  }
};

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

  useEffect(() => {
    const api = window.neverwinterApi;
    setIsDesktopRuntime(Boolean(api));
    if (!api) {
      return;
    }

    void api.getState().then((snapshot) => {
      setState(snapshot);
      setFolderInput(snapshot.selectedLogFolder ?? "");
      setImportFilePath(snapshot.importedLogFile ?? "");
    });

    return api.onState((snapshot) => {
      setState(snapshot);
      setImportFilePath(snapshot.importedLogFile ?? "");
    });
  }, []);

  const playerRows = useMemo(
    () => buildPlayerRows(state.analysis.combatants, includeCompanions),
    [includeCompanions, state.analysis.combatants]
  );

  const availableEncounters = useMemo(
    () => getEncounterSnapshots(state.recentEncounters, state.currentEncounter),
    [state.currentEncounter, state.recentEncounters]
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
  }

  return (
    <ObsidianScreens
      state={state}
      view={view}
      detailTab={detailTab}
      playerRows={playerRows}
      selectedPlayer={selectedPlayer}
      selectedEncounter={selectedEncounter}
      availableEncounters={availableEncounters}
      includeCompanions={includeCompanions}
      isDesktopRuntime={isDesktopRuntime}
      notificationsOpen={notificationsOpen}
      diagnosticsOpen={diagnosticsOpen}
      folderInput={folderInput}
      importFilePath={importFilePath}
      starting={starting}
      onViewChange={setView}
      onDetailTabChange={setDetailTab}
      onFolderInputChange={setFolderInput}
      onImportFileChange={setImportFilePath}
      onChooseFolder={() => void chooseFolder()}
      onChooseImportFile={() => void chooseImportFile()}
      onStartMonitoring={() => void startMonitoring()}
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
    />
  );
}
