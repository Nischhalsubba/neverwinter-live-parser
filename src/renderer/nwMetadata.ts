import metadata from "../shared/data/nw-metadata.json";
import nwHubClasses from "../shared/data/nw-hub-classes.json";
import artifactData from "../shared/data/nw-hub-artifacts.json";
import type { SkillStat } from "../shared/types";

type PlayerPowerMeta = (typeof metadata.playerPowers)[number];
type MountMeta = (typeof metadata.mounts)[number];
type ArtifactMeta = (typeof metadata.artifacts)[number];
type NwHubClassMeta = (typeof nwHubClasses.classes)[number];
type NwHubPowerMeta = (typeof nwHubClasses.powers)[number];
type NwHubFeatMeta = (typeof nwHubClasses.feats)[number];
type NwHubFeatureMeta = (typeof nwHubClasses.features)[number];
type NwHubArtifactMeta = (typeof artifactData.artifacts)[number];

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function canonicalizeName(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "");
}

function buildDualIndex<T extends { [key: string]: unknown }>(
  entries: T[],
  nameGetter: (entry: T) => string | null | undefined
) {
  const exact = new Map<string, T>();
  const canonical = new Map<string, T>();

  for (const entry of entries) {
    const raw = nameGetter(entry);
    if (!raw) {
      continue;
    }

    exact.set(normalizeName(raw), entry);
    canonical.set(canonicalizeName(raw), entry);
  }

  return { exact, canonical };
}

function lookupDualIndex<T>(
  source: { exact: Map<string, T>; canonical: Map<string, T> },
  value: string | null | undefined
): T | null {
  if (!value) {
    return null;
  }

  return (
    source.exact.get(normalizeName(value)) ??
    source.canonical.get(canonicalizeName(value)) ??
    null
  );
}

const powerByName = new Map<string, PlayerPowerMeta>(
  metadata.playerPowers.map((power) => [normalizeName(power.powername), power])
);

const companionNames = new Set(
  metadata.companions.map((companion) => normalizeName(companion.name))
);

const mountByName = new Map<string, MountMeta>(
  metadata.mounts.map((mount) => [normalizeName(mount.name), mount])
);

const artifactByName = new Map<string, ArtifactMeta>(
  metadata.artifacts.map((artifact) => [normalizeName(artifact.name), artifact])
);

const nwHubClassByName = new Map<string, NwHubClassMeta>(
  nwHubClasses.classes.map((entry) => [normalizeName(entry.className), entry])
);
const nwHubClassLookup = buildDualIndex(nwHubClasses.classes, (entry) => entry.className);

const nwHubPowerLookup = buildDualIndex(nwHubClasses.powers, (entry) => entry.name);

const nwHubFeatLookup = buildDualIndex(nwHubClasses.feats, (entry) => entry.name);

const nwHubFeatureLookup = buildDualIndex(nwHubClasses.features, (entry) => entry.name);

const nwHubArtifactLookup = buildDualIndex(artifactData.artifacts, (entry) => entry.name);

export type InferredBuild = {
  className: string | null;
  paragon: string | null;
  confidence: number;
};

export function getPowerMeta(powerName: string): PlayerPowerMeta | null {
  return powerByName.get(normalizeName(powerName)) ?? null;
}

export function isKnownCompanion(name: string): boolean {
  return companionNames.has(normalizeName(name));
}

export function getMountMeta(powerName: string): MountMeta | null {
  return mountByName.get(normalizeName(powerName)) ?? null;
}

export function getArtifactMeta(powerName: string): ArtifactMeta | null {
  return artifactByName.get(normalizeName(powerName)) ?? null;
}

export function getClassVisualMeta(className: string | null | undefined): NwHubClassMeta | null {
  if (!className) {
    return null;
  }
  return lookupDualIndex(nwHubClassLookup, className);
}

export function getPowerVisualMeta(
  powerName: string
): NwHubPowerMeta | NwHubFeatMeta | NwHubFeatureMeta | NwHubArtifactMeta | null {
  return (
    lookupDualIndex(nwHubPowerLookup, powerName) ??
    lookupDualIndex(nwHubFeatLookup, powerName) ??
    lookupDualIndex(nwHubFeatureLookup, powerName) ??
    lookupDualIndex(nwHubArtifactLookup, powerName) ??
    null
  );
}

export function classifyPowerFamily(
  powerName: string,
  sourceType?: "player" | "companion" | "npc" | "unknown"
): "class" | "proc" | "pet" | "artifact" | "mount" | "unknown" {
  if (sourceType === "companion") {
    return "pet";
  }
  if (getPowerMeta(powerName)) {
    return "class";
  }
  if (getMountMeta(powerName)) {
    return "mount";
  }
  if (getArtifactMeta(powerName)) {
    return "artifact";
  }
  if (lookupDualIndex(nwHubArtifactLookup, powerName)) {
    return "artifact";
  }
  if (isKnownCompanion(powerName)) {
    return "pet";
  }
  return "proc";
}

export function inferBuildFromSkills(skills: SkillStat[]): InferredBuild {
  const classScores = new Map<string, number>();
  const paragonScores = new Map<string, number>();

  for (const skill of skills) {
    const meta = getPowerMeta(skill.abilityName);
    if (!meta) {
      continue;
    }

    classScores.set(meta.class, (classScores.get(meta.class) ?? 0) + skill.total);
    if (meta.paragon) {
      const key = `${meta.class}::${meta.paragon}`;
      paragonScores.set(key, (paragonScores.get(key) ?? 0) + skill.total);
    }
  }

  const bestClass = [...classScores.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!bestClass) {
    return { className: null, paragon: null, confidence: 0 };
  }

  const totalClassWeight = [...classScores.values()].reduce((sum, value) => sum + value, 0);
  const bestParagon = [...paragonScores.entries()]
    .filter(([key]) => key.startsWith(`${bestClass[0]}::`))
    .sort((a, b) => b[1] - a[1])[0];

  return {
    className: bestClass[0],
    paragon: bestParagon ? bestParagon[0].split("::")[1] : null,
    confidence: totalClassWeight === 0 ? 0 : bestClass[1] / totalClassWeight
  };
}
