# Architecture Overview

## Purpose

This document explains how the codebase is structured after the desktop, parser-engine, shared-domain, and UI-layer refactor.

## Source Layout

### `src/desktop/runtime`

Owns Electron-specific concerns:

- app startup
- window lifecycle
- runtime hardening
- IPC
- packaged and development logging

### `src/engine`

Owns the parsing pipeline:

- file discovery
- incremental reading
- combat line parsing
- auxiliary log parsing
- encounter segmentation
- combatant aggregation
- worker-thread imports

### `src/shared`

Owns cross-process contracts and curated data:

- shared types
- default constants
- auxiliary log reducers
- mechanics helpers
- artifact catalog helpers
- Neverwinter metadata datasets

### `src/ui`

Owns the renderer:

- React bootstrapping
- shell screens
- renderer-only projections
- metadata resolution for visuals and class inference
- desktop styles
- preload type declarations

## Data Flow

1. `src/desktop/runtime/main.ts` starts Electron and the monitoring service.
2. `src/engine/monitoring/logMonitorService.ts` watches the active log folder or file.
3. `src/engine/reading/*` reconstructs appended logical records.
4. `src/engine/parsing/*` parses combat and auxiliary log lines into structured events.
5. `src/engine/encounters/*` and `src/engine/aggregation/*` turn events into encounter and combatant snapshots.
6. `src/shared/models/types.ts` defines the state contract emitted to the renderer.
7. `src/ui/app/App.tsx` receives snapshots through the preload bridge.
8. `src/ui/state/analysisViewModel.ts` converts raw snapshots into sortable UI rows.
9. `src/ui/shell/ObsidianScreens.tsx` renders the desktop experience.

## Maintenance Rules

- Put Electron-only code in `src/desktop/runtime`.
- Put parser or aggregation logic in `src/engine`, not the UI.
- Put all cross-process data shapes in `src/shared/models`.
- Keep renderer transformations in `src/ui/state`.
- Keep metadata resolution in `src/ui/metadata`.
- Update `docs/project-fixes-log.md` whenever changing code, structure, docs, or behavior.
