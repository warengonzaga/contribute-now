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
  });

  it('returns false for invalid branch names', () => {
    expect(isValidBranchName('/starts-with-slash')).toBe(false);
    expect(isValidBranchName('ends-with-slash/')).toBe(false);
    expect(isValidBranchName('has spaces')).toBe(false);
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
