import { describe, expect, it } from 'bun:test';
import type { ContributeConfig } from '../../src/types.js';
import {
  getBaseBranch,
  getProtectedBranches,
  getProtectedPrefixes,
  getSyncSource,
  hasDevBranch,
  isBranchProtected,
} from '../../src/utils/workflow.js';

describe('hasDevBranch', () => {
  it('returns true for clean-flow', () => {
    expect(hasDevBranch('clean-flow')).toBe(true);
  });

  it('returns true for git-flow', () => {
    expect(hasDevBranch('git-flow')).toBe(true);
  });

  it('returns false for github-flow', () => {
    expect(hasDevBranch('github-flow')).toBe(false);
  });
});

describe('getBaseBranch', () => {
  it('returns devBranch for clean-flow', () => {
    const config: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getBaseBranch(config)).toBe('dev');
  });

  it('returns devBranch for git-flow', () => {
    const config: ContributeConfig = {
      workflow: 'git-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'develop',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getBaseBranch(config)).toBe('develop');
  });

  it('returns mainBranch for github-flow', () => {
    const config: ContributeConfig = {
      workflow: 'github-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getBaseBranch(config)).toBe('main');
  });

  it('defaults devBranch to "dev" when not set in clean-flow', () => {
    const config: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getBaseBranch(config)).toBe('dev');
  });
});

describe('getSyncSource', () => {
  it('clean-flow maintainer syncs from origin/dev', () => {
    const config: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    const source = getSyncSource(config);
    expect(source.remote).toBe('origin');
    expect(source.ref).toBe('origin/dev');
    expect(source.strategy).toBe('pull');
  });

  it('clean-flow contributor syncs from upstream/dev', () => {
    const config: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'contributor',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    const source = getSyncSource(config);
    expect(source.remote).toBe('upstream');
    expect(source.ref).toBe('upstream/dev');
    expect(source.strategy).toBe('pull');
  });

  it('github-flow maintainer syncs from origin/main', () => {
    const config: ContributeConfig = {
      workflow: 'github-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    const source = getSyncSource(config);
    expect(source.remote).toBe('origin');
    expect(source.ref).toBe('origin/main');
    expect(source.strategy).toBe('pull');
  });

  it('github-flow contributor syncs from upstream/main', () => {
    const config: ContributeConfig = {
      workflow: 'github-flow',
      role: 'contributor',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    const source = getSyncSource(config);
    expect(source.remote).toBe('upstream');
    expect(source.ref).toBe('upstream/main');
    expect(source.strategy).toBe('pull');
  });
});

describe('getProtectedBranches', () => {
  it('returns only main for github-flow', () => {
    const config: ContributeConfig = {
      workflow: 'github-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getProtectedBranches(config)).toEqual(['main']);
  });

  it('returns main and dev for clean-flow', () => {
    const config: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getProtectedBranches(config)).toEqual(['main', 'dev']);
  });

  it('returns main and develop for git-flow', () => {
    const config: ContributeConfig = {
      workflow: 'git-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'develop',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getProtectedBranches(config)).toEqual(['main', 'develop']);
  });
});

describe('getProtectedPrefixes', () => {
  it('returns release and hotfix prefixes for git-flow', () => {
    const config: ContributeConfig = {
      workflow: 'git-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'develop',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getProtectedPrefixes(config)).toEqual(['release/', 'hotfix/']);
  });

  it('returns empty array for github-flow', () => {
    const config: ContributeConfig = {
      workflow: 'github-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getProtectedPrefixes(config)).toEqual([]);
  });

  it('returns empty array for clean-flow', () => {
    const config: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(getProtectedPrefixes(config)).toEqual([]);
  });
});

describe('isBranchProtected', () => {
  it('returns true for exact match on protected branch', () => {
    const config: ContributeConfig = {
      workflow: 'git-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'develop',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(isBranchProtected('main', config)).toBe(true);
    expect(isBranchProtected('develop', config)).toBe(true);
  });

  it('returns true for release/* branches in git-flow', () => {
    const config: ContributeConfig = {
      workflow: 'git-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'develop',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(isBranchProtected('release/1.0.0', config)).toBe(true);
    expect(isBranchProtected('hotfix/urgent-fix', config)).toBe(true);
  });

  it('returns false for feature branches in git-flow', () => {
    const config: ContributeConfig = {
      workflow: 'git-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'develop',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(isBranchProtected('feature/new-feature', config)).toBe(false);
    expect(isBranchProtected('fix/some-bug', config)).toBe(false);
  });

  it('returns false for release/* branches in non-git-flow', () => {
    const config: ContributeConfig = {
      workflow: 'github-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
    };
    expect(isBranchProtected('release/1.0.0', config)).toBe(false);
  });
});
