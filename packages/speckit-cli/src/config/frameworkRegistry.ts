import { FeatureFlags, isExperimentalEnabled } from "./featureFlags.js";

export type FrameworkId =
  | "hipaa"
  | "gdpr"
  | "soc2"
  | "iso27001"
  | "edu-us"
  | "edu-eu-ie";

export type FrameworkStatus = "experimental" | "ga";

export interface FrameworkMeta {
  id: FrameworkId;
  title: string;
  status: FrameworkStatus;
  tags: string[];
  bundles: string[];
}

export const FRAMEWORKS: Record<FrameworkId, FrameworkMeta> = {
  hipaa: {
    id: "hipaa",
    title: "HIPAA (US Healthcare)",
    status: "experimental",
    tags: ["secure", "health"],
    bundles: ["compliance/hipaa"],
  },
  gdpr: {
    id: "gdpr",
    title: "GDPR (EU/EEA)",
    status: "experimental",
    tags: ["secure", "privacy"],
    bundles: ["compliance/gdpr-core"],
  },
  soc2: {
    id: "soc2",
    title: "SOC 2 (AICPA)",
    status: "experimental",
    tags: ["secure", "trust"],
    bundles: ["compliance/soc2-tsc"],
  },
  iso27001: {
    id: "iso27001",
    title: "ISO/IEC 27001",
    status: "experimental",
    tags: ["secure", "ism"],
    bundles: ["compliance/iso27001-annex-a"],
  },
  "edu-us": {
    id: "edu-us",
    title: "Education (US: FERPA/COPPA/CIPA/PPRA)",
    status: "experimental",
    tags: ["secure", "education", "us"],
    bundles: ["compliance/edu-us/*"],
  },
  "edu-eu-ie": {
    id: "edu-eu-ie",
    title: "Education (EU/IE: GDPR + IE Fundamentals)",
    status: "experimental",
    tags: ["secure", "education", "eu"],
    bundles: ["compliance/edu-eu/*", "compliance/edu-ie/*"],
  },
};

export function isFrameworkAllowed(id: FrameworkId, flags: FeatureFlags): boolean {
  const meta = FRAMEWORKS[id];
  if (!meta) {
    return false;
  }
  if (meta.status === "ga") {
    return true;
  }
  return isExperimentalEnabled(flags);
}

export function assertFrameworksAllowed(ids: FrameworkId[], flags: FeatureFlags): void {
  const uniqueIds = Array.from(new Set(ids));
  const blocked = uniqueIds.filter(id => !isFrameworkAllowed(id, flags));
  if (blocked.length === 0) {
    return;
  }
  const names = blocked
    .map(id => FRAMEWORKS[id]?.title ?? id)
    .join(", ");
  const hint =
    "Enable experimental with `--experimental` (or via SPECKIT_EXPERIMENTAL/config) to try these frameworks.";
  throw new Error(`Frameworks not available without Experimental: ${names}. ${hint}`);
}
