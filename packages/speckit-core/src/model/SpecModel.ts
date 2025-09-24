export interface Reference {
  kind: "url" | "owasp" | "rfc" | "doc" | "hipaa" | "nist-800-53";
  value: string;
}

export type Level = "L1" | "L2" | "L3" | undefined;

export interface Requirement {
  id: string;
  title: string;
  description?: string;
  acceptance?: string[];
  tags?: string[];
  refs?: Reference[];
  dependsOn?: string[];
  level?: Level;
}

export interface SpecModel {
  version: string;
  meta?: Record<string, unknown>;
  requirements: Requirement[];
}
