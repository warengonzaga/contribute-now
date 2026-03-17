import { describe, expect, it } from 'bun:test';
import { isEmptyGroupCommitResult } from '../../src/commands/commit.js';

describe('commit command group result handling', () => {
  it('treats no staged changes as an empty group result', () => {
    expect(
      isEmptyGroupCommitResult('no changes added to commit (use "git add" and/or "git commit -a")'),
    ).toBe(true);
  });

  it('treats nothing to commit as an empty group result', () => {
    expect(isEmptyGroupCommitResult('nothing to commit, working tree clean')).toBe(true);
  });

  it('keeps real git failures classified as errors', () => {
    expect(isEmptyGroupCommitResult('fatal: unable to auto-detect email address')).toBe(false);
  });
});
