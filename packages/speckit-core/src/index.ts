import fs from "fs-extra";
import path from "node:path";
import { z } from "zod";

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
  gitUrl?: string;   // optional full git URL (overrides repo when provided)
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
  const reservedNames = new Set(defaults.map(t => t.name));
  const locals = await discoverLocalTemplates(repoRoot, reservedNames);

  return [...defaults, ...locals];
}

type LocalTemplateManifest = {
  name?: string;
  description?: string;
  varsFile?: string;
  specRoot?: string;
  postInit?: string[];
};

async function discoverLocalTemplates(repoRoot: string, reservedNames: Set<string>): Promise<TemplateEntry[]> {
  const baseDir = path.join(repoRoot, ".speckit", "templates");
  if (!(await fs.pathExists(baseDir))) return [];

  const templates: TemplateEntry[] = [];
  const skipNames = new Set([".git", "node_modules"]);
  const usedNames = new Set<string>(reservedNames);

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

      const baseName = sanitizeTemplateName(manifestName || rel);
      const name = ensureUniqueLocalName(baseName, usedNames);
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
  return templates.sort((a, b) => a.name.localeCompare(b.name));
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

function ensureUniqueLocalName(base: string, used: Set<string>): string {
  const candidate = base || "local-template";
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }

  let counter = 1;
  while (true) {
    const suffix = counter === 1 ? "-local" : `-local-${counter}`;
    const next = `${candidate}${suffix}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
    counter += 1;
  }
}
