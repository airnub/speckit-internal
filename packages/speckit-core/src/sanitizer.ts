import rawPatterns from "../patterns/sanitizer-patterns.json";

export interface SanitizerPatternDefinition {
  pattern: string;
  flags?: string;
  replacement: string;
}

interface CompiledPattern {
  definition: SanitizerPatternDefinition;
  regex: RegExp;
}

export interface SanitizeTextResult {
  redacted: string;
  hits: number;
  patternHits: Record<string, number>;
}

export interface SanitizeLogsInput {
  id: string;
  content: string;
}

export interface SanitizedLogEntry extends SanitizeLogsInput {
  redacted: string;
  hits: number;
}

export interface SanitizeLogsOptions {
  patterns?: SanitizerPatternDefinition[];
}

export interface SanitizeLogsResult {
  totalHits: number;
  entries: SanitizedLogEntry[];
  patternHits: Record<string, number>;
}

function ensureGlobalFlags(flags: string | undefined): string {
  if (!flags) {
    return "g";
  }
  return flags.includes("g") ? flags : `${flags}g`;
}

function compilePattern(definition: SanitizerPatternDefinition): CompiledPattern {
  const flags = ensureGlobalFlags(definition.flags);
  return {
    definition,
    regex: new RegExp(definition.pattern, flags),
  };
}

const DEFAULT_PATTERN_DEFINITIONS = (rawPatterns as SanitizerPatternDefinition[]).map(pattern => ({
  pattern: pattern.pattern,
  flags: pattern.flags,
  replacement: pattern.replacement,
}));

const DEFAULT_PATTERNS = DEFAULT_PATTERN_DEFINITIONS.map(compilePattern);

function applyPatterns(text: string, patterns: CompiledPattern[]): SanitizeTextResult {
  let redacted = text;
  let totalHits = 0;
  const perPatternHits = new Map<string, number>();

  for (const entry of patterns) {
    const { regex, definition } = entry;
    regex.lastIndex = 0;
    const matches = redacted.match(regex);
    if (!matches || matches.length === 0) {
      continue;
    }
    totalHits += matches.length;
    perPatternHits.set(definition.pattern, (perPatternHits.get(definition.pattern) ?? 0) + matches.length);
    regex.lastIndex = 0;
    redacted = redacted.replace(regex, definition.replacement);
    regex.lastIndex = 0;
  }

  return {
    redacted,
    hits: totalHits,
    patternHits: Object.fromEntries(perPatternHits.entries()),
  };
}

export function sanitizeText(
  text: string,
  options: SanitizeLogsOptions = {}
): SanitizeTextResult {
  const patterns = (options.patterns ?? DEFAULT_PATTERN_DEFINITIONS).map(compilePattern);
  return applyPatterns(text, patterns);
}

export function sanitizeLogs(
  inputs: Iterable<SanitizeLogsInput>,
  options: SanitizeLogsOptions = {}
): SanitizeLogsResult {
  const patternDefinitions = options.patterns ?? DEFAULT_PATTERN_DEFINITIONS;
  const compiled = patternDefinitions.map(compilePattern);
  let totalHits = 0;
  const aggregatedPatternHits = new Map<string, number>();
  const entries: SanitizedLogEntry[] = [];

  for (const input of inputs) {
    const { redacted, hits, patternHits } = applyPatterns(input.content, compiled);
    totalHits += hits;
    for (const [pattern, count] of Object.entries(patternHits)) {
      aggregatedPatternHits.set(pattern, (aggregatedPatternHits.get(pattern) ?? 0) + count);
    }
    entries.push({ id: input.id, content: input.content, redacted, hits });
  }

  return {
    totalHits,
    entries,
    patternHits: Object.fromEntries(aggregatedPatternHits.entries()),
  };
}

export function defaultSanitizerPatterns(): SanitizerPatternDefinition[] {
  return DEFAULT_PATTERN_DEFINITIONS.map(pattern => ({ ...pattern }));
}

export function defaultSanitizerPatternSources(): string[] {
  return DEFAULT_PATTERNS.map(pattern => pattern.regex.source);
}
