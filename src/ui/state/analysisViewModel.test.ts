import { describe, expect, it } from "vitest";
import type { CombatantSnapshot, EncounterSnapshot } from "../../shared/models/types";
import { buildPlayerRows, hasMeaningfulEncounter } from "./analysisViewModel";

function createCombatant(partial: Partial<CombatantSnapshot>): CombatantSnapshot {
  return {
    id: "unknown",
    ownerId: "unknown",
    ownerName: "unknown",
    displayName: "unknown",
    type: "unknown",
    totalDamage: 0,
    totalHealing: 0,
    damageTaken: 0,
    hits: 0,
    critCount: 0,
    critRate: 0,
    flankRate: 0,
    dps: 0,
    hps: 0,
    topSkills: [],
    targets: [],
    highestHits: [],
    timeline: [],
    activations: [],
    effects: [],
    encounters: [],
    deaths: 0,
    ...partial
  };
}

describe("buildPlayerRows", () => {
  it("rolls player-owned summons into the owning player row", () => {
    const rows = buildPlayerRows(
      [
        createCombatant({
          id: "P[1]",
          ownerId: "P[1]",
          ownerName: "Ar-chew",
          displayName: "Ar-chew",
          type: "player",
          totalDamage: 100
        }),
        createCombatant({
          id: "C[thorn]",
          ownerId: "P[1]",
          ownerName: "Ar-chew",
          displayName: "Thorn Ward",
          type: "player",
          totalDamage: 50
        }),
        createCombatant({
          id: "C[pet]",
          ownerId: "P[1]",
          ownerName: "Ar-chew",
          displayName: "Portobello",
          type: "companion",
          totalDamage: 25
        })
      ],
      true
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Ar-chew");
    expect(rows[0].totalDamage).toBe(175);
  });

  it("can scope rows to only the active encounter", () => {
    const rows = buildPlayerRows(
      [
        createCombatant({
          id: "P[1]",
          ownerId: "P[1]",
          ownerName: "Ar-chew",
          displayName: "Ar-chew",
          type: "player",
          totalDamage: 999,
          encounters: [
            { encounterId: "enc-1", totalDamage: 120, totalHealing: 0, damageTaken: 0, hits: 5 }
          ]
        }),
        createCombatant({
          id: "P[2]",
          ownerId: "P[2]",
          ownerName: "Other",
          displayName: "Other",
          type: "player",
          totalDamage: 999,
          encounters: [
            { encounterId: "enc-2", totalDamage: 300, totalHealing: 0, damageTaken: 0, hits: 10 }
          ]
        })
      ],
      true,
      { encounterId: "enc-1", encounterDurationMs: 10_000 }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Ar-chew");
    expect(rows[0].totalDamage).toBe(120);
    expect(rows[0].dps).toBe(12);
  });

  it("merges repeated target names and keeps the largest highest hits", () => {
    const rows = buildPlayerRows(
      [
        createCombatant({
          id: "P[1]",
          ownerId: "P[1]",
          ownerName: "Ar-chew",
          displayName: "Ar-chew",
          type: "player",
          targets: [
            { targetName: "Target Dummy", totalDamage: 100, hits: 2, critCount: 1 },
            { targetName: "Target Dummy.", totalDamage: 40, hits: 1, critCount: 0 }
          ],
          highestHits: [
            {
              abilityName: "Rapid Shot",
              amount: 1000,
              targetName: "Target Dummy",
              critical: false,
              second: 1,
              sourceType: "player"
            },
            {
              abilityName: "Rapid Shot",
              amount: 1500,
              targetName: "Target Dummy.",
              critical: true,
              second: 3,
              sourceType: "player"
            }
          ]
        })
      ],
      true
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].targets).toHaveLength(1);
    expect(rows[0].targets[0].totalDamage).toBe(140);
    expect(rows[0].highestHits[0].amount).toBe(1500);
  });
});

describe("hasMeaningfulEncounter", () => {
  it("treats zeroed placeholder encounters as not meaningful", () => {
    const encounter: EncounterSnapshot = {
      id: "enc-1",
      label: "Encounter",
      startedAt: Date.now(),
      durationMs: 1000,
      totalDamage: 0,
      totalHealing: 0,
      damageTaken: 0,
      dps: 0,
      hps: 0,
      critCount: 0,
      hitCount: 0,
      critRate: 0,
      topSkills: [],
      eventCount: 1
    };

    expect(hasMeaningfulEncounter(encounter)).toBe(false);
  });

  it("treats encounters with real combat totals as meaningful", () => {
    const encounter: EncounterSnapshot = {
      id: "enc-2",
      label: "Conjured Fighter",
      startedAt: Date.now(),
      durationMs: 12000,
      totalDamage: 120000,
      totalHealing: 0,
      damageTaken: 0,
      dps: 10000,
      hps: 0,
      critCount: 3,
      hitCount: 12,
      critRate: 0.25,
      topSkills: [],
      eventCount: 14
    };

    expect(hasMeaningfulEncounter(encounter)).toBe(true);
  });
});
