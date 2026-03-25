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

export type AuxiliaryLogKind =
  | "voicechat"
  | "clientservercomm"
  | "crash"
  | "shutdown"
  | "shader"
  | "pcl"
  | "other";

export type AuxiliaryLogEvent = {
  fileName: string;
  filePath: string;
  kind: AuxiliaryLogKind;
  category: "system" | "warning" | "error" | "chat" | "voice" | "shader" | "lifecycle" | "other";
  seenAt: number;
  title: string;
  text: string;
  details?: Record<string, string | number | boolean>;
};

export type AuxiliaryLogSummary = {
  totalEvents: number;
  countsByKind: Record<AuxiliaryLogKind, number>;
  countsByCategory: Record<AuxiliaryLogEvent["category"], number>;
  activeChannels: string[];
  lastLifecycleEvent: AuxiliaryLogEvent | null;
  lastCrashEvent: AuxiliaryLogEvent | null;
  recentSystemNotifications: AuxiliaryLogEvent[];
};

export type SkillStat = {
  abilityName: string;
  total: number;
  hits: number;
  critCount: number;
  flankCount: number;
  kind: "damage" | "heal";
};

export type TimelinePoint = {
  second: number;
  damage: number;
  healing: number;
  hits: number;
  buffs: number;
  debuffs: number;
};

export type ActivationStat = {
  second: number;
  abilityName: string;
  kind: EventType;
  critical: boolean;
  targetName?: string;
  sourceType?: ActorType;
};

export type ArtifactActivationStat = {
  second: number;
  abilityName: string;
  targetName?: string;
  sourceType?: ActorType;
  durationSec: number;
};

export type EffectStat = {
  abilityName: string;
  targetName: string;
  kind: "buff" | "debuff";
  applications: number;
  totalMagnitude: number;
  timestamps: number[];
};

export type TargetStat = {
  targetName: string;
  totalDamage: number;
  hits: number;
  critCount: number;
};

export type HighestHitStat = {
  abilityName: string;
  amount: number;
  targetName?: string;
  critical: boolean;
  second: number;
  sourceType?: ActorType;
};

export type DamageMomentStat = {
  second: number;
  abilityName: string;
  amount: number;
  targetName?: string;
  critical: boolean;
  sourceType?: ActorType;
};

export type CombatantEncounterStat = {
  encounterId: string;
  totalDamage: number;
  totalHealing: number;
  damageTaken: number;
  hits: number;
};

export type EncounterSnapshot = {
  id: string;
  label: string;
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
  flankRate: number;
  dps: number;
  hps: number;
  topSkills: SkillStat[];
  targets: TargetStat[];
  highestHits: HighestHitStat[];
  damageMoments: DamageMomentStat[];
  timeline: TimelinePoint[];
  activations: ActivationStat[];
  artifactActivations: ArtifactActivationStat[];
  effects: EffectStat[];
  encounters: CombatantEncounterStat[];
  deaths: number;
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
  auxiliaryEvents: AuxiliaryLogEvent[];
  auxiliarySummary: AuxiliaryLogSummary;
  activeFilePath: string | null;
  currentOffset: number;
};

export type SystemUsageSnapshot = {
  sampledAt: number;
  processCpuPercent: number;
  processMemoryMb: number;
  systemMemoryUsedMb: number;
  systemMemoryTotalMb: number;
  systemMemoryPercent: number;
  uptimeSec: number;
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
  system: SystemUsageSnapshot;
};

export type MonitoringConfig = {
  folderPath?: string | null;
  filePath?: string | null;
  inactivityTimeoutMs: number;
};

export type DiscoveredLogCandidate = {
  folderPath: string;
  filePath: string | null;
  timestampLabel: string;
  sourceHint: string;
};
