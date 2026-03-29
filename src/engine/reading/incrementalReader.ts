import { open } from "node:fs/promises";
import { splitBufferedLines } from "./lineBuffer.js";

export type ReaderState = {
  activeFilePath: string | null;
  lastReadOffset: number;
  leftoverPartialLine: string;
};

export type ReaderReadResult = {
  lines: string[];
  state: ReaderState;
  bytesRead: number;
};

export function createInitialReaderState(): ReaderState {
  return {
    activeFilePath: null,
    lastReadOffset: 0,
    leftoverPartialLine: ""
  };
}

export async function readAppendedLines(
  filePath: string,
  previousState: ReaderState
): Promise<ReaderReadResult> {
  const hasSwitchedFiles = previousState.activeFilePath !== filePath;
  const baseState = hasSwitchedFiles
    ? createInitialReaderState()
    : previousState;

  const handle = await open(filePath, "r");
  try {
    const stats = await handle.stat();
    const startOffset =
      stats.size < baseState.lastReadOffset ? 0 : baseState.lastReadOffset;
    const bytesToRead = Math.max(0, stats.size - startOffset);

    if (bytesToRead === 0) {
      return {
        lines: [],
        bytesRead: 0,
        state: {
          ...baseState,
          activeFilePath: filePath
        }
      };
    }

    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, startOffset);
    const content = buffer.subarray(0, bytesRead).toString("utf8");
    const split = splitBufferedLines(baseState.leftoverPartialLine, content);

    return {
      lines: split.lines,
      bytesRead,
      state: {
        activeFilePath: filePath,
        lastReadOffset: startOffset + bytesRead,
        leftoverPartialLine: split.leftover
      }
    };
  } finally {
    await handle.close();
  }
}
/**
 * Incremental file reader.
 * Reads only newly appended bytes from active log files and keeps file offsets
 * stable across live polling cycles.
 */
