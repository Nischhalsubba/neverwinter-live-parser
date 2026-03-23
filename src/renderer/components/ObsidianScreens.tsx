import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import metadata from "../../shared/data/nw-metadata.json";
import type {
  AppState,
  EncounterSnapshot,
  SkillStat,
  TimelinePoint
} from "../../shared/types";
import { getPowerMeta, isKnownCompanion } from "../nwMetadata";
import type { DetailTab, PlayerRow, View } from "../analysisViewModel";
import {
  DETAIL_TABS,
  formatDuration,
  formatNumber,
  formatShort
} from "../analysisViewModel";

type ShellProps = {
  state: AppState;
  view: View;
  detailTab: DetailTab;
  playerRows: PlayerRow[];
  livePlayerRows: PlayerRow[];
  selectedPlayer: PlayerRow | null;
  selectedEncounter: EncounterSnapshot | null;
  availableEncounters: EncounterSnapshot[];
  includeCompanions: boolean;
  isDesktopRuntime: boolean;
  notificationsOpen: boolean;
  diagnosticsOpen: boolean;
  folderInput: string;
  importFilePath: string;
  starting: boolean;
  onViewChange: (view: View) => void;
  onDetailTabChange: (tab: DetailTab) => void;
  onFolderInputChange: (value: string) => void;
  onImportFileChange: (value: string) => void;
  onChooseFolder: () => void;
  onChooseImportFile: () => void;
  onStartMonitoring: () => void;
  onStartMonitoringFromFile: () => void;
  onImportLogFile: () => void;
  onStopMonitoring: () => void;
  onToggleCompanions: () => void;
  onSelectPlayer: (playerId: string) => void;
  onSelectEncounter: (encounterId: string) => void;
  onToggleNotifications: () => void;
  onToggleDiagnostics: () => void;
  onBackToPlayers: () => void;
};

type ThemeMode = "obsidian-dark" | "obsidian-flux";

type ProfileSettings = {
  autoStart: boolean;
  soundAlerts: boolean;
  overlayOpacity: number;
  visualCore: ThemeMode;
};

const DEFAULT_SETTINGS: ProfileSettings = {
  autoStart: true,
  soundAlerts: false,
  overlayOpacity: 85,
  visualCore: "obsidian-dark"
};

function Icon({
  name,
  filled = false,
  className
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`.trim()}
      style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function getRuntimeLabel(state: AppState): string {
  if (state.watcherStatus === "error") {
    return "FAULTED";
  }
  if (state.analysis.mode === "live") {
    return "LIVE";
  }
  if (state.analysis.mode === "imported") {
    return "IMPORTED";
  }
  return "IDLE";
}

function getSessionIndicator(state: AppState): {
  label: string;
  detail: string;
  tone: "live" | "old" | "idle";
} {
  if (state.watcherStatus === "watching" && state.analysis.mode === "live") {
    return {
      label: "LIVE",
      detail: "Tracking",
      tone: "live"
    };
  }

  if (state.analysis.mode === "imported") {
    return {
      label: "OLD LOG",
      detail: "Viewing imported log",
      tone: "old"
    };
  }

  return {
    label: "IDLE",
    detail: "Not running",
    tone: "idle"
  };
}

function getSourceLabel(state: AppState): string {
  return state.importedLogFile ?? state.activeLogFile ?? state.analysis.sourcePath ?? "No source linked";
}

function getCombatLogTimestampLabel(filePath: string | null): string {
  if (!filePath) {
    return "Awaiting combatlog_YYYY-MM-DD_HH-MM-SS.log";
  }

  const match = filePath.match(/combatlog_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.log$/i);
  if (!match) {
    return "Using file timestamp from filesystem";
  }

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function classifyLineTags(line: string): Array<{ label: string; tone: "critical" | "advantage" | "heal" | "issue" }> {
  const tags: Array<{ label: string; tone: "critical" | "advantage" | "heal" | "issue" }> = [];
  const lowered = line.toLowerCase();

  if (lowered.includes("critical")) {
    tags.push({ label: "Critical", tone: "critical" });
  }
  if (lowered.includes("flank") || lowered.includes("combat advantage") || lowered.includes("|ca")) {
    tags.push({ label: "CA", tone: "advantage" });
  }
  if (lowered.includes("hitpoints")) {
    tags.push({ label: "Heal", tone: "heal" });
  }

  return tags;
}

function initialsFromName(value: string | null | undefined): string {
  if (!value) {
    return "OP";
  }

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function StatCard({
  label,
  value,
  tone = "default",
  icon,
  hint,
  children
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "secondary" | "tertiary" | "error";
  icon?: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <article className={`oa-stat-card tone-${tone}`}>
      <div className="oa-stat-head">
        {icon ? <Icon name={icon} className="oa-stat-icon" /> : null}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {hint ? <p>{hint}</p> : null}
      {children}
    </article>
  );
}

function SectionHeading({
  icon,
  eyebrow,
  title,
  actions
}: {
  icon?: string;
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="oa-section-head">
      <div>
        {eyebrow ? (
          <p className="oa-eyebrow">
            {icon ? <Icon name={icon} className="oa-eyebrow-icon" /> : null}
            {eyebrow}
          </p>
        ) : null}
        <h3>{title}</h3>
      </div>
      {actions ? <div className="oa-section-actions">{actions}</div> : null}
    </div>
  );
}

function TimelineSvg({
  points,
  mode,
  accent = "primary"
}: {
  points: TimelinePoint[];
  mode: "damage" | "healing";
  accent?: "primary" | "secondary";
}) {
  const source = points.length
    ? points
    : [{ second: 0, damage: 0, healing: 0, hits: 0 }];
  const width = 960;
  const height = 260;
  const maxValue = Math.max(1, ...source.map((point) => (mode === "damage" ? point.damage : point.healing)));
  const linePoints = source
    .map((point, index) => {
      const x = source.length > 1 ? (index / (source.length - 1)) * width : 0;
      const value = mode === "damage" ? point.damage : point.healing;
      const y = height - 18 - (value / maxValue) * (height - 42);
      return `${x},${y}`;
    })
    .join(" ");
  const areaPath = `M0 ${height} L${linePoints.replaceAll(" ", " L")} L${width} ${height} Z`;
  const peak = source.reduce((best, point) => {
    const value = mode === "damage" ? point.damage : point.healing;
    return value > best.value ? { second: point.second, value } : best;
  }, { second: 0, value: 0 });
  const peakIndex = source.findIndex((point) => point.second === peak.second);
  const peakX = source.length > 1 ? (peakIndex / (source.length - 1)) * width : 0;
  const peakY = height - 18 - (peak.value / maxValue) * (height - 42);

  return (
    <div className="oa-timeline-shell">
      <svg className={`oa-timeline-svg accent-${accent}`} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`oa-area-${mode}-${accent}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent === "primary" ? "#cdbdff" : "#bdf4ff"} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent === "primary" ? "#cdbdff" : "#bdf4ff"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }).map((_, index) => (
          <line
            key={index}
            x1="0"
            x2={width}
            y1={18 + index * ((height - 36) / 4)}
            y2={18 + index * ((height - 36) / 4)}
            className="oa-grid-line"
          />
        ))}
        <path d={areaPath} fill={`url(#oa-area-${mode}-${accent})`} />
        <polyline className="oa-line-path" fill="none" points={linePoints} />
        <line className="oa-peak-line" x1={peakX} x2={peakX} y1="12" y2={height - 8} />
        <circle className="oa-peak-dot" cx={peakX} cy={peakY} r="4" />
      </svg>
      <div className="oa-timeline-footer">
        <span>0s</span>
        <span>{Math.round((source.at(-1)?.second ?? 0) / 4)}s</span>
        <span>{Math.round((source.at(-1)?.second ?? 0) / 2)}s</span>
        <span>{source.at(-1)?.second ?? 0}s</span>
      </div>
      <div className="oa-timeline-tooltip">
        <p>T: {peak.second}s</p>
        <strong>{formatShort(peak.value)}</strong>
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  max,
  tone = "secondary"
}: {
  value: number;
  max: number;
  tone?: "secondary" | "primary" | "tertiary" | "error";
}) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 0;

  return (
    <div className="oa-progress">
      <div className={`oa-progress-fill tone-${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function buildDamageTakenRows(player: PlayerRow, encounters: EncounterSnapshot[]) {
  const maxAmount = Math.max(
    1,
    ...encounters.map(
      (encounter) =>
        player.encounters.find((entry) => entry.encounterId === encounter.id)?.damageTaken ?? 0
    )
  );

  return encounters.map((encounter) => {
    const encounterStat =
      player.encounters.find((entry) => entry.encounterId === encounter.id) ?? null;
    const amount = encounterStat?.damageTaken ?? 0;
    return {
      label: encounter.label,
      amount,
      status:
        amount >= maxAmount * 0.66 ? "spike" : amount >= maxAmount * 0.33 ? "stable" : "recover"
    };
  });
}

function buildDamageRows(player: PlayerRow, sortMode: "total" | "dps", durationMs: number) {
  return [...player.topSkills]
    .filter((skill) => skill.kind === "damage")
    .map((skill) => {
      const meta = getPowerMeta(skill.abilityName);
      return {
        abilityName: skill.abilityName,
        hits: skill.hits,
        critRate: skill.hits === 0 ? 0 : skill.critCount / skill.hits,
        flankRate: skill.hits === 0 ? 0 : skill.flankCount / skill.hits,
        total: skill.total,
        dps: durationMs > 0 ? skill.total / (durationMs / 1000) : 0,
        type: meta?.powertype ?? "Combat Power"
      };
    })
    .sort((left, right) => (sortMode === "total" ? right.total - left.total : right.dps - left.dps));
}

function buildHealingRows(player: PlayerRow) {
  return player.topSkills
    .filter((skill) => skill.kind === "heal")
    .sort((left, right) => right.total - left.total)
    .map((skill) => ({
      label: skill.abilityName,
      ticks: skill.hits,
      total: skill.total,
      average: skill.hits === 0 ? 0 : skill.total / skill.hits,
      critRate: skill.hits === 0 ? 0 : skill.critCount / skill.hits
    }));
}

function PowerContributionChart({ skills }: { skills: SkillStat[] }) {
  const rows = skills.slice(0, 8).map((skill) => ({
    name: skill.abilityName,
    total: Math.round(skill.total)
  }));

  if (!rows.length) {
    return <div className="oa-empty-state">No power usage was parsed for this selection.</div>;
  }

  return (
    <div className="oa-chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 18, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(205, 189, 255, 0.08)" horizontal={false} />
          <XAxis type="number" stroke="rgba(229,225,228,0.45)" tickFormatter={(value) => formatShort(value)} />
          <YAxis type="category" width={150} dataKey="name" stroke="rgba(229,225,228,0.45)" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "rgba(19,19,21,0.96)",
              border: "1px solid rgba(205,189,255,0.18)",
              borderRadius: 12
            }}
            formatter={(value: number) => formatShort(value)}
          />
          <Bar dataKey="total" fill="#cdbdff" radius={[6, 6, 6, 6]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CombatTimelineChart({ points }: { points: TimelinePoint[] }) {
  if (!points.length) {
    return <div className="oa-empty-state">No timeline buckets were parsed for this selection.</div>;
  }

  return (
    <div className="oa-chart-box">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="oaDamageGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#cdbdff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#cdbdff" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="oaHealingGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7cf5c5" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#7cf5c5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(205, 189, 255, 0.08)" />
          <XAxis dataKey="second" stroke="rgba(229,225,228,0.45)" tickFormatter={(value) => `${value}s`} />
          <YAxis stroke="rgba(229,225,228,0.45)" tickFormatter={(value) => formatShort(value)} />
          <Tooltip
            contentStyle={{
              background: "rgba(19,19,21,0.96)",
              border: "1px solid rgba(205,189,255,0.18)",
              borderRadius: 12
            }}
            formatter={(value: number) => formatShort(value)}
            labelFormatter={(value) => `${value}s`}
          />
          <Area type="monotone" dataKey="damage" stroke="#cdbdff" fill="url(#oaDamageGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="healing" stroke="#7cf5c5" fill="url(#oaHealingGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function LibraryView() {
  const cards = [
    { label: "Player powers", value: formatNumber(metadata.playerPowers.length), icon: "local_fire_department" },
    { label: "Companions", value: formatNumber(metadata.companions.length), icon: "pets" },
    { label: "Artifacts", value: formatNumber(metadata.artifacts.length), icon: "diamond" },
    { label: "Mount powers", value: formatNumber(metadata.mounts.length), icon: "directions_car" }
  ];

  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Parser Library</p>
        <h1>Neverwinter metadata vault</h1>
        <p>Reusable reference data extracted from local game tooling and used to enrich power, class, mount, and companion labels inside the parser.</p>
      </header>
      <div className="oa-card-grid four">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone="secondary" />
        ))}
      </div>
      <section className="oa-panel">
        <SectionHeading icon="database" eyebrow="Reference Index" title="Metadata categories" />
        <div className="oa-library-grid">
          <div className="oa-mini-panel">
            <strong>Power normalization</strong>
            <p>Maps raw ability names to known class powers, paragons, and power types.</p>
          </div>
          <div className="oa-mini-panel">
            <strong>Companion recognition</strong>
            <p>Identifies summon names so party totals can include or exclude companion output cleanly.</p>
          </div>
          <div className="oa-mini-panel">
            <strong>Mount and artifact labels</strong>
            <p>Allows future parser enhancements to tag activations with cleaner names and categories.</p>
          </div>
          <div className="oa-mini-panel">
            <strong>Build inference</strong>
            <p>Uses known power ownership to infer a likely class and paragon from parsed skill usage.</p>
          </div>
        </div>
      </section>
    </section>
  );
}

function SetupView(props: ShellProps) {
  const { state } = props;
  const isLiveRunning = state.watcherStatus === "watching" && state.analysis.mode === "live";
  const processingRate =
    state.analysis.durationMs > 0
      ? Math.round(state.analysis.totalLines / Math.max(1, state.analysis.durationMs / 1000))
      : 0;

  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Configuration & Setup</p>
        <h1>Initialize the tactical data stream</h1>
        <p>Link your Neverwinter combat log directory, validate parser health, and launch a live session or analyze a recorded combat log.</p>
      </header>

      <div className="oa-setup-grid">
        <section className="oa-panel oa-panel-hero">
          <SectionHeading icon="folder_special" eyebrow="Log Directory Configuration" title="Live watch and recorded log analysis" />
          <div className="oa-field-stack">
            <label className="oa-field">
              <span>Combat log path</span>
              <div className="oa-input-row">
                <div className="oa-input-shell">
                  <Icon name="terminal" className="oa-input-icon" />
                  <input
                    value={props.folderInput}
                    onChange={(event) => props.onFolderInputChange(event.target.value)}
                    placeholder="C:\\Games\\Neverwinter\\Live\\logs\\GameClient"
                  />
                </div>
                <button className="oa-button secondary" onClick={props.onChooseFolder}>
                  Browse
                </button>
                <button className="oa-button secondary" onClick={props.onChooseImportFile}>
                  Choose Log File
                </button>
              </div>
            </label>

            <div className="oa-action-row">
              <button
                className="oa-button primary wide"
                onClick={props.onStartMonitoring}
                disabled={props.starting || isLiveRunning || !props.folderInput.trim() || !props.isDesktopRuntime}
              >
                <Icon
                  name={isLiveRunning || props.starting ? "autorenew" : "play_arrow"}
                  filled={!isLiveRunning && !props.starting}
                  className={isLiveRunning || props.starting ? "oa-spin" : undefined}
                />
                {isLiveRunning ? "Running" : props.starting ? "Starting..." : "Start Monitoring"}
              </button>
              <button
                className="oa-button secondary"
                onClick={props.onStopMonitoring}
                disabled={!isLiveRunning || props.starting}
              >
                <Icon name="stop" />
                Stop
              </button>
            </div>

            <div className="oa-mini-panel">
              <strong>Latest tracked combat log</strong>
              <p>{state.activeLogFile ?? "No live log selected yet"}</p>
              <p className="oa-muted-copy">Timestamp: {getCombatLogTimestampLabel(state.activeLogFile)}</p>
            </div>

            <label className="oa-field">
              <span>Archived combat log</span>
              <div className="oa-input-row">
                <div className="oa-input-shell">
                  <Icon name="history_edu" className="oa-input-icon" />
                  <input
                    value={props.importFilePath}
                    onChange={(event) => props.onImportFileChange(event.target.value)}
                    placeholder="C:\\Logs\\combatlog_2026-03-23.log"
                  />
                </div>
                <button className="oa-button secondary" onClick={props.onChooseImportFile}>
                  Choose File
                </button>
              </div>
            </label>
            <button
              className="oa-button tertiary"
              onClick={props.onStartMonitoringFromFile}
              disabled={props.starting || !props.importFilePath.trim() || !props.isDesktopRuntime}
            >
              <Icon name="play_circle" />
              Track Selected File Live
            </button>
            <button
              className="oa-button tertiary"
              onClick={props.onImportLogFile}
              disabled={props.starting || !props.importFilePath.trim() || !props.isDesktopRuntime}
            >
              <Icon name="upload_file" />
              Analyze Recorded Log
            </button>
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="monitor_heart" eyebrow="Parse Health Dashboard" title="Signal integrity" />
          <div className="oa-card-grid three">
            <StatCard
              label="Lines Processed"
              value={formatNumber(state.analysis.totalLines)}
              tone="secondary"
              hint={`+${formatNumber(processingRate)} lps`}
            >
              <ProgressBar value={processingRate} max={Math.max(processingRate, 300)} />
            </StatCard>
            <StatCard
              label="Unknown Lines"
              value={formatNumber(state.debug.unknownEvents.length)}
              hint={`${state.analysis.totalLines > 0 ? formatPercent(state.debug.unknownEvents.length / state.analysis.totalLines, 2) : "0.00%"} total`}
            />
            <StatCard
              label="Parse Errors"
              value={formatNumber(state.debug.parseIssues.length)}
              tone="error"
              hint={state.debug.parseIssues.at(-1)?.reason ?? "No active parser faults"}
            />
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="memory" eyebrow="Telemetry Environment" title="Runtime profile" />
          <div className="oa-kv-list">
            <div><span>Runtime</span><strong>{getRuntimeLabel(state)}</strong></div>
            <div><span>Analysis Mode</span><strong>{state.analysis.mode}</strong></div>
            <div><span>Watcher</span><strong>{state.watcherStatus}</strong></div>
            <div><span>Source</span><strong>{getSourceLabel(state)}</strong></div>
            <div><span>Duration</span><strong>{formatDuration(state.analysis.durationMs)}</strong></div>
            <div><span>Process CPU</span><strong>{state.system.processCpuPercent.toFixed(1)}%</strong></div>
            <div><span>Process Memory</span><strong>{state.system.processMemoryMb.toFixed(1)} MB</strong></div>
            <div><span>System Memory</span><strong>{state.system.systemMemoryUsedMb.toFixed(0)} / {state.system.systemMemoryTotalMb.toFixed(0)} MB</strong></div>
          </div>
          <div className="oa-tip">
            Source path, parser state, and system usage are sampled live from the running app.
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="terminal" eyebrow="System Stream" title="Recent engine output" />
          <div className="oa-terminal">
            {state.debug.latestRawLines.slice(-8).map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
            {!state.debug.latestRawLines.length ? <div>[idle] Waiting for stream...</div> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function LiveOverviewView({
  props,
  filteredPlayers,
  searchQuery,
  onSearchChange,
  compareMode,
  onToggleCompare
}: {
  props: ShellProps;
  filteredPlayers: PlayerRow[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  compareMode: boolean;
  onToggleCompare: () => void;
}) {
  const { state } = props;
  const current = state.currentEncounter;
  const totalDamage = filteredPlayers.reduce((sum, player) => sum + player.totalDamage, 0);
  const totalDeaths = filteredPlayers.reduce((sum, player) => sum + player.deaths, 0);
  const selectedForCompare = compareMode ? filteredPlayers.slice(0, 3) : [];
  const peakDps = Math.max(0, ...filteredPlayers.map((player) => player.dps));
  const liveDurationMs = current?.durationMs ?? 0;

  return (
    <section className="oa-screen">
      <header className="oa-screen-topline">
        <div>
          <h1>Party Overview</h1>
          <p>
            <Icon name="location_on" className="oa-inline-icon" />{" "}
            {current?.label ?? (state.analysis.mode === "imported" ? "Recorded log analysis" : "Waiting for combat events")}
          </p>
        </div>
        <div className="oa-toolbar">
          <button className="oa-switch-card" onClick={props.onToggleCompanions}>
            <span>Split Pets</span>
            <div className={`oa-switch ${props.includeCompanions ? "is-on" : ""}`}>
              <div />
            </div>
          </button>
          <button className="oa-button primary" onClick={onToggleCompare}>
            <Icon name="compare_arrows" />
            {compareMode ? "Hide Compare" : "Compare Players"}
          </button>
        </div>
      </header>

      <div className="oa-card-grid four">
        <StatCard label="Total Encounter DPS" value={formatShort(current?.dps ?? peakDps)} tone="secondary" icon="bolt" hint={current ? "current encounter" : "waiting for live combat"} />
        <StatCard label="Total Damage" value={formatShort(totalDamage)} tone="primary" icon="query_stats" hint={`${formatNumber(filteredPlayers.length)} live players tracked`} />
        <StatCard label="Party Synergy" value={`${Math.round(filteredPlayers.reduce((sum, row) => sum + row.buildConfidence, 0) / Math.max(1, filteredPlayers.length) * 100)}%`} icon="group" hint="Live class inference confidence" />
        <StatCard label="Total Time" value={formatDuration(liveDurationMs)} tone="tertiary" icon="timer" hint={`${formatNumber(totalDeaths)} live deaths detected`} />
      </div>

      {compareMode && selectedForCompare.length ? (
        <section className="oa-panel">
          <SectionHeading icon="compare" eyebrow="Compare Overlay" title="Top player snapshot" />
          <div className="oa-compare-grid">
            {selectedForCompare.map((player) => (
              <article className="oa-mini-panel" key={player.id}>
                <strong>{player.displayName}</strong>
                <p>{player.className ?? "Unknown"}{player.paragon ? ` / ${player.paragon}` : ""}</p>
                <div className="oa-mini-metrics">
                  <span>{formatShort(player.totalDamage)} damage</span>
                  <span>{formatShort(player.dps)} DPS</span>
                  <span>{formatPercent(player.critRate)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="oa-panel">
        <SectionHeading
          icon="groups"
          eyebrow="Party Contribution"
          title="Live combat table"
          actions={
            <div className="oa-search">
              <Icon name="search" className="oa-inline-icon" />
              <input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search players, powers, targets, logs..." />
            </div>
          }
        />
        <div className="oa-table-shell">
          <div className="oa-table-head party">
            <span>#</span>
            <span>Player</span>
            <span>Class</span>
            <span>Damage</span>
            <span>DPS</span>
            <span>Hits</span>
            <span>Duration</span>
          </div>
          {filteredPlayers.map((player, index) => (
            <button className="oa-table-row party" key={player.id} onClick={() => props.onSelectPlayer(player.id)}>
              <span className="oa-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="oa-player-cell">
                <span className="oa-avatar-frame">{initialsFromName(player.displayName)}</span>
                <span>
                  <strong>{player.displayName}</strong>
                  <small>{player.paragon ? `@${player.paragon.toLowerCase().replace(/\s+/g, "_")}` : "@unknown_build"}</small>
                </span>
              </span>
              <span><em className="oa-class-pill">{player.className ?? "Unknown"}</em></span>
              <span>
                <strong>{formatShort(player.totalDamage)}</strong>
                <ProgressBar value={player.totalDamage} max={Math.max(...filteredPlayers.map((entry) => entry.totalDamage), 1)} />
              </span>
              <span className="tone-secondary-text">{formatShort(player.dps)}</span>
              <span>{formatNumber(player.hits)}</span>
              <span>{formatDuration(liveDurationMs)}</span>
            </button>
          ))}
          {!filteredPlayers.length ? <div className="oa-empty-state">{current ? "No current-encounter players match the current search." : "Waiting for current live combat events."}</div> : null}
        </div>
      </section>
    </section>
  );
}

function PlayerOverviewTab({
  player,
  encounter,
  allEncounters
}: {
  player: PlayerRow;
  encounter: EncounterSnapshot | null;
  allEncounters: EncounterSnapshot[];
}) {
  const encounterStat =
    encounter ? player.encounters.find((entry) => entry.encounterId === encounter.id) ?? null : null;
  const durationMs = encounter?.durationMs ?? allEncounters.at(-1)?.durationMs ?? 0;
  const totalDamage = encounterStat?.totalDamage ?? player.totalDamage;
  const totalHealing = encounterStat?.totalHealing ?? player.totalHealing;
  const totalTaken = encounterStat?.damageTaken ?? player.damageTaken;

  return (
    <>
      <div className="oa-card-grid eight">
        <StatCard label="Total Damage" value={formatShort(totalDamage)} tone="primary" icon="local_fire_department" />
        <StatCard label="DPS" value={formatShort(durationMs > 0 ? totalDamage / (durationMs / 1000) : player.dps)} tone="secondary" icon="show_chart" />
        <StatCard label="Combat Duration" value={formatDuration(durationMs)} icon="timer" />
        <StatCard label="Total Hits" value={formatNumber(encounterStat?.hits ?? player.hits)} icon="ads_click" />
        <StatCard label="Crit Rate" value={formatPercent(player.critRate)} tone="secondary" icon="flare" />
        <StatCard label="Flank Rate" value={formatPercent(player.flankRate)} icon="near_me" />
        <StatCard label="Damage Taken" value={formatShort(totalTaken)} tone="error" icon="shield" />
        <StatCard label="Healing Done" value={formatShort(totalHealing)} tone="tertiary" icon="volunteer_activism" />
      </div>

      <div className="oa-split-grid">
        <section className="oa-panel">
          <SectionHeading icon="swords" eyebrow="Top Damage Powers" title="Contribution profile" />
          <div className="oa-list-panel">
            {player.topSkills.filter((skill) => skill.kind === "damage").slice(0, 8).map((skill) => {
              const max = player.topSkills.filter((entry) => entry.kind === "damage")[0]?.total ?? 1;
              const share = skill.total / Math.max(1, totalDamage);
              const meta = getPowerMeta(skill.abilityName);
              return (
                <div className="oa-list-row" key={`${skill.kind}-${skill.abilityName}`}>
                  <div>
                    <strong>{skill.abilityName}</strong>
                    <small>{meta?.powertype ?? "Combat Power"}</small>
                  </div>
                  <div className="oa-list-bar">
                    <ProgressBar value={skill.total} max={max} />
                  </div>
                  <div className="oa-list-metric">
                    <span>{formatPercent(share)}</span>
                    <strong>{formatShort(skill.total)}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="outbound" eyebrow="Damage by target" title="Mob, boss, and phase split" />
          <div className="oa-list-panel">
            {player.targets.slice(0, 8).map((target) => (
              <div className="oa-list-row compact" key={target.targetName}>
                <div>
                  <strong>{target.targetName}</strong>
                  <small>{isKnownCompanion(target.targetName) ? "Companion entity" : "Encounter target"}</small>
                </div>
                <div className="oa-list-metric">
                  <span>{formatNumber(target.hits)} hits</span>
                  <strong>{formatShort(target.totalDamage)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function PlayerTimelineTab({ player, encounter }: { player: PlayerRow; encounter: EncounterSnapshot | null }) {
  const points =
    encounter === null
      ? player.timeline
      : player.timeline.filter((point) => point.second <= Math.ceil(encounter.durationMs / 1000));
  const powerRows = player.topSkills.filter((skill) => skill.kind === "damage");

  return (
    <div className="oa-tab-layout">
      <section className="oa-panel">
        <SectionHeading icon="insights" eyebrow="Telemetry" title="DPS flow over time" actions={<span className="oa-pill">Peak: {formatShort(Math.max(0, ...points.map((point) => point.damage)))}</span>} />
        <CombatTimelineChart points={points} />
      </section>

      <section className="oa-panel">
        <SectionHeading icon="bar_chart" eyebrow="Power Contribution" title="Top parsed powers" />
        <PowerContributionChart skills={powerRows} />
      </section>
    </div>
  );
}

function PlayerDamageTab({
  player,
  encounter,
  allEncounters,
  searchQuery
}: {
  player: PlayerRow;
  encounter: EncounterSnapshot | null;
  allEncounters: EncounterSnapshot[];
  searchQuery: string;
}) {
  const [sortMode, setSortMode] = useState<"total" | "dps">("total");
  const durationMs = encounter?.durationMs ?? allEncounters.at(-1)?.durationMs ?? 0;
  const rows = buildDamageRows(player, sortMode, durationMs).filter((row) =>
    row.abilityName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const maxTotal = Math.max(...rows.map((row) => row.total), 1);

  return (
    <div className="oa-tab-layout">
      <section className="oa-panel">
        <SectionHeading
          icon="local_fire_department"
          eyebrow="Top Damage Powers"
          title="Detailed outgoing damage"
          actions={
            <div className="oa-button-pair">
              <button className={`oa-pill-button ${sortMode === "total" ? "active" : ""}`} onClick={() => setSortMode("total")}>By Total</button>
              <button className={`oa-pill-button ${sortMode === "dps" ? "active" : ""}`} onClick={() => setSortMode("dps")}>By DPS</button>
            </div>
          }
        />
        <div className="oa-data-table">
          <div className="oa-data-head damage">
            <span>Power Name</span>
            <span>Hits</span>
            <span>Crit %</span>
            <span>Total Damage</span>
          </div>
          {rows.map((row) => (
            <div className="oa-data-row damage" key={row.abilityName}>
              <div className="oa-power-cell">
                <div className="oa-power-icon">{row.abilityName.slice(0, 2).toUpperCase()}</div>
                <div>
                  <strong>{row.abilityName}</strong>
                  <small>{row.type} • Crit {formatPercent(row.critRate)} • CA {formatPercent(row.flankRate)}</small>
                  <ProgressBar value={row.total} max={maxTotal} />
                </div>
              </div>
              <span>{formatNumber(row.hits)}</span>
              <span className="tone-secondary-text">{formatPercent(row.critRate)}</span>
              <span className="oa-right-stat">
                <strong>{formatShort(row.total)}</strong>
                <small>{formatPercent(row.total / Math.max(1, player.totalDamage))} of total</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="oa-panel">
        <SectionHeading icon="target" eyebrow="Target Breakdown" title="Damage done on each mob, boss, or phase" />
        <div className="oa-data-table">
          <div className="oa-data-head target">
            <span>Target</span>
            <span>Hits</span>
            <span>Crits</span>
            <span>Total Damage</span>
          </div>
          {player.targets
            .filter((target) => target.targetName.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(0, 10)
            .map((target) => (
              <div className="oa-data-row target" key={target.targetName}>
                <div>
                  <strong>{target.targetName}</strong>
                  <small>{isKnownCompanion(target.targetName) ? "Companion entity" : "Encounter target"}</small>
                </div>
                <span>{formatNumber(target.hits)}</span>
                <span>{formatNumber(target.critCount)}</span>
                <span className="oa-right-stat"><strong>{formatShort(target.totalDamage)}</strong></span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function PlayerHealingTab({ player }: { player: PlayerRow }) {
  const rows = buildHealingRows(player);
  const max = Math.max(...rows.map((row) => row.total), 1);

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid three">
        <StatCard label="Total Healing Done" value={formatShort(player.totalHealing)} tone="primary" icon="ecg" hint="Outgoing support total" />
        <StatCard label="HPS" value={formatShort(player.hps)} icon="bolt" hint={`Peak: ${formatShort(player.timeline.reduce((best, point) => Math.max(best, point.healing), 0))}`} />
        <StatCard label="Critical Frequency" value={formatPercent(player.critRate)} tone="secondary" icon="target" />
      </div>
      <section className="oa-panel">
          <SectionHeading icon="volunteer_activism" eyebrow="Healing Done" title="Outgoing healing breakdown" actions={<span className="oa-pill">Total Events: {formatNumber(rows.reduce((sum, row) => sum + row.ticks, 0))}</span>} />
          {rows.length ? (
            <div className="oa-data-table">
              <div className="oa-data-head healing">
                <span>Power</span>
                <span>Ticks</span>
                <span>Total</span>
                <span>% Breakdown</span>
                <span>Avg</span>
                <span>Crit%</span>
              </div>
              {rows.map((row) => (
                <div className="oa-data-row healing" key={row.label}>
                  <div>
                    <strong>{row.label}</strong>
                    <small>Parsed healing events</small>
                  </div>
                  <span>{formatNumber(row.ticks)}</span>
                  <span>{formatShort(row.total)}</span>
                  <span><ProgressBar value={row.total} max={max} tone="primary" /></span>
                  <span>{formatNumber(row.average)}</span>
                  <span className="tone-secondary-text">{formatPercent(row.critRate)}</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="oa-empty-state">No outgoing healing was parsed for this player.</div>
        )}
      </section>
    </div>
  );
}

function PlayerDamageTakenTab({
  player,
  encounters
}: {
  player: PlayerRow;
  encounters: EncounterSnapshot[];
}) {
  const rows = buildDamageTakenRows(player, encounters);

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid four">
        <StatCard label="Damage Taken" value={formatShort(player.damageTaken)} tone="error" icon="shield" />
        <StatCard label="Deaths" value={formatNumber(player.deaths)} tone="error" icon="skull" />
        <StatCard label="Flank Exposure" value={formatPercent(1 - player.flankRate)} icon="warning" />
        <StatCard label="Companions Tracked" value={formatNumber(player.companionCount)} icon="pets" />
      </div>
      <section className="oa-panel">
        <SectionHeading icon="security" eyebrow="Incoming profile" title="Encounter-by-encounter intake" />
        <div className="oa-data-table">
          <div className="oa-data-head damage-taken">
            <span>Encounter</span>
            <span>Status</span>
            <span>Pressure</span>
            <span>Damage Taken</span>
          </div>
          {rows.map((row) => (
            <div className="oa-data-row damage-taken" key={row.label}>
              <div>
                <strong>{row.label}</strong>
                <small>Incoming pressure timeline</small>
              </div>
              <span className={`oa-status-chip ${row.status}`}>{row.status}</span>
              <span><ProgressBar value={row.amount} max={Math.max(...rows.map((entry) => entry.amount), 1)} tone="error" /></span>
              <span className="oa-right-stat"><strong>{formatShort(row.amount)}</strong></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlayerTimingTab({ player, encounter }: { player: PlayerRow; encounter: EncounterSnapshot | null }) {
  const points = encounter ? player.timeline.filter((point) => point.second <= Math.ceil(encounter.durationMs / 1000)) : player.timeline;
  const totalBuckets = Math.max(1, points.length);
  const activeBuckets = points.filter((point) => point.damage > 0 || point.healing > 0).length;
  const averageCadence = totalBuckets > 0 ? player.hits / totalBuckets : 0;

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid four">
        <StatCard label="Activity Uptime" value={formatPercent(activeBuckets / totalBuckets)} icon="schedule" />
        <StatCard label="Hit Cadence" value={`${averageCadence.toFixed(1)}/s`} tone="secondary" icon="speed" />
        <StatCard label="Burst Windows" value={formatNumber(points.filter((point) => point.damage > player.dps).length)} icon="flash_on" />
        <StatCard label="Timeline Buckets" value={formatNumber(totalBuckets)} icon="grid_view" />
      </div>
      <section className="oa-panel">
        <SectionHeading icon="schedule" eyebrow="Cadence" title="Timeline pacing" />
        <TimelineSvg points={points} mode="damage" accent="secondary" />
      </section>
    </div>
  );
}

function PlayerPositioningTab({ player }: { player: PlayerRow }) {
  const max = Math.max(1, ...player.targets.map((target) => target.totalDamage));

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid three">
        <StatCard label="Flank Rate" value={formatPercent(player.flankRate)} tone="secondary" icon="near_me" hint="Heuristic from parser flags" />
        <StatCard label="Target Spread" value={formatNumber(player.targets.length)} icon="my_location" hint="Distinct hostile targets hit" />
        <StatCard label="Companion Presence" value={formatNumber(player.companionCount)} icon="pets" />
      </div>
      <section className="oa-panel">
        <SectionHeading icon="explore" eyebrow="Target footprint" title="Pressure spread by target" />
        <div className="oa-list-panel">
          {player.targets.slice(0, 10).map((target) => (
            <div className="oa-list-row" key={target.targetName}>
              <div>
                <strong>{target.targetName}</strong>
                <small>{target.hits} impacts registered</small>
              </div>
              <div className="oa-list-bar">
                <ProgressBar value={target.totalDamage} max={max} tone="secondary" />
              </div>
              <div className="oa-list-metric">
                <span>{formatPercent(target.totalDamage / Math.max(1, player.totalDamage))}</span>
                <strong>{formatShort(target.totalDamage)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlayerOtherTab({ player }: { player: PlayerRow }) {
  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid four">
        <StatCard label="Class Inference" value={player.className ?? "Unknown"} icon="badge" />
        <StatCard label="Paragon" value={player.paragon ?? "Unknown"} icon="star" />
        <StatCard label="Build Confidence" value={formatPercent(player.buildConfidence)} tone="primary" icon="psychology" />
        <StatCard label="Tracked Powers" value={formatNumber(player.topSkills.length)} icon="deployed_code" />
      </div>
      <section className="oa-panel">
        <SectionHeading icon="deployed_code" eyebrow="Support data" title="Parser-supported player metadata" />
        <div className="oa-kv-list">
          <div><span>Display Name</span><strong>{player.displayName}</strong></div>
          <div><span>Total Damage</span><strong>{formatShort(player.totalDamage)}</strong></div>
          <div><span>Total Healing</span><strong>{formatShort(player.totalHealing)}</strong></div>
          <div><span>Damage Taken</span><strong>{formatShort(player.damageTaken)}</strong></div>
          <div><span>Targets Tracked</span><strong>{formatNumber(player.targets.length)}</strong></div>
          <div><span>Encounter Entries</span><strong>{formatNumber(player.encounters.length)}</strong></div>
        </div>
      </section>
    </div>
  );
}

function PlayerDeathsTab({ player, state }: { player: PlayerRow; state: AppState }) {
  const deathRelatedIssues = state.debug.parseIssues
    .filter((issue) => issue.line.toLowerCase().includes(player.displayName.toLowerCase()))
    .slice(-10)
    .reverse();

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid three">
        <StatCard label="Death Count" value={formatNumber(player.deaths)} tone="error" icon="dangerous" />
        <StatCard label="Player-Matched Issues" value={formatNumber(deathRelatedIssues.length)} icon="bug_report" />
        <StatCard label="Unknown Events" value={formatNumber(state.debug.unknownEvents.length)} icon="help" />
      </div>
      <section className="oa-panel">
        <SectionHeading icon="dangerous" eyebrow="Fatal events" title="Death and log issue feed" />
        <div className="oa-event-list">
          {player.deaths > 0 || deathRelatedIssues.length ? (
            deathRelatedIssues.map((issue, index) => (
              <article className="oa-event-card" key={`${issue.seenAt}-${index}`}>
                <div className="oa-event-accent tone-error" />
                <div>
                  <strong>{issue.reason}</strong>
                  <small>{new Date(issue.seenAt).toLocaleTimeString()}</small>
                  <p>{issue.line || "No raw line available."}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="oa-empty-state">No death lines have been parsed for this player in the current log data.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function PlayerView({
  props,
  searchQuery
}: {
  props: ShellProps;
  searchQuery: string;
}) {
  const player = props.selectedPlayer;
  if (!player) {
    return <section className="oa-screen"><div className="oa-empty-state">Select a player from the party overview to inspect the detailed breakdown.</div></section>;
  }

  const encounter = props.selectedEncounter;
  const heroMetricDamage =
    encounter === null
      ? player.totalDamage
      : player.encounters.find((entry) => entry.encounterId === encounter.id)?.totalDamage ?? 0;

  return (
    <section className="oa-screen">
      <header className="oa-player-hero">
        <div className="oa-player-identity">
          <button className="oa-back-link" onClick={props.onBackToPlayers}>
            <Icon name="arrow_back" />
            Back to Party
          </button>
          <div className="oa-portrait">{initialsFromName(player.displayName)}</div>
          <div>
            <div className="oa-player-title-row">
              <h1>{player.displayName}</h1>
              <span className="oa-badge">{player.className ?? "Unknown"}{player.paragon ? ` / ${player.paragon}` : ""}</span>
            </div>
            <p>Focus: {player.topSkills[0]?.abilityName ?? "No parsed power events"}</p>
          </div>
        </div>
        <div className="oa-hero-metrics">
          <div>
            <span>Total Damage</span>
            <strong>{formatShort(heroMetricDamage)}</strong>
          </div>
          <div>
            <span>Avg DPS</span>
            <strong>{formatShort(player.dps)}</strong>
          </div>
        </div>
      </header>

      <div className="oa-focus-bar">
        <span className="oa-focus-label"><Icon name="filter_alt" className="oa-inline-icon" /> Focus:</span>
        <button
          className={`oa-encounter-chip ${encounter === null ? "active" : ""}`}
          onClick={() => props.onSelectEncounter("all")}
        >
          All Encounters
        </button>
        {props.availableEncounters.map((entry, index) => (
          <button
            className={`oa-encounter-chip ${encounter?.id === entry.id ? "active" : ""}`}
            key={entry.id}
            onClick={() => props.onSelectEncounter(entry.id)}
          >
            <Icon name="whatshot" className="oa-chip-icon" />
            #{index + 1} {entry.label} ({formatDuration(entry.durationMs)})
          </button>
        ))}
      </div>

      <div className="oa-subtab-shell">
        {DETAIL_TABS.map((tab) => (
          <button
            className={`oa-subtab ${props.detailTab === tab.id ? "active" : ""}`}
            key={tab.id}
            onClick={() => props.onDetailTabChange(tab.id)}
          >
            {tab.label}
            {tab.id === "deaths" && player.deaths > 0 ? <span className="oa-subtab-badge">{player.deaths}</span> : null}
          </button>
        ))}
        <button className="oa-pill-button companion" onClick={props.onToggleCompanions}>
          <Icon name="pets" />
          {props.includeCompanions ? "Pets Included" : "Pets Excluded"}
        </button>
      </div>

      {props.detailTab === "overview" ? (
        <PlayerOverviewTab player={player} encounter={encounter} allEncounters={props.availableEncounters} />
      ) : null}
      {props.detailTab === "timeline" ? <PlayerTimelineTab player={player} encounter={encounter} /> : null}
      {props.detailTab === "damageOut" ? (
        <PlayerDamageTab player={player} encounter={encounter} allEncounters={props.availableEncounters} searchQuery={searchQuery} />
      ) : null}
      {props.detailTab === "healing" ? <PlayerHealingTab player={player} /> : null}
      {props.detailTab === "damageTaken" ? <PlayerDamageTakenTab player={player} encounters={props.availableEncounters} /> : null}
      {props.detailTab === "timing" ? <PlayerTimingTab player={player} encounter={encounter} /> : null}
      {props.detailTab === "positioning" ? <PlayerPositioningTab player={player} /> : null}
      {props.detailTab === "other" ? <PlayerOtherTab player={player} /> : null}
      {props.detailTab === "deaths" ? <PlayerDeathsTab player={player} state={props.state} /> : null}
    </section>
  );
}

function RecentView({ state }: { state: AppState }) {
  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Encounter Archive</p>
        <h1>Completed engagements</h1>
        <p>Stored encounters from the current session. Use these for focused post-run review.</p>
      </header>
      <section className="oa-panel">
        <SectionHeading icon="history_edu" eyebrow="Archive" title="Recent encounters" />
        <div className="oa-table-shell">
          <div className="oa-table-head archive">
            <span>Encounter</span>
            <span>Duration</span>
            <span>DPS</span>
            <span>Damage</span>
          </div>
          {state.recentEncounters.map((encounter) => (
            <div className="oa-table-row archive static" key={encounter.id}>
              <span>{encounter.label}</span>
              <span>{formatDuration(encounter.durationMs)}</span>
              <span>{formatShort(encounter.dps)}</span>
              <span>{formatShort(encounter.totalDamage)}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function DebugView({ state }: { state: AppState }) {
  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Debug</p>
        <h1>Engine visibility</h1>
        <p>Raw line stream and parser issues stay accessible while parser rules evolve.</p>
      </header>
      <div className="oa-split-grid">
        <section className="oa-panel">
          <SectionHeading icon="terminal" eyebrow="Latest Raw Lines" title={`${state.debug.latestRawLines.length} buffered`} />
          <pre className="oa-terminal">{state.debug.latestRawLines.join("\n")}</pre>
        </section>
        <section className="oa-panel">
          <SectionHeading icon="bug_report" eyebrow="Parse Issues" title={`${state.debug.parseIssues.length} tracked`} />
          <div className="oa-event-list">
            {state.debug.parseIssues.slice(-12).reverse().map((issue, index) => (
              <article className="oa-event-card" key={`${issue.seenAt}-${index}`}>
                <div className="oa-event-accent tone-error" />
                <div>
                  <strong>{issue.reason}</strong>
                  <small>{new Date(issue.seenAt).toLocaleTimeString()}</small>
                  <p>{issue.line}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function SettingsView({
  props,
  settings,
  onSettingsChange
}: {
  props: ShellProps;
  settings: ProfileSettings;
  onSettingsChange: (next: ProfileSettings) => void;
}) {
  const selectedPlayer = props.selectedPlayer;

  return (
    <section className="oa-screen">
      <div className="oa-settings-grid">
        <section className="oa-panel">
          <div className="oa-profile-hero">
            <div className="oa-settings-avatar">{initialsFromName(selectedPlayer?.displayName ?? "No player")}</div>
            <div>
              <div className="oa-player-title-row">
                <h1>{selectedPlayer?.displayName ?? "No player selected"}</h1>
                <span className="oa-badge">{getRuntimeLabel(props.state)}</span>
              </div>
              <p>{getSourceLabel(props.state)}</p>
            </div>
          </div>
          <div className="oa-card-grid three">
            <StatCard label="Session Time" value={formatDuration(props.state.analysis.durationMs)} tone="secondary" icon="schedule" />
            <StatCard label="Peak DPS" value={formatShort(Math.max(0, ...props.playerRows.map((row) => row.dps)))} tone="primary" icon="trending_up" />
            <StatCard label="Primary Class" value={selectedPlayer?.className ?? "Unavailable"} tone="tertiary" icon="swords" />
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="settings" eyebrow="App Configuration" title="Runtime configuration" />
          <div className="oa-field-stack">
            <label className="oa-field">
              <span>Log file directory</span>
              <div className="oa-input-row">
                <div className="oa-input-shell">
                  <input readOnly value={props.folderInput || getSourceLabel(props.state)} />
                </div>
                <button className="oa-button secondary" onClick={props.onChooseFolder}>
                  <Icon name="folder_open" />
                </button>
              </div>
            </label>

            <div className="oa-setting-row">
              <div>
                <strong>Auto-start with Windows</strong>
                <small>Initialize protocol at login</small>
              </div>
              <button
                className={`oa-switch ${settings.autoStart ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ ...settings, autoStart: !settings.autoStart })}
              >
                <div />
              </button>
            </div>

            <div className="oa-setting-row">
              <div>
                <strong>Sound Alerts</strong>
                <small>Combat start notification chime</small>
              </div>
              <button
                className={`oa-switch ${settings.soundAlerts ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ ...settings, soundAlerts: !settings.soundAlerts })}
              >
                <div />
              </button>
            </div>

            <label className="oa-slider-field">
              <div>
                <strong>Overlay Opacity</strong>
                <small>{settings.overlayOpacity}%</small>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                value={settings.overlayOpacity}
                onChange={(event) =>
                  onSettingsChange({ ...settings, overlayOpacity: Number(event.target.value) })
                }
              />
            </label>
            <div className="oa-kv-list">
              <div><span>Process CPU</span><strong>{props.state.system.processCpuPercent.toFixed(1)}%</strong></div>
              <div><span>Process Memory</span><strong>{props.state.system.processMemoryMb.toFixed(1)} MB</strong></div>
              <div><span>System RAM</span><strong>{props.state.system.systemMemoryPercent.toFixed(1)}%</strong></div>
              <div><span>App Uptime</span><strong>{formatUptime(props.state.system.uptimeSec)}</strong></div>
            </div>
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="palette" eyebrow="Appearance" title="Visual core" />
          <div className="oa-theme-grid">
            <button
              className={`oa-theme-card ${settings.visualCore === "obsidian-dark" ? "active" : ""}`}
              onClick={() => onSettingsChange({ ...settings, visualCore: "obsidian-dark" })}
            >
              <div className="oa-theme-preview dark">
                <div />
              </div>
              <span>Obsidian Dark</span>
            </button>
            <button
              className={`oa-theme-card ${settings.visualCore === "obsidian-flux" ? "active" : ""}`}
              onClick={() => onSettingsChange({ ...settings, visualCore: "obsidian-flux" })}
            >
              <div className="oa-theme-preview flux">
                <div />
              </div>
              <span>Obsidian Flux</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function NotificationsPanel({ state }: { state: AppState }) {
  const items = [
    ...state.debug.latestRawLines.slice(-2).reverse().map((line) => ({
      title: "Log stream active",
      detail: line,
      time: new Date(state.system.sampledAt).toLocaleTimeString(),
      tone: "secondary" as const
    })),
    ...state.debug.parseIssues.slice(-4).reverse().map((issue) => ({
      title: issue.reason,
      detail: issue.line || "No raw line attached.",
      time: new Date(issue.seenAt).toLocaleTimeString(),
      tone: "error" as const
    }))
  ];

  return (
    <aside className="oa-overlay">
      <SectionHeading icon="notifications" eyebrow="Tactical Notifications" title="Live event feed" actions={<span className="oa-pill">{items.length} items</span>} />
      <div className="oa-event-list">
        {items.length ? items.map((item, index) => (
          <article className="oa-event-card" key={`${item.title}-${index}`}>
            <div className={`oa-event-accent tone-${item.tone}`} />
            <div>
              <strong>{item.title}</strong>
              <small>{item.time}</small>
              <p>{item.detail}</p>
            </div>
          </article>
        )) : <div className="oa-empty-state">No live notifications yet.</div>}
      </div>
    </aside>
  );
}

function DiagnosticsPanel({ state }: { state: AppState }) {
  const unknownRate =
    state.analysis.totalLines > 0
      ? state.debug.unknownEvents.length / state.analysis.totalLines
      : 0;
  const systemHealth =
    state.watcherStatus === "error"
      ? "faulted"
      : state.system.processCpuPercent > 85
        ? "high load"
        : "stable";

  return (
    <aside className="oa-overlay diagnostics">
      <SectionHeading icon="memory" eyebrow="System Diagnostics" title="Parser health" actions={<span className="oa-pill">{systemHealth}</span>} />
      <div className="oa-kv-list">
        <div><span>Core Engine</span><strong>{state.watcherStatus === "error" ? "Faulted" : "Operational"}</strong></div>
        <div><span>Analysis Source</span><strong>{getSourceLabel(state)}</strong></div>
        <div><span>Read Offset</span><strong>{formatNumber(state.debug.currentOffset)}</strong></div>
        <div><span>Unknown Rate</span><strong>{formatPercent(unknownRate, 2)}</strong></div>
        <div><span>Process CPU</span><strong>{state.system.processCpuPercent.toFixed(1)}%</strong></div>
        <div><span>Process Memory</span><strong>{state.system.processMemoryMb.toFixed(1)} MB</strong></div>
        <div><span>System RAM</span><strong>{state.system.systemMemoryPercent.toFixed(1)}%</strong></div>
        <div><span>App Uptime</span><strong>{formatUptime(state.system.uptimeSec)}</strong></div>
      </div>
    </aside>
  );
}

function GlobalSearchPanel({
  query,
  players,
  encounters,
  state,
  onSelectPlayer,
  onSelectEncounter
}: {
  query: string;
  players: PlayerRow[];
  encounters: EncounterSnapshot[];
  state: AppState;
  onSelectPlayer: (playerId: string) => void;
  onSelectEncounter: (encounterId: string) => void;
}) {
  const lowered = query.trim().toLowerCase();
  if (!lowered) {
    return null;
  }

  const matchedPlayers = players
    .filter((player) => {
      const paragon = player.paragon?.toLowerCase() ?? "";
      const className = player.className?.toLowerCase() ?? "";
      return (
        player.displayName.toLowerCase().includes(lowered) ||
        paragon.includes(lowered) ||
        className.includes(lowered) ||
        player.topSkills.some((skill) => skill.abilityName.toLowerCase().includes(lowered)) ||
        player.targets.some((target) => target.targetName.toLowerCase().includes(lowered))
      );
    })
    .slice(0, 6);

  const matchedEncounters = encounters
    .filter((encounter) => encounter.label.toLowerCase().includes(lowered))
    .slice(0, 6);

  const matchedLines = [
    ...state.debug.latestRawLines,
    ...state.debug.parseIssues.map((issue) => issue.line).filter(Boolean)
  ]
    .filter((line, index, source) => source.indexOf(line) === index)
    .filter((line) => line.toLowerCase().includes(lowered))
    .slice(0, 8);

  const hasResults = matchedPlayers.length || matchedEncounters.length || matchedLines.length;

  return (
    <aside className="oa-overlay search-results">
      <SectionHeading icon="travel_explore" eyebrow="Global Search" title={`Results for "${query}"`} />
      {!hasResults ? <div className="oa-empty-state">No matches across players, encounters, or live lines.</div> : null}
      {matchedPlayers.length ? (
        <div className="oa-search-section">
          <strong>Players</strong>
          <div className="oa-search-list">
            {matchedPlayers.map((player) => (
              <button key={player.id} className="oa-search-result" onClick={() => onSelectPlayer(player.id)}>
                <span className="oa-avatar-frame">{initialsFromName(player.displayName)}</span>
                <span>
                  <strong>{player.displayName}</strong>
                  <small>{player.className ?? "Unknown"}{player.paragon ? ` / ${player.paragon}` : ""}</small>
                </span>
                <span className="oa-search-metric">{formatShort(player.totalDamage)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {matchedEncounters.length ? (
        <div className="oa-search-section">
          <strong>Encounters</strong>
          <div className="oa-search-list">
            {matchedEncounters.map((encounter) => (
              <button key={encounter.id} className="oa-search-result" onClick={() => onSelectEncounter(encounter.id)}>
                <span className="oa-status-chip stable">{formatDuration(encounter.durationMs)}</span>
                <span>
                  <strong>{encounter.label}</strong>
                  <small>{formatShort(encounter.totalDamage)} total damage</small>
                </span>
                <span className="oa-search-metric">{formatShort(encounter.dps)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {matchedLines.length ? (
        <div className="oa-search-section">
          <strong>Live lines</strong>
          <div className="oa-event-list compact">
            {matchedLines.map((line, index) => (
              <article className="oa-event-card" key={`${line}-${index}`}>
                <div>
                  <div className="oa-line-tags">
                    {classifyLineTags(line).map((tag) => (
                      <span key={`${index}-${tag.label}`} className={`oa-line-tag ${tag.tone}`}>{tag.label}</span>
                    ))}
                  </div>
                  <p>{line}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function ObsidianScreens(props: ShellProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const activePlayerName = props.selectedPlayer?.displayName ?? "No player selected";
  const runtimeLabel = getRuntimeLabel(props.state);
  const sessionIndicator = getSessionIndicator(props.state);
  const sourceLabel = getSourceLabel(props.state);
  const sessionSeconds = Math.floor(props.state.analysis.durationMs / 1000);
  const sessionTimer = `${Math.floor(sessionSeconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((sessionSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(sessionSeconds % 60).toString().padStart(2, "0")}`;

  const filterRows = (rows: PlayerRow[]) => {
    if (!searchQuery.trim()) {
      return rows;
    }

    const query = searchQuery.toLowerCase();
    return rows.filter((player) => {
      const className = player.className?.toLowerCase() ?? "";
      const paragon = player.paragon?.toLowerCase() ?? "";
      return (
        player.displayName.toLowerCase().includes(query) ||
        className.includes(query) ||
        paragon.includes(query) ||
        player.topSkills.some((skill) => skill.abilityName.toLowerCase().includes(query)) ||
        player.targets.some((target) => target.targetName.toLowerCase().includes(query))
      );
    });
  };

  const filteredPlayers = useMemo(() => filterRows(props.playerRows), [props.playerRows, searchQuery]);
  const filteredLivePlayers = useMemo(
    () => filterRows(props.livePlayerRows),
    [props.livePlayerRows, searchQuery]
  );

  const rootStyle = {
    "--oa-overlay-opacity": `${settings.overlayOpacity / 100}`
  } as CSSProperties;

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: "setup", label: "Setup", icon: "settings_input_component" },
    { id: "recent", label: "Encounters", icon: "history_edu" },
    { id: "debug", label: "Debug", icon: "bug_report" },
    { id: "library", label: "Library", icon: "menu_book" },
    { id: "settings", label: "Settings", icon: "settings" }
  ];

  return (
    <div className={`obsidian-architect ${settings.visualCore}`} style={rootStyle}>
      <aside className="oa-sidebar">
        <div className="oa-brand">
          <div className="oa-brand-mark">
            <Icon name="architecture" />
          </div>
          <div>
            <h2>OBSIDIAN</h2>
            <p>Combat Parser v1.0</p>
          </div>
        </div>

        <nav className="oa-nav">
          <button
            className={`oa-nav-item ${props.view === "setup" ? "active" : ""}`}
            onClick={() => props.onViewChange("setup")}
          >
            <Icon name="settings_input_component" />
            <span>Setup</span>
          </button>

          <div className="oa-live-group">
            <button
              className={`oa-nav-item ${props.view === "live" || props.view === "players" ? "active" : ""}`}
              onClick={() => props.onViewChange("live")}
            >
              <Icon name="sensors" />
              <span>Live</span>
              <Icon name="expand_more" className="oa-nav-expand" />
            </button>
            <div className="oa-subnav">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`oa-subnav-item ${props.view === "players" && props.detailTab === tab.id ? "active" : ""}`}
                  onClick={() => {
                    props.onViewChange("players");
                    props.onDetailTabChange(tab.id);
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.id === "deaths" && (props.selectedPlayer?.deaths ?? 0) > 0 ? (
                    <span className="oa-death-pill">{props.selectedPlayer?.deaths}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {navItems.slice(1).map((item) => (
            <button
              key={item.id}
              className={`oa-nav-item ${props.view === item.id ? "active" : ""}`}
              onClick={() => props.onViewChange(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="oa-sidebar-footer">
          <div className="oa-sidebar-profile">
            <div className="oa-sidebar-avatar">{initialsFromName(activePlayerName)}</div>
            <div>
              <strong>{activePlayerName}</strong>
              <span>{props.selectedPlayer?.className ? `${props.selectedPlayer.className}${props.selectedPlayer.paragon ? ` / ${props.selectedPlayer.paragon}` : ""}` : sourceLabel}</span>
            </div>
          </div>
          <button className="oa-button session" onClick={() => props.onViewChange("setup")}>
            New Session
          </button>
          <div className="oa-sidebar-status">
            <div className={`oa-system-pill ${sessionIndicator.tone}`}>
              <span className="oa-system-dot" />
              <span>{sessionIndicator.label}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="oa-main">
        <header className="oa-topbar">
          <div className="oa-topbar-left">
            {props.view === "players" ? (
              <button className="oa-back-control" onClick={props.onBackToPlayers}>
                <Icon name="arrow_back" />
                Back to Party
              </button>
            ) : (
              <span className="oa-title-lock">{props.view === "settings" ? "PROFILE SETTINGS" : "NEVERWINTER LIVE PARSER"}</span>
            )}
            <div className="oa-session-group">
              <span className="oa-session-pill">SESSION: {runtimeLabel}</span>
              <div className="oa-session-meta">
                <span>{sessionTimer}</span>
                <span>CPU: {props.state.system.processCpuPercent.toFixed(1)}%</span>
                <span>RAM: {props.state.system.processMemoryMb.toFixed(0)} MB</span>
              </div>
            </div>
          </div>
          <div className="oa-topbar-right">
            <label className="oa-search topbar">
              <Icon name="search" className="oa-inline-icon" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="QUERY TELEMETRY..."
              />
            </label>
            <button className="oa-icon-button" onClick={props.onToggleNotifications}><Icon name="notifications" /></button>
            <button className="oa-icon-button" onClick={props.onToggleDiagnostics}><Icon name="memory" /></button>
            <button className="oa-icon-button power"><Icon name="power_settings_new" /></button>
          </div>
        </header>

        <main className="oa-main-scroll">
          {props.view === "setup" ? <SetupView {...props} /> : null}
          {props.view === "live" ? (
            <LiveOverviewView
              props={props}
              filteredPlayers={filteredLivePlayers}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              compareMode={compareMode}
              onToggleCompare={() => setCompareMode((value) => !value)}
            />
          ) : null}
          {props.view === "players" ? <PlayerView props={props} searchQuery={searchQuery} /> : null}
          {props.view === "recent" ? <RecentView state={props.state} /> : null}
          {props.view === "debug" ? <DebugView state={props.state} /> : null}
          {props.view === "library" ? <LibraryView /> : null}
          {props.view === "settings" ? (
            <SettingsView props={props} settings={settings} onSettingsChange={setSettings} />
          ) : null}
        </main>

        {!props.isDesktopRuntime ? (
          <div className="oa-runtime-banner">
            Browser preview only. Live monitoring and file import require the Electron desktop app.
          </div>
        ) : null}

        <div className={`oa-floating-status ${sessionIndicator.tone}`}>
          <span className="oa-system-dot" />
          <span>{sessionIndicator.label}</span>
          <strong>{sessionIndicator.detail}</strong>
        </div>

        {props.notificationsOpen ? <NotificationsPanel state={props.state} /> : null}
        {props.diagnosticsOpen ? <DiagnosticsPanel state={props.state} /> : null}
        <GlobalSearchPanel
          query={searchQuery}
          players={props.playerRows}
          encounters={props.availableEncounters}
          state={props.state}
          onSelectPlayer={(playerId) => props.onSelectPlayer(playerId)}
          onSelectEncounter={(encounterId) => {
            props.onSelectEncounter(encounterId);
            props.onViewChange("players");
          }}
        />
      </div>
    </div>
  );
}
