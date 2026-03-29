# Neverwinter Live Parser

Neverwinter Live Parser is a Windows-first desktop application for real-time Neverwinter combat log tracking, encounter segmentation, session history, auxiliary log analysis, and post-run review.

The project is built as a local-first parser utility with three priorities:

- accurate combat-log ingestion
- readable encounter and party analytics
- fast desktop workflow for live tracking and recorded review

## Highlights

- Live monitoring of active `combatlog_YYYY-MM-DD_HH-MM-SS` files
- Boss-by-boss and pull-by-pull encounter segmentation
- Party overview for damage, healing, damage taken, timing, and artifact windows
- Recorded-log import for historical analysis
- Auxiliary log parsing for voice, client, lifecycle, and debug context
- Session archives and run history instead of disposable live state
- Windows desktop packaging for unpacked and portable releases

## Architecture

The codebase is now organized as a layered desktop application:

```text
src/
  desktop/
    runtime/
      main.ts
      preload.ts
      services/
  engine/
    aggregation/
    encounters/
    monitoring/
    parsing/
    reading/
    watching/
  shared/
    config/
    data/
    models/
  ui/
    app/
    metadata/
    shell/
    state/
    styles/
    types/
```

### Layer responsibilities

- `src/desktop/runtime`
  - Electron lifecycle, window creation, runtime hardening, IPC handlers, and diagnostics
- `src/engine`
  - Log reading, parsing, encounter segmentation, aggregation, live monitoring, and worker-based imports
- `src/shared`
  - Canonical cross-process types, constants, domain helpers, and curated Neverwinter datasets
- `src/ui`
  - React application bootstrap, renderer state projections, metadata resolution, shell screens, and desktop styling

## Development Standards

The repo is structured around a few rules:

- parser and aggregation logic stay out of renderer views
- cross-process contracts live in `src/shared/models`
- Electron-only code stays in `src/desktop/runtime`
- UI projections belong in `src/ui/state`
- repository automation lives in `scripts`
- generated artifacts and local investigation files do not belong in the repo root

Most hand-authored source files now start with a short purpose comment so the next developer can understand what the file owns before reading implementation details.

## Tech Stack

- Electron
- React
- TypeScript
- Recharts
- Vite
- Vitest

## Local Development

```powershell
npm install
npm run dev
```

## Verification

```powershell
npm test
npm run build
```

## Windows Builds

### Fast local desktop build

```powershell
npm run dist:win-unpacked
```

Launch:

`release/win-unpacked/Neverwinter Live Parser.exe`

### Portable build

```powershell
npm run dist:win-portable
```

Portable output:

`release/Neverwinter-Live-Parser-Portable-<version>.exe`

## Security and Privacy

- The application works against local Neverwinter logs on the user machine.
- Runtime activity and error logs are stored locally for debugging.
- Packaged builds block unexpected outbound navigation and permission requests.
- Public distribution still benefits from proper Windows code signing.

See [SECURITY.md](./SECURITY.md) for the current runtime hardening notes.

## Documentation

- [SECURITY.md](./SECURITY.md)
- [docs/project-fixes-log.md](./docs/project-fixes-log.md)

## Maintainer

**Nischhal Raj Subba**

This repository represents an ongoing effort to build a polished, practical, and accurate Neverwinter combat parser for real-world dungeon, trial, and arena play.
