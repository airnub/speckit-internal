import { resolvePreset } from "@speckit/presets";

export { DEFAULT_GENERATION_MODE, parseGenerationMode } from "./generationMode.js";

export function frameworksFromMode(mode: "classic" | "secure"): string[] {
  return resolvePreset(mode);
}
