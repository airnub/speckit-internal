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

vi.mock("@speckit/core", () => ({
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

import App from "./App.js";

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

describe("App refreshRepo selection", () => {
  let repoPath: string;
  let specDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
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
      repo: { specRoot: "docs/specs" },
      ai: { enabled: false }
    } as any));
    loadTemplatesMock.mockResolvedValue([]);
    openInEditorMock.mockImplementation(async (filePath: string) => {
      await fs.appendFile(filePath, "\nEdited!");
    });
  });

  afterEach(async () => {
    await fs.remove(repoPath);
    repoState.repoPath = "";
  });

  it("keeps the selected file focused after refreshing via editor", async () => {
    const app = render(<App />);
    const secondPath = path.join(specDir, "spec_b.md");

    await waitUntil(() => app.lastFrame()?.includes("spec_a.md") ?? false);
    app.stdin.write("\u001B[B");
    await waitUntil(() => app.lastFrame()?.includes("spec_b.md") ?? false);
    await waitUntil(() => app.lastFrame()?.includes("B content") ?? false);
    app.stdin.write("e");
    await waitUntil(() => openInEditorMock.mock.calls.length === 1);
    expect(openInEditorMock).toHaveBeenCalledWith(secondPath);
    await waitUntil(() => app.lastFrame()?.includes("spec_b.md") ?? false);
    await waitUntil(() => app.lastFrame()?.includes("Edited!") ?? false);

    app.unmount();
  });
});
