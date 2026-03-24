import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export function getLogDirectory(): string {
  try {
    return path.join(process.cwd(), ".logs");
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

export async function writeRendererLog(message: string, context = "Renderer log"): Promise<void> {
  const logDirectory = getLogDirectory();
  const fileName = `renderer-${new Date().toISOString().slice(0, 10)}.log`;
  const filePath = path.join(logDirectory, fileName);

  try {
    await fs.mkdir(logDirectory, { recursive: true });
    const timestamp = new Date().toISOString();
    await fs.appendFile(filePath, `[${timestamp}] ${context}\n${message}\n\n`, "utf8");
  } catch {
    // Ignore renderer logging failures for the same reason as main-process logs.
  }
}

export async function clearErrorLogs(): Promise<void> {
  const logDirectory = getLogDirectory();

  try {
    const entries = await fs.readdir(logDirectory, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
        .map((entry) => fs.unlink(path.join(logDirectory, entry.name)))
    );
  } catch {
    // Nothing to clear or log directory unavailable.
  }
}
