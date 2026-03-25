# Neverwinter Live Parser

A local Windows Electron app for parsing Neverwinter combat logs, tracking live sessions, preserving run history, and reviewing player performance across fights, bosses, and supporting auxiliary logs.

## Highlights

- Live combat-log monitoring
- Recorded log import and review
- Session and recording history
- Auxiliary log awareness for voice, lifecycle, and system context
- Portable Windows build output

## Local development

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run build
```

## Recommended Windows build

For the fastest startup and best day-to-day usability on Windows, build the unpacked app bundle:

```powershell
npm run dist:win-unpacked
```

Launch the app with one click from:

`release/win-unpacked/Neverwinter Live Parser.exe`

## Single-file portable Windows build

If you specifically need a single-file executable, build the portable target:

```powershell
npm run dist:win-portable
```

The portable executable is written to:

`release/Neverwinter-Live-Parser-Portable-0.1.0.exe`

The portable target is convenient for sharing, but it can start more slowly than the unpacked build because it has to prepare its runtime before the app window becomes usable.

## Privacy model

- The app is designed to read local Neverwinter log files.
- Error logs are stored locally in `.logs`.
- Automatic outbound web requests are blocked in the packaged runtime.
- A local unsigned build can still trigger Windows trust prompts such as Smart App Control or SmartScreen. Code signing is required to reduce those warnings for public distribution.

## Runtime support

This project targets modern Windows desktop environments supported by the Electron version pinned in this repository.

## Credits

- Designed by Archew
- Developed by Archew
