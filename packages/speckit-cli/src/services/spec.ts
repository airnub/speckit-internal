import fs from "fs-extra";
import path from "node:path";
import { parse } from "yaml";

export type SpeckitSpec = {
  spec: {
    meta: {
      id: string;
      title: string;
      version: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export async function loadSpec(repoRoot = process.cwd()): Promise<SpeckitSpec> {
  const specPath = path.join(repoRoot, ".speckit", "spec.yaml");

  try {
    const text = await fs.readFile(specPath, "utf8");
    const data = parse(text) as SpeckitSpec;
    if (!data?.spec || typeof data.spec !== "object") {
      throw new Error("Missing root 'spec' property.");
    }
    if (!data.spec.meta || typeof data.spec.meta !== "object") {
      throw new Error("Missing spec.meta block.");
    }
    if (typeof (data.spec.meta as any).version !== "string") {
      throw new Error("spec.meta.version must be a string.");
    }
    return data;
  } catch (error: any) {
    throw new Error(`Failed to load spec from ${specPath}: ${error?.message || error}`);
  }
}
