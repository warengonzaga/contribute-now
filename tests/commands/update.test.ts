import { describe, expect, it } from 'bun:test';
import { hasStaleBranchWorkToPreserve } from '../../src/commands/update.js';

describe('update command stale branch safety', () => {
  it('preserves stale branch when it has unique commits ahead of base', () => {
    expect(hasStaleBranchWorkToPreserve(3, false)).toBe(true);
  });

  it('preserves stale branch when it has uncommitted changes', () => {
    expect(hasStaleBranchWorkToPreserve(0, true)).toBe(true);
  });

  it('allows cleanup only when there is no local work to preserve', () => {
    expect(hasStaleBranchWorkToPreserve(0, false)).toBe(false);
  });
});
