import { describe, expect, it } from 'bun:test';
import { parseRepoFromUrl } from '../../src/utils/remote.js';

describe('parseRepoFromUrl', () => {
  it('parses HTTPS URL', () => {
    expect(parseRepoFromUrl('https://github.com/warengonzaga/contribute-now')).toEqual({
      owner: 'warengonzaga',
      repo: 'contribute-now',
    });
  });

  it('parses HTTPS URL with .git', () => {
    expect(parseRepoFromUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses SSH URL', () => {
    expect(parseRepoFromUrl('git@github.com:owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses SSH URL without .git', () => {
    expect(parseRepoFromUrl('git@github.com:owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('returns null for non-GitHub URL', () => {
    expect(parseRepoFromUrl('https://gitlab.com/owner/repo')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(parseRepoFromUrl('not-a-url')).toBeNull();
  });
});
