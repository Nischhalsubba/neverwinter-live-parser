import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import metadata from "../../shared/data/nw-metadata.json";
import nwHubClasses from "../../shared/data/nw-hub-classes.json";
import artifactData from "../../shared/data/nw-hub-artifacts.json";
import {
  artifactCategoryScores,
  baseDamageFromItemLevel,
  baseHitPointsFromItemLevel,
  categoryStrength,
  categorizeArtifact,
  categorizePower,
  cooldownAfterRecovery,
  normalizeEntityName,
  powerCategoryScores,
  ratingContribution,
  type LibraryCategory
} from "../../shared/mechanicsModel";
import type {
  AppState,
  DiscoveredLogCandidate,
  EncounterSnapshot,
  SkillStat,
  TimelinePoint,
  HighestHitStat,
  TargetStat
} from "../../shared/types";
import { classifyPowerFamily, getClassVisualMeta, getPowerMeta, getPowerVisualMeta, isKnownCompanion } from "../nwMetadata";
import type { DetailTab, LiveScopeMode, PlayerRow, View } from "../analysisViewModel";
import {
  DETAIL_TABS,
  formatDuration,
  formatNumber,
  formatShort
} from "../analysisViewModel";
import type { ProfileSettings } from "../rendererSettings";

type ShellProps = {
  state: AppState;
  view: View;
  detailTab: DetailTab;
  playerRows: PlayerRow[];
  livePlayerRows: PlayerRow[];
  liveScope: LiveScopeMode;
  liveDiagnostics: string[];
  selectedPlayer: PlayerRow | null;
  selectedEncounter: EncounterSnapshot | null;
  availableEncounters: EncounterSnapshot[];
  includeCompanions: boolean;
  isDesktopRuntime: boolean;
  notificationsOpen: boolean;
  diagnosticsOpen: boolean;
  folderInput: string;
  importFilePath: string;
  logCandidates: DiscoveredLogCandidate[];
  discoveringLogs: boolean;
  hasScannedLogs: boolean;
  starting: boolean;
  onViewChange: (view: View) => void;
  onDetailTabChange: (tab: DetailTab) => void;
  onFolderInputChange: (value: string) => void;
  onImportFileChange: (value: string) => void;
  onChooseFolder: () => void;
  onChooseImportFile: () => void;
  onDiscoverLogs: () => void;
  onUseDiscoveredCandidate: (candidate: DiscoveredLogCandidate) => void;
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
  rendererSettings: ProfileSettings;
  onRendererSettingsChange: (next: ProfileSettings) => void;
  errorLogDirectory: string;
  onClearRendererCache: () => void;
  onClearAppData: () => void;
  onClearLogs: () => void;
};

const CHART_COLORS = [
  "#cdbdff",
  "#86e8ff",
  "#ffb38a",
  "#9af1bb",
  "#ffd36e",
  "#ff8f9f",
  "#9ea8ff",
  "#c6a7ff"
];

const ONBOARDING_HELP_STORAGE_KEY = "oa-setup-helper-dismissed";

const DETAIL_TAB_COPY: Record<DetailTab, string> = {
  overview: "Combat-log totals for the selected player or encounter, including outgoing damage, healing, incoming damage, and top target splits.",
  timeline: "Time-bucketed combat-log activity for this player, showing when damage and healing events landed and which powers drove the parse.",
  damageOut: "Outgoing damage from parsed hit events, grouped by power and hostile target names found in the combat log.",
  healing: "Healing events parsed from the combat log, grouped by power with tick counts, total output, average tick size, and crit rate.",
  damageTaken: "Incoming damage recorded against this player in the combat log, shown as encounter-by-encounter intake pressure.",
  timing: "Timing-derived metrics from parsed events, including burst windows, encounter participation, and event cadence.",
  positioning: "Combat-log-supported positioning heuristics such as flank rate, target spread, and hostile target distribution.",
  other: "Supplemental parser facts from the combat log, including skill inventory, targets tracked, companions, and build inference.",
  highestHit: "The hardest single-hit damage events found in the combat log, grouped across class powers, mounts, artifacts, companions, and other damage sources.",
  debuffs: "Known Neverwinter debuff sources for class kits and combat-log overlap between your damage activations and debuffs seen on the target.",
  deaths: "Death lines and closely related parser issues matched to this player from the current combat log.",
  artifactDamage: "Artifact activations detected in the combat log and the exact damage you dealt in the 20 seconds after each artifact use."
};

type DebuffCatalogEntry = {
  className: string;
  sourceType: "power" | "feat" | "feature";
  name: string;
  paragonPath: string | null;
  iconPath: string | null;
  description: string;
  keywords: string[];
};

type ErrorLogEntry = {
  name: string;
  path: string;
  sizeBytes: number;
  updatedAt: number;
};

type DrilldownDetail =
  | {
      kind: "power";
      title: string;
      subtitle: string;
      rows: Array<{ label: string; value: string }>;
      timeline?: TimelinePoint[];
      events: Array<{ title: string; subtitle: string; metric: string }>;
    }
  | {
      kind: "target";
      title: string;
      subtitle: string;
      rows: Array<{ label: string; value: string }>;
      events: Array<{ title: string; subtitle: string; metric: string }>;
    }
  | {
      kind: "hit";
      title: string;
      subtitle: string;
      rows: Array<{ label: string; value: string }>;
      events: Array<{ title: string; subtitle: string; metric: string }>;
    }
  | {
      kind: "artifact";
      title: string;
      subtitle: string;
      rows: Array<{ label: string; value: string }>;
      events: Array<{ title: string; subtitle: string; metric: string }>;
    };

const DEBUFF_PATTERNS: Array<{ keyword: string; label: string }> = [
  { keyword: "damage taken", label: "Damage Taken" },
  { keyword: "damage resistance", label: "Damage Resistance" },
  { keyword: "less damage", label: "Damage Down" },
  { keyword: "critical severity", label: "Crit Severity" },
  { keyword: "critical chance", label: "Crit Chance" },
  { keyword: "combat advantage", label: "Combat Advantage" },
  { keyword: "slow", label: "Slow" },
  { keyword: "slowed", label: "Slow" },
  { keyword: "stun", label: "Stun" },
  { keyword: "immobil", label: "Immobilize" },
  { keyword: "weaken", label: "Weaken" },
  { keyword: "vulnerability", label: "Vulnerability" },
  { keyword: "decrease", label: "Decrease" },
  { keyword: "reduce", label: "Reduce" }
];

function inferDebuffKeywords(description: string): string[] {
  const lowered = description.toLowerCase();
  return Array.from(
    new Set(
      DEBUFF_PATTERNS.filter((entry) => lowered.includes(entry.keyword)).map((entry) => entry.label)
    )
  );
}

const DEBUFF_CATALOG: DebuffCatalogEntry[] = [
  ...nwHubClasses.powers.map((entry) => ({
    className: entry.className ?? "Unknown",
    sourceType: "power" as const,
    name: entry.name,
    paragonPath: entry.paragonPath ?? null,
    iconPath: entry.iconPath ?? null,
    description: entry.description ?? "",
    keywords: inferDebuffKeywords(entry.description ?? "")
  })),
  ...nwHubClasses.feats.map((entry) => ({
    className: entry.className ?? "Unknown",
    sourceType: "feat" as const,
    name: entry.name,
    paragonPath: entry.paragonPath ?? null,
    iconPath: entry.iconPath ?? null,
    description: entry.description ?? "",
    keywords: inferDebuffKeywords(entry.description ?? "")
  })),
  ...nwHubClasses.features.map((entry) => ({
    className: entry.className ?? "Unknown",
    sourceType: "feature" as const,
    name: entry.name,
    paragonPath: entry.paragonPath ?? null,
    iconPath: entry.iconPath ?? null,
    description: entry.description ?? "",
    keywords: inferDebuffKeywords(entry.description ?? "")
  }))
]
  .filter((entry) => entry.description && entry.keywords.length > 0)
  .sort((left, right) => {
    if (left.className !== right.className) {
      return left.className.localeCompare(right.className);
    }
    return left.name.localeCompare(right.name);
  });

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

function InlineHelp({ text }: { text: string }) {
  return (
    <span className="oa-inline-help" title={text} aria-label={text}>
      <Icon name="help" className="oa-inline-help-icon" />
    </span>
  );
}

function AssetImage({
  localSrc,
  remoteSrc,
  alt,
  className,
  fallback
}: {
  localSrc: string | null | undefined;
  remoteSrc?: string | null | undefined;
  alt: string;
  className: string;
  fallback: ReactNode;
}) {
  const [source, setSource] = useState<string | null>(localSrc ?? remoteSrc ?? null);

  useEffect(() => {
    setSource(localSrc ?? remoteSrc ?? null);
  }, [localSrc, remoteSrc]);

  if (!source) {
    return <>{fallback}</>;
  }

  return (
    <img
      className={className}
      src={source}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (remoteSrc && source !== remoteSrc) {
          setSource(remoteSrc);
          return;
        }
        setSource(null);
      }}
    />
  );
}

function ClassAvatar({
  className,
  fallback
}: {
  className: string | null | undefined;
  fallback: string;
}) {
  const meta = getClassVisualMeta(className);
  return (
    <AssetImage
      className="oa-avatar-image"
      localSrc={meta?.emblemPath}
      remoteSrc={"emblemUrl" in (meta ?? {}) ? meta?.emblemUrl : null}
      alt={className ?? fallback}
      fallback={fallback}
    />
  );
}

function PowerVisual({
  powerName,
  fallback
}: {
  powerName: string;
  fallback: string;
}) {
  const meta = getPowerVisualMeta(powerName);
  return (
    <AssetImage
      className="oa-power-image"
      localSrc={"iconPath" in (meta ?? {}) ? meta?.iconPath : null}
      remoteSrc={"iconUrl" in (meta ?? {}) ? meta?.iconUrl : null}
      alt={powerName}
      fallback={fallback}
    />
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

function buildLiveTargetFocus(players: PlayerRow[]): Array<{ name: string; totalDamage: number; hits: number }> {
  const totals = new Map<string, { name: string; totalDamage: number; hits: number }>();

  for (const player of players) {
    for (const target of player.targets) {
      const normalized = normalizeEntityName(target.targetName) || target.targetName;
      const current = totals.get(normalized) ?? {
        name: target.targetName,
        totalDamage: 0,
        hits: 0
      };

      current.totalDamage += target.totalDamage;
      current.hits += target.hits;
      totals.set(normalized, current);
    }
  }

  return Array.from(totals.values()).sort((left, right) => right.totalDamage - left.totalDamage);
}

function buildFocusedTargetSummary(
  players: PlayerRow[],
  focusTarget: string
): {
  totalDamage: number;
  totalHits: number;
  critCount: number;
  contributors: Array<{ name: string; totalDamage: number; hits: number; critCount: number }>;
} {
  const normalizedFocus = normalizeEntityName(focusTarget);
  const contributors = players
    .map((player) => {
      const target = player.targets.find(
        (entry) => normalizeEntityName(entry.targetName) === normalizedFocus
      );
      return target
        ? {
            name: player.displayName,
            totalDamage: target.totalDamage,
            hits: target.hits,
            critCount: target.critCount
          }
        : null;
    })
    .filter((entry): entry is { name: string; totalDamage: number; hits: number; critCount: number } => entry !== null)
    .sort((left, right) => right.totalDamage - left.totalDamage);

  return {
    totalDamage: contributors.reduce((sum, row) => sum + row.totalDamage, 0),
    totalHits: contributors.reduce((sum, row) => sum + row.hits, 0),
    critCount: contributors.reduce((sum, row) => sum + row.critCount, 0),
    contributors
  };
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

function buildDamageTags(input: {
  critical?: boolean;
  critCount?: number;
  flankCount?: number;
  family?: string;
}): Array<{ label: string; tone: "critical" | "advantage" | "heal" | "issue" }> {
  const tags: Array<{ label: string; tone: "critical" | "advantage" | "heal" | "issue" }> = [];

  if (input.critical || (input.critCount ?? 0) > 0) {
    tags.push({ label: "Crit Hit", tone: "critical" });
  }
  if ((input.flankCount ?? 0) > 0) {
    tags.push({ label: "CA Hit", tone: "advantage" });
  }
  if (input.family === "artifact") {
    tags.push({ label: "Artifact", tone: "heal" });
  } else if (input.family === "mount") {
    tags.push({ label: "Mount", tone: "heal" });
  } else if (input.family === "pet") {
    tags.push({ label: "Pet", tone: "heal" });
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

function TimelineChart({
  points,
  mode,
  accent = "primary"
}: {
  points: TimelinePoint[];
  mode: "damage" | "healing";
  accent?: "primary" | "secondary";
}) {
  const source = points.length ? points : [{ second: 0, damage: 0, healing: 0, hits: 0 }];
  const valueKey = mode === "damage" ? "damage" : "healing";
  const color = accent === "primary" ? "#cdbdff" : "#bdf4ff";
  const peak = source.reduce((best, point) => {
    const value = mode === "damage" ? point.damage : point.healing;
    return value > best.value ? { second: point.second, value } : best;
  }, { second: 0, value: 0 });

  return (
    <div className="oa-chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={source} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`oa-area-${mode}-${accent}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(205, 189, 255, 0.08)" vertical={false} />
          <XAxis
            dataKey="second"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(229,225,228,0.56)", fontSize: 11 }}
            tickFormatter={(value) => `${value}s`}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(229,225,228,0.56)", fontSize: 11 }}
            tickFormatter={(value) => formatShort(Number(value))}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(23,27,34,0.96)",
              border: "1px solid rgba(91,186,213,0.14)",
              borderRadius: 12,
              color: "#F3EEE6"
            }}
            formatter={(value: number) => formatShort(value)}
            labelFormatter={(value) => `T: ${value}s`}
          />
          <ReferenceLine x={peak.second} stroke={color} strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#oa-area-${mode}-${accent})`}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: color, stroke: "#171B22", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
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

function ChartSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="oa-skeleton-chart" aria-hidden="true">
      <div className="oa-skeleton-chart-hero" />
      <div className="oa-skeleton-chart-bars">
        {Array.from({ length: rows }).map((_, index) => (
          <span className="oa-skeleton-bar" key={index} />
        ))}
      </div>
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
          <Bar dataKey="total" fill="#cdbdff" radius={[6, 6, 6, 6]} isAnimationActive={false} />
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
          <Area type="monotone" dataKey="damage" stroke="#cdbdff" fill="url(#oaDamageGradient)" strokeWidth={2} isAnimationActive={false} />
          <Area type="monotone" dataKey="healing" stroke="#7cf5c5" fill="url(#oaHealingGradient)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EffectTimelineChart({ points }: { points: TimelinePoint[] }) {
  if (!points.length) {
    return <div className="oa-empty-state">No buff or debuff events were parsed for this selection.</div>;
  }

  return (
    <div className="oa-chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={points}>
          <CartesianGrid stroke="rgba(205, 189, 255, 0.08)" vertical={false} />
          <XAxis dataKey="second" stroke="rgba(229, 225, 228, 0.52)" tickFormatter={(value) => `${value}s`} />
          <YAxis stroke="rgba(229, 225, 228, 0.52)" />
          <Tooltip
            formatter={(value: number, name: string) => [formatNumber(Number(value)), name === "debuffs" ? "Debuff applications" : "Buff applications"]}
            labelFormatter={(value) => `${value}s`}
            contentStyle={{
              background: "rgba(27, 27, 29, 0.95)",
              border: "1px solid rgba(205, 189, 255, 0.16)",
              borderRadius: "14px",
              color: "#e5e1e4"
            }}
          />
          <Area type="monotone" dataKey="buffs" stroke="#9af1bb" fill="rgba(154, 241, 187, 0.14)" strokeWidth={2} isAnimationActive={false} />
          <Area type="monotone" dataKey="debuffs" stroke="#ffd36e" fill="rgba(255, 211, 110, 0.18)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildActivationRows(player: PlayerRow) {
  const rows = new Map<string, {
    abilityName: string;
    family: "class" | "proc" | "pet" | "artifact" | "mount" | "unknown";
    kind: string;
    uses: number;
    critCount: number;
    timestamps: number[];
  }>();

  for (const activation of player.activations) {
    if (!activation.abilityName) {
      continue;
    }
    const family = classifyPowerFamily(activation.abilityName, activation.sourceType);
    const key = `${activation.kind}:${activation.abilityName}:${family}`;
    const current = rows.get(key) ?? {
      abilityName: activation.abilityName,
      family,
      kind: activation.kind,
      uses: 0,
      critCount: 0,
      timestamps: []
    };
    current.uses += 1;
    current.timestamps.push(activation.second);
    if (activation.critical) {
      current.critCount += 1;
    }
    rows.set(key, current);
  }

  return Array.from(rows.values()).sort((left, right) => right.uses - left.uses);
}

function buildEffectRows(player: PlayerRow) {
  return player.effects
    .filter((effect) => effect.kind === "debuff")
    .map((effect) => ({
      ...effect,
      avgGap:
        effect.timestamps.length > 1
          ? effect.timestamps
              .slice(1)
              .reduce((sum, timestamp, index) => sum + (timestamp - effect.timestamps[index]), 0) /
            (effect.timestamps.length - 1)
          : 0
    }))
    .sort((left, right) => right.applications - left.applications);
}

function buildRotationHeatmap(player: PlayerRow) {
  const damageRows = buildActivationRows(player)
    .filter((row) => row.kind === "damage")
    .slice(0, 12);
  const maxSecond = Math.max(0, ...player.activations.map((activation) => activation.second));
  const buckets = Array.from(
    { length: Math.max(1, Math.floor(maxSecond / 5) + 1) },
    (_, index) => index * 5
  );

  return damageRows.map((row) => {
    const counts = new Map<number, number>();
    for (const timestamp of row.timestamps) {
      const bucket = Math.floor(timestamp / 5) * 5;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    return {
      abilityName: row.abilityName,
      cells: buckets.map((bucket) => ({
        second: bucket,
        count: counts.get(bucket) ?? 0
      }))
    };
  });
}

function ContributionPieChart({
  data,
  dataKey,
  nameKey
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  nameKey: string;
}) {
  if (!data.length) {
    return <div className="oa-empty-state">No parsed combat-log values are available for this chart.</div>;
  }

  return (
    <div className="oa-chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={nameKey}
            innerRadius={70}
            outerRadius={110}
            paddingAngle={3}
            isAnimationActive={false}
            stroke="rgba(19, 19, 21, 0.85)"
            strokeWidth={2}
          >
            {data.map((entry, index) => (
              <Cell key={`${entry[nameKey]}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatShort(Number(value))}
            contentStyle={{
              background: "rgba(27, 27, 29, 0.95)",
              border: "1px solid rgba(205, 189, 255, 0.16)",
              borderRadius: "14px",
              color: "#e5e1e4"
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function LibraryView() {
  const cards = [
    { label: "NW Hub classes", value: formatNumber(nwHubClasses.classes.length), icon: "shield_person" },
    { label: "NW Hub powers", value: formatNumber(nwHubClasses.powers.length), icon: "deployed_code" },
    { label: "NW Hub feats", value: formatNumber(nwHubClasses.feats.length), icon: "social_leaderboard" },
    { label: "NW Hub features", value: formatNumber(nwHubClasses.features.length), icon: "diamond" },
    { label: "Player powers", value: formatNumber(metadata.playerPowers.length), icon: "local_fire_department" },
    { label: "Companions", value: formatNumber(metadata.companions.length), icon: "pets" },
    { label: "Artifacts", value: formatNumber(metadata.artifacts.length), icon: "diamond" },
    { label: "Mount powers", value: formatNumber(metadata.mounts.length), icon: "directions_car" }
  ];

  const previewPowers = nwHubClasses.powers.slice(0, 18);
  const previewArtifacts = artifactData.artifacts.slice(0, 12);

  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Parser Library</p>
        <h1>Neverwinter metadata vault</h1>
        <p>Reusable reference data extracted from local game tooling and NW Hub class resources, now used to enrich class emblems, power icons, paragon labels, and combat-log presentation inside the parser.</p>
      </header>
      <div className="oa-card-grid four">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone="secondary" />
        ))}
      </div>
      <section className="oa-panel">
        <SectionHeading icon="shield_person" eyebrow="Class Reference" title="Neverwinter classes, resources, and paragons" />
        <div className="oa-library-class-grid">
          {nwHubClasses.classes.map((entry) => (
            <article className="oa-library-class-card" key={entry.className}>
              <div className="oa-library-class-head">
                <div className="oa-portrait small">
                  <ClassAvatar className={entry.className} fallback={entry.className.slice(0, 2).toUpperCase()} />
                </div>
                <div>
                  <strong>{entry.className}</strong>
                  <small>{entry.resourceName ?? "No unique class resource"}</small>
                </div>
              </div>
              <div className="oa-library-pill-row">
                {entry.paragons.map((paragon) => (
                  <span className="oa-badge subtle" key={`${entry.className}-${paragon.name}`}>
                    {paragon.name} • {paragon.role}
                  </span>
                ))}
              </div>
              <p className="oa-library-copy">
                {entry.hasMasterySlot ? "Has mastery slot support in NW Hub data." : "No mastery slot flag in NW Hub data."}
              </p>
            </article>
          ))}
        </div>
      </section>
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
      <section className="oa-panel">
        <SectionHeading icon="image" eyebrow="Visual Assets" title="Extracted NW Hub power icons" />
        <div className="oa-power-gallery">
          {previewPowers.map((power) => (
            <article className="oa-power-gallery-card" key={`${power.className}-${power.name}`}>
              <div className="oa-power-icon large">
                <PowerVisual powerName={power.name} fallback={power.name.slice(0, 2).toUpperCase()} />
              </div>
              <div>
                <strong>{power.name}</strong>
                <small>
                  {power.className}
                  {power.paragonPath ? ` • ${power.paragonPath}` : ""}
                  {power.type ? ` • ${power.type}` : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="oa-panel">
        <SectionHeading icon="diamond" eyebrow="Artifact Intelligence" title="Extracted artifact icons and combat effect summaries" />
        <div className="oa-power-gallery">
          {previewArtifacts.map((artifact) => (
            <article className="oa-power-gallery-card" key={artifact.name}>
              <div className="oa-power-icon large">
                <AssetImage
                  className="oa-power-image"
                  localSrc={artifact.iconPath}
                  remoteSrc={artifact.iconUrl}
                  alt={artifact.name}
                  fallback={artifact.name.slice(0, 2).toUpperCase()}
                />
              </div>
              <div>
                <strong>{artifact.name}</strong>
                <small>
                  {artifact.quality} • IL {formatNumber(artifact.itemLevel ?? 0)}
                  {artifact.effects.damageTakenPct.length
                    ? ` • +${Math.max(...artifact.effects.damageTakenPct)}% dmg taken`
                    : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function LibraryReferenceView() {
  const [selectedClassName, setSelectedClassName] = useState(nwHubClasses.classes[0]?.className ?? "Fighter");
  const [artifactCategoryTab, setArtifactCategoryTab] = useState<string>("all");
  const cards = [
    { label: "NW Hub classes", value: formatNumber(nwHubClasses.classes.length), icon: "shield_person" },
    { label: "NW Hub powers", value: formatNumber(nwHubClasses.powers.length), icon: "deployed_code" },
    { label: "NW Hub feats", value: formatNumber(nwHubClasses.feats.length), icon: "social_leaderboard" },
    { label: "NW Hub features", value: formatNumber(nwHubClasses.features.length), icon: "diamond" },
    { label: "Artifacts", value: formatNumber(artifactData.artifacts.length), icon: "diamond" },
    { label: "Companions", value: formatNumber(metadata.companions.length), icon: "pets" },
    { label: "Mount powers", value: formatNumber(metadata.mounts.length), icon: "directions_car" },
    { label: "Player powers", value: formatNumber(metadata.playerPowers.length), icon: "local_fire_department" }
  ];

  const categorizeLibraryText = (description: string) => {
    const lowered = description.toLowerCase();
    if (
      lowered.includes("damage taken") ||
      lowered.includes("damage resistance") ||
      lowered.includes("less damage") ||
      lowered.includes("stun") ||
      lowered.includes("slow") ||
      lowered.includes("slowed") ||
      lowered.includes("immobil") ||
      lowered.includes("weaken") ||
      lowered.includes("vulnerability") ||
      lowered.includes("reduce")
    ) {
      return "debuff";
    }
    if (
      lowered.includes("heal") ||
      lowered.includes("allies") ||
      lowered.includes("outgoing healing") ||
      lowered.includes("incoming healing") ||
      lowered.includes("power for") ||
      lowered.includes("grant")
    ) {
      return "support";
    }
    if (
      lowered.includes("shield") ||
      lowered.includes("temporary hit points") ||
      lowered.includes("defense")
    ) {
      return "survivability";
    }
    if (lowered.includes("damage") || lowered.includes("deal ")) {
      return "damage";
    }
    return "utility";
  };

  const categoryLabel = (category: string) => {
    switch (category) {
      case "damage":
        return "Pure Damage";
      case "support":
        return "Team Support";
      case "debuff":
        return "Debuff / Control";
      case "survivability":
        return "Defense / Sustain";
      default:
        return "Utility";
    }
  };

  const formatStatKey = (key: string) =>
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const classReference = nwHubClasses.classes.map((entry) => {
    const powers = nwHubClasses.powers
      .filter((power) => power.className === entry.className)
      .map((power) => ({ ...power, category: categorizeLibraryText(power.description ?? "") }));
    const feats = nwHubClasses.feats
      .filter((feat) => feat.className === entry.className)
      .map((feat) => ({ ...feat, category: categorizeLibraryText(feat.description ?? "") }));
    const features = nwHubClasses.features
      .filter((feature) => feature.className === entry.className)
      .map((feature) => ({ ...feature, category: categorizeLibraryText(feature.description ?? "") }));

    return {
      ...entry,
      groupedPowers: {
        damage: powers.filter((power) => power.category === "damage").slice(0, 8),
        support: [...powers, ...feats, ...features].filter((item) => item.category === "support").slice(0, 8),
        debuff: [...powers, ...feats, ...features].filter((item) => item.category === "debuff").slice(0, 8),
        survivability: [...powers, ...feats, ...features].filter((item) => item.category === "survivability").slice(0, 6),
        utility: [...powers, ...feats, ...features].filter((item) => item.category === "utility").slice(0, 6)
      }
    };
  });

  const artifactBreakdown = artifactData.artifacts
    .map((artifact) => ({ ...artifact, category: categorizeLibraryText(artifact.powerText ?? "") }))
    .sort((left, right) => {
      if (left.category !== right.category) {
        return left.category.localeCompare(right.category);
      }
      return left.name.localeCompare(right.name);
    });
  const selectedClassReference =
    classReference.find((entry) => entry.className === selectedClassName) ?? classReference[0];
  const artifactTabs = ["all", "damage", "support", "debuff", "survivability", "utility"];
  const filteredArtifacts =
    artifactCategoryTab === "all"
      ? artifactBreakdown
      : artifactBreakdown.filter((artifact) => artifact.category === artifactCategoryTab);

  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Parser Library</p>
        <h1>Neverwinter reference library</h1>
        <p>Class kits, support tools, debuffs, and artifact powers organized so the parser UI can explain what each thing does instead of only showing a raw name.</p>
      </header>
      <div className="oa-card-grid four">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone="secondary" />
        ))}
      </div>

      {selectedClassReference ? (
        <section className="oa-panel" key={`library-${selectedClassReference.className}`}>
          <SectionHeading
            icon="deployed_code"
            eyebrow="Class Toolkit"
            title={`${selectedClassReference.className} powers, support tools, and debuffs`}
            actions={
              <div className="oa-library-filter">
                <label className="oa-library-filter-label" htmlFor="library-class-picker">Class</label>
                <select
                  id="library-class-picker"
                  className="oa-library-select"
                  value={selectedClassName}
                  onChange={(event) => setSelectedClassName(event.target.value)}
                >
                  {classReference.map((entry) => (
                    <option key={entry.className} value={entry.className}>
                      {entry.className}
                    </option>
                  ))}
                </select>
              </div>
            }
          />
          <div className="oa-library-group-grid">
            {Object.entries(selectedClassReference.groupedPowers).map(([category, items]) => (
              <article className="oa-library-category-card" key={`${selectedClassReference.className}-${category}`}>
                <div className="oa-library-category-head">
                  <strong>{categoryLabel(category)}</strong>
                  <span className="oa-badge subtle">{items.length}</span>
                </div>
                {items.length ? (
                  <div className="oa-library-entry-list">
                    {items.map((item) => (
                      <div className="oa-library-entry" key={`${selectedClassReference.className}-${category}-${item.name}`}>
                        <div className="oa-power-icon">
                          <AssetImage
                            className="oa-power-image"
                            localSrc={"iconPath" in item ? item.iconPath : null}
                            remoteSrc={"iconUrl" in item ? item.iconUrl : null}
                            alt={item.name}
                            fallback={item.name.slice(0, 2).toUpperCase()}
                          />
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {"paragonPath" in item && item.paragonPath ? `${item.paragonPath} • ` : ""}
                            {"type" in item && item.type ? item.type : "Class kit"}
                          </small>
                          <p className="oa-library-copy">{item.description || "No extracted description."}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="oa-empty-state">No extracted entries for this category.</div>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="oa-panel">
        <SectionHeading icon="diamond" eyebrow="Artifact Intelligence" title="Artifact breakdown by role, debuff value, and raw effect text" />
        <div className="oa-subtab-shell">
          {artifactTabs.map((tab) => (
            <button
              key={tab}
              className={`oa-subtab ${artifactCategoryTab === tab ? "active" : ""}`}
              onClick={() => setArtifactCategoryTab(tab)}
            >
              {tab === "all" ? "All Artifacts" : categoryLabel(tab)}
            </button>
          ))}
        </div>
        <div className="oa-library-artifact-grid">
          {filteredArtifacts.map((artifact) => (
            <article className="oa-library-artifact-card" key={artifact.name}>
              <div className="oa-library-artifact-head">
                <div className="oa-power-icon large">
                  <AssetImage
                    className="oa-power-image"
                    localSrc={artifact.iconPath}
                    remoteSrc={artifact.iconUrl}
                    alt={artifact.name}
                    fallback={artifact.name.slice(0, 2).toUpperCase()}
                  />
                </div>
                <div>
                  <strong>{artifact.name}</strong>
                  <small>
                    {artifact.quality} • IL {formatNumber(artifact.itemLevel ?? 0)} • {categoryLabel(artifact.category)}
                  </small>
                </div>
              </div>
              <div className="oa-library-pill-row">
                {artifact.effects.keywords.length ? artifact.effects.keywords.map((keyword) => (
                  <span className="oa-badge subtle" key={`${artifact.name}-${keyword}`}>{keyword}</span>
                )) : <span className="oa-badge subtle">direct-damage</span>}
              </div>
              <div className="oa-kv-list compact">
                <div><span>Combined Rating</span><strong>{formatNumber(artifact.combinedRating ?? 0)}</strong></div>
                <div><span>Stats</span><strong>{Object.entries(artifact.stats ?? {}).slice(0, 3).map(([key, value]) => `${formatStatKey(key)} ${formatNumber(Number(value))}`).join(" • ") || "No extracted stats"}</strong></div>
                <div><span>Damage Taken Debuff</span><strong>{artifact.effects.damageTakenPct.length ? `+${Math.max(...artifact.effects.damageTakenPct)}%` : "None detected"}</strong></div>
                <div><span>Control</span><strong>{artifact.effects.hasControlEffect ? "Yes" : "No"}</strong></div>
              </div>
              <p className="oa-library-copy">{artifact.powerText || "No extracted artifact text."}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function categoryLabel(category: LibraryCategory): string {
  switch (category) {
    case "damage":
      return "Pure Damage";
    case "support":
      return "Team Support";
    case "debuff":
      return "Debuff / Control";
    case "survivability":
      return "Defense / Sustain";
    default:
      return "Utility";
  }
}

function formatStatKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildCategoryScoreSummary(category: LibraryCategory, score: number): string {
  if (category === "damage") {
    return `${score.toFixed(1)} pressure score`;
  }
  if (category === "debuff") {
    return `${score.toFixed(1)} debuff score`;
  }
  if (category === "support") {
    return `${score.toFixed(1)} support score`;
  }
  if (category === "survivability") {
    return `${score.toFixed(1)} defense score`;
  }
  return `${score.toFixed(1)} utility score`;
}

function LibraryReferenceWorkbench() {
  const [selectedClassName, setSelectedClassName] = useState(
    nwHubClasses.classes[0]?.className ?? "Fighter"
  );
  const [artifactCategoryTab, setArtifactCategoryTab] = useState<LibraryCategory | "all">("all");
  const [artifactSortMode, setArtifactSortMode] = useState<
    "category" | "highestDebuff" | "highestDamage" | "highestSupport"
  >("category");
  const cards = [
    { label: "NW Hub classes", value: formatNumber(nwHubClasses.classes.length), icon: "shield_person" },
    { label: "NW Hub powers", value: formatNumber(nwHubClasses.powers.length), icon: "deployed_code" },
    { label: "NW Hub feats", value: formatNumber(nwHubClasses.feats.length), icon: "social_leaderboard" },
    { label: "NW Hub features", value: formatNumber(nwHubClasses.features.length), icon: "diamond" },
    { label: "Artifacts", value: formatNumber(artifactData.artifacts.length), icon: "diamond" },
    { label: "Companions", value: formatNumber(metadata.companions.length), icon: "pets" },
    { label: "Mount powers", value: formatNumber(metadata.mounts.length), icon: "directions_car" },
    { label: "Player powers", value: formatNumber(metadata.playerPowers.length), icon: "local_fire_department" }
  ];

  const classReference = nwHubClasses.classes.map((entry) => {
    const classItems = [
      ...nwHubClasses.powers.filter((power) => power.className === entry.className).map((power) => {
        const scores = powerCategoryScores(power);
        const category = categorizePower(power);
        return { ...power, sourceKind: "Power", category, scores };
      }),
      ...nwHubClasses.feats
        .filter((feat) => feat.className === entry.className)
        .map((feat) => {
          const scores = powerCategoryScores(feat);
          const category = categorizePower(feat);
          return { ...feat, sourceKind: "Feat", category, scores };
        }),
      ...nwHubClasses.features
        .filter((feature) => feature.className === entry.className)
        .map((feature) => {
          const scores = powerCategoryScores(feature);
          const category = categorizePower(feature);
          return { ...feature, sourceKind: "Feature", category, scores };
        })
    ];

    return {
      ...entry,
      groupedPowers: {
        damage: classItems
          .filter((item) => item.category === "damage")
          .sort(
            (left, right) =>
              categoryStrength(right.scores, "damage") -
              categoryStrength(left.scores, "damage")
          )
          .slice(0, 10),
        support: classItems
          .filter((item) => item.category === "support")
          .sort(
            (left, right) =>
              categoryStrength(right.scores, "support") -
              categoryStrength(left.scores, "support")
          )
          .slice(0, 10),
        debuff: classItems
          .filter((item) => item.category === "debuff")
          .sort(
            (left, right) =>
              categoryStrength(right.scores, "debuff") -
              categoryStrength(left.scores, "debuff")
          )
          .slice(0, 10),
        survivability: classItems
          .filter((item) => item.category === "survivability")
          .sort(
            (left, right) =>
              categoryStrength(right.scores, "survivability") -
              categoryStrength(left.scores, "survivability")
          )
          .slice(0, 8),
        utility: classItems
          .filter((item) => item.category === "utility")
          .sort(
            (left, right) =>
              categoryStrength(right.scores, "utility") -
              categoryStrength(left.scores, "utility")
          )
          .slice(0, 8)
      }
    };
  });

  const selectedClassReference =
    classReference.find((entry) => entry.className === selectedClassName) ?? classReference[0];

  const artifactBreakdown = artifactData.artifacts
    .map((artifact) => {
      const scores = artifactCategoryScores(artifact);
      const category = categorizeArtifact(artifact);
      return { ...artifact, category, scores };
    })
    .sort((left, right) => {
      if (artifactSortMode === "highestDebuff") {
        return (
          Math.max(...right.effects.damageTakenPct, 0) -
            Math.max(...left.effects.damageTakenPct, 0) ||
          left.name.localeCompare(right.name)
        );
      }
      if (artifactSortMode === "highestDamage") {
        return (
          categoryStrength(right.scores, "damage") -
            categoryStrength(left.scores, "damage") ||
          left.name.localeCompare(right.name)
        );
      }
      if (artifactSortMode === "highestSupport") {
        return (
          categoryStrength(right.scores, "support") -
            categoryStrength(left.scores, "support") ||
          left.name.localeCompare(right.name)
        );
      }
      const activeCategory = (artifactCategoryTab === "all"
        ? left.category
        : artifactCategoryTab) as LibraryCategory;
      return (
        categoryStrength(right.scores, activeCategory) -
          categoryStrength(left.scores, activeCategory) ||
        left.name.localeCompare(right.name)
      );
    });

  const artifactTabs: Array<LibraryCategory | "all"> = [
    "all",
    "damage",
    "support",
    "debuff",
    "survivability",
    "utility"
  ];

  const filteredArtifacts =
    artifactCategoryTab === "all"
      ? artifactBreakdown
      : artifactBreakdown.filter((artifact) => artifact.category === artifactCategoryTab);

  const formulaCards = [
    {
      label: "Base Damage @ 90k IL",
      value: formatShort(baseDamageFromItemLevel(90_000, "dps")),
      hint: "NW Hub damage math: IL / 10 with 20% DPS role bonus"
    },
    {
      label: "Base HP @ 90k IL",
      value: formatShort(baseHitPointsFromItemLevel(90_000, "dps")),
      hint: "NW Hub EHP math: IL * 10 for DPS baseline"
    },
    {
      label: "Power From Rating",
      value: `${ratingContribution(100_000, 90_000, 60).toFixed(1)}%`,
      hint: "Rating contribution example using the NW Hub rating formula"
    },
    {
      label: "Recovery / 18s CD",
      value: `${cooldownAfterRecovery(18, 20).toFixed(1)}s`,
      hint: "Cooldown example after 20% recovery-style recharge speed"
    }
  ];

  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Parser Library</p>
        <h1>Neverwinter reference library</h1>
        <p>
          Class kits, support tools, debuffs, and artifact powers organized so the
          parser UI can explain what each thing does instead of only showing a raw
          name.
        </p>
      </header>
      <div className="oa-card-grid four">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone="secondary"
          />
        ))}
      </div>

      <section className="oa-panel">
        <SectionHeading
          icon="calculate"
          eyebrow="Mechanics Model"
          title="NW Hub formulas applied to ranking and explanation"
        />
        <div className="oa-card-grid four">
          {formulaCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon="functions"
              hint={card.hint}
            />
          ))}
        </div>
      </section>

      {selectedClassReference ? (
        <section
          className="oa-panel"
          key={`library-${selectedClassReference.className}`}
        >
          <SectionHeading
            icon="deployed_code"
            eyebrow="Class Toolkit"
            title={`${selectedClassReference.className} powers, support tools, and debuffs`}
            actions={
              <div className="oa-library-filter">
                <label
                  className="oa-library-filter-label"
                  htmlFor="library-class-picker"
                >
                  Class
                </label>
                <select
                  id="library-class-picker"
                  className="oa-library-select"
                  value={selectedClassName}
                  onChange={(event) => setSelectedClassName(event.target.value)}
                >
                  {classReference.map((entry) => (
                    <option key={entry.className} value={entry.className}>
                      {entry.className}
                    </option>
                  ))}
                </select>
              </div>
            }
          />
          <div className="oa-library-group-grid">
            {(
              Object.entries(selectedClassReference.groupedPowers) as Array<
                [LibraryCategory, typeof selectedClassReference.groupedPowers.damage]
              >
            ).map(([category, items]) => (
              <article
                className="oa-library-category-card"
                key={`${selectedClassReference.className}-${category}`}
              >
                <div className="oa-library-category-head">
                  <strong>{categoryLabel(category)}</strong>
                  <span className="oa-badge subtle">{items.length}</span>
                </div>
                {items.length ? (
                  <div className="oa-library-entry-list">
                    {items.map((item) => (
                      <div
                        className="oa-library-entry"
                        key={`${selectedClassReference.className}-${category}-${item.name}`}
                      >
                        <div className="oa-power-icon">
                          <AssetImage
                            className="oa-power-image"
                            localSrc={"iconPath" in item ? item.iconPath : null}
                            remoteSrc={"iconUrl" in item ? item.iconUrl : null}
                            alt={item.name}
                            fallback={item.name.slice(0, 2).toUpperCase()}
                          />
                        </div>
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {"paragonPath" in item && item.paragonPath
                              ? `${item.paragonPath} • `
                              : ""}
                            {item.sourceKind} • {"type" in item && item.type ? item.type : "Class kit"} •{" "}
                            {buildCategoryScoreSummary(
                              item.category,
                              categoryStrength(item.scores, item.category)
                            )}
                          </small>
                          <p className="oa-library-copy">
                            {item.description || "No extracted description."}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="oa-empty-state">
                    No extracted entries for this category.
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="oa-panel">
        <SectionHeading
          icon="diamond"
          eyebrow="Artifact Intelligence"
          title="Artifact breakdown by strongest debuff, damage, support, and defense value"
          actions={
            <div className="oa-library-filter">
              <label className="oa-library-filter-label" htmlFor="artifact-sort-picker">
                Sort
              </label>
              <select
                id="artifact-sort-picker"
                className="oa-library-select"
                value={artifactSortMode}
                onChange={(event) =>
                  setArtifactSortMode(
                    event.target.value as "category" | "highestDebuff" | "highestDamage" | "highestSupport"
                  )
                }
              >
                <option value="category">Best by Category</option>
                <option value="highestDebuff">Highest Debuff to Lowest</option>
                <option value="highestDamage">Highest Damage to Lowest</option>
                <option value="highestSupport">Highest Support to Lowest</option>
              </select>
            </div>
          }
        />
        <div className="oa-subtab-shell">
          {artifactTabs.map((tab) => (
            <button
              key={tab}
              className={`oa-subtab ${artifactCategoryTab === tab ? "active" : ""}`}
              onClick={() => setArtifactCategoryTab(tab)}
            >
              {tab === "all" ? "All Artifacts" : categoryLabel(tab)}
            </button>
          ))}
        </div>
        <div className="oa-library-artifact-grid">
          {filteredArtifacts.map((artifact) => (
            <article className="oa-library-artifact-card" key={artifact.name}>
              <div className="oa-library-artifact-head">
                <div className="oa-power-icon large">
                  {artifact.iconPath ? (
                    <img
                      className="oa-power-image"
                      src={artifact.iconPath}
                      alt={artifact.name}
                      loading="lazy"
                    />
                  ) : (
                    artifact.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <strong>{artifact.name}</strong>
                  <small>
                    {artifact.quality} • IL {formatNumber(artifact.itemLevel ?? 0)} •{" "}
                    {categoryLabel(artifact.category)}
                  </small>
                </div>
              </div>
              <div className="oa-library-pill-row">
                {artifact.effects.keywords.length ? (
                  artifact.effects.keywords.map((keyword) => (
                    <span className="oa-badge subtle" key={`${artifact.name}-${keyword}`}>
                      {keyword}
                    </span>
                  ))
                ) : (
                  <span className="oa-badge subtle">direct-damage</span>
                )}
              </div>
              <div className="oa-kv-list compact">
                <div>
                  <span>Combined Rating</span>
                  <strong>{formatNumber(artifact.combinedRating ?? 0)}</strong>
                </div>
                <div>
                  <span>Stats</span>
                  <strong>
                    {Object.entries(artifact.stats ?? {})
                      .slice(0, 3)
                      .map(
                        ([key, value]) =>
                          `${formatStatKey(key)} ${formatNumber(Number(value))}`
                      )
                      .join(" • ") || "No extracted stats"}
                  </strong>
                </div>
                <div>
                  <span>Primary Score</span>
                  <strong>
                    {buildCategoryScoreSummary(
                      artifact.category,
                      categoryStrength(artifact.scores, artifact.category)
                    )}
                  </strong>
                </div>
                <div>
                  <span>Damage Taken Debuff</span>
                  <strong>
                    {artifact.effects.damageTakenPct.length
                      ? `+${Math.max(...artifact.effects.damageTakenPct)}%`
                      : "None detected"}
                  </strong>
                </div>
                <div>
                  <span>Control</span>
                  <strong>{artifact.effects.hasControlEffect ? "Yes" : "No"}</strong>
                </div>
              </div>
              <p className="oa-library-copy">
                {artifact.powerText || "No extracted artifact text."}
              </p>
            </article>
          ))}
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
  const selectedLogTimestamp = getCombatLogTimestampLabel(state.activeLogFile);

  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Configuration & Setup</p>
        <h1>Connect the Neverwinter combat log</h1>
        <p>
          Start here the first time you open the app. The parser only watches Neverwinter files
          named <code>combatlog_YYYY-MM-DD_HH-MM-SS</code>, so voice chat, crash, shutdown, and
          shader files are ignored automatically.
        </p>
      </header>

      <div className="oa-setup-grid">
        <section className="oa-panel oa-panel-hero">
          <SectionHeading
            icon="folder_special"
            eyebrow="Combat Log Source"
            title="Choose the folder or file you want to track"
          />
          <div className="oa-setup-steps">
            <article className="oa-setup-step">
              <strong>1. Auto Detect</strong>
              <p>Search this Windows PC for real Neverwinter combatlog files only.</p>
            </article>
            <article className="oa-setup-step">
              <strong>2. Confirm the correct result</strong>
              <p>Pick the candidate that shows your latest combatlog file and timestamp.</p>
            </article>
            <article className="oa-setup-step">
              <strong>3. Start live or analyze recorded</strong>
              <p>
                Live tracking follows the newest combatlog in that folder. Recorded analysis opens
                one file only.
              </p>
            </article>
          </div>
          <div className="oa-field-stack">
            <label className="oa-field">
              <span>Combat log path</span>
              <div className="oa-input-row">
                <div className="oa-input-shell">
                  <Icon name="terminal" className="oa-input-icon" />
                  <input
                    value={props.folderInput}
                    onChange={(event) => props.onFolderInputChange(event.target.value)}
                    placeholder="Leave empty, then use Auto Detect or Browse to the GameClient folder"
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
              <button
                className="oa-button tertiary"
                onClick={props.onDiscoverLogs}
                disabled={props.discoveringLogs || !props.isDesktopRuntime}
              >
                <Icon
                  name={props.discoveringLogs ? "autorenew" : "travel_explore"}
                  className={props.discoveringLogs ? "oa-spin" : undefined}
                />
                {props.discoveringLogs ? "Scanning drives..." : "Auto Detect"}
              </button>
            </div>

            {props.logCandidates.length ? (
              <div className="oa-list-panel">
                {props.logCandidates.slice(0, 5).map((candidate) => (
                  <div className="oa-list-row compact" key={candidate.folderPath}>
                    <div>
                      <strong>{candidate.filePath ?? candidate.folderPath}</strong>
                      <small>{candidate.sourceHint} • {candidate.timestampLabel}</small>
                    </div>
                    <button
                      className="oa-button secondary"
                      onClick={() => props.onUseDiscoveredCandidate(candidate)}
                    >
                      Confirm
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {props.hasScannedLogs && !props.discoveringLogs && !props.logCandidates.length ? (
              <div className="oa-empty-state">
                No Neverwinter combatlog files were found on this PC. Try Browse if the game is
                installed in an uncommon location.
              </div>
            ) : null}

            <div className="oa-mini-panel">
              <strong>Latest tracked combat log</strong>
              <p>{state.activeLogFile ?? "No active combat log selected"}</p>
              <p className="oa-muted-copy">Timestamp: {selectedLogTimestamp}</p>
              <p className="oa-muted-copy">
                Only files that begin with <code>combatlog_</code> are monitored.
              </p>
            </div>

            <label className="oa-field">
              <span>Archived combat log</span>
              <div className="oa-input-row">
                <div className="oa-input-shell">
                  <Icon name="history_edu" className="oa-input-icon" />
                  <input
                    value={props.importFilePath}
                    onChange={(event) => props.onImportFileChange(event.target.value)}
                    placeholder="Choose one combatlog file for a recorded parse"
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
          <SectionHeading icon="monitor_heart" eyebrow="Combat Log Parse Health" title="Signal integrity" />
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
          <SectionHeading icon="memory" eyebrow="Runtime From Current Log" title="Runtime profile" />
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
  liveFocusTarget,
  liveFocusOptions,
  onLiveFocusChange,
  searchQuery,
  onSearchChange,
  compareMode,
  compareSelection,
  onToggleCompareSelection,
  onToggleComparePlayer,
  onStartCompare,
  onExitCompare
}: {
  props: ShellProps;
  filteredPlayers: PlayerRow[];
  liveFocusTarget: string;
  liveFocusOptions: Array<{ name: string; totalDamage: number; hits: number }>;
  onLiveFocusChange: (target: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  compareMode: "idle" | "selecting" | "active";
  compareSelection: string[];
  onToggleCompareSelection: () => void;
  onToggleComparePlayer: (playerId: string) => void;
  onStartCompare: () => void;
  onExitCompare: () => void;
}) {
  const { state } = props;
  const [sortKey, setSortKey] = useState<"damage" | "healing" | "taken" | "dps" | "hits" | "name">("damage");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const current = props.liveScope === "encounter" ? state.currentEncounter : null;
  const liveDurationMs =
    props.liveScope === "encounter"
      ? state.currentEncounter?.durationMs ?? 0
      : state.analysis.durationMs;
  const liveDurationSeconds = Math.max(1, liveDurationMs / 1000);
  const liveScopeLabel =
    props.liveScope === "encounter" ? "Live Scope: Current Encounter" : "Live Scope: Tracked Session";
  const baseRows =
    compareMode === "active"
      ? filteredPlayers.filter((player) => compareSelection.includes(player.id))
      : filteredPlayers;
  const comparePool = useMemo(() => {
    const rows = [...baseRows];
    rows.sort((left, right) => {
      const direction = sortDirection === "desc" ? -1 : 1;
      const compareNumber = (a: number, b: number) => (a === b ? 0 : a > b ? direction : -direction);
      if (sortKey === "name") {
        return left.displayName.localeCompare(right.displayName) * direction;
      }
      if (sortKey === "healing") {
        return compareNumber(left.totalHealing, right.totalHealing);
      }
      if (sortKey === "taken") {
        return compareNumber(left.damageTaken, right.damageTaken);
      }
      if (sortKey === "dps") {
        return compareNumber(left.dps, right.dps);
      }
      if (sortKey === "hits") {
        return compareNumber(left.hits, right.hits);
      }
      return compareNumber(left.totalDamage, right.totalDamage);
    });
    return rows;
  }, [baseRows, sortDirection, sortKey]);
  const totalDamage = comparePool.reduce((sum, player) => sum + player.totalDamage, 0);
  const totalHealing = comparePool.reduce((sum, player) => sum + player.totalHealing, 0);
  const totalTaken = comparePool.reduce((sum, player) => sum + player.damageTaken, 0);
  const totalDeaths = comparePool.reduce((sum, player) => sum + player.deaths, 0);
  const selectedForCompare = filteredPlayers.filter((player) => compareSelection.includes(player.id));
  const computedDps = totalDamage / liveDurationSeconds;
  const focusedTargetSummary =
    liveFocusTarget === "all"
      ? null
      : buildFocusedTargetSummary(props.livePlayerRows, liveFocusTarget);
  const targetDistributionData =
    liveFocusTarget === "all"
      ? liveFocusOptions.slice(0, 8).map((target) => ({
          label: target.name,
          value: target.totalDamage
        }))
      : focusedTargetSummary?.contributors.slice(0, 8).map((row) => ({
          label: row.name,
          value: row.totalDamage
        })) ?? [];

  function toggleSort(nextKey: "damage" | "healing" | "taken" | "dps" | "hits" | "name") {
    if (sortKey === nextKey) {
      setSortDirection((currentDirection) => (currentDirection === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" ? "asc" : "desc");
  }

  function sortMarker(key: "damage" | "healing" | "taken" | "dps" | "hits" | "name") {
    if (sortKey !== key) {
      return "swap_vert";
    }
    return sortDirection === "desc" ? "south" : "north";
  }

  return (
    <section className="oa-screen">
      <header className="oa-screen-topline">
        <div>
          <h1>Party Overview</h1>
          <p>
            <Icon name="location_on" className="oa-inline-icon" />{" "}
            {current?.label ??
              (state.analysis.mode === "imported"
                ? "Recorded log analysis"
                : props.liveScope === "session"
                  ? "Tracked combat log session"
                  : "Waiting for combat events")}
          </p>
          <p className="oa-page-description">
            Real-time combat-log summary of the currently tracked fight, with player output, target focus, and live target distribution.
          </p>
          <p className="oa-page-kicker">{liveScopeLabel}</p>
        </div>
        <div className="oa-toolbar">
          <button className="oa-switch-card" onClick={props.onToggleCompanions} title="Turn companion damage on or off in the player totals.">
            <span>Split Pets <InlineHelp text="Turn companion damage on or off in the player totals." /></span>
            <div className={`oa-switch ${props.includeCompanions ? "is-on" : ""}`}>
              <div />
            </div>
          </button>
          {compareMode === "idle" ? (
            <button className="oa-button primary" onClick={onToggleCompareSelection} title="Choose the exact players you want to compare side by side.">
              <Icon name="compare_arrows" />
              Compare Players
            </button>
          ) : null}
          {compareMode === "selecting" ? (
            <>
              <button
                className="oa-button primary"
                onClick={onStartCompare}
                disabled={compareSelection.length < 2}
                title="Start a focused comparison using only the checked players."
              >
                <Icon name="play_arrow" />
                Start Compare
              </button>
              <button className="oa-button secondary" onClick={onExitCompare}>
                <Icon name="arrow_back" />
                Go Back
              </button>
            </>
          ) : null}
          {compareMode === "active" ? (
            <button className="oa-button secondary" onClick={onExitCompare}>
              <Icon name="arrow_back" />
              Go Back
            </button>
          ) : null}
        </div>
      </header>

      <div className="oa-focus-bar">
        <span className="oa-focus-label"><Icon name="adjust" className="oa-inline-icon" /> Live Focus:</span>
        <button
          className={`oa-encounter-chip ${liveFocusTarget === "all" ? "active" : ""}`}
          onClick={() => onLiveFocusChange("all")}
        >
          All Targets
        </button>
        {liveFocusOptions.slice(0, 8).map((target) => (
          <button
            className={`oa-encounter-chip ${liveFocusTarget === target.name ? "active" : ""}`}
            key={target.name}
            onClick={() => onLiveFocusChange(target.name)}
          >
            <Icon name="gps_fixed" className="oa-chip-icon" />
            {target.name} ({formatShort(target.totalDamage)})
          </button>
        ))}
      </div>

      <div className="oa-card-grid four">
        <StatCard
          label={props.liveScope === "encounter" ? "Current Encounter DPS" : "Tracked Session DPS"}
          value={formatShort(props.liveScope === "encounter" ? current?.dps ?? computedDps : computedDps)}
          tone="secondary"
          icon="bolt"
          hint={props.liveScope === "encounter" ? "current encounter" : "tracked combat log session"}
        />
        <StatCard label="Total Damage" value={formatShort(totalDamage)} tone="primary" icon="query_stats" hint={`${formatNumber(filteredPlayers.length)} live player rows from combat log`} />
        <StatCard label="Total Healing" value={formatShort(totalHealing)} icon="healing" hint="healing parsed from the current combat-log slice" />
        <StatCard label="Damage Taken" value={formatShort(totalTaken)} tone="tertiary" icon="shield" hint={`${formatNumber(totalDeaths)} live deaths detected`} />
      </div>

      <div className="oa-split-grid">
        <section className="oa-panel">
          <SectionHeading
            icon="radar"
            eyebrow="Focused Target Breakdown"
            title={liveFocusTarget === "all" ? "Current target distribution" : `${liveFocusTarget} contribution`}
          />
          <div className="oa-card-grid three">
            <StatCard
              label={liveFocusTarget === "all" ? "Targets" : "Target Damage"}
              value={formatNumber(liveFocusTarget === "all" ? liveFocusOptions.length : focusedTargetSummary?.contributors.length ?? 0)}
              icon="my_location"
              hint={liveFocusTarget === "all" ? "distinct hostile names in current log slice" : formatShort(focusedTargetSummary?.totalDamage ?? 0)}
            />
            <StatCard
              label={liveFocusTarget === "all" ? "Top Target" : "Target Hits"}
              value={liveFocusTarget === "all" ? (liveFocusOptions[0]?.name ?? "None") : formatNumber(focusedTargetSummary?.totalHits ?? 0)}
              icon="adjust"
              hint={liveFocusTarget === "all" ? formatShort(liveFocusOptions[0]?.totalDamage ?? 0) : `${formatPercent((focusedTargetSummary?.critCount ?? 0) / Math.max(1, focusedTargetSummary?.totalHits ?? 0))} crit rate`}
            />
            <StatCard
              label={liveFocusTarget === "all" ? "Focus Share" : "Contributors"}
              value={
                liveFocusTarget === "all"
                  ? formatPercent((liveFocusOptions[0]?.totalDamage ?? 0) / Math.max(1, liveFocusOptions.reduce((sum, row) => sum + row.totalDamage, 0)))
                  : formatNumber(focusedTargetSummary?.contributors.length ?? 0)
              }
              icon="pie_chart"
              hint={liveFocusTarget === "all" ? "largest target share of current damage" : "players currently hitting this target"}
            />
          </div>
          <ContributionPieChart data={targetDistributionData} dataKey="value" nameKey="label" />
        </section>

        <section className="oa-panel">
          <SectionHeading
            icon="list_alt"
            eyebrow={liveFocusTarget === "all" ? "Target Table" : "Target Contributors"}
            title={liveFocusTarget === "all" ? "Current targets by damage" : `Players hitting ${liveFocusTarget}`}
          />
          <div className="oa-list-panel">
            {(liveFocusTarget === "all"
              ? liveFocusOptions.slice(0, 10).map((row) => ({
                  label: row.name,
                  supporting: `${formatNumber(row.hits)} hits`,
                  metric: formatShort(row.totalDamage)
                }))
              : focusedTargetSummary?.contributors.slice(0, 10).map((row) => ({
                  label: row.name,
                  supporting: `${formatNumber(row.hits)} hits • ${formatPercent(row.critCount / Math.max(1, row.hits))} crit`,
                  metric: formatShort(row.totalDamage)
                })) ?? []
            ).map((row) => (
              <div className="oa-list-row compact" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.supporting}</small>
                </div>
                <div className="oa-list-metric">
                  <strong>{row.metric}</strong>
                </div>
              </div>
            ))}
            {!targetDistributionData.length ? (
              <div className="oa-empty-state">No hostile target names have been parsed in the current combat-log slice yet.</div>
            ) : null}
          </div>
        </section>
      </div>

      {compareMode === "selecting" ? (
        <section className="oa-panel">
          <SectionHeading icon="fact_check" eyebrow="Compare Setup" title="Pick exactly the players you want to compare" />
          <p className="oa-panel-description">Check two or more players below, then press <strong>Start Compare</strong>. The live view will switch to a focused comparison using only those players.</p>
        </section>
      ) : null}

      {compareMode === "active" && selectedForCompare.length ? (
        <section className="oa-panel">
          <SectionHeading icon="compare" eyebrow="Compare Overlay" title="Selected player comparison" />
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
          title={compareMode === "active" ? "Compared players only" : "Live combat table"}
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
            <button className="oa-sort-button" onClick={() => toggleSort("name")}>Player <Icon name={sortMarker("name")} className="oa-sort-icon" /></button>
            <span>Class</span>
            <button className="oa-sort-button" onClick={() => toggleSort("damage")}>Damage <Icon name={sortMarker("damage")} className="oa-sort-icon" /></button>
            <button className="oa-sort-button" onClick={() => toggleSort("healing")}>Healing <Icon name={sortMarker("healing")} className="oa-sort-icon" /></button>
            <button className="oa-sort-button" onClick={() => toggleSort("taken")}>Taken <Icon name={sortMarker("taken")} className="oa-sort-icon" /></button>
            <button className="oa-sort-button" onClick={() => toggleSort("dps")}>DPS <Icon name={sortMarker("dps")} className="oa-sort-icon" /></button>
            <button className="oa-sort-button" onClick={() => toggleSort("hits")}>Hits <Icon name={sortMarker("hits")} className="oa-sort-icon" /></button>
            <span>Duration</span>
          </div>
          {comparePool.map((player, index) => (
            <button
              className="oa-table-row party"
              key={player.id}
              onClick={() =>
                compareMode === "selecting"
                  ? onToggleComparePlayer(player.id)
                  : props.onSelectPlayer(player.id)
              }
            >
              <span className="oa-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="oa-player-cell">
                {compareMode === "selecting" ? (
                  <input
                    className="oa-compare-checkbox"
                    type="checkbox"
                    checked={compareSelection.includes(player.id)}
                    onChange={() => onToggleComparePlayer(player.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${player.displayName} for compare`}
                  />
                ) : null}
                <span className="oa-avatar-frame">
                  <ClassAvatar className={player.className} fallback={initialsFromName(player.displayName)} />
                </span>
                <span>
                  <strong>{player.displayName}</strong>
                  <small>{player.paragon ? `@${player.paragon.toLowerCase().replace(/\s+/g, "_")}` : "@unknown_build"}</small>
                </span>
              </span>
              <span><em className="oa-class-pill">{player.className ?? "Unknown"}</em></span>
              <span>
                <strong>{formatShort(player.totalDamage)}</strong>
                <ProgressBar value={player.totalDamage} max={Math.max(...comparePool.map((entry) => entry.totalDamage), 1)} />
              </span>
              <span className="tone-secondary-text">{formatShort(player.totalHealing)}</span>
              <span>{formatShort(player.damageTaken)}</span>
              <span className="tone-secondary-text">{formatShort(player.dps)}</span>
              <span>{formatNumber(player.hits)}</span>
              <span>{formatDuration(liveDurationMs)}</span>
            </button>
          ))}
          {!comparePool.length ? (
            <div className="oa-empty-state">
              {props.liveScope === "encounter"
                ? "No players match the current search or compare filter."
                : "No players were found in the tracked combat log session for the current filters."}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function PlayerOverviewTab({
  player,
  encounter,
  allEncounters,
  onOpenDetail
}: {
  player: PlayerRow;
  encounter: EncounterSnapshot | null;
  allEncounters: EncounterSnapshot[];
  onOpenDetail: (detail: DrilldownDetail) => void;
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
                <button className="oa-list-row oa-clickable-row" key={`${skill.kind}-${skill.abilityName}`} onClick={() => onOpenDetail(buildPowerDrilldown(player, skill.abilityName))}>
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
                </button>
              );
            })}
          </div>
        </section>

        <section className="oa-panel">
          <SectionHeading icon="outbound" eyebrow="Damage by target" title="Mob, boss, and phase split" />
          <div className="oa-list-panel">
            {player.targets.slice(0, 8).map((target) => (
              <button className="oa-list-row compact oa-clickable-row" key={target.targetName} onClick={() => onOpenDetail(buildTargetDrilldown(player, target))}>
                <div>
                  <strong>{target.targetName}</strong>
                  <small>{isKnownCompanion(target.targetName) ? "Companion entity" : "Encounter target"}</small>
                </div>
                <div className="oa-list-metric">
                  <span>{formatNumber(target.hits)} hits</span>
                  <strong>{formatShort(target.totalDamage)}</strong>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function PlayerTimelineTab({ player, encounter }: { player: PlayerRow; encounter: EncounterSnapshot | null }) {
  const [mode, setMode] = useState<"dps" | "effects">("dps");
  const [familyFilter, setFamilyFilter] = useState<"all" | "class" | "proc" | "pet">("all");
  const [chartsReady, setChartsReady] = useState(false);
  const points =
    encounter === null
      ? player.timeline
      : player.timeline.filter((point) => point.second <= Math.ceil(encounter.durationMs / 1000));
  const activationRows = buildActivationRows(player).filter((row) => {
    if (familyFilter === "all") {
      return true;
    }
    return familyFilter === "pet" ? row.family === "pet" : row.family === familyFilter;
  });
  const powerRows = player.topSkills.filter((skill) => skill.kind === "damage");
  const effectRows = buildEffectRows(player).filter((effect) =>
    encounter === null ? true : effect.timestamps.some((timestamp) => timestamp <= Math.ceil(encounter.durationMs / 1000))
  );
  const rotationRows = buildRotationHeatmap(player);
  const maxActivationUses = Math.max(1, ...activationRows.map((row) => row.uses));

  useEffect(() => {
    setChartsReady(false);
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        setChartsReady(true);
      });
      return () => window.cancelAnimationFrame(secondFrame);
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [player.id, encounter?.id, mode, familyFilter]);

  return (
    <div className="oa-tab-layout">
      <section className="oa-panel">
        <SectionHeading
          icon="insights"
          eyebrow="Timeline"
          title={mode === "dps" ? "DPS flow over time" : "Buff and debuff application flow"}
          actions={
            <div className="oa-button-pair">
              <button className={`oa-pill-button ${mode === "dps" ? "active" : ""}`} onClick={() => setMode("dps")}>DPS</button>
              <button className={`oa-pill-button ${mode === "effects" ? "active" : ""}`} onClick={() => setMode("effects")}>Buff/Debuff</button>
            </div>
          }
        />
        {chartsReady ? (
          mode === "dps" ? <CombatTimelineChart points={points} /> : <EffectTimelineChart points={points} />
        ) : (
          <ChartSkeleton rows={5} />
        )}
      </section>

      <section className="oa-panel">
        <SectionHeading icon="bar_chart" eyebrow="Power Contribution" title="Top parsed powers" />
        {chartsReady ? <PowerContributionChart skills={powerRows} /> : <ChartSkeleton rows={4} />}
      </section>

      <section className="oa-panel">
        <SectionHeading
          icon="electric_bolt"
          eyebrow="Power Activations"
          title={`${activationRows.reduce((sum, row) => sum + row.uses, 0)} events from the combat log`}
          actions={
            <div className="oa-button-pair">
              <button className={`oa-pill-button ${familyFilter === "all" ? "active" : ""}`} onClick={() => setFamilyFilter("all")}>All</button>
              <button className={`oa-pill-button ${familyFilter === "class" ? "active" : ""}`} onClick={() => setFamilyFilter("class")}>Class Powers</button>
              <button className={`oa-pill-button ${familyFilter === "proc" ? "active" : ""}`} onClick={() => setFamilyFilter("proc")}>Procs & Items</button>
              <button className={`oa-pill-button ${familyFilter === "pet" ? "active" : ""}`} onClick={() => setFamilyFilter("pet")}>Pets</button>
            </div>
          }
        />
        <div className="oa-activation-legend">
          <span><span className="oa-dot normal" /> Normal</span>
          <span><span className="oa-dot crit" /> Crit</span>
        </div>
        <div className="oa-activation-grid">
          {activationRows.slice(0, 16).map((row) => (
            <div className="oa-activation-row" key={`${row.kind}:${row.abilityName}:${row.family}`}>
              <div className="oa-activation-name">
                <span className="oa-inline-power">
                  <span className="oa-power-icon small">
                    <PowerVisual powerName={row.abilityName} fallback={row.abilityName.slice(0, 2).toUpperCase()} />
                  </span>
                  <span>
                    <strong>{row.abilityName}</strong>
                    <small>{row.family} • {row.uses} uses</small>
                  </span>
                </span>
              </div>
              <div className="oa-activation-track">
                {row.timestamps.slice(0, 80).map((timestamp, index) => {
                  const critIndex = row.timestamps.findIndex((value) => value === timestamp);
                  const relatedActivation = player.activations.find(
                    (activation) =>
                      activation.abilityName === row.abilityName &&
                      activation.second === timestamp &&
                      activation.kind === row.kind
                  );
                  return (
                    <span
                      key={`${row.abilityName}-${timestamp}-${index}-${critIndex}`}
                      className={`oa-activation-mark ${relatedActivation?.critical ? "crit" : "normal"}`}
                      style={{ left: `${Math.min(100, (timestamp / Math.max(1, points.at(-1)?.second ?? 1)) * 100)}%` }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {!activationRows.length ? <div className="oa-empty-state">No power activations match the selected family in this combat-log selection.</div> : null}
        </div>
      </section>

      <section className="oa-panel">
        <SectionHeading icon="grid_view" eyebrow="Rotation Heatmap" title="5s buckets, top powers by damage" />
        {chartsReady ? (
          <div className="oa-heatmap">
            {rotationRows.map((row) => (
              <div className="oa-heatmap-row" key={row.abilityName}>
                <div className="oa-heatmap-label">{row.abilityName}</div>
                <div className="oa-heatmap-cells">
                  {row.cells.map((cell) => (
                    <span
                      key={`${row.abilityName}-${cell.second}`}
                      className="oa-heatmap-cell"
                      style={{
                        opacity: cell.count === 0 ? 0.18 : Math.min(1, 0.24 + cell.count / 4),
                        background: cell.count === 0 ? "rgba(205, 189, 255, 0.12)" : `rgba(205, 189, 255, ${Math.min(0.92, 0.22 + cell.count / 5)})`
                      }}
                      title={`${row.abilityName} at ${cell.second}s: ${cell.count} uses`}
                    />
                  ))}
                </div>
              </div>
            ))}
            {!rotationRows.length ? <div className="oa-empty-state">No damage activations were parsed for a rotation heatmap.</div> : null}
          </div>
        ) : (
          <ChartSkeleton rows={6} />
        )}
      </section>

      <section className="oa-panel">
        <SectionHeading icon="schedule" eyebrow="Power Usage Frequency" title="Combat-log activation frequency" />
        <div className="oa-data-table">
          <div className="oa-data-head healing">
            <span>Power</span>
            <span>Type</span>
            <span>Uses</span>
            <span>Crits</span>
            <span>Avg Gap</span>
            <span>Usage</span>
          </div>
          {activationRows.slice(0, 12).map((row) => {
            const gaps = row.timestamps.slice(1).map((timestamp, index) => timestamp - row.timestamps[index]);
            const avgGap = gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : 0;
            return (
              <div className="oa-data-row healing" key={`freq-${row.kind}-${row.abilityName}`}>
                <div>
                  <strong>{row.abilityName}</strong>
                  <small>{row.kind}</small>
                </div>
                <span>{row.family}</span>
                <span>{formatNumber(row.uses)}</span>
                <span>{formatNumber(row.critCount)}</span>
                <span>{avgGap > 0 ? `${avgGap.toFixed(1)}s` : "--"}</span>
                <span className="oa-right-stat">
                  <strong>{formatPercent(row.uses / maxActivationUses)}</strong>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="oa-panel">
        <SectionHeading icon="shield" eyebrow="Target Debuffs" title="Debuffs present while dealing damage" />
        <div className="oa-data-table">
          <div className="oa-data-head healing">
            <span>Debuff</span>
            <span>Target</span>
            <span>Applications</span>
            <span>Magnitude</span>
            <span>Last Seen</span>
            <span>Timeline</span>
          </div>
          {effectRows.slice(0, 14).map((effect) => (
            <div className="oa-data-row healing" key={`${effect.kind}-${effect.abilityName}-${effect.targetName}`}>
              <div>
                <strong>{effect.abilityName}</strong>
                <small>{classifyPowerFamily(effect.abilityName)}</small>
              </div>
              <span>{effect.targetName}</span>
              <span>{formatNumber(effect.applications)}</span>
              <span>{formatShort(effect.totalMagnitude)}</span>
              <span>{effect.timestamps.length ? `${effect.timestamps[effect.timestamps.length - 1]}s` : "--"}</span>
              <span className="oa-effect-time-list">{effect.timestamps.slice(0, 6).map((timestamp) => `${timestamp}s`).join(", ") || "--"}</span>
            </div>
          ))}
          {!effectRows.length ? <div className="oa-empty-state">No debuff applications were parsed for this player in the current combat-log selection.</div> : null}
        </div>
      </section>
    </div>
  );
}

function PlayerDamageTab({
  player,
  encounter,
  allEncounters,
  searchQuery,
  onOpenDetail
}: {
  player: PlayerRow;
  encounter: EncounterSnapshot | null;
  allEncounters: EncounterSnapshot[];
  searchQuery: string;
  onOpenDetail: (detail: DrilldownDetail) => void;
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
            <button className="oa-data-row damage oa-clickable-row" key={row.abilityName} onClick={() => onOpenDetail(buildPowerDrilldown(player, row.abilityName))}>
              <div className="oa-power-cell">
              <div className="oa-power-icon">
                <PowerVisual powerName={row.abilityName} fallback={row.abilityName.slice(0, 2).toUpperCase()} />
              </div>
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
            </button>
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
              <button className="oa-data-row target oa-clickable-row" key={target.targetName} onClick={() => onOpenDetail(buildTargetDrilldown(player, target))}>
                <div>
                  <strong>{target.targetName}</strong>
                  <small>{isKnownCompanion(target.targetName) ? "Companion entity" : "Encounter target"}</small>
                </div>
                <span>{formatNumber(target.hits)}</span>
                <span>{formatNumber(target.critCount)}</span>
                <span className="oa-right-stat"><strong>{formatShort(target.totalDamage)}</strong></span>
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}

function PlayerHealingTab({ player, onOpenDetail }: { player: PlayerRow; onOpenDetail: (detail: DrilldownDetail) => void; }) {
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
                <button className="oa-data-row healing oa-clickable-row" key={row.label} onClick={() => onOpenDetail(buildPowerDrilldown(player, row.label))}>
                  <div>
                    <strong>{row.label}</strong>
                    <small>Parsed healing events</small>
                  </div>
                  <span>{formatNumber(row.ticks)}</span>
                  <span>{formatShort(row.total)}</span>
                  <span><ProgressBar value={row.total} max={max} tone="primary" /></span>
                  <span>{formatNumber(row.average)}</span>
                  <span className="tone-secondary-text">{formatPercent(row.critRate)}</span>
                </button>
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
  encounters,
  onOpenDetail
}: {
  player: PlayerRow;
  encounters: EncounterSnapshot[];
  onOpenDetail: (detail: DrilldownDetail) => void;
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
            <button className="oa-data-row damage-taken oa-clickable-row" key={row.label} onClick={() => onOpenDetail({
              kind: "target",
              title: row.label,
              subtitle: "Incoming pressure detail for this encounter or segment.",
              rows: [
                { label: "Damage Taken", value: formatShort(row.amount) },
                { label: "Status", value: row.status }
              ],
              events: []
            })}>
              <div>
                <strong>{row.label}</strong>
                <small>Incoming pressure timeline</small>
              </div>
              <span className={`oa-status-chip ${row.status}`}>{row.status}</span>
              <span><ProgressBar value={row.amount} max={Math.max(...rows.map((entry) => entry.amount), 1)} tone="error" /></span>
              <span className="oa-right-stat"><strong>{formatShort(row.amount)}</strong></span>
            </button>
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
        <TimelineChart points={points} mode="damage" accent="secondary" />
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

function buildHighestHitRows(player: PlayerRow) {
  return player.highestHits.map((hit) => {
    const meta = getPowerMeta(hit.abilityName);
    const family = classifyPowerFamily(hit.abilityName, hit.sourceType);
    const totalMagnitude = meta ? Number(meta.magnitude ?? 0) : 0;

    return {
      ...hit,
      family,
      powerType: meta?.powertype ?? "Combat Power",
      estimatedMagnitude: Number.isFinite(totalMagnitude) ? totalMagnitude : 0,
      observedPerMagnitude:
        totalMagnitude && totalMagnitude > 0 ? hit.amount / totalMagnitude : null
    };
  });
}

function PlayerHighestHitTab({ player, onOpenDetail }: { player: PlayerRow; onOpenDetail: (detail: DrilldownDetail) => void; }) {
  const rows = buildHighestHitRows(player);
  const maxHit = Math.max(1, ...rows.map((row) => row.amount));

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid four">
        <StatCard
          label="Largest Hit"
          value={rows.length ? formatShort(rows[0].amount) : "0"}
          tone="primary"
          icon="north_east"
          hint={rows[0]?.abilityName ?? "No damage hits parsed"}
        />
        <StatCard
          label="Tracked Hit Sources"
          value={formatNumber(rows.length)}
          icon="deployed_code"
          hint="Distinct damage powers with a recorded peak hit"
        />
        <StatCard
          label="Critical Peaks"
          value={formatNumber(rows.filter((row) => row.critical).length)}
          tone="secondary"
          icon="flare"
        />
        <StatCard
          label="Mount / Artifact / Proc"
          value={formatNumber(rows.filter((row) => row.family !== "class").length)}
          icon="diamond"
          hint="Highest hits from non-class damage sources"
        />
      </div>

      <section className="oa-panel">
        <SectionHeading icon="north_east" eyebrow="Highest Hit" title="Largest single damage hits from the combat log" />
        <div className="oa-data-table">
          <div className="oa-data-head damage">
            <span>Power</span>
            <span>Family</span>
            <span>Target</span>
            <span>Peak Hit</span>
          </div>
          {rows.map((row) => (
            <button className="oa-data-row damage oa-clickable-row" key={`${row.abilityName}-${row.targetName ?? "no-target"}-${row.second}`} onClick={() => onOpenDetail(buildHighestHitDrilldown(player, row))}>
              <div className="oa-power-cell">
                <div className="oa-power-icon">
                  <PowerVisual powerName={row.abilityName} fallback={row.abilityName.slice(0, 2).toUpperCase()} />
                </div>
                <div>
                  <strong>{row.abilityName}</strong>
                  <small>
                    {row.powerType} • {row.critical ? "Critical peak" : "Normal peak"} • {row.second}s
                  </small>
                  <div className="oa-library-pill-row">
                    {buildDamageTags({
                      critical: row.critical,
                      family: row.family
                    }).map((tag) => (
                      <span className={`oa-badge subtle tone-${tag.tone}`} key={`${row.abilityName}-${row.second}-${tag.label}`}>
                        {tag.label}
                      </span>
                    ))}
                  </div>
                  <ProgressBar value={row.amount} max={maxHit} />
                </div>
              </div>
              <span>{row.family}</span>
              <span>{row.targetName ?? "Unknown target"}</span>
              <span className="oa-right-stat">
                <strong>{formatShort(row.amount)}</strong>
                <small>
                  {row.observedPerMagnitude
                    ? `${row.observedPerMagnitude.toFixed(1)} dmg / mag`
                    : "No magnitude match"}
                </small>
              </span>
            </button>
          ))}
          {!rows.length ? (
            <div className="oa-empty-state">
              No outgoing damage hits were parsed yet, so there is no highest-hit breakdown to show.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function buildDebuffOverlapRows(player: PlayerRow) {
  const damageSkills = new Map(
    player.topSkills
      .filter((skill) => skill.kind === "damage")
      .map((skill) => [skill.abilityName, skill])
  );
  const damageActivations = player.activations.filter((activation) => activation.kind === "damage");
  const debuffs = player.effects.filter((effect) => effect.kind === "debuff");
  const rows = new Map<
    string,
    {
      attackName: string;
      debuffName: string;
      targetName: string;
      overlapHits: number;
      totalDamage: number;
      totalHits: number;
      lastSeenSecond: number;
      family: ReturnType<typeof classifyPowerFamily>;
    }
  >();

  for (const activation of damageActivations) {
    if (!activation.targetName) {
      continue;
    }

    for (const debuff of debuffs) {
      if (debuff.targetName !== activation.targetName) {
        continue;
      }

      const activeTimestamp = debuff.timestamps.find(
        (timestamp) => timestamp <= activation.second && activation.second - timestamp <= 10
      );

      if (activeTimestamp === undefined) {
        continue;
      }

      const key = `${activation.abilityName}::${debuff.abilityName}::${activation.targetName}`;
      const skill = damageSkills.get(activation.abilityName);
      const current = rows.get(key) ?? {
        attackName: activation.abilityName,
        debuffName: debuff.abilityName,
        targetName: activation.targetName,
        overlapHits: 0,
        totalDamage: skill?.total ?? 0,
        totalHits: skill?.hits ?? 0,
        lastSeenSecond: activeTimestamp,
        family: classifyPowerFamily(debuff.abilityName)
      };

      current.overlapHits += 1;
      current.lastSeenSecond = Math.max(current.lastSeenSecond, activeTimestamp);
      rows.set(key, current);
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    if (right.overlapHits !== left.overlapHits) {
      return right.overlapHits - left.overlapHits;
    }
    return right.totalDamage - left.totalDamage;
  });
}

function PlayerDebuffsTab({ player }: { player: PlayerRow }) {
  const classCatalog = DEBUFF_CATALOG.filter((entry) =>
    player.className ? entry.className === player.className : true
  );
  const overlapRows = buildDebuffOverlapRows(player).slice(0, 18);

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid three">
        <StatCard label="Parsed Debuffs" value={formatNumber(player.effects.filter((effect) => effect.kind === "debuff").length)} icon="shield" tone="secondary" />
        <StatCard label="Known Class Debuffs" value={formatNumber(classCatalog.length)} icon="book_2" hint={player.className ? `${player.className} catalog` : "All class catalogs"} />
        <StatCard label="Hit / Debuff Overlaps" value={formatNumber(overlapRows.reduce((sum, row) => sum + row.overlapHits, 0))} icon="track_changes" tone="primary" />
      </div>

      <section className="oa-panel">
        <SectionHeading icon="book_2" eyebrow="Debuff Catalog" title={player.className ? `${player.className} debuffs and control tools` : "Neverwinter class debuffs"} />
        <div className="oa-data-table">
          <div className="oa-data-head healing">
            <span>Source</span>
            <span>Class</span>
            <span>Type</span>
            <span>Keywords</span>
            <span>Description</span>
          </div>
          {classCatalog.slice(0, 24).map((entry) => (
              <div className="oa-data-row healing" key={`${entry.className}-${entry.sourceType}-${entry.name}`}>
                <div className="oa-power-cell">
                  <div className="oa-power-icon">
                    <AssetImage
                      className="oa-power-image"
                      localSrc={entry.iconPath}
                      remoteSrc={undefined}
                      alt={entry.name}
                      fallback={entry.name.slice(0, 2).toUpperCase()}
                    />
                  </div>
                <div>
                  <strong>{entry.name}</strong>
                  <small>{entry.paragonPath ?? "Base kit"}</small>
                </div>
              </div>
              <span>{entry.className}</span>
              <span>{entry.sourceType}</span>
              <span className="oa-effect-time-list">{entry.keywords.join(", ")}</span>
              <span className="oa-effect-time-list">{entry.description}</span>
            </div>
          ))}
          {!classCatalog.length ? <div className="oa-empty-state">No known class debuff metadata was found for this player class.</div> : null}
        </div>
      </section>

      <section className="oa-panel">
        <SectionHeading icon="target" eyebrow="Damage / Debuff Overlap" title="Your hits and the debuffs active on the target" />
        <div className="oa-data-table">
          <div className="oa-data-head healing">
            <span>Attack</span>
            <span>Debuff Up</span>
            <span>Target</span>
            <span>Overlap Hits</span>
            <span>Total Damage</span>
            <span>Last Seen</span>
          </div>
          {overlapRows.map((row) => (
            <div className="oa-data-row healing" key={`${row.attackName}-${row.debuffName}-${row.targetName}`}>
              <div>
                <strong>{row.attackName}</strong>
                <small>{formatNumber(row.totalHits)} parsed hits</small>
              </div>
              <div>
                <strong>{row.debuffName}</strong>
                <small>{row.family}</small>
              </div>
              <span>{row.targetName}</span>
              <span>{formatNumber(row.overlapHits)}</span>
              <span className="oa-right-stat"><strong>{formatShort(row.totalDamage)}</strong></span>
              <span>{row.lastSeenSecond}s</span>
            </div>
          ))}
          {!overlapRows.length ? (
            <div className="oa-empty-state">
              No combat-log debuff overlap was detected for this player yet. This view only populates when debuff lines and damage activations both exist in the log.
            </div>
          ) : null}
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

function buildArtifactDamageRows(player: PlayerRow) {
  return player.artifactActivations
    .map((activation) => {
      const durationSec = Math.max(1, activation.durationSec || 20);
      const windowEnd = activation.second + durationSec;
      const damageWindow = player.damageMoments.filter(
        (moment) => moment.second >= activation.second && moment.second < windowEnd
      );
      const totalDamage = damageWindow.reduce((sum, moment) => sum + moment.amount, 0);
      const critHits = damageWindow.filter((moment) => moment.critical).length;
      const strongestHit = damageWindow.reduce(
        (best, moment) => (moment.amount > best.amount ? moment : best),
        { abilityName: "None", amount: 0, targetName: undefined as string | undefined }
      );

      return {
        artifactName: activation.abilityName,
        activatedAt: activation.second,
        durationSec,
        totalDamage,
        dps: totalDamage / durationSec,
        hitCount: damageWindow.length,
        critHits,
        strongestHit
      };
    })
    .sort((left, right) => right.totalDamage - left.totalDamage);
}

function buildPowerDrilldown(player: PlayerRow, abilityName: string): DrilldownDetail {
  const skills = player.topSkills.filter((skill) => skill.abilityName === abilityName);
  const totalDamage = skills
    .filter((skill) => skill.kind === "damage")
    .reduce((sum, skill) => sum + skill.total, 0);
  const totalHealing = skills
    .filter((skill) => skill.kind === "heal")
    .reduce((sum, skill) => sum + skill.total, 0);
  const hits = skills.reduce((sum, skill) => sum + skill.hits, 0);
  const critCount = skills.reduce((sum, skill) => sum + skill.critCount, 0);
  const flankCount = skills.reduce((sum, skill) => sum + skill.flankCount, 0);
  const moments = player.damageMoments.filter((moment) => moment.abilityName === abilityName);
  const targetTotals = new Map<string, number>();

  for (const moment of moments) {
    const target = moment.targetName ?? "Unknown target";
    targetTotals.set(target, (targetTotals.get(target) ?? 0) + moment.amount);
  }

  const events = Array.from(targetTotals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([target, amount]) => ({
      title: target,
      subtitle: "Damage dealt to this target",
      metric: formatShort(amount)
    }));

  return {
    kind: "power",
    title: abilityName,
    subtitle: "Comprehensive power breakdown from parsed combat-log hits and totals.",
    rows: [
      { label: "Damage", value: formatShort(totalDamage) },
      { label: "Healing", value: formatShort(totalHealing) },
      { label: "Hits", value: formatNumber(hits) },
      { label: "Crit Rate", value: formatPercent(hits ? critCount / hits : 0) },
      { label: "CA Rate", value: formatPercent(hits ? flankCount / hits : 0) },
      { label: "Largest Hit", value: formatShort(Math.max(0, ...moments.map((moment) => moment.amount))) }
    ],
    timeline: player.timeline,
    events
  };
}

function buildTargetDrilldown(player: PlayerRow, target: TargetStat): DrilldownDetail {
  const moments = player.damageMoments.filter((moment) => moment.targetName === target.targetName);
  const powers = new Map<string, number>();

  for (const moment of moments) {
    powers.set(moment.abilityName, (powers.get(moment.abilityName) ?? 0) + moment.amount);
  }

  const events = Array.from(powers.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([abilityName, amount]) => ({
      title: abilityName,
      subtitle: "Damage dealt with this power",
      metric: formatShort(amount)
    }));

  return {
    kind: "target",
    title: target.targetName,
    subtitle: "All parsed outgoing damage against this target.",
    rows: [
      { label: "Total Damage", value: formatShort(target.totalDamage) },
      { label: "Hits", value: formatNumber(target.hits) },
      { label: "Crits", value: formatNumber(target.critCount) },
      {
        label: "Crit Rate",
        value: formatPercent(target.hits ? target.critCount / target.hits : 0)
      }
    ],
    events
  };
}

function buildHighestHitDrilldown(player: PlayerRow, row: ReturnType<typeof buildHighestHitRows>[number]): DrilldownDetail {
  const related = player.damageMoments
    .filter((moment) => moment.abilityName === row.abilityName)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 12);

  return {
    kind: "hit",
    title: row.abilityName,
    subtitle: "Peak-hit detail and nearby hits for this specific damage source.",
    rows: [
      { label: "Peak Hit", value: formatShort(row.amount) },
      { label: "Target", value: row.targetName ?? "Unknown target" },
      { label: "Occurred At", value: `${row.second}s` },
      { label: "Critical", value: row.critical ? "Yes" : "No" },
      { label: "Family", value: row.family },
      { label: "Power Type", value: row.powerType }
    ],
    events: related.map((moment) => ({
      title: `${moment.targetName ?? "Unknown target"} • ${moment.second}s`,
      subtitle: moment.critical ? "Critical hit" : "Normal hit",
      metric: formatShort(moment.amount)
    }))
  };
}

function buildArtifactDrilldown(player: PlayerRow, row: ReturnType<typeof buildArtifactDamageRows>[number]): DrilldownDetail {
  const windowEnd = row.activatedAt + row.durationSec;
  const moments = player.damageMoments
    .filter((moment) => moment.second >= row.activatedAt && moment.second < windowEnd)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 12);

  return {
    kind: "artifact",
    title: row.artifactName,
    subtitle: "Damage window immediately following artifact activation.",
    rows: [
      { label: "Activated At", value: `${row.activatedAt}s` },
      { label: "Window", value: `${row.durationSec}s` },
      { label: "Total Damage", value: formatShort(row.totalDamage) },
      { label: "Window DPS", value: formatShort(row.dps) },
      { label: "Hits", value: formatNumber(row.hitCount) },
      { label: "Crits", value: formatNumber(row.critHits) }
    ],
    events: moments.map((moment) => ({
      title: `${moment.abilityName} • ${moment.second}s`,
      subtitle: moment.targetName ?? "Unknown target",
      metric: formatShort(moment.amount)
    }))
  };
}

function PlayerArtifactDamageTab({ player, onOpenDetail }: { player: PlayerRow; onOpenDetail: (detail: DrilldownDetail) => void; }) {
  const rows = buildArtifactDamageRows(player);

  return (
    <div className="oa-tab-layout">
      <div className="oa-card-grid three">
        <StatCard label="Artifact Uses" value={formatNumber(rows.length)} icon="diamond" tone="secondary" />
        <StatCard
          label="Best 20s Window"
          value={formatShort(rows[0]?.totalDamage ?? 0)}
          tone="primary"
          icon="bolt"
          hint={rows[0] ? `${rows[0].artifactName} at ${rows[0].activatedAt}s` : "No artifact use detected"}
        />
        <StatCard
          label="Avg 20s Burst"
          value={formatShort(rows.length ? rows.reduce((sum, row) => sum + row.totalDamage, 0) / rows.length : 0)}
          icon="trending_up"
          hint="Damage dealt in the artifact window after each activation"
        />
      </div>

      <section className="oa-panel">
        <SectionHeading icon="diamond" eyebrow="Artifact Damage" title="Damage done after artifact activation" />
        <div className="oa-data-table">
          <div className="oa-data-head healing">
            <span>Artifact</span>
            <span>Activated</span>
            <span>Window</span>
            <span>20s Damage</span>
            <span>20s DPS</span>
            <span>Hits / Crits</span>
            <span>Strongest Hit</span>
          </div>
          {rows.map((row) => (
            <button className="oa-data-row healing oa-clickable-row" key={`${row.artifactName}-${row.activatedAt}`} onClick={() => onOpenDetail(buildArtifactDrilldown(player, row))}>
              <div className="oa-power-cell">
                <div className="oa-power-icon">
                  <PowerVisual powerName={row.artifactName} fallback={row.artifactName.slice(0, 2).toUpperCase()} />
                </div>
                <div>
                  <strong>{row.artifactName}</strong>
                  <small>20 second damage window after use</small>
                </div>
              </div>
              <span>{row.activatedAt}s</span>
              <span>{row.durationSec}s</span>
              <span className="oa-right-stat"><strong>{formatShort(row.totalDamage)}</strong></span>
              <span>{formatShort(row.dps)}</span>
              <span>{formatNumber(row.hitCount)} / {formatNumber(row.critHits)}</span>
              <span className="oa-right-stat">
                <strong>{formatShort(row.strongestHit.amount)}</strong>
                <small>{row.strongestHit.abilityName}</small>
              </span>
            </button>
          ))}
          {!rows.length ? (
            <div className="oa-empty-state">
              No artifact activation windows were detected for this player in the current combat log.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DetailDrawer({
  detail,
  onClose
}: {
  detail: DrilldownDetail;
  onClose: () => void;
}) {
  return (
    <aside className="oa-overlay oa-detail-drawer">
      <div className="oa-detail-drawer-head">
        <div>
          <p className="oa-eyebrow">{detail.kind}</p>
          <h3>{detail.title}</h3>
          <p className="oa-panel-description">{detail.subtitle}</p>
        </div>
        <button className="oa-icon-button" onClick={onClose} title="Close detail view">
          <Icon name="close" />
        </button>
      </div>
      <div className="oa-card-grid three">
        {detail.rows.map((row) => (
          <StatCard key={`${detail.title}-${row.label}`} label={row.label} value={row.value} />
        ))}
      </div>
      {detail.timeline?.length ? (
        <section className="oa-panel">
          <SectionHeading icon="show_chart" eyebrow="Timeline" title="Timeline for this detail" />
          <TimelineChart points={detail.timeline} mode="damage" />
        </section>
      ) : null}
      <section className="oa-panel">
        <SectionHeading icon="list" eyebrow="Breakdown" title="Detailed event and target breakdown" />
        <div className="oa-list-panel">
          {detail.events.length ? (
            detail.events.map((event) => (
              <div className="oa-list-row" key={`${detail.title}-${event.title}-${event.metric}`}>
                <div>
                  <strong>{event.title}</strong>
                  <small>{event.subtitle}</small>
                </div>
                <div className="oa-list-metric">
                  <strong>{event.metric}</strong>
                </div>
              </div>
            ))
          ) : (
            <div className="oa-empty-state">No further breakdown is available for this row yet.</div>
          )}
        </div>
      </section>
    </aside>
  );
}

function PlayerView({
  props,
  searchQuery
}: {
  props: ShellProps;
  searchQuery: string;
}) {
  const [detail, setDetail] = useState<DrilldownDetail | null>(null);
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
          <div className="oa-portrait">
            <ClassAvatar className={player.className} fallback={initialsFromName(player.displayName)} />
          </div>
          <div>
            <div className="oa-player-title-row">
              <h1>{player.displayName}</h1>
              <span className="oa-badge">{player.className ?? "Unknown"}{player.paragon ? ` / ${player.paragon}` : ""}</span>
            </div>
            <p>Combat log focus: {player.topSkills[0]?.abilityName ?? "No parsed power events"}</p>
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

      <section className="oa-panel oa-description-panel">
        <SectionHeading icon="info" eyebrow="Detail View" title={DETAIL_TABS.find((tab) => tab.id === props.detailTab)?.label ?? "Player detail"} />
        <p className="oa-panel-description">{DETAIL_TAB_COPY[props.detailTab]}</p>
      </section>

      {props.detailTab === "overview" ? (
        <PlayerOverviewTab player={player} encounter={encounter} allEncounters={props.availableEncounters} onOpenDetail={setDetail} />
      ) : null}
      {props.detailTab === "timeline" ? <PlayerTimelineTab player={player} encounter={encounter} /> : null}
      {props.detailTab === "damageOut" ? (
        <PlayerDamageTab player={player} encounter={encounter} allEncounters={props.availableEncounters} searchQuery={searchQuery} onOpenDetail={setDetail} />
      ) : null}
      {props.detailTab === "healing" ? <PlayerHealingTab player={player} onOpenDetail={setDetail} /> : null}
      {props.detailTab === "damageTaken" ? <PlayerDamageTakenTab player={player} encounters={props.availableEncounters} onOpenDetail={setDetail} /> : null}
      {props.detailTab === "timing" ? <PlayerTimingTab player={player} encounter={encounter} /> : null}
      {props.detailTab === "positioning" ? <PlayerPositioningTab player={player} /> : null}
      {props.detailTab === "other" ? <PlayerOtherTab player={player} /> : null}
      {props.detailTab === "highestHit" ? <PlayerHighestHitTab player={player} onOpenDetail={setDetail} /> : null}
      {props.detailTab === "debuffs" ? <PlayerDebuffsTab player={player} /> : null}
      {props.detailTab === "deaths" ? <PlayerDeathsTab player={player} state={props.state} /> : null}
      {props.detailTab === "artifactDamage" ? <PlayerArtifactDamageTab player={player} onOpenDetail={setDetail} /> : null}
      {detail ? <DetailDrawer detail={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  );
}

function RecentView({ state }: { state: AppState }) {
  return (
    <section className="oa-screen">
      <header className="oa-screen-hero">
        <p className="oa-page-kicker">Encounter Archive</p>
        <h1>Completed engagements</h1>
        <p>Encounter summaries parsed from the current combat log session for post-run review.</p>
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

function ErrorDumpPanel({ logDirectory }: { logDirectory: string }) {
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [selectedLogName, setSelectedLogName] = useState<string>("");
  const [selectedLogContent, setSelectedLogContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const api = window.neverwinterApi;
    if (!api) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    void api.listLogs().then((entries) => {
      if (cancelled) {
        return;
      }
      setLogs(entries);
      const nextSelected = entries[0]?.name ?? "";
      setSelectedLogName((current) =>
        current && entries.some((entry) => entry.name === current)
          ? current
          : nextSelected
      );
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [logDirectory]);

  useEffect(() => {
    const api = window.neverwinterApi;
    if (!api || !selectedLogName) {
      setSelectedLogContent("");
      return;
    }

    let cancelled = false;
    void api.readLog(selectedLogName).then((content) => {
      if (!cancelled) {
        setSelectedLogContent(content);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedLogName]);

  return (
    <section className="oa-panel">
      <SectionHeading
        icon="inventory_2"
        eyebrow="Error Dump Collector"
        title="Saved runtime logs"
        actions={<span className="oa-pill">{formatNumber(logs.length)} files</span>}
      />
      <div className="oa-kv-list">
        <div><span>Directory</span><strong>{logDirectory || "Unavailable"}</strong></div>
        <div><span>Status</span><strong>{loading ? "Refreshing" : "Ready"}</strong></div>
      </div>
      <div className="oa-split-grid">
        <div className="oa-event-list compact">
          {logs.map((entry) => (
            <button
              key={entry.name}
              className={`oa-search-result ${selectedLogName === entry.name ? "active" : ""}`}
              onClick={() => setSelectedLogName(entry.name)}
            >
              <span>
                <strong>{entry.name}</strong>
                <small>{formatNumber(entry.sizeBytes)} bytes • {new Date(entry.updatedAt).toLocaleString()}</small>
              </span>
            </button>
          ))}
          {!logs.length ? (
            <div className="oa-empty-state">No saved error logs yet.</div>
          ) : null}
        </div>
        <pre className="oa-terminal">{selectedLogContent || "[idle] Select a log file to inspect its contents."}</pre>
      </div>
    </section>
  );
}

function DebugView({ state, errorLogDirectory }: { state: AppState; errorLogDirectory: string }) {
  const auxiliarySummary = state.debug.auxiliarySummary;

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
      <section className="oa-panel">
        <SectionHeading
          icon="notifications_active"
          eyebrow="Auxiliary GameClient Logs"
          title={`${state.debug.auxiliaryEvents.length} non-combat events`}
        />
        <div className="oa-card-grid four">
          <StatCard
            label="Tracked Events"
            value={formatNumber(auxiliarySummary.totalEvents)}
            tone="secondary"
            icon="network_node"
            caption="All parsed non-combat GameClient signals"
          />
          <StatCard
            label="System Notices"
            value={formatNumber(auxiliarySummary.countsByCategory.system)}
            tone="primary"
            icon="campaign"
            caption="Joined, left, and system notify events"
          />
          <StatCard
            label="Errors"
            value={formatNumber(auxiliarySummary.countsByCategory.error)}
            tone="danger"
            icon="error"
            caption="Crash, failure, and error lines"
          />
          <StatCard
            label="Active Channels"
            value={formatNumber(auxiliarySummary.activeChannels.length)}
            tone="tertiary"
            icon="forum"
            caption={
              auxiliarySummary.activeChannels.length
                ? auxiliarySummary.activeChannels.join(", ")
                : "No joined channels detected"
            }
          />
        </div>
        <div className="oa-chip-row" style={{ marginBottom: 16 }}>
          {auxiliarySummary.activeChannels.map((channel) => (
            <span className="oa-chip" key={channel}>
              {channel}
            </span>
          ))}
          {!auxiliarySummary.activeChannels.length ? (
            <span className="oa-chip muted">No channel state detected yet</span>
          ) : null}
        </div>
        <div className="oa-event-list">
          {state.debug.auxiliaryEvents.slice(0, 24).map((event, index) => (
            <article className="oa-event-card" key={`${event.filePath}-${event.seenAt}-${index}`}>
              <div className={`oa-event-accent ${event.category === "error" ? "tone-error" : "tone-secondary"}`} />
              <div>
                <strong>{event.title}</strong>
                <small>{new Date(event.seenAt).toLocaleTimeString()} | {event.fileName} | {event.kind}</small>
                <p>{event.text}</p>
              </div>
            </article>
          ))}
          {!state.debug.auxiliaryEvents.length ? (
            <div className="oa-empty-state">No auxiliary GameClient events have been captured yet.</div>
          ) : null}
        </div>
      </section>
      <ErrorDumpPanel logDirectory={errorLogDirectory} />
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
            <div className="oa-settings-avatar">
              <ClassAvatar className={selectedPlayer?.className} fallback={initialsFromName(selectedPlayer?.displayName ?? "No player")} />
            </div>
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
                <small>Remember parser setup and arm the live session immediately after launch</small>
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
                <small>Play a local cue when encounters begin or parser faults appear</small>
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
            <div className="oa-setting-row">
              <div>
                <strong>Render Cadence</strong>
                <small>Coalesce renderer updates to a 60 Hz or 120 Hz target to keep live telemetry smooth</small>
              </div>
              <div className="oa-button-pair">
                <button
                  className={`oa-pill-button ${settings.targetFps === 60 ? "active" : ""}`}
                  onClick={() => onSettingsChange({ ...settings, targetFps: 60 })}
                >
                  60 FPS
                </button>
                <button
                  className={`oa-pill-button ${settings.targetFps === 120 ? "active" : ""}`}
                  onClick={() => onSettingsChange({ ...settings, targetFps: 120 })}
                >
                  120 FPS
                </button>
              </div>
            </div>
            <div className="oa-setting-row">
              <div>
                <strong>Reduced Motion</strong>
                <small>Disable non-essential animation and shorten transitions for lower jitter on weaker hardware</small>
              </div>
              <button
                className={`oa-switch ${settings.reducedMotion ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ ...settings, reducedMotion: !settings.reducedMotion })}
              >
                <div />
              </button>
            </div>
            <div className="oa-setting-row">
              <div>
                <strong>Compact Data Density</strong>
                <small>Reduce row and card padding to fit more live combat information onscreen</small>
              </div>
              <button
                className={`oa-switch ${settings.compactMode ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ ...settings, compactMode: !settings.compactMode })}
              >
                <div />
              </button>
            </div>
            <div className="oa-setting-row">
              <div>
                <strong>Smooth Table Scrolling</strong>
                <small>Use native smooth scrolling for live tables and metadata lists</small>
              </div>
              <button
                className={`oa-switch ${settings.smoothTables ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ ...settings, smoothTables: !settings.smoothTables })}
              >
                <div />
              </button>
            </div>
            <div className="oa-kv-list">
              <div><span>Process CPU</span><strong>{props.state.system.processCpuPercent.toFixed(1)}%</strong></div>
              <div><span>Process Memory</span><strong>{props.state.system.processMemoryMb.toFixed(1)} MB</strong></div>
              <div><span>System RAM</span><strong>{props.state.system.systemMemoryPercent.toFixed(1)}%</strong></div>
              <div><span>App Uptime</span><strong>{formatUptime(props.state.system.uptimeSec)}</strong></div>
              <div><span>Target Render Rate</span><strong>{settings.targetFps} Hz</strong></div>
              <div><span>Motion Profile</span><strong>{settings.reducedMotion ? "Reduced" : "Full"}</strong></div>
              <div><span>Error Log Folder</span><strong>{props.errorLogDirectory || "Unavailable"}</strong></div>
            </div>
            <div className="oa-maintenance-actions">
              <button className="oa-button secondary" onClick={props.onClearRendererCache}>
                <Icon name="cleaning_services" />
                Clear Cache
              </button>
              <button className="oa-button secondary" onClick={props.onClearAppData}>
                <Icon name="delete_sweep" />
                Clear Data
              </button>
              <button className="oa-button tertiary" onClick={props.onClearLogs}>
                <Icon name="article" />
                Clear Error Logs
              </button>
            </div>
            <div className="oa-tip">
              Clear Cache resets saved UI preferences and onboarding state. Clear Data stops monitoring and removes saved app setup so the next launch starts clean.
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
    })),
    ...state.debug.auxiliaryEvents.slice(0, 4).map((event) => ({
      title: event.title,
      detail: event.text,
      time: new Date(event.seenAt).toLocaleTimeString(),
      tone: event.category === "error" ? "error" as const : "secondary" as const
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

function DiagnosticsPanel({
  state,
  liveScope,
  liveDiagnostics
}: {
  state: AppState;
  liveScope: LiveScopeMode;
  liveDiagnostics: string[];
}) {
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
        <div><span>Live Scope</span><strong>{liveScope === "encounter" ? "Current Encounter" : "Tracked Session"}</strong></div>
        <div><span>Read Offset</span><strong>{formatNumber(state.debug.currentOffset)}</strong></div>
        <div><span>Unknown Rate</span><strong>{formatPercent(unknownRate, 2)}</strong></div>
        <div><span>Process CPU</span><strong>{state.system.processCpuPercent.toFixed(1)}%</strong></div>
        <div><span>Process Memory</span><strong>{state.system.processMemoryMb.toFixed(1)} MB</strong></div>
        <div><span>System RAM</span><strong>{state.system.systemMemoryPercent.toFixed(1)}%</strong></div>
        <div><span>App Uptime</span><strong>{formatUptime(state.system.uptimeSec)}</strong></div>
      </div>
      {liveDiagnostics.length ? (
        <div className="oa-tip">
          {liveDiagnostics.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      ) : null}
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
                <span className="oa-avatar-frame">
                  <ClassAvatar className={player.className} fallback={initialsFromName(player.displayName)} />
                </span>
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
  const [compareMode, setCompareMode] = useState<"idle" | "selecting" | "active">("idle");
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [liveFocusTarget, setLiveFocusTarget] = useState("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSetupHelper, setShowSetupHelper] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_HELP_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const settings = props.rendererSettings;
  const activePlayerName = props.selectedPlayer?.displayName ?? "No player selected";
  const runtimeLabel = getRuntimeLabel(props.state);
  const sessionIndicator = getSessionIndicator(props.state);
  const sourceLabel = getSourceLabel(props.state);
  const activeEncounterLabel =
    props.state.currentEncounter?.label ??
    (props.state.watcherStatus === "watching" ? "Watching combat log" : "Idle");
  const activeFileName =
    (
      props.state.activeLogFile ??
      props.state.importedLogFile ??
      props.state.analysis.sourcePath ??
      ""
    ).split(/[\\/]/).pop() || "No combat log linked";
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
  const liveFocusOptions = useMemo(
    () => buildLiveTargetFocus(props.livePlayerRows),
    [props.livePlayerRows]
  );
  const focusFilteredLivePlayers = useMemo(() => {
    if (liveFocusTarget === "all") {
      return props.livePlayerRows;
    }

    const normalizedFocus = normalizeEntityName(liveFocusTarget);
    return props.livePlayerRows.filter((player) =>
      player.targets.some((target) => normalizeEntityName(target.targetName) === normalizedFocus)
    );
  }, [liveFocusTarget, props.livePlayerRows]);
  const filteredLivePlayers = useMemo(
    () => filterRows(focusFilteredLivePlayers),
    [focusFilteredLivePlayers, searchQuery]
  );

  useEffect(() => {
    if (liveFocusTarget !== "all" && !liveFocusOptions.some((target) => target.name === liveFocusTarget)) {
      setLiveFocusTarget("all");
    }
  }, [liveFocusOptions, liveFocusTarget]);

  const rootStyle = {
    "--oa-overlay-opacity": `${settings.overlayOpacity / 100}`,
    "--oa-motion-factor": settings.reducedMotion ? "0" : "1"
  } as CSSProperties;

  const navItems: Array<{ id: View; label: string; icon: string }> = [
    { id: "recent", label: "Encounters", icon: "history_edu" },
    { id: "library", label: "Library", icon: "menu_book" },
    { id: "debug", label: "Debug", icon: "bug_report" },
    { id: "settings", label: "Settings", icon: "settings" }
  ];

  function dismissSetupHelper() {
    setShowSetupHelper(false);
    try {
      window.localStorage.setItem(ONBOARDING_HELP_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures in preview mode.
    }
  }

  return (
    <div
      className={`obsidian-architect ${settings.visualCore} ${props.isDesktopRuntime ? "desktop-runtime" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${settings.compactMode ? "compact-mode" : ""} ${settings.reducedMotion ? "reduced-motion" : ""} ${settings.smoothTables ? "smooth-tables" : ""}`}
      style={rootStyle}
    >
      <aside className="oa-sidebar">
        <div className="oa-brand">
          <div className="oa-brand-mark">
            <Icon name="architecture" />
          </div>
          <div>
            <h2>Neverwinter</h2>
            <p>Live Parser</p>
          </div>
          <button className="oa-icon-button oa-sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)}>
            <Icon name={sidebarCollapsed ? "menu_open" : "menu"} />
          </button>
        </div>

        <nav className="oa-nav">
          <div className="oa-live-group">
            <button
              className={`oa-nav-item ${props.view === "live" || props.view === "players" ? "active" : ""}`}
              onClick={() => props.onViewChange("live")}
              title="Live"
            >
              <Icon name="sensors" />
              <span>Live</span>
              <Icon name="expand_more" className="oa-nav-expand" />
              <span className={`oa-nav-status-dot ${sessionIndicator.tone}`} />
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
                  title={tab.label}
                >
                  <span>{tab.label}</span>
                  {tab.id === "deaths" && (props.selectedPlayer?.deaths ?? 0) > 0 ? (
                    <span className="oa-death-pill">{props.selectedPlayer?.deaths}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {navItems.map((item) => (
            <button
              key={item.id}
              className={`oa-nav-item ${props.view === item.id ? "active" : ""}`}
              onClick={() => props.onViewChange(item.id)}
              title={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="oa-sidebar-footer">
        <div className="oa-sidebar-profile">
          <div className="oa-sidebar-avatar">
            <ClassAvatar className={props.selectedPlayer?.className} fallback={initialsFromName(activePlayerName)} />
          </div>
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
            <span className="oa-sidebar-status-detail">{sessionIndicator.detail}</span>
          </div>
        </div>
      </aside>

      <div className="oa-main">
        <header className="oa-topbar">
          <div className="oa-topbar-left oa-no-drag">
            {props.view === "players" ? (
              <button className="oa-back-control" onClick={props.onBackToPlayers}>
                <Icon name="arrow_back" />
                Back to Party
              </button>
            ) : (
              <div className="oa-app-title">
                <div className="oa-brand-mark compact">
                  <Icon name="architecture" />
                </div>
                <div>
                  <span className="oa-title-lock">Neverwinter Live Parser</span>
                  <small>Windows combat utility</small>
                </div>
              </div>
            )}
          </div>
          <div className="oa-titlebar-center">
            <span className="oa-session-pill">{activeEncounterLabel}</span>
            <div className="oa-session-meta">
              <span>{runtimeLabel}</span>
              <span>{sessionTimer}</span>
              <span>{activeFileName}</span>
            </div>
          </div>
          <div className="oa-topbar-right oa-no-drag">
            <div className={`oa-system-pill ${sessionIndicator.tone}`}>
              <span className="oa-system-dot" />
              <span>{sessionIndicator.label}</span>
            </div>
            <span className="oa-titlebar-file">{activeFileName}</span>
            <button className="oa-icon-button" onClick={() => props.onViewChange("setup")} title="Session setup">
              <Icon name="folder_open" />
            </button>
            <button className="oa-icon-button" onClick={props.onToggleNotifications}><Icon name="notifications" /></button>
            <button className="oa-icon-button" onClick={props.onToggleDiagnostics}><Icon name="memory" /></button>
          </div>
        </header>

        <main className="oa-main-scroll">
          {showSetupHelper ? (
            <section className="oa-panel oa-onboarding-panel">
              <div className="oa-onboarding-copy">
                <span className="oa-badge subtle">Start Here</span>
                <strong>To begin, open session setup and connect your combat log.</strong>
                <p>
                  Click the <strong>folder</strong> button in the top-right corner, then either choose your Neverwinter
                  log folder and press <strong>Start Monitoring</strong>, or select a single log file to analyze.
                </p>
              </div>
              <div className="oa-button-pair">
                <button className="oa-button primary" onClick={() => props.onViewChange("setup")}>
                  <Icon name="folder_open" />
                  Open Setup
                </button>
                <button className="oa-button secondary" onClick={dismissSetupHelper}>
                  <Icon name="close" />
                  Dismiss
                </button>
              </div>
            </section>
          ) : null}
          {props.view === "setup" ? <SetupView {...props} /> : null}
          {props.view === "live" ? (
            <LiveOverviewView
              props={props}
              filteredPlayers={filteredLivePlayers}
              liveFocusTarget={liveFocusTarget}
              liveFocusOptions={liveFocusOptions}
              onLiveFocusChange={setLiveFocusTarget}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              compareMode={compareMode}
              compareSelection={compareSelection}
              onToggleCompareSelection={() => {
                setCompareMode("selecting");
                setCompareSelection([]);
              }}
              onToggleComparePlayer={(playerId) => {
                setCompareSelection((current) =>
                  current.includes(playerId)
                    ? current.filter((entry) => entry !== playerId)
                    : [...current, playerId]
                );
              }}
              onStartCompare={() => setCompareMode("active")}
              onExitCompare={() => {
                setCompareMode("idle");
                setCompareSelection([]);
              }}
            />
          ) : null}
          {props.view === "players" ? <PlayerView props={props} searchQuery={searchQuery} /> : null}
          {props.view === "recent" ? <RecentView state={props.state} /> : null}
          {props.view === "debug" ? (
            <DebugView state={props.state} errorLogDirectory={props.errorLogDirectory} />
          ) : null}
          {props.view === "library" ? <LibraryReferenceWorkbench /> : null}
          {props.view === "settings" ? (
            <SettingsView props={props} settings={settings} onSettingsChange={props.onRendererSettingsChange} />
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
        {props.diagnosticsOpen ? (
          <DiagnosticsPanel
            state={props.state}
            liveScope={props.liveScope}
            liveDiagnostics={props.liveDiagnostics}
          />
        ) : null}
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
