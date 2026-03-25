# Project Change Ledger

This file is the permanent engineering memory for this repository.

What this file is for:
- record what changed
- record which files changed
- record why the change was made
- reduce repeated bug-fixing and repeated architecture mistakes
- preserve context when future tasks touch startup, tracking, parser logic, performance, or UI

This file should not be written as “git commit summaries only”.
It should be written as:
- change set title
- files touched
- what changed in those files
- why the change happened

## Required maintenance rule

From now on, every time any code, style, copy, config, test, script, or docs change is made, this file must be updated in the same turn.

That includes:
- major architecture changes
- minor UI changes
- wording changes
- tooltip changes
- spacing changes
- startup fixes
- test additions
- one-line bug fixes

For future updates, use this format:

### YYYY-MM-DD - Change Set Title
- Files touched:
  - `path`
  - `path`
- What changed:
  - ...
- Why:
  - ...
- Verification:
  - ...

## Historical ledger

This section records the change history from:
- start: `928768dc0f589f3714b31a453d1c0044ceaa740e`
- end: `a2010102553361ae2bbcaf7b8ba7c10f7684711b`

The historical section is reconstructed from repository history. For old work, the most reliable file-by-file source is Git, so the entries below use “change set” sections derived from that history.

---

### 2026-03-23 - Initial scaffold
- Files touched:
  - `.gitignore`
  - `index.html`
  - `package-lock.json`
  - `package.json`
  - `src/core/aggregation/encounterAggregator.test.ts`
  - `src/core/aggregation/encounterAggregator.ts`
  - `src/core/encounter/encounterManager.test.ts`
  - `src/core/encounter/encounterManager.ts`
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/parser/parseLine.test.ts`
  - `src/core/parser/parseLine.ts`
  - `src/core/reader/incrementalReader.ts`
  - `src/core/reader/lineBuffer.test.ts`
  - `src/core/reader/lineBuffer.ts`
  - `src/core/watcher/detectActiveLog.ts`
  - `src/main/main.ts`
  - `src/main/preload.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/globals.d.ts`
  - `src/renderer/main.tsx`
  - `src/renderer/styles.css`
  - `src/shared/types.ts`
  - `tsconfig.electron.json`
  - `tsconfig.json`
  - `vite.config.ts`
- What changed:
  - Set up the base Electron + React app.
  - Added the initial monitoring engine, parser, incremental reader, encounter manager, and aggregation layer.
  - Added the first minimal renderer shell and shared app state model.
  - Added initial tests for parser, reader, and encounter aggregation.
- Why:
  - The project needed a working Windows-only parser foundation with clear separation between main process, parser engine, and renderer.

### 2026-03-23 - Browser-safe fallback for web deployments
- Files touched:
  - `src/renderer/App.tsx`
  - `src/renderer/globals.d.ts`
  - `src/renderer/styles.css`
  - `vite.config.ts`
- What changed:
  - Guarded Electron-only APIs in the renderer.
  - Added a desktop-only runtime notice in the UI.
  - Adjusted Vitest/Vite behavior so browser-only deployments did not break local assumptions.
- Why:
  - The renderer had to avoid crashing when Electron APIs were unavailable outside the desktop runtime.

### 2026-03-23 - Real Neverwinter CSV parser and offline import
- Files touched:
  - `src/core/aggregation/combatantTracker.ts`
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/parser/parseLine.test.ts`
  - `src/core/parser/parseLine.ts`
  - `src/main/main.ts`
  - `src/main/preload.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/globals.d.ts`
  - `src/renderer/styles.css`
  - `src/shared/types.ts`
- What changed:
  - Reworked the parser around real Neverwinter combat-log line structure.
  - Added offline `.log` import support.
  - Added party-summary tracking with companion roll-up logic.
  - Updated shared types and UI state to support imported analysis.
- Why:
  - The original scaffold needed to support real logs, not placeholder assumptions.

### 2026-03-23 - Tabbed player detail analysis
- Files touched:
  - `src/core/aggregation/combatantTracker.ts`
  - `src/core/aggregation/encounterAggregator.ts`
  - `src/core/encounter/encounterManager.ts`
  - `src/core/monitoring/logMonitorService.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/styles.css`
  - `src/shared/types.ts`
- What changed:
  - Added per-player analysis tabs.
  - Added encounter focus chips, timeline support, target breakdowns, and phase-oriented data.
  - Extended backend tracking so the renderer could show those breakdowns.
- Why:
  - A flat summary was not enough; users needed per-player drill-down views backed by encounter-aware data.

### 2026-03-23 - Neverwinter class and power metadata integration
- Files touched:
  - `src/renderer/App.tsx`
  - `src/renderer/nwMetadata.ts`
  - `src/renderer/styles.css`
  - `src/shared/data/nw-metadata.json`
- What changed:
  - Added extracted Neverwinter metadata from NWCharBuilderPlus.
  - Created metadata lookup helpers.
  - Enriched the UI with inferred class, paragon, and power labels.
- Why:
  - Combat log names alone were not enough to give meaningful class-aware context in the UI.

### 2026-03-23 - Obsidian shell renderer rebuild
- Files touched:
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Rebuilt the renderer around a Figma/Obsidian shell.
  - Added setup screen, live dashboard, notifications overlay, diagnostics overlay, and player breakdown views.
  - Extracted analysis view-model helpers out of raw JSX.
- Why:
  - The renderer needed a stronger structural shell and clearer separation between data shaping and presentation.

### 2026-03-23 - Stitch-based design system pass
- Files touched:
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Replaced the previous renderer look with a stitch-derived Obsidian design system.
  - Added fuller library and settings surfaces.
  - Reworked components and styling around consistent tokens, overlays, and layouts.
- Why:
  - The earlier UI pass still needed a more coherent design system and complete app-shell treatment.

### 2026-03-23 - Runtime telemetry integration
- Files touched:
  - `src/core/monitoring/logMonitorService.ts`
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/shared/types.ts`
- What changed:
  - Added real process/system CPU, memory, and uptime telemetry.
  - Stored telemetry in shared state and surfaced it throughout the renderer.
- Why:
  - The app was showing fake runtime metrics and needed real operational visibility.

### 2026-03-23 - Parser correctness improvements for companions and values
- Files touched:
  - `src/core/parser/parseLine.test.ts`
  - `src/core/parser/parseLine.ts`
  - `src/renderer/analysisViewModel.ts`
- What changed:
  - Improved summon ownership handling.
  - Resolved combat values using the better numeric field.
  - Added tests for summon, companion, heal, and comma-delimited target cases.
- Why:
  - Early real-log testing showed wrong ownership and amount extraction in common lines.

### 2026-03-23 - Latest-log detection and live file workflow
- Files touched:
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/watcher/detectActiveLog.test.ts`
  - `src/core/watcher/detectActiveLog.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/shared/types.ts`
- What changed:
  - Added timestamp-based latest combat-log detection.
  - Added live monitoring from a selected file path.
  - Added rollover to newer combat logs in the same folder.
- Why:
  - Users needed a reliable way to track the newest active log rather than picking a single stale file manually.

### 2026-03-23 - Setup running state and session indicator cleanup
- Files touched:
  - `src/core/monitoring/logMonitorService.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.test.ts`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Added running spinner behavior in setup.
  - Fixed start/stop enablement.
  - Replaced a floating event counter with live/old-log/idle session status.
- Why:
  - The setup flow and session state display were unclear and easy to misread.

### 2026-03-23 - Recharts integration for combat graphs
- Files touched:
  - `package-lock.json`
  - `package.json`
  - `src/core/aggregation/combatantTracker.ts`
  - `src/core/aggregation/encounterAggregator.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
  - `src/shared/types.ts`
- What changed:
  - Added Recharts dependency.
  - Replaced graph placeholders with real combat-log-backed charts.
  - Extended aggregated data to support those graphs.
- Why:
  - The app needed proper charting for combat trends and analysis views.

### 2026-03-23 - Live target focus chips
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Added target-focus chips based on real hostile targets from the combat log.
  - Improved live/old-log/idle status visibility and shell copy.
- Why:
  - Users needed faster live target context while tracking current combat.

### 2026-03-24 - Collapsible sidebar and richer focus details
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Added a functional collapsible sidebar.
  - Expanded focus chips into target tables and pie-chart views.
  - Added per-tab descriptive panels.
- Why:
  - The shell needed better navigation density and more meaningful live focus presentation.

### 2026-03-24 - False parser error reduction
- Files touched:
  - `src/core/parser/parseLine.test.ts`
  - `src/core/parser/parseLine.ts`
- What changed:
  - Reclassified noisy Neverwinter display, trigger, and negative power lines.
  - Added tests for those noisy patterns.
- Why:
  - The parser was surfacing too many false errors and misclassifying harmless lines.

### 2026-03-24 - NW Hub artifact extraction and integration
- Files touched:
  - `scripts/extract-nw-hub-artifacts.mjs`
  - `scripts/extract-nw-hub-classes.mjs`
  - `src/core/aggregation/combatantTracker.ts`
  - `src/core/parser/parseLine.test.ts`
  - `src/core/parser/parseLine.ts`
  - `src/renderer/analysisViewModel.test.ts`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/nwMetadata.ts`
  - `src/renderer/styles.css`
  - `src/shared/data/nw-hub-artifacts.json`
  - `src/shared/data/nw-hub-classes.json`
  - `src/shared/nwHubArtifacts.ts`
  - `src/shared/types.ts`
  - `package.json`
  - generated static assets under:
    - `public/nw-hub/artifacts/*`
    - `public/nw-hub/classes/emblems/*`
    - `public/nw-hub/powers/*`
  - generated temp or extraction artifacts:
    - `chunk-*.js`
    - `main-*.js`
    - `polyfills-*.js`
    - `styles-*.css`
    - `tmp_nwhub_classes.html`
- What changed:
  - Extracted artifact metadata and icons from NW Hub.
  - Added shared lookup helpers.
  - Enriched parser events with artifact effect tags.
  - Added artifact and class/power visuals to the UI.
- Why:
  - Artifact and power data needed richer metadata and visuals to support better parsing and presentation.

### 2026-03-24 - Live parser performance pass
- Files touched:
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/parser/parseLine.test.ts`
  - `src/core/parser/parseLine.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.ts`
  - `vite.config.ts`
- What changed:
  - Batched analysis rebuilds and state emission.
  - Improved numeric parsing.
  - Reduced renderer update pressure.
  - Split chart code into a separate chunk.
- Why:
  - Live tracking performance was degrading under higher event volume.

### 2026-03-24 - Renderer settings and visual control pass
- Files touched:
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Added persisted renderer settings.
  - Added cadence, motion, density, scrolling, and opacity controls.
  - Expanded extracted visuals across live surfaces.
- Why:
  - The settings page needed to become functional, and the renderer needed smoother user control.

### 2026-03-24 - Guided compare flow
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Reworked compare flow into selection mode with checkboxes, `Start Compare`, and `Go Back`.
  - Added clearer helper text.
- Why:
  - The previous compare interaction was confusing and not explicit enough.

### 2026-03-24 - Library overhaul
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Rebuilt the library into a comprehensive class and artifact reference browser.
  - Grouped powers by roles like damage, support, debuff, sustain, and utility.
  - Added richer artifact breakdowns.
- Why:
  - The library needed to be a usable in-app knowledge base instead of a thin list.

### 2026-03-24 - Highest hit tracking and mechanics-based ranking
- Files touched:
  - `src/core/aggregation/combatantTracker.ts`
  - `src/renderer/analysisViewModel.test.ts`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
  - `src/shared/mechanicsModel.ts`
  - `src/shared/types.ts`
- What changed:
  - Added highest-hit tracking.
  - Normalized focus target grouping.
  - Added formula-backed ranking logic for powers and artifacts.
- Why:
  - Users needed better ranking and visibility into single-hit peaks and cleaner focus aggregation.

### 2026-03-24 - Windows-wide combat log auto-discovery
- Files touched:
  - `src/main/main.ts`
  - `src/main/preload.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/globals.d.ts`
  - `src/renderer/styles.css`
  - `src/shared/types.ts`
- What changed:
  - Added recursive Windows drive scanning for combat logs.
  - Added confirmation-based candidate selection.
  - Added live tag stacking for crit and CA hits.
- Why:
  - Many users will not have identical log locations, so setup needed broader discovery support.

### 2026-03-24 - Viewport shell and spreadsheet audit
- Files touched:
  - `src/renderer/styles.css`
  - `tmp-sheet-edit.html`
  - `tmp-sheet-gviz.txt`
- What changed:
  - Constrained the shell to the viewport with scrollable overflow regions.
  - Inspected a public spreadsheet structure for future data use.
- Why:
  - The renderer needed stronger viewport containment and the external spreadsheet needed initial evaluation.

### 2026-03-24 - Responsive shell rework
- Files touched:
  - `src/renderer/styles.css`
- What changed:
  - Reworked the shell into a fixed topbar plus scroll region layout.
  - Constrained tables and panels more aggressively.
- Why:
  - Full-screen and maximized layouts were overflowing and wasting space.

### 2026-03-24 - Native Windows Electron shell direction
- Files touched:
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Reworked the app toward a Windows desktop utility shell.
  - Added title bar overlay support, desktop-style navigation, and updated shell structure.
- Why:
  - The app needed to feel like an Electron utility, not a website wrapped in Electron.

### 2026-03-24 - First-run setup helper and sortable live table
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Added a first-run setup helper.
  - Tightened sidebar collapse behavior.
  - Added sorting to live table columns.
- Why:
  - New users needed clearer onboarding and the live table needed more direct utility.

### 2026-03-24 - Recursive auto-detect and explicit confirmation flow
- Files touched:
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
- What changed:
  - Replaced guessed-path detection with a recursive scan.
  - Stopped auto-filling combat log paths on launch.
  - Added explicit result confirmation.
- Why:
  - Setup needed to reflect real Windows systems rather than hardcoded assumptions.

### 2026-03-24 - Sidebar tightening and image fallback improvements
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/nwMetadata.ts`
  - `src/renderer/styles.css`
- What changed:
  - Tightened desktop spacing.
  - Added canonical matching for image lookup.
  - Added local-to-remote image fallback behavior.
- Why:
  - The sidebar wasted space and asset rendering was failing when names did not match exactly.

### 2026-03-24 - Auto_awesome removal and artifact damage tab
- Files touched:
  - `public/nw-hub/powers/*.png`
  - `src/core/aggregation/combatantTracker.ts`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/shared/data/nw-hub-classes.json`
  - `src/shared/types.ts`
- What changed:
  - Removed the `auto_awesome` icon usage.
  - Refreshed image assets for powers/features/feats.
  - Added the `Artifact Damage` player detail tab.
- Why:
  - The title bar icon choice was wrong, image coverage was incomplete, and users needed post-artifact damage visibility.

### 2026-03-24 - Setup-first launch and extensionless log handling
- Files touched:
  - `src/core/watcher/detectActiveLog.test.ts`
  - `src/core/watcher/detectActiveLog.ts`
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Made `Setup` the default screen.
  - Reworked onboarding copy.
  - Accepted extensionless and `.txt` combat logs.
  - Stabilized sidebar spacing.
- Why:
  - New-user setup was confusing and real Neverwinter log naming on disk was broader than `.log` only.

### 2026-03-24 - Timeline chart standardized on Recharts
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
- What changed:
  - Replaced the remaining hand-drawn timeline graph with Recharts.
- Why:
  - The charting stack needed consistency across the app.

### 2026-03-24 - Library nav restoration and related state fixes
- Files touched:
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/watcher/detectActiveLog.test.ts`
  - `src/core/watcher/detectActiveLog.ts`
  - `src/main/errorLogger.ts`
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.test.ts`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
- What changed:
  - Restored the Library navigation item.
  - Touched related state and monitoring files during that recovery period.
- Why:
  - Library access had regressed and shell state consistency needed correction.

### 2026-03-24 - Responsive shell stabilization and maintenance actions
- Files touched:
  - `package.json`
  - `src/main/errorLogger.ts`
  - `src/main/main.ts`
  - `src/main/preload.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/globals.d.ts`
  - `src/renderer/styles.css`
  - temporary investigation files under `.tmp-*`
- What changed:
  - Tightened responsive shell behavior.
  - Restored Encounters in the sidebar.
  - Added clear cache/data/error-log actions.
  - Added local `.logs` error writing.
  - Disabled chart animations to reduce sluggishness.
- Why:
  - The UI was laggy, responsive behavior was unstable, and debugging information needed to be persisted.

### 2026-03-24 - Electron startup hardening
- Files touched:
  - `package.json`
  - `scripts/dev-electron.mjs`
  - `src/main/errorLogger.ts`
  - `src/main/main.ts`
  - `src/main/preload.ts`
- What changed:
  - Replaced fragile Electron startup behavior with a launcher that clears `ELECTRON_RUN_AS_NODE`.
  - Preserved error logger compatibility in the runtime path.
- Why:
  - `npm run dev` was failing because Electron was booting in the wrong mode.

### 2026-03-24 - IPC send safety during reload and teardown
- Files touched:
  - `.logs/main-process-2026-03-24.log`
  - `scripts/dev-electron.mjs`
  - `src/core/monitoring/logMonitorService.ts`
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Tightened state-send guards to prevent sending into dead renderer frames.
  - Continued launcher and UI adjustments around that stability work.
- Why:
  - Reloads and renderer teardown were producing repeated `WebFrameMain` disposal errors.

### 2026-03-24 - Fast Refresh compatibility cleanup
- Files touched:
  - `src/main/main.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/rendererSettings.ts`
- What changed:
  - Moved non-component exports like settings defaults out of `ObsidianScreens`.
- Why:
  - Vite Fast Refresh was invalidating due to mixed component/non-component exports.

### 2026-03-24 - Large-log import streaming and encounter segmentation pass
- Files touched:
  - `.logs/main-process-2026-03-24.log`
  - `src/core/aggregation/combatantTracker.ts`
  - `src/core/aggregation/encounterAggregator.ts`
  - `src/core/encounter/encounterManager.test.ts`
  - `src/core/encounter/encounterManager.ts`
  - `src/core/monitoring/logMonitorService.ts`
- What changed:
  - Streamed imports in chunks.
  - Reduced idle rebuilds.
  - Bounded growth of combatant history.
  - Improved encounter segmentation and added regression coverage.
- Why:
  - Large imported logs were causing performance and memory problems.

### 2026-03-24 - Additional import-path optimization
- Files touched:
  - `src/core/monitoring/logMonitorService.ts`
- What changed:
  - Reduced per-chunk full snapshot rebuilds further.
- Why:
  - Large-log import still needed more optimization after the first streaming pass.

### 2026-03-24 - Artifact window and large-log pressure reduction
- Files touched:
  - `src/core/aggregation/combatantTracker.ts`
  - `src/renderer/analysisViewModel.ts`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/shared/types.ts`
- What changed:
  - Reworked artifact damage tracking toward explicit windows.
  - Reduced large-log pressure by slicing and bounding more data.
- Why:
  - Artifact damage needed correctness and the large-log path still needed lower memory pressure.

### 2026-03-24 - Worker-thread import architecture
- Files touched:
  - `src/core/monitoring/importWorker.ts`
  - `src/core/monitoring/logMonitorService.ts`
- What changed:
  - Added worker-thread parsing for large recorded-log imports.
- Why:
  - Heavy imports should not block the main Electron process.

### 2026-03-24 - Clickable rows and softer visual pass
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
- What changed:
  - Made major analysis rows clickable.
  - Added reusable detail drawer behavior.
  - Softened visual styling.
- Why:
  - Analysis surfaces needed deeper interactivity and less harsh presentation.

### 2026-03-25 - Renderer startup OOM reduction
- Files touched:
  - `.logs/main-process-2026-03-25.log`
  - `src/renderer/App.tsx`
- What changed:
  - Gated expensive player/combat analysis building to analysis-heavy views only.
- Why:
  - Startup was failing because the renderer was building too much state immediately and crashing from memory pressure.

### 2026-03-25 - Lightweight bootstrap state
- Files touched:
  - `docs/project-fixes-log.md`
  - `src/main/main.ts`
  - `src/main/preload.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/globals.d.ts`
- What changed:
  - Added bootstrap IPC that returns a lightweight state for setup/startup.
  - Deferred loading the full analysis state until heavy views are opened.
  - Added the first version of the project log.
- Why:
  - Setup needed to open without pulling the full combat-analysis payload into the renderer.

## Future updates

For every future task, add a new section in this format:

### YYYY-MM-DD - Change Set Title
- Files touched:
  - `path`
  - `path`
- What changed:
  - ...
- Why:
  - ...
- Verification:
  - ...

Do not replace a future entry with a git summary line.
Write what changed in the files and why it was done.

### 2026-03-25 - Live player selection fix and live table role filters
- Files touched:
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `docs/project-fixes-log.md`
- What changed:
  - Added a selected-player snapshot fallback in `App.tsx` so player detail can stay locked to the exact row the user clicked, even when the detail view and live table are built from slightly different row sets.
  - Changed player selection to resolve from a combined live-plus-player row pool instead of only the generic `playerRows` list.
  - Added a direct `onSelectPlayerRow` path so the live table can pass the exact clicked row into the detail flow before switching views.
  - Added live-table role filter tabs in `ObsidianScreens.tsx` for:
    - all players
    - damage
    - healing
    - damage taken
    - support
- Why:
  - Clicking a team member in the live table was opening the detail page for the wrong player, usually the top damage player, because the detail selection was resolving against the wrong backing row source.
  - The live combat table needed clearer filtering so users can understand and compare party roles more easily.
- Verification:
  - pending at time of entry creation, then completed after test/build pass in the same turn

### 2026-03-25 - Multiline combat-log line handling for data integrity
- Files touched:
  - `src/core/reader/lineBuffer.ts`
  - `src/core/reader/lineBuffer.test.ts`
  - `docs/project-fixes-log.md`
- What changed:
  - Updated the buffered line splitter so it no longer treats every newline as a hard event boundary.
  - Added quote-balance handling so physical lines are merged when a quoted Neverwinter field spans a newline.
  - Added a regression test using a real broken-up `Heartfelt Barrier` style sample from production logs.
- Why:
  - QA validation against a real 57.5 MB combat log found valid events being dropped because some Neverwinter records were split across two physical lines.
  - This was a data-integrity issue, not just a parser warning issue, because it could silently lose real combat events.
- Verification:
  - pending at time of entry creation, then completed after test/build and import benchmark rerun in the same turn

### 2026-03-25 - Live encounter scope control and archived session history
- Files touched:
  - `src/shared/types.ts`
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/monitoring/importWorker.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `docs/project-fixes-log.md`
- What changed:
  - Added `sessionArchives` to shared app state so completed live sessions can be preserved instead of disappearing when the active combat log rolls over.
  - Added session archive creation in `logMonitorService.ts` when a live session rolls over to a new combat log and when tracking is stopped manually.
  - Stored lightweight archive summaries with log file path, line counts, parsed event counts, encounter summaries, and top combatants instead of keeping unlimited heavy session payloads.
  - Added a dedicated live encounter scope selector in the live view so the user can switch the live combat table between the whole session and any specific completed encounter such as first boss, second boss, last boss, or trash pulls in between.
  - Added an archived session section in the encounter archive view so older combat-log sessions remain visible after new logs appear.
- Why:
  - Users could not isolate first boss, second boss, last boss, or in-between mob pulls from the live combat table with enough control.
  - When Neverwinter rolled over to a new combat log, the old session state disappeared instead of being retained as historical reference.
- Verification:
  - pending at time of entry creation, then completed after test/build pass in the same turn

### 2026-03-25 - Sidebar footer cleanup and clearer Party Overview and Encounters UX
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
  - `docs/project-fixes-log.md`
- What changed:
  - Added `getSourceFileName()` so UI surfaces can show the active log file name without exposing the full source path.
  - Added `getSidebarIdentitySubtitle()` so the sidebar footer uses a friendly player or session summary instead of falling back to the raw combat-log source label.
  - Changed the sidebar footer profile card to show:
    - class and paragon when known
    - a tracked-player summary when class data is missing
    - a session-tracking summary when no player is selected
  - Reworked `Party Overview` to add a summary strip above the dense tables showing:
    - what session or encounter is being viewed
    - which source file is active
    - who the current top damage player is
    - how many encounters are in the session
  - Split the live filter controls into two clearer rows:
    - view scope
    - target focus
  - Updated live stat card helper text so the numbers explain the selected scope more clearly.
  - Reworked `Encounters` into a timeline-oriented view with:
    - current-session summary cards
    - archived session cards
    - encounter cards with damage, DPS, healing, damage taken, hits, and crit rate
  - Added new layout and card styles to support the summary strip and encounter timeline design.
- Why:
  - The sidebar was showing path-like source text in the footer, which looked like an error message even though it was only a fallback UI string.
  - `Party Overview` and `Encounters` were too dense and did not explain the current scope clearly enough for fast reading.
  - The archived session and encounter history needed a more human-readable structure instead of relying on compact table rows alone.
- Verification:
  - `npm test`
  - `npm run build`

### 2026-03-25 - Live combat table refresh action and segmented role filters
- Files touched:
  - `src/renderer/components/ObsidianScreens.tsx`
  - `src/renderer/styles.css`
  - `docs/project-fixes-log.md`
- What changed:
  - Added a dedicated `Refresh Table` button to the `Live combat table` toolbar.
  - Wired the refresh action to reset the live table back to its default view by clearing:
    - search query
    - role filter
    - custom sort state
  - Added a visible refresh status note so the user can tell whether the table is showing a reset/default view or when it was last reset.
  - Replaced the loose role-filter chip row with a segmented control for:
    - all players
    - damage
    - healing
    - damage taken
    - support
  - Added responsive styles for the new toolbar and segmented control so the controls stack cleanly on narrower widths.
- Why:
  - The live table needed an explicit recovery action so the user can quickly get back to a clean default state without manually clearing search and filters.
  - The old role buttons looked like generic chips and did not communicate that they were primary table-view controls.
- Verification:
  - `npm test`
  - `npm run build`

### 2026-03-25 - Manual run recording and automatic dungeon recording foundations
- Files touched:
  - `src/shared/types.ts`
  - `src/core/parser/parseAuxiliaryLogLine.ts`
  - `src/core/monitoring/logMonitorService.ts`
  - `src/core/monitoring/importWorker.ts`
  - `src/main/main.ts`
  - `src/main/preload.ts`
  - `src/renderer/globals.d.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/components/ObsidianScreens.tsx`
  - `docs/project-fixes-log.md`
- What changed:
  - Added recording-specific state to the shared app model so the app can preserve manual and automatic run captures separately from the broader live session history.
  - Added a recording shape that stores the mode, inferred instance metadata, boss focus, segmented encounters, and top combatants for each saved run.
  - Added structured team voice join and leave details in the auxiliary-log parser so automatic recording can react to stronger dungeon-run signals than combat alone.
  - Added monitor-service recording runtime support for:
    - manual recording start and stop
    - automatic recording start from detected instance or team-run signals
    - automatic recording stop after leave signals or enough post-run idle time
    - live recording snapshots while the run is active
    - archived recording history after the run ends
  - Added IPC and preload bridge methods for starting and stopping manual recordings from the renderer.
  - Added live-view controls for:
    - `Record New Live Data`
    - `Stop Recording`
  - Added live-view recording status cards so the user can see whether a run is being recorded, which instance it belongs to, how many parsed events it contains, and how many segmented encounters were captured.
  - Added a recordings section to the encounters/history page so saved manual and automatic runs can be reviewed after the active live session moves on.
- Why:
  - The user needed a clean manual feature that records only after they explicitly press a button, instead of mixing earlier combat into the saved run.
  - The user also needed an automatic mode that follows dungeon or trial boundaries better than simple in-combat vs out-of-combat timing.
  - Recording history needed to persist so valuable runs do not disappear when the active combat log rolls over.
- Verification:
  - `npm test`
  - `npm run build`
