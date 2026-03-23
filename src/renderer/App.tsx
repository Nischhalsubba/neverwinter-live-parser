import { useEffect, useState } from "react";
import type { AppState } from "../shared/types";

const INITIAL_STATE: AppState = {
  watcherStatus: "idle",
  selectedLogFolder: null,
  activeLogFile: null,
  encounterStatus: "idle",
  currentEncounter: null,
  recentEncounters: [],
  debug: {
    latestRawLines: [],
    unknownEvents: [],
    parseIssues: [],
    activeFilePath: null,
    currentOffset: 0
  }
};

type View = "setup" | "live" | "recent" | "debug";

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [view, setView] = useState<View>("setup");
  const [folderInput, setFolderInput] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void window.neverwinterApi.getState().then((snapshot) => {
      setState(snapshot);
      setFolderInput(snapshot.selectedLogFolder ?? "");
    });

    return window.neverwinterApi.onState((snapshot) => {
      setState(snapshot);
    });
  }, []);

  async function chooseFolder() {
    const folder = await window.neverwinterApi.selectFolder();
    if (folder) {
      setFolderInput(folder);
    }
  }

  async function startMonitoring() {
    if (!folderInput.trim()) {
      return;
    }

    setStarting(true);
    try {
      const snapshot = await window.neverwinterApi.startMonitoring({
        folderPath: folderInput.trim(),
        inactivityTimeoutMs: 10_000
      });
      setState(snapshot);
      setView("live");
    } finally {
      setStarting(false);
    }
  }

  async function stopMonitoring() {
    const snapshot = await window.neverwinterApi.stopMonitoring();
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
            Logic-first desktop monitor for local combat logs.
          </p>
        </div>
        <nav className="nav">
          {(["setup", "live", "recent", "debug"] as View[]).map((item) => (
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
          <span>Encounter</span>
          <strong>{state.encounterStatus}</strong>
        </div>
      </aside>

      <main className="content">
        {view === "setup" && (
          <section className="panel">
            <h2>Setup</h2>
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
                disabled={starting || !folderInput.trim()}
              >
                Start Monitoring
              </button>
              <button onClick={() => void stopMonitoring()}>Stop Monitoring</button>
            </div>

            <div className="details-grid">
              <article className="card">
                <span>Selected Path</span>
                <strong>{folderInput || "Not set"}</strong>
              </article>
              <article className="card">
                <span>Active File</span>
                <strong>{state.activeLogFile ?? "No combat log detected"}</strong>
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
                <strong>{current ? formatNumber(current.dps) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>Total Damage</span>
                <strong>{current ? formatNumber(current.totalDamage) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>HPS</span>
                <strong>{current ? formatNumber(current.hps) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>Total Healing</span>
                <strong>{current ? formatNumber(current.totalHealing) : "0"}</strong>
              </article>
              <article className="hero-card">
                <span>Damage Taken</span>
                <strong>{current ? formatNumber(current.damageTaken) : "0"}</strong>
              </article>
            </div>

            <article className="panel-section">
              <div className="section-header">
                <h3>Top Skills</h3>
                <span>{current?.topSkills.length ?? 0} tracked</span>
              </div>
              <div className="table">
                {(current?.topSkills ?? []).map((skill) => (
                  <div className="row" key={skill.abilityName}>
                    <span>{skill.abilityName}</span>
                    <strong>{formatNumber(skill.total)}</strong>
                  </div>
                ))}
                {!current?.topSkills.length && (
                  <div className="row empty">No parsed skills yet</div>
                )}
              </div>
            </article>
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
                  <span>{formatNumber(encounter.dps)} DPS</span>
                  <strong>{formatNumber(encounter.totalDamage)} damage</strong>
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
