import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_TIP_INTERVAL_MS,
  formatSpinnerLines,
  formatSpinnerTip,
} from '../../src/utils/spinner.js';

describe('spinner formatting', () => {
  it('renders a second line for tips', () => {
    expect(
      formatSpinnerLines('Generating commit message', 'use --no-ai for manual mode', 80),
    ).toEqual(['Generating commit message', '💡 TIP: use --no-ai for manual mode']);
  });

  it('truncates the primary line for very long status text', () => {
    const result = formatSpinnerLines(
      'Asking AI to group 52 file(s) into logical commits (using optimized batching)...',
      'use cn start "describe your task" to let the CLI help with branch naming.',
      60,
    );

    expect(result[0]?.endsWith('…')).toBe(true);
    expect(result[0]?.length).toBeLessThanOrEqual(60);
    expect(result[1]?.endsWith('…')).toBe(true);
    expect(result[1]?.length).toBeLessThanOrEqual(58);
  });

  it('truncates the tip line when it is too wide', () => {
    const result = formatSpinnerLines(
      'Generating branch name suggestion...',
      'set "aiEnabled": false in your repo config to disable AI features for this clone.',
      72,
    );

    expect(result[0]).toBe('Generating branch name suggestion...');
    expect(result[1]?.endsWith('…')).toBe(true);
    expect(result[1]?.length).toBeLessThanOrEqual(70);
  });

  it('formats tips with a visible label', () => {
    expect(formatSpinnerTip('use cn log --remote')).toBe('💡 TIP: use cn log --remote');
  });

  it('uses a slower default tip interval for readability', () => {
    expect(DEFAULT_TIP_INTERVAL_MS).toBe(3960);
  });
});
