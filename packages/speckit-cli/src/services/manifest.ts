import fs from "fs-extra";
import path from "node:path";

export type ManifestOutput = {
  path: string;
  digest: string;
};

export type ManifestRun = {
  at: string;
  spec: { version: string; digest: string };
  template: { id: string; version: string; sha: string };
  outputs: ManifestOutput[];
};

export type GenerationManifest = {
  speckit: { version: string; commit: string };
  runs: ManifestRun[];
};

const DEFAULT_VERSION = { version: "0.0.0", commit: "workspace" } as const;

export async function readManifest(repoRoot: string): Promise<GenerationManifest> {
  const manifestPath = getManifestPath(repoRoot);
  if (!(await fs.pathExists(manifestPath))) {
    return { speckit: { ...DEFAULT_VERSION }, runs: [] };
  }

  try {
    const text = await fs.readFile(manifestPath, "utf8");
    if (!text.trim()) {
      return { speckit: { ...DEFAULT_VERSION }, runs: [] };
    }
    const parsed = JSON.parse(text) as any;
    const runs = Array.isArray(parsed?.runs) ? parsed.runs : [];
    const speckit = parsed?.speckit && typeof parsed.speckit === "object"
      ? {
          version: typeof parsed.speckit.version === "string" ? parsed.speckit.version : DEFAULT_VERSION.version,
          commit: typeof parsed.speckit.commit === "string" ? parsed.speckit.commit : DEFAULT_VERSION.commit
        }
      : { ...DEFAULT_VERSION };

    return {
      speckit,
      runs: runs.map((run: any) => ({
        at: String(run?.at || ""),
        spec: {
          version: String(run?.spec?.version || ""),
          digest: String(run?.spec?.digest || "")
        },
        template: {
          id: String(run?.template?.id || ""),
          version: String(run?.template?.version || ""),
          sha: String(run?.template?.sha || "")
        },
        outputs: Array.isArray(run?.outputs)
          ? run.outputs.map((output: any) => ({
              path: String(output?.path || ""),
              digest: String(output?.digest || "")
            }))
          : []
      }))
    };
  } catch (error: any) {
    throw new Error(`Failed to parse generation-manifest.json: ${error?.message || error}`);
  }
}

export async function writeManifest(repoRoot: string, manifest: GenerationManifest): Promise<void> {
  const manifestPath = getManifestPath(repoRoot);
  await fs.ensureDir(path.dirname(manifestPath));
  const payload = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, `${payload}\n`, "utf8");
}

export function getManifestPath(repoRoot: string): string {
  return path.join(repoRoot, ".speckit", "generation-manifest.json");
}
