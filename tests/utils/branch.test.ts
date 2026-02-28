import { describe, expect, it } from 'bun:test';
import {
  formatBranchName,
  hasPrefix,
  isValidBranchName,
  looksLikeNaturalLanguage,
  parsePrefix,
} from '../../src/utils/branch.js';

describe('hasPrefix', () => {
  it('returns true when branch has known prefix', () => {
    expect(hasPrefix('feature/user-auth')).toBe(true);
    expect(hasPrefix('fix/login-bug')).toBe(true);
    expect(hasPrefix('docs/readme')).toBe(true);
  });

  it('returns false when no prefix', () => {
    expect(hasPrefix('user-auth')).toBe(false);
    expect(hasPrefix('something-else')).toBe(false);
  });
});

describe('parsePrefix', () => {
  it('extracts prefix from branch name', () => {
    expect(parsePrefix('feature/user-auth')).toBe('feature');
    expect(parsePrefix('fix/bug')).toBe('fix');
  });

  it('returns null when no prefix', () => {
    expect(parsePrefix('user-auth')).toBeNull();
  });
});

describe('formatBranchName', () => {
  it('combines prefix and name', () => {
    expect(formatBranchName('feature', 'user auth')).toBe('feature/user-auth');
  });

  it('sanitizes special characters', () => {
    expect(formatBranchName('fix', 'bug!! @#$')).toBe('fix/bug');
  });

  it('lowercases the name', () => {
    expect(formatBranchName('feature', 'UserAuth')).toBe('feature/userauth');
  });
});

describe('isValidBranchName', () => {
  it('returns true for valid branch names', () => {
    expect(isValidBranchName('feature/user-auth')).toBe(true);
    expect(isValidBranchName('fix/bug-123')).toBe(true);
    expect(isValidBranchName('main')).toBe(true);
    expect(isValidBranchName('release/1.0.0')).toBe(true);
    expect(isValidBranchName('hotfix/urgent-patch')).toBe(true);
  });

  it('returns false for invalid branch names', () => {
    expect(isValidBranchName('/starts-with-slash')).toBe(false);
    expect(isValidBranchName('ends-with-slash/')).toBe(false);
    expect(isValidBranchName('has spaces')).toBe(false);
  });

  it('rejects git reserved names', () => {
    expect(isValidBranchName('HEAD')).toBe(false);
    expect(isValidBranchName('FETCH_HEAD')).toBe(false);
    expect(isValidBranchName('ORIG_HEAD')).toBe(false);
    expect(isValidBranchName('MERGE_HEAD')).toBe(false);
    expect(isValidBranchName('CHERRY_PICK_HEAD')).toBe(false);
    expect(isValidBranchName('REBASE_HEAD')).toBe(false);
    expect(isValidBranchName('BISECT_HEAD')).toBe(false);
  });

  it('rejects names starting with dash (git flag injection)', () => {
    expect(isValidBranchName('-flag')).toBe(false);
    expect(isValidBranchName('--delete')).toBe(false);
  });

  it('rejects git revision range syntax', () => {
    expect(isValidBranchName('a..b')).toBe(false);
    expect(isValidBranchName('feature..main')).toBe(false);
  });

  it('rejects reflog syntax', () => {
    expect(isValidBranchName('main@{0}')).toBe(false);
  });

  it('rejects control characters', () => {
    expect(isValidBranchName('a\tb')).toBe(false);
    expect(isValidBranchName('a\nb')).toBe(false);
    expect(isValidBranchName('a\x00b')).toBe(false);
  });

  it('rejects .lock endings', () => {
    expect(isValidBranchName('refs/heads/main.lock')).toBe(false);
  });

  it('rejects consecutive slashes', () => {
    expect(isValidBranchName('feature//name')).toBe(false);
  });

  it('rejects slash-dot patterns', () => {
    expect(isValidBranchName('feature/.hidden')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidBranchName('')).toBe(false);
  });

  it('rejects names ending with dot', () => {
    expect(isValidBranchName('feature.')).toBe(false);
  });
});

describe('looksLikeNaturalLanguage', () => {
  it('returns true for sentence-like strings', () => {
    expect(looksLikeNaturalLanguage('fix the login timeout bug')).toBe(true);
    expect(looksLikeNaturalLanguage('add user profile page')).toBe(true);
  });

  it('returns false for already-formatted branch names', () => {
    expect(looksLikeNaturalLanguage('fix/login-timeout')).toBe(false);
    expect(looksLikeNaturalLanguage('user-auth')).toBe(false);
  });
});
