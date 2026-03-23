import type {
  AnalysisSnapshot,
  CombatEvent,
  CombatantSnapshot,
  SkillStat
} from "../../shared/types.js";

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
  skillTotals: Map<string, SkillStat>;
};

export class CombatantTracker {
  private readonly combatants = new Map<string, MutableCombatant>();
  private startedAt?: number;
  private endedAt?: number;
  private parsedEvents = 0;
  private totalLines = 0;

  reset(): void {
    this.combatants.clear();
    this.startedAt = undefined;
    this.endedAt = undefined;
    this.parsedEvents = 0;
    this.totalLines = 0;
  }

  registerLine(): void {
    this.totalLines += 1;
  }

  consume(event: CombatEvent): void {
    this.parsedEvents += 1;
    this.startedAt = this.startedAt === undefined
      ? event.timestamp
      : Math.min(this.startedAt, event.timestamp);
    this.endedAt = this.endedAt === undefined
      ? event.timestamp
      : Math.max(this.endedAt, event.timestamp);

    if (!event.sourceName) {
      return;
    }

    const id = event.sourceId || event.sourceName;
    const ownerId = event.sourceOwnerId || id;
    const ownerName = event.sourceOwnerName || event.sourceName;
    const combatant = this.combatants.get(id) ?? {
      id,
      ownerId,
      ownerName,
      displayName: event.sourceName,
      type: event.sourceType ?? "unknown",
      totalDamage: 0,
      totalHealing: 0,
      damageTaken: 0,
      hits: 0,
      critCount: 0,
      skillTotals: new Map<string, SkillStat>()
    };

    const amount = event.amount ?? 0;
    if (event.eventType === "damage") {
      combatant.totalDamage += amount;
      combatant.hits += 1;
    } else if (event.eventType === "heal") {
      combatant.totalHealing += amount;
      combatant.hits += 1;
    } else if (event.eventType === "damageTaken") {
      combatant.damageTaken += amount;
      combatant.hits += 1;
    }

    if (event.critical) {
      combatant.critCount += 1;
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

    this.combatants.set(id, combatant);
  }

  snapshot(mode: AnalysisSnapshot["mode"], sourcePath: string | null): AnalysisSnapshot {
    const durationMs =
      this.startedAt !== undefined && this.endedAt !== undefined
        ? Math.max(this.endedAt - this.startedAt, 1)
        : 0;
    const durationSeconds = durationMs > 0 ? durationMs / 1000 : 1;
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
        dps: combatant.totalDamage / durationSeconds,
        hps: combatant.totalHealing / durationSeconds,
        topSkills: Array.from(combatant.skillTotals.values())
          .sort((left, right) => right.total - left.total)
          .slice(0, 8)
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
}
