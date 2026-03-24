import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

function getLogDirectory(): string {
  try {
    return path.join(app.getPath("userData"), "logs");
  } catch {
    return path.join(process.cwd(), ".logs");
  }
}

function toLogMessage(error: unknown, context: string): string {
  const timestamp = new Date().toISOString();
  if (error instanceof Error) {
    return `[${timestamp}] ${context}\n${error.stack ?? error.message}\n\n`;
  }
  return `[${timestamp}] ${context}\n${String(error)}\n\n`;
}

export async function writeErrorLog(error: unknown, context: string): Promise<void> {
  const logDirectory = getLogDirectory();
  const fileName = `main-process-${new Date().toISOString().slice(0, 10)}.log`;
  const filePath = path.join(logDirectory, fileName);

  try {
    await fs.mkdir(logDirectory, { recursive: true });
    await fs.appendFile(filePath, toLogMessage(error, context), "utf8");
  } catch {
    // Avoid recursive logging failures if the disk path itself is unavailable.
  }
}
