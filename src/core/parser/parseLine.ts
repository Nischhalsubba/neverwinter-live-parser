import type { CombatEvent, ParseIssue } from "../../shared/types.js";

export type ParseResult =
  | { kind: "event"; event: CombatEvent }
  | { kind: "issue"; issue: ParseIssue; event: CombatEvent };

function parseTimestamp(input: string): number {
  const parts = input.split(":");
  if (parts.length < 6) {
    return Date.now();
  }

  const [yy, month, day, hour, minute, secondWithFraction] = parts;
  const year = Number(yy) + 2000;
  const second = Number(secondWithFraction);
  const candidate = new Date(
    year,
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Math.floor(second),
    Math.round((second % 1) * 1000)
  );

  return Number.isNaN(candidate.getTime()) ? Date.now() : candidate.getTime();
}

function parseActorType(ref: string | undefined): CombatEvent["sourceType"] {
  if (!ref) {
    return "unknown";
  }
  if (ref.startsWith("P[")) {
    return "player";
  }
  if (ref.startsWith("C[")) {
    return "companion";
  }
  if (ref.startsWith("E[")) {
    return "npc";
  }
  return "unknown";
}

function inferEventType(
  amount: number,
  school: string,
  flags: string[],
  targetName: string
): CombatEvent["eventType"] {
  if (amount <= 0) {
    return "unknown";
  }

  const joined = `${school} ${flags.join(" ")}`.toLowerCase();
  if (joined.includes("heal")) {
    return "heal";
  }

  if (targetName) {
    return "damage";
  }

  return "unknown";
}

function buildUnknown(line: string, reason: string): ParseResult {
  return {
    kind: "issue",
    issue: {
      line,
      reason,
      seenAt: Date.now()
    },
    event: {
      raw: line,
      timestamp: Date.now(),
      eventType: "unknown"
    }
  };
}

export function parseLine(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) {
    return buildUnknown(line, "Empty log line");
  }

  const separatorIndex = trimmed.indexOf("::");
  if (separatorIndex === -1) {
    return buildUnknown(line, "Missing Neverwinter field separator");
  }

  const timestamp = parseTimestamp(trimmed.slice(0, separatorIndex));
  const payload = trimmed.slice(separatorIndex + 2);
  const parts = payload.split(",");

  if (parts.length < 10) {
    return buildUnknown(line, "Unexpected Neverwinter field count");
  }

  const hasExplicitSourceActor = parts.length >= 12;
  const sourceOwnerName = parts[0]?.trim() ?? "";
  const sourceOwnerId = parts[1]?.trim() ?? "";
  const sourceName = hasExplicitSourceActor
    ? parts[2]?.trim() || sourceOwnerName
    : sourceOwnerName;
  const sourceId = hasExplicitSourceActor
    ? parts[3]?.trim() || sourceOwnerId
    : sourceOwnerId;
  const targetName = parts[hasExplicitSourceActor ? 4 : 2]?.trim() ?? "";
  const targetId = parts[hasExplicitSourceActor ? 5 : 3]?.trim() ?? "";
  const abilityName = parts[hasExplicitSourceActor ? 6 : 4]?.trim() ?? "";
  const abilityId = parts[hasExplicitSourceActor ? 7 : 5]?.trim() ?? "";
  const school = parts[hasExplicitSourceActor ? 8 : 6]?.trim() ?? "";
  const flagsField = parts[hasExplicitSourceActor ? 9 : 7]?.trim() ?? "";
  const magnitude = Number(parts[hasExplicitSourceActor ? 10 : 8] ?? "0");
  const amount = Number(parts[hasExplicitSourceActor ? 11 : 9] ?? "0");
  const flags = flagsField
    ? flagsField
        .split("|")
        .map((flag) => flag.trim())
        .filter(Boolean)
    : [];
  const eventType = inferEventType(amount, school, flags, targetName);

  if (!abilityName && !targetName) {
    return buildUnknown(line, "Line does not describe a combat action");
  }

  const event: CombatEvent = {
    raw: line,
    timestamp,
    eventType,
    sourceName,
    sourceId,
    sourceOwnerName: sourceOwnerName || sourceName,
    sourceOwnerId: sourceOwnerId || sourceId,
    sourceType: parseActorType(sourceId),
    targetName,
    targetId,
    targetType: parseActorType(targetId),
    abilityName,
    abilityId,
    amount: Number.isFinite(amount) ? amount : undefined,
    magnitude: Number.isFinite(magnitude) ? magnitude : undefined,
    critical: flags.some((flag) => flag.toLowerCase() === "critical"),
    school,
    flags,
    tags: {
      hasExplicitSourceActor
    }
  };

  if (eventType === "unknown") {
    return {
      kind: "issue",
      issue: {
        line,
        reason: "Parsed line but could not classify it as damage or healing",
        seenAt: Date.now()
      },
      event: {
        ...event,
        eventType: "unknown"
      }
    };
  }

  return { kind: "event", event };
}
