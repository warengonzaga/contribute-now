import { describe, expect, it } from 'bun:test';
import {
  BATCH_CONFIG,
  createCompactDiff,
  extractDiffStats,
  normalizeCommitGroups,
  parseDiffByFile,
  sanitizeGeneratedCommitMessage,
} from '../../src/utils/copilot.js';

// ── Helpers ────────────────────────────────────────────────────────

/** Build a minimal unified diff header for a single file. */
function fakeDiff(file: string, added: string[], removed: string[]): string {
  const lines = [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1,3 +1,3 @@',
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
  ];
  return lines.join('\n');
}

/** Build a rename diff header. */
function fakeRenameDiff(oldFile: string, newFile: string): string {
  return [
    `diff --git a/${oldFile} b/${newFile}`,
    'similarity index 90%',
    `rename from ${oldFile}`,
    `rename to ${newFile}`,
    `--- a/${oldFile}`,
    `+++ b/${newFile}`,
    '@@ -1,2 +1,2 @@',
    '-old line',
    '+new line',
  ].join('\n');
}

// ── parseDiffByFile ────────────────────────────────────────────────

describe('parseDiffByFile', () => {
  it('parses a single-file diff', () => {
    const diff = fakeDiff('src/index.ts', ['console.log("hi")'], ['console.log("hello")']);
    const map = parseDiffByFile(diff);

    expect(map.size).toBe(1);
    expect(map.has('src/index.ts')).toBe(true);
    expect(map.get('src/index.ts')).toContain('diff --git');
  });

  it('parses multiple files', () => {
    const diff = [
      fakeDiff('src/a.ts', ['a'], []),
      fakeDiff('src/b.ts', ['b'], []),
      fakeDiff('src/c.ts', ['c'], []),
    ].join('\n');

    const map = parseDiffByFile(diff);
    expect(map.size).toBe(3);
    expect(map.has('src/a.ts')).toBe(true);
    expect(map.has('src/b.ts')).toBe(true);
    expect(map.has('src/c.ts')).toBe(true);
  });

  it('handles renames by indexing under both old and new paths', () => {
    const diff = fakeRenameDiff('old/file.ts', 'new/file.ts');
    const map = parseDiffByFile(diff);

    expect(map.has('old/file.ts')).toBe(true);
    expect(map.has('new/file.ts')).toBe(true);
    // Both paths point to the same section content
    expect(map.get('old/file.ts')).toBe(map.get('new/file.ts'));
  });

  it('returns an empty map for an empty string', () => {
    const map = parseDiffByFile('');
    expect(map.size).toBe(0);
  });

  it('returns an empty map for non-diff text', () => {
    const map = parseDiffByFile('just some random text\nwith lines');
    expect(map.size).toBe(0);
  });
});

// ── extractDiffStats ───────────────────────────────────────────────

describe('extractDiffStats', () => {
  it('counts added and removed lines', () => {
    const section = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,4 +1,4 @@',
      ' unchanged',
      '-removed one',
      '-removed two',
      '+added one',
      '+added two',
      '+added three',
    ].join('\n');

    const stats = extractDiffStats(section);
    expect(stats.added).toBe(3);
    expect(stats.removed).toBe(2);
  });

  it('ignores --- and +++ header lines', () => {
    const section = ['--- a/file.ts', '+++ b/file.ts', '+real add'].join('\n');
    const stats = extractDiffStats(section);
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(0);
  });

  it('returns zeros for an empty section', () => {
    const stats = extractDiffStats('');
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });

  it('returns zeros for context-only diffs', () => {
    const section = [' context line 1', ' context line 2'].join('\n');
    const stats = extractDiffStats(section);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });
});

// ── createCompactDiff ──────────────────────────────────────────────

describe('createCompactDiff', () => {
  it('returns empty string for empty file list', () => {
    expect(createCompactDiff([], 'some diff')).toBe('');
  });

  it('includes header with stats for each file', () => {
    const diff = fakeDiff('src/a.ts', ['added'], ['removed']);
    const compact = createCompactDiff(['src/a.ts'], diff);

    expect(compact).toContain('[src/a.ts]');
    expect(compact).toContain('(+1/-1)');
  });

  it('marks files with no diff section available', () => {
    const compact = createCompactDiff(['ghost.ts'], '');
    expect(compact).toContain('[ghost.ts]');
    expect(compact).toContain('no diff available');
  });

  it('distributes budget across many files', () => {
    // Create 20 files each with a diff
    const files: string[] = [];
    const diffs: string[] = [];
    for (let i = 0; i < 20; i++) {
      const name = `src/file${i}.ts`;
      files.push(name);
      diffs.push(fakeDiff(name, [`line${i}`], []));
    }
    const raw = diffs.join('\n');

    const compact = createCompactDiff(files, raw, 2000);
    // Every file should be represented
    for (const f of files) {
      expect(compact).toContain(`[${f}]`);
    }
  });

  it('handles tiny budget without producing negative slices', () => {
    // This tests the fix for the negative availableForBody bug
    const diff = fakeDiff('src/big.ts', ['a'.repeat(500)], ['b'.repeat(500)]);
    // Very small budget — should fall back to header only, not crash
    const compact = createCompactDiff(['src/big.ts'], diff, 50);

    expect(compact).toContain('[src/big.ts]');
    // Should NOT contain negative slice artifacts or crash
    expect(compact.length).toBeGreaterThan(0);
  });

  it('respects maxTotalChars by truncating the overall result', () => {
    const files: string[] = [];
    const diffs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `src/f${i}.ts`;
      files.push(name);
      diffs.push(fakeDiff(name, ['x'.repeat(200)], ['y'.repeat(200)]));
    }
    const raw = diffs.join('\n');
    const maxChars = 500;
    const compact = createCompactDiff(files, raw, maxChars);
    expect(compact.length).toBeLessThanOrEqual(maxChars);
  });
});

// ── BATCH_CONFIG ───────────────────────────────────────────────────

describe('BATCH_CONFIG', () => {
  it('is exported and has expected keys', () => {
    expect(BATCH_CONFIG).toBeDefined();
    expect(typeof BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD).toBe('number');
    expect(typeof BATCH_CONFIG.COMPACT_PER_FILE_CHARS).toBe('number');
    expect(typeof BATCH_CONFIG.MAX_COMPACT_PAYLOAD).toBe('number');
    expect(typeof BATCH_CONFIG.FALLBACK_BATCH_SIZE).toBe('number');
  });

  it('LARGE_CHANGESET_THRESHOLD equals 15', () => {
    expect(BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD).toBe(15);
  });
});

// ── normalizeCommitGroups ──────────────────────────────────────────

describe('normalizeCommitGroups', () => {
  it('removes unknown files and duplicate assignments across groups', () => {
    const result = normalizeCommitGroups(
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      [
        {
          files: ['src/a.ts', 'src/a.ts', 'missing.ts'],
          message: 'group 1',
        },
        {
          files: ['src/a.ts', 'src/b.ts'],
          message: 'group 2',
        },
      ],
    );

    expect(result.groups).toEqual([
      { files: ['src/a.ts'], message: 'group 1' },
      { files: ['src/b.ts'], message: 'group 2' },
    ]);
    expect(result.unknownFiles).toEqual(['missing.ts']);
    expect(result.duplicateFiles).toEqual(['src/a.ts']);
    expect(result.unassignedFiles).toEqual(['src/c.ts']);
  });

  it('preserves valid group order when all files are uniquely assigned', () => {
    const result = normalizeCommitGroups(
      ['src/a.ts', 'src/b.ts'],
      [
        { files: ['src/b.ts'], message: 'group 1' },
        { files: ['src/a.ts'], message: 'group 2' },
      ],
    );

    expect(result.groups).toEqual([
      { files: ['src/b.ts'], message: 'group 1' },
      { files: ['src/a.ts'], message: 'group 2' },
    ]);
    expect(result.unknownFiles).toEqual([]);
    expect(result.duplicateFiles).toEqual([]);
    expect(result.unassignedFiles).toEqual([]);
  });
});

describe('sanitizeGeneratedCommitMessage', () => {
  it('removes backticks from generated commit messages', () => {
    expect(sanitizeGeneratedCommitMessage('feat: update `example.json` loading')).toBe(
      'feat: update example.json loading',
    );
  });

  it('collapses repeated whitespace after sanitizing', () => {
    expect(sanitizeGeneratedCommitMessage('🔧  update:  improve   `formatConfig` parsing')).toBe(
      '🔧 update: improve formatConfig parsing',
    );
  });
});
