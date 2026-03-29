/**
 * Development Electron launcher.
 * Watches compiled desktop files, guarantees a clean Electron runtime
 * environment, and restarts the desktop process without shell quoting issues.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import chokidar from "chokidar";

const require = createRequire(import.meta.url);
const env = { ...process.env };

// Some Windows environments export this globally, which makes Electron boot as
// plain Node. Drop it here so the launcher behaves consistently for everyone.
delete env.ELECTRON_RUN_AS_NODE;
env.VITE_DEV_SERVER_URL = "http://127.0.0.1:5173";

const repoRoot = process.cwd();
const electronBinary = require("electron");
const electronEntry = path.resolve(repoRoot, "dist-electron", "desktop", "runtime", "main.js");

let child = null;
let restarting = false;
let restartTimer = null;

function stopChild() {
  return new Promise((resolve) => {
    if (!child) {
      resolve();
      return;
    }

    const current = child;
    child = null;

    current.once("exit", () => resolve());
    current.kill();
  });
}

function startChild() {
  child = spawn(electronBinary, [electronEntry], {
    stdio: "inherit",
    env
  });

  child.on("error", (error) => {
    console.error("Failed to launch Electron dev process:", error);
  });

  child.on("exit", (code, signal) => {
    if (signal || restarting) {
      return;
    }

    if (code && code !== 0) {
      console.error(`Electron exited with code ${code}. Waiting for file changes...`);
    }
  });
}

async function restartChild() {
  restarting = true;
  await stopChild();
  startChild();
  restarting = false;
}

function scheduleRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartChild();
  }, 150);
}

const watcher = chokidar.watch(path.resolve(repoRoot, "dist-electron"), {
  ignoreInitial: true
});

watcher.on("all", (_event, changedPath) => {
  if (!/\.(js|mjs)$/.test(changedPath)) {
    return;
  }
  scheduleRestart();
});

startChild();

async function shutdown(signal) {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  await watcher.close();
  await stopChild();
  process.exit(signal ? 0 : 0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
