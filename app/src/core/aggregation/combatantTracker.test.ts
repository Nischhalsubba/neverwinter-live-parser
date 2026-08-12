import { describe, expect, it } from "vitest";
import { CombatantTracker } from "./combatantTracker.js";

describe("CombatantTracker", () => {
  it("attributes encounter-scoped incoming damage to the player target", () => {
    const tracker = new CombatantTracker();
    tracker.registerLine();
    tracker.consume(
      {
        raw: "incoming",
        timestamp: 1_000,
        eventType: "damageTaken",
        sourceName: "Boss",
        sourceId: "C[1 Boss]",
        sourceType: "npc",
        targetName: "Player",
        targetId: "P[2 Player]",
        targetType: "player",
        abilityName: "Heavy Strike",
        amount: 12_345
      },
      "enc-1"
    );

    const snapshot = tracker.snapshot("imported", "test.log", [
      {
        id: "enc-1",
        label: "Boss",
        startedAt: 1_000,
        endedAt: 1_001,
        durationMs: 1,
        totalDamage: 0,
        totalHealing: 0,
        damageTaken: 12_345,
        dps: 0,
        hps: 0,
        critCount: 0,
        hitCount: 1,
        critRate: 0,
        topSkills: [],
        eventCount: 1
      }
    ]);

    expect(snapshot.combatants).toHaveLength(1);
    expect(snapshot.combatants[0]?.displayName).toBe("Player");
    expect(snapshot.combatants[0]?.damageTaken).toBe(12_345);
    expect(snapshot.combatants[0]?.encounters).toEqual([
      {
        encounterId: "enc-1",
        totalDamage: 0,
        totalHealing: 0,
        damageTaken: 12_345,
        hits: 1
      }
    ]);
  });
});
