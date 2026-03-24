import { describe, expect, it } from "vitest";
import { parseLine } from "./parseLine.js";

describe("parseLine", () => {
  it("parses a direct player damage line with a comma in the target name", () => {
    const result = parseLine(
      "26:02:14:19:15:57.6::ozymandias,P[518492955@34098842 ozymandias@namelessf#36888]," +
        ",*,Valkariel, the Corrupted,C[37 M31_Trial_Boss_Valkariel]," +
        "Cloud of Steel,Pn.Kr3spo,Physical,Critical,57805.3,85849.5"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.sourceName).toBe("ozymandias");
      expect(result.event.sourceId).toContain("P[518492955");
      expect(result.event.targetName).toBe("Valkariel, the Corrupted");
      expect(result.event.targetId).toContain("C[37 M31_Trial_Boss_Valkariel]");
      expect(result.event.abilityName).toBe("Cloud of Steel");
      expect(result.event.abilityId).toBe("Pn.Kr3spo");
      expect(result.event.eventType).toBe("damage");
      expect(result.event.amount).toBeCloseTo(85849.5);
    }
  });

  it("parses a healing line and keeps owner and target identity intact", () => {
    const result = parseLine(
      "26:02:14:19:11:57.0::Ilerae Shielderae,P[518778448@33856673 Ilerae Shielderae@meljiu#75254]," +
        ",*,ozymandias,P[518492955@34098842 ozymandias@namelessf#36888]," +
        "Divine Shelter,Pn.H01v7m,HitPoints,Critical,-345619,-290808"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.sourceName).toBe("Ilerae Shielderae");
      expect(result.event.targetName).toBe("ozymandias");
      expect(result.event.eventType).toBe("heal");
      expect(result.event.amount).toBeCloseTo(345619);
      expect(result.event.critical).toBe(true);
    }
  });

  it("parses a companion damage line and marks the companion as the source", () => {
    const result = parseLine(
      "26:02:14:19:17:00.8::ozymandias,P[518492955@34098842 ozymandias@namelessf#36888]," +
        "Captain Elaina Sartell,C[227 Pet_M28_Elaina_Sartell]," +
        "Valkariel, the Corrupted,C[37 M31_Trial_Boss_Valkariel]," +
        "Bleed,Pn.Nnm30r1,Physical,Dodge|DoT,1392.39,1639"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.eventType).toBe("damage");
      expect(result.event.sourceOwnerName).toBe("ozymandias");
      expect(result.event.sourceName).toBe("Captain Elaina Sartell");
      expect(result.event.sourceType).toBe("companion");
      expect(result.event.targetName).toBe("Valkariel, the Corrupted");
      expect(result.event.amount).toBeCloseTo(1639);
    }
  });

  it("keeps player summons with the player instead of treating them as companions", () => {
    const result = parseLine(
      "26:02:14:19:16:12.2::Ar-chew,P[517568826@33087734 Ar-chew@imortal#9562]," +
        "Thorn Ward,C[53 Entity_Thornward],Valkariel, the Corrupted,C[37 M31_Trial_Boss_Valkariel]," +
        "Thorn Ward,Pn.Xjmuo31,Physical,Critical|Dodge|Flank|DoT,1.81504e+06,839927"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.sourceOwnerName).toBe("Ar-chew");
      expect(result.event.sourceName).toBe("Thorn Ward");
      expect(result.event.sourceType).toBe("player");
      expect(result.event.eventType).toBe("damage");
      expect(result.event.amount).toBeCloseTo(1815040);
    }
  });

  it("classifies display-only power name lines as benign buff records", () => {
    const result = parseLine(
      "26:02:14:19:10:10.1::Ilerae Shielderae,P[518778448@33856673 Ilerae Shielderae@meljiu#75254]," +
        ",*,,*,Critical Touch,Pn.W0mmhm,Null,ShowPowerDisplayName,0,0"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.sourceName).toBe("Ilerae Shielderae");
      expect(result.event.eventType).toBe("buff");
    }
  });

  it("classifies negative power lines as debuffs instead of parser issues", () => {
    const result = parseLine(
      "26:03:23:22:01:33.4::Ar-chew,P[517568826@33087734 Ar-chew@imortal#9562],,*,,*,Constricting Arrow,Pn.Tsj6qq1,Power,,-12.9652,0"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.eventType).toBe("debuff");
      expect(result.event.abilityName).toBe("Constricting Arrow");
    }
  });

  it("keeps targeted physical show-power lines as damage", () => {
    const result = parseLine(
      "26:03:23:22:01:33.6::Ar-chew,P[517568826@33087734 Ar-chew@imortal#9562],,*,Target Dummy,C[470521 Entity_Targetdummy],Lightning Flash,Pn.Wnize81,Physical,ShowPowerDisplayName,2698.43,0"
    );

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.eventType).toBe("damage");
      expect(result.event.targetName).toBe("Target Dummy");
      expect(result.event.amount).toBeCloseTo(2698.43);
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
