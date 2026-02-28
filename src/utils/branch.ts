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

/**
 * Git special refs and names that must not be used as branch names.
 */
const RESERVED_GIT_NAMES = new Set([
  'HEAD',
  'FETCH_HEAD',
  'ORIG_HEAD',
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REBASE_HEAD',
  'BISECT_HEAD',
]);

export function isValidBranchName(name: string): boolean {
  // Reject empty names
  if (!name || name.length === 0) return false;

  // Reject git reserved refs
  if (RESERVED_GIT_NAMES.has(name)) return false;

  // Reject names starting with '-' (could be interpreted as git flags)
  if (name.startsWith('-')) return false;

  // Reject '..' (git revision range syntax) and '@{' (reflog syntax)
  if (name.includes('..') || name.includes('@{')) return false;

  // Reject control sequences and whitespace
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching git-invalid control chars
  if (/[\x00-\x1f\x7f ~^:?*[\]\\]/.test(name)) return false;

  // Reject consecutive dots, ending with '.lock', or ending with '.'
  if (name.includes('/.') || name.endsWith('.lock') || name.endsWith('.')) return false;

  // Core character validation: alphanumeric, dots, hyphens, underscores, slashes
  if (!/^[a-zA-Z0-9._/-]+$/.test(name)) return false;

  // Reject leading/trailing slashes and consecutive slashes
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) return false;

  return true;
}

export function looksLikeNaturalLanguage(input: string): boolean {
  // Heuristic: contains spaces and no slash (not already formatted)
  return input.includes(' ') && !input.includes('/');
}
