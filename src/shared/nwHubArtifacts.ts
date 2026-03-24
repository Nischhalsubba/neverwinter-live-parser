import artifactData from "./data/nw-hub-artifacts.json" with { type: "json" };

export type NwHubArtifact = (typeof artifactData.artifacts)[number];

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

const artifactByName = new Map<string, NwHubArtifact>(
  artifactData.artifacts.map((artifact) => [normalizeName(artifact.name), artifact])
);

export function getNwHubArtifact(name: string | null | undefined): NwHubArtifact | null {
  if (!name) {
    return null;
  }
  return artifactByName.get(normalizeName(name)) ?? null;
}

export function isNwHubArtifact(name: string | null | undefined): boolean {
  return getNwHubArtifact(name) !== null;
}

export function getArtifactKeywords(name: string | null | undefined): string[] {
  return getNwHubArtifact(name)?.effects.keywords ?? [];
}
