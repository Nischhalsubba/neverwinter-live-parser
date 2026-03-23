import { useEffect, useMemo, useState } from "react";
import type {
  AppState,
  CombatantEncounterStat,
  CombatantSnapshot,
  EncounterSnapshot,
  SkillStat,
  TargetStat,
  TimelinePoint
} from "../shared/types";
import { getPowerMeta, inferBuildFromSkills, isKnownCompanion } from "./nwMetadata";

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
type DetailTab =
  | "overview"
  | "timeline"
  | "damageOut"
  | "healing"
  | "damageTaken"
  | "timing"
  | "positioning"
  | "other"
  | "deaths";

type PlayerRow = {
  id: string;
  displayName: string;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  hits: number;
  critCount: number;
  critRate: number;
  flankRate: number;
  dps: number;
  hps: number;
  topSkills: SkillStat[];
  companionCount: number;
  targets: TargetStat[];
  timeline: TimelinePoint[];
  encounters: CombatantEncounterStat[];
  deaths: number;
  className: string | null;
  paragon: string | null;
  buildConfidence: number;
};

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline & Powers" },
  { id: "damageOut", label: "Damage Out" },
  { id: "healing", label: "Healing" },
  { id: "damageTaken", label: "Damage Taken" },
  { id: "timing", label: "Timing" },
  { id: "positioning", label: "Positioning" },
  { id: "other", label: "Other" },
  { id: "deaths", label: "Deaths" }
];

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
    .slice(0, 12);
}

function mergeTargets(targets: TargetStat[]): TargetStat[] {
  const totals = new Map<string, TargetStat>();
  for (const target of targets) {
    const current = totals.get(target.targetName) ?? {
      targetName: target.targetName,
      totalDamage: 0,
      hits: 0,
      critCount: 0
    };
    current.totalDamage += target.totalDamage;
    current.hits += target.hits;
    current.critCount += target.critCount;
    totals.set(target.targetName, current);
  }

  return Array.from(totals.values()).sort(
    (left, right) => right.totalDamage - left.totalDamage
  );
}

function mergeTimeline(points: TimelinePoint[]): TimelinePoint[] {
  const totals = new Map<number, TimelinePoint>();
  for (const point of points) {
    const current = totals.get(point.second) ?? {
      second: point.second,
      damage: 0,
      healing: 0,
      hits: 0
    };
    current.damage += point.damage;
    current.healing += point.healing;
    current.hits += point.hits;
    totals.set(point.second, current);
  }

  return Array.from(totals.values()).sort((left, right) => left.second - right.second);
}

function mergeEncounters(
  encounters: CombatantEncounterStat[]
): CombatantEncounterStat[] {
  const totals = new Map<string, CombatantEncounterStat>();
  for (const encounter of encounters) {
    const current = totals.get(encounter.encounterId) ?? {
      encounterId: encounter.encounterId,
      totalDamage: 0,
      totalHealing: 0,
      damageTaken: 0,
      hits: 0
    };
    current.totalDamage += encounter.totalDamage;
    current.totalHealing += encounter.totalHealing;
    current.damageTaken += encounter.damageTaken;
    current.hits += encounter.hits;
    totals.set(encounter.encounterId, current);
  }

  return Array.from(totals.values());
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
      const flankCount = sourceMembers.reduce(
        (total, member) => total + member.flankRate * member.hits,
        0
      );
      const dps = sourceMembers.reduce((total, member) => total + member.dps, 0);
      const hps = sourceMembers.reduce((total, member) => total + member.hps, 0);
      const topSkills = mergeSkills(sourceMembers.flatMap((member) => member.topSkills));
      const inferredBuild = inferBuildFromSkills(topSkills);

      return {
        id: groupKey,
        displayName: primary.ownerName || primary.displayName,
        totalDamage,
        totalHealing,
        damageTaken,
        hits,
        critCount,
        critRate: hits === 0 ? 0 : critCount / hits,
        flankRate: hits === 0 ? 0 : flankCount / hits,
        dps,
        hps,
        topSkills,
        companionCount: members.filter((member) => member.type === "companion").length,
        targets: mergeTargets(sourceMembers.flatMap((member) => member.targets)),
        timeline: mergeTimeline(sourceMembers.flatMap((member) => member.timeline)),
        encounters: mergeEncounters(sourceMembers.flatMap((member) => member.encounters)),
        deaths: sourceMembers.reduce((total, member) => total + member.deaths, 0),
        className: inferredBuild.className,
        paragon: inferredBuild.paragon,
        buildConfidence: inferredBuild.confidence
      };
    })
    .sort((left, right) => right.totalDamage - left.totalDamage);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="hero-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TimelineChart({
  points,
  encounter
}: {
  points: TimelinePoint[];
  encounter: EncounterSnapshot | null;
}) {
  const filteredPoints =
    encounter === null
      ? points
      : points.filter((point) => point.second <= Math.ceil(encounter.durationMs / 1000));
  const width = 900;
  const height = 260;
  const maxValue = Math.max(1, ...filteredPoints.map((point) => point.damage));
  const polyline = filteredPoints
    .map((point, index) => {
      const x =
        filteredPoints.length <= 1
          ? 0
          : (index / (filteredPoints.length - 1)) * width;
      const y = height - (point.damage / maxValue) * (height - 24);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-shell">
      <div className="chart-meta">
        <span>Damage Timeline</span>
        <strong>{encounter ? encounter.label : "All Encounters"}</strong>
      </div>
      {filteredPoints.length > 0 ? (
        <svg className="timeline-chart" viewBox={`0 0 ${width} ${height}`}>
          <polyline
            fill="none"
            stroke="#8fa5ff"
            strokeWidth="3"
            points={polyline}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <div className="empty-chart">No timeline data for this focus selection</div>
      )}
    </div>
  );
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

  const availableEncounters = useMemo(
    () =>
      [...state.recentEncounters]
        .sort((left, right) => left.startedAt - right.startedAt)
        .concat(state.currentEncounter ? [state.currentEncounter] : []),
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
      : availableEncounters.find((encounter) => encounter.id === selectedEncounterId) ??
        null;
  const selectedPlayerEncounter =
    selectedPlayer && selectedEncounter
      ? selectedPlayer.encounters.find(
          (encounter) => encounter.encounterId === selectedEncounter.id
        ) ?? null
      : null;

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
  const displayedDamage =
    selectedPlayerEncounter?.totalDamage ?? selectedPlayer?.totalDamage ?? 0;
  const displayedHealing =
    selectedPlayerEncounter?.totalHealing ?? selectedPlayer?.totalHealing ?? 0;
  const displayedTaken =
    selectedPlayerEncounter?.damageTaken ?? selectedPlayer?.damageTaken ?? 0;
  const displayedHits = selectedPlayerEncounter?.hits ?? selectedPlayer?.hits ?? 0;
  const displayedDurationMs = selectedEncounter?.durationMs ?? state.analysis.durationMs;
  const displayedDps =
    displayedDurationMs > 0 ? displayedDamage / (displayedDurationMs / 1000) : 0;
  const peakTimeline = selectedPlayer
    ? [...selectedPlayer.timeline].sort((left, right) => right.damage - left.damage)[0]
    : null;

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

            <div className="player-layout single-column">
              <article className="panel-section">
                <div className="section-header">
                  <h3>Players</h3>
                  <span>{playerRows.length}</span>
                </div>
                <div className="table">
                  <div className="row row-head row-grid-player">
                    <strong>Player</strong>
                    <strong>Damage</strong>
                    <strong>DPS</strong>
                    <strong>Hits</strong>
                    <strong>Duration</strong>
                  </div>
                  {playerRows.map((player) => (
                    <button
                      className={
                        selectedPlayerId === player.id
                          ? "row selectable active-row row-grid-player"
                          : "row selectable row-grid-player"
                      }
                      key={player.id}
                      onClick={() => {
                        setSelectedPlayerId(player.id);
                        setDetailTab("overview");
                      }}
                    >
                      <span>
                        {player.displayName}
                        {player.className && (
                          <small className="pill class-pill">
                            {player.className}
                            {player.paragon ? ` / ${player.paragon}` : ""}
                          </small>
                        )}
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
                      <strong>{formatDuration(state.analysis.durationMs)}</strong>
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
                <div className="detail-header">
                  <div>
                    <h3>{selectedPlayer ? selectedPlayer.displayName : "Player Detail"}</h3>
                    <p className="muted">
                      {includeCompanions ? "With companion damage" : "Without companion damage"}
                    </p>
                    {selectedPlayer?.className && (
                      <div className="detail-badges">
                        <span className="pill class-pill">
                          {selectedPlayer.className}
                          {selectedPlayer.paragon ? ` / ${selectedPlayer.paragon}` : ""}
                        </span>
                        <span className="pill subtle-pill">
                          {(selectedPlayer.buildConfidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setIncludeCompanions((value) => !value)}>
                    {includeCompanions ? "Pets Included" : "Pets Excluded"}
                  </button>
                </div>

                <div className="focus-strip">
                  <span className="focus-label">Focus</span>
                  <button
                    className={selectedEncounterId === "all" ? "chip active" : "chip"}
                    onClick={() => setSelectedEncounterId("all")}
                  >
                    All Encounters
                  </button>
                  {availableEncounters.map((encounter, index) => (
                    <button
                      className={selectedEncounterId === encounter.id ? "chip active" : "chip"}
                      key={encounter.id}
                      onClick={() => setSelectedEncounterId(encounter.id)}
                    >
                      #{index + 1} {encounter.label} ({formatDuration(encounter.durationMs)})
                    </button>
                  ))}
                </div>

                <div className="tab-strip">
                  {DETAIL_TABS.map((tab) => (
                    <button
                      className={detailTab === tab.id ? "tab-button active" : "tab-button"}
                      key={tab.id}
                      onClick={() => setDetailTab(tab.id)}
                    >
                      {tab.label}
                      {tab.id === "deaths" && selectedPlayer && (
                        <span className="tab-badge">{selectedPlayer.deaths}</span>
                      )}
                    </button>
                  ))}
                </div>

                {selectedPlayer ? (
                  <>
                    <div className="hero-grid compact-grid">
                      <MetricCard label="Total Damage" value={formatShort(displayedDamage)} />
                      <MetricCard label="DPS" value={formatShort(displayedDps)} />
                      <MetricCard label="Healing Done" value={formatShort(displayedHealing)} />
                      <MetricCard label="Damage Taken" value={formatShort(displayedTaken)} />
                      <MetricCard label="Crit Rate" value={`${(selectedPlayer.critRate * 100).toFixed(1)}%`} />
                      <MetricCard label="Flank Rate" value={`${(selectedPlayer.flankRate * 100).toFixed(1)}%`} />
                      <MetricCard label="Hits" value={formatNumber(displayedHits)} />
                      <MetricCard label="Duration" value={formatDuration(displayedDurationMs)} />
                    </div>

                    {detailTab === "overview" && (
                      <div className="detail-grid">
                        <article className="panel-section nested-panel">
                          <div className="section-header">
                            <h3>Top Damage Powers</h3>
                          </div>
                          <div className="table">
                            {selectedPlayer.topSkills.slice(0, 8).map((skill) => (
                              <div className="row" key={skill.abilityName}>
                                <span>
                                  {skill.abilityName}
                                  {getPowerMeta(skill.abilityName) && (
                                    <small className="pill subtle-pill">
                                      {getPowerMeta(skill.abilityName)?.powertype}
                                    </small>
                                  )}
                                </span>
                                <strong>{formatShort(skill.total)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>

                        <article className="panel-section nested-panel">
                          <div className="section-header">
                            <h3>Damage By Target</h3>
                          </div>
                          <div className="table">
                            {selectedPlayer.targets.slice(0, 8).map((target) => (
                              <div className="row" key={target.targetName}>
                                <span>{target.targetName}</span>
                                <strong>{formatShort(target.totalDamage)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>
                      </div>
                    )}

                    {detailTab === "timeline" && (
                      <div className="detail-grid single-detail">
                        <TimelineChart
                          points={selectedPlayer.timeline}
                          encounter={selectedEncounter}
                        />
                        <article className="panel-section nested-panel">
                          <div className="section-header">
                            <h3>Power Usage</h3>
                          </div>
                          <div className="table">
                            {selectedPlayer.topSkills.map((skill) => (
                              <div className="row" key={skill.abilityName}>
                                <span>
                                  {skill.abilityName}
                                  {getPowerMeta(skill.abilityName) && (
                                    <small className="pill subtle-pill">
                                      {getPowerMeta(skill.abilityName)?.powertype}
                                    </small>
                                  )}
                                </span>
                                <span>{formatNumber(skill.hits)} hits</span>
                                <strong>{formatShort(skill.total)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>
                      </div>
                    )}

                    {detailTab === "damageOut" && (
                      <div className="detail-grid">
                        <article className="panel-section nested-panel">
                          <div className="section-header">
                            <h3>Targets</h3>
                            <span>Damage on each mob, boss, or add</span>
                          </div>
                          <div className="table">
                            {selectedPlayer.targets.map((target) => (
                              <div className="row" key={target.targetName}>
                                <span>
                                  {target.targetName}
                                  {isKnownCompanion(target.targetName) && (
                                    <small className="pill subtle-pill">Companion</small>
                                  )}
                                </span>
                                <span>{formatNumber(target.hits)} hits</span>
                                <strong>{formatShort(target.totalDamage)}</strong>
                              </div>
                            ))}
                          </div>
                        </article>
                        <article className="panel-section nested-panel">
                          <div className="section-header">
                            <h3>Boss or Phase Damage</h3>
                          </div>
                          <div className="table">
                            {availableEncounters.map((encounter) => {
                              const stat = selectedPlayer.encounters.find(
                                (entry) => entry.encounterId === encounter.id
                              );
                              return (
                                <div className="row" key={encounter.id}>
                                  <span>{encounter.label}</span>
                                  <span>{formatDuration(encounter.durationMs)}</span>
                                  <strong>{formatShort(stat?.totalDamage ?? 0)}</strong>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      </div>
                    )}

                    {detailTab === "healing" && (
                      <article className="panel-section nested-panel">
                        <div className="hero-grid compact-grid">
                          <MetricCard label="Healing Done" value={formatShort(displayedHealing)} />
                          <MetricCard label="HPS" value={formatShort(selectedPlayer.hps)} />
                          <MetricCard label="Hits" value={formatNumber(selectedPlayer.hits)} />
                        </div>
                      </article>
                    )}

                    {detailTab === "damageTaken" && (
                      <article className="panel-section nested-panel">
                        <div className="hero-grid compact-grid">
                          <MetricCard label="Damage Taken" value={formatShort(displayedTaken)} />
                          <MetricCard label="Duration" value={formatDuration(displayedDurationMs)} />
                          <MetricCard label="Recorded Hits" value={formatNumber(displayedHits)} />
                        </div>
                      </article>
                    )}

                    {detailTab === "timing" && (
                      <div className="detail-grid">
                        <article className="panel-section nested-panel">
                          <div className="section-header">
                            <h3>Encounter Timing</h3>
                          </div>
                          <div className="table">
                            {availableEncounters.map((encounter) => {
                              const stat = selectedPlayer.encounters.find(
                                (entry) => entry.encounterId === encounter.id
                              );
                              const dps =
                                encounter.durationMs > 0
                                  ? (stat?.totalDamage ?? 0) /
                                    (encounter.durationMs / 1000)
                                  : 0;
                              return (
                                <div className="row" key={encounter.id}>
                                  <span>{encounter.label}</span>
                                  <span>{formatDuration(encounter.durationMs)}</span>
                                  <strong>{formatShort(dps)} DPS</strong>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                        <article className="panel-section nested-panel">
                          <div className="hero-grid compact-grid">
                            <MetricCard label="Peak 5s Damage" value={formatShort(peakTimeline?.damage ?? 0)} />
                            <MetricCard label="Peak Window Start" value={`${peakTimeline?.second ?? 0}s`} />
                            <MetricCard label="Peak Window Hits" value={formatNumber(peakTimeline?.hits ?? 0)} />
                          </div>
                        </article>
                      </div>
                    )}

                    {detailTab === "positioning" && (
                      <article className="panel-section nested-panel">
                        <div className="hero-grid compact-grid">
                          <MetricCard label="Flank Rate" value={`${(selectedPlayer.flankRate * 100).toFixed(1)}%`} />
                          <MetricCard label="Crit Rate" value={`${(selectedPlayer.critRate * 100).toFixed(1)}%`} />
                          <MetricCard label="Targets Tracked" value={formatNumber(selectedPlayer.targets.length)} />
                        </div>
                      </article>
                    )}

                    {detailTab === "other" && (
                      <article className="panel-section nested-panel">
                        <div className="hero-grid compact-grid">
                          <MetricCard label="Companions" value={formatNumber(selectedPlayer.companionCount)} />
                          <MetricCard label="Timeline Buckets" value={formatNumber(selectedPlayer.timeline.length)} />
                          <MetricCard label="Parsed Events" value={formatNumber(state.analysis.parsedEvents)} />
                        </div>
                      </article>
                    )}

                    {detailTab === "deaths" && (
                      <article className="panel-section nested-panel">
                        <div className="hero-grid compact-grid">
                          <MetricCard label="Deaths" value={formatNumber(selectedPlayer.deaths)} />
                          <MetricCard label="Damage Taken" value={formatShort(selectedPlayer.damageTaken)} />
                          <MetricCard label="Hits" value={formatNumber(selectedPlayer.hits)} />
                        </div>
                        <div className="row empty">
                          Death detail will improve once we capture explicit death-line samples.
                        </div>
                      </article>
                    )}
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
                  <span>{encounter.label}</span>
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
