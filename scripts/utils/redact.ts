const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /(sk-[a-z0-9]{20,})/gi, replacement: "[redacted-token]" },
  { pattern: /(gh[pous]_[a-z0-9]{20,})/gi, replacement: "[redacted-token]" },
  { pattern: /(eyJ[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,})/g, replacement: "[redacted-jwt]" },
  { pattern: /(sessionid=)[^;\s]+/gi, replacement: "$1[redacted]" },
  { pattern: /(cookie:)[^\n]+/gi, replacement: "$1 [redacted-cookie]" },
  { pattern: /(https?:\/\/[^\s]+:[^@\s]+@)/gi, replacement: "[redacted-url]" },
];

export function redactSecrets(text: string): { redacted: string; hits: number } {
  let hits = 0;
  let redacted = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    if (pattern.test(redacted)) {
      hits += (redacted.match(pattern) ?? []).length;
      redacted = redacted.replace(pattern, replacement);
    }
  }
  return { redacted, hits };
}

export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(text));
}

export const sanitizerPatterns = SECRET_PATTERNS.map(({ pattern }) => pattern.source);
