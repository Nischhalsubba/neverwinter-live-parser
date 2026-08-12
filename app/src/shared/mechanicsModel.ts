export type LibraryCategory =
  | "damage"
  | "support"
  | "debuff"
  | "survivability"
  | "utility";

type EffectShape = {
  keywords?: string[];
  damageTakenPct?: number[];
  outgoingDamagePct?: number[];
  outgoingHealingPct?: number[];
  critChancePct?: number[];
  critSeverityPct?: number[];
  reducedDamagePct?: number[];
  damageResistancePct?: number[];
  cooldownReductionSec?: number[];
  stunSeconds?: number[];
  durationSeconds?: number[];
  grantsShield?: boolean;
  hasControlEffect?: boolean;
  appliesDot?: boolean;
};

type ArtifactLike = {
  name: string;
  powerText?: string | null;
  effects?: EffectShape;
  combinedRating?: number | null;
};

type PowerHitLike = {
  magnitude?: number | null;
};

type PowerLike = {
  name: string;
  description?: string | null;
  type?: string | null;
  cd?: number | null;
  cast?: number | null;
  hits?: PowerHitLike[] | null;
};

type CategoryScores = Record<LibraryCategory, number>;

export function normalizeEntityName(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,:;!?]+$/g, "")
    .toLowerCase();
}

export function baseDamageFromItemLevel(
  itemLevel: number,
  roleBonus: "dps" | "healer" | "tank" = "dps"
): number {
  const multiplier = roleBonus === "dps" ? 1.2 : roleBonus === "healer" ? 1.1 : 1;
  return (itemLevel / 10) * multiplier;
}

export function baseHitPointsFromItemLevel(
  itemLevel: number,
  roleBonus: "dps" | "healer" | "tank" = "dps"
): number {
  const multiplier = roleBonus === "tank" ? 1.2 : roleBonus === "healer" ? 1.1 : 1;
  return itemLevel * 10 * multiplier;
}

export function ratingContribution(
  rating: number,
  itemLevel: number,
  ratingCap: number
): number {
  return Math.max(0, Math.min(50 + (rating - itemLevel) / 1000, ratingCap));
}

export function powerMultiplier(powerPercent: number): number {
  return 1 + powerPercent / 100;
}

export function cooldownAfterRecovery(
  baseCooldownSec: number | null | undefined,
  recoveryPercent: number
): number {
  if (!baseCooldownSec || baseCooldownSec <= 0) {
    return 0;
  }

  return baseCooldownSec / (1 + Math.max(0, recoveryPercent) / 100);
}

function extractPercentValues(text: string): number[] {
  return Array.from(text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*%/g), (match) =>
    Number(match[1])
  ).filter((value) => Number.isFinite(value));
}

function extractSecondValues(text: string): number[] {
  return Array.from(
    text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(?:seconds?|sec|s)\b/gi),
    (match) => Number(match[1])
  ).filter((value) => Number.isFinite(value));
}

function extractDamageValues(text: string): number[] {
  return Array.from(
    text.matchAll(/(?:deal|deals|damage(?: per meteor)?|magnitude:?|heals?)(?:\s+of)?\s+([\d,]+(?:\.\d+)?)/gi),
    (match) => Number(match[1].replace(/,/g, ""))
  ).filter((value) => Number.isFinite(value));
}

function baseCategoryScores(): CategoryScores {
  return {
    damage: 0,
    support: 0,
    debuff: 0,
    survivability: 0,
    utility: 0
  };
}

function max(values: number[] | undefined): number {
  return values && values.length ? Math.max(...values) : 0;
}

export function artifactCategoryScores(artifact: ArtifactLike): CategoryScores {
  const text = (artifact.powerText ?? "").toLowerCase();
  const percents = extractPercentValues(text);
  const seconds = extractSecondValues(text);
  const damages = extractDamageValues(text);
  const effects = artifact.effects ?? {};
  const scores = baseCategoryScores();

  scores.debuff += max(effects.damageTakenPct) * 6;
  scores.debuff += max(effects.reducedDamagePct) * 4;
  scores.debuff += max(effects.critChancePct) * 3;
  scores.debuff += max(effects.critSeverityPct) * 3;
  scores.debuff += effects.hasControlEffect ? 8 : 0;
  scores.debuff += max(effects.stunSeconds) * 2;
  scores.debuff += text.includes("slow") ? 4 : 0;

  scores.support += max(effects.outgoingDamagePct) * 5;
  scores.support += max(effects.outgoingHealingPct) * 5;
  scores.support += text.includes("allies") ? 10 : 0;
  scores.support += text.includes("party") ? 10 : 0;
  scores.support += text.includes("combat advantage") ? 6 : 0;

  scores.survivability += max(effects.damageResistancePct) * 5;
  scores.survivability += effects.grantsShield ? 12 : 0;
  scores.survivability += text.includes("temporary hit points") ? 8 : 0;
  scores.survivability += text.includes("immune") ? 6 : 0;

  scores.damage += max(effects.outgoingDamagePct) * 2;
  scores.damage += max(damages) / 1000;
  scores.damage += effects.appliesDot ? 8 : 0;
  scores.damage += text.includes("damage over time") ? 6 : 0;

  scores.utility += max(effects.cooldownReductionSec) * 3;
  scores.utility += max(seconds);
  scores.utility += effects.hasControlEffect ? 2 : 0;
  scores.utility += text.includes("remove") && text.includes("control") ? 6 : 0;

  if (percents.length && scores.debuff === 0 && scores.support === 0 && scores.survivability === 0) {
    scores.utility += max(percents);
  }

  if (artifact.combinedRating) {
    scores.support += artifact.combinedRating / 20000;
    scores.survivability += artifact.combinedRating / 30000;
  }

  return scores;
}

export function categorizeArtifact(artifact: ArtifactLike): LibraryCategory {
  return topCategoryFromScores(artifactCategoryScores(artifact));
}

function totalMagnitude(hits: PowerHitLike[] | null | undefined): number {
  return (hits ?? []).reduce((sum, hit) => sum + Math.max(0, hit.magnitude ?? 0), 0);
}

export function powerCategoryScores(power: PowerLike): CategoryScores {
  const text = (power.description ?? "").toLowerCase();
  const percents = extractPercentValues(text);
  const seconds = extractSecondValues(text);
  const magnitude = totalMagnitude(power.hits);
  const baseCooldown = power.cd ?? 0;
  const scores = baseCategoryScores();

  scores.damage += magnitude;
  scores.damage += text.includes("damage") ? 40 : 0;
  scores.damage += text.includes("damage over time") ? 25 : 0;
  scores.damage += baseCooldown > 0 ? magnitude / Math.max(cooldownAfterRecovery(baseCooldown, 0), 1) : magnitude / Math.max(power.cast ?? 1, 1);

  scores.support += text.includes("allies") ? 25 : 0;
  scores.support += text.includes("party") ? 25 : 0;
  scores.support += text.includes("increase") && text.includes("damage") ? max(percents) * 4 : 0;
  scores.support += text.includes("outgoing healing") ? max(percents) * 4 : 0;
  scores.support += text.includes("combat advantage") ? 10 : 0;
  scores.support += text.includes("grant") ? 8 : 0;

  scores.debuff += text.includes("damage taken") ? max(percents) * 6 : 0;
  scores.debuff += text.includes("reduce") ? max(percents) * 4 : 0;
  scores.debuff += text.includes("decrease") ? max(percents) * 4 : 0;
  scores.debuff += text.includes("stun") ? 12 + max(seconds) * 2 : 0;
  scores.debuff += text.includes("slow") ? 8 + max(seconds) : 0;
  scores.debuff += text.includes("weaken") ? 10 : 0;
  scores.debuff += text.includes("vulnerability") ? 10 : 0;

  scores.survivability += text.includes("shield") ? 18 : 0;
  scores.survivability += text.includes("temporary hit points") ? 12 : 0;
  scores.survivability += text.includes("damage taken by") ? max(percents) * 5 : 0;
  scores.survivability += text.includes("immune") ? 8 : 0;
  scores.survivability += text.includes("heal") ? max(extractDamageValues(text)) / 1000 : 0;

  scores.utility += text.includes("control") ? 8 : 0;
  scores.utility += text.includes("move") ? 6 : 0;
  scores.utility += text.includes("teleport") ? 8 : 0;
  scores.utility += text.includes("action points") ? 8 : 0;
  scores.utility += text.includes("divinity") || text.includes("stamina") ? 6 : 0;
  scores.utility += max(seconds);

  return scores;
}

export function categorizePower(power: PowerLike): LibraryCategory {
  return topCategoryFromScores(powerCategoryScores(power));
}

export function topCategoryFromScores(scores: CategoryScores): LibraryCategory {
  return (Object.entries(scores).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "utility") as LibraryCategory;
}

export function categoryStrength(scores: CategoryScores, category: LibraryCategory): number {
  return scores[category];
}
