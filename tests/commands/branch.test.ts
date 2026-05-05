import { describe, expect, it } from 'bun:test';
import {
  shouldPruneBranchRefs,
  shouldWarnDeletedRemoteBranch,
} from '../../src/commands/branch.js';
import branchCommand from '../../src/commands/branch.js';

describe('branch command prune option', () => {
  it('enables prune behavior when prune flag is true', () => {
    expect(shouldPruneBranchRefs({ prune: true })).toBe(true);
  });

  it('enables prune behavior when sync flag is true', () => {
    expect(shouldPruneBranchRefs({ sync: true })).toBe(true);
  });

  it('disables prune behavior when prune flag is false or missing', () => {
    expect(shouldPruneBranchRefs({ prune: false })).toBe(false);
    expect(shouldPruneBranchRefs({ sync: false })).toBe(false);
    expect(shouldPruneBranchRefs({})).toBe(false);
  });

  it('registers prune flag with short alias and default', () => {
    const pruneArg = (branchCommand as { args?: Record<string, unknown> }).args?.prune as
      | {
          alias?: string;
          default?: boolean;
          type?: string;
        }
      | undefined;

    expect(pruneArg).toBeDefined();
    expect(pruneArg?.alias).toBe('p');
    expect(pruneArg?.default).toBe(false);
    expect(pruneArg?.type).toBe('boolean');

    const syncArg = (branchCommand as { args?: Record<string, unknown> }).args?.sync as
      | {
          alias?: string;
          default?: boolean;
          type?: string;
        }
      | undefined;

    expect(syncArg).toBeDefined();
    expect(syncArg?.alias).toBe('s');
    expect(syncArg?.default).toBe(false);
    expect(syncArg?.type).toBe('boolean');
  });

  it('warns when current branch is remote-gone and has local work', () => {
    expect(
      shouldWarnDeletedRemoteBranch({
        isCurrent: true,
        gone: true,
        hasUncommitted: true,
        uniqueCommitsAheadOfBase: 0,
      }),
    ).toBe(true);

    expect(
      shouldWarnDeletedRemoteBranch({
        isCurrent: true,
        gone: true,
        hasUncommitted: false,
        uniqueCommitsAheadOfBase: 2,
      }),
    ).toBe(true);
  });

  it('does not warn when remote is not gone or no local work exists', () => {
    expect(
      shouldWarnDeletedRemoteBranch({
        isCurrent: true,
        gone: true,
        hasUncommitted: false,
        uniqueCommitsAheadOfBase: 0,
      }),
    ).toBe(false);

    expect(
      shouldWarnDeletedRemoteBranch({
        isCurrent: true,
        gone: false,
        hasUncommitted: true,
        uniqueCommitsAheadOfBase: 3,
      }),
    ).toBe(false);
  });
});
