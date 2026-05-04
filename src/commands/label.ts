import { defineCommand } from 'citty';
import pc from 'picocolors';
import {
  addLabelsToIssue,
  addLabelsToPR,
  checkGhAuth,
  checkGhInstalled,
  getIssueContent,
  getPRContent,
} from '../utils/gh.js';
import { isGitRepo } from '../utils/git.js';
import {
  findCloseMatches,
  getActiveLabels,
  parseLabelsCsv,
  scoreLabelsForContent,
  syncLabelCache,
  validateLabels,
} from '../utils/label.js';
import { error, info, projectHeading, success, warn } from '../utils/logger.js';

// ── Shared guards ──────────────────────────────────────────────────────────

async function requireGitRepository(): Promise<void> {
  if (!(await isGitRepo())) {
    error('Not inside a git repository.');
    process.exit(1);
  }
}

async function requireGhCli(): Promise<void> {
  if (!(await checkGhInstalled())) {
    error('GitHub CLI (gh) is required. Install it at https://cli.github.com');
    process.exit(1);
  }

  if (!(await checkGhAuth())) {
    error('Not authenticated with GitHub CLI. Run `gh auth login` first.');
    process.exit(1);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Collect all positional arguments from rawArgs, excluding known flags and
 * their values.  Joining the parts with a single space reconstructs the
 * full comma-delimited label string even when the shell splits it on spaces.
 *
 * Example:
 *   rawArgs = ['--issue', '42', 'bug,maintainer only,not valid']
 *   → "bug,maintainer only,not valid"
 *
 *   rawArgs = ['--issue', '42', 'bug,good', 'first', 'issue']
 *   → "bug,good first issue"
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

    // Skip any other flags (e.g. --help)
    if (arg.startsWith('-')) {
      continue;
    }

    parts.push(arg);
  }

  return parts.join(' ');
}

// ── Shared helper ──────────────────────────────────────────────────────────

/** Returns a short human-readable label source note for display. */
function formatSourceNote(source: 'clean-labels' | 'repo'): string {
  return source === 'clean-labels' ? '(source: Clean Labels dataset)' : '(source: repo labels)';
}

// ── cn label add ──────────────────────────────────────────────────────────

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Apply existing labels to an issue or pull request',
  },
  args: {
    issue: {
      type: 'string',
      alias: 'i',
      description: 'Issue number to label',
    },
    pr: {
      type: 'string',
      alias: 'p',
      description: 'Pull request number to label',
    },
    labels: {
      type: 'positional',
      description: 'Comma-separated label names (spaces are part of label names)',
      required: false,
    },
  },
  async run({ args, rawArgs }) {
    await requireGitRepository();
    await requireGhCli();
    await projectHeading('label add', '🏷️');

    // ── Resolve target ──────────────────────────────────────────────────
    const hasIssue = Boolean(args.issue);
    const hasPr = Boolean(args.pr);

    if (!hasIssue && !hasPr) {
      error('Provide a target: --issue <number> or --pr <number>');
      process.exit(1);
    }

    if (hasIssue && hasPr) {
      error('Use either --issue or --pr, not both.');
      process.exit(1);
    }

    const targetNumber = Number(hasIssue ? args.issue : args.pr);
    if (!Number.isInteger(targetNumber) || targetNumber <= 0) {
      error(
        `Invalid ${hasIssue ? 'issue' : 'PR'} number: ${String(hasIssue ? args.issue : args.pr)}`,
      );
      process.exit(1);
    }

    // ── Collect label CSV from all positional parts ─────────────────────
    const labelsCsv = extractLabelsCsv(rawArgs);
    if (!labelsCsv) {
      error('No labels provided. Pass a comma-separated list after the target flag.');
      info('Example: cn label add --issue 42 bug,enhancement', '');
      process.exit(1);
    }

    const requested = parseLabelsCsv(labelsCsv);
    if (requested.length === 0) {
      error('No valid label names found in input.');
      process.exit(1);
    }

    // ── Load cached labels (sync if missing) ───────────────────────────
    let cache = await getActiveLabels();
    if (!cache) {
      error(
        'Could not load repository labels. Make sure you are authenticated with `gh auth login`.',
      );
      process.exit(1);
    }

    // ── Validate ───────────────────────────────────────────────────────
    let { valid, invalid } = validateLabels(requested, cache.labels);

    if (invalid.length > 0) {
      // Auto-resync: the cache may be stale
      warn(`Unknown label(s) detected — resyncing label cache…`);
      const freshCache = await syncLabelCache();
      if (freshCache) {
        cache = freshCache;
        const revalidated = validateLabels(requested, cache.labels);
        valid = revalidated.valid;
        invalid = revalidated.invalid;
      }
    }

    if (invalid.length > 0) {
      error(`Unknown label(s): ${invalid.map((l) => pc.bold(l)).join(', ')}`);
      console.log();

      for (const label of invalid) {
        const suggestions = findCloseMatches(label, cache.labels);
        if (suggestions.length > 0) {
          info(
            `  Did you mean for "${label}": ${suggestions.map((s) => pc.cyan(s)).join(', ')}`,
            '',
          );
        }
      }

      console.log();
      info(`Available labels: ${cache.labels.map((l) => pc.dim(l.name)).join(', ')}`, '');
      process.exit(1);
    }

    // ── Apply ──────────────────────────────────────────────────────────
    const targetLabel = hasIssue ? `issue #${targetNumber}` : `PR #${targetNumber}`;
    info(`Applying ${valid.length} label(s) to ${pc.bold(targetLabel)}…`, '🏷️');

    const result = hasIssue
      ? await addLabelsToIssue(targetNumber, valid)
      : await addLabelsToPR(targetNumber, valid);

    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      const isDrift =
        /not found|does not exist/i.test(stderr) || /not found|does not exist/i.test(result.stdout);

      if (isDrift) {
        // Auto-resync and retry once
        warn('Label not found on remote — resyncing and retrying…');
        const freshCache = await syncLabelCache();
        if (freshCache) {
          const revalidated = validateLabels(requested, freshCache.labels);
          if (revalidated.invalid.length === 0) {
            const retry = hasIssue
              ? await addLabelsToIssue(targetNumber, revalidated.valid)
              : await addLabelsToPR(targetNumber, revalidated.valid);

            if (retry.exitCode === 0) {
              success(
                `Applied to ${pc.bold(targetLabel)}: ${revalidated.valid.map((l) => pc.cyan(l)).join(', ')}`,
              );
              return;
            }

            error(`Retry failed: ${retry.stderr.trim() || retry.stdout.trim()}`);
            process.exit(1);
          }
        }
      }

      error(`Failed to apply labels: ${stderr || result.stdout.trim()}`);
      info('Run `cn label add --help` for usage guidance.', '');
      process.exit(1);
    }

    success(`Applied to ${pc.bold(targetLabel)}: ${valid.map((l) => pc.cyan(l)).join(', ')}`);

    const sourceNote = formatSourceNote(cache.source);
    info(sourceNote, '');
  },
});

// ── cn label suggest ──────────────────────────────────────────────────────

const suggestCommand = defineCommand({
  meta: {
    name: 'suggest',
    description: 'Suggest labels for an issue or pull request based on its content',
  },
  args: {
    issue: {
      type: 'string',
      alias: 'i',
      description: 'Issue number to suggest labels for',
    },
    pr: {
      type: 'string',
      alias: 'p',
      description: 'Pull request number to suggest labels for',
    },
  },
  async run({ args }) {
    await requireGitRepository();
    await requireGhCli();
    await projectHeading('label suggest', '🏷️');

    // ── Resolve target ──────────────────────────────────────────────────
    const hasIssue = Boolean(args.issue);
    const hasPr = Boolean(args.pr);

    if (!hasIssue && !hasPr) {
      error('Provide a target: --issue <number> or --pr <number>');
      process.exit(1);
    }

    if (hasIssue && hasPr) {
      error('Use either --issue or --pr, not both.');
      process.exit(1);
    }

    const targetNumber = Number(hasIssue ? args.issue : args.pr);
    if (!Number.isInteger(targetNumber) || targetNumber <= 0) {
      error(
        `Invalid ${hasIssue ? 'issue' : 'PR'} number: ${String(hasIssue ? args.issue : args.pr)}`,
      );
      process.exit(1);
    }

    const targetLabel = hasIssue ? `issue #${targetNumber}` : `PR #${targetNumber}`;

    // ── Fetch content ───────────────────────────────────────────────────
    info(`Fetching ${pc.bold(targetLabel)} content…`, '');
    const content = hasIssue
      ? await getIssueContent(targetNumber)
      : await getPRContent(targetNumber);

    if (!content) {
      error(`Could not fetch content for ${targetLabel}. Verify the number and your gh auth.`);
      process.exit(1);
    }

    const fullText = `${content.title}\n\n${content.body}`;

    // ── Load cached labels (sync if missing) ───────────────────────────
    const cache = await getActiveLabels();
    if (!cache) {
      error('Could not load repository labels. Run `cn label add --help` for setup guidance.');
      process.exit(1);
    }

    // ── Score and rank ─────────────────────────────────────────────────
    const ranked = scoreLabelsForContent(fullText, cache.labels);

    if (ranked.length === 0) {
      info(`No label suggestions found for ${pc.bold(targetLabel)}.`);
      info(`Total labels available: ${cache.labels.length}`, '');
      return;
    }

    const sourceNote = formatSourceNote(cache.source);

    console.log();
    console.log(
      `  ${pc.bold(`Suggested labels for ${pc.cyan(targetLabel)}:`)}  ${pc.dim(sourceNote)}`,
    );
    console.log();

    const topN = ranked.slice(0, 5);
    for (const { label, score } of topN) {
      const descPart = label.description ? pc.dim(` — ${label.description}`) : '';
      const scorePart = pc.dim(` [score: ${score}]`);
      console.log(`    ${pc.cyan('•')} ${pc.bold(label.name)}${descPart}${scorePart}`);
    }

    console.log();
    info(`Apply a label: cn label add --${hasIssue ? 'issue' : 'pr'} ${targetNumber} <label>`, '');
  },
});

// ── cn label (parent) ─────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: 'label',
    description: 'Manage labels on issues and pull requests',
  },
  subCommands: {
    add: addCommand,
    suggest: suggestCommand,
  },
});
