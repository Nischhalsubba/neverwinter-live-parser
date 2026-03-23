import { describe, expect, it } from "vitest";
import { splitBufferedLines } from "./lineBuffer.js";

describe("splitBufferedLines", () => {
  it("returns complete lines and preserves the leftover partial line", () => {
    const result = splitBufferedLines("partial", " line\r\nnext line\nfinal");

    expect(result.lines).toEqual(["partial line", "next line"]);
    expect(result.leftover).toBe("final");
  });
});
