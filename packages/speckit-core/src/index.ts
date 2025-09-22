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
  openai?: { apiKey?: string; model?: string };
  github?: { pat?: string; model?: string; endpoint?: string };
  openaiModels?: string[];
  githubModels?: string[];
  repo: { mode: "local"|"github"; localPath?: string; githubRepo?: string; branch: string; specRoot: string };
  workspaces: { root: string };
  recent?: any[];
};

export type TemplateEntry = {
  name: string;
  description: string;
  type: "blank" | "github";
  repo?: string;     // owner/name for github
  branch?: string;
  varsFile?: string; // template.vars.json path
  specRoot?: string; // default specs path
  postInit?: string[];
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
