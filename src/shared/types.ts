export type EventType =
  | "damage"
  | "heal"
  | "damageTaken"
  | "buff"
  | "debuff"
  | "death"
  | "unknown";

export type WatcherStatus = "idle" | "watching" | "error";
export type EncounterStatus = "idle" | "active";

export type CombatEvent = {
  raw: string;
  timestamp: number;
  eventType: EventType;
  sourceName?: string;
  targetName?: string;
  abilityName?: string;
  amount?: number;
  critical?: boolean;
  tags?: Record<string, string | number | boolean>;
};

export type ParseIssue = {
  line: string;
  reason: string;
  seenAt: number;
};

export type SkillStat = {
  abilityName: string;
  total: number;
  hits: number;
};

export type EncounterSnapshot = {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  dps: number;
  hps: number;
  critCount: number;
  hitCount: number;
  critRate: number;
  topSkills: SkillStat[];
  eventCount: number;
};

export type DebugState = {
  latestRawLines: string[];
  unknownEvents: CombatEvent[];
  parseIssues: ParseIssue[];
  activeFilePath: string | null;
  currentOffset: number;
};

export type AppState = {
  watcherStatus: WatcherStatus;
  selectedLogFolder: string | null;
  activeLogFile: string | null;
  encounterStatus: EncounterStatus;
  currentEncounter: EncounterSnapshot | null;
  recentEncounters: EncounterSnapshot[];
  debug: DebugState;
};

export type MonitoringConfig = {
  folderPath: string;
  inactivityTimeoutMs: number;
};
