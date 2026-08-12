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
      expect(snapshot.combatants[0]?.hits).toBe(0);
      expect(snapshot.combatants[0]?.encounters).toEqual([
      {
        encounterId: "enc-1",
        totalDamage: 0,
        totalHealing: 0,
        damageTaken: 12_345,
        hits: 0
      }
    ]);
  });

  it("does not retain thousands of NPC attackers in the player analysis map", () => {
    const tracker = new CombatantTracker();
    for (let index = 0; index < 5_000; index += 1) {
      tracker.registerLine();
      tracker.consume(
        {
          raw: `incoming-${index}`,
          timestamp: 1_000 + index,
          eventType: "damageTaken",
          sourceName: `Enemy ${index}`,
          sourceId: `C[${index} Enemy]`,
          sourceType: "npc",
          targetName: "Player",
          targetId: "P[2 Player]",
          targetType: "player",
          abilityName: "Strike",
          amount: 10
        },
        `enc-${index}`
      );
    }

    const snapshot = tracker.snapshot("imported", "test.log", []);
    const internalCombatants = (tracker as unknown as {
      combatants: Map<string, unknown>;
    }).combatants;

    expect(snapshot.combatants).toHaveLength(1);
    expect(snapshot.combatants[0]?.damageTaken).toBe(50_000);
    expect(snapshot.combatants[0]?.hits).toBe(0);
    expect(snapshot.combatants[0]?.encounters.length).toBeLessThanOrEqual(64);
    expect(internalCombatants.size).toBe(1);
  });
});
