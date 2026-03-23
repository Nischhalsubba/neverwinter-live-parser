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
export type AnalysisMode = "idle" | "live" | "imported";
export type ActorType = "player" | "companion" | "npc" | "unknown";

export type CombatEvent = {
  raw: string;
  timestamp: number;
  eventType: EventType;
  sourceName?: string;
  sourceId?: string;
  sourceOwnerName?: string;
  sourceOwnerId?: string;
  sourceType?: ActorType;
  targetName?: string;
  targetId?: string;
  targetType?: ActorType;
  abilityName?: string;
  abilityId?: string;
  amount?: number;
  magnitude?: number;
  critical?: boolean;
  school?: string;
  flags?: string[];
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

export type CombatantSnapshot = {
  id: string;
  ownerId: string;
  ownerName: string;
  displayName: string;
  type: ActorType;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  hits: number;
  critCount: number;
  critRate: number;
  dps: number;
  hps: number;
  topSkills: SkillStat[];
};

export type AnalysisSnapshot = {
  mode: AnalysisMode;
  sourcePath: string | null;
  totalLines: number;
  parsedEvents: number;
  durationMs: number;
  startedAt?: number;
  endedAt?: number;
  combatants: CombatantSnapshot[];
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
  importedLogFile: string | null;
  encounterStatus: EncounterStatus;
  currentEncounter: EncounterSnapshot | null;
  recentEncounters: EncounterSnapshot[];
  analysis: AnalysisSnapshot;
  debug: DebugState;
};

export type MonitoringConfig = {
  folderPath: string;
  inactivityTimeoutMs: number;
};
