import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const VALID_LOG_PATTERN = /^combatlog_.*\.log$/i;

export async function detectActiveLogFile(
  folderPath: string
): Promise<string | null> {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && VALID_LOG_PATTERN.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name));

  if (candidates.length === 0) {
    return null;
  }

  const withStats = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      stats: await stat(candidate)
    }))
  );

  withStats.sort(
    (left, right) => right.stats.mtimeMs - left.stats.mtimeMs
  );

  return withStats[0]?.candidate ?? null;
}
