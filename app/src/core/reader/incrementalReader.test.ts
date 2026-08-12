import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInitialReaderState,
  readAppendedLines
} from "./incrementalReader.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("readAppendedLines", () => {
  it("bounds each read instead of allocating the entire unread log", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nw-reader-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "combatlog_test.log");
    const line = "26:03:23:22:01:33.6::source,P[1],,*,target,C[2],Strike,Pn.Test,Physical,,100,100\n";
    await writeFile(filePath, line.repeat(20_000), "utf8");

    const first = await readAppendedLines(
      filePath,
      createInitialReaderState(),
      64 * 1024
    );

    expect(first.bytesRead).toBeLessThanOrEqual(64 * 1024);
    expect(first.hasMore).toBe(true);
    expect(first.state.lastReadOffset).toBe(first.bytesRead);

    const second = await readAppendedLines(filePath, first.state, 64 * 1024);
    expect(second.state.lastReadOffset).toBe(first.bytesRead + second.bytesRead);
    expect(second.lines.length).toBeGreaterThan(0);
  });
});
