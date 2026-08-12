import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const OUTPUT_JSON = path.join(ROOT, "src", "shared", "data", "nw-hub-artifacts.json");
const PUBLIC_ROOT = path.join(ROOT, "public", "nw-hub", "artifacts");

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchBinary(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function extractArray(source, pattern, label) {
  const match = source.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not extract ${label}`);
  }
  return vm.runInNewContext(match[1]);
}

async function saveAsset(url, absolutePath) {
  const contents = await fetchBinary(url);
  if (!contents) {
    return false;
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  return true;
}

function extractPercentages(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => Number(match[1]));
}

function deriveEffectSummary(powertext) {
  const text = powertext ?? "";
  const lowered = text.toLowerCase();

  const damageTakenPct = [
    ...extractPercentages(text, /damage taken[^.\n]*?\+(\d+(?:\.\d+)?)%/gi),
    ...extractPercentages(text, /targets?\s+take\s+(\d+(?:\.\d+)?)%\s+more damage/gi),
    ...extractPercentages(text, /causing them to take\s+(\d+(?:\.\d+)?)%\s+more damage/gi),
    ...extractPercentages(text, /increases?[^.\n]*?damage taken by\s+(\d+(?:\.\d+)?)%/gi)
  ];
  const outgoingDamagePct = [
    ...extractPercentages(text, /gain(?:s)?[^.\n]*?(\d+(?:\.\d+)?)%\s+damage/gi),
    ...extractPercentages(text, /increases?[^.\n]*?damage[^.\n]*?by\s+(\d+(?:\.\d+)?)%/gi),
    ...extractPercentages(text, /combat advantage damage by\s+(\d+(?:\.\d+)?)%/gi)
  ];
  const outgoingHealingPct = extractPercentages(text, /outgoing healing by\s+(\d+(?:\.\d+)?)%/gi);
  const critChancePct = extractPercentages(text, /critical (?:chance|strike) by\s+(\d+(?:\.\d+)?)%/gi);
  const critSeverityPct = extractPercentages(text, /critical severity by\s+(\d+(?:\.\d+)?)%/gi);
  const reducedDamagePct = extractPercentages(text, /deal\s+(\d+(?:\.\d+)?)%\s+less damage/gi);
  const damageResistancePct = [
    ...extractPercentages(text, /damage resistance by\s+(\d+(?:\.\d+)?)%/gi),
    ...extractPercentages(text, /damage resistance of your targets by\s+(\d+(?:\.\d+)?)%/gi)
  ];
  const cooldownReductionSec = [...text.matchAll(/cooldowns? by\s+(\d+(?:\.\d+)?)\s+seconds?/gi)].map((match) =>
    Number(match[1])
  );
  const stunSeconds = [...text.matchAll(/stun(?:s|ned)?[^.\n]*?(\d+(?:\.\d+)?)\s*(?:seconds?|s)/gi)].map((match) =>
    Number(match[1])
  );
  const durationSeconds = [...text.matchAll(/duration:\s*(\d+(?:\.\d+)?)\s*(?:seconds?|s)/gi)].map((match) =>
    Number(match[1])
  );

  return {
    grantsShield: lowered.includes("shield"),
    summonsEntity:
      lowered.includes("summon") ||
      lowered.includes("portal stone") ||
      lowered.includes("mimic") ||
      lowered.includes("beholder"),
    appliesDot:
      lowered.includes("damage over time") ||
      lowered.includes(" dot ") ||
      lowered.includes("dot damage") ||
      lowered.includes("every second"),
    hasControlEffect:
      lowered.includes("stun") ||
      lowered.includes("slow") ||
      lowered.includes("slowed") ||
      lowered.includes("immobil"),
    keywords: [
      lowered.includes("damage taken") ? "damage-taken" : null,
      lowered.includes("damage resistance") ? "damage-resistance" : null,
      lowered.includes("outgoing healing") ? "outgoing-healing" : null,
      lowered.includes("critical") ? "critical" : null,
      lowered.includes("shield") ? "shield" : null,
      lowered.includes("cooldown") ? "cooldown" : null,
      lowered.includes("stun") ? "stun" : null,
      lowered.includes("slow") ? "slow" : null,
      lowered.includes("summon") ? "summon" : null
    ].filter(Boolean),
    damageTakenPct,
    outgoingDamagePct,
    outgoingHealingPct,
    critChancePct,
    critSeverityPct,
    reducedDamagePct,
    damageResistancePct,
    cooldownReductionSec,
    stunSeconds,
    durationSeconds
  };
}

async function main() {
  const artifactsChunk = await fetchText("https://www.nw-hub.com/chunk-F355OH3M.js");
  const artifacts = extractArray(artifactsChunk, /var fe=(\[[\s\S]*?\]);var /, "artifact list");

  await mkdir(PUBLIC_ROOT, { recursive: true });

  const entries = [];
  for (const artifact of artifacts) {
    const iconUrl = artifact.icon
      ? `https://www.nw-hub.com/assets/artifacts/${artifact.icon}`
      : null;
    const iconPath = artifact.icon ? path.join(PUBLIC_ROOT, artifact.icon) : null;
    if (iconUrl && iconPath) {
      await saveAsset(iconUrl, iconPath);
    }

    entries.push({
      name: artifact.name,
      quality: artifact.quality ?? null,
      itemLevel: artifact.itemLevel ?? null,
      combinedRating: artifact.combinedRating ?? null,
      powerText: artifact.powertext ?? null,
      stats: artifact.stats ?? {},
      icon: artifact.icon ?? null,
      iconUrl,
      iconPath: artifact.icon ? `/nw-hub/artifacts/${artifact.icon}` : null,
      effects: deriveEffectSummary(artifact.powertext ?? "")
    });
  }

  const payload = {
    source: "https://www.nw-hub.com/artifacts/list",
    extractedAt: new Date().toISOString(),
    artifacts: entries
  };

  await writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2));
  console.log(`Saved ${entries.length} artifacts.`);
}

await main();
