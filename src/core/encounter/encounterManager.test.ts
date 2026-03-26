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

  it("rotates encounters when the primary damage target changes after a gap", () => {
    const manager = new EncounterManager(10_000);

    manager.consume({
      raw: "line-1",
      timestamp: 1_000,
      eventType: "damage",
      targetName: "Target Dummy",
      abilityName: "Heavy Slash",
      amount: 100
    });

    manager.consume({
      raw: "line-2",
      timestamp: 7_000,
      eventType: "damage",
      targetName: "Boss",
      abilityName: "Heavy Slash",
      amount: 200
    });

    expect(manager.getCompleted()).toHaveLength(1);
    expect(manager.getCompleted()[0]?.label).toBe("Target Dummy");
    expect(manager.getCurrentSnapshot(7_000)?.label).toBe("Boss");
  });
});
