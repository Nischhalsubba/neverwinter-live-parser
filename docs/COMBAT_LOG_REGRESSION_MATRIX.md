# Combat-log parser accuracy and regression test matrix

> Status: contributor review checklist, not a claim that the product has passed an audit. This document introduces review expectations; it does not change application behavior.

## Why this exists

Prevent misleading DPS or encounter metrics when live log files contain duplicates, partial writes, missing actors or game-patch format changes.

## Review rules

1. Record a supported log format and observed game version for every fixture. Treat unfamiliar event types as unknown rather than guessing an actor, damage type or amount.
2. Distinguish event timestamps from file ingestion time and UI refresh time. Decide how encounter boundaries, idle intervals and timezone/time-format anomalies are resolved.
3. Test complete and chunked lines, duplicate lines, truncated endings, file rotation, empty file, malformed encoding and unexpected reordering without double counting.
4. Define metric formulas: damage, DPS and duration must use a documented denominator and actor inclusion policy. Clearly distinguish effective damage, heals, misses and overkill when those concepts are available in the event format.
5. Handle large logs with bounded memory, backpressure and visible resync/recovery status. Never freeze the renderer or lose the original file on parse failure.
6. Scrub player names, log paths and identifiers from shared fixtures and error reports unless publication is authorized.

## Verification

From `app/` run `npm run typecheck`, `npm run test` and `npm run build` (or `npm run check`). Compare output from both one-shot and chunked reads of the same synthetic fixture; manually confirm live file rotation, disconnected/empty states, filters and keyboard use.

## Required evidence in a change request

PR: exact event format/version, anonymized fixture, expected actor/encounter metrics, before/after snapshot, executed tests, memory/performance observations and unsupported line types.

## Rollback and incident response

Revert a faulty parser transform or disable an affected metric while keeping raw logs intact. Rebuild derived summaries from the source data rather than patching displayed totals.

## Acceptance criteria

- [ ] The change addresses a stated user or maintainer risk.
- [ ] Evidence and source-of-truth references are attached or explicitly marked unavailable.
- [ ] Relevant automated checks are reported with actual outcomes; unrun checks are not marked passing.
- [ ] Negative, failure and recovery states are accounted for.
- [ ] A reviewer can understand what changed, remaining risk and how to revert it.

Document owner: repository maintainers. Review this checklist when workflows, dependencies or public claims materially change.
