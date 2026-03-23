import type { CombatEvent, ParseIssue } from "../../shared/types.js";

const DAMAGE_PATTERN =
  /^\[(?<time>[^\]]+)\]\s+(?<source>.+?)\s+hits\s+(?<target>.+?)\s+with\s+(?<ability>.+?)\s+for\s+(?<amount>\d+)\s+damage(?<crit>\s+\(Critical\))?\.?$/i;

const HEAL_PATTERN =
  /^\[(?<time>[^\]]+)\]\s+(?<source>.+?)\s+heals\s+(?<target>.+?)\s+with\s+(?<ability>.+?)\s+for\s+(?<amount>\d+)(?<crit>\s+\(Critical\))?\.?$/i;

const DAMAGE_TAKEN_PATTERN =
  /^\[(?<time>[^\]]+)\]\s+(?<source>.+?)\s+damages\s+you\s+with\s+(?<ability>.+?)\s+for\s+(?<amount>\d+)(?<crit>\s+\(Critical\))?\.?$/i;

export type ParseResult =
  | { kind: "event"; event: CombatEvent }
  | { kind: "issue"; issue: ParseIssue; event: CombatEvent };

function parseTimestamp(input: string): number {
  const now = new Date();
  const candidate = new Date(`${now.toDateString()} ${input}`);
  return Number.isNaN(candidate.getTime()) ? Date.now() : candidate.getTime();
}

function toEvent(
  match: RegExpMatchArray,
  raw: string,
  eventType: CombatEvent["eventType"]
): CombatEvent {
  const groups = match.groups ?? {};
  return {
    raw,
    timestamp: parseTimestamp(groups.time ?? ""),
    eventType,
    sourceName: groups.source?.trim(),
    targetName: groups.target?.trim(),
    abilityName: groups.ability?.trim(),
    amount: groups.amount ? Number(groups.amount) : undefined,
    critical: Boolean(groups.crit)
  };
}

export function parseLine(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      kind: "issue",
      issue: {
        line,
        reason: "Empty log line",
        seenAt: Date.now()
      },
      event: {
        raw: line,
        timestamp: Date.now(),
        eventType: "unknown"
      }
    };
  }

  const damageMatch = trimmed.match(DAMAGE_PATTERN);
  if (damageMatch) {
    return { kind: "event", event: toEvent(damageMatch, line, "damage") };
  }

  const healMatch = trimmed.match(HEAL_PATTERN);
  if (healMatch) {
    return { kind: "event", event: toEvent(healMatch, line, "heal") };
  }

  const damageTakenMatch = trimmed.match(DAMAGE_TAKEN_PATTERN);
  if (damageTakenMatch) {
    return {
      kind: "event",
      event: {
        ...toEvent(damageTakenMatch, line, "damageTaken"),
        targetName: "You"
      }
    };
  }

  return {
    kind: "issue",
    issue: {
      line,
      reason: "Unrecognized combat log pattern",
      seenAt: Date.now()
    },
    event: {
      raw: line,
      timestamp: Date.now(),
      eventType: "unknown"
    }
  };
}
