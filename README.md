# Neverwinter Live Parser

Neverwinter Live Parser is a Windows desktop application for reading Neverwinter combat logs in real time, preserving session history, and breaking down player performance across bosses, trash pulls, dungeon runs, and recorded log files.

Built as a local-first desktop utility, the project focuses on three things:

- accurate Neverwinter combat log parsing
- readable encounter and party analysis
- fast Windows-first workflow for live tracking and post-run review

## What This Project Does

This repository powers a dedicated **Neverwinter combat log parser**, **DPS tracker**, and **encounter analysis tool** for Windows players who want more control over:

- live combat tracking
- party overview and damage breakdowns
- healing, damage taken, support, and artifact windows
- boss-by-boss encounter review
- recorded combat log analysis
- organized session and run history
- auxiliary game-log context such as voice, client, and lifecycle events

The goal is to make Neverwinter combat data easier to understand without forcing players into a browser workflow or a web dashboard mindset. This project is designed as a true desktop parser utility.

## Core Features

### Live Neverwinter Combat Log Tracking

- Follow the active `combatlog_YYYY-MM-DD_HH-MM-SS` file in real time
- Watch live combat table updates for damage, healing, damage taken, and support
- Track active session scope or switch into specific encounter scope
- Capture and preserve run history while continuing to monitor new logs

### Encounter Breakdown and Session Review

- Review encounter-by-encounter performance across a full dungeon or trial
- Separate boss fights and trash pulls into readable segments
- Compare party output by player, power, target, hit, artifact, and timing
- Preserve archived sessions so past combat logs do not disappear when a new log starts

### Recorded Log Analysis

- Import older Neverwinter combat logs for post-run review
- Keep archived sessions and recordings organized in history
- Inspect party contribution, top powers, target focus, large hits, and detailed player breakdowns

### Auxiliary Neverwinter Log Awareness

- Parse supporting Neverwinter log types beyond the main combat log
- Preserve more context around runs, sessions, and system activity
- Surface operational and debug context to help diagnose tracking problems

## Why This Repo Matters

Most Neverwinter players who want combat insight need something more detailed than a simple DPS number. This project is built to give a fuller view of what happened in a run:

- who dealt the most damage
- who carried healing or support
- which powers actually contributed
- how the run changed from first boss to last boss
- what happened between combat pulls
- what was recorded and why

The intention is not just to show stats, but to make those stats understandable.

## Tech Stack

- Electron
- React
- TypeScript
- Recharts
- Vite

## Windows Build and Usage

### Local Development

```powershell
npm install
npm run dev
```

### Production Build

```powershell
npm run build
```

### Recommended Windows Release Build

For the fastest startup and best day-to-day usability on Windows, generate the unpacked desktop build:

```powershell
npm run dist:win-unpacked
```

Launch it from:

`release/win-unpacked/Neverwinter Live Parser.exe`

### Single-File Portable Build

If you specifically need a single-file output:

```powershell
npm run dist:win-portable
```

Portable output path:

`release/Neverwinter-Live-Parser-Portable-0.1.0.exe`

The unpacked build is the preferred release format when startup responsiveness matters most.

## Project Goals

- Make live Neverwinter combat tracking reliable
- Keep analysis readable for solo players and endgame groups
- Preserve useful history instead of losing old sessions
- Keep the desktop UX fast, focused, and practical
- Improve parser quality, diagnostics, and release stability over time

## Privacy and Security

- The app is built to read local Neverwinter log files on the user’s machine.
- Error and activity logs are stored locally for debugging.
- Automatic outbound web requests are blocked in the packaged runtime.
- Unsigned local Windows builds can still trigger Smart App Control or SmartScreen warnings. Public distribution requires code signing to reduce those warnings.

For the current runtime hardening and security notes, see [SECURITY.md](./SECURITY.md).

## Maintainer

**Nischhal Raj Subba**

This repository represents an ongoing effort to build a polished, high-signal Neverwinter combat parser focused on practical real-world use during live play and post-run analysis.
