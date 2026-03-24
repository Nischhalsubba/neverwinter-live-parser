import { describe, expect, it } from "vitest";
import type { CombatantSnapshot } from "../shared/types";
import { buildPlayerRows } from "./analysisViewModel";

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
});
