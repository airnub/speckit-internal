import fs from "fs-extra";
import path from "node:path";
import { URL } from "node:url";
import { z } from "zod";

export * from "./model/SpecModel.js";

export const SpecMetaSchema = z.object({
  title: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(["draft","approved","deprecated"]).optional(),
  owners: z.array(z.string()).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});
export type SpecMeta = z.infer<typeof SpecMetaSchema>;

export type SpeckitConfig = {
  ai: { enabled: boolean };
  analytics: { enabled: boolean };
  provider?: "openai"|"github";
  openai?: { apiKey?: string; model?: string; models?: string[] };
  github?: { pat?: string; model?: string; endpoint?: string; models?: string[] };
  repo: { mode: "local"|"github"; localPath?: string; githubRepo?: string; branch: string; specRoot: string };
  workspaces: { root: string };
  recent?: any[];
};

export type TemplateEntry = {
  name: string;
  description: string;
  type: "blank" | "github" | "local";
  repo?: string;     // owner/name for github
  branch?: string;
  varsFile?: string; // template.vars.json path
  specRoot?: string; // default specs path
  postInit?: string[];
  localPath?: string; // absolute path when type === "local"
};

export function getDefaultTemplates(): TemplateEntry[] {
  return [
    { name: "blank", description: "Blank SpecKit spec (base.md)", type: "blank", specRoot: "docs/specs" },
    {
      name: "next-supabase",
      description: "Next.js + Supabase — SpecKit template (official)",
      type: "github",
      repo: "airnub/next-supabase-speckit-template",
      branch: "main",
      varsFile: "template.vars.json",
      specRoot: "docs/specs",
      postInit: ["pnpm docs:gen", "pnpm rtm:build"]
    },
    {
      name: "speckit-template",
      description: "Generic, app-agnostic SpecKit template",
      type: "github",
      repo: "airnub/speckit-template",
      branch: "main",
      specRoot: "docs/specs"
    }
  ];
}

export type LoadTemplatesOptions = {
  repoRoot?: string;
};

export async function loadTemplates(options?: LoadTemplatesOptions): Promise<TemplateEntry[]> {
  const defaults = getDefaultTemplates();
  const repoRoot = options?.repoRoot || process.cwd();
  const locals = await discoverLocalTemplates(repoRoot);

  const sortedLocals = locals.sort((a, b) => a.name.localeCompare(b.name));
  const localByName = new Map(sortedLocals.map(t => [t.name, t] as const));

  const merged: TemplateEntry[] = [];
  for (const entry of defaults) {
    const override = localByName.get(entry.name);
    if (override) {
      merged.push(override);
      localByName.delete(entry.name);
    } else {
      merged.push(entry);
    }
  }
  merged.push(...localByName.values());
  return merged;
}

type LocalTemplateManifest = {
  name?: string;
  description?: string;
  varsFile?: string;
  specRoot?: string;
  postInit?: string[];
};

async function discoverLocalTemplates(repoRoot: string): Promise<TemplateEntry[]> {
  const baseDir = path.join(repoRoot, ".speckit", "templates");
  if (!(await fs.pathExists(baseDir))) return [];

  const templates: TemplateEntry[] = [];
  const skipNames = new Set([".git", "node_modules"]);

  async function walk(dir: string) {
    const rel = path.relative(baseDir, dir);
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });
    const manifest = await readLocalTemplateManifest(dir);
    const hasFiles = dirEntries.some(d => d.isFile());

    const isTemplate = !!rel && (!!manifest || hasFiles);
    if (isTemplate) {
      const manifestName = typeof manifest?.name === "string" ? manifest.name : undefined;
      const manifestDescription = typeof manifest?.description === "string" ? manifest.description : undefined;
      const manifestVars = typeof manifest?.varsFile === "string" ? manifest.varsFile : undefined;
      const manifestSpecRoot = typeof manifest?.specRoot === "string" ? manifest.specRoot : undefined;
      const manifestPostInit = Array.isArray(manifest?.postInit)
        ? manifest.postInit.filter((cmd): cmd is string => typeof cmd === "string" && cmd.trim().length > 0)
        : [];

      const name = sanitizeTemplateName(manifestName || rel);
      const description = manifestDescription || `Local template (${name})`;
      const varsCandidate = manifestVars || "template.vars.json";
      const varsFile = await fs.pathExists(path.join(dir, varsCandidate)) ? varsCandidate : undefined;
      const postInit = manifestPostInit.length ? manifestPostInit : undefined;
      const specRoot = manifestSpecRoot;

      templates.push({
        name,
        description,
        type: "local",
        varsFile,
        specRoot,
        postInit,
        localPath: dir
      });
      return;
    }

    for (const entry of dirEntries) {
      if (entry.isDirectory() && !skipNames.has(entry.name)) {
        await walk(path.join(dir, entry.name));
      }
    }
  }

  await walk(baseDir);
  return templates;
}

async function readLocalTemplateManifest(dir: string): Promise<LocalTemplateManifest | null> {
  const candidates = ["template.json", "template.config.json", "template.meta.json"];
  for (const file of candidates) {
    const full = path.join(dir, file);
    if (await fs.pathExists(full)) {
      try {
        const data = await fs.readJson(full);
        return data as LocalTemplateManifest;
      } catch (error: any) {
        throw new Error(`Failed to parse ${full}: ${error?.message || error}`);
      }
    }
  }
  return null;
}

function sanitizeTemplateName(name: string): string {
  const trimmed = name.trim();
  const normalized = trimmed.split(path.sep).filter(Boolean).join("/");
  return normalized || "local-template";
}

export function templateFromGithubUrl(input: string): TemplateEntry | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return null;
  }

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment));

  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  let repo = segments[1];
  if (!owner || !repo) {
    return null;
  }

  if (repo.toLowerCase().endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  let branch: string | undefined;
  if (segments.length >= 4 && segments[2] === "tree") {
    branch = segments.slice(3).join("/");
  }

  if (!branch) {
    const ref = parsed.searchParams.get("ref");
    if (ref) {
      branch = ref;
    }
  }

  if (!branch && parsed.hash) {
    const hash = parsed.hash.replace(/^#/, "").trim();
    if (hash) {
      branch = hash;
    }
  }

  const repoId = `${owner}/${repo}`;
  const name = branch ? `${repoId}#${branch}` : repoId;

  return {
    name,
    description: `GitHub template (${repoId}${branch ? `#${branch}` : ""})`,
    type: "github",
    repo: repoId,
    branch,
  };
}
