import { describe, expect, it } from "vitest";
import {
  applyEventToEncounter,
  createEncounter,
  finalizeEncounter
} from "./encounterAggregator.js";

describe("encounterAggregator", () => {
  it("computes totals and rates", () => {
    const encounter = createEncounter("enc-1", 0);

    applyEventToEncounter(encounter, {
      raw: "a",
      timestamp: 1000,
      eventType: "damage",
      abilityName: "Strike",
      amount: 200,
      critical: true
    });

    applyEventToEncounter(encounter, {
      raw: "b",
      timestamp: 2000,
      eventType: "heal",
      abilityName: "Mend",
      amount: 100
    });

    const result = finalizeEncounter(encounter, 4000);
    expect(result.totalDamage).toBe(200);
    expect(result.totalHealing).toBe(100);
    expect(result.dps).toBe(50);
    expect(result.hps).toBe(25);
    expect(result.critRate).toBe(0.5);
  });
});
