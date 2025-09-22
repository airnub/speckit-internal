import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import globby from "globby";
import matter from "gray-matter";
import fs from "fs-extra";
import path from "node:path";
import TextInput from "ink-text-input";
import { getDefaultTemplates, TemplateEntry, SpeckitConfig } from "@speckit/core";
import { loadConfig } from "../config.js";
import { gitRoot, gitBranch, gitStatus, gitDiff, openInEditor, gitCommitAll, gitFetch, gitPull, gitPush, runCmd } from "../git.js";
import { execa } from "execa";
import { generatePatch, AgentConfig } from "@speckit/agent";

type FileInfo = { path: string; title?: string };
type Mode = "preview"|"diff"|"commit"|"help"|"new-template"|"tasks"|"ai";

export default function App() {
  const [cfg, setCfg] = useState<SpeckitConfig|null>(null);
  const [repoPath, setRepoPath] = useState<string>(process.cwd());
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
  const templates = getDefaultTemplates().filter(t => ["blank","next-supabase","speckit-template"].includes(t.name));
  const [targetDir, setTargetDir] = useState<string>("");

  // tasks/ai
  const [taskTitle, setTaskTitle] = useState<string>("");
  const [taskOutput, setTaskOutput] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>("");

  async function refreshRepo(rootOverride?: string) {
    const r = rootOverride || await gitRoot() || process.cwd();
    const conf = await loadConfig();
    setCfg(conf);
    setRepoPath(r);
    setBranch(await gitBranch(r));
    setStatus(await gitStatus(r));
    setSpecRoot(conf.repo?.specRoot || "docs/specs");
    const pattern = [path.join(r, conf.repo?.specRoot || "docs/specs", "**/*.md"), "!" + path.join(r, "docs/specs/templates/**")];
    const paths = (await globby(pattern)).sort();
    const infos: FileInfo[] = [];
    for (const file of paths) {
      const raw = await fs.readFile(file, "utf8");
      const fm = matter(raw).data as any;
      infos.push({ path: file, title: fm?.title });
    }
    setFiles(infos);
    if (infos[0]) setContent(await fs.readFile(infos[0].path, "utf8"));
    setIdx(0);
  }

  useEffect(() => { refreshRepo(); }, []);
  useEffect(() => { (async () => {
    if (files[idx]) setContent(await fs.readFile(files[idx].path, "utf8"));
  })(); }, [idx, files.length]);

  useInput(async (input, key) => {
    if (key.upArrow) {
      if (mode === "new-template") setTplIndex(i => Math.max(0, i-1));
      else setIdx(i => Math.max(0, i-1));
    }
    if (key.downArrow) {
      if (mode === "new-template") setTplIndex(i => Math.min(templates.length-1, i+1));
      else setIdx(i => Math.min(files.length-1, i+1));
    }
    if (input === "q") process.exit(0);
    if (input === "?") setMode("help");
    if (input === "p") setMode("preview");
    if (input === "d") setMode("diff");
    if (input === "c") setMode("commit");
    if (input === "g") setStatus(await gitStatus(repoPath));
    if (input === "e" && files[idx]) { await openInEditor(files[idx].path); await refreshRepo(); }
    if (input === "n") { setMode("new-template"); }
    if (input === "f") { await gitFetch(repoPath); setStatus(await gitStatus(repoPath)); }
    if (input === "l") { await gitPull(repoPath); setStatus(await gitStatus(repoPath)); }
    if (input === "u") { await gitPush(repoPath); setStatus(await gitStatus(repoPath)); }
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
    if (input === "\r" && mode === "new-template") {
      const sel = templates[tplIndex];
      if (sel.name === "blank") {
        await createBlankSpec(repoPath, specRoot);
        setMode("preview");
        await refreshRepo();
      } else {
        if (!targetDir) return;
        await cloneTemplate(sel, targetDir);
        await refreshRepo(targetDir);
        setMode("preview");
      }
    }
  });

  async function runSpectral(cwd: string) {
    setTaskTitle("Spectral Lint (docs/srs.yaml)");
    setMode("tasks");
    let out = await runCmd(cwd, "npx", ["-y","spectral","lint","docs/srs.yaml"]);
    setTaskOutput(out || "(no output)");
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
      for (const [bin, *args] of cmds) {
        out += `\n$ ${bin} ${' '.join(args)}\n`;
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

  const current = files[idx];

  return (
    <Box flexDirection="column">
      <Box>
        <Text inverse> SpecKit v0.0.1 </Text>
        <Text>  </Text>
        <Text>Repo: </Text><Text bold>{repoPath}</Text><Text>  </Text><Text dimColor>{branch}</Text><Text>  </Text><Text>Spec Root: {specRoot}</Text>
        <Text>  </Text><Text>AI: {cfg?.ai?.enabled ? "ON" : "OFF"}</Text>
      </Box>
      <Box borderStyle="round" height={process.stdout.rows - 8}>
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
          {mode === "commit" && <CommitUI msg={commitMsg} setMsg={setCommitMsg} repoPath={repoPath} onDone={async () => { setCommitMsg("chore(specs): update"); setMode("preview"); setStatus(await gitStatus(repoPath)); }} />}
          {mode === "help" && <HelpUI/>}
          {mode === "new-template" && <TemplatePicker templates={templates} index={tplIndex} targetDir={targetDir} setTargetDir={setTargetDir}/>}
          {mode === "tasks" && <TaskViewer title={taskTitle} output={taskOutput}/>}
          {mode === "ai" && <AiUI prompt={aiPrompt} setPrompt={setAiPrompt} onSubmit={runAi} />}
        </Box>
      </Box>
      <Box>
        <Text dimColor>{status}</Text>
      </Box>
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

function CommitUI({ msg, setMsg, repoPath, onDone }: any) {
  return (
    <>
      <Text>Commit message:</Text>
      <TextInput value={msg} onChange={setMsg} onSubmit={async () => { await gitCommitAll(msg, repoPath); await onDone(); }} />
      <Text dimColor>Enter to commit. (Stage-all + commit)</Text>
    </>
  );
}

function HelpUI() {
  return (
    <>
      <Text>Keys:</Text>
      <Text>↑/↓ select · E edit · N new (template) · P preview · D diff · C commit · L pull · F fetch · U push · K Spectral lint · B Build docs/RTM · A AI Propose (if enabled) · G status · ? help · Q quit</Text>
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

function AiUI({ prompt, setPrompt, onSubmit }: { prompt: string; setPrompt: (s:string)=>void; onSubmit: (p:string)=>void }) {
  return (
    <>
      <Text>Describe your requirement or change:</Text>
      <TextInput value={prompt} onChange={setPrompt} onSubmit={() => onSubmit(prompt)} placeholder="e.g., Add audit trail to user actions" />
      <Text dimColor>Enter to run AI (only if AI is enabled in config).</Text>
    </>
  );
}

function TemplatePicker({ templates, index, targetDir, setTargetDir }: { templates: TemplateEntry[]; index: number; targetDir: string; setTargetDir: (s:string)=>void }) {
  return (
    <>
      <Text>Select a template (Enter to confirm):</Text>
      {templates.map((t,i) => (
        <Text key={t.name} color={i===index ? "black":undefined} backgroundColor={i===index ? "cyan":undefined}>
          {t.name === "next-supabase" ? "Next + Supabase (official)" :
           t.name === "speckit-template" ? "Generic SpecKit template" : t.name}
        </Text>
      ))}
      {["next-supabase","speckit-template"].includes(templates[index]?.name) && (
        <>
          <Text>Target directory for clone:</Text>
          <TextInput value={targetDir} onChange={setTargetDir} placeholder="./my-project" />
          <Text dimColor>Press Enter to clone & switch repo.</Text>
        </>
      )}
      {templates[index]?.name === "blank" && <Text dimColor>Press Enter to create a blank spec in current repo.</Text>}
    </>
  );
}

async function createBlankSpec(repoPath: string, specRoot: string) {
  const dir = path.join(repoPath, specRoot, "templates");
  const base = path.join(dir, "base.md");
  await fs.ensureDir(path.dirname(base));
  if (!(await fs.pathExists(base))) {
    await fs.writeFile(base, `---\ntitle: \"New Spec\"\nversion: \"0.1.0\"\nstatus: \"draft\"\nowners: []\ncreated: \"${new Date().toISOString()}\"\nupdated: \"${new Date().toISOString()}\"\n---\n\n# Summary\n`);
  }
  const destDir = path.join(repoPath, specRoot);
  await fs.ensureDir(destDir);
  const name = `spec_${Date.now()}.md`;
  const dest = path.join(destDir, name);
  await fs.copyFile(base, dest);
}

async function cloneTemplate(tpl: TemplateEntry, targetDir: string) {
  if (tpl.type !== "github" || !tpl.repo) return;
  await fs.ensureDir(path.dirname(targetDir));
  await execa("git", ["clone", "--depth", "1", "--branch", tpl.branch || "main", `https://github.com/${tpl.repo}.git`, targetDir], { stdio: "inherit" });
}
