import assert from "node:assert/strict";
import { test } from "node:test";
import { DoctorCommand } from "../src/commands/doctor.js";

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
  };
}

test("doctor --json reports experimental flags and frameworks", async () => {
  const io = createIo();
  const prev = process.env.SPECKIT_EXPERIMENTAL;
  process.env.SPECKIT_EXPERIMENTAL = "0";
  try {
    const command = new DoctorCommand();
    command.context = io.context as any;
    command.json = true;
    const exitCode = await command.execute();
    // Doctor may warn about catalog policies; accept non-zero exit but require JSON payload.
    assert.ok(exitCode === 0 || exitCode === 1);
    const report = JSON.parse(io.getStdout());
    assert.equal(report.default_mode, "classic");
    assert.equal(typeof report.experimental?.enabled, "boolean");
    assert.ok(Array.isArray(report.frameworks));
    assert.ok(
      report.frameworks.some((entry: any) => entry.status === "experimental" && entry.allowed === false)
    );
  } finally {
    if (prev === undefined) {
      delete process.env.SPECKIT_EXPERIMENTAL;
    } else {
      process.env.SPECKIT_EXPERIMENTAL = prev;
    }
  }
});
