# Neverwinter Live Parser

> A Windows-first desktop combat log parser for **Neverwinter**, built to read live combat logs, preserve session history, and turn raw encounter data into readable performance analysis for players, parties, dungeons, trials, and recorded log files.

[![Electron](https://img.shields.io/badge/Desktop-Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)](#tech-stack)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=111111)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](#tech-stack)
[![Vite](https://img.shields.io/badge/Build-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](#development)
[![Windows](https://img.shields.io/badge/Target-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](#windows-build-and-usage)

---

## Table of Contents

- [Overview](#overview)
- [Why This Project Exists](#why-this-project-exists)
- [Designer's Perspective](#designers-perspective)
- [What This Project Does](#what-this-project-does)
- [Core Features](#core-features)
- [Parser and Analysis Goals](#parser-and-analysis-goals)
- [Tech Stack](#tech-stack)
- [Application Architecture](#application-architecture)
- [Windows Build and Usage](#windows-build-and-usage)
- [Available Scripts](#available-scripts)
- [Privacy and Security](#privacy-and-security)
- [UX Principles](#ux-principles)
- [Testing and Quality](#testing-and-quality)
- [Roadmap](#roadmap)
- [Maintainer](#maintainer)

---

## Overview

**Neverwinter Live Parser** is a local-first Windows desktop application for reading Neverwinter combat logs in real time. It is designed for players who want practical insight during and after dungeon, trial, and boss encounters without needing to upload logs to a browser dashboard.

The application focuses on three core outcomes:

1. Accurate Neverwinter combat log parsing.
2. Readable encounter and party analysis.
3. Fast Windows-first workflow for live tracking and post-run review.

The project is built with Electron, React, TypeScript, Vite, and Recharts. It uses Electron for the desktop shell, React for the interface, TypeScript for safer app logic, Vite for renderer development/building, and Recharts for visualizing combat data.

---

## Why This Project Exists

Neverwinter combat logs contain a lot of useful information, but raw logs are difficult to read during actual gameplay. Players often need to understand more than a single DPS number.

Useful questions include:

- Who dealt the most damage?
- Which powers contributed most?
- What happened during a specific boss fight?
- How did performance change across a dungeon or trial?
- Who took the most damage?
- Which healing or support windows mattered?
- Which targets were being hit?
- What did the log capture and when?
- Can older recorded logs be reviewed later?

This project exists to make those answers easier to see, compare, and understand.

---

## Designer's Perspective

This app is designed from the point of view of a player and product designer who understands enough code to care about both data accuracy and usability.

The most important UX challenge is not only parsing lines correctly. It is making parsed data readable while the user is thinking about a game run.

The interface should help players:

- identify the active encounter quickly
- compare party members without confusion
- understand damage, healing, damage taken, support, artifacts, powers, and targets
- switch between live tracking and session review
- trust the parser output
- debug log-tracking issues without needing to inspect raw files manually

The design goal is practical clarity. The app should feel like a tool players can keep open during endgame play, not a confusing spreadsheet with a game skin.

---

## What This Project Does

This repository powers a dedicated Neverwinter combat log parser, DPS tracker, encounter analysis tool, and local session review utility for Windows players.

It supports workflows around:

- live combat tracking
- party overview and damage breakdowns
- healing and damage taken analysis
- support and artifact windows
- boss-by-boss encounter review
- recorded combat log import/review
- organized session and run history
- auxiliary log context for debugging and run diagnostics

The project is designed as a true desktop utility rather than a website wrapper.

---

## Core Features

### Live Neverwinter Combat Log Tracking

- Follows active `combatlog_YYYY-MM-DD_HH-MM-SS` files in real time.
- Watches combat data while the player is actively running content.
- Tracks session-level and encounter-level scopes.
- Preserves older sessions when new logs are created.
- Supports post-run analysis after the live session ends.

### Encounter Breakdown and Session Review

- Breaks down runs by encounter where possible.
- Helps separate boss fights, trash pulls, and broader dungeon/trial sessions.
- Shows party-level contribution instead of only personal output.
- Helps compare damage, healing, support, target focus, powers, and timing.

### Recorded Log Analysis

- Supports importing or reviewing older Neverwinter combat logs.
- Keeps archived logs useful instead of forcing everything into a live-only workflow.
- Allows players to inspect past runs after gameplay.

### Auxiliary Neverwinter Log Awareness

- The project is designed to preserve context beyond the main combat stream where useful.
- This can support troubleshooting around sessions, lifecycle events, and tracking issues.

### NW-Hub Data Extraction Scripts

The project includes scripts for extracting Neverwinter-related class and artifact data:

```bash
npm run extract:nwhub
npm run extract:nwhub:artifacts
```

These scripts support broader game-data enrichment and future analysis features.

---

## Parser and Analysis Goals

The parser should prioritize:

- correctness over flashy visuals
- stable session tracking
- clear encounter boundaries
- readable aggregation
- useful player-level drilldowns
- power and target-level breakdowns
- graceful handling of unexpected log lines
- diagnostics when something cannot be parsed confidently

A good combat parser must be honest about uncertainty. If a line cannot be understood, the app should not silently produce misleading output.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Desktop Shell | Electron `35.x` | Windows desktop app runtime |
| UI | React `19.x` | Renderer interface |
| Language | TypeScript `5.8.x` | Safer app and parser logic |
| Build Tool | Vite `6.x` | Renderer dev server and build |
| Charts | Recharts `3.x` | Graphs and visual breakdowns |
| File Watching | Chokidar | Live log tracking |
| Local Storage | Electron Store | Persistent app settings/state |
| Testing | Vitest | Parser/UI unit testing direction |
| Packaging | Electron Builder | Windows unpacked and portable builds |
| Dev Orchestration | concurrently, wait-on | Runs renderer, main process, and Electron together |

---

## Application Architecture

The app has two main sides:

### Electron Main Process

Responsible for desktop/runtime behavior such as:

- launching the desktop app
- reading local files
- watching combat logs
- communicating with renderer process
- controlling packaged runtime behavior
- applying security-related desktop constraints

### React Renderer

Responsible for user-facing screens such as:

- live dashboard
- encounter tables
- player breakdowns
- chart areas
- session history
- settings/preferences
- error or diagnostic states

### Local-first Model

The app is intended to work with local Neverwinter logs on the player's Windows machine. This keeps the workflow fast and private.

---

## Windows Build and Usage

### Local Development

```powershell
npm install
npm run dev
```

The development script runs the renderer, Electron main TypeScript build, and Electron shell together.

### Production Build

```powershell
npm run build
```

### Recommended Windows Release Build

For fastest startup and daily use, generate the unpacked desktop build:

```powershell
npm run dist:win-unpacked
```

Launch it from:

```text
release/win-unpacked/Neverwinter Live Parser.exe
```

### Single-file Portable Build

If a single-file output is needed:

```powershell
npm run dist:win-portable
```

Portable output path:

```text
release/Neverwinter-Live-Parser-Portable-0.1.0.exe
```

The unpacked build is preferred when startup responsiveness matters most.

---

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts renderer, main process watch, and Electron shell together |
| `npm run dev:renderer` | Runs Vite dev server |
| `npm run dev:main` | Watches Electron main TypeScript build |
| `npm run dev:electron` | Starts Electron after renderer and main build are ready |
| `npm run build` | Builds renderer and Electron main output |
| `npm run dist:win-unpacked` | Builds unpacked Windows desktop app |
| `npm run dist:win-portable` | Builds portable Windows executable |
| `npm run test` | Runs Vitest tests |
| `npm run preview` | Runs Vite preview |
| `npm run extract:nwhub` | Extracts NW-Hub class-related data |
| `npm run extract:nwhub:artifacts` | Extracts NW-Hub artifact-related data |

---

## Privacy and Security

This project is designed around local log reading.

- The app reads local Neverwinter log files from the user's machine.
- Error/activity logs are intended for local debugging.
- Automatic outbound web requests are blocked in packaged runtime.
- Unsigned Windows builds can trigger Smart App Control or SmartScreen warnings.
- Public distribution should use code signing to reduce trust warnings.

For runtime hardening and security notes, see:

```text
SECURITY.md
```

---

## UX Principles

A combat parser is only useful if players can understand it quickly.

### UI Priorities

- Keep live data readable.
- Make encounter scope obvious.
- Separate session-level and encounter-level views.
- Make party comparison easy.
- Avoid overwhelming users with too many graphs at once.
- Use tables for exact comparison and charts for patterns.
- Keep settings simple.
- Show clear warnings when a log path or parser state is wrong.

### Recommended Graphs

Useful visualizations for this type of tool include:

- damage by player bar chart
- healing by player bar chart
- damage taken by player bar chart
- damage over time line chart
- power contribution breakdown
- target focus breakdown
- encounter timeline

---

## Testing and Quality

### QA Checklist

- [ ] App starts in development mode.
- [ ] App builds successfully.
- [ ] Windows unpacked build launches.
- [ ] Portable build launches.
- [ ] Live log watching works.
- [ ] New combat log detection works.
- [ ] Recorded log import/review works.
- [ ] Encounter boundaries are understandable.
- [ ] Player totals match expected sample logs.
- [ ] Charts match table totals.
- [ ] App handles missing log folder gracefully.
- [ ] App handles malformed/unknown log lines safely.
- [ ] No unexpected outbound requests happen in packaged app.

### Parser Quality Notes

Parser testing should include:

- sample damage lines
- healing lines
- damage taken lines
- pet/companion events
- artifact events
- boss encounters
- trash pulls
- long dungeon/trial sessions
- log rotation/new file behavior

---

## Roadmap

- Improve parser coverage for all combat line patterns.
- Add stronger encounter segmentation.
- Add party composition summaries.
- Add buff/debuff and support windows.
- Add exportable reports.
- Add overlay/widget mode for live gameplay.
- Improve sample log testing.
- Add clearer diagnostics for unknown events.
- Add installer/code signing for public releases.
- Improve accessibility and keyboard navigation.

---

## Maintainer

**Nischhal Raj Subba**

This repository represents an ongoing effort to build a polished, high-signal Neverwinter combat parser focused on practical real-world use during live play and post-run analysis.
