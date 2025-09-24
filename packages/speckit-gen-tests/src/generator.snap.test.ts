import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { SpecModel } from "../../speckit-core/src/model/SpecModel.js";
import type { BundleDefinition, CatalogLockEntry } from "../../speckit-cli/src/services/catalog.js";
import { generateDocs } from "../../speckit-cli/src/services/generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultBundleDir = path.join(__dirname, "fixtures", "test-bundle");

const baseModel: SpecModel = {
  version: "2024.09",
  meta: { title: "SpecKit Demo", mode: "Classic" },
  requirements: [
    { id: "REQ-001", title: "Render overview" },
    { id: "REQ-002", title: "Preserve placeholders" },
  ],
};

const mockDialect = { id: "speckit.v1", version: "1.1.0" };

let activeModel: SpecModel = deepClone(baseModel);
let activeBundle: BundleDefinition = createBundleDefinition({
  id: "test-bundle",
  dir: defaultBundleDir,
  outputs: [
    { id: "overview", from: "overview.md.njk", to: "docs/overview.md" },
    { id: "config", from: "config.yaml.njk", to: "config/app.yaml" },
    { id: "metadata", from: "metadata.ts.njk", to: "src/metadata.ts" },
  ],
});
let activeCatalogEntry: CatalogLockEntry = createCatalogEntry(activeBundle);

vi.mock("../../speckit-cli/src/services/spec.js", () => ({
  loadSpecModel: vi.fn(async () => ({
    model: mockModel,
    dialect: mockDialect,
    data: { engine: { mode: "classic" } },
  })),
  hashSpecYaml: vi.fn(async () => "sha256:mock-spec-digest"),
}));

vi.mock("../../speckit-cli/src/services/catalog.js", () => ({
  loadCatalogLock: vi.fn(async () => [activeCatalogEntry]),
  loadBundle: vi.fn(async () => activeBundle),
  assertSpeckitCompatibility: vi.fn(),
  assertSpecCompatibility: vi.fn(),
  assertDialectCompatibility: vi.fn(),
}));

vi.mock("../../speckit-cli/src/services/version.js", async () => {
  const actual = await vi.importActual<typeof import("../../speckit-cli/src/services/version.js")>(
    "../../speckit-cli/src/services/version.js"
  );
  return {
    ...actual,
    getSpeckitVersion: vi.fn(async () => ({ version: "0.1.0", commit: "abc1234" })),
  };
});

vi.mock("../../speckit-cli/src/services/manifest.js", () => ({
  appendManifestRun: vi.fn(),
  updateManifestSpeckit: vi.fn(),
}));

const tempRepos: string[] = [];

async function createRepoRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-gen-tests-"));
  tempRepos.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of tempRepos) {
    await fs.remove(dir);
  }
});

describe("generator snapshots", () => {
  beforeEach(() => {
    resetActiveFixtures();
  });

  it("renders markdown output with provenance snapshot", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-02T03:04:05Z"));
      const repoRoot = await createRepoRoot();
      await generateDocs({ repoRoot, write: true });
      const markdown = await fs.readFile(path.join(repoRoot, "docs", "overview.md"), "utf8");
      expect(markdown).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders yaml output with language appropriate header", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-02T03:04:05Z"));
      const repoRoot = await createRepoRoot();
      await generateDocs({ repoRoot, write: true });
      const yaml = await fs.readFile(path.join(repoRoot, "config", "app.yaml"), "utf8");
      expect(yaml).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders typescript metadata with provenance comment", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-02T03:04:05Z"));
      const repoRoot = await createRepoRoot();
      await generateDocs({ repoRoot, write: true });
      const tsContent = await fs.readFile(path.join(repoRoot, "src", "metadata.ts"), "utf8");
      expect(tsContent).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains provenance timestamp when rerun without changes", async () => {
    vi.useFakeTimers();
    try {
      const repoRoot = await createRepoRoot();
      vi.setSystemTime(new Date("2024-01-02T03:04:05Z"));
      const first = await generateDocs({ repoRoot, write: true });
      expect(first.outputs.every(output => output.changed)).toBe(true);
      const initial = await fs.readFile(path.join(repoRoot, "docs", "overview.md"), "utf8");
      expect(initial).toContain("generated_at: '2024-01-02T03:04:05.000Z'");

      vi.setSystemTime(new Date("2024-05-06T07:08:09Z"));
      const second = await generateDocs({ repoRoot, write: true });
      expect(second.outputs.every(output => output.changed === false)).toBe(true);
      const after = await fs.readFile(path.join(repoRoot, "docs", "overview.md"), "utf8");
      expect(after).toBe(initial);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("mode generator snapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetActiveFixtures();
  });

  const cases = [
    {
      label: "classic",
      dir: "mode-classic",
      bundleId: "mode-classic",
      outputPath: ["docs", "mode-classic.md"],
      meta: { title: "Mode Classic", mode: "Classic" },
    },
    {
      label: "secure",
      dir: "mode-secure",
      bundleId: "mode-secure",
      outputPath: ["docs", "mode-secure.md"],
      meta: { title: "Mode Secure", mode: "Secure" },
    },
  ] as const;

  it.each(cases)("renders $label mode snapshot", async fixture => {
    const repoRoot = await createRepoRoot();
    activeModel = {
      ...deepClone(baseModel),
      meta: { ...deepClone(baseModel.meta ?? {}), ...fixture.meta },
    };
    const bundleDir = path.join(__dirname, "fixtures", fixture.dir);
    activeBundle = createBundleDefinition({
      id: fixture.bundleId,
      dir: bundleDir,
      outputs: [
        { id: "mode", from: "mode.md.njk", to: `docs/${fixture.bundleId}.md` },
      ],
    });
    activeCatalogEntry = createCatalogEntry(activeBundle);

    vi.setSystemTime(new Date("2024-01-02T03:04:05Z"));
    await generateDocs({ repoRoot, write: true });
    const markdown = await fs.readFile(path.join(repoRoot, ...fixture.outputPath), "utf8");
    expect(markdown).toMatchSnapshot();
  });
});

type BundleShape = {
  id: string;
  dir: string;
  outputs: { id: string; from: string; to: string }[];
};

function createBundleDefinition(shape: BundleShape): BundleDefinition {
  return {
    id: shape.id,
    kind: "specs",
    version: "0.0.1",
    engine: "nunjucks",
    requires_speckit: ">=0.0.0",
    requires_dialect: { id: "speckit.v1", range: ">=1.0.0 <2.0.0" },
    outputs: shape.outputs.map(output => ({ ...output })),
    dir: shape.dir,
  };
}

function createCatalogEntry(bundleDef: BundleDefinition): CatalogLockEntry {
  return {
    id: bundleDef.id,
    sha: `${bundleDef.id}-sha`,
    version: bundleDef.version,
    requires_speckit: bundleDef.requires_speckit,
    requires_dialect: { ...bundleDef.requires_dialect },
    synced_with: { version: bundleDef.version, commit: `${bundleDef.id}-commit` },
  };
}

function resetActiveFixtures() {
  activeModel = deepClone(baseModel);
  activeBundle = createBundleDefinition({
    id: "test-bundle",
    dir: defaultBundleDir,
    outputs: [
      { id: "overview", from: "overview.md.njk", to: "docs/overview.md" },
      { id: "config", from: "config.yaml.njk", to: "config/app.yaml" },
      { id: "metadata", from: "metadata.ts.njk", to: "src/metadata.ts" },
    ],
  });
  activeCatalogEntry = createCatalogEntry(activeBundle);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
