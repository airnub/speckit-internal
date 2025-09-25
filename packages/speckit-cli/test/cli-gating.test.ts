import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameworksListCommand } from "../src/commands/frameworks.js";
import { CompliancePlanCommand } from "../src/commands/compliance.js";

function createIo() {
  let stdout = "";
  let stderr = "";
  return {
    context: {
      stdout: {
        write(chunk: string) {
          stdout += chunk;
          return true;
        },
      },
      stderr: {
        write(chunk: string) {
          stderr += chunk;
          return true;
        },
      },
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
    reset() {
      stdout = "";
      stderr = "";
    },
  };
}

test("frameworks list highlights experimental badges when gate is off", async () => {
  const io = createIo();
  const prev = process.env.SPECKIT_EXPERIMENTAL;
  process.env.SPECKIT_EXPERIMENTAL = "0";
  try {
    const command = new FrameworksListCommand();
    command.context = io.context as any;
    const exitCode = await command.execute();
    assert.equal(exitCode, 0);
    const output = io.getStdout();
    assert.match(output, /\[Experimental]/);
    assert.match(output, /locked — enable with --experimental/);
  } finally {
    if (prev === undefined) {
      delete process.env.SPECKIT_EXPERIMENTAL;
    } else {
      process.env.SPECKIT_EXPERIMENTAL = prev;
    }
  }
});

test("compliance plan blocks secure mode when experimental is disabled", async () => {
  const io = createIo();
  const prev = process.env.SPECKIT_EXPERIMENTAL;
  process.env.SPECKIT_EXPERIMENTAL = "0";
  try {
    const command = new CompliancePlanCommand();
    command.context = io.context as any;
    command.framework = "hipaa";
    const exitCode = await command.execute();
    assert.equal(exitCode, 1);
    const stderr = io.getStderr();
    assert.match(stderr, /speckit compliance plan failed: Secure mode is experimental/);
  } finally {
    if (prev === undefined) {
      delete process.env.SPECKIT_EXPERIMENTAL;
    } else {
      process.env.SPECKIT_EXPERIMENTAL = prev;
    }
  }
});

