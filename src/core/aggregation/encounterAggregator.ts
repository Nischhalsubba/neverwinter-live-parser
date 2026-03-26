import type {
  CombatEvent,
  EncounterSnapshot,
  SkillStat
} from "../../shared/types.js";

type MutableEncounter = {
  id: string;
  startedAt: number;
  endedAt?: number;
  labelHint: string | null;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  critCount: number;
  hitCount: number;
  skillTotals: Map<string, SkillStat>;
  targetTotals: Map<string, number>;
  eventCount: number;
  lastActivityAt: number;
};

export function createEncounter(id: string, startedAt: number): MutableEncounter {
  return {
    id,
    startedAt,
    labelHint: null,
    totalDamage: 0,
    totalHealing: 0,
    damageTaken: 0,
    critCount: 0,
    hitCount: 0,
    skillTotals: new Map(),
    targetTotals: new Map(),
    eventCount: 0,
    lastActivityAt: startedAt
  };
}

export function applyEventToEncounter(
  encounter: MutableEncounter,
  event: CombatEvent
): void {
  encounter.eventCount += 1;
  encounter.lastActivityAt = event.timestamp;

  const amount = event.amount ?? 0;
  if (event.eventType === "damage") {
    encounter.totalDamage += amount;
    encounter.hitCount += 1;
    if (!encounter.labelHint && event.targetName) {
      encounter.labelHint = event.targetName;
    }
    if (event.targetName) {
      encounter.targetTotals.set(
        event.targetName,
        (encounter.targetTotals.get(event.targetName) ?? 0) + amount
      );
    }
  } else if (event.eventType === "heal") {
    encounter.totalHealing += amount;
    encounter.hitCount += 1;
  } else if (event.eventType === "damageTaken") {
    encounter.damageTaken += amount;
    encounter.hitCount += 1;
  }

  if (event.critical) {
    encounter.critCount += 1;
  }

  if (
    event.abilityName &&
    (event.eventType === "damage" || event.eventType === "heal")
  ) {
    const current = encounter.skillTotals.get(event.abilityName) ?? {
      abilityName: event.abilityName,
      total: 0,
      hits: 0,
      critCount: 0,
      flankCount: 0,
      kind: event.eventType
    };
    current.total += amount;
    current.hits += 1;
    if (event.critical) {
      current.critCount += 1;
    }
    if (event.flags?.some((flag) => flag.toLowerCase() === "flank")) {
      current.flankCount += 1;
    }
    encounter.skillTotals.set(event.abilityName, current);
  }
}

export function finalizeEncounter(
  encounter: MutableEncounter,
  endedAt: number
): EncounterSnapshot {
  const durationMs = Math.max(endedAt - encounter.startedAt, 1);
  const durationSeconds = durationMs / 1000;
  const topSkills = Array.from(encounter.skillTotals.values())
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);
  const primaryTargetName =
    Array.from(encounter.targetTotals.entries()).sort(
      (left, right) => right[1] - left[1]
    )[0]?.[0] ?? encounter.labelHint ?? "Encounter";

  return {
    id: encounter.id,
    label: primaryTargetName,
    startedAt: encounter.startedAt,
    endedAt,
    durationMs,
    totalDamage: encounter.totalDamage,
    totalHealing: encounter.totalHealing,
    damageTaken: encounter.damageTaken,
    dps: encounter.totalDamage / durationSeconds,
    hps: encounter.totalHealing / durationSeconds,
    critCount: encounter.critCount,
    hitCount: encounter.hitCount,
    critRate:
      encounter.hitCount === 0 ? 0 : encounter.critCount / encounter.hitCount,
    topSkills,
    eventCount: encounter.eventCount
  };
}
