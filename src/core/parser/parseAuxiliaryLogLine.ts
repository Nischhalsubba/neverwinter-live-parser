import path from "node:path";
import type {
  AuxiliaryLogEvent,
  AuxiliaryLogKind,
  AuxiliaryLogSummary
} from "../../shared/types.js";
import { createInitialAuxiliarySummary } from "../../shared/auxiliaryLogs.js";

export { createInitialAuxiliarySummary } from "../../shared/auxiliaryLogs.js";

const FILE_KIND_PATTERNS: Array<{ pattern: RegExp; kind: AuxiliaryLogKind }> = [
  { pattern: /^voicechat_/i, kind: "voicechat" },
  { pattern: /^clientservercomm_/i, kind: "clientservercomm" },
  { pattern: /^crash_/i, kind: "crash" },
  { pattern: /^shutdown_/i, kind: "shutdown" },
  { pattern: /^makeshaderbins_/i, kind: "shader" },
  { pattern: /^pcl_/i, kind: "pcl" }
];

const CHANNEL_STATE_PATTERN =
  /^\[System Notify\]\s+(Joined|Left)\s+channel\s+"([^"]+)"\./i;

function categorizeLine(kind: AuxiliaryLogKind, line: string): AuxiliaryLogEvent["category"] {
  const lowered = line.toLowerCase();
  if (lowered.includes("[error]") || lowered.includes(" error ")) {
    return "error";
  }
  if (lowered.includes("[system notify]")) {
    return "system";
  }
  if (lowered.includes("[zone]") || lowered.includes("[trade]") || lowered.includes("[lfg]")) {
    return "chat";
  }
  if (kind === "voicechat") {
    return "voice";
  }
  if (kind === "shader") {
    return "shader";
  }
  if (kind === "crash" || kind === "shutdown") {
    return "lifecycle";
  }
  if (lowered.includes("warn")) {
    return "warning";
  }
  return "other";
}

function buildEventTitle(
  kind: AuxiliaryLogKind,
  category: AuxiliaryLogEvent["category"],
  line: string
): string {
  const channelMatch = line.match(CHANNEL_STATE_PATTERN);
  if (channelMatch) {
    return `${channelMatch[1]} channel`;
  }
  if (category === "error") {
    return "System error";
  }
  if (kind === "voicechat") {
    return "Voice chat activity";
  }
  if (kind === "clientservercomm") {
    return "Client-server event";
  }
  if (kind === "crash") {
    return "Crash log event";
  }
  if (kind === "shutdown") {
    return "Shutdown event";
  }
  if (kind === "shader") {
    return "Shader cache event";
  }
  if (kind === "pcl") {
    return "Launcher or patch event";
  }
  return "Auxiliary event";
}

function buildEventDetails(
  kind: AuxiliaryLogKind,
  line: string
): AuxiliaryLogEvent["details"] | undefined {
  const channelMatch = line.match(CHANNEL_STATE_PATTERN);
  if (channelMatch) {
    return {
      action: channelMatch[1].toLowerCase(),
      channel: channelMatch[2]
    };
  }

  if (/^\[[^\]]+\]/.test(line)) {
    const bracketMatch = line.match(/^\[([^\]]+)\]/);
    if (bracketMatch) {
      return {
        tag: bracketMatch[1],
        source: kind
      };
    }
  }

  return undefined;
}

export function classifyAuxiliaryLogKind(filePath: string): AuxiliaryLogKind {
  const baseName = path.basename(filePath);
  return FILE_KIND_PATTERNS.find((entry) => entry.pattern.test(baseName))?.kind ?? "other";
}

export function parseAuxiliaryLogLine(
  filePath: string,
  line: string
): AuxiliaryLogEvent | null {
  const text = line.trim();
  if (!text) {
    return null;
  }

  const kind = classifyAuxiliaryLogKind(filePath);
  const category = categorizeLine(kind, text);
  return {
    fileName: path.basename(filePath),
    filePath,
    kind,
    category,
    seenAt: Date.now(),
    title: buildEventTitle(kind, category, text),
    text,
    details: buildEventDetails(kind, text)
  };
}

export function applyAuxiliaryEventToSummary(
  summary: AuxiliaryLogSummary,
  event: AuxiliaryLogEvent
): AuxiliaryLogSummary {
  const nextActiveChannels = new Set(summary.activeChannels);
  if (typeof event.details?.channel === "string" && typeof event.details?.action === "string") {
    if (event.details.action === "joined") {
      nextActiveChannels.add(event.details.channel);
    } else if (event.details.action === "left") {
      nextActiveChannels.delete(event.details.channel);
    }
  }

  return {
    totalEvents: summary.totalEvents + 1,
    countsByKind: {
      ...summary.countsByKind,
      [event.kind]: summary.countsByKind[event.kind] + 1
    },
    countsByCategory: {
      ...summary.countsByCategory,
      [event.category]: summary.countsByCategory[event.category] + 1
    },
    activeChannels: Array.from(nextActiveChannels).sort((left, right) => left.localeCompare(right)),
    lastLifecycleEvent:
      event.category === "lifecycle" ? event : summary.lastLifecycleEvent,
    lastCrashEvent: event.kind === "crash" ? event : summary.lastCrashEvent,
    recentSystemNotifications:
      event.category === "system"
        ? [event, ...summary.recentSystemNotifications].slice(0, 8)
        : summary.recentSystemNotifications
  };
}
