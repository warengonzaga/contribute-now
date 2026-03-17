import { describe, expect, it } from 'bun:test';
import { getVisibleCommandGuide } from '../../src/utils/tips.js';

describe('quick guide selection', () => {
  it('deduplicates repeated command rows for status', () => {
    const guide = getVisibleCommandGuide('status');

    expect(guide).not.toBeNull();
    expect(guide?.examples.map((example) => example.command)).toEqual([
      'cn status --help',
      'cn status',
    ]);
  });

  it('keeps distinct command variants for branch', () => {
    const guide = getVisibleCommandGuide('branch');

    expect(guide).not.toBeNull();
    expect(new Set(guide?.examples.map((example) => example.command)).size).toBe(
      guide?.examples.length,
    );
  });
});
