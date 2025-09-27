import { describe, expect, it } from "vitest";

import { redactText } from "../src/sanitize";

describe("redactText", () => {
  it("redacts tokens and reports previews", () => {
    const input = "api key sk-abc12345678901234567890";
    const result = redactText(input, {});

    expect(result.totalHits).toBe(1);
    expect(result.redacted).toContain("[redacted-token]");
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].examples[0]?.preview).toContain("[redacted-token]");
  });
});
