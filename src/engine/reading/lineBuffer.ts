export type LineBufferResult = {
  lines: string[];
  leftover: string;
};

function hasBalancedQuotes(input: string): boolean {
  let quoteCount = 0;
  for (const char of input) {
    if (char === "\"") {
      quoteCount += 1;
    }
  }
  return quoteCount % 2 === 0;
}

export function splitBufferedLines(
  previousLeftover: string,
  chunk: string
): LineBufferResult {
  const merged = `${previousLeftover}${chunk}`;
  const normalized = merged.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  const trailingPartial = parts.pop() ?? "";
  const lines: string[] = [];
  let pending = "";

  for (const part of parts) {
    pending = pending ? `${pending}\n${part}` : part;
    if (!hasBalancedQuotes(pending)) {
      continue;
    }

    if (pending.length > 0) {
      lines.push(pending);
    }
    pending = "";
  }

  const leftover = pending
    ? trailingPartial
      ? `${pending}\n${trailingPartial}`
      : pending
    : trailingPartial;

  return { lines, leftover };
}
/**
 * Buffered line splitting utilities.
 * Handles partial reads and multiline quoted records so incremental reads
 * reconstruct logical Neverwinter records safely.
 */
