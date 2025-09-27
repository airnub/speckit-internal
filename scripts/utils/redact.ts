import {
  defaultSanitizerPatterns,
  defaultSanitizerPatternSources,
  sanitizeText,
} from "@speckit/core/sanitizer";

const SECRET_PATTERNS = defaultSanitizerPatterns().map(({ pattern, flags }) => new RegExp(pattern, flags));

export function redactSecrets(text: string): { redacted: string; hits: number } {
  const { redacted, hits } = sanitizeText(text);
  return { redacted, hits };
}

export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export const sanitizerPatterns = defaultSanitizerPatternSources();
