import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { CommitConvention } from '../types.js';
import { readConfig } from '../utils/config.js';
import { inputPrompt, selectPrompt } from '../utils/confirm.js';
import {
  checkCopilotAvailable,
  generateCommitMessage,
  generatePRDescription,
} from '../utils/copilot.js';
import {
  checkGhAuth,
  checkGhInstalled,
  createPR,
  createPRFill,
  getPRForBranch,
} from '../utils/gh.js';
import {
  checkoutBranch,
  commitWithMessage,
  deleteRemoteBranch,
  forceDeleteBranch,
  getCurrentBranch,
  getLog,
  getLogDiff,
  getStagedDiff,
  getStagedFiles,
  isGitRepo,
  mergeSquash,
  pushBranch,
  pushSetUpstream,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { getRepoInfoFromRemote } from '../utils/remote.js';
import { createSpinner } from '../utils/spinner.js';
import { getBaseBranch, getProtectedBranches } from '../utils/workflow.js';

/**
 * Squash-merge a feature branch into the base branch locally, push,
 * and clean up the feature branch (local + remote).
 */
async function performSquashMerge(
  origin: string,
  baseBranch: string,
  featureBranch: string,
  options?: { defaultMsg?: string; model?: string; convention?: CommitConvention },
): Promise<void> {
  // 1. Checkout base branch
  info(`Checking out ${pc.bold(baseBranch)}...`);
  const coResult = await checkoutBranch(baseBranch);
  if (coResult.exitCode !== 0) {
    error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
    process.exit(1);
  }

  // 2. Squash merge
  info(`Squash merging ${pc.bold(featureBranch)} into ${pc.bold(baseBranch)}...`);
  const mergeResult = await mergeSquash(featureBranch);
  if (mergeResult.exitCode !== 0) {
    error(`Squash merge failed: ${mergeResult.stderr}`);
    process.exit(1);
  }

  // 3. Generate commit message
  let message = options?.defaultMsg;

  if (!message) {
    // After squash merge, changes are staged — use AI to generate a commit message
    const copilotError = await checkCopilotAvailable();
    if (!copilotError) {
      const spinner = createSpinner('Generating AI commit message for squash merge...');
      const [stagedDiff, stagedFiles] = await Promise.all([getStagedDiff(), getStagedFiles()]);
      const aiMsg = await generateCommitMessage(
        stagedDiff,
        stagedFiles,
        options?.model,
        options?.convention ?? 'clean-commit',
      );
      if (aiMsg) {
        message = aiMsg;
        spinner.success('AI commit message generated.');
      } else {
        spinner.fail('AI did not return a commit message.');
      }
    } else {
      warn(`AI unavailable: ${copilotError}`);
    }
  }

  const fallback = message || `squash merge ${featureBranch}`;
  const finalMsg = await inputPrompt('Commit message', fallback);
  const commitResult = await commitWithMessage(finalMsg);
  if (commitResult.exitCode !== 0) {
    error(`Commit failed: ${commitResult.stderr}`);
    process.exit(1);
  }

  // 4. Push base branch
  info(`Pushing ${pc.bold(baseBranch)} to ${origin}...`);
  const pushResult = await pushBranch(origin, baseBranch);
  if (pushResult.exitCode !== 0) {
    error(`Failed to push ${baseBranch}: ${pushResult.stderr}`);
    process.exit(1);
  }

  // 5. Delete feature branch locally
  info(`Deleting local branch ${pc.bold(featureBranch)}...`);
  const delLocal = await forceDeleteBranch(featureBranch);
  if (delLocal.exitCode !== 0) {
    warn(`Could not delete local branch: ${delLocal.stderr.trim()}`);
  }

  // 6. Delete feature branch remotely
  info(`Deleting remote branch ${pc.bold(featureBranch)}...`);
  const delRemote = await deleteRemoteBranch(origin, featureBranch);
  if (delRemote.exitCode !== 0) {
    warn(`Could not delete remote branch: ${delRemote.stderr.trim()}`);
  }

  success(`✅ Squash merged ${pc.bold(featureBranch)} into ${pc.bold(baseBranch)} and pushed.`);
  info(`Run ${pc.bold('contrib start')} to begin a new feature.`);
}

export default defineCommand({
  meta: {
    name: 'submit',
    description: 'Push current branch and create a pull request',
  },
  args: {
    draft: {
      type: 'boolean',
      description: 'Create PR as draft',
      default: false,
    },
    'no-ai': {
      type: 'boolean',
      description: 'Skip AI PR description generation',
      default: false,
    },
    model: {
      type: 'string',
      description: 'AI model to use for PR description generation',
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const config = readConfig();
    if (!config) {
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    const { origin } = config;
    const baseBranch = getBaseBranch(config);
    const protectedBranches = getProtectedBranches(config);
    const currentBranch = await getCurrentBranch();

    if (!currentBranch) {
      error('Could not determine current branch.');
      process.exit(1);
    }

    // 1. Verify not on a protected branch
    if (protectedBranches.includes(currentBranch)) {
      error(
        `Cannot submit ${protectedBranches.map((b) => pc.bold(b)).join(' or ')} as a PR. Switch to your feature branch.`,
      );
      process.exit(1);
    }

    heading('🚀 contrib submit');

    // 2. Push branch
    info(`Pushing ${pc.bold(currentBranch)} to ${origin}...`);
    const pushResult = await pushSetUpstream(origin, currentBranch);
    if (pushResult.exitCode !== 0) {
      error(`Failed to push: ${pushResult.stderr}`);
      process.exit(1);
    }

    // 3. Check if gh CLI is available
    const ghInstalled = await checkGhInstalled();
    const ghAuthed = ghInstalled && (await checkGhAuth());

    if (!ghInstalled || !ghAuthed) {
      // 5. gh unavailable: print manual PR URL
      const repoInfo = await getRepoInfoFromRemote(origin);
      if (repoInfo) {
        const prUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/compare/${baseBranch}...${currentBranch}?expand=1`;
        console.log();
        info('Create your PR manually:');
        console.log(`  ${pc.cyan(prUrl)}`);
      } else {
        info('gh CLI not available. Create your PR manually on GitHub.');
      }
      return;
    }

    // 3b. Check if a PR already exists for this branch
    const existingPR = await getPRForBranch(currentBranch);
    if (existingPR) {
      success(
        `Pushed changes to existing PR #${existingPR.number}: ${pc.bold(existingPR.title)}`,
      );
      console.log(`  ${pc.cyan(existingPR.url)}`);
      return;
    }

    // 4. Generate AI PR description
    let prTitle: string | null = null;
    let prBody: string | null = null;

    if (!args['no-ai']) {
      // Parallelize: check Copilot + fetch commits & diff concurrently
      const [copilotError, commits, diff] = await Promise.all([
        checkCopilotAvailable(),
        getLog(baseBranch, 'HEAD'),
        getLogDiff(baseBranch, 'HEAD'),
      ]);
      if (!copilotError) {
        const spinner = createSpinner('Generating AI PR description...');
        const result = await generatePRDescription(commits, diff, args.model, config.commitConvention);
        if (result) {
          prTitle = result.title;
          prBody = result.body;
          spinner.success('PR description generated.');
          console.log(`\n  ${pc.dim('AI title:')} ${pc.bold(pc.cyan(prTitle))}`);
          console.log(`\n${pc.dim('AI body preview:')}`);
          console.log(pc.dim(prBody.slice(0, 300) + (prBody.length > 300 ? '...' : '')));
        } else {
          spinner.fail('AI did not return a PR description.');
        }
      } else {
        warn(`AI unavailable: ${copilotError}`);
      }
    }

    // --- Action selection ---
    const CANCEL = 'Cancel';
    const SQUASH_LOCAL = `Squash merge to ${baseBranch} locally (no PR)`;

    if (prTitle && prBody) {
      const choices = [
        'Use AI description',
        'Edit title',
        'Write manually',
        'Use gh --fill (auto-fill from commits)',
      ];
      if (config.role === 'maintainer') choices.push(SQUASH_LOCAL);
      choices.push(CANCEL);

      const action = await selectPrompt(
        'What would you like to do with the PR description?',
        choices,
      );

      if (action === CANCEL) {
        warn('Submit cancelled.');
        return;
      }

      if (action === SQUASH_LOCAL) {
        await performSquashMerge(origin, baseBranch, currentBranch, {
          defaultMsg: prTitle ?? undefined,
          model: args.model,
          convention: config.commitConvention,
        });
        return;
      }

      if (action === 'Use AI description') {
        // use as-is
      } else if (action === 'Edit title') {
        prTitle = await inputPrompt('PR title', prTitle);
      } else if (action === 'Write manually') {
        prTitle = await inputPrompt('PR title');
        prBody = await inputPrompt('PR body (markdown)');
      } else {
        // gh --fill
        const fillResult = await createPRFill(baseBranch, args.draft);
        if (fillResult.exitCode !== 0) {
          error(`Failed to create PR: ${fillResult.stderr}`);
          process.exit(1);
        }
        success(`✅ PR created: ${fillResult.stdout.trim()}`);
        return;
      }
    } else {
      const choices = [
        'Write title & body manually',
        'Use gh --fill (auto-fill from commits)',
      ];
      if (config.role === 'maintainer') choices.push(SQUASH_LOCAL);
      choices.push(CANCEL);

      const action = await selectPrompt('How would you like to create the PR?', choices);

      if (action === CANCEL) {
        warn('Submit cancelled.');
        return;
      }

      if (action === SQUASH_LOCAL) {
        await performSquashMerge(origin, baseBranch, currentBranch, {
          model: args.model,
          convention: config.commitConvention,
        });
        return;
      }

      if (action === 'Write title & body manually') {
        prTitle = await inputPrompt('PR title');
        prBody = await inputPrompt('PR body (markdown)');
      } else {
        // gh --fill
        const fillResult = await createPRFill(baseBranch, args.draft);
        if (fillResult.exitCode !== 0) {
          error(`Failed to create PR: ${fillResult.stderr}`);
          process.exit(1);
        }
        success(`✅ PR created: ${fillResult.stdout.trim()}`);
        return;
      }
    }

    if (!prTitle) {
      error('No PR title provided.');
      process.exit(1);
    }

    const prResult = await createPR({
      base: baseBranch,
      title: prTitle,
      body: prBody ?? '',
      draft: args.draft,
    });

    if (prResult.exitCode !== 0) {
      error(`Failed to create PR: ${prResult.stderr}`);
      process.exit(1);
    }

    success(`✅ PR created: ${prResult.stdout.trim()}`);
  },
});
