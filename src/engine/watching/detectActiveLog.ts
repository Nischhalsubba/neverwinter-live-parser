import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const VALID_LOG_PATTERN = /^combatlog_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:\.(?:log|txt))?$/i;
const TIMESTAMPED_LOG_PATTERN =
  /^combatlog_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:\.(?:log|txt))?$/i;

type LogCandidate = {
  candidate: string;
  timestampMs: number | null;
  mtimeMs: number;
};

export function parseCombatLogTimestamp(filePath: string): number | null {
  const match = path.basename(filePath).match(TIMESTAMPED_LOG_PATTERN);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  ).getTime();

  return Number.isNaN(parsed) ? null : parsed;
}

function compareCandidates(left: LogCandidate, right: LogCandidate): number {
  if (left.mtimeMs !== right.mtimeMs) {
    return right.mtimeMs - left.mtimeMs;
  }

  if (
    left.timestampMs !== null &&
    right.timestampMs !== null &&
    left.timestampMs !== right.timestampMs
  ) {
    return right.timestampMs - left.timestampMs;
  }

  if (left.timestampMs !== null && right.timestampMs === null) {
    return -1;
  }

  if (left.timestampMs === null && right.timestampMs !== null) {
    return 1;
  }

  return right.candidate.localeCompare(left.candidate);
}

export async function detectActiveLogFile(
  folderPath: string,
  currentFilePath?: string | null
): Promise<string | null> {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const candidates = new Set(
    entries
    .filter((entry) => entry.isFile() && VALID_LOG_PATTERN.test(entry.name))
      .map((entry) => path.join(folderPath, entry.name))
  );

  if (currentFilePath && path.dirname(currentFilePath) === folderPath) {
    candidates.add(currentFilePath);
  }

  if (candidates.size === 0) {
    return null;
  }

  const withStats = (
    await Promise.allSettled(
      Array.from(candidates).map(async (candidate) => ({
        candidate,
        stats: await stat(candidate),
        timestampMs: parseCombatLogTimestamp(candidate)
      }))
    )
  )
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .filter((candidate) => candidate.stats.isFile());

  if (withStats.length === 0) {
    return null;
  }

  if (currentFilePath) {
    const currentCandidate = withStats.find((candidate) => candidate.candidate === currentFilePath);
    if (currentCandidate) {
      const currentTimestamp = currentCandidate.timestampMs;
      const newerTimestampExists = withStats.some(
        (candidate) =>
          candidate.candidate !== currentFilePath &&
          candidate.timestampMs !== null &&
          currentTimestamp !== null &&
          candidate.timestampMs > currentTimestamp
      );

      if (!newerTimestampExists) {
        return currentFilePath;
      }
    }
  }

  withStats.sort((left, right) =>
    compareCandidates(
      {
        candidate: left.candidate,
        timestampMs: left.timestampMs,
        mtimeMs: left.stats.mtimeMs
      },
      {
        candidate: right.candidate,
        timestampMs: right.timestampMs,
        mtimeMs: right.stats.mtimeMs
      }
    )
  );

  return withStats[0]?.candidate ?? null;
}
/**
 * Active combat-log selection helper.
 * Chooses the most plausible live Neverwinter combat log in a folder by
 * combining activity and filename heuristics.
 */
