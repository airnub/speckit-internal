import { describe, expect, it } from "vitest";

import type { RequirementRecord } from "../src/types.js";
import { generateRequirementCheck } from "../src/requirements.js";

describe("generateRequirementCheck", () => {
  it("returns reproducible commands for satisfied requirements", () => {
    const requirement: RequirementRecord = {
      id: "REQ-001",
      text: "Run `pnpm test --filter unit` to cover the new parser branch.",
      status: "satisfied",
      evidence: ["event-42"],
    };

    expect(generateRequirementCheck(requirement)).toBe(
      "Regression guard: run `pnpm test --filter unit` to reconfirm. Evidence: event-42."
    );
  });

  it("suggests next verification steps for pending work", () => {
    const requirement: RequirementRecord = {
      id: "REQ-002",
      text: "Ensure lint passes before shipping the patch.",
      status: "violated",
      evidence: [],
    };

    expect(generateRequirementCheck(requirement)).toBe(
      "Remediate failure and re-run `pnpm lint`. No run evidence captured yet."
    );
  });

  it("falls back to actionable greps when no command is present", () => {
    const requirement: RequirementRecord = {
      id: "REQ-003",
      text: "Document the behavior change in README.md and changelog.",
      status: "unknown",
      evidence: [],
    };

    expect(generateRequirementCheck(requirement)).toBe(
      "Plan check: run `git diff --stat README.md` to establish coverage. No run evidence captured yet."
    );
  });
});
