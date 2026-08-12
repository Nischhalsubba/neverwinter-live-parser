import { describe, expect, it } from "vitest";
import { parseLine } from "../parser/parseLine.js";
import { CombatantTracker } from "./combatantTracker.js";

const EVENT_COUNT = 100_000;

describe("combat pipeline stress", () => {
  it("parses and aggregates a sustained six-figure event load with bounded detail arrays", () => {
    const tracker = new CombatantTracker();
    const startedAt = performance.now();

    for (let index = 0; index < EVENT_COUNT; index += 1) {
      const second = String(index % 60).padStart(2, "0");
      const parsed = parseLine(
        `26:03:23:22:01:${second}.0::Stress Player,P[1 Stress Player@test],,*,Target Dummy,C[2 Entity_Targetdummy],Stress Strike,Pn.Stress,Physical,Critical,125,100`
      );
      tracker.registerLine();
      if (parsed.kind !== "event") {
        throw new Error(parsed.issue.reason);
      }
      tracker.consume(parsed.event, "enc-stress");
    }

    const snapshot = tracker.snapshot("imported", "stress.log", []);
    const elapsedMs = performance.now() - startedAt;
    const player = snapshot.combatants[0];

    expect(snapshot.totalLines).toBe(EVENT_COUNT);
    expect(snapshot.parsedEvents).toBe(EVENT_COUNT);
    expect(player?.totalDamage).toBe(EVENT_COUNT * 100);
    expect(player?.damageMoments.length).toBeLessThanOrEqual(4_000);
    expect(player?.activations.length).toBeLessThanOrEqual(4_000);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 15_000);
});
