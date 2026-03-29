import { describe, expect, it } from "vitest";
import { splitBufferedLines } from "./lineBuffer.js";

describe("splitBufferedLines", () => {
  it("returns complete lines and preserves the leftover partial line", () => {
    const result = splitBufferedLines("partial", " line\r\nnext line\nfinal");

    expect(result.lines).toEqual(["partial line", "next line"]);
    expect(result.leftover).toBe("final");
  });

  it("merges physical lines when a quoted field spans a newline", () => {
    const result = splitBufferedLines(
      "",
      '26:03:24:16:22:45.6::Lysaera,C[91 Pet_M31_Succubus],,*,Knatlli,P[514848798@7599734 Knatlli@kate4u],"Heartfelt Barrier\n",Pn.71k5r11,Shield,ShowPowerDisplayName,154503,0\nnext line'
    );

    expect(result.lines).toEqual([
      '26:03:24:16:22:45.6::Lysaera,C[91 Pet_M31_Succubus],,*,Knatlli,P[514848798@7599734 Knatlli@kate4u],"Heartfelt Barrier\n",Pn.71k5r11,Shield,ShowPowerDisplayName,154503,0'
    ]);
    expect(result.leftover).toBe("next line");
  });
});
