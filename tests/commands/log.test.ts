import { describe, expect, it } from 'bun:test';
import { getDefaultOverviewRemoteCommitCount } from '../../src/commands/log.js';

describe('log command defaults', () => {
  it('shows fewer remote commits in overview when local unpushed commits exist', () => {
    expect(getDefaultOverviewRemoteCommitCount(true)).toBe(10);
  });

  it('shows more remote commits in overview when there are no local unpushed commits', () => {
    expect(getDefaultOverviewRemoteCommitCount(false)).toBe(20);
  });
});
