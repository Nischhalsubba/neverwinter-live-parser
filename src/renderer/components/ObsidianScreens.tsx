import type { AppState, EncounterSnapshot, SkillStat, TimelinePoint } from "../../shared/types";
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
  onImportLogFile: () => void;
  onStopMonitoring: () => void;
  onToggleCompanions: () => void;
  onSelectPlayer: (playerId: string) => void;
  onSelectEncounter: (encounterId: string) => void;
  onToggleNotifications: () => void;
  onToggleDiagnostics: () => void;
  onBackToPlayers: () => void;
};

function StatCard({
  label,
  value,
  accent = "violet",
  hint
}: {
  label: string;
  value: string;
  accent?: "violet" | "cyan" | "red";
  hint?: string;
}) {
  return (
    <article className={`obs-stat-card obs-accent-${accent}`}>
      <span className="obs-card-label">{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
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
  const width = 840;
  const height = 220;
  const maxValue = Math.max(1, ...filteredPoints.map((point) => point.damage));
  const polyline = filteredPoints
    .map((point, index) => {
      const x =
        filteredPoints.length <= 1
          ? 0
          : (index / (filteredPoints.length - 1)) * width;
      const y = height - (point.damage / maxValue) * (height - 28);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section className="obs-panel">
      <div className="obs-panel-head">
        <div>
          <p className="obs-eyebrow">Timeline</p>
          <h3>Damage curve</h3>
        </div>
        <span className="obs-soft-pill">
          {encounter ? encounter.label : "All encounters"}
        </span>
      </div>
      {filteredPoints.length ? (
        <svg className="obs-chart" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id="timelineStroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#76f0ff" />
              <stop offset="100%" stopColor="#a88dff" />
            </linearGradient>
          </defs>
          <polyline
            fill="none"
            stroke="url(#timelineStroke)"
            strokeWidth="3"
            points={polyline}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <div className="obs-empty">No timeline data for this focus selection.</div>
      )}
    </section>
  );
}

function PowerTable({ skills, hits }: { skills: SkillStat[]; hits: number }) {
  const totalDamage = skills.reduce((sum, row) => sum + row.total, 0);

  return (
    <section className="obs-panel">
      <div className="obs-panel-head">
        <div>
          <p className="obs-eyebrow">Damage Powers</p>
          <h3>Power contribution</h3>
        </div>
      </div>
      <div className="obs-power-table">
        <div className="obs-power-head">
          <span>Power</span>
          <span>Hits</span>
          <span>Share</span>
          <span>Damage</span>
        </div>
        {skills.slice(0, 4).map((skill) => {
          const share = hits > 0 ? skill.hits / hits : 0;
          const damageShare = totalDamage > 0 ? skill.total / totalDamage : 0;
          const meta = getPowerMeta(skill.abilityName);

          return (
            <div className="obs-power-row" key={skill.abilityName}>
              <div className="obs-power-name">
                <div className="obs-icon-box">{skill.abilityName.slice(0, 2).toUpperCase()}</div>
                <div>
                  <strong>{skill.abilityName}</strong>
                  <small>{meta?.powertype ?? "Combat power"}</small>
                  <div className="obs-power-bar">
                    <span style={{ width: `${Math.max(8, damageShare * 100)}%` }} />
                  </div>
                </div>
              </div>
              <span>{formatNumber(skill.hits)}</span>
              <span>{(share * 100).toFixed(1)}%</span>
              <span>{formatShort(skill.total)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LiveTable({
  playerRows,
  onSelectPlayer
}: {
  playerRows: PlayerRow[];
  onSelectPlayer: (id: string) => void;
}) {
  return (
    <section className="obs-panel obs-live-table">
      <div className="obs-panel-head">
        <div>
          <p className="obs-eyebrow">Live Combat Data</p>
          <h3>Party contribution</h3>
        </div>
      </div>
      <div className="obs-table">
        <div className="obs-table-head">
          <span>Rank</span>
          <span>Player</span>
          <span>DPS</span>
          <span>Contribution</span>
        </div>
        {playerRows.slice(0, 6).map((player, index) => (
          <button className="obs-table-row" key={player.id} onClick={() => onSelectPlayer(player.id)}>
            <span className="obs-rank">{index + 1}</span>
            <span className="obs-player-cell">
              <span className="obs-avatar">{player.displayName.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{player.displayName}</strong>
                <small>
                  {player.className ?? "Unknown"}
                  {player.paragon ? ` / ${player.paragon}` : ""}
                </small>
              </span>
            </span>
            <span>{formatShort(player.dps)}</span>
            <span>{formatShort(player.totalDamage)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NotificationsPanel({ state }: { state: AppState }) {
  const latestIssues = state.debug.parseIssues.slice(-4).reverse();
  const latestLines = state.debug.latestRawLines.slice(-2).reverse();

  return (
    <aside className="obs-overlay-panel obs-notifications">
      <div className="obs-overlay-head">
        <div>
          <p className="obs-eyebrow">Tactical Notifications</p>
          <h3>Live event feed</h3>
        </div>
        <span className="obs-soft-pill">
          {latestIssues.length + latestLines.length} items
        </span>
      </div>
      <div className="obs-notification-list">
        {latestLines.map((line, index) => (
          <article className="obs-notification" key={`line-${index}`}>
            <div className="obs-note-bar obs-note-cyan" />
            <div>
              <strong>Log stream active</strong>
              <small>just now</small>
              <p>{line}</p>
            </div>
          </article>
        ))}
        {latestIssues.map((issue, index) => (
          <article className="obs-notification" key={`issue-${issue.seenAt}-${index}`}>
            <div className="obs-note-bar obs-note-red" />
            <div>
              <strong>{issue.reason}</strong>
              <small>{new Date(issue.seenAt).toLocaleTimeString()}</small>
              <p>{issue.line || "No raw line attached."}</p>
            </div>
          </article>
        ))}
        {!latestLines.length && !latestIssues.length ? (
          <div className="obs-empty">No live notifications yet.</div>
        ) : null}
      </div>
    </aside>
  );
}

function DiagnosticsPanel({ state }: { state: AppState }) {
  const unknownRate =
    state.analysis.totalLines > 0
      ? state.debug.unknownEvents.length / state.analysis.totalLines
      : 0;

  return (
    <aside className="obs-overlay-panel obs-diagnostics">
      <div className="obs-overlay-head">
        <div>
          <p className="obs-eyebrow">System Diagnostics</p>
          <h3>Parser health</h3>
        </div>
        <span className="obs-soft-pill">node_04 stable</span>
      </div>
      <div className="obs-diagnostic-list">
        <div className="obs-diagnostic-row">
          <span>Core Engine</span>
          <strong>{state.watcherStatus === "error" ? "Faulted" : "Operational"}</strong>
        </div>
        <div className="obs-diagnostic-row">
          <span>Log Latency</span>
          <strong>{state.analysis.mode === "idle" ? "--" : "<16ms"}</strong>
        </div>
        <div className="obs-diagnostic-row">
          <span>Read Offset</span>
          <strong>{formatNumber(state.debug.currentOffset)}</strong>
        </div>
        <div className="obs-diagnostic-row">
          <span>Unknown Rate</span>
          <strong>{(unknownRate * 100).toFixed(2)}%</strong>
        </div>
      </div>
    </aside>
  );
}

function SetupView(props: ShellProps) {
  const { state } = props;

  return (
    <section className="obs-page">
      <div className="obs-page-hero">
        <p className="obs-eyebrow">Configuration & Setup</p>
        <h1>Prepare the live parser</h1>
        <p>
          Bind the game log directory, validate parser health, and inspect runtime
          diagnostics before running a live session or importing an archived log.
        </p>
      </div>

      <div className="obs-setup-grid">
        <section className="obs-panel obs-setup-primary">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Log Directory Configuration</p>
              <h3>Live watch and recorded log analysis</h3>
            </div>
          </div>
          <label className="obs-field">
            <span>Combat log path</span>
            <div className="obs-inline-field">
              <input
                value={props.folderInput}
                onChange={(event) => props.onFolderInputChange(event.target.value)}
                placeholder="C:\\Games\\Neverwinter\\Live\\logs\\GameClient"
              />
              <button onClick={props.onChooseFolder}>Browse</button>
            </div>
          </label>
          <div className="obs-action-row">
            <button
              onClick={props.onStartMonitoring}
              disabled={props.starting || !props.folderInput.trim() || !props.isDesktopRuntime}
            >
              Start live monitor
            </button>
            <button className="obs-button-secondary" onClick={props.onStopMonitoring}>
              Stop session
            </button>
          </div>
          <label className="obs-field">
            <span>Archived combat log</span>
            <div className="obs-inline-field">
              <input
                value={props.importFilePath}
                onChange={(event) => props.onImportFileChange(event.target.value)}
                placeholder="C:\\Logs\\combatlog_2026-03-23.log"
              />
              <button onClick={props.onChooseImportFile}>Choose file</button>
            </div>
          </label>
          <div className="obs-action-row">
            <button
              onClick={props.onImportLogFile}
              disabled={
                props.starting || !props.importFilePath.trim() || !props.isDesktopRuntime
              }
            >
              Analyze recorded log
            </button>
          </div>
        </section>

        <section className="obs-panel">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Telemetry Environment</p>
              <h3>Runtime profile</h3>
            </div>
          </div>
          <div className="obs-kv-list">
            <div><span>Core Engine</span><strong>Obsidian-v4</strong></div>
            <div><span>Data Encoding</span><strong>UTF-8 / CRLF</strong></div>
            <div><span>Analysis Mode</span><strong>{state.analysis.mode}</strong></div>
            <div><span>Watcher</span><strong>{state.watcherStatus}</strong></div>
            <div><span>Process Affinity</span><strong>High Priority</strong></div>
          </div>
          <div className="obs-tip-box">
            Increasing buffer size improves performance during dense raid pulls but uses
            more memory. Keep the parser engine separate from UI concerns.
          </div>
        </section>

        <section className="obs-panel">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Parse Health Dashboard</p>
              <h3>Signal integrity</h3>
            </div>
          </div>
          <div className="obs-three-up">
            <StatCard
              label="Lines processed"
              value={formatNumber(state.analysis.totalLines)}
              accent="cyan"
              hint="stream throughput"
            />
            <StatCard
              label="Unknown lines"
              value={formatNumber(state.debug.unknownEvents.length)}
              accent="violet"
              hint="needs parser rules"
            />
            <StatCard
              label="Parse errors"
              value={formatNumber(state.debug.parseIssues.length)}
              accent="red"
              hint="action required"
            />
          </div>
        </section>

        <section className="obs-panel">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">System Stream</p>
              <h3>Recent engine output</h3>
            </div>
          </div>
          <div className="obs-terminal">
            {state.debug.latestRawLines.slice(-4).map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
            {!state.debug.latestRawLines.length ? (
              <div>[idle] Waiting for log stream...</div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function LiveView(props: ShellProps) {
  const { state } = props;
  const current = state.currentEncounter;
  const partyHealth = props.playerRows.length
    ? Math.max(12, 100 - props.playerRows.reduce((sum, row) => sum + row.deaths, 0) * 10)
    : 100;

  return (
    <section className="obs-page obs-live-page">
      <div className="obs-live-hero-grid">
        <section className="obs-panel obs-main-session">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Current Engagement</p>
              <h2>{current?.label ?? "Awaiting combat activity"}</h2>
            </div>
            <div className="obs-duration-block">
              <span>Duration</span>
              <strong>{current ? formatDuration(current.durationMs) : "00:00"}</strong>
            </div>
          </div>
          <div className="obs-live-stat-grid">
            <StatCard label="Total DPS" value={formatShort(current?.dps ?? 0)} accent="violet" />
            <StatCard label="HPS Output" value={formatShort(current?.hps ?? 0)} accent="cyan" />
            <StatCard
              label="Active Deaths"
              value={formatNumber(props.playerRows.reduce((sum, row) => sum + row.deaths, 0))}
              accent="red"
            />
          </div>
        </section>

        <section className="obs-panel obs-party-health-card">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Party composition</p>
              <h3>{props.playerRows.length}/{Math.max(props.playerRows.length, 6)} online</h3>
            </div>
          </div>
          <div className="obs-health-list">
            {props.playerRows.slice(0, 3).map((player) => (
              <div className="obs-health-row" key={player.id}>
                <div>
                  <strong>{player.displayName}</strong>
                  <small>{player.className ?? "Unknown build"}</small>
                </div>
                <div className="obs-health-bar">
                  <span style={{ width: `${Math.max(12, 100 - player.deaths * 12)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="obs-panel obs-small-stat-card">
          <div className="obs-card-label">Party Health</div>
          <strong>{partyHealth}%</strong>
          <div className="obs-meter">
            <span style={{ width: `${partyHealth}%` }} />
          </div>
          <small>
            Critical low: {props.playerRows.filter((row) => row.deaths > 0).length} member(s)
          </small>
        </section>

        <section className="obs-panel obs-small-stat-card obs-accent-red">
          <div className="obs-card-label">Deaths</div>
          <strong>{formatNumber(props.playerRows.reduce((sum, row) => sum + row.deaths, 0))}</strong>
          <div className="obs-segment-row">
            <span className="filled" />
            <span />
            <span />
            <span />
          </div>
          <small>
            Latest issue: {state.debug.parseIssues.at(-1)?.reason ?? "No critical failures"}
          </small>
        </section>
      </div>

      <div className="obs-live-data-grid">
        <LiveTable playerRows={props.playerRows} onSelectPlayer={props.onSelectPlayer} />
        <section className="obs-panel obs-log-panel">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Live Log Stream</p>
              <h3>Recent combat lines</h3>
            </div>
          </div>
          <div className="obs-log-list">
            {state.debug.latestRawLines.slice(-8).reverse().map((line, index) => (
              <div className="obs-log-row" key={`${line}-${index}`}>
                <span>{index === 0 ? "NOW" : `${index}s`}</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function PlayerView(props: ShellProps) {
  const selectedPlayer = props.selectedPlayer;
  const selectedEncounter = props.selectedEncounter;
  const selectedEncounterStat =
    selectedPlayer && selectedEncounter
      ? selectedPlayer.encounters.find((entry) => entry.encounterId === selectedEncounter.id) ??
        null
      : null;
  const totalHits = selectedEncounterStat?.hits ?? selectedPlayer?.hits ?? 0;
  const totalDamage = selectedEncounterStat?.totalDamage ?? selectedPlayer?.totalDamage ?? 0;
  const totalHealing = selectedEncounterStat?.totalHealing ?? selectedPlayer?.totalHealing ?? 0;
  const totalTaken = selectedEncounterStat?.damageTaken ?? selectedPlayer?.damageTaken ?? 0;
  const durationMs = selectedEncounter?.durationMs ?? props.state.analysis.durationMs;
  const dps = durationMs > 0 ? totalDamage / (durationMs / 1000) : 0;

  return (
    <section className="obs-page">
      <div className="obs-player-header">
        <div className="obs-player-heading">
          <button className="obs-back-button" onClick={props.onBackToPlayers}>
            Back to party
          </button>
          <div className="obs-player-avatar">
            {selectedPlayer?.displayName.slice(0, 2).toUpperCase() ?? "--"}
          </div>
          <div>
            <h1>{selectedPlayer?.displayName ?? "Player breakdown"}</h1>
            <p>
              {(selectedPlayer?.className ?? "Unknown class") +
                (selectedPlayer?.paragon ? ` / ${selectedPlayer.paragon}` : "")}
            </p>
          </div>
        </div>
        <div className="obs-player-header-meta">
          <div>
            <span>Encounter focus</span>
            <strong>{selectedEncounter?.label ?? "All encounters"}</strong>
          </div>
          <button onClick={props.onToggleCompanions}>
            {props.includeCompanions ? "Pets Included" : "Pets Excluded"}
          </button>
        </div>
      </div>

      <div className="obs-focus-row">
        <span className="obs-eyebrow">Focus</span>
        <button
          className={!selectedEncounter ? "obs-focus-chip active" : "obs-focus-chip"}
          onClick={() => props.onSelectEncounter("all")}
        >
          All encounters
        </button>
        {props.availableEncounters.map((encounter, index) => (
          <button
            className={
              selectedEncounter?.id === encounter.id
                ? "obs-focus-chip active"
                : "obs-focus-chip"
            }
            key={encounter.id}
            onClick={() => props.onSelectEncounter(encounter.id)}
          >
            #{index + 1} {encounter.label} ({formatDuration(encounter.durationMs)})
          </button>
        ))}
      </div>

      <div className="obs-subtab-row">
        {DETAIL_TABS.map((tab) => (
          <button
            className={props.detailTab === tab.id ? "obs-subtab active" : "obs-subtab"}
            key={tab.id}
            onClick={() => props.onDetailTabChange(tab.id)}
          >
            {tab.label}
            {tab.id === "deaths" && selectedPlayer ? (
              <span className="obs-subtab-badge">{selectedPlayer.deaths}</span>
            ) : null}
          </button>
        ))}
      </div>

      {selectedPlayer ? (
        <>
          <div className="obs-player-main-grid">
            <section className="obs-panel obs-player-stats-panel">
              <div className="obs-matrix-grid">
                <StatCard label="Combat Time" value={formatDuration(durationMs)} />
                <StatCard label="Total Hits" value={formatNumber(totalHits)} />
                <StatCard
                  label="Crit Rate"
                  value={`${(selectedPlayer.critRate * 100).toFixed(1)}%`}
                  accent="cyan"
                />
                <StatCard label="DPS" value={formatShort(dps)} accent="violet" />
                <StatCard
                  label="Flank Rate"
                  value={`${(selectedPlayer.flankRate * 100).toFixed(1)}%`}
                />
                <StatCard label="Damage Taken" value={formatShort(totalTaken)} accent="red" />
                <StatCard label="Healing" value={formatShort(totalHealing)} accent="cyan" />
                <StatCard
                  label="Build Confidence"
                  value={`${Math.round(selectedPlayer.buildConfidence * 100)}%`}
                />
              </div>
            </section>
            <section className="obs-panel obs-performance-panel">
              <div className="obs-panel-head">
                <div>
                  <p className="obs-eyebrow">Performance Snapshot</p>
                  <h3>Damage profile</h3>
                </div>
                <span className="obs-soft-pill">live compare</span>
              </div>
              <div className="obs-bar-chart">
                {selectedPlayer.topSkills.slice(0, 7).map((skill) => {
                  const max = selectedPlayer.topSkills[0]?.total ?? 1;
                  const height = Math.max(18, (skill.total / max) * 100);
                  return (
                    <div className="obs-bar-column" key={skill.abilityName}>
                      <span style={{ height: `${height}%` }} />
                      <small>{skill.abilityName.split(" ")[0]}</small>
                    </div>
                  );
                })}
              </div>
              <p className="obs-panel-footnote">
                Relative output against this player&apos;s top powers.
              </p>
            </section>
          </div>

          {props.detailTab === "overview" || props.detailTab === "damageOut" ? (
            <PowerTable skills={selectedPlayer.topSkills} hits={totalHits} />
          ) : null}

          {props.detailTab === "timeline" ? (
            <TimelineChart points={selectedPlayer.timeline} encounter={selectedEncounter} />
          ) : null}

          <div className="obs-secondary-grid">
            <section className="obs-panel">
              <div className="obs-panel-head">
                <div>
                  <p className="obs-eyebrow">
                    {props.detailTab === "damageOut" ? "Target Focus" : "Top Targets"}
                  </p>
                  <h3>Damage by mob, boss, or phase</h3>
                </div>
              </div>
              <div className="obs-mini-list">
                {selectedPlayer.targets.slice(0, 6).map((target) => (
                  <div className="obs-mini-row" key={target.targetName}>
                    <span>
                      {target.targetName}
                      {isKnownCompanion(target.targetName) ? (
                        <small className="obs-soft-pill">Companion</small>
                      ) : null}
                    </span>
                    <strong>{formatShort(target.totalDamage)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="obs-panel">
              <div className="obs-panel-head">
                <div>
                  <p className="obs-eyebrow">Encounter Focus</p>
                  <h3>Boss and phase split</h3>
                </div>
              </div>
              <div className="obs-mini-list">
                {props.availableEncounters.map((encounter) => {
                  const stat = selectedPlayer.encounters.find(
                    (entry) => entry.encounterId === encounter.id
                  );
                  return (
                    <div className="obs-mini-row" key={encounter.id}>
                      <span>{encounter.label}</span>
                      <strong>{formatShort(stat?.totalDamage ?? 0)}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="obs-panel">
              <div className="obs-panel-head">
                <div>
                  <p className="obs-eyebrow">Combat Signals</p>
                  <h3>Parser-supported detail</h3>
                </div>
              </div>
              <div className="obs-mini-list">
                <div className="obs-mini-row">
                  <span>Deaths</span>
                  <strong>{formatNumber(selectedPlayer.deaths)}</strong>
                </div>
                <div className="obs-mini-row">
                  <span>Companions tracked</span>
                  <strong>{formatNumber(selectedPlayer.companionCount)}</strong>
                </div>
                <div className="obs-mini-row">
                  <span>Timeline buckets</span>
                  <strong>{formatNumber(selectedPlayer.timeline.length)}</strong>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="obs-empty">Select a player to inspect the detailed Figma breakdown view.</div>
      )}
    </section>
  );
}

function RecentView({ state }: { state: AppState }) {
  return (
    <section className="obs-page">
      <div className="obs-page-hero">
        <p className="obs-eyebrow">Encounter Archive</p>
        <h1>Completed engagements</h1>
        <p>Recent fights are kept in memory so you can review timings and damage totals.</p>
      </div>
      <section className="obs-panel">
        <div className="obs-table">
          <div className="obs-table-head">
            <span>Encounter</span>
            <span>Duration</span>
            <span>DPS</span>
            <span>Damage</span>
          </div>
          {state.recentEncounters.map((encounter) => (
            <div className="obs-table-row static" key={encounter.id}>
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
    <section className="obs-page">
      <div className="obs-page-hero">
        <p className="obs-eyebrow">Debug</p>
        <h1>Engine visibility</h1>
        <p>Raw lines and parser issues stay visible here while the engine evolves.</p>
      </div>
      <div className="obs-debug-grid">
        <section className="obs-panel">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Latest Raw Lines</p>
              <h3>{state.debug.latestRawLines.length} buffered</h3>
            </div>
          </div>
          <pre className="obs-terminal">{state.debug.latestRawLines.join("\n")}</pre>
        </section>
        <section className="obs-panel">
          <div className="obs-panel-head">
            <div>
              <p className="obs-eyebrow">Parse Issues</p>
              <h3>{state.debug.parseIssues.length} tracked</h3>
            </div>
          </div>
          <div className="obs-issue-list">
            {state.debug.parseIssues.slice(-12).reverse().map((issue, index) => (
              <article className="obs-issue-card" key={`${issue.seenAt}-${index}`}>
                <strong>{issue.reason}</strong>
                <p>{issue.line}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export function ObsidianScreens(props: ShellProps) {
  return (
    <div className="obsidian-app">
      <aside className="obs-sidebar">
        <div className="obs-brand">
          <div className="obs-brand-mark">O</div>
          <div>
            <strong>OBSIDIAN</strong>
            <span>Combat Parser v1.0</span>
          </div>
        </div>

        <nav className="obs-nav">
          <button
            className={props.view === "setup" ? "obs-nav-item active" : "obs-nav-item"}
            onClick={() => props.onViewChange("setup")}
          >
            Setup
          </button>
          <div className="obs-nav-group">
            <button
              className={
                props.view === "live" || props.view === "players"
                  ? "obs-nav-item active"
                  : "obs-nav-item"
              }
              onClick={() => props.onViewChange("live")}
            >
              Live
            </button>
            <div className="obs-nav-subitems">
              {DETAIL_TABS.map((tab) => (
                <button
                  className={
                    props.view === "players" && props.detailTab === tab.id
                      ? "obs-nav-subitem active"
                      : "obs-nav-subitem"
                  }
                  key={tab.id}
                  onClick={() => {
                    props.onViewChange("players");
                    props.onDetailTabChange(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className={props.view === "recent" ? "obs-nav-item active" : "obs-nav-item"}
            onClick={() => props.onViewChange("recent")}
          >
            Encounters
          </button>
          <button
            className={props.view === "debug" ? "obs-nav-item active" : "obs-nav-item"}
            onClick={() => props.onViewChange("debug")}
          >
            Debug
          </button>
        </nav>

        <div className="obs-sidebar-footer">
          <button className="obs-session-button" onClick={() => props.onViewChange("setup")}>
            New log session
          </button>
          <div className="obs-engine-ready">
            <span className="obs-status-dot" />
            <span>Engine Ready</span>
          </div>
        </div>
      </aside>

      <div className="obs-main">
        <header className="obs-topbar">
          <div className="obs-topbar-title">
            {props.view === "players" ? "PLAYER DAMAGE BREAKDOWN" : "NEVERWINTER LIVE PARSER"}
          </div>
          <div className="obs-topbar-actions">
            <div className="obs-search-box">Search logs...</div>
            <button className="obs-icon-button" onClick={props.onToggleNotifications}>
              Notifications
            </button>
            <button className="obs-icon-button" onClick={props.onToggleDiagnostics}>
              System
            </button>
            <button className="obs-avatar-button">VA</button>
          </div>
        </header>

        <main className="obs-main-scroll">
          {props.view === "setup" ? <SetupView {...props} /> : null}
          {props.view === "live" ? <LiveView {...props} /> : null}
          {props.view === "players" ? <PlayerView {...props} /> : null}
          {props.view === "recent" ? <RecentView state={props.state} /> : null}
          {props.view === "debug" ? <DebugView state={props.state} /> : null}
        </main>

        {!props.isDesktopRuntime ? (
          <div className="obs-runtime-banner">
            Browser preview only. Live monitoring and file import require the Electron desktop app.
          </div>
        ) : null}

        <div className="obs-floating-status">
          <span className="obs-status-dot" />
          <span>{props.state.analysis.mode === "idle" ? "Idle" : "Live"}</span>
          <strong>{formatShort(props.state.analysis.parsedEvents)} events</strong>
        </div>

        {props.notificationsOpen ? <NotificationsPanel state={props.state} /> : null}
        {props.diagnosticsOpen ? <DiagnosticsPanel state={props.state} /> : null}
      </div>
    </div>
  );
}
