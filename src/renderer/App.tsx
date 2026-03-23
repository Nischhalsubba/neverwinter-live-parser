import { useEffect, useMemo, useState } from "react";
import type { AppState, CombatantSnapshot, SkillStat } from "../shared/types";

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

type View = "setup" | "live" | "players" | "recent" | "debug";

type PlayerRow = {
  id: string;
  displayName: string;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  hits: number;
  critCount: number;
  critRate: number;
  dps: number;
  hps: number;
  topSkills: SkillStat[];
  companionCount: number;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatShort(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatNumber(value);
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function mergeSkills(skills: SkillStat[]): SkillStat[] {
  const totals = new Map<string, SkillStat>();
  for (const skill of skills) {
    const current = totals.get(skill.abilityName) ?? {
      abilityName: skill.abilityName,
      total: 0,
      hits: 0
    };
    current.total += skill.total;
    current.hits += skill.hits;
    totals.set(skill.abilityName, current);
  }

  return Array.from(totals.values())
    .sort((left, right) => right.total - left.total)
    .slice(0, 8);
}

function buildPlayerRows(
  combatants: CombatantSnapshot[],
  includeCompanions: boolean
): PlayerRow[] {
  const groups = new Map<string, CombatantSnapshot[]>();

  for (const combatant of combatants) {
    const groupKey =
      combatant.type === "companion" ? combatant.ownerId : combatant.id;
    const current = groups.get(groupKey) ?? [];
    current.push(combatant);
    groups.set(groupKey, current);
  }

  return Array.from(groups.entries())
    .map(([groupKey, members]) => {
      const primary =
        members.find((member) => member.type === "player" || member.id === member.ownerId) ??
        members[0];
      const includedMembers = includeCompanions
        ? members
        : members.filter((member) => member.type !== "companion");
      const sourceMembers = includedMembers.length > 0 ? includedMembers : [primary];
      const totalDamage = sourceMembers.reduce(
        (total, member) => total + member.totalDamage,
        0
      );
      const totalHealing = sourceMembers.reduce(
        (total, member) => total + member.totalHealing,
        0
      );
      const damageTaken = sourceMembers.reduce(
        (total, member) => total + member.damageTaken,
        0
      );
      const hits = sourceMembers.reduce((total, member) => total + member.hits, 0);
      const critCount = sourceMembers.reduce(
        (total, member) => total + member.critCount,
        0
      );
      const dps = sourceMembers.reduce((total, member) => total + member.dps, 0);
      const hps = sourceMembers.reduce((total, member) => total + member.hps, 0);
      const topSkills = mergeSkills(sourceMembers.flatMap((member) => member.topSkills));

      return {
        id: groupKey,
        displayName: primary.ownerName || primary.displayName,
        totalDamage,
        totalHealing,
        damageTaken,
        hits,
        critCount,
        critRate: hits === 0 ? 0 : critCount / hits,
        dps,
        hps,
        topSkills,
        companionCount: members.filter((member) => member.type === "companion").length
      };
    })
    .sort((left, right) => right.totalDamage - left.totalDamage);
}

export function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [view, setView] = useState<View>("setup");
  const [folderInput, setFolderInput] = useState("");
  const [importFilePath, setImportFilePath] = useState("");
  const [starting, setStarting] = useState(false);
  const [includeCompanions, setIncludeCompanions] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(
    Boolean(window.neverwinterApi)
  );

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

  useEffect(() => {
    if (!playerRows.length) {
      setSelectedPlayerId(null);
      return;
    }

    if (!selectedPlayerId || !playerRows.some((row) => row.id === selectedPlayerId)) {
      setSelectedPlayerId(playerRows[0].id);
    }
  }, [playerRows, selectedPlayerId]);

  const selectedPlayer =
    playerRows.find((player) => player.id === selectedPlayerId) ?? null;

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

  const current = state.currentEncounter;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Neverwinter</p>
          <h1>Live Parser</h1>
          <p className="muted">
            Local parser for live monitoring and imported combat log analysis.
          </p>
          {!isDesktopRuntime && (
            <div className="runtime-banner">
              Browser preview only. Live monitoring and file import require the
              Electron desktop app on Windows.
            </div>
          )}
        </div>
        <nav className="nav">
          {(["setup", "live", "players", "recent", "debug"] as View[]).map((item) => (
            <button
              className={view === item ? "nav-button active" : "nav-button"}
              key={item}
              onClick={() => setView(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="status-card">
          <span>Status</span>
          <strong>{state.watcherStatus}</strong>
          <span>Analysis</span>
          <strong>{state.analysis.mode}</strong>
          <span>Parsed Events</span>
          <strong>{formatNumber(state.analysis.parsedEvents)}</strong>
        </div>
      </aside>

      <main className="content">
        {view === "setup" && (
          <section className="panel">
            <h2>Setup</h2>
            <div className="setup-grid">
              <article className="panel-section">
                <div className="section-header">
                  <h3>Live Folder Watch</h3>
                </div>
                <label className="field">
                  <span>Neverwinter log folder</span>
                  <input
                    value={folderInput}
                    onChange={(event) => setFolderInput(event.target.value)}
                    placeholder="C:\\Games\\Neverwinter\\Live\\logs\\GameClient"
                  />
                </label>

                <div className="button-row">
                  <button onClick={() => void chooseFolder()}>Select Folder</button>
                  <button
                    onClick={() => void startMonitoring()}
                    disabled={starting || !folderInput.trim() || !isDesktopRuntime}
                  >
                    Start Live Monitor
                  </button>
                  <button
                    onClick={() => void stopMonitoring()}
                    disabled={!isDesktopRuntime}
                  >
                    Stop
                  </button>
                </div>
              </article>

              <article className="panel-section">
                <div className="section-header">
                  <h3>Import Existing Log</h3>
                </div>
                <label className="field">
                  <span>Recorded combat log file</span>
                  <input
                    value={importFilePath}
                    onChange={(event) => setImportFilePath(event.target.value)}
                    placeholder="C:\\Logs\\combatlog_2026-03-23.log"
                  />
                </label>

                <div className="button-row">
                  <button onClick={() => void chooseImportFile()}>Choose File</button>
                  <button
                    onClick={() => void importLogFile()}
                    disabled={starting || !importFilePath.trim() || !isDesktopRuntime}
                  >
                    Analyze Log
                  </button>
                </div>
              </article>
            </div>

            <div className="details-grid">
              <article className="card">
                <span>Active File</span>
                <strong>{state.activeLogFile ?? "No live file selected"}</strong>
              </article>
              <article className="card">
                <span>Imported File</span>
                <strong>{state.importedLogFile ?? "No imported file selected"}</strong>
              </article>
              <article className="card">
                <span>Read Offset</span>
                <strong>{formatNumber(state.debug.currentOffset)}</strong>
              </article>
            </div>
          </section>
        )}

        {view === "live" && (
          <section className="panel">
            <h2>Current Encounter</h2>
            <div className="hero-grid">
              <article className="hero-card">
                <span>Duration</span>
                <strong>{current ? formatDuration(current.durationMs) : "00:00"}</strong>
              </article>
              <article className="hero-card">
                <span>DPS</span>
                <strong>{current ? formatShort(current.dps) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>Total Damage</span>
                <strong>{current ? formatShort(current.totalDamage) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>HPS</span>
                <strong>{current ? formatShort(current.hps) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>Total Healing</span>
                <strong>{current ? formatShort(current.totalHealing) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>Damage Taken</span>
                <strong>{current ? formatShort(current.damageTaken) : "0"}</strong>
              </article>
            </div>

            <div className="details-grid">
              <article className="card">
                <span>Analysis Source</span>
                <strong>{state.analysis.sourcePath ?? "No source active"}</strong>
              </article>
              <article className="card">
                <span>Total Lines</span>
                <strong>{formatNumber(state.analysis.totalLines)}</strong>
              </article>
              <article className="card">
                <span>Parsed Events</span>
                <strong>{formatNumber(state.analysis.parsedEvents)}</strong>
              </article>
            </div>
          </section>
        )}

        {view === "players" && (
          <section className="panel">
            <div className="section-header">
              <h2>Party Overview</h2>
              <button onClick={() => setIncludeCompanions((value) => !value)}>
                {includeCompanions ? "Pets Included" : "Pets Excluded"}
              </button>
            </div>

            <div className="details-grid">
              <article className="card">
                <span>Source</span>
                <strong>{state.analysis.sourcePath ?? "No log loaded"}</strong>
              </article>
              <article className="card">
                <span>Combatants</span>
                <strong>{formatNumber(state.analysis.combatants.length)}</strong>
              </article>
              <article className="card">
                <span>Duration</span>
                <strong>{formatDuration(state.analysis.durationMs)}</strong>
              </article>
            </div>

            <div className="player-layout">
              <article className="panel-section">
                <div className="section-header">
                  <h3>Players</h3>
                  <span>{playerRows.length}</span>
                </div>
                <div className="table">
                  <div className="row row-head">
                    <strong>Player</strong>
                    <strong>Damage</strong>
                    <strong>DPS</strong>
                    <strong>Hits</strong>
                  </div>
                  {playerRows.map((player) => (
                    <button
                      className={
                        selectedPlayerId === player.id ? "row selectable active-row" : "row selectable"
                      }
                      key={player.id}
                      onClick={() => setSelectedPlayerId(player.id)}
                    >
                      <span>
                        {player.displayName}
                        {player.companionCount > 0 && (
                          <small className="pill">
                            {player.companionCount} companion
                            {player.companionCount === 1 ? "" : "s"}
                          </small>
                        )}
                      </span>
                      <strong>{formatShort(player.totalDamage)}</strong>
                      <strong>{formatShort(player.dps)}</strong>
                      <strong>{formatNumber(player.hits)}</strong>
                    </button>
                  ))}
                  {!playerRows.length && (
                    <div className="row empty">
                      No player breakdown yet. Import a `.log` file or fix the parse
                      rules for the active encounter.
                    </div>
                  )}
                </div>
              </article>

              <article className="panel-section">
                <div className="section-header">
                  <h3>{selectedPlayer ? selectedPlayer.displayName : "Player Detail"}</h3>
                  <span>
                    {includeCompanions ? "With companion damage" : "Without companion damage"}
                  </span>
                </div>

                {selectedPlayer ? (
                  <>
                    <div className="hero-grid compact-grid">
                      <article className="hero-card">
                        <span>Total Damage</span>
                        <strong>{formatShort(selectedPlayer.totalDamage)}</strong>
                      </article>
                      <article className="hero-card">
                        <span>DPS</span>
                        <strong>{formatShort(selectedPlayer.dps)}</strong>
                      </article>
                      <article className="hero-card">
                        <span>Total Healing</span>
                        <strong>{formatShort(selectedPlayer.totalHealing)}</strong>
                      </article>
                      <article className="hero-card">
                        <span>Damage Taken</span>
                        <strong>{formatShort(selectedPlayer.damageTaken)}</strong>
                      </article>
                      <article className="hero-card">
                        <span>Crit Rate</span>
                        <strong>{(selectedPlayer.critRate * 100).toFixed(1)}%</strong>
                      </article>
                      <article className="hero-card">
                        <span>Hits</span>
                        <strong>{formatNumber(selectedPlayer.hits)}</strong>
                      </article>
                    </div>

                    <article className="panel-section nested-panel">
                      <div className="section-header">
                        <h3>Top Damage Powers</h3>
                        <span>{selectedPlayer.topSkills.length}</span>
                      </div>
                      <div className="table">
                        {selectedPlayer.topSkills.map((skill) => (
                          <div className="row" key={skill.abilityName}>
                            <span>{skill.abilityName}</span>
                            <strong>{formatShort(skill.total)}</strong>
                          </div>
                        ))}
                        {!selectedPlayer.topSkills.length && (
                          <div className="row empty">No skill breakdown yet</div>
                        )}
                      </div>
                    </article>
                  </>
                ) : (
                  <div className="row empty">
                    Select a player to inspect their damage and power breakdown.
                  </div>
                )}
              </article>
            </div>
          </section>
        )}

        {view === "recent" && (
          <section className="panel">
            <h2>Recent Encounters</h2>
            <div className="table">
              {state.recentEncounters.map((encounter) => (
                <div className="row" key={encounter.id}>
                  <span>{new Date(encounter.startedAt).toLocaleTimeString()}</span>
                  <span>{formatDuration(encounter.durationMs)}</span>
                  <span>{formatShort(encounter.dps)} DPS</span>
                  <strong>{formatShort(encounter.totalDamage)} damage</strong>
                </div>
              ))}
              {!state.recentEncounters.length && (
                <div className="row empty">No completed encounters yet</div>
              )}
            </div>
          </section>
        )}

        {view === "debug" && (
          <section className="panel">
            <h2>Debug</h2>
            <div className="debug-grid">
              <article className="panel-section">
                <div className="section-header">
                  <h3>Latest Raw Lines</h3>
                  <span>{state.debug.latestRawLines.length}</span>
                </div>
                <pre className="log-box">{state.debug.latestRawLines.join("\n")}</pre>
              </article>
              <article className="panel-section">
                <div className="section-header">
                  <h3>Parse Issues</h3>
                  <span>{state.debug.parseIssues.length}</span>
                </div>
                <div className="table">
                  {state.debug.parseIssues.map((issue, index) => (
                    <div className="row issue" key={`${issue.seenAt}-${index}`}>
                      <span>{issue.reason}</span>
                      <small>{issue.line || "No raw line attached"}</small>
                    </div>
                  ))}
                  {!state.debug.parseIssues.length && (
                    <div className="row empty">No parse issues</div>
                  )}
                </div>
              </article>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
