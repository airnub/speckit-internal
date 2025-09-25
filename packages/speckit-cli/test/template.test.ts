import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import fs from "fs-extra";
import type { TemplateEntry } from "@speckit/engine";
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

test("onPostInitCommand receives output", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-template-"));
  const templateDir = path.join(tmpRoot, "template");
  const targetDir = path.join(tmpRoot, "output");

  await fs.ensureDir(templateDir);
  await fs.writeFile(path.join(templateDir, "hello.txt"), "hello", "utf8");
  await fs.writeFile(
    path.join(templateDir, "post-init.js"),
    "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
    "utf8"
  );

  const tpl: TemplateEntry = {
    name: "with-post-init",
    description: "",
    type: "local",
    localPath: templateDir,
    postInit: ['node post-init.js --message "hello world"']
  };

  const events: any[] = [];

  try {
    await useTemplateIntoDir(tpl, targetDir, {
      mergeIntoCwd: false,
      promptVars: false,
      runPostInit: true,
      onPostInitCommand: event => {
        events.push(event);
      }
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].command, 'node post-init.js --message "hello world"');
    assert.equal(events[0].bin, "node");
    assert.deepEqual(events[0].args, ["post-init.js", "--message", "hello world"]);
    assert.equal(events[0].result.ok, true);
    assert.equal(events[0].result.stdout, '["--message","hello world"]');
    assert.deepEqual(JSON.parse(events[0].result.stdout), ["--message", "hello world"]);
  } finally {
    await fs.remove(tmpRoot);
  }
});

test("executes quoted postInit command without handler", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "speckit-template-"));
  const templateDir = path.join(tmpRoot, "template");
  const targetDir = path.join(tmpRoot, "output");

  await fs.ensureDir(templateDir);
  await fs.writeFile(
    path.join(templateDir, "post-init.js"),
    [
      "const fs = require(\"fs\");",
      "fs.writeFileSync(\"args.json\", JSON.stringify(process.argv.slice(2)));",
      ""
    ].join("\n"),
    "utf8"
  );

  const tpl: TemplateEntry = {
    name: "quoted-post-init",
    description: "",
    type: "local",
    localPath: templateDir,
    postInit: ['node post-init.js "hello world" second']
  };

  try {
    await useTemplateIntoDir(tpl, targetDir, {
      mergeIntoCwd: false,
      promptVars: false,
      runPostInit: true
    });

    const argsPath = path.join(targetDir, "args.json");
    const args = await fs.readFile(argsPath, "utf8");
    assert.equal(args, '["hello world","second"]');
    assert.deepEqual(JSON.parse(args), ["hello world", "second"]);
  } finally {
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
