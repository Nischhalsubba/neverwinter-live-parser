# Project Fixes Log

This file records the major fixes and architectural changes made across the project so future work does not repeat the same debugging effort.

## Startup and Electron runtime

- Cleared `ELECTRON_RUN_AS_NODE` in the dev launcher so Electron starts as an app instead of plain Node.
- Replaced fragile shell-based Electron dev startup with a direct watcher/spawn flow.
- Moved Electron runtime cache and session data into writable temp directories to avoid Windows cache access errors.
- Hardened main-to-renderer IPC sends so disposed/crashed renderer frames do not spam errors during reload or close.
- Added persistent main-process and renderer-side error logging.

## Live monitoring

- Fixed active combat log detection so live tracking prefers the file actually being written, not just the highest filename timestamp.
- Added polling alongside file watcher events for more reliable Windows game-log tailing.
- Accepted extensionless, `.log`, and `.txt` Neverwinter combat logs while ignoring unrelated `GameClient` files.
- Reset live session state correctly on file rollover.

## Parser and aggregation

- Reworked parsing for real Neverwinter CSV-style combat logs.
- Reduced false parser errors by classifying display/trigger/negative power lines more accurately.
- Added explicit artifact activation tracking and 20-second post-artifact damage windows.
- Improved encounter segmentation with inactivity and target-aware rollover behavior.
- Bounded high-volume histories in combatant tracking to reduce memory pressure.

## Large-log scalability

- Streamed recorded-log imports in chunks instead of loading the whole file at once.
- Moved large imported-log parsing into a worker thread so the main Electron process stays responsive.
- Reduced unnecessary state rebuilds and idle emits.

## Renderer stability and performance

- Gated expensive player/live row building so it only happens on analysis-heavy views.
- Added a lightweight bootstrap state path for renderer startup so `Setup` can open without loading the full combatant payload.
- Switched the renderer to request the full analysis snapshot only when entering analysis-heavy screens.
- Reduced chart animation overhead on live surfaces.
- Fixed shell/sidebar scroll containment and viewport overflow issues.

## UI and UX

- Restored `Library` and `Encounters` as explicit sidebar items.
- Added helper onboarding around combat-log setup and monitoring.
- Added maintenance actions for clearing renderer cache, app data, and error logs.
- Added interactive drill-down behavior for major analysis tables and rows.
- Added library sorting for artifacts and powers.

## Metadata and enrichment

- Integrated extracted Neverwinter metadata from NW Hub and NWCharBuilderPlus.
- Added class, power, and artifact image lookup with stronger fallback handling.
- Enriched parser/UI with class, paragon, artifact, power, and companion metadata.

## Current direction

- Keep startup lightweight.
- Keep heavy analysis work off setup/settings/library when possible.
- Prefer incremental/worker-based parsing for large logs.
- Prefer summaries in the main shell and load detailed analysis only when the user opens it.
