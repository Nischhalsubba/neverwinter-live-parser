<div align="center">

# Neverwinter Live Parser

**A live combat analytics experience that translates dense Neverwinter combat-log data into signals, summaries, and views players can interpret quickly.**

![Top language](https://img.shields.io/github/languages/top/Nischhalsubba/neverwinter-live-parser?style=flat-square)
![Last commit](https://img.shields.io/github/last-commit/Nischhalsubba/neverwinter-live-parser?style=flat-square)
![Repo size](https://img.shields.io/github/repo-size/Nischhalsubba/neverwinter-live-parser?style=flat-square)

[Browse source](https://github.com/Nischhalsubba/neverwinter-live-parser/tree/main) · [Issues](https://github.com/Nischhalsubba/neverwinter-live-parser/issues)

</div>

## Overview

**Neverwinter Live Parser** turns a stream of combat-log events into structured analysis. The design problem is not merely parsing text; it is helping a player understand what matters while events continue to arrive.

| Audience | Focus |
|---|---|
| Players / analysts | Real-time combat signals and readable summaries |
| Developers | File/log ingestion, parsing, aggregation and state updates |
| Designers | High-density live data, filtering, hierarchy and temporal feedback |
| Maintainers | Event formats, regression samples, game versions and calculation assumptions |

<details open>
<summary><strong>🏗️ Interactive live-parser architecture</strong></summary>

```mermaid
flowchart LR
    LOG["Neverwinter combat log"] --> WATCH["Live file / event ingestion"]
    WATCH --> PARSE["Parse events"]
    PARSE --> MODEL["Normalized combat events"]
    MODEL --> AGG["Live aggregation"]
    AGG --> METRICS["Metrics / summaries"]
    METRICS --> UI["Analytics UI"]
    UI --> PLAYER["Player"]
```

</details>

## Live analysis flow

```mermaid
flowchart TD
    START["Start parser"] --> SELECT["Select / detect combat log"] --> WATCH["Watch new events"] --> PARSE["Parse supported lines"] --> UPDATE["Update metrics"] --> DISPLAY["Refresh live views"] --> WATCH
```

## Getting started

```bash
git clone https://github.com/Nischhalsubba/neverwinter-live-parser.git
cd neverwinter-live-parser
```

Use the manifests and lockfiles committed in the repository to determine the current runtime, build, and test commands.

## Product & design principles

Live analytics should distinguish current encounters from historical context, tolerate malformed/unknown events, avoid silently dropping important parsing failures, and show data freshness. Keep dense views scannable with stable columns, sensible defaults, keyboard access, readable contrast, and explanations for derived metrics.

## SEO & discoverability

Use accurate terms such as **Neverwinter live parser, Neverwinter combat parser, combat log analysis, DPS analysis, combat analytics, and Neverwinter tools** only where supported by implemented behavior and documented calculations.

## Contribution flow

```mermaid
flowchart LR
    LOGCASE["New log case"] --> PARSER["Update parser"] --> TEST["Regression test"] --> METRIC["Validate calculations"] --> UX["Review live UI impact"] --> DOCS["Document assumptions"] --> PR["Pull request"]
```
