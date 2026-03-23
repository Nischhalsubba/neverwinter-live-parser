import { describe, expect, it } from "vitest";
import { EncounterManager } from "./encounterManager.js";

describe("EncounterManager", () => {
  it("starts and completes encounters on inactivity", () => {
    const manager = new EncounterManager(10_000);

    manager.consume({
      raw: "line",
      timestamp: 1000,
      eventType: "damage",
      abilityName: "Heavy Slash",
      amount: 100
    });

    expect(manager.getCurrentSnapshot(6000)?.totalDamage).toBe(100);

    manager.flush(12_000);
    expect(manager.getCurrentSnapshot(12_000)).toBeNull();
    expect(manager.getCompleted()).toHaveLength(1);
  });
});
