import fs from "fs-extra";
import path from "node:path";

export async function resolveRepoRoot(startDir?: string): Promise<string> {
  let current = path.resolve(startDir || process.cwd());

  while (true) {
    const specPath = path.join(current, ".speckit", "spec.yaml");
    if (await fs.pathExists(specPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(`Unable to locate .speckit/spec.yaml from ${startDir || process.cwd()}`);
}
