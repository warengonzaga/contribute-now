import { defineCommand } from 'citty';
import pc from 'picocolors';
import { isAIEnabled, readConfig } from '../utils/config.js';
import {
  addLabelsToIssue,
  addLabelsToPR,
  checkGhAuth,
  checkGhInstalled,
  getIssueContent,
  getIssueDetails,
  getPRContent,
  getPRDetails,
  listOpenIssues,
  listOpenPRs,
  type LabelInfo,
  type WorkItemSummary,
} from '../utils/gh.js';
import { generateLabelRankings } from '../utils/copilot.js';
import { confirmPrompt } from '../utils/confirm.js';
import { isGitRepo } from '../utils/git.js';
import {
  findCloseMatches,
  getActiveLabels,
  normalizeLabelName,
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

type WorkItemKind = 'issue' | 'pr';

interface ApplyTarget {
  kind: WorkItemKind;
  number: number;
  title: string;
  body: string;
  existingLabels: string[];
}

interface ApplyPlan {
  target: ApplyTarget;
  labels: string[];
  topScore: number;
  source: 'ai' | 'heuristic';
}

function parsePositiveIntArg(value: string | undefined, fallback: number, fieldName: string): number {
  if (value === undefined || value === null || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    error(`Invalid --${fieldName} value: ${value}. Expected a positive integer.`);
    process.exit(1);
  }

  return parsed;
}

function parseNonNegativeIntArg(
  value: string | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined || value === null || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    error(`Invalid --${fieldName} value: ${value}. Expected a non-negative integer.`);
    process.exit(1);
  }

  return parsed;
}

function toApplyTarget(kind: WorkItemKind, item: WorkItemSummary): ApplyTarget {
  return {
    kind,
    number: item.number,
    title: item.title,
    body: item.body,
    existingLabels: item.labels,
  };
}

async function buildApplyPlan(
  targets: ApplyTarget[],
  availableLabels: LabelInfo[],
  count: number,
  minScore: number,
  options: { useAI: boolean; model?: string },
): Promise<ApplyPlan[]> {
  const plans: ApplyPlan[] = [];

  for (const target of targets) {
    let selectedSource: 'ai' | 'heuristic' = 'heuristic';
    let ranked = scoreLabelsForContent(`${target.title}\n\n${target.body}`, availableLabels);

    if (options.useAI) {
      const aiRanked = await generateLabelRankings(
        { title: target.title, body: target.body },
        availableLabels.map((label) => ({ name: label.name, description: label.description })),
        options.model,
      );

      if (aiRanked && aiRanked.length > 0) {
        const { valid } = validateLabels(
          aiRanked.map((item) => item.label),
          availableLabels,
        );

        if (valid.length > 0) {
          const availableByName = new Map<string, LabelInfo>();
          for (const label of availableLabels) {
            availableByName.set(normalizeLabelName(label.name), label);
          }

          const scoreByName = new Map<string, number>();
          for (const item of aiRanked) {
            scoreByName.set(normalizeLabelName(item.label), item.score);
          }

          ranked = valid
            .map((name) => {
              const canonical = availableByName.get(normalizeLabelName(name));
              if (!canonical) return null;
              return {
                label: canonical,
                score: scoreByName.get(normalizeLabelName(name)) ?? 0,
              };
            })
            .filter((entry): entry is { label: LabelInfo; score: number } => entry !== null)
            .sort((a, b) => b.score - a.score);

          selectedSource = 'ai';
        }
      }
    }

    const existing = new Set(target.existingLabels.map((name) => normalizeLabelName(name)));
    const selected = ranked
      .filter((item) => item.score >= minScore)
      .filter((item) => !existing.has(normalizeLabelName(item.label.name)))
      .slice(0, count);

    if (selected.length === 0) {
      continue;
    }

    plans.push({
      target,
      labels: selected.map((item) => item.label.name),
      topScore: selected[0]?.score ?? 0,
      source: selectedSource,
    });
  }

  return plans;
}

async function applyLabelsWithRetry(
  target: ApplyTarget,
  requested: string[],
  cacheRef: { current: Awaited<ReturnType<typeof getActiveLabels>> },
): Promise<boolean> {
  const runApply = () => {
    return target.kind === 'issue'
      ? addLabelsToIssue(target.number, requested)
      : addLabelsToPR(target.number, requested);
  };

  const targetLabel = `${target.kind === 'issue' ? 'issue' : 'PR'} #${target.number}`;
  const result = await runApply();

  if (result.exitCode === 0) {
    success(`Applied to ${pc.bold(targetLabel)}: ${requested.map((l) => pc.cyan(l)).join(', ')}`);
    return true;
  }

  const stderr = result.stderr.trim();
  const isDrift =
    /not found|does not exist/i.test(stderr) || /not found|does not exist/i.test(result.stdout);

  if (isDrift) {
    warn(`Remote labels changed while applying ${targetLabel}; resyncing and retrying...`);
    const freshCache = await syncLabelCache();
    if (freshCache) {
      cacheRef.current = freshCache;
      const revalidated = validateLabels(requested, freshCache.labels);
      if (revalidated.invalid.length === 0) {
        const retry =
          target.kind === 'issue'
            ? await addLabelsToIssue(target.number, revalidated.valid)
            : await addLabelsToPR(target.number, revalidated.valid);
        if (retry.exitCode === 0) {
          success(
            `Applied to ${pc.bold(targetLabel)}: ${revalidated.valid.map((l) => pc.cyan(l)).join(', ')}`,
          );
          return true;
        }

        error(`Retry failed for ${targetLabel}: ${retry.stderr.trim() || retry.stdout.trim()}`);
        return false;
      }

      error(
        `Retry aborted for ${targetLabel}: unknown label(s) after resync: ${revalidated.invalid.join(', ')}`,
      );
      return false;
    }
  }

  error(`Failed to apply labels for ${targetLabel}: ${stderr || result.stdout.trim()}`);
  return false;
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

// ── cn label apply ────────────────────────────────────────────────────────

const applyCommand = defineCommand({
  meta: {
    name: 'apply',
    description: 'Automatically apply top-matching labels to issues and pull requests',
  },
  args: {
    issue: {
      type: 'string',
      alias: 'i',
      description: 'Issue number to auto-label',
    },
    pr: {
      type: 'string',
      alias: 'p',
      description: 'Pull request number to auto-label',
    },
    issues: {
      type: 'boolean',
      description: 'Bulk mode: include open issues',
      default: false,
    },
    prs: {
      type: 'boolean',
      description: 'Bulk mode: include open pull requests',
      default: false,
    },
    limit: {
      type: 'string',
      description: 'Bulk mode: max open items to inspect per type (default: 20)',
    },
    count: {
      type: 'string',
      description: 'Max labels to apply per item (default: 1)',
    },
    'min-score': {
      type: 'string',
      description: 'Minimum score required to apply a suggested label (default: 4)',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Preview labels without applying them',
      default: false,
    },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Skip confirmation in bulk mode and apply immediately',
      default: false,
    },
    ai: {
      type: 'boolean',
      description: 'Enable AI ranking (use --no-ai to disable)',
      default: true,
    },
    model: {
      type: 'string',
      description: 'AI model to use for label ranking',
    },
    'unlabeled-only': {
      type: 'boolean',
      description: 'Bulk mode: skip items that already have labels',
      default: false,
    },
  },
  async run({ args }) {
    await requireGitRepository();
    await requireGhCli();
    await projectHeading('label apply', '🏷️');

    const hasIssue = Boolean(args.issue);
    const hasPr = Boolean(args.pr);

    if (hasIssue && hasPr) {
      error('Use either --issue or --pr, not both.');
      process.exit(1);
    }

    const isBulk = !hasIssue && !hasPr;
    const includeIssues = isBulk && (args.issues || (!args.issues && !args.prs));
    const includePrs = isBulk && (args.prs || (!args.issues && !args.prs));

    if (!isBulk && args['unlabeled-only']) {
      warn('--unlabeled-only has no effect in single-target mode (--issue / --pr).');
    }

    const limit = parsePositiveIntArg(args.limit, 20, 'limit');
    const count = parsePositiveIntArg(args.count, 1, 'count');
    const minScore = parseNonNegativeIntArg(args['min-score'], 4, 'min-score');
    const effectiveDryRun = Boolean(args['dry-run']) || (isBulk && !args.yes);

    const config = readConfig();
    const disableAI = args.ai === false;
    const useAI = config ? isAIEnabled(config, disableAI) : !disableAI;

    info(`Label ranking mode: ${useAI ? 'AI with heuristic fallback' : 'heuristic only'}`, '🤖');
    if (isBulk && !args.yes && !args['dry-run']) {
      info('Bulk mode defaults to dry-run preview. Pass --yes to apply.', '💡');
    }

    const cacheRef: { current: Awaited<ReturnType<typeof getActiveLabels>> } = {
      current: await getActiveLabels(),
    };

    if (!cacheRef.current) {
      error('Could not load repository labels. Run `cn label add --help` for setup guidance.');
      process.exit(1);
    }

    const targets: ApplyTarget[] = [];

    if (hasIssue) {
      const issueNumber = Number(args.issue);
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
        error(`Invalid issue number: ${String(args.issue)}`);
        process.exit(1);
      }

      const details = await getIssueDetails(issueNumber);
      if (!details) {
        error(`Could not fetch content for issue #${issueNumber}. Verify the number and your gh auth.`);
        process.exit(1);
      }

      targets.push({
        kind: 'issue',
        number: issueNumber,
        title: details.title,
        body: details.body,
        existingLabels: details.labels,
      });
    }

    if (hasPr) {
      const prNumber = Number(args.pr);
      if (!Number.isInteger(prNumber) || prNumber <= 0) {
        error(`Invalid PR number: ${String(args.pr)}`);
        process.exit(1);
      }

      const details = await getPRDetails(prNumber);
      if (!details) {
        error(`Could not fetch content for PR #${prNumber}. Verify the number and your gh auth.`);
        process.exit(1);
      }

      targets.push({
        kind: 'pr',
        number: prNumber,
        title: details.title,
        body: details.body,
        existingLabels: details.labels,
      });
    }

    if (isBulk) {
      if (includeIssues) {
        info(`Fetching up to ${limit} open issue(s)...`, '📋');
        const issues = await listOpenIssues(limit);
        targets.push(...issues.map((item) => toApplyTarget('issue', item)));
      }

      if (includePrs) {
        info(`Fetching up to ${limit} open PR(s)...`, '📋');
        const prs = await listOpenPRs(limit);
        targets.push(...prs.map((item) => toApplyTarget('pr', item)));
      }

      if (args['unlabeled-only']) {
        const before = targets.length;
        targets.splice(0, targets.length, ...targets.filter((t) => t.existingLabels.length === 0));
        const skipped = before - targets.length;
        if (skipped > 0) {
          info(`Skipped ${skipped} already-labeled item(s) (--unlabeled-only).`, '🔖');
        }
      }

      if (targets.length === 0) {
        info('No open issues or PRs found for the selected scope.');
        return;
      }
    }

    const plans = await buildApplyPlan(targets, cacheRef.current.labels, count, minScore, {
      useAI,
      model: args.model,
    });

    if (plans.length === 0) {
      info(
        `No labels qualified for auto-apply (count=${count}, min-score=${minScore}). Try lowering --min-score.`,
      );
      return;
    }

    console.log();
    console.log(`  ${pc.bold('Auto-label plan:')}`);
    console.log();
    for (const plan of plans) {
      const targetName = `${plan.target.kind === 'issue' ? 'issue' : 'PR'} #${plan.target.number}`;
      console.log(
        `    ${pc.cyan('•')} ${pc.bold(targetName)} ${pc.dim(`(top score: ${plan.topScore})`)} -> ${plan.labels
          .map((name) => pc.cyan(name))
          .join(', ')} ${pc.dim(`[${plan.source}]`)}`,
      );
    }
    console.log();

    if (effectiveDryRun) {
      info('Dry run only: no labels were applied.', '🧪');
      if (!isBulk || args['dry-run']) {
        return;
      }
    }

    if (isBulk && !args.yes) {
      const confirmed = await confirmPrompt(`Apply labels to ${plans.length} item(s)?`);
      if (!confirmed) {
        info('Cancelled. No labels were applied.');
        return;
      }
    }

    let appliedCount = 0;
    let failedCount = 0;

    for (const plan of plans) {
      const targetName = `${plan.target.kind === 'issue' ? 'issue' : 'PR'} #${plan.target.number}`;
      info(`Applying ${plan.labels.length} label(s) to ${pc.bold(targetName)}...`, '🏷️');
      const ok = await applyLabelsWithRetry(plan.target, plan.labels, cacheRef);
      if (ok) {
        appliedCount++;
      } else {
        failedCount++;
      }
    }

    console.log();
    if (failedCount === 0) {
      success(`Done. Applied labels to ${appliedCount} item(s).`);
      const sourceNote = formatSourceNote(cacheRef.current.source);
      info(sourceNote, '');
      return;
    }

    warn(`Completed with partial failures. Applied: ${appliedCount}, Failed: ${failedCount}.`);
    process.exit(1);
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
    apply: applyCommand,
    suggest: suggestCommand,
  },
});
