export type LineBufferResult = {
  lines: string[];
  leftover: string;
};

export function splitBufferedLines(
  previousLeftover: string,
  chunk: string
): LineBufferResult {
  const merged = `${previousLeftover}${chunk}`;
  const normalized = merged.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  const leftover = parts.pop() ?? "";
  const lines = parts.filter((line) => line.length > 0);

  return { lines, leftover };
}
