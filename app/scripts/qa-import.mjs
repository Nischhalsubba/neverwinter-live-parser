import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { LogMonitorService } from "../dist-electron/core/monitoring/logMonitorService.js";

const eventCount = Number(process.env.QA_IMPORT_EVENTS ?? 150_000);
const maxAllowedEventLoopDelayMs = Number(
  process.env.QA_MAX_EVENT_LOOP_DELAY_MS ?? 750
);
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nw-parser-qa-"));
const filePath = path.join(tempRoot, "renamed-recorded-session.txt");
const damagePerEvent = 85_849.5;
const line =
  "26:02:14:19:15:57.6::ozymandias,P[518492955@34098842 ozymandias@namelessf#36888]," +
  ",*,Valkariel, the Corrupted,C[37 M31_Trial_Boss_Valkariel]," +
  `Cloud of Steel,Pn.Kr3spo,Physical,Critical,57805.3,${damagePerEvent}\n`;

await writeFile(filePath, line.repeat(eventCount), "utf8");

const monitor = new LogMonitorService();
let maxEventLoopDelayMs = 0;
let lastHeartbeat = performance.now();
const heartbeatIntervalMs = 25;
const heartbeat = setInterval(() => {
  const now = performance.now();
  maxEventLoopDelayMs = Math.max(
    maxEventLoopDelayMs,
    Math.max(0, now - lastHeartbeat - heartbeatIntervalMs)
  );
  lastHeartbeat = now;
}, heartbeatIntervalMs);

const startedAt = performance.now();
try {
  const state = await monitor.importLogFile(filePath);
  const elapsedMs = performance.now() - startedAt;
  const player = state.analysis.combatants.find(
    (combatant) => combatant.ownerId.startsWith("P[")
  );
  const expectedDamage = damagePerEvent * eventCount;

  if (state.analysis.totalLines !== eventCount) {
    throw new Error(
      `Expected ${eventCount} lines, parsed ${state.analysis.totalLines}.`
    );
  }
  if (state.analysis.parsedEvents !== eventCount) {
    throw new Error(
      `Expected ${eventCount} events, parsed ${state.analysis.parsedEvents}.`
    );
  }
  if (!player) {
    throw new Error("Expected a player combatant in imported state.");
  }
  if (Math.abs(player.totalDamage - expectedDamage) > 0.5) {
    throw new Error(
      `Damage mismatch: expected ${expectedDamage}, got ${player.totalDamage}.`
    );
  }
  if (maxEventLoopDelayMs > maxAllowedEventLoopDelayMs) {
    throw new Error(
      `Main event loop stalled for ${maxEventLoopDelayMs.toFixed(1)}ms; budget is ${maxAllowedEventLoopDelayMs}ms.`
    );
  }

  console.log(
    JSON.stringify(
      {
        eventCount,
        elapsedMs: Number(elapsedMs.toFixed(1)),
        maxEventLoopDelayMs: Number(maxEventLoopDelayMs.toFixed(1)),
        totalDamage: player.totalDamage,
        sourceFile: path.basename(filePath)
      },
      null,
      2
    )
  );
} finally {
  clearInterval(heartbeat);
  await monitor.stop();
  await rm(tempRoot, { recursive: true, force: true });
}
