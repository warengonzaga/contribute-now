import { describe, expect, it } from 'bun:test';

// Note: git.ts functions are integration-level (require a real git repo).
// These tests verify the module exports are correct.

describe('git utility module', () => {
  it('module imports without errors', async () => {
    const mod = await import('../../src/utils/git.js');
    expect(typeof mod.isGitRepo).toBe('function');
    expect(typeof mod.getCurrentBranch).toBe('function');
    expect(typeof mod.getRemotes).toBe('function');
    expect(typeof mod.hasUncommittedChanges).toBe('function');
    expect(typeof mod.branchExists).toBe('function');
    expect(typeof mod.commitsBetween).toBe('function');
    expect(typeof mod.getDivergence).toBe('function');
  });
});
