import { describe, expect, it } from "vitest";
import {
  applyAuxiliaryEventToSummary,
  createInitialAuxiliarySummary,
  parseAuxiliaryLogLine
} from "./parseAuxiliaryLogLine.js";

describe("parseAuxiliaryLogLine", () => {
  it("classifies system notify channel joins and updates summary state", () => {
    const event = parseAuxiliaryLogLine(
      "C:\\GameClient\\voicechat_2026-03-25_00-00-00.log",
      '[System Notify] Joined channel "Zone".'
    );

    expect(event).not.toBeNull();
    expect(event?.category).toBe("system");
    expect(event?.title).toBe("Joined channel");
    expect(event?.details).toMatchObject({
      action: "joined",
      channel: "Zone"
    });

    const summary = applyAuxiliaryEventToSummary(createInitialAuxiliarySummary(), event!);
    expect(summary.totalEvents).toBe(1);
    expect(summary.activeChannels).toEqual(["Zone"]);
    expect(summary.countsByCategory.system).toBe(1);
  });

  it("classifies crash lines as lifecycle and error-aware signals", () => {
    const event = parseAuxiliaryLogLine(
      "C:\\GameClient\\CRASH_2026-03-25_00-00-00.log",
      "[Error] Renderer device removed"
    );

    expect(event).not.toBeNull();
    expect(event?.kind).toBe("crash");
    expect(event?.category).toBe("error");
    expect(event?.title).toBe("System error");
  });
});
