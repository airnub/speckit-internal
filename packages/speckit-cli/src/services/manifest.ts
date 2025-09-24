import path from "node:path";
import fs from "fs-extra";
import { z } from "zod";
import type { SpeckitVersionInfo } from "./version.js";

const ManifestSchema = z.object({
  speckit: z
    .object({
      version: z.string(),
      commit: z.string(),
    })
    .default({ version: "0.0.0", commit: "unknown" }),
  runs: z.array(
    z.object({
      at: z.string(),
      spec: z.object({ version: z.string(), digest: z.string() }),
      template: z.object({ id: z.string(), version: z.string(), sha: z.string() }),
      outputs: z.array(z.object({ path: z.string(), digest: z.string() })),
    })
  ),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestRun = Manifest["runs"][number];

const DEFAULT_MANIFEST: Manifest = {
  speckit: { version: "0.0.0", commit: "unknown" },
  runs: [],
};

export async function readManifest(repoRoot: string): Promise<Manifest> {
  const manifestPath = path.join(repoRoot, ".speckit", "generation-manifest.json");
  if (!(await fs.pathExists(manifestPath))) {
    return { ...DEFAULT_MANIFEST };
  }
  const raw = await fs.readFile(manifestPath, "utf8");
  if (!raw.trim()) {
    return { ...DEFAULT_MANIFEST };
  }
  const parsed = JSON.parse(raw);
  const manifest = ManifestSchema.parse(parsed);
  return manifest;
}

export async function writeManifest(repoRoot: string, manifest: Manifest): Promise<void> {
  const manifestPath = path.join(repoRoot, ".speckit", "generation-manifest.json");
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export async function appendManifestRun(
  repoRoot: string,
  info: SpeckitVersionInfo,
  run: ManifestRun
): Promise<void> {
  const manifest = await readManifest(repoRoot);
  manifest.speckit = { version: info.version, commit: info.commit };
  manifest.runs.push(run);
  await writeManifest(repoRoot, manifest);
}
