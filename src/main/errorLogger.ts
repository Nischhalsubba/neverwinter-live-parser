import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");
const { app } = electron;

export type ErrorLogEntry = {
  name: string;
  path: string;
  sizeBytes: number;
  updatedAt: number;
};

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

export async function listErrorLogs(): Promise<ErrorLogEntry[]> {
  const logDirectory = getLogDirectory();

  try {
    await fs.mkdir(logDirectory, { recursive: true });
    const entries = await fs.readdir(logDirectory, { withFileTypes: true });
    const logs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
        .map(async (entry) => {
          const filePath = path.join(logDirectory, entry.name);
          const stats = await fs.stat(filePath);
          return {
            name: entry.name,
            path: filePath,
            sizeBytes: stats.size,
            updatedAt: stats.mtimeMs
          };
        })
    );

    return logs.sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export async function readErrorLog(fileName: string): Promise<string> {
  const logDirectory = getLogDirectory();
  const safeName = path.basename(fileName);
  const filePath = path.join(logDirectory, safeName);

  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}
