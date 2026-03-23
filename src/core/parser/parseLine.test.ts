import { describe, expect, it } from "vitest";
import { parseLine } from "./parseLine.js";

describe("parseLine", () => {
  it("parses a direct player damage line from the real Neverwinter format", () => {
    const result = parseLine(
      "26:03:23:18:39:32.7::Ar-chew,P[517568826@33087734 Ar-chew@imortal#9562],,," +
        "Corrupt Black Ice Crit,Pn.Wbt9jz,Power,,-12.5,0"
    );

    expect(result.kind).toBe("issue");
    if (result.kind === "issue") {
      expect(result.event.sourceName).toBe("Ar-chew");
      expect(result.event.abilityName).toBe("Corrupt Black Ice Crit");
    }
  });

  it("parses a companion damage line and marks the companion as the source", () => {
    const result = parseLine(
      "26:03:23:18:39:34.7::Ar-chew,P[517568826@33087734 Ar-chew@imortal#9562]," +
        "Captain Elaina Sartell,C[453444 Pet_M28_Elaina_Sartell]," +
        "Target Dummy,C[453377 Entity_Targetdummy],Bleed,Pn.Nnm30r1,Physical,DoT,1049.39,1574.08"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.eventType).toBe("damage");
      expect(result.event.sourceOwnerName).toBe("Ar-chew");
      expect(result.event.sourceName).toBe("Captain Elaina Sartell");
      expect(result.event.sourceType).toBe("companion");
      expect(result.event.targetName).toBe("Target Dummy");
      expect(result.event.amount).toBeCloseTo(1574.08);
    }
  });

  it("returns an issue for malformed lines", () => {
    const result = parseLine("[18:42:11] System message that does not match");
    expect(result.kind).toBe("issue");
    if (result.kind === "issue") {
      expect(result.issue.reason).toMatch(/separator|field count/i);
      expect(result.event.eventType).toBe("unknown");
    }
  });
});
