export type PresetId = "classic" | "secure";

export const PRESETS: Record<PresetId, { title: string; frameworks: string[] }> = {
  classic: { title: "Classic (no frameworks)", frameworks: [] },
  secure: { title: "Secure (curated)", frameworks: ["iso27001", "soc2", "gdpr"] },
};

export function resolvePreset(preset: PresetId): string[] {
  return PRESETS[preset]?.frameworks ?? [];
}
