import type {
  CombatantEncounterStat,
  CombatantSnapshot,
  EncounterSnapshot,
  SkillStat,
  TargetStat,
  TimelinePoint
} from "../shared/types";
import { inferBuildFromSkills } from "./nwMetadata";

export type View = "setup" | "live" | "players" | "recent" | "debug";

export type DetailTab =
  | "overview"
  | "timeline"
  | "damageOut"
  | "healing"
  | "damageTaken"
  | "timing"
  | "positioning"
  | "other"
  | "deaths";

export type PlayerRow = {
  id: string;
  displayName: string;
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
  companionCount: number;
  targets: TargetStat[];
  timeline: TimelinePoint[];
  encounters: CombatantEncounterStat[];
  deaths: number;
  className: string | null;
  paragon: string | null;
  buildConfidence: number;
};

export const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline & Powers" },
  { id: "damageOut", label: "Damage Out" },
  { id: "healing", label: "Healing" },
  { id: "damageTaken", label: "Damage Taken" },
  { id: "timing", label: "Timing" },
  { id: "positioning", label: "Positioning" },
  { id: "other", label: "Other" },
  { id: "deaths", label: "Deaths" }
];

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatShort(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return formatNumber(value);
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes}:${seconds}`;
  }

  return `${minutes}:${seconds}`;
}

function mergeSkills(skills: SkillStat[]): SkillStat[] {
  const totals = new Map<string, SkillStat>();

  for (const skill of skills) {
    const current = totals.get(skill.abilityName) ?? {
      abilityName: skill.abilityName,
      total: 0,
      hits: 0
    };

    current.total += skill.total;
    current.hits += skill.hits;
    totals.set(skill.abilityName, current);
  }

  return Array.from(totals.values())
    .sort((left, right) => right.total - left.total)
    .slice(0, 12);
}

function mergeTargets(targets: TargetStat[]): TargetStat[] {
  const totals = new Map<string, TargetStat>();

  for (const target of targets) {
    const current = totals.get(target.targetName) ?? {
      targetName: target.targetName,
      totalDamage: 0,
      hits: 0,
      critCount: 0
    };

    current.totalDamage += target.totalDamage;
    current.hits += target.hits;
    current.critCount += target.critCount;
    totals.set(target.targetName, current);
  }

  return Array.from(totals.values()).sort(
    (left, right) => right.totalDamage - left.totalDamage
  );
}

function mergeTimeline(points: TimelinePoint[]): TimelinePoint[] {
  const totals = new Map<number, TimelinePoint>();

  for (const point of points) {
    const current = totals.get(point.second) ?? {
      second: point.second,
      damage: 0,
      healing: 0,
      hits: 0
    };

    current.damage += point.damage;
    current.healing += point.healing;
    current.hits += point.hits;
    totals.set(point.second, current);
  }

  return Array.from(totals.values()).sort((left, right) => left.second - right.second);
}

function mergeEncounters(encounters: CombatantEncounterStat[]): CombatantEncounterStat[] {
  const totals = new Map<string, CombatantEncounterStat>();

  for (const encounter of encounters) {
    const current = totals.get(encounter.encounterId) ?? {
      encounterId: encounter.encounterId,
      totalDamage: 0,
      totalHealing: 0,
      damageTaken: 0,
      hits: 0
    };

    current.totalDamage += encounter.totalDamage;
    current.totalHealing += encounter.totalHealing;
    current.damageTaken += encounter.damageTaken;
    current.hits += encounter.hits;
    totals.set(encounter.encounterId, current);
  }

  return Array.from(totals.values());
}

export function buildPlayerRows(
  combatants: CombatantSnapshot[],
  includeCompanions: boolean
): PlayerRow[] {
  const groups = new Map<string, CombatantSnapshot[]>();

  for (const combatant of combatants) {
    const groupKey =
      combatant.type === "companion" ? combatant.ownerId : combatant.id;
    const current = groups.get(groupKey) ?? [];
    current.push(combatant);
    groups.set(groupKey, current);
  }

  return Array.from(groups.entries())
    .map(([groupKey, members]) => {
      const primary =
        members.find((member) => member.type === "player" || member.id === member.ownerId) ??
        members[0];
      const includedMembers = includeCompanions
        ? members
        : members.filter((member) => member.type !== "companion");
      const sourceMembers = includedMembers.length > 0 ? includedMembers : [primary];
      const totalDamage = sourceMembers.reduce(
        (total, member) => total + member.totalDamage,
        0
      );
      const totalHealing = sourceMembers.reduce(
        (total, member) => total + member.totalHealing,
        0
      );
      const damageTaken = sourceMembers.reduce(
        (total, member) => total + member.damageTaken,
        0
      );
      const hits = sourceMembers.reduce((total, member) => total + member.hits, 0);
      const critCount = sourceMembers.reduce(
        (total, member) => total + member.critCount,
        0
      );
      const flankCount = sourceMembers.reduce(
        (total, member) => total + member.flankRate * member.hits,
        0
      );
      const dps = sourceMembers.reduce((total, member) => total + member.dps, 0);
      const hps = sourceMembers.reduce((total, member) => total + member.hps, 0);
      const topSkills = mergeSkills(sourceMembers.flatMap((member) => member.topSkills));
      const inferredBuild = inferBuildFromSkills(topSkills);

      return {
        id: groupKey,
        displayName: primary.ownerName || primary.displayName,
        totalDamage,
        totalHealing,
        damageTaken,
        hits,
        critCount,
        critRate: hits === 0 ? 0 : critCount / hits,
        flankRate: hits === 0 ? 0 : flankCount / hits,
        dps,
        hps,
        topSkills,
        companionCount: members.filter((member) => member.type === "companion").length,
        targets: mergeTargets(sourceMembers.flatMap((member) => member.targets)),
        timeline: mergeTimeline(sourceMembers.flatMap((member) => member.timeline)),
        encounters: mergeEncounters(sourceMembers.flatMap((member) => member.encounters)),
        deaths: sourceMembers.reduce((total, member) => total + member.deaths, 0),
        className: inferredBuild.className,
        paragon: inferredBuild.paragon,
        buildConfidence: inferredBuild.confidence
      };
    })
    .sort((left, right) => right.totalDamage - left.totalDamage);
}

export function getEncounterSnapshots(
  recentEncounters: EncounterSnapshot[],
  currentEncounter: EncounterSnapshot | null
): EncounterSnapshot[] {
  return [...recentEncounters]
    .sort((left, right) => left.startedAt - right.startedAt)
    .concat(currentEncounter ? [currentEncounter] : []);
}
