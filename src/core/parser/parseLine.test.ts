import { describe, expect, it } from "vitest";
import { parseLine } from "./parseLine.js";

describe("parseLine", () => {
  it("parses a damage line", () => {
    const result = parseLine(
      "[18:42:10] You hits Training Dummy with Heavy Slash for 12034 damage (Critical)."
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.eventType).toBe("damage");
      expect(result.event.amount).toBe(12034);
      expect(result.event.critical).toBe(true);
      expect(result.event.abilityName).toBe("Heavy Slash");
    }
  });

  it("returns an issue for an unknown line", () => {
    const result = parseLine("[18:42:11] System message that does not match");
    expect(result.kind).toBe("issue");
    if (result.kind === "issue") {
      expect(result.issue.reason).toMatch(/Unrecognized/);
      expect(result.event.eventType).toBe("unknown");
    }
  });
});
