const DEFAULT_PREFIXES = ['feature', 'fix', 'docs', 'chore', 'test', 'refactor'];

export function hasPrefix(branchName: string, prefixes = DEFAULT_PREFIXES): boolean {
  return prefixes.some((p) => branchName.startsWith(`${p}/`));
}

export function parsePrefix(branchName: string, prefixes = DEFAULT_PREFIXES): string | null {
  for (const prefix of prefixes) {
    if (branchName.startsWith(`${prefix}/`)) return prefix;
  }
  return null;
}

export function formatBranchName(prefix: string, name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}/${sanitized}`;
}

export function isValidBranchName(name: string): boolean {
  // Git branch name rules (simplified)
  return /^[a-zA-Z0-9._/-]+$/.test(name) && !name.startsWith('/') && !name.endsWith('/');
}

export function looksLikeNaturalLanguage(input: string): boolean {
  // Heuristic: contains spaces and no slash (not already formatted)
  return input.includes(' ') && !input.includes('/');
}
