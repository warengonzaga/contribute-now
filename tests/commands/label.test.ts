import { describe, expect, it } from 'bun:test';

/**
 * Inline copy of the extractLabelsCsv helper from src/commands/label.ts
 * (extracted here because the command module has side effects we don't want
 * to trigger in unit tests).
 */
function extractLabelsCsv(rawArgs: string[]): string {
  const knownFlagsWithValues = new Set(['--issue', '--pr', '-i', '-p']);
  const parts: string[] = [];
  let skipNext = false;

  for (const arg of rawArgs) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (knownFlagsWithValues.has(arg)) {
      skipNext = true;
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    parts.push(arg);
  }

  return parts.join(' ');
}

// ── extractLabelsCsv ──────────────────────────────────────────────────────

describe('extractLabelsCsv', () => {
  it('collects a single quoted label string', () => {
    const rawArgs = ['--issue', '42', 'bug,enhancement'];
    expect(extractLabelsCsv(rawArgs)).toBe('bug,enhancement');
  });

  it('joins multiple positional parts with a space (shell-split CSV)', () => {
    // cn label add --issue 123 bug,maintainer only,not valid
    // Shell splits "bug,maintainer only,not valid" into 3 tokens
    const rawArgs = ['--issue', '123', 'bug,maintainer', 'only,not', 'valid'];
    expect(extractLabelsCsv(rawArgs)).toBe('bug,maintainer only,not valid');
  });

  it('works with --pr flag', () => {
    const rawArgs = ['--pr', '7', 'enhancement,good', 'first', 'issue'];
    expect(extractLabelsCsv(rawArgs)).toBe('enhancement,good first issue');
  });

  it('ignores other flags', () => {
    const rawArgs = ['--issue', '42', '--help', 'bug'];
    expect(extractLabelsCsv(rawArgs)).toBe('bug');
  });

  it('returns empty string when no positional args are present', () => {
    const rawArgs = ['--issue', '42'];
    expect(extractLabelsCsv(rawArgs)).toBe('');
  });

  it('handles short aliases -i and -p', () => {
    const rawArgs = ['-i', '10', 'bug,security'];
    expect(extractLabelsCsv(rawArgs)).toBe('bug,security');
  });
});
