import React, { useState } from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { listFrameworks } from "@speckit/framework-registry";
import { resolvePreset } from "@speckit/presets";
import { TemplatePicker } from "./App.js";

async function waitUntil(predicate: () => boolean, timeout = 2000, interval = 25) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error("Timed out waiting for condition");
}

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

    const actions: {
      setPreset?: (value: "classic" | "secure") => void;
      toggleFramework?: (id: string) => void;
    } = {};

    function Wrapper() {
      const [preset, setPreset] = useState<"classic" | "secure">("classic");
      const [selected, setSelected] = useState<string[]>(() => resolvePreset("classic"));
      const toggleFramework = React.useCallback((id: string) => {
        setSelected(prev => (prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id]));
      }, []);

      actions.setPreset = setPreset;
      actions.toggleFramework = toggleFramework;
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
          onToggleFramework={toggleFramework}
          preset={preset}
          onPresetChange={setPreset}
          experimentalGateOn={true}
          setStatusMessage={() => {}}
        />
      );
    }

    const app = render(<Wrapper />);
    try {
      await waitUntil(() => app.lastFrame()?.includes("Preset: Classic") ?? false);
      const setPreset = actions.setPreset;
      if (!setPreset) {
        throw new Error("Preset setter not registered");
      }
      setPreset("secure");
      await waitUntil(() => app.lastFrame()?.includes("Preset: Secure") ?? false);
      expect(app.lastFrame()).toContain("Preset: Secure");
      expect(app.lastFrame()).toMatch(/ISO\/IEC 27001/);
      const hipaa = frameworks.find(meta => /HIPAA/.test(meta.title));
      if (!hipaa) {
        throw new Error("HIPAA framework metadata missing");
      }
      const toggleFramework = actions.toggleFramework;
      if (!toggleFramework) {
        throw new Error("Framework toggle handler not registered");
      }
      toggleFramework(hipaa.id);
      await waitUntil(() => /\[x\] HIPAA/.test(app.lastFrame() ?? ""));
    } finally {
      app.unmount();
    }
  });
});
