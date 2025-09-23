import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import fs from "fs-extra";
import type { TemplateEntry } from "@speckit/core";
import {
  useTemplateIntoDir,
  __setTemplatePromptInput,
  __resetTemplatePromptInput
} from "../src/services/template.js";

test("prompts when fallback template.vars.json exists", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-template-"));
  const templateDir = path.join(tmpRoot, "template");
  const targetDir = path.join(tmpRoot, "output");

  await fs.ensureDir(templateDir);
  await fs.writeJson(path.join(templateDir, "template.vars.json"), {
    PROJECT_NAME: { prompt: "Project name", default: "Acme" }
  });
  await fs.writeFile(path.join(templateDir, "README.md"), "# {{PROJECT_NAME}}\n", "utf8");

  const tpl: TemplateEntry = {
    name: "local",
    description: "",
    type: "local",
    localPath: templateDir
  };

  const prompts: string[] = [];
  __setTemplatePromptInput(async ({ message }) => {
    prompts.push(message);
    return "MyApp";
  });

  try {
    await useTemplateIntoDir(tpl, targetDir, {
      mergeIntoCwd: false,
      promptVars: true,
      runPostInit: false
    });

    const readme = await fs.readFile(path.join(targetDir, "README.md"), "utf8");
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0], "Project name");
    assert.equal(readme.trim(), "# MyApp");
  } finally {
    __resetTemplatePromptInput();
    await fs.remove(tmpRoot);
  }
});

test("uses manifest-defined varsFile overrides", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-template-"));
  const templateDir = path.join(tmpRoot, "template");
  const targetDir = path.join(tmpRoot, "output");
  const configDir = path.join(templateDir, "config");

  await fs.ensureDir(configDir);
  await fs.writeJson(path.join(configDir, "vars.json"), {
    SERVICE_NAME: { prompt: "Service name" }
  });
  await fs.writeJson(path.join(templateDir, "template.json"), {
    varsFile: "config/vars.json"
  });
  await fs.writeFile(path.join(templateDir, "SERVICE.md"), "Service: {{SERVICE_NAME}}\n", "utf8");

  const tpl: TemplateEntry = {
    name: "local-manifest",
    description: "",
    type: "local",
    localPath: templateDir
  };

  const prompts: string[] = [];
  __setTemplatePromptInput(async ({ message }) => {
    prompts.push(message);
    return "Payments";
  });

  try {
    await useTemplateIntoDir(tpl, targetDir, {
      mergeIntoCwd: false,
      promptVars: true,
      runPostInit: false
    });

    const serviceDoc = await fs.readFile(path.join(targetDir, "SERVICE.md"), "utf8");
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0], "Service name");
    assert.equal(serviceDoc.trim(), "Service: Payments");
  } finally {
    __resetTemplatePromptInput();
    await fs.remove(tmpRoot);
  }
});
