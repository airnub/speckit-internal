import React from "react";
import { render } from "ink-testing-library";
import fs from "fs-extra";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  state: repoState,
  loadConfigMock,
  saveConfigMock,
  loadTemplatesMock,
  generatePatchMock,
  gitRootMock,
  gitBranchMock,
  gitStatusMock,
  gitDiffMock,
  openInEditorMock,
  gitCommitAllMock,
  gitFetchMock,
  gitPullMock,
  gitPushMock,
  runCmdMock
} = vi.hoisted(() => {
  const state = { repoPath: "" };
  return {
    state,
    loadConfigMock: vi.fn(),
    saveConfigMock: vi.fn(),
    loadTemplatesMock: vi.fn(),
    generatePatchMock: vi.fn(),
    gitRootMock: vi.fn(async () => state.repoPath),
    gitBranchMock: vi.fn(async () => "main"),
    gitStatusMock: vi.fn(async () => "## main"),
    gitDiffMock: vi.fn(async () => "(no diff)"),
    openInEditorMock: vi.fn<(filePath: string) => Promise<void>>(),
    gitCommitAllMock: vi.fn(async () => {}),
    gitFetchMock: vi.fn(async () => ({ ok: true, output: "" })),
    gitPullMock: vi.fn(async () => ({ ok: true, output: "" })),
    gitPushMock: vi.fn(async () => ({ ok: true, output: "" })),
    runCmdMock: vi.fn(async () => "")
  };
});

vi.mock("../config.js", () => ({
  loadConfig: loadConfigMock,
  saveConfig: saveConfigMock
}));

vi.mock("@speckit/engine", () => ({
  loadTemplates: loadTemplatesMock
}));

vi.mock("../git.js", () => ({
  gitRoot: gitRootMock,
  gitBranch: gitBranchMock,
  gitStatus: gitStatusMock,
  gitDiff: gitDiffMock,
  openInEditor: openInEditorMock,
  gitCommitAll: gitCommitAllMock,
  gitFetch: gitFetchMock,
  gitPull: gitPullMock,
  gitPush: gitPushMock,
  runCmd: runCmdMock
}));

vi.mock("@speckit/agent", () => ({
  generatePatch: generatePatchMock
}));

import App, { type AppHandle } from "./App.js";

async function waitUntil(predicate: () => boolean, timeout = 4000, interval = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error("Timed out waiting for condition");
}

async function waitForController(ref: React.RefObject<AppHandle>) {
  await waitUntil(() => ref.current != null);
  const controller = ref.current;
  if (!controller) {
    throw new Error("App controller not available");
  }
  return controller;
}

async function createSpecRepo(prefix: string, fileName: string, title: string, body: string) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), prefix));
  const specsDir = path.join(repoRoot, "docs/specs");
  await fs.ensureDir(specsDir);
  const specPath = path.join(specsDir, fileName);
  await fs.writeFile(specPath, `---\ntitle: "${title}"\n---\n${body}\n`);
  return { repoRoot, specsDir, specPath };
}

describe("App refreshRepo selection", () => {
  let repoPath: string;
  let specDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalCwd = process.cwd();
    repoPath = await mkdtemp(path.join(tmpdir(), "speckit-tui-"));
    specDir = path.join(repoPath, "docs/specs");
    await fs.ensureDir(specDir);
    await fs.writeFile(
      path.join(specDir, "spec_a.md"),
      `---\ntitle: "Spec A"\n---\nA content\n`
    );
    await fs.writeFile(
      path.join(specDir, "spec_b.md"),
      `---\ntitle: "Spec B"\n---\nB content\n`
    );
    repoState.repoPath = repoPath;
    loadConfigMock.mockImplementation(async () => ({
      repo: { mode: "local", specRoot: "docs/specs" },
      ai: { enabled: false }
    } as any));
    loadTemplatesMock.mockResolvedValue([]);
    openInEditorMock.mockImplementation(async (filePath: string) => {
      await fs.appendFile(filePath, "\nEdited!");
    });
    process.chdir(repoPath);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(repoPath);
    repoState.repoPath = "";
  });

  it("keeps the selected file focused after refreshing via editor", async () => {
    const appRef = React.createRef<AppHandle>();
    const app = render(<App ref={appRef} />);
    await waitForController(appRef);
    const getController = () => {
      const handle = appRef.current;
      if (!handle) {
        throw new Error("App controller not available");
      }
      return handle;
    };
    const secondPath = path.join(specDir, "spec_b.md");

    await waitUntil(() => app.lastFrame()?.includes("spec_a.md") ?? false);
    await waitUntil(() => getController().getState().files.length > 1);
    getController().selectFile(1);
    await waitUntil(() => app.lastFrame()?.includes("spec_b.md") ?? false);
    await waitUntil(() => app.lastFrame()?.includes("B content") ?? false);
    const stateAfterSelect = getController().getState();
    expect(stateAfterSelect.index).toBe(1);
    expect(stateAfterSelect.files[stateAfterSelect.index]?.path).toBe(secondPath);
    await getController().editSelectedFile();
    expect(openInEditorMock).toHaveBeenCalledWith(secondPath);
    await waitUntil(() => app.lastFrame()?.includes("spec_b.md") ?? false);
    await waitUntil(() => app.lastFrame()?.includes("Edited!") ?? false);

    app.unmount();
  });

  it("launches from the current repo when config has no override", async () => {
    const { repoRoot } = await createSpecRepo(
      "speckit-tui-alt-",
      "alt.md",
      "Spec Alt",
      "Alt content"
    );

    process.chdir(repoRoot);
    repoState.repoPath = repoRoot;

    const appRef = React.createRef<AppHandle>();
    const app = render(<App ref={appRef} />);
    try {
      await waitForController(appRef);
      const getController = () => {
        const handle = appRef.current;
        if (!handle) {
          throw new Error("App controller not available");
        }
        return handle;
      };
      await waitUntil(() => app.lastFrame() != null);
      await waitUntil(() => getController().getState().repoPath === repoRoot);
      const state = getController().getState();
      expect(state.repoPath).toBe(repoRoot);
      await waitUntil(() => app.lastFrame()?.includes("Spec Alt") ?? false);
      await waitUntil(() => app.lastFrame()?.includes("Alt content") ?? false);
    } finally {
      app.unmount();
      process.chdir(originalCwd);
      await fs.remove(repoRoot);
    }
  });

  it("retains a deliberate repo override across refreshes", async () => {
    const { repoRoot: overrideRoot, specPath: overrideSpec } = await createSpecRepo(
      "speckit-tui-override-",
      "override.md",
      "Spec Override",
      "Override content"
    );

    loadConfigMock.mockImplementation(async () => ({
      repo: { mode: "local", specRoot: "docs/specs", localPath: `${overrideRoot} ` },
      ai: { enabled: false }
    } as any));

    repoState.repoPath = repoPath;

    const appRef = React.createRef<AppHandle>();
    const app = render(<App ref={appRef} />);
    try {
      await waitForController(appRef);
      const getController = () => {
        const handle = appRef.current;
        if (!handle) {
          throw new Error("App controller not available");
        }
        return handle;
      };
      await waitUntil(() => loadTemplatesMock.mock.calls.length > 0);
      const state = getController().getState();
      expect(state.repoPath).toBe(overrideRoot);
      await waitUntil(() => getController().getState().repoPath === overrideRoot);
      await waitUntil(() => app.lastFrame()?.includes("Spec Override") ?? false);
      await waitUntil(() => app.lastFrame()?.includes("Override content") ?? false);

      await getController().editSelectedFile();
      expect(openInEditorMock).toHaveBeenCalledWith(overrideSpec);
      await waitUntil(() => loadTemplatesMock.mock.calls.length > 1);
      expect(loadTemplatesMock.mock.calls[1][0]?.repoRoot).toBe(overrideRoot);
      expect(await fs.readFile(overrideSpec, "utf8")).toContain("Edited!");
    } finally {
      app.unmount();
      await fs.remove(overrideRoot);
    }
  });
});
