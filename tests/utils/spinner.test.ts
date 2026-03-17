import { describe, expect, it } from 'bun:test';
import { formatSpinnerLines } from '../../src/utils/spinner.js';

describe('spinner formatting', () => {
  it('renders a second line for tips', () => {
    expect(
      formatSpinnerLines('Generating commit message', 'use --no-ai for manual mode', 80),
    ).toEqual(['Generating commit message', 'use --no-ai for manual mode']);
  });

  it('truncates the primary line for very long status text', () => {
    const result = formatSpinnerLines(
      'Asking AI to group 52 file(s) into logical commits (using optimized batching)...',
      'Tip: use cn start "describe your task" to let the CLI help with branch naming.',
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
      'Tip: set "aiEnabled": false in your repo config to disable AI features for this clone.',
      72,
    );

    expect(result[0]).toBe('Generating branch name suggestion...');
    expect(result[1]?.endsWith('…')).toBe(true);
    expect(result[1]?.length).toBeLessThanOrEqual(70);
  });
});
