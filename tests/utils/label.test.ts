import { describe, expect, it } from 'bun:test';
import { CLEAN_LABELS } from '../../src/data/clean-labels.js';
import type { LabelInfo } from '../../src/utils/gh.js';
import {
  buildEffectiveLabelSource,
  findCloseMatches,
  isCleanLabelsMatch,
  normalizeLabelName,
  parseLabelsCsv,
  scoreLabelsForContent,
  validateLabels,
} from '../../src/utils/label.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function label(name: string, description = '', color = 'ffffff'): LabelInfo {
  return { name, description, color };
}

const CLEAN_LABEL_INFOS: LabelInfo[] = CLEAN_LABELS.map((l) => ({
  name: l.name,
  description: l.description,
  color: l.color,
}));

// ── normalizeLabelName ─────────────────────────────────────────────────────

describe('normalizeLabelName', () => {
  it('lowercases and trims', () => {
    expect(normalizeLabelName('  Bug  ')).toBe('bug');
    expect(normalizeLabelName('Good First Issue')).toBe('good first issue');
    expect(normalizeLabelName('ENHANCEMENT')).toBe('enhancement');
  });

  it('preserves internal spaces', () => {
    expect(normalizeLabelName('needs triage')).toBe('needs triage');
    expect(normalizeLabelName('awaiting response')).toBe('awaiting response');
  });
});

// ── parseLabelsCsv ────────────────────────────────────────────────────────

describe('parseLabelsCsv', () => {
  it('splits by comma and trims each item', () => {
    expect(parseLabelsCsv('bug,enhancement')).toEqual(['bug', 'enhancement']);
    expect(parseLabelsCsv(' bug , enhancement ')).toEqual(['bug', 'enhancement']);
  });

  it('preserves spaces within a label name', () => {
    expect(parseLabelsCsv('bug,good first issue')).toEqual(['bug', 'good first issue']);
    expect(parseLabelsCsv('maintainer only,not valid')).toEqual(['maintainer only', 'not valid']);
  });

  it('filters empty entries', () => {
    expect(parseLabelsCsv(',  , ')).toEqual([]);
    expect(parseLabelsCsv('bug,,enhancement')).toEqual(['bug', 'enhancement']);
  });

  it('handles a single label', () => {
    expect(parseLabelsCsv('bug')).toEqual(['bug']);
    expect(parseLabelsCsv('  good first issue  ')).toEqual(['good first issue']);
  });
});

// ── isCleanLabelsMatch ─────────────────────────────────────────────────────

describe('isCleanLabelsMatch', () => {
  it('returns true when repo labels exactly match Clean Labels by name', () => {
    expect(isCleanLabelsMatch(CLEAN_LABEL_INFOS)).toBe(true);
  });

  it('returns true regardless of case or whitespace differences', () => {
    const cased = CLEAN_LABEL_INFOS.map((l) => ({ ...l, name: l.name.toUpperCase() }));
    expect(isCleanLabelsMatch(cased)).toBe(true);
  });

  it('returns false when repo has extra labels', () => {
    const extra = [...CLEAN_LABEL_INFOS, label('custom-label')];
    expect(isCleanLabelsMatch(extra)).toBe(false);
  });

  it('returns false when repo is missing a label', () => {
    const missing = CLEAN_LABEL_INFOS.filter((l) => l.name !== 'bug');
    expect(isCleanLabelsMatch(missing)).toBe(false);
  });

  it('returns false for an empty repo', () => {
    expect(isCleanLabelsMatch([])).toBe(false);
  });

  it('returns false when repo has different label names', () => {
    const different = [label('my-bug'), label('my-feature')];
    expect(isCleanLabelsMatch(different)).toBe(false);
  });
});

// ── buildEffectiveLabelSource ─────────────────────────────────────────────

describe('buildEffectiveLabelSource', () => {
  it('selects clean-labels source on 100% match', () => {
    const result = buildEffectiveLabelSource(CLEAN_LABEL_INFOS);
    expect(result.source).toBe('clean-labels');
    // Should use canonical descriptions from the dataset
    const bugLabel = result.labels.find((l) => l.name === 'bug');
    expect(bugLabel?.description).toContain('[Type]');
  });

  it('selects repo source when labels differ', () => {
    const repoLabels = [label('custom', 'My custom label')];
    const result = buildEffectiveLabelSource(repoLabels);
    expect(result.source).toBe('repo');
    expect(result.labels).toEqual(repoLabels);
  });
});

// ── validateLabels ────────────────────────────────────────────────────────

describe('validateLabels', () => {
  const available: LabelInfo[] = [
    label('bug', 'Something broken'),
    label('enhancement', 'New feature'),
    label('good first issue', 'Newcomer friendly'),
  ];

  it('validates known labels case-insensitively', () => {
    const result = validateLabels(['Bug', 'ENHANCEMENT'], available);
    expect(result.valid).toEqual(['bug', 'enhancement']);
    expect(result.invalid).toEqual([]);
  });

  it('separates unknown labels', () => {
    const result = validateLabels(['bug', 'unknown-label'], available);
    expect(result.valid).toEqual(['bug']);
    expect(result.invalid).toEqual(['unknown-label']);
  });

  it('handles multi-word labels', () => {
    const result = validateLabels(['good first issue'], available);
    expect(result.valid).toEqual(['good first issue']);
    expect(result.invalid).toEqual([]);
  });

  it('returns canonical name from available (preserves case)', () => {
    const mixed = [label('Bug Fix')];
    const result = validateLabels(['bug fix'], mixed);
    expect(result.valid).toEqual(['Bug Fix']);
  });

  it('handles empty requested list', () => {
    const result = validateLabels([], available);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });
});

// ── findCloseMatches ──────────────────────────────────────────────────────

describe('findCloseMatches', () => {
  const available: LabelInfo[] = [
    label('bug'),
    label('enhancement'),
    label('good first issue'),
    label('help wanted'),
    label('documentation'),
  ];

  it('finds exact match (score 100)', () => {
    const matches = findCloseMatches('bug', available);
    expect(matches[0]).toBe('bug');
  });

  it('finds prefix match', () => {
    const matches = findCloseMatches('doc', available);
    expect(matches).toContain('documentation');
  });

  it('finds substring match', () => {
    const matches = findCloseMatches('first', available);
    expect(matches).toContain('good first issue');
  });

  it('returns at most maxResults items', () => {
    const matches = findCloseMatches('e', available, 2);
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array when nothing matches', () => {
    const matches = findCloseMatches('zzzzzz', available);
    expect(matches).toEqual([]);
  });
});

// ── scoreLabelsForContent ─────────────────────────────────────────────────

describe('scoreLabelsForContent', () => {
  const labels: LabelInfo[] = [
    label('bug', '[Type] Something is broken [issues, PRs]'),
    label('documentation', '[Type] Improvements to docs [issues, PRs]'),
    label('enhancement', '[Type] New feature [issues, PRs]'),
    label('security', '[Type] Security vulnerability [issues, PRs]'),
  ];

  it('scores label whose name appears in content higher', () => {
    const content = 'There is a bug in the authentication code.';
    const ranked = scoreLabelsForContent(content, labels);
    expect(ranked[0].label.name).toBe('bug');
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it('scores documentation label for doc-related content', () => {
    const content = 'The documentation for the API is missing. Update docs please.';
    const ranked = scoreLabelsForContent(content, labels);
    const docScore = ranked.find((r) => r.label.name === 'documentation');
    expect(docScore).toBeDefined();
    expect(docScore?.score).toBeGreaterThan(0);
  });

  it('returns empty array for unrelated content', () => {
    const content = 'xyz abc 123';
    const ranked = scoreLabelsForContent(content, labels);
    expect(ranked).toHaveLength(0);
  });

  it('returns items sorted by score descending', () => {
    const content = 'fix the bug and improve security vulnerability';
    const ranked = scoreLabelsForContent(content, labels);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});
