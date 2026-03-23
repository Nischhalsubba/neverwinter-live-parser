import metadata from "../shared/data/nw-metadata.json";
import type { SkillStat } from "../shared/types";

type PlayerPowerMeta = (typeof metadata.playerPowers)[number];

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

const powerByName = new Map<string, PlayerPowerMeta>(
  metadata.playerPowers.map((power) => [normalizeName(power.powername), power])
);

const companionNames = new Set(
  metadata.companions.map((companion) => normalizeName(companion.name))
);

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
