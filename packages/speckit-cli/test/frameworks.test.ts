import { describe, expect, it } from "vitest";
import { frameworksFromMode } from "../src/services/mode.js";
import {
  parseFrameworkArgs,
  resolveFrameworkSelection,
} from "../src/services/frameworks.js";
import { PRESETS } from "@speckit/presets";

describe("framework presets", () => {
  it("returns no frameworks for classic", () => {
    expect(frameworksFromMode("classic")).toEqual([]);
  });

  it("returns secure preset frameworks", () => {
    expect(frameworksFromMode("secure")).toEqual(PRESETS.secure.frameworks);
  });
});

describe("framework selection precedence", () => {
  it("prefers explicit frameworks over preset", () => {
    const parsed = parseFrameworkArgs({
      frameworks: ["hipaa"],
      frameworksCsv: ["iso27001,soc2"],
    });
    const selection = resolveFrameworkSelection({
      explicitFrameworks: parsed,
      preset: "secure",
    });
    expect(selection.frameworks).toEqual(["hipaa", "iso27001", "soc2"]);
    expect(selection.source).toBe("explicit");
    expect(selection.preset).toBe("classic");
  });
});
