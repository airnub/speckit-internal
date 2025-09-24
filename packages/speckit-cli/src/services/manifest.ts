import path from "node:path";
import fs from "fs-extra";
import { z } from "zod";
import type { SpeckitVersionInfo } from "./version.js";

const GenerationModeSchema = z.enum(["classic", "secure"]);

const ManifestRunSchema = z.object({
  at: z.string(),
  mode: GenerationModeSchema.default("classic"),
  dialect: z
    .object({ id: z.string(), version: z.string() })
    .optional(),
  synced_with: z
    .object({ version: z.string(), commit: z.string() })
    .optional(),
  spec: z.object({ version: z.string(), digest: z.string() }),
  template: z.object({ id: z.string(), version: z.string(), sha: z.string() }),
  outputs: z.array(z.object({ path: z.string(), digest: z.string() })),
});

const ManifestSchema = z.object({
  speckit: z
    .object({
      version: z.string(),
      commit: z.string(),
    })
    .default({ version: "0.0.0", commit: "unknown" }),
  runs: z.array(ManifestRunSchema).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestRun = z.infer<typeof ManifestRunSchema>;

const DEFAULT_MANIFEST: Manifest = {
  speckit: { version: "0.0.0", commit: "unknown" },
  runs: [],
};

export function parseManifest(raw: string): Manifest {
  if (!raw.trim()) {
    return { ...DEFAULT_MANIFEST };
  }
  const parsed = JSON.parse(raw);
  return ManifestSchema.parse(parsed);
}

export async function readManifest(repoRoot: string): Promise<Manifest> {
  const manifestPath = path.join(repoRoot, ".speckit", "generation-manifest.json");
  if (!(await fs.pathExists(manifestPath))) {
    return { ...DEFAULT_MANIFEST };
  }
  const raw = await fs.readFile(manifestPath, "utf8");
  return parseManifest(raw);
}

export async function writeManifest(repoRoot: string, manifest: Manifest): Promise<void> {
  const manifestPath = path.join(repoRoot, ".speckit", "generation-manifest.json");
  await fs.ensureDir(path.dirname(manifestPath));
  const payload = JSON.stringify(manifest, null, 2) + "\n";
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.move(tempPath, manifestPath, { overwrite: true });
}

export async function appendManifestRun(
  repoRoot: string,
  info: SpeckitVersionInfo,
  run: ManifestRun
): Promise<void> {
  const manifest = await readManifest(repoRoot);
  manifest.speckit = { version: info.version, commit: info.commit };
  const enriched: ManifestRun = {
    ...run,
    mode: run.mode ?? "classic",
    dialect: run.dialect ?? { id: "unknown", version: "unknown" },
    synced_with: run.synced_with ?? { version: info.version, commit: info.commit },
  };
  manifest.runs = manifest.runs.map(existing => {
    if (existing.dialect && existing.dialect.id && existing.dialect.version) {
      return existing;
    }
    return {
      ...existing,
      dialect: enriched.dialect,
    };
  });
  manifest.runs.push(enriched);
  await writeManifest(repoRoot, manifest);
}

export async function updateManifestSpeckit(
  repoRoot: string,
  info: SpeckitVersionInfo
): Promise<void> {
  const manifest = await readManifest(repoRoot);
  if (
    manifest.speckit.version === info.version &&
    manifest.speckit.commit === info.commit
  ) {
    return;
  }
  manifest.speckit = { version: info.version, commit: info.commit };
  await writeManifest(repoRoot, manifest);
}
