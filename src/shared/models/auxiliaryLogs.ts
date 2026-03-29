import type { AuxiliaryLogSummary } from "./types.js";

export function createInitialAuxiliarySummary(): AuxiliaryLogSummary {
  return {
    totalEvents: 0,
    countsByKind: {
      voicechat: 0,
      clientservercomm: 0,
      crash: 0,
      shutdown: 0,
      shader: 0,
      pcl: 0,
      other: 0
    },
    countsByCategory: {
      system: 0,
      warning: 0,
      error: 0,
      chat: 0,
      voice: 0,
      shader: 0,
      lifecycle: 0,
      other: 0
    },
    activeChannels: [],
    lastLifecycleEvent: null,
    lastCrashEvent: null,
    recentSystemNotifications: []
  };
}
/**
 * Auxiliary-log domain helpers.
 * Contains summary state and reducers for the non-combat Neverwinter logs that
 * enrich history, recordings, and debugging views.
 */
