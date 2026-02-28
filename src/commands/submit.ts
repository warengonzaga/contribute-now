import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { CommitConvention } from '../types.js';
import {
  formatBranchName,
  hasPrefix,
  isValidBranchName,
  looksLikeNaturalLanguage,
} from '../utils/branch.js';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import {
  checkCopilotAvailable,
  generateCommitMessage,
  generatePRDescription,
  suggestBranchName,
} from '../utils/copilot.js';
import {
  checkGhAuth,
  checkGhInstalled,
  createPR,
  createPRFill,
  getMergedPRForBranch,
  getPRForBranch,
} from '../utils/gh.js';
import {
  checkoutBranch,
  commitWithMessage,
  deleteRemoteBranch,
  determineRebaseStrategy,
  fetchRemote,
  forceDeleteBranch,
  getCommitHash,
  getCurrentBranch,
  getLog,
  getLogDiff,
  getStagedDiff,
  getStagedFiles,
  getUpstreamRef,
  hasLocalWork,
  isGitRepo,
  mergeSquash,
  pushBranch,
  pushSetUpstream,
  rebase,
  rebaseOnto,
  renameBranch,
  unsetUpstream,
  updateLocalBranch,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { getRepoInfoFromRemote } from '../utils/remote.js';
import { createSpinner } from '../utils/spinner.js';
import { getBaseBranch, getProtectedBranches, getSyncSource } from '../utils/workflow.js';

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

    // 2a. Check if PR for this branch was already merged (before pushing)
    const ghInstalled = await checkGhInstalled();
    const ghAuthed = ghInstalled && (await checkGhAuth());

    if (ghInstalled && ghAuthed) {
      const mergedPR = await getMergedPRForBranch(currentBranch);
      if (mergedPR) {
        warn(`PR #${mergedPR.number} (${pc.bold(mergedPR.title)}) was already merged.`);

        // Check if user has local work that would be lost
        const localWork = await hasLocalWork(origin, currentBranch);
        const hasWork = localWork.uncommitted || localWork.unpushedCommits > 0;

        if (hasWork) {
          // Warn about local changes
          if (localWork.uncommitted) {
            warn('You have uncommitted changes in your working tree.');
          }
          if (localWork.unpushedCommits > 0) {
            warn(
              `You have ${pc.bold(String(localWork.unpushedCommits))} local commit${localWork.unpushedCommits !== 1 ? 's' : ''} not in the merged PR.`,
            );
          }

          const SAVE_NEW_BRANCH = 'Save changes to a new branch';
          const DISCARD = 'Discard all changes and clean up';
          const CANCEL = 'Cancel';

          const action = await selectPrompt(
            'This branch was merged but you have local changes. What would you like to do?',
            [SAVE_NEW_BRANCH, DISCARD, CANCEL],
          );

          if (action === CANCEL) {
            info('No changes made. You are still on your current branch.');
            return;
          }

          if (action === SAVE_NEW_BRANCH) {
            info(
              pc.dim(
                "Tip: Describe what you're working on in plain English and we'll generate a branch name.",
              ),
            );
            const description = await inputPrompt('What are you working on?');

            let newBranchName = description;
            if (!args['no-ai'] && looksLikeNaturalLanguage(description)) {
              const spinner = createSpinner('Generating branch name suggestion...');
              const suggested = await suggestBranchName(description, args.model);
              if (suggested) {
                spinner.success('Branch name suggestion ready.');
                console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(suggested))}`);
                const accepted = await confirmPrompt(
                  `Use ${pc.bold(suggested)} as your branch name?`,
                );
                newBranchName = accepted
                  ? suggested
                  : await inputPrompt('Enter branch name', description);
              } else {
                spinner.fail('AI did not return a suggestion.');
                newBranchName = await inputPrompt('Enter branch name', description);
              }
            }

            if (!hasPrefix(newBranchName, config.branchPrefixes)) {
              const prefix = await selectPrompt(
                `Choose a branch type for ${pc.bold(newBranchName)}:`,
                config.branchPrefixes,
              );
              newBranchName = formatBranchName(prefix, newBranchName);
            }

            if (!isValidBranchName(newBranchName)) {
              error(
                'Invalid branch name. Use only alphanumeric characters, dots, hyphens, underscores, and slashes.',
              );
              process.exit(1);
            }

            // Capture stale upstream hash BEFORE rename so we know where old work ends.
            // After a merged PR, commits before this point are already in the base branch.
            const staleUpstream = await getUpstreamRef();
            const staleUpstreamHash = staleUpstream ? await getCommitHash(staleUpstream) : null;

            // Rename branch preserves all commits + uncommitted changes
            const renameResult = await renameBranch(currentBranch, newBranchName);
            if (renameResult.exitCode !== 0) {
              error(`Failed to rename branch: ${renameResult.stderr}`);
              process.exit(1);
            }
            success(`Renamed ${pc.bold(currentBranch)} → ${pc.bold(newBranchName)}`);

            // Clear the stale upstream tracking (points to the old deleted remote branch)
            await unsetUpstream();

            // Rebase onto latest base branch so the saved work is up-to-date
            const syncSource = getSyncSource(config);
            info(`Syncing ${pc.bold(newBranchName)} with latest ${pc.bold(baseBranch)}...`);
            await fetchRemote(syncSource.remote);

            // If we captured the stale upstream hash, use --onto to only replay
            // commits after the old branch tip (skipping already-merged PR commits).
            let rebaseResult: { exitCode: number; stdout: string; stderr: string };
            if (staleUpstreamHash) {
              rebaseResult = await rebaseOnto(syncSource.ref, staleUpstreamHash);
            } else {
              const savedStrategy = await determineRebaseStrategy(newBranchName, syncSource.ref);
              rebaseResult =
                savedStrategy.strategy === 'onto' && savedStrategy.ontoOldBase
                  ? await rebaseOnto(syncSource.ref, savedStrategy.ontoOldBase)
                  : await rebase(syncSource.ref);
            }

            if (rebaseResult.exitCode !== 0) {
              warn('Rebase encountered conflicts. Resolve them manually, then run:');
              info(`  ${pc.bold('git rebase --continue')}`);
            } else {
              success(`Rebased ${pc.bold(newBranchName)} onto ${pc.bold(syncSource.ref)}.`);
            }

            info(
              `All your changes are preserved. Run ${pc.bold('contrib submit')} when ready to create a new PR.`,
            );
            return;
          }

          // DISCARD path: reset and clean up
          warn('Discarding local changes...');
        }

        // Auto-switch to base branch, sync, and delete stale feature branch
        const syncSource = getSyncSource(config);
        info(`Switching to ${pc.bold(baseBranch)} and syncing...`);
        await fetchRemote(syncSource.remote);
        const coResult = await checkoutBranch(baseBranch);
        if (coResult.exitCode !== 0) {
          error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
          process.exit(1);
        }
        await updateLocalBranch(baseBranch, syncSource.ref);
        success(`Synced ${pc.bold(baseBranch)} with ${pc.bold(syncSource.ref)}.`);

        // Delete the stale feature branch
        info(`Deleting stale branch ${pc.bold(currentBranch)}...`);
        const delResult = await forceDeleteBranch(currentBranch);
        if (delResult.exitCode === 0) {
          success(`Deleted ${pc.bold(currentBranch)}.`);
        } else {
          warn(`Could not delete branch: ${delResult.stderr.trim()}`);
        }

        console.log();
        info(
          `You're now on ${pc.bold(baseBranch)}. Run ${pc.bold('contrib start')} to begin a new feature.`,
        );
        return;
      }
    }

    // ─── Phase 1: Collect PR information ─────────────────────────────

    // 2b. Generate AI PR description (before pushing anything)
    let prTitle: string | null = null;
    let prBody: string | null = null;

    // Helper: attempt AI PR description generation
    async function tryGenerateAI(): Promise<void> {
      const [copilotError, commits, diff] = await Promise.all([
        checkCopilotAvailable(),
        getLog(baseBranch, 'HEAD'),
        getLogDiff(baseBranch, 'HEAD'),
      ]);
      if (!copilotError) {
        const spinner = createSpinner('Generating AI PR description...');
        const result = await generatePRDescription(
          commits,
          diff,
          args.model,
          config.commitConvention,
        );
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

    if (!args['no-ai']) {
      await tryGenerateAI();
    }

    // 2c. Action selection (loop to allow AI regeneration)
    const CANCEL = 'Cancel';
    const SQUASH_LOCAL = `Squash merge to ${baseBranch} locally (no PR)`;
    const REGENERATE = 'Regenerate AI description';

    // Tracks what the user decided to do
    type SubmitAction = 'create-pr' | 'fill' | 'squash' | 'cancel';
    let submitAction: SubmitAction = 'cancel';

    const isMaintainer = config.role === 'maintainer';

    let actionResolved = false;
    while (!actionResolved) {
      if (prTitle && prBody) {
        // Role-based ordering: maintainer gets squash merge near the top
        const choices: string[] = ['Use AI description'];
        if (isMaintainer) choices.push(SQUASH_LOCAL);
        choices.push(
          'Edit title',
          'Write manually',
          'Use gh --fill (auto-fill from commits)',
          REGENERATE,
          CANCEL,
        );

        const action = await selectPrompt(
          'What would you like to do with the PR description?',
          choices,
        );

        if (action === CANCEL) {
          submitAction = 'cancel';
          actionResolved = true;
        } else if (action === REGENERATE) {
          prTitle = null;
          prBody = null;
          await tryGenerateAI();
          // loop again
        } else if (action === SQUASH_LOCAL) {
          submitAction = 'squash';
          actionResolved = true;
        } else if (action === 'Use AI description') {
          submitAction = 'create-pr';
          actionResolved = true;
        } else if (action === 'Edit title') {
          prTitle = await inputPrompt('PR title', prTitle);
          submitAction = 'create-pr';
          actionResolved = true;
        } else if (action === 'Write manually') {
          prTitle = await inputPrompt('PR title');
          prBody = await inputPrompt('PR body (markdown)');
          submitAction = 'create-pr';
          actionResolved = true;
        } else {
          // gh --fill
          submitAction = 'fill';
          actionResolved = true;
        }
      } else {
        // Role-based ordering: maintainer gets squash merge at the top
        const choices: string[] = [];
        if (isMaintainer) choices.push(SQUASH_LOCAL);
        if (!args['no-ai']) choices.push(REGENERATE);
        choices.push(
          'Write title & body manually',
          'Use gh --fill (auto-fill from commits)',
          CANCEL,
        );

        const action = await selectPrompt('How would you like to create the PR?', choices);

        if (action === CANCEL) {
          submitAction = 'cancel';
          actionResolved = true;
        } else if (action === REGENERATE) {
          await tryGenerateAI();
          // loop again
        } else if (action === SQUASH_LOCAL) {
          submitAction = 'squash';
          actionResolved = true;
        } else if (action === 'Write title & body manually') {
          prTitle = await inputPrompt('PR title');
          prBody = await inputPrompt('PR body (markdown)');
          submitAction = 'create-pr';
          actionResolved = true;
        } else {
          // gh --fill
          submitAction = 'fill';
          actionResolved = true;
        }
      }
    }

    // ─── Phase 2: Execute ─────────────────────────────────────────────

    // Handle cancel (nothing pushed)
    if (submitAction === 'cancel') {
      warn('Submit cancelled.');
      return;
    }

    // Handle squash merge locally (has its own push logic)
    if (submitAction === 'squash') {
      await performSquashMerge(origin, baseBranch, currentBranch, {
        defaultMsg: prTitle ?? undefined,
        model: args.model,
        convention: config.commitConvention,
      });
      return;
    }

    // Push branch (only for PR paths: 'create-pr' or 'fill')
    info(`Pushing ${pc.bold(currentBranch)} to ${origin}...`);
    const pushResult = await pushSetUpstream(origin, currentBranch);
    if (pushResult.exitCode !== 0) {
      error(`Failed to push: ${pushResult.stderr}`);
      process.exit(1);
    }

    // If gh CLI is not available, print manual PR URL
    if (!ghInstalled || !ghAuthed) {
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

    // Check if a PR already exists for this branch (after push)
    const existingPR = await getPRForBranch(currentBranch);
    if (existingPR) {
      success(`Pushed changes to existing PR #${existingPR.number}: ${pc.bold(existingPR.title)}`);
      console.log(`  ${pc.cyan(existingPR.url)}`);
      return;
    }

    // Create the PR
    if (submitAction === 'fill') {
      const fillResult = await createPRFill(baseBranch, args.draft);
      if (fillResult.exitCode !== 0) {
        error(`Failed to create PR: ${fillResult.stderr}`);
        process.exit(1);
      }
      success(`✅ PR created: ${fillResult.stdout.trim()}`);
      return;
    }

    // submitAction === 'create-pr'
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
