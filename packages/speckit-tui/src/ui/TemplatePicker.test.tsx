import React, { useState } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { listFrameworks } from "@speckit/framework-registry";
import { resolvePreset } from "@speckit/presets";
import { TemplatePicker } from "./App.js";

describe("TemplatePicker presets", () => {
  it("applies secure preset and allows toggling frameworks", async () => {
    const frameworks = listFrameworks();
    const templates = [
      {
        name: "blank",
        type: "local",
        localPath: "/tmp/blank",
      } as any,
    ];

    function Wrapper() {
      const [preset, setPreset] = useState<"classic" | "secure">("classic");
      const [selected, setSelected] = useState<string[]>(() => resolvePreset("classic"));
      return (
        <TemplatePicker
          templates={templates}
          index={0}
          targetDir=""
          setTargetDir={() => {}}
          onConfirm={async () => {}}
          onCancel={() => {}}
          repoPath="/tmp"
          frameworks={frameworks}
          selectedFrameworks={selected}
          onToggleFramework={id =>
            setSelected(prev => (prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id]))
          }
          preset={preset}
          onPresetChange={setPreset}
          experimentalGateOn={true}
          setStatusMessage={() => {}}
        />
      );
    }

    const app = render(<Wrapper />);
    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      app.stdin.write("s");
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(app.lastFrame()).toContain("Preset: Secure");
      expect(app.lastFrame()).toMatch(/ISO\/IEC 27001/);
      app.stdin.write("1");
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(app.lastFrame()).toMatch(/\[x\] HIPAA/);
    } finally {
      app.unmount();
    }
  });
});
