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
  hasMore: boolean;
};

export const DEFAULT_MAX_READ_BYTES = 512 * 1024;

export function createInitialReaderState(): ReaderState {
  return {
    activeFilePath: null,
    lastReadOffset: 0,
    leftoverPartialLine: ""
  };
}

export async function readAppendedLines(
  filePath: string,
  previousState: ReaderState,
  maxReadBytes = DEFAULT_MAX_READ_BYTES
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
    const unreadBytes = Math.max(0, stats.size - startOffset);

    if (unreadBytes === 0) {
      return {
        lines: [],
        bytesRead: 0,
        hasMore: false,
        state: {
          ...baseState,
          activeFilePath: filePath
        }
      };
    }

    const bytesToRead = Math.min(
      unreadBytes,
      Math.max(1, Math.floor(maxReadBytes))
    );
    const buffer = Buffer.allocUnsafe(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, startOffset);
    const content = buffer.subarray(0, bytesRead).toString("utf8");
    const split = splitBufferedLines(baseState.leftoverPartialLine, content);
    const nextOffset = startOffset + bytesRead;

    return {
      lines: split.lines,
      bytesRead,
      hasMore: nextOffset < stats.size,
      state: {
        activeFilePath: filePath,
        lastReadOffset: nextOffset,
        leftoverPartialLine: split.leftover
      }
    };
  } finally {
    await handle.close();
  }
}
