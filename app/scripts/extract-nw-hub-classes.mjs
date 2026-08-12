import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const OUTPUT_JSON = path.join(ROOT, "src", "shared", "data", "nw-hub-classes.json");
const PUBLIC_ROOT = path.join(ROOT, "public", "nw-hub");
const CLASS_EMBLEM_DIR = path.join(PUBLIC_ROOT, "classes", "emblems");
const POWER_ICON_DIR = path.join(PUBLIC_ROOT, "powers");

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

function normalizePowerEntry(entry) {
  return {
    name: entry.name,
    logId: entry.logId ?? null,
    type: entry.type ?? null,
    icon: entry.icon ?? null,
    description: entry.description ?? null,
    className: entry.className ?? null,
    paragonPath: entry.paragonPath ?? null,
    damageType: entry.damageType ?? null,
    cast: entry.cast ?? null,
    cd: entry.cd ?? null,
    resourceCost: entry.resourceCost ?? null,
    combo: Boolean(entry.combo),
    hits: entry.hits ?? [],
    hasMasteryVariant: Boolean(entry.masteryHits || entry.masteryOnActivate)
  };
}

async function main() {
  const classesChunk = await fetchText("https://www.nw-hub.com/chunk-H5KETWAR.js");
  const dataChunk = await fetchText("https://www.nw-hub.com/chunk-FZIYYB3K.js");

  const classList = extractArray(classesChunk, /var B=(\[[\s\S]*?\]);var Z=/, "class list");
  const classData = extractArray(dataChunk, /var e=(\[[\s\S]*?\]);var t=/, "class powers");
  const feats = extractArray(dataChunk, /var t=(\[[\s\S]*?\]);var i=/, "feats");
  const features = extractArray(dataChunk, /var i=(\[[\s\S]*?\]);export/, "features");

  await mkdir(CLASS_EMBLEM_DIR, { recursive: true });
  await mkdir(POWER_ICON_DIR, { recursive: true });

  const classes = [];
  const powerEntries = [];
  const featEntries = [];
  const featureEntries = [];
  const downloadedIcons = new Set();

  for (const classMeta of classList) {
    const emblemFile = `${classMeta.slug}.webp`;
    const emblemUrl = `https://www.nw-hub.com/assets/classes/emblems/${emblemFile}`;
    const emblemPath = path.join(CLASS_EMBLEM_DIR, emblemFile);
    await saveAsset(emblemUrl, emblemPath);

    const classInfo = classData.find((entry) => entry.className === classMeta.className);
    classes.push({
      className: classMeta.className,
      slug: classMeta.slug,
      emblemUrl,
      emblemPath: `/nw-hub/classes/emblems/${emblemFile}`,
      resourceName: classInfo?.resourceName ?? null,
      hasMasterySlot: Boolean(classInfo?.hasMasterySlot),
      paragons: classMeta.paragons
    });

    for (const power of classInfo?.powers ?? []) {
      const normalized = normalizePowerEntry({
        ...power,
        className: classMeta.className
      });

      if (normalized.icon && !downloadedIcons.has(normalized.icon)) {
        const iconUrl = `https://www.nw-hub.com/assets/powers/${normalized.icon}`;
        const iconPath = path.join(POWER_ICON_DIR, normalized.icon);
        await saveAsset(iconUrl, iconPath);
        downloadedIcons.add(normalized.icon);
      }

      powerEntries.push({
        ...normalized,
        iconUrl: normalized.icon ? `https://www.nw-hub.com/assets/powers/${normalized.icon}` : null,
        iconPath: normalized.icon ? `/nw-hub/powers/${normalized.icon}` : null
      });
    }
  }

  for (const feat of feats) {
    if (feat.icon && !downloadedIcons.has(feat.icon)) {
      const iconUrl = `https://www.nw-hub.com/assets/powers/${feat.icon}`;
      const iconPath = path.join(POWER_ICON_DIR, feat.icon);
      await saveAsset(iconUrl, iconPath);
      downloadedIcons.add(feat.icon);
    }

    featEntries.push({
      id: feat.id,
      name: feat.name,
      description: feat.description ?? null,
      className: feat.className ?? null,
      paragonPath: feat.paragonPath ?? null,
      icon: feat.icon ?? null,
      iconUrl: feat.icon ? `https://www.nw-hub.com/assets/powers/${feat.icon}` : null,
      iconPath: feat.icon ? `/nw-hub/powers/${feat.icon}` : null
    });
  }

  for (const feature of features) {
    if (feature.icon && !downloadedIcons.has(feature.icon)) {
      const iconUrl = `https://www.nw-hub.com/assets/powers/${feature.icon}`;
      const iconPath = path.join(POWER_ICON_DIR, feature.icon);
      await saveAsset(iconUrl, iconPath);
      downloadedIcons.add(feature.icon);
    }

    featureEntries.push({
      id: feature.id,
      name: feature.name,
      description: feature.description ?? null,
      className: feature.className ?? null,
      paragonPath: feature.paragonPath ?? null,
      isClassFeature: Boolean(feature.isClassFeature),
      isMechanic: Boolean(feature.isMechanic),
      icon: feature.icon ?? null,
      iconUrl: feature.icon ? `https://www.nw-hub.com/assets/powers/${feature.icon}` : null,
      iconPath: feature.icon ? `/nw-hub/powers/${feature.icon}` : null
    });
  }

  const payload = {
    source: "https://www.nw-hub.com/classes",
    extractedAt: new Date().toISOString(),
    classes,
    powers: powerEntries,
    feats: featEntries,
    features: featureEntries
  };

  await writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2));
  console.log(`Saved ${classes.length} classes, ${powerEntries.length} powers, ${featEntries.length} feats, ${featureEntries.length} features.`);
}

await main();
