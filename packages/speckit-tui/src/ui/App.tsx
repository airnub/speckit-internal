import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { globby } from "globby";
import matter from "gray-matter";
import fs from "fs-extra";
import path from "node:path";
import TextInput from "ink-text-input";
import { loadTemplates, TemplateEntry, SpeckitConfig } from "@speckit/core";
import { useTemplateIntoDir, PostInitCommandEvent } from "@speckit/cli/src/services/template.js";
import { loadConfig, saveConfig } from "../config.js";
import { gitRoot, gitBranch, gitStatus, gitDiff, openInEditor, gitCommitAll, gitFetch, gitPull, gitPush, runCmd, GitCommandResult, gitEnsureGithubRepo } from "../git.js";
import { execa } from "execa";
import { generatePatch, AgentConfig } from "@speckit/agent";

const TUI_VERSION = "v0.0.1";
const SPECKIT_ASCII = String.raw`
 ____                  _  ___ _
/ ___| _ __   ___  ___| |/ (_) |_
\___ \| '_ \ / _ \/ __| ' /| | __|
 ___) | |_) |  __/ (__| . \| | |_
|____/| .__/ \___|\___|_|\_\_|\__|
      |_|
`.trim().split("\n");
const SPECKIT_TAGLINE = "Spec-driven commits from your terminal";
const KEY_HINTS = "↑/↓ select · E edit · N new (template) · P preview · D diff · C commit · L pull · F fetch · U push · K Spectral lint · B Build docs/RTM · A AI Propose (if enabled) · S Settings · G status · ? help · Q quit";
const TEMPLATE_CANCELLED_MESSAGE = "Template cancelled by user.";

type FileInfo = { path: string; title?: string };
type RefreshOptions = { selectedPath?: string | null };
type RefreshResult = { ok: true; path: string } | { ok: false; error: string };
type Mode = "preview"|"diff"|"commit"|"help"|"new-template"|"tasks"|"ai"|"settings"|"template-prompt";

type SettingFieldType = "boolean"|"select"|"text"|"list"|"action";
type SettingField = {
  id: string;
  label: string;
  type: SettingFieldType;
  options?: string[];
  mask?: boolean;
  placeholder?: string;
  help?: string;
};
type SettingsFieldWithValue = SettingField & { value: any };

type TemplatePromptState = {
  templateName: string;
  message: string;
  defaultValue: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
};

export default function App() {
  const [cfg, setCfg] = useState<SpeckitConfig|null>(null);
  const initialRepoPathRef = React.useRef(path.resolve(process.cwd()));
  const [repoPath, setRepoPath] = useState<string>(initialRepoPathRef.current);
  const [branch, setBranch] = useState<string>("main");
  const [specRoot, setSpecRoot] = useState<string>("docs/specs");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [idx, setIdx] = useState(0);
  const [content, setContent] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [mode, setMode] = useState<Mode>("preview");
  const [commitMsg, setCommitMsg] = useState<string>("chore(specs): update");

  // template modal
  const [tplIndex, setTplIndex] = useState(0);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [targetDir, setTargetDir] = useState<string>("");
  const [templatePrompt, setTemplatePrompt] = useState<TemplatePromptState|null>(null);
  const [templatePromptValue, setTemplatePromptValue] = useState<string>("");

  // tasks/ai
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [taskOutput, setTaskOutput] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>("");

  // settings
  const [settingsDraft, setSettingsDraft] = useState<SpeckitConfig|null>(null);
  const [settingsCursor, setSettingsCursor] = useState(0);
  const [settingsEditing, setSettingsEditing] = useState(false);
  const [settingsEditValue, setSettingsEditValue] = useState<string>("");
  const [settingsEditField, setSettingsEditField] = useState<SettingsFieldWithValue|null>(null);

  async function refreshRepo(rootOverride?: string, options?: RefreshOptions): Promise<RefreshResult> {
    const conf = await loadConfig();
    setCfg(conf);

    const initialRepoPath = initialRepoPathRef.current
      ? path.resolve(initialRepoPathRef.current)
      : undefined;
    const currentRepoPath = repoPath ? path.resolve(repoPath) : undefined;
    const overridePath = rootOverride ? path.resolve(rootOverride) : undefined;

    let resolvedRoot: string;
    try {
      resolvedRoot = await resolveRepoRoot({
        config: conf,
        overridePath,
        currentRepoPath,
        initialRepoPath
      });
    } catch (error: any) {
      const message = formatRefreshError(error);
      setStatus(`Refresh error: ${message}`);
      return { ok: false, error: message };
    }

    const repoChanged = !currentRepoPath || currentRepoPath !== resolvedRoot;

    try {
      const availableTemplates = await loadTemplates({ repoRoot: resolvedRoot });
      setRepoPath(resolvedRoot);
      setTemplates(availableTemplates);
      setTplIndex(prev => {
        if (availableTemplates.length === 0) return 0;
        return Math.min(prev, availableTemplates.length - 1);
      });
      setBranch(await gitBranch(resolvedRoot));
      setStatus(await gitStatus(resolvedRoot));
      const resolvedSpecRoot = conf.repo?.specRoot || "docs/specs";
      const resolvedSpecRootPath = path.join(resolvedRoot, resolvedSpecRoot);
      const templateDir = path.join(resolvedSpecRootPath, "templates");
      setSpecRoot(resolvedSpecRoot);
      const pattern = [
        path.join(resolvedSpecRootPath, "**/*.md"),
        `!${path.join(templateDir, "**")}`
      ];
      const paths = (await globby(pattern)).sort();
      const infos: FileInfo[] = [];
      for (const file of paths) {
        const raw = await fs.readFile(file, "utf8");
        const fm = matter(raw).data as any;
        infos.push({ path: file, title: fm?.title });
      }
      const selectionOverride = options?.selectedPath ?? (repoChanged ? null : undefined);
      const resetSelection = selectionOverride === null;
      const preferredPath = selectionOverride === undefined
        ? files[idx]?.path
        : selectionOverride ?? undefined;
      setFiles(infos);
      if (infos.length === 0) {
        setIdx(0);
        setContent("");
        return { ok: true, path: resolvedRoot };
      }
      let nextIdx = 0;
      if (!resetSelection && preferredPath) {
        const found = infos.findIndex(info => info.path === preferredPath);
        if (found >= 0) {
          nextIdx = found;
        }
      }
      setIdx(nextIdx);
      try {
        setContent(await fs.readFile(infos[nextIdx].path, "utf8"));
      } catch {
        setContent("");
      }
      return { ok: true, path: resolvedRoot };
    } catch (error: any) {
      const message = formatRefreshError(error);
      setStatus(`Refresh error: ${message}`);
      return { ok: false, error: message };
    }
  }

  const settingsFields = React.useMemo(
    () => settingsDraft ? buildSettingsFields(settingsDraft) : [],
    [settingsDraft]
  );

  useEffect(() => { void refreshRepo(); }, []);
  useEffect(() => { (async () => {
    const file = files[idx];
    if (!file) {
      setContent("");
      return;
    }
    try {
      setContent(await fs.readFile(file.path, "utf8"));
    } catch {
      setContent("");
    }
  })(); }, [idx, files.length]);

  useEffect(() => {
    if (mode !== "settings") return;
    setSettingsCursor(cursor => {
      if (settingsFields.length === 0) return 0;
      return Math.min(cursor, settingsFields.length - 1);
    });
  }, [mode, settingsFields.length]);

  const selectedTemplate = templates[tplIndex] ?? null;
  const templateRequiresTarget = mode === "new-template" && selectedTemplate?.type === "github";
  const textInputActive =
    mode === "template-prompt" ||
    mode === "commit" ||
    mode === "ai" ||
    templateRequiresTarget ||
    (mode === "settings" && settingsEditing);

  async function confirmTemplateSelection() {
    const sel = templates[tplIndex];
    if (!sel) return;
    if (sel.type === "github" && !targetDir.trim()) {
      return;
    }

    const currentSelection = files[idx]?.path;
    const trimmedTarget = targetDir.trim();
    const targetBase = sel.type === "github"
      ? (path.isAbsolute(trimmedTarget) ? trimmedTarget : path.resolve(repoPath, trimmedTarget))
      : repoPath;
    const commandOutputs: string[] = [];
    const updateTaskOutput = () => {
      const combined = commandOutputs.join("\n\n");
      setTaskOutput(combined || "(running...)");
    };

    const promptHandler = ({ message, default: def }: { message: string; default?: string }) => {
      return new Promise<string>((resolve, reject) => {
        const defaultValue = typeof def === "string" ? def : "";
        const cleanup = () => {
          setTemplatePrompt(null);
          setTemplatePromptValue("");
        };
        setTemplatePromptValue(defaultValue);
        setTemplatePrompt({
          templateName: sel.name,
          message,
          defaultValue,
          resolve: (value: string) => {
            cleanup();
            setMode("tasks");
            resolve(value);
          },
          reject: (error: Error) => {
            cleanup();
            setMode("tasks");
            reject(error);
          }
        });
        setMode("template-prompt");
      });
    };

    const onPostInitCommand = async (event: PostInitCommandEvent) => {
      commandOutputs.push(formatPostInitCommand(event));
      updateTaskOutput();
    };

    setTaskTitle(`Applying template: ${sel.name}`);
    setTaskOutput("(running...)");
    setMode("tasks");

    try {
      await useTemplateIntoDir(sel, targetBase, {
        mergeIntoCwd: false,
        promptVars: true,
        runPostInit: true,
        promptInput: promptHandler,
        onPostInitCommand
      });

      if (sel.type === "github") {
        const refreshResult = await refreshRepo(targetBase, { selectedPath: null });
        if (!refreshResult.ok) {
          throw new Error(refreshResult.error);
        }
        setTargetDir("");
      } else {
        const options = currentSelection ? { selectedPath: currentSelection } : undefined;
        const refreshResult = await refreshRepo(repoPath, options);
        if (!refreshResult.ok) {
          throw new Error(refreshResult.error);
        }
      }

      const outputs = commandOutputs.length
        ? [...commandOutputs]
        : ["(no post-init commands)"];
      const displayPath = formatTemplateTarget(sel.type === "github" ? targetBase : repoPath);
      outputs.push(`Applied template to ${displayPath}.`);
      setTaskTitle(`Template '${sel.name}' ✓`);
      setTaskOutput(outputs.join("\n\n"));
      setMode("tasks");
    } catch (error: any) {
      const outputs = commandOutputs.length ? [...commandOutputs] : [];
      if (error?.message === TEMPLATE_CANCELLED_MESSAGE) {
        outputs.push(TEMPLATE_CANCELLED_MESSAGE);
        setTaskTitle(`Template '${sel.name}' cancelled`);
        setTaskOutput(outputs.join("\n\n"));
        setMode("tasks");
        return;
      }
      outputs.push(formatTemplateError(error));
      setTaskTitle(`Template '${sel.name}' ✗`);
      setTaskOutput(outputs.join("\n\n"));
      setMode("tasks");
    }
  }

  useInput(async (input, key) => {
    if (mode === "new-template") {
      if (key.upArrow) {
        setTplIndex(i => Math.max(0, i-1));
        return;
      }
      if (key.downArrow) {
        setTplIndex(i => Math.min(templates.length-1, i+1));
        return;
      }
    }

    if (textInputActive) {
      return;
    }

    const gitToken = cfg?.repo?.mode === "github"
      ? (cfg.github?.pat?.trim() || undefined)
      : undefined;

    if (mode === "settings") {
      await handleSettingsInput(input, key);
      return;
    }

    if (key.upArrow) {
      setIdx(i => Math.max(0, i-1));
    }
    if (key.downArrow) {
      setIdx(i => Math.min(files.length-1, i+1));
    }
    if (input === "q") process.exit(0);
    if (input === "?") setMode("help");
    if (input === "p") setMode("preview");
    if (input === "d") setMode("diff");
    if (input === "c") setMode("commit");
    if (input === "s") { openSettings(); return; }
    if (input === "g") setStatus(await gitStatus(repoPath));
    if (input === "e" && files[idx]) {
      const selectedPath = files[idx]?.path;
      if (selectedPath) {
        await openInEditor(selectedPath);
        await refreshRepo(repoPath, { selectedPath });
      }
    }
    if (input === "n") { setMode("new-template"); }
    if (input === "f") { await handleGitAction("Git fetch", () => gitFetch(repoPath, { token: gitToken })); return; }
    if (input === "l") { await handleGitAction("Git pull", () => gitPull(repoPath, { token: gitToken })); return; }
    if (input === "u") { await handleGitAction("Git push", () => gitPush(repoPath, { token: gitToken })); return; }
    if (input === "k") { await runSpectral(repoPath); }
    if (input === "b") { await runPostInit(repoPath); }
    if (input === "a") {
      if (!cfg?.ai?.enabled) {
        setTaskTitle("AI disabled");
        setTaskOutput("AI is OFF. Enable it in ~/.config/spec-studio/config.json (ai.enabled: true).");
        setMode("tasks");
      } else {
        setMode("ai");
      }
    }
    if (key.return && mode === "new-template") {
      await confirmTemplateSelection();
    }
  });

  function openSettings() {
    if (!cfg) return;
    const draft = cloneConfig(cfg);
    setSettingsDraft(draft);
    setSettingsCursor(0);
    cancelSettingsEdit();
    setMode("settings");
  }

  async function handleSettingsInput(input: string, key: any) {
    if (!settingsDraft) {
      if (input === "q") setMode("preview");
      return;
    }

    if (settingsEditing) {
      return;
    }

    if (input === "q") {
      cancelSettings();
      return;
    }

    if (key.upArrow) {
      setSettingsCursor(i => Math.max(0, i-1));
      return;
    }
    if (key.downArrow) {
      if (settingsFields.length === 0) return;
      setSettingsCursor(i => Math.min(settingsFields.length-1, i+1));
      return;
    }

    const field = settingsFields[settingsCursor];
    if (!field) return;

    switch (field.type) {
      case "boolean": {
        if (input === " " || key.return || key.leftArrow || key.rightArrow) {
          applySetting(field.id, !field.value);
        }
        break;
      }
      case "select": {
        if (!field.options?.length) break;
        let dir = 0;
        if (key.leftArrow) dir = -1;
        else if (key.rightArrow || key.return) dir = 1;
        if (dir !== 0) {
          applySetting(field.id, cycleOption(field.options, field.value, dir));
        }
        break;
      }
      case "text": {
        if (field.options?.length && (key.leftArrow || key.rightArrow)) {
          const dir = key.leftArrow ? -1 : 1;
          applySetting(field.id, cycleOption(field.options, field.value, dir));
          break;
        }
        if (key.return) {
          startSettingsEdit(field);
        }
        break;
      }
      case "list": {
        if (key.return) {
          startSettingsEdit(field);
        }
        break;
      }
      case "action": {
        if (key.return) {
          if (field.id === "action.save") {
            await commitSettingsChanges();
          } else if (field.id === "action.cancel") {
            cancelSettings();
          }
        }
        break;
      }
    }
  }

  function startSettingsEdit(field: SettingsFieldWithValue) {
    setSettingsEditing(true);
    setSettingsEditField(field);
    if (field.type === "list") {
      const items = Array.isArray(field.value) ? field.value : [];
      setSettingsEditValue(items.join("\n"));
    } else {
      setSettingsEditValue(
        field.value == null ? "" : String(field.value)
      );
    }
  }

  function cancelSettingsEdit() {
    setSettingsEditing(false);
    setSettingsEditField(null);
    setSettingsEditValue("");
  }

  function cancelSettings() {
    cancelSettingsEdit();
    setSettingsDraft(null);
    setSettingsCursor(0);
    setMode("preview");
  }

  function applySetting(id: string, value: any) {
    setSettingsDraft(prev => {
      if (!prev) return prev;
      const next = cloneConfig(prev);
      setValueAtPath(next, id, value);
      return next;
    });
  }

  function handleSettingsEditSubmit(value: string) {
    if (!settingsDraft || !settingsEditField) return;
    if (settingsEditField.type === "list") {
      applySetting(settingsEditField.id, parseList(value));
    } else {
      const trimmed = value.trim();
      applySetting(settingsEditField.id, trimmed === "" ? undefined : trimmed);
    }
    cancelSettingsEdit();
  }

  async function commitSettingsChanges() {
    if (!settingsDraft) return;
    const draft = cloneConfig(settingsDraft);
    try {
      await saveConfig(draft);
      cancelSettingsEdit();
      setSettingsDraft(null);
      setSettingsCursor(0);
      const repoOverride = draft.repo?.mode === "local" && draft.repo?.localPath
        ? draft.repo.localPath
        : undefined;
      const currentSelection = files[idx]?.path;
      const shouldResetSelection = draft.repo?.mode === "github" || !!repoOverride;
      const refreshResult = await refreshRepo(repoOverride, {
        selectedPath: shouldResetSelection ? null : currentSelection
      });
      if (!refreshResult.ok) {
        setTaskTitle("Settings error");
        setTaskOutput(refreshResult.error);
        setMode("tasks");
        return;
      }
      setTaskTitle("Settings saved");
      setTaskOutput(formatSettingsSummary(draft));
      setMode("tasks");
    } catch (error: any) {
      setTaskTitle("Settings error");
      setTaskOutput(error?.message || String(error));
      setMode("tasks");
    }
  }

  async function handleGitAction(title: string, action: () => Promise<GitCommandResult>) {
    setTaskTitle(title);
    setTaskOutput("(running...)");
    setMode("tasks");
    let result: GitCommandResult | null = null;
    let errorText = "";
    try {
      result = await action();
    } catch (error: any) {
      errorText = error?.message || String(error);
    }
    setStatus(await gitStatus(repoPath));
    if (result) {
      setTaskTitle(`${title}${result.ok ? " ✓" : " ✗"}`);
      setTaskOutput(result.output || "(no output)");
    } else {
      setTaskTitle(`${title} ✗`);
      setTaskOutput(errorText || "(no output)");
    }
  }

  function startCommitTask() {
    setTaskTitle("Git commit");
    setTaskOutput("(running...)");
    setMode("tasks");
  }

  async function finishCommitTask(result: GitCommandResult) {
    setStatus(await gitStatus(repoPath));
    setTaskTitle(result.ok ? "Git commit ✓" : "Git commit ✗");
    setTaskOutput(result.output || "(no output)");
    if (result.ok) {
      setCommitMsg("chore(specs): update");
    }
    setMode("tasks");
  }

  async function runSpectral(cwd: string) {
    const srsRelativePath = "docs/srs.yaml";
    const srsFullPath = path.join(cwd, srsRelativePath);

    setMode("tasks");

    if (!(await fs.pathExists(srsFullPath))) {
      setTaskTitle("Spectral Lint ✗");
      setTaskOutput([
        `Could not find ${srsRelativePath}.`,
        `Create the SRS file (for example via a template) or update your config to point at it before linting.`,
        `Looked in: ${srsFullPath}`
      ].join("\n"));
      return;
    }

    setTaskTitle("Spectral Lint (docs/srs.yaml)");
    setTaskOutput("(running...)");

    try {
      const { stdout } = await execa("npx", ["-y", "spectral", "lint", srsRelativePath], { cwd });
      setTaskTitle("Spectral Lint ✓");
      setTaskOutput(stdout?.trim() || "Spectral lint passed with no reported issues.");
    } catch (error: any) {
      const outputs = [error?.stderr, error?.stdout, error?.shortMessage, error?.message]
        .filter((value): value is string => Boolean(value))
        .map(line => line.trim())
        .filter(Boolean);
      const combinedOutput = outputs.join("\n");
      const spectralMissing =
        error?.code === "ENOENT" ||
        error?.exitCode === 127 ||
        /spectral[^\n]*(command not found|not installed|ENOENT)/i.test(combinedOutput) ||
        /command not found/i.test(error?.message || combinedOutput) ||
        /Cannot find module '?(?:@stoplight\/spectral|spectral)'?/i.test(combinedOutput);

      const hint = "Hint: Install Spectral via `pnpm add -D @stoplight/spectral-cli` and rerun the lint.";
      const outputLines: string[] = [];
      if (combinedOutput) {
        outputLines.push(combinedOutput);
      } else {
        outputLines.push("Spectral lint failed.");
      }
      if (spectralMissing) {
        if (outputLines.length > 0) outputLines.push("");
        outputLines.push(hint);
      }
      setTaskTitle("Spectral Lint ✗");
      setTaskOutput(outputLines.join("\n"));
    }
  }

  async function runPostInit(cwd: string) {
    setTaskTitle("PostInit (docs/RTM builders)");
    setMode("tasks");
    let out = "";
    const pkgPath = path.join(cwd, "package.json");
    if (await fs.pathExists(pkgPath)) {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
      const cmds: string[][] = [];
      if (pkg.scripts?.["docs:gen"]) cmds.push(["pnpm","run","docs:gen"]);
      if (pkg.scripts?.["rtm:build"]) cmds.push(["pnpm","run","rtm:build"]);
      if (cmds.length === 0) {
        setTaskOutput("No postInit scripts detected (looked for 'docs:gen' and 'rtm:build').");
        return;
      }
      for (const [bin, ...args] of cmds) {
        out += `\n$ ${bin} ${args.join(' ')}\n`;
        out += await runCmd(cwd, bin, args);
      }
    } else {
      out = "No package.json found.";
    }
    setTaskOutput(out || "(no output)");
  }

  async function runAi(requirement: string) {
    if (!cfg?.ai?.enabled) return;
    const agentCfg: AgentConfig = {
      provider: (cfg.provider || "openai") as any,
      openai: cfg.openai,
      github: cfg.github
    };
    setTaskTitle("AI propose patch");
    setMode("tasks");
    try {
      const plan = await generatePatch(agentCfg, requirement, `repo:${repoPath} branch:${branch}`);
      const output = `Summary: ${plan.summary}\n${plan.rationale ? "Rationale: " + plan.rationale + "\n" : ""}Patch:\n${plan.patch || "(no patch returned)"}`;
      setTaskOutput(output);
    } catch (e:any) {
      setTaskOutput("Error: " + (e?.message || String(e)));
    }
  }

  const provider = cfg?.provider || "openai";
  const model = provider === "github"
    ? (cfg?.github?.model || "-")
    : (cfg?.openai?.model || "-");
  const aiEnabled = !!cfg?.ai?.enabled;
  const current = files[idx];
  const terminalRows = (process.stdout as any).rows ?? 40;
  const headerRows = SPECKIT_ASCII.length + 5;
  const boxHeight = Math.max(10, terminalRows - headerRows);

  return (
    <Box flexDirection="column">
      <Header
        repoPath={repoPath}
        branch={branch}
        specRoot={specRoot}
        aiEnabled={aiEnabled}
        provider={provider}
        model={model}
      />
      <Box borderStyle="round" height={boxHeight}>
        <Box width={40} borderStyle="single" flexDirection="column">
          <Text underline>Specs</Text>
          {files.length === 0 && <Text dimColor>(none) Press 'n' to start from template</Text>}
          {files.map((f,i) => (
            <Text key={f.path} color={i===idx ? "black":undefined} backgroundColor={i===idx ? "cyan":undefined}>
              {truncate(f.title || path.basename(f.path), 34)}
            </Text>
          ))}
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>{status.split("\n")[0]}</Text>
          </Box>
        </Box>
        <Box flexGrow={1} borderStyle="single" padding={1} flexDirection="column">
          {mode === "preview" && (<><Text dimColor>{current?.path ?? "(no file)"} </Text><Text>{content || "(empty)"}</Text></>)}
          {mode === "diff" && <Diff path={current?.path} cwd={repoPath}/>}
          {mode === "commit" && (
            <CommitUI
              msg={commitMsg}
              setMsg={setCommitMsg}
              repoPath={repoPath}
              onStart={startCommitTask}
              onResult={finishCommitTask}
              onCancel={() => setMode("preview")}
            />
          )}
          {mode === "help" && <HelpUI/>}
          {mode === "new-template" && (
            <TemplatePicker
              templates={templates}
              index={tplIndex}
              targetDir={targetDir}
              setTargetDir={setTargetDir}
              onConfirm={confirmTemplateSelection}
              onCancel={() => setMode("preview")}
              repoPath={repoPath}
            />
          )}
          {mode === "template-prompt" && templatePrompt && (
            <TemplatePromptUI
              state={templatePrompt}
              value={templatePromptValue}
              onChange={setTemplatePromptValue}
              onSubmit={value => templatePrompt.resolve(value)}
              onCancel={() => templatePrompt.reject(new Error(TEMPLATE_CANCELLED_MESSAGE))}
            />
          )}
          {mode === "tasks" && <TaskViewer title={taskTitle} output={taskOutput}/>}
          {mode === "ai" && <AiUI prompt={aiPrompt} setPrompt={setAiPrompt} onSubmit={runAi} onCancel={() => setMode("preview")} />}
          {mode === "settings" && (
            <SettingsUI
              fields={settingsFields}
              cursor={settingsCursor}
              editing={settingsEditing}
              editValue={settingsEditValue}
              editField={settingsEditField}
              onChangeEditValue={setSettingsEditValue}
              onSubmitEdit={handleSettingsEditSubmit}
              onCancelEdit={cancelSettingsEdit}
            />
          )}
        </Box>
      </Box>
      <Box>
        <Text dimColor>{status}</Text>
      </Box>
    </Box>
  );
}

type HeaderProps = {
  repoPath: string;
  branch: string;
  specRoot: string;
  aiEnabled: boolean;
  provider: string;
  model: string;
};

function Header({ repoPath, branch, specRoot, aiEnabled, provider, model }: HeaderProps) {
  const metadata = [
    { label: "Version", value: TUI_VERSION, bold: true },
    { label: "Repo", value: repoPath },
    { label: "Branch", value: branch },
    { label: "Spec root", value: specRoot },
    { label: "AI", value: aiEnabled ? "ON" : "OFF", bold: true, color: aiEnabled ? "green" : "red" },
    { label: "Provider", value: provider },
    { label: "Model", value: model || "-" }
  ];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column">
        {SPECKIT_ASCII.map(line => (
          <Text key={line} color="cyan">{line}</Text>
        ))}
      </Box>
      <Text dimColor>{SPECKIT_TAGLINE}</Text>
      <Box marginTop={1} flexDirection="row" flexWrap="wrap" columnGap={3} rowGap={0}>
        {metadata.map(item => (
          <Box key={item.label} marginRight={2}>
            <Text color="gray">{item.label}:</Text>
            <Text> </Text>
            <Text color={item.color} bold={item.bold}>
              {item.value}
            </Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>{KEY_HINTS}</Text>
    </Box>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n-1) + "…";
}

function Diff({ path: p, cwd }: { path?: string; cwd: string }) {
  const [diff, setDiff] = React.useState<string>("(loading diff...)");
  React.useEffect(() => { (async () => { setDiff(await gitDiff(cwd, p)); })(); }, [p, cwd]);
  return <Text>{diff}</Text>;
}

type CommitUIProps = {
  msg: string;
  setMsg: (value: string) => void;
  repoPath: string;
  onStart?: () => void;
  onResult?: (result: GitCommandResult) => Promise<void> | void;
  onCancel?: () => void;
};

function CommitUI({ msg, setMsg, repoPath, onStart, onResult, onCancel }: CommitUIProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    }
  });
  return (
    <>
      <Text>Commit message:</Text>
      <TextInput
        value={msg}
        onChange={setMsg}
        onSubmit={async () => {
          onStart?.();
          try {
            await gitCommitAll(msg, repoPath);
            await onResult?.({ ok: true, output: `Committed with message:\n${msg}` });
          } catch (error: any) {
            const message = formatGitCommitError(error);
            await onResult?.({ ok: false, output: message });
          }
        }}
        focus
      />
      <Text dimColor>Enter to commit · Esc to cancel. (Stage-all + commit)</Text>
    </>
  );
}

function formatGitCommitError(error: any): string {
  const message = (error?.stderr || error?.stdout || error?.shortMessage || error?.message || String(error) || "").trim();
  return message || "(no output)";
}

function HelpUI() {
  return (
    <>
      <Text>Keys:</Text>
      <Text>{KEY_HINTS}</Text>
    </>
  );
}

function TaskViewer({ title, output }: { title: string; output: string }) {
  return (
    <>
      <Text bold>{title}</Text>
      <Text>{output || "(no output)"} </Text>
    </>
  );
}

type TemplatePromptUIProps = {
  state: TemplatePromptState;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

function TemplatePromptUI({ state, value, onChange, onSubmit, onCancel }: TemplatePromptUIProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });
  return (
    <>
      <Text>{`Template ${state.templateName}`}</Text>
      <Text>{state.message}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        focus
      />
      {state.defaultValue && <Text dimColor>{`Default: ${state.defaultValue}`}</Text>}
      <Text dimColor>Enter to continue · Esc to cancel.</Text>
    </>
  );
}

function AiUI({ prompt, setPrompt, onSubmit, onCancel }: { prompt: string; setPrompt: (s:string)=>void; onSubmit: (p:string)=>void; onCancel: () => void }) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });
  return (
    <>
      <Text>Describe your requirement or change:</Text>
      <TextInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={() => onSubmit(prompt)}
        placeholder="e.g., Add audit trail to user actions"
        focus
      />
      <Text dimColor>Enter to run AI (only if AI is enabled in config) · Esc to cancel.</Text>
    </>
  );
}

type SettingsUIProps = {
  fields: SettingsFieldWithValue[];
  cursor: number;
  editing: boolean;
  editValue: string;
  editField: SettingsFieldWithValue|null;
  onChangeEditValue: (value: string) => void;
  onSubmitEdit: (value: string) => void;
  onCancelEdit: () => void;
};

function renderSettingRow(field: SettingsFieldWithValue): string {
  if (field.type === "action") {
    if (field.id === "action.save") return "Save changes";
    if (field.id === "action.cancel") return "Discard changes";
    return field.label;
  }
  return `${field.label}: ${formatSettingValue(field)}`;
}

function SettingsUI({ fields, cursor, editing, editValue, editField, onChangeEditValue, onSubmitEdit, onCancelEdit }: SettingsUIProps) {
  const active = fields[cursor];
  useInput((input, key) => {
    if (key.escape) {
      onCancelEdit();
    }
  }, { isActive: editing });
  return (
    <>
      <Text>Settings — ↑/↓ move · Space toggle · ←/→ cycle · Enter edit/save · q cancel</Text>
      {fields.length === 0 && <Text dimColor>(config not loaded)</Text>}
      {fields.map((field, i) => (
        <Text
          key={field.id}
          color={i === cursor ? "black" : undefined}
          backgroundColor={i === cursor ? "cyan" : undefined}
        >
          {renderSettingRow(field)}
        </Text>
      ))}
      {active?.help && <Text dimColor>{active.help}</Text>}
      {editing && editField && (
        <>
          <Text>{editField.label}:</Text>
          <TextInput
            value={editValue}
            onChange={onChangeEditValue}
            onSubmit={onSubmitEdit}
            placeholder={editField.placeholder}
            focus={editing}
          />
          <Text dimColor>Enter to apply · Esc to cancel</Text>
        </>
      )}
    </>
  );
}

function TemplatePicker({ templates, index, targetDir, setTargetDir, onConfirm, onCancel, repoPath }: { templates: TemplateEntry[]; index: number; targetDir: string; setTargetDir: (s:string)=>void; onConfirm: () => Promise<void>; onCancel: () => void; repoPath: string }) {
  const active = templates[index];
  const requiresTarget = active?.type === "github";
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });
  const sourceLabel = active?.type === "local" && active.localPath
    ? (() => {
        const rel = path.relative(repoPath, active.localPath);
        return rel && !rel.startsWith("..") ? rel : active.localPath;
      })()
    : null;
  return (
    <>
      <Text>Select a template (Enter to confirm):</Text>
      {templates.map((t,i) => {
        const isActive = i === index;
        const typeLabel = t.type === "local" ? "local" : t.type;
        return (
          <React.Fragment key={t.name}>
            <Text color={isActive ? "black":undefined} backgroundColor={isActive ? "cyan":undefined}>
              {`${t.name} [${typeLabel}]`}
            </Text>
            {isActive && t.description && <Text dimColor>{t.description}</Text>}
            {isActive && t.type === "local" && t.localPath && (
              <Text dimColor>{`Source: ${sourceLabel}`}</Text>
            )}
          </React.Fragment>
        );
      })}
      {requiresTarget && (
        <>
          <Text>Target directory for clone:</Text>
          <TextInput
            value={targetDir}
            onChange={setTargetDir}
            onSubmit={() => { void onConfirm(); }}
            placeholder="./my-project"
            focus={requiresTarget}
          />
          <Text dimColor>Enter to clone & switch repo · Esc to cancel.</Text>
        </>
      )}
      {active?.type === "blank" && <Text dimColor>Press Enter to create a blank spec in current repo.</Text>}
      {active?.type === "local" && <Text dimColor>Press Enter to copy files into the current repo.</Text>}
    </>
  );
}

function formatPostInitCommand(event: PostInitCommandEvent): string {
  const status = event.result.ok ? "✓" : "✗";
  const header = `$ ${event.command} ${status}`;
  const stdout = (event.result.stdout || "").trim();
  const stderr = (event.result.stderr || "").trim();
  const lines: string[] = [];
  if (stdout) lines.push(stdout);
  if (stderr) lines.push(stderr);
  if (!lines.length && event.result.error) {
    const message = formatTemplateError(event.result.error);
    if (message) {
      lines.push(message);
    }
  }
  if (!lines.length) {
    lines.push("(no output)");
  }
  return [header, ...lines].join("\n");
}

function formatTemplateTarget(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative && !relative.startsWith("..")) {
    return relative;
  }
  return resolved;
}

function formatTemplateError(error: any): string {
  const parts = [error?.stderr, error?.stdout, error?.shortMessage, error?.message]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => value.trim());
  if (parts.length) {
    return parts.join("\n");
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  const fallback = String(error ?? "Template operation failed.").trim();
  return fallback || "Template operation failed.";
}

function buildSettingsFields(cfg: SpeckitConfig): SettingsFieldWithValue[] {
  const openaiModels = cfg.openai?.models || [];
  const githubModels = cfg.github?.models || [];
  return [
    {
      id: "ai.enabled",
      label: "AI enabled",
      type: "boolean",
      value: !!cfg.ai?.enabled,
      help: "Toggle access to the AI agent (A key)."
    },
    {
      id: "analytics.enabled",
      label: "Analytics enabled",
      type: "boolean",
      value: !!cfg.analytics?.enabled,
      help: "Telemetry remains off unless explicitly enabled."
    },
    {
      id: "provider",
      label: "AI provider",
      type: "select",
      options: ["openai", "github"],
      value: cfg.provider || "openai",
      help: "Provider used for patch generation."
    },
    {
      id: "openai.apiKey",
      label: "OpenAI API key",
      type: "text",
      mask: true,
      placeholder: "sk-...",
      value: cfg.openai?.apiKey || "",
      help: "Stored locally in ~/.config/spec-studio/config.json."
    },
    {
      id: "openai.model",
      label: "OpenAI default model",
      type: "text",
      options: openaiModels.length ? openaiModels : undefined,
      value: cfg.openai?.model || "",
      help: openaiModels.length ? "Press ←/→ to cycle preset models or Enter to edit." : "Enter to edit model name."
    },
    {
      id: "openai.models",
      label: "OpenAI models list",
      type: "list",
      value: openaiModels,
      help: "Comma or newline separated list of OpenAI models to pick from."
    },
    {
      id: "github.pat",
      label: "GitHub token (Models)",
      type: "text",
      mask: true,
      placeholder: "ghp_...",
      value: cfg.github?.pat || "",
      help: "GitHub Models/Azure token (never uploaded)."
    },
    {
      id: "github.endpoint",
      label: "GitHub models endpoint",
      type: "text",
      placeholder: "https://models.inference.ai.azure.com",
      value: cfg.github?.endpoint || "",
      help: "Override if using a private inference endpoint."
    },
    {
      id: "github.model",
      label: "GitHub default model",
      type: "text",
      options: githubModels.length ? githubModels : undefined,
      value: cfg.github?.model || "",
      help: githubModels.length ? "Press ←/→ to cycle preset models or Enter to edit." : "Enter to edit model name."
    },
    {
      id: "github.models",
      label: "GitHub models list",
      type: "list",
      value: githubModels,
      help: "Comma or newline separated list of GitHub-hosted models."
    },
    {
      id: "repo.mode",
      label: "Repository mode",
      type: "select",
      options: ["local", "github"],
      value: cfg.repo?.mode || "local",
      help: "Local uses the current checkout; GitHub targets a remote repo."
    },
    {
      id: "repo.localPath",
      label: "Local repo path",
      type: "text",
      value: cfg.repo?.localPath || "",
      placeholder: process.cwd(),
      help: "Absolute or relative path used when repo.mode=local."
    },
    {
      id: "repo.githubRepo",
      label: "GitHub repo (owner/name)",
      type: "text",
      value: cfg.repo?.githubRepo || "",
      placeholder: "org/project",
      help: "Repository name when repo.mode=github."
    },
    {
      id: "repo.branch",
      label: "Repo branch",
      type: "text",
      value: cfg.repo?.branch || "main",
      help: "Default branch for git operations."
    },
    {
      id: "repo.specRoot",
      label: "Spec root",
      type: "text",
      value: cfg.repo?.specRoot || "docs/specs",
      help: "Relative directory containing specs."
    },
    {
      id: "workspaces.root",
      label: "Workspaces root",
      type: "text",
      value: cfg.workspaces?.root || "",
      help: "Scratch directory for generated workspaces."
    },
    {
      id: "action.save",
      label: "Save changes",
      type: "action",
      value: undefined,
      help: "Write settings to config.json and refresh."
    },
    {
      id: "action.cancel",
      label: "Discard changes",
      type: "action",
      value: undefined,
      help: "Exit settings without saving."
    }
  ];
}

function formatSettingValue(field: SettingsFieldWithValue): string {
  if (field.type === "boolean") {
    return field.value ? "ON" : "OFF";
  }
  if (field.type === "list") {
    const list = Array.isArray(field.value) ? field.value : [];
    if (list.length === 0) return "(empty)";
    return truncate(list.join(", "), 60);
  }
  if (field.mask) {
    return maskSecret(field.value);
  }
  if (field.value == null || field.value === "") {
    return "(empty)";
  }
  return String(field.value);
}

function maskSecret(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (!text) return "(not set)";
  const masked = "•".repeat(Math.min(text.length, 8));
  return masked + (text.length > 8 ? "…" : "");
}

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function cycleOption(options: string[], current: unknown, direction: number): string {
  if (options.length === 0) return "";
  const currentValue = typeof current === "string" ? current : "";
  const index = options.indexOf(currentValue);
  const nextIndex = index === -1
    ? (direction > 0 ? 0 : options.length - 1)
    : (index + direction + options.length) % options.length;
  return options[nextIndex];
}

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function setValueAtPath(obj: any, path: string, value: any) {
  const segments = path.split(".");
  let target = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (!target[key] || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key];
  }
  const last = segments[segments.length - 1];
  if (value === undefined) {
    delete target[last];
  } else {
    target[last] = value;
  }
}

function formatSettingsSummary(cfg: SpeckitConfig): string {
  const lines = [
    `AI enabled: ${cfg.ai?.enabled ? "true" : "false"}`,
    `Analytics enabled: ${cfg.analytics?.enabled ? "true" : "false"}`,
    `Provider: ${cfg.provider || "openai"}`,
    `OpenAI model: ${cfg.openai?.model || "-"}`,
    `GitHub model: ${cfg.github?.model || "-"}`,
    `OpenAI key: ${cfg.openai?.apiKey ? "set" : "not set"}`,
    `GitHub token: ${cfg.github?.pat ? "set" : "not set"}`,
    `Repo mode: ${cfg.repo?.mode || "local"}`,
    `GitHub repo: ${cfg.repo?.githubRepo || "-"}`,
    `Branch: ${cfg.repo?.branch || "main"}`,
    `Spec root: ${cfg.repo?.specRoot || "docs/specs"}`,
    `Workspaces root: ${cfg.workspaces?.root || "(default)"}`
  ];
  return lines.join("\n");
}

type ResolveRepoRootParams = {
  config: SpeckitConfig;
  overridePath?: string;
  currentRepoPath?: string;
  initialRepoPath?: string;
};

async function resolveRepoRoot(params: ResolveRepoRootParams): Promise<string> {
  const { config, overridePath, currentRepoPath, initialRepoPath } = params;

  if (overridePath) {
    return path.resolve(overridePath);
  }

  const repoMode = config.repo?.mode || "local";

  if (repoMode === "github") {
    return await prepareGithubWorkspace(config);
  }

  let configRepoPath: string | undefined;
  if (repoMode === "local" && typeof config.repo?.localPath === "string") {
    const trimmedLocalPath = config.repo.localPath.trim();
    if (trimmedLocalPath) {
      const resolvedLocalPath = path.resolve(trimmedLocalPath);
      const initialResolved = initialRepoPath;
      if (!initialResolved || resolvedLocalPath !== initialResolved) {
        configRepoPath = resolvedLocalPath;
      }
    }
  }

  if (currentRepoPath && currentRepoPath !== initialRepoPath) {
    return currentRepoPath;
  }
  if (configRepoPath) {
    return configRepoPath;
  }
  if (currentRepoPath) {
    return currentRepoPath;
  }

  const gitRootPath = await gitRoot();
  if (gitRootPath) {
    return path.resolve(gitRootPath);
  }

  return initialRepoPath || path.resolve(process.cwd());
}

async function prepareGithubWorkspace(config: SpeckitConfig): Promise<string> {
  const repoConfig = config.repo;
  if (!repoConfig) {
    throw new Error("GitHub mode requires repo settings.");
  }

  const rawRepo = typeof repoConfig.githubRepo === "string" ? repoConfig.githubRepo.trim() : "";
  if (!rawRepo) {
    throw new Error("Set repo.githubRepo (owner/name) when repo.mode=github.");
  }

  const normalizedRepo = rawRepo.replace(/\.git$/i, "");
  const segments = normalizedRepo.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new Error("GitHub repo must be in 'owner/name' format.");
  }

  const [owner, repoName] = segments;
  const repoSlug = `${owner}/${repoName}`;
  const branch = (typeof repoConfig.branch === "string" && repoConfig.branch.trim())
    ? repoConfig.branch.trim()
    : "main";

  const workspaceRootInput = config.workspaces?.root;
  const workspaceRoot = workspaceRootInput
    ? path.resolve(workspaceRootInput)
    : path.resolve(process.cwd(), ".speckit/workspaces");
  await fs.ensureDir(workspaceRoot);

  const ownerSegment = sanitizeWorkspaceSegment(owner);
  const repoSegment = sanitizeWorkspaceSegment(repoName);
  const branchSegment = sanitizeWorkspaceSegment(branch);
  const workspaceDir = path.join(workspaceRoot, "github", ownerSegment, repoSegment, branchSegment);

  const token = config.github?.pat?.trim() || undefined;

  try {
    await gitEnsureGithubRepo({ repo: repoSlug, branch, dir: workspaceDir, token });
  } catch (error: any) {
    const message = formatRefreshError(error);
    const hint = token ? "" : " (set github.pat in settings if the repo is private)";
    throw new Error(`Failed to prepare GitHub workspace ${repoSlug}@${branch}: ${message}${hint}`);
  }

  return path.resolve(workspaceDir);
}

function sanitizeWorkspaceSegment(value: string): string {
  const trimmed = value.trim();
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized || "default";
}

function formatRefreshError(error: any): string {
  return error?.message ? String(error.message) : String(error);
}
