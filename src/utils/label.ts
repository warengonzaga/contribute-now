import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CLEAN_LABELS, type CleanLabel } from '../data/clean-labels.js';
import type { LabelInfo } from './gh.js';

// ── Constants ──────────────────────────────────────────────────────────────

const LABEL_CACHE_DIRNAME = 'contribute-now';
const LABEL_CACHE_FILENAME = 'labels.json';

// ── Label source strategy ──────────────────────────────────────────────────

export type LabelSource = 'clean-labels' | 'repo';

export interface LabelCache {
  /** The labels to use for validation and suggestions. */
  labels: LabelInfo[];
  /** Whether the active source is the Clean Labels dataset (100% name match). */
  source: LabelSource;
  /** ISO timestamp of the last fetch. */
  fetchedAt: string;
}

// ── Path resolution ────────────────────────────────────────────────────────

function findRepoRoot(cwd = process.cwd()): string | null {
  let current = resolve(cwd);

  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function resolveGitDir(cwd = process.cwd()): string | null {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    return null;
  }

  const dotGitPath = join(repoRoot, '.git');

  try {
    const stat = statSync(dotGitPath);
    if (stat.isDirectory()) {
      return dotGitPath;
    }

    if (!stat.isFile()) {
      return null;
    }

    const content = readFileSync(dotGitPath, 'utf-8').trim();
    const match = /^gitdir:\s*(.+)$/i.exec(content);
    if (!match) {
      return null;
    }

    return resolve(repoRoot, match[1].trim());
  } catch {
    return null;
  }
}

export function getLabelCachePath(cwd = process.cwd()): string | null {
  const gitDir = resolveGitDir(cwd);
  if (!gitDir) {
    return null;
  }

  return join(gitDir, LABEL_CACHE_DIRNAME, LABEL_CACHE_FILENAME);
}

// ── Cache read / write ─────────────────────────────────────────────────────

export function readLabelCache(cwd = process.cwd()): LabelCache | null {
  const cachePath = getLabelCachePath(cwd);
  if (!cachePath || !existsSync(cachePath)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8')) as Partial<LabelCache>;

    if (
      !Array.isArray(raw.labels) ||
      typeof raw.fetchedAt !== 'string' ||
      (raw.source !== 'clean-labels' && raw.source !== 'repo')
    ) {
      return null;
    }

    return {
      labels: raw.labels as LabelInfo[],
      source: raw.source,
      fetchedAt: raw.fetchedAt,
    };
  } catch {
    return null;
  }
}

export function writeLabelCache(cache: LabelCache, cwd = process.cwd()): void {
  const cachePath = getLabelCachePath(cwd);
  if (!cachePath) {
    return;
  }

  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}

// ── Normalization ──────────────────────────────────────────────────────────

/**
 * Normalize a label name for comparison.
 * Policy: lowercase, trim surrounding whitespace.
 */
export function normalizeLabelName(name: string): string {
  return name.toLowerCase().trim();
}

// ── 100% match strategy ────────────────────────────────────────────────────

/**
 * Returns true when the repository's label set is a 100% match against the
 * Clean Labels dataset (by normalized name — lowercase, trimmed).
 *
 * Matching definition:
 *  - Name comparison: case-insensitive, surrounding whitespace stripped.
 *  - Description/color: excluded from the match check (may be customized).
 *  - Cardinality: repo must have EXACTLY the same label count as Clean Labels.
 */
export function isCleanLabelsMatch(repoLabels: LabelInfo[]): boolean {
  const cleanNames = new Set(CLEAN_LABELS.map((l) => normalizeLabelName(l.name)));
  const repoNames = new Set(repoLabels.map((l) => normalizeLabelName(l.name)));

  if (cleanNames.size !== repoNames.size) {
    return false;
  }

  for (const name of cleanNames) {
    if (!repoNames.has(name)) {
      return false;
    }
  }

  return true;
}

/**
 * Build the effective label list from a repository label set.
 *
 * Strategy:
 *  1. If the repo labels are a 100% name-match against Clean Labels, return
 *     the Clean Labels entries (richer/canonical descriptions).
 *  2. Otherwise return the repository-specific labels as fetched.
 */
export function buildEffectiveLabelSource(repoLabels: LabelInfo[]): {
  labels: LabelInfo[];
  source: LabelSource;
} {
  if (isCleanLabelsMatch(repoLabels)) {
    return {
      labels: CLEAN_LABELS.map((cl) => ({
        name: cl.name,
        description: cl.description,
        color: cl.color,
      })),
      source: 'clean-labels',
    };
  }

  return { labels: repoLabels, source: 'repo' };
}

// ── Sync ───────────────────────────────────────────────────────────────────

/**
 * Fetch current repository labels via the GitHub CLI and write the cache.
 * Returns the effective labels (Clean Labels or repo-specific).
 */
export async function syncLabelCache(cwd = process.cwd()): Promise<LabelCache | null> {
  // Late import to avoid circular deps with gh.ts (which has no label dep)
  const { getRepoLabels } = await import('./gh.js');
  const repoLabels = await getRepoLabels();

  if (repoLabels.length === 0) {
    return null;
  }

  const { labels, source } = buildEffectiveLabelSource(repoLabels);

  const cache: LabelCache = {
    labels,
    source,
    fetchedAt: new Date().toISOString(),
  };

  writeLabelCache(cache, cwd);
  return cache;
}

/**
 * Return the active label list.
 *
 * Uses the local cache when available; performs a fresh sync otherwise.
 * Pass `force = true` to skip the cache and always resync.
 */
export async function getActiveLabels(
  cwd = process.cwd(),
  force = false,
): Promise<LabelCache | null> {
  if (!force) {
    const cached = readLabelCache(cwd);
    if (cached) {
      return cached;
    }
  }

  return syncLabelCache(cwd);
}

// ── CSV parsing ────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated label list where commas are separators and spaces
 * are part of label names.
 *
 * Examples:
 *   "bug,enhancement"         → ["bug", "enhancement"]
 *   "bug,good first issue"    → ["bug", "good first issue"]
 *   " bug , enhancement "     → ["bug", "enhancement"]
 */
export function parseLabelsCsv(csv: string): string[] {
  return csv
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface LabelValidationResult {
  valid: string[];
  invalid: string[];
}

/**
 * Validate a list of label names against the available (cached) label set.
 * Returns the names split into valid and invalid buckets.
 * Comparison is case-insensitive and trims surrounding whitespace.
 */
export function validateLabels(requested: string[], available: LabelInfo[]): LabelValidationResult {
  const availableNormalized = new Map<string, string>();
  for (const label of available) {
    availableNormalized.set(normalizeLabelName(label.name), label.name);
  }

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const req of requested) {
    const normalized = normalizeLabelName(req);
    const canonical = availableNormalized.get(normalized);
    if (canonical !== undefined) {
      valid.push(canonical);
    } else {
      invalid.push(req);
    }
  }

  return { valid, invalid };
}

// ── Close-match suggestions ────────────────────────────────────────────────

/**
 * Return close label-name matches for an unknown label string.
 * Uses a simple prefix / substring / bigram strategy — no external deps.
 */
export function findCloseMatches(input: string, available: LabelInfo[], maxResults = 3): string[] {
  const needle = normalizeLabelName(input);

  const scored = available.map((label) => {
    const haystack = normalizeLabelName(label.name);
    let score = 0;

    if (haystack === needle) {
      score = 100;
    } else if (haystack.startsWith(needle) || needle.startsWith(haystack)) {
      score = 60;
    } else if (haystack.includes(needle) || needle.includes(haystack)) {
      score = 40;
    } else {
      // Bigram overlap
      const needleBigrams = toBigrams(needle);
      const haystackBigrams = toBigrams(haystack);
      const overlap = [...needleBigrams].filter((b) => haystackBigrams.has(b)).length;
      const union = new Set([...needleBigrams, ...haystackBigrams]).size;
      score = union > 0 ? Math.round((overlap / union) * 30) : 0;
    }

    return { name: label.name, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((item) => item.name);
}

// ── Label suggestion (content-based) ──────────────────────────────────────

export interface LabelSuggestion {
  label: LabelInfo;
  score: number;
}

/**
 * Score and rank labels against free-text content (issue/PR title + body).
 * Uses keyword matching against label names and descriptions.
 *
 * Stop-words and very short tokens are excluded from description matching.
 */
export function scoreLabelsForContent(content: string, labels: LabelInfo[]): LabelSuggestion[] {
  const contentTokens = tokenize(content.toLowerCase());

  const scored: LabelSuggestion[] = labels.map((label) => {
    const nameTokens = tokenize(label.name.toLowerCase());
    const descTokens = [...tokenize(stripDescriptionMeta(label.description).toLowerCase())].filter(
      (t) => t.length > 3 && !STOP_WORDS.has(t),
    );

    let score = 0;

    // Name match — high weight (3 pts per matched token)
    for (const token of nameTokens) {
      if (contentTokens.has(token)) score += 3;
    }

    // Full name match — bonus
    const normalizedName = normalizeLabelName(label.name);
    if (content.toLowerCase().includes(normalizedName)) {
      score += 5;
    }

    // Description keyword match — lower weight (1 pt per matched token)
    for (const token of descTokens) {
      if (contentTokens.has(token)) score += 1;
    }

    return { label, score };
  });

  return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'into',
  'over',
  'under',
  'have',
  'will',
  'been',
  'more',
  'than',
  'also',
  'when',
  'what',
  'which',
  'some',
  'such',
  'its',
  'not',
  'only',
  'any',
  'each',
  'both',
]);

// ── Re-export CleanLabel type for convenience ──────────────────────────────
export type { CleanLabel };

// ── Internal helpers ───────────────────────────────────────────────────────

/** Strip the `[Category]` prefix and `[scope]` suffix from a Clean Labels description string. */
function stripDescriptionMeta(description: string): string {
  return description
    .replace(/^\[[\w\s]+\]\s*/u, '')
    .replace(/\s*\[[\w,\s]+\]$/u, '')
    .trim();
}

/**
 * Split text into a set of unique lowercase tokens.
 * Splits on whitespace, hyphens, underscores, forward-slashes, and common
 * punctuation to produce meaningful keyword tokens for matching.
 */
function tokenize(text: string): Set<string> {
  return new Set(text.split(/[\s\-_/,.:;!?()[\]{}"']+/).filter((t) => t.length > 0));
}

/**
 * Build a set of all 2-character substrings (bigrams) from the given text.
 * Used by the fuzzy close-match algorithm to compute character-level overlap.
 */
function toBigrams(text: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    bigrams.add(text.slice(i, i + 2));
  }

  return bigrams;
}
