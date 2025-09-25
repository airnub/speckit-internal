import { resolvePreset } from "@speckit/presets";

export function frameworksFromMode(mode: "classic" | "secure"): string[] {
  return resolvePreset(mode);
}
