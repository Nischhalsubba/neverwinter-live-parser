import type {
  AnalysisSnapshot,
  CombatEvent,
  CombatantEncounterStat,
  CombatantSnapshot,
  EncounterSnapshot,
  SkillStat,
  TargetStat,
  TimelinePoint
} from "../../shared/types.js";

type MutableEncounterTotals = {
  encounterId: string;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  hits: number;
};

type MutableCombatant = {
  id: string;
  ownerId: string;
  ownerName: string;
  displayName: string;
  type: CombatantSnapshot["type"];
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  hits: number;
  critCount: number;
  flankCount: number;
  deaths: number;
  skillTotals: Map<string, SkillStat>;
  targetTotals: Map<string, TargetStat>;
  timeline: Map<number, TimelinePoint>;
  encounterTotals: Map<string, MutableEncounterTotals>;
};

const TIMELINE_BUCKET_SECONDS = 5;

export class CombatantTracker {
  private readonly combatants = new Map<string, MutableCombatant>();
  private startedAt?: number;
  private endedAt?: number;
  private parsedEvents = 0;
  private totalLines = 0;

  registerLine(): void {
    this.totalLines += 1;
  }

  consume(event: CombatEvent, encounterId: string | null): void {
    this.parsedEvents += 1;
    this.startedAt =
      this.startedAt === undefined
        ? event.timestamp
        : Math.min(this.startedAt, event.timestamp);
    this.endedAt =
      this.endedAt === undefined
        ? event.timestamp
        : Math.max(this.endedAt, event.timestamp);

    if (!event.sourceName) {
      return;
    }

    const combatant = this.getOrCreateCombatant(event);
    const amount = event.amount ?? 0;

    if (event.eventType === "damage") {
      combatant.totalDamage += amount;
      combatant.hits += 1;
      if (event.targetName) {
        const target = combatant.targetTotals.get(event.targetName) ?? {
          targetName: event.targetName,
          totalDamage: 0,
          hits: 0,
          critCount: 0
        };
        target.totalDamage += amount;
        target.hits += 1;
        if (event.critical) {
          target.critCount += 1;
        }
        combatant.targetTotals.set(event.targetName, target);
      }
    } else if (event.eventType === "heal") {
      combatant.totalHealing += amount;
      combatant.hits += 1;
    } else if (event.eventType === "damageTaken") {
      combatant.damageTaken += amount;
      combatant.hits += 1;
    } else if (event.eventType === "death") {
      combatant.deaths += 1;
    }

    if (event.critical) {
      combatant.critCount += 1;
    }
    if (event.flags?.some((flag) => flag.toLowerCase() === "flank")) {
      combatant.flankCount += 1;
    }

    if (event.abilityName && (event.eventType === "damage" || event.eventType === "heal")) {
      const current = combatant.skillTotals.get(event.abilityName) ?? {
        abilityName: event.abilityName,
        total: 0,
        hits: 0
      };
      current.total += amount;
      current.hits += 1;
      combatant.skillTotals.set(event.abilityName, current);
    }

    const offsetSeconds = this.startedAt
      ? Math.max(0, Math.floor((event.timestamp - this.startedAt) / 1000))
      : 0;
    const bucket = Math.floor(offsetSeconds / TIMELINE_BUCKET_SECONDS) * TIMELINE_BUCKET_SECONDS;
    const point = combatant.timeline.get(bucket) ?? {
      second: bucket,
      damage: 0,
      healing: 0,
      hits: 0
    };
    if (event.eventType === "damage") {
      point.damage += amount;
    } else if (event.eventType === "heal") {
      point.healing += amount;
    }
    if (event.eventType === "damage" || event.eventType === "heal") {
      point.hits += 1;
    }
    combatant.timeline.set(bucket, point);

    if (encounterId) {
      const currentEncounter = combatant.encounterTotals.get(encounterId) ?? {
        encounterId,
        totalDamage: 0,
        totalHealing: 0,
        damageTaken: 0,
        hits: 0
      };
      if (event.eventType === "damage") {
        currentEncounter.totalDamage += amount;
      } else if (event.eventType === "heal") {
        currentEncounter.totalHealing += amount;
      } else if (event.eventType === "damageTaken") {
        currentEncounter.damageTaken += amount;
      }
      if (event.eventType === "damage" || event.eventType === "heal") {
        currentEncounter.hits += 1;
      }
      combatant.encounterTotals.set(encounterId, currentEncounter);
    }
  }

  snapshot(
    mode: AnalysisSnapshot["mode"],
    sourcePath: string | null,
    encounterSnapshots: EncounterSnapshot[]
  ): AnalysisSnapshot {
    const durationMs =
      this.startedAt !== undefined && this.endedAt !== undefined
        ? Math.max(this.endedAt - this.startedAt, 1)
        : 0;
    const durationSeconds = durationMs > 0 ? durationMs / 1000 : 1;
    const encounterMap = new Map(encounterSnapshots.map((encounter) => [encounter.id, encounter]));

    const combatants = Array.from(this.combatants.values())
      .map<CombatantSnapshot>((combatant) => ({
        id: combatant.id,
        ownerId: combatant.ownerId,
        ownerName: combatant.ownerName,
        displayName: combatant.displayName,
        type: combatant.type,
        totalDamage: combatant.totalDamage,
        totalHealing: combatant.totalHealing,
        damageTaken: combatant.damageTaken,
        hits: combatant.hits,
        critCount: combatant.critCount,
        critRate: combatant.hits === 0 ? 0 : combatant.critCount / combatant.hits,
        flankRate: combatant.hits === 0 ? 0 : combatant.flankCount / combatant.hits,
        dps: combatant.totalDamage / durationSeconds,
        hps: combatant.totalHealing / durationSeconds,
        topSkills: Array.from(combatant.skillTotals.values())
          .sort((left, right) => right.total - left.total)
          .slice(0, 12),
        targets: Array.from(combatant.targetTotals.values())
          .sort((left, right) => right.totalDamage - left.totalDamage)
          .slice(0, 20),
        timeline: Array.from(combatant.timeline.values()).sort(
          (left, right) => left.second - right.second
        ),
        encounters: Array.from(combatant.encounterTotals.values())
          .map<CombatantEncounterStat>((encounter) => ({
            encounterId: encounter.encounterId,
            totalDamage: encounter.totalDamage,
            totalHealing: encounter.totalHealing,
            damageTaken: encounter.damageTaken,
            hits: encounter.hits
          }))
          .sort((left, right) => {
            const leftEncounter = encounterMap.get(left.encounterId);
            const rightEncounter = encounterMap.get(right.encounterId);
            return (leftEncounter?.startedAt ?? 0) - (rightEncounter?.startedAt ?? 0);
          }),
        deaths: combatant.deaths
      }))
      .sort((left, right) => right.totalDamage - left.totalDamage);

    return {
      mode,
      sourcePath,
      totalLines: this.totalLines,
      parsedEvents: this.parsedEvents,
      durationMs,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      combatants
    };
  }

  private getOrCreateCombatant(event: CombatEvent): MutableCombatant {
    const id = event.sourceId || event.sourceName || "unknown";
    const existing = this.combatants.get(id);
    if (existing) {
      return existing;
    }

    const created: MutableCombatant = {
      id,
      ownerId: event.sourceOwnerId || id,
      ownerName: event.sourceOwnerName || event.sourceName || id,
      displayName: event.sourceName || id,
      type: event.sourceType ?? "unknown",
      totalDamage: 0,
      totalHealing: 0,
      damageTaken: 0,
      hits: 0,
      critCount: 0,
      flankCount: 0,
      deaths: 0,
      skillTotals: new Map<string, SkillStat>(),
      targetTotals: new Map<string, TargetStat>(),
      timeline: new Map<number, TimelinePoint>(),
      encounterTotals: new Map<string, MutableEncounterTotals>()
    };
    this.combatants.set(id, created);
    return created;
  }
}
