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

function parseActorType(
  ref: string | undefined,
  name: string | undefined,
  ownerRef?: string,
  isSource = false
): CombatEvent["sourceType"] {
  if (!ref) {
    return "unknown";
  }
  if (ref.startsWith("P[")) {
    return "player";
  }
  if (ref.startsWith("C[")) {
    if (
      isSource &&
      ownerRef?.startsWith("P[") &&
      ownerRef !== ref &&
      isCompanionSource(ref, name)
    ) {
      return "companion";
    }
    if (isSource && ownerRef?.startsWith("P[") && ownerRef !== ref) {
      return "player";
    }
    return "npc";
  }
  if (ref.startsWith("E[")) {
    return "npc";
  }
  return "unknown";
}

function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isCompanionSource(ref: string, name: string | undefined): boolean {
  const loweredName = normalizeName(name);
  const loweredRef = ref.toLowerCase();
  return loweredRef.includes("pet_") || loweredName.includes("companion") || loweredName.includes("augment");
}

function isActorReference(ref: string | undefined): boolean {
  if (!ref) {
    return false;
  }
  return ref === "*" || ref.startsWith("P[") || ref.startsWith("C[") || ref.startsWith("E[");
}

function findReferenceIndexes(parts: string[]): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (isActorReference(parts[index]?.trim())) {
      indexes.push(index);
    }
  }
  return indexes;
}

function inferEventType(
  amount: number,
  school: string,
  flags: string[],
  sourceType: CombatEvent["sourceType"],
  targetType: CombatEvent["targetType"]
): CombatEvent["eventType"] {
  const loweredSchool = school.toLowerCase();
  const loweredFlags = flags.map((flag) => flag.toLowerCase());
  const isDisplayOnly =
    loweredFlags.includes("showpowerdisplayname") ||
    loweredFlags.includes("immune") ||
    loweredSchool === "null" ||
    loweredSchool === "power" ||
    loweredSchool === "soulweave" ||
    loweredSchool === "stat_power" ||
    loweredSchool === "damagetrigger";

  if (isDisplayOnly || amount === 0) {
    return "unknown";
  }

  if (amount < 0 && loweredSchool === "hitpoints") {
    return "heal";
  }

  if (amount > 0) {
    if (sourceType === "npc" && (targetType === "player" || targetType === "companion")) {
      return "damageTaken";
    }
    return "damage";
  }

  return "unknown";
}

function resolveEventAmount(eventType: CombatEvent["eventType"], magnitude: number, amount: number): number {
  const absoluteMagnitude = Math.abs(magnitude);
  const absoluteAmount = Math.abs(amount);

  if (eventType === "damage" || eventType === "heal" || eventType === "damageTaken") {
    return Math.max(absoluteMagnitude, absoluteAmount);
  }

  return amount;
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

  if (parts.length < 12) {
    return buildUnknown(line, "Unexpected Neverwinter field count");
  }

  const searchableParts = parts.slice(0, parts.length - 5);
  const referenceIndexes = findReferenceIndexes(searchableParts);

  if (referenceIndexes.length < 1) {
    return buildUnknown(line, "Could not align Neverwinter actor fields");
  }

  const targetRefIndex = referenceIndexes.at(-1)!;
  const sourceRefIndex = referenceIndexes.length >= 2 ? referenceIndexes.at(-2)! : -1;
  const ownerRefIndex = referenceIndexes.length >= 3 ? referenceIndexes.at(-3)! : -1;

  const sourceOwnerName =
    ownerRefIndex >= 0
      ? parts.slice(0, ownerRefIndex).join(",").trim()
      : "";
  const sourceOwnerId = ownerRefIndex >= 0 ? parts[ownerRefIndex]?.trim() ?? "" : "";
  const sourceNameField =
    sourceRefIndex >= 0
      ? parts.slice(ownerRefIndex + 1, sourceRefIndex).join(",").trim()
      : "";
  const sourceIdField = sourceRefIndex >= 0 ? parts[sourceRefIndex]?.trim() ?? "" : "";
  const targetId = parts[targetRefIndex]?.trim() ?? "";
  const targetName = parts
    .slice(sourceRefIndex + 1, targetRefIndex)
    .join(",")
    .trim();
  const abilityName = parts
    .slice(targetRefIndex + 1, parts.length - 5)
    .join(",")
    .trim();
  const abilityId = parts[parts.length - 5]?.trim() ?? "";
  const school = parts[parts.length - 4]?.trim() ?? "";
  const flagsField = parts[parts.length - 3]?.trim() ?? "";
  const magnitude = Number(parts[parts.length - 2] ?? "0");
  const amount = Number(parts[parts.length - 1] ?? "0");
  const hasExplicitSourceActor =
    sourceNameField.length > 0 && sourceIdField.length > 0 && sourceIdField !== "*";
  const sourceName = hasExplicitSourceActor ? sourceNameField : sourceOwnerName;
  const sourceId = hasExplicitSourceActor ? sourceIdField : sourceOwnerId;
  const flags = flagsField
    ? flagsField
        .split("|")
        .map((flag) => flag.trim())
        .filter(Boolean)
    : [];
  const sourceType = parseActorType(sourceId, sourceName, sourceOwnerId, true);
  const targetType = parseActorType(targetId, targetName, undefined, false);
  const eventType = inferEventType(amount, school, flags, sourceType, targetType);

  if (targetRefIndex < 0 || !isActorReference(targetId)) {
    return buildUnknown(line, "Could not align Neverwinter actor fields");
  }

  if (!abilityName && !targetName) {
    return buildUnknown(line, "Line does not describe a combat action");
  }

  const resolvedAmount = resolveEventAmount(eventType, magnitude, amount);
  const normalizedMagnitude =
    eventType === "heal" ? Math.abs(magnitude) : magnitude;

  const event: CombatEvent = {
    raw: line,
    timestamp,
    eventType,
    sourceName,
    sourceId,
    sourceOwnerName: sourceOwnerName || sourceName,
    sourceOwnerId: sourceOwnerId || sourceId,
    sourceType,
    targetName,
    targetId,
    targetType,
    abilityName,
    abilityId,
    amount: Number.isFinite(resolvedAmount) ? resolvedAmount : undefined,
    magnitude: Number.isFinite(normalizedMagnitude) ? normalizedMagnitude : undefined,
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
