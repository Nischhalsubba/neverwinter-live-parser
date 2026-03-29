# Maintainer Guide

## Purpose

This document is the quick operational map for future developers working on the parser, desktop runtime, or UI.

## Change map

### Desktop runtime

- `src/desktop/runtime/main.ts`
  - Electron lifecycle, IPC, window behavior, startup protections, and packaging-sensitive logic
- `src/desktop/runtime/preload.ts`
  - renderer bridge exposed through context isolation
- `src/desktop/runtime/services/errorLogger.ts`
  - activity, warning, and error log persistence

### Parser engine

- `src/engine/monitoring/logMonitorService.ts`
  - live monitoring coordinator
- `src/engine/monitoring/importWorker.ts`
  - worker-thread import path for larger logs
- `src/engine/parsing/parseLine.ts`
  - combat-line parser
- `src/engine/parsing/parseAuxiliaryLogLine.ts`
  - auxiliary log parser
- `src/engine/encounters/encounterManager.ts`
  - encounter segmentation
- `src/engine/aggregation/combatantTracker.ts`
  - combatant and skill aggregation

### Renderer

- `src/ui/app/App.tsx`
  - top-level renderer bootstrap
- `src/ui/shell/ObsidianScreens.tsx`
  - main desktop shell and largest view layer
- `src/ui/state/analysisViewModel.ts`
  - renderer-side projections and derived rows
- `src/ui/styles/app.css`
  - shell styling and interaction polish

## Working rules

- Do not put parser logic in UI components.
- Do not put renderer-specific transformations in shared models.
- Do not add temporary build artifacts or scratch files to the repo root.
- Prefer extending the existing desktop/engine/shared/ui layering instead of inventing new top-level source buckets.

## Verification

Run these before closing meaningful work:

```powershell
npm test
npm run build
```

If the change touches packaging or Electron startup, also verify:

```powershell
npm run dist:win-unpacked
```
