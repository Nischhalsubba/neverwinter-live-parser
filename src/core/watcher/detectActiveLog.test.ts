import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectActiveLogFile, parseCombatLogTimestamp } from "./detectActiveLog.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const current = tempDirs.pop();
    if (current) {
      await rm(current, { recursive: true, force: true });
    }
  }
});

describe("detectActiveLogFile", () => {
  it("prefers the newest timestamped combat log by filename", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "nw-log-test-"));
    tempDirs.push(folder);

    const older = path.join(folder, "combatlog_2026-03-23_00-00-00.log");
    const newer = path.join(folder, "combatlog_2026-03-23_12-30-00.log");

    await writeFile(older, "older");
    await writeFile(newer, "newer");
    await utimes(older, new Date("2026-03-23T23:59:59"), new Date("2026-03-23T23:59:59"));
    await utimes(newer, new Date("2026-03-23T00:00:01"), new Date("2026-03-23T00:00:01"));

    await expect(detectActiveLogFile(folder)).resolves.toBe(newer);
  });

  it("keeps a selected current file until a newer timestamped log exists", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "nw-log-test-"));
    tempDirs.push(folder);

    const selected = path.join(folder, "combatlog_2026-03-23_00-00-00.log");
    const older = path.join(folder, "combatlog_2026-03-22_23-59-59.log");

    await writeFile(selected, "selected");
    await writeFile(older, "older");

    await expect(detectActiveLogFile(folder, selected)).resolves.toBe(selected);
  });

  it("recognizes combat logs without a file extension", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "nw-log-test-"));
    tempDirs.push(folder);

    const older = path.join(folder, "combatlog_2026-03-23_00-00-00");
    const newer = path.join(folder, "combatlog_2026-03-24_07-00-00");

    await writeFile(older, "older");
    await writeFile(newer, "newer");

    await expect(detectActiveLogFile(folder)).resolves.toBe(newer);
  });

  it("recognizes combat logs saved as txt files", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "nw-log-test-"));
    tempDirs.push(folder);

    const older = path.join(folder, "combatlog_2026-03-23_00-00-00.txt");
    const newer = path.join(folder, "combatlog_2026-03-24_07-00-00.txt");

    await writeFile(older, "older");
    await writeFile(newer, "newer");

    await expect(detectActiveLogFile(folder)).resolves.toBe(newer);
  });
});

describe("parseCombatLogTimestamp", () => {
  it("extracts the embedded timestamp from combat log filenames", () => {
    const parsed = parseCombatLogTimestamp("combatlog_2026-03-23_00-00-00.log");
    expect(parsed).not.toBeNull();
    const date = new Date(parsed ?? 0);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(23);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it("extracts timestamps from filenames without a file extension", () => {
    const parsed = parseCombatLogTimestamp("combatlog_2026-03-24_07-00-00");
    expect(parsed).not.toBeNull();
  });

  it("extracts timestamps from txt combat logs", () => {
    const parsed = parseCombatLogTimestamp("combatlog_2026-03-24_07-00-00.txt");
    expect(parsed).not.toBeNull();
  });
});
