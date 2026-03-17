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
  assertCleanGitState,
  branchExists,
  checkoutBranch,
  commitWithMessage,
  createBranch,
  deleteRemoteBranch,
  determineRebaseStrategy,
  fetchAll,
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
  hasUncommittedChanges,
  isGitRepo,
  mergeSquash,
  pushBranch,
  pushSetUpstream,
  rebase,
  rebaseOnto,
  renameBranch,
  resetHard,
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
      while (!message) {
        const spinner = createSpinner('Generating AI commit message for squash merge...');
        const [stagedDiff, stagedFiles] = await Promise.all([getStagedDiff(), getStagedFiles()]);
        const aiMsg = await generateCommitMessage(
          stagedDiff,
          stagedFiles,
          options?.model,
          options?.convention ?? 'clean-commit',
          'squash-merge',
        );
        if (aiMsg) {
          message = aiMsg;
          spinner.success('AI commit message generated.');
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(message))}`);
          break;
        }

        spinner.fail('AI did not return a commit message.');

        const retryAction = await selectPrompt(
          'AI could not generate a commit message. What would you like to do?',
          ['Try again with AI', 'Write manually', 'Cancel'],
        );

        if (retryAction === 'Try again with AI') {
          continue;
        }

        if (retryAction === 'Cancel') {
          warn('Squash merge commit cancelled.');
          process.exit(0);
        }

        break;
      }
    } else {
      warn(`AI unavailable: ${copilotError}`);
    }
  }

  // Let user accept / edit / regenerate / write manually (same as contrib commit)
  let finalMsg: string | null = null;
  if (message) {
    while (!finalMsg) {
      const action = await selectPrompt('What would you like to do?', [
        'Accept this message',
        'Edit this message',
        'Regenerate',
        'Write manually',
      ]);

      if (action === 'Accept this message') {
        finalMsg = message;
      } else if (action === 'Edit this message') {
        finalMsg = await inputPrompt('Edit commit message', message);
      } else if (action === 'Regenerate') {
        const spinner = createSpinner('Regenerating commit message...');
        const [stagedDiff, stagedFiles] = await Promise.all([getStagedDiff(), getStagedFiles()]);
        const regen = await generateCommitMessage(
          stagedDiff,
          stagedFiles,
          options?.model,
          options?.convention ?? 'clean-commit',
          'squash-merge',
        );
        if (regen) {
          message = regen;
          spinner.success('Commit message regenerated.');
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(regen))}`);
          // Loop back to show the action menu again with the new message
        } else {
          spinner.fail('Regeneration failed.');
          // Keep the current suggestion and let the user choose again.
          continue;
        }
      } else {
        finalMsg = await inputPrompt('Enter commit message');
      }
    }
  } else {
    finalMsg = await inputPrompt('Commit message', `squash merge ${featureBranch}`);
  }

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

  // 6. Delete feature branch remotely (only if it exists on the remote)
  const remoteBranchRef = `${origin}/${featureBranch}`;
  const remoteExists = await branchExists(remoteBranchRef);
  if (remoteExists) {
    info(`Deleting remote branch ${pc.bold(featureBranch)}...`);
    const delRemote = await deleteRemoteBranch(origin, featureBranch);
    if (delRemote.exitCode !== 0) {
      warn(`Could not delete remote branch: ${delRemote.stderr.trim()}`);
    }
  }

  success(`Squash merged ${pc.bold(featureBranch)} into ${pc.bold(baseBranch)} and pushed.`);
  info(`Run ${pc.bold('contrib start')} to begin a new feature.`, '');
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
    pullrequest: {
      type: 'boolean',
      alias: 'pr',
      description: 'Submit directly to PR flow without prompting for mode',
      default: false,
    },
    local: {
      type: 'boolean',
      alias: 'l',
      description: 'Squash merge locally without PR (maintainers only)',
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

    // Guard: check for in-progress git operations, lock files, and shallow clone
    await assertCleanGitState('submitting');

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

    // 1. Verify not on a protected branch — offer recovery instead of hard stop
    if (protectedBranches.includes(currentBranch)) {
      heading('🚀 contrib submit');
      warn(
        `You're on ${pc.bold(currentBranch)}, which is a protected branch. PRs should come from feature branches.`,
      );

      // Check if the user has local commits or uncommitted changes worth saving
      await fetchAll();
      const remoteRef = `${origin}/${currentBranch}`;
      const localWork = await hasLocalWork(origin, currentBranch);
      const dirty = await hasUncommittedChanges();
      const hasCommits = localWork.unpushedCommits > 0;
      const hasAnything = hasCommits || dirty;

      if (!hasAnything) {
        error('No local changes or commits to move. Switch to a feature branch first.');
        info(`  Run ${pc.bold('contrib start')} to create a new feature branch.`, '');
        process.exit(1);
      }

      // Tell them what we found
      if (hasCommits) {
        info(
          `Found ${pc.bold(String(localWork.unpushedCommits))} unpushed commit${localWork.unpushedCommits !== 1 ? 's' : ''} on ${pc.bold(currentBranch)}.`,
        );
      }
      if (dirty) {
        info('You also have uncommitted changes in the working tree.');
      }

      console.log();

      const MOVE_BRANCH = 'Move my changes to a new feature branch';
      const CANCEL = 'Cancel (stay on this branch)';

      const action = await selectPrompt("Let's get you back on track. What would you like to do?", [
        MOVE_BRANCH,
        CANCEL,
      ]);

      if (action === CANCEL) {
        info('No changes made. You are still on your current branch.');
        return;
      }

      // ── Move to a new feature branch ──
      info(
        pc.dim(
          "Tip: Describe what you're going to work on in plain English and we'll generate a branch name.",
        ),
      );
      const description = await inputPrompt('What are you going to work on?');

      let newBranchName = description;
      if (looksLikeNaturalLanguage(description)) {
        const copilotError = await checkCopilotAvailable();
        if (!copilotError) {
          const spinner = createSpinner('Generating branch name suggestion...');
          const suggested = await suggestBranchName(description, args.model);
          if (suggested) {
            spinner.success('Branch name suggestion ready.');
            console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(suggested))}`);
            const accepted = await confirmPrompt(`Use ${pc.bold(suggested)} as your branch name?`);
            newBranchName = accepted
              ? suggested
              : await inputPrompt('Enter branch name', description);
          } else {
            spinner.fail('AI did not return a suggestion.');
            newBranchName = await inputPrompt('Enter branch name', description);
          }
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

      // Create the new branch from current HEAD (carries all commits + working tree)
      if (await branchExists(newBranchName)) {
        error(`Branch ${pc.bold(newBranchName)} already exists. Choose a different name.`);
        process.exit(1);
      }

      const branchResult = await createBranch(newBranchName);
      if (branchResult.exitCode !== 0) {
        error(`Failed to create branch: ${branchResult.stderr}`);
        process.exit(1);
      }
      success(`Created ${pc.bold(newBranchName)} with your changes.`);

      // Reset the protected branch back to its remote state
      // (We're now on the new branch, so this is safe)
      await updateLocalBranch(currentBranch, remoteRef);
      info(`Reset ${pc.bold(currentBranch)} back to ${pc.bold(remoteRef)} — no damage done.`, '');

      console.log();
      success(`You're now on ${pc.bold(newBranchName)} with all your work intact.`);
      info(`Run ${pc.bold('contrib submit')} again to push and create your PR.`, '');
      return;
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
                "Tip: Describe what you're going to work on in plain English and we'll generate a branch name.",
              ),
            );
            const description = await inputPrompt('What are you going to work on?');

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
            if (await branchExists(newBranchName)) {
              error(`Branch ${pc.bold(newBranchName)} already exists. Choose a different name.`);
              process.exit(1);
            }

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
              info(`  ${pc.bold('git rebase --continue')}`, '');
            } else {
              success(`Rebased ${pc.bold(newBranchName)} onto ${pc.bold(syncSource.ref)}.`);
            }

            info(
              `All your changes are preserved. Run ${pc.bold('contrib submit')} when ready to create a new PR.`,
              '',
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
        await resetHard('HEAD');
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

    // 2b. Check if an open PR already exists for this branch — just push and report.
    // This must happen BEFORE AI description generation and action prompts.
    // Otherwise the user gets walked through creating a new PR only to discover one already exists.
    if (ghInstalled && ghAuthed) {
      const existingPR = await getPRForBranch(currentBranch);
      if (existingPR) {
        info(`Pushing ${pc.bold(currentBranch)} to ${origin}...`);
        const pushResult = await pushSetUpstream(origin, currentBranch);
        if (pushResult.exitCode !== 0) {
          error(`Failed to push: ${pushResult.stderr}`);
          if (
            pushResult.stderr.includes('rejected') ||
            pushResult.stderr.includes('non-fast-forward')
          ) {
            warn('The remote branch has diverged. Try:');
            info(`  git pull --rebase ${origin} ${currentBranch}`, '');
            info('  Then run `contrib submit` again.', '');
          }
          process.exit(1);
        }
        success(`Pushed changes to existing PR #${existingPR.number}: ${pc.bold(existingPR.title)}`);
        console.log(`  ${pc.cyan(existingPR.url)}`);
        return;
      }
    }

    // 2c. Generate AI PR description (before pushing anything)
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

    // 2c. Action selection (loop to allow AI regeneration)
    const CANCEL = 'Cancel';
    const SQUASH_LOCAL = `Squash merge to ${baseBranch} locally (no PR)`;
    const REGENERATE = 'Regenerate AI description';

    // Tracks what the user decided to do
    type SubmitAction = 'create-pr' | 'fill' | 'cancel';
    let submitAction: SubmitAction = 'cancel';

    const isMaintainer = config.role === 'maintainer';

    if (args.pullrequest && args.local) {
      error(
        'Use only one submit mode flag at a time: --pullrequest/--pr/-pr or -l for local squash merge.',
      );
      process.exit(1);
    }

    if (args.local && !isMaintainer) {
      error('The -l flag is only available for maintainers. Contributors must submit via PR.');
      process.exit(1);
    }

    // For maintainers, ask the merge strategy first to avoid wasting tokens on
    // AI PR description generation when a local squash merge is preferred.
    if (args.local) {
      await performSquashMerge(origin, baseBranch, currentBranch, {
        model: args.model,
        convention: config.commitConvention,
      });
      return;
    }

    if (isMaintainer && !args.pullrequest) {
      const maintainerChoice = await selectPrompt(
        'How would you like to submit your changes?',
        ['Create a PR', SQUASH_LOCAL, CANCEL],
      );
      if (maintainerChoice === CANCEL) {
        warn('Submit cancelled.');
        return;
      }
      if (maintainerChoice === SQUASH_LOCAL) {
        await performSquashMerge(origin, baseBranch, currentBranch, {
          model: args.model,
          convention: config.commitConvention,
        });
        return;
      }
      // else: maintainer chose PR — fall through to AI generation + PR flow
    }

    if (!args['no-ai']) {
      await tryGenerateAI();
    }

    let actionResolved = false;
    while (!actionResolved) {
      if (prTitle && prBody) {
        const action = await selectPrompt(
          'What would you like to do with the PR description?',
          [
            'Use AI description',
            'Edit title',
            'Write manually',
            'Use gh --fill (auto-fill from commits)',
            REGENERATE,
            CANCEL,
          ],
        );

        if (action === CANCEL) {
          submitAction = 'cancel';
          actionResolved = true;
        } else if (action === REGENERATE) {
          prTitle = null;
          prBody = null;
          await tryGenerateAI();
          // loop again
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
        const choices: string[] = [];
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

    // Push branch (only for PR paths: 'create-pr' or 'fill')
    info(`Pushing ${pc.bold(currentBranch)} to ${origin}...`);
    const pushResult = await pushSetUpstream(origin, currentBranch);
    if (pushResult.exitCode !== 0) {
      error(`Failed to push: ${pushResult.stderr}`);
      if (
        pushResult.stderr.includes('rejected') ||
        pushResult.stderr.includes('non-fast-forward')
      ) {
        warn('The remote branch has diverged. Try:');
        info(`  git pull --rebase ${origin} ${currentBranch}`, '');
        info('  Then run `contrib submit` again.', '');
        info('If you need to force push (use with caution):', '');
        info(`  git push --force-with-lease ${origin} ${currentBranch}`, '');
      }
      process.exit(1);
    }

    // If gh CLI is not available, print manual PR URL
    if (!ghInstalled || !ghAuthed) {
      const repoInfo = await getRepoInfoFromRemote(origin);
      if (repoInfo) {
        const prUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/compare/${baseBranch}...${currentBranch}?expand=1`;
        console.log();
        info('Create your PR manually:', '');
        console.log(`  ${pc.cyan(prUrl)}`);
      } else {
        info('gh CLI not available. Create your PR manually on GitHub.', '');
      }
      return;
    }

    // Create the PR
    if (submitAction === 'fill') {
      const fillResult = await createPRFill(baseBranch, args.draft);
      if (fillResult.exitCode !== 0) {
        error(`Failed to create PR: ${fillResult.stderr}`);
        process.exit(1);
      }
      success(`PR created: ${fillResult.stdout.trim()}`);
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

    success(`PR created: ${prResult.stdout.trim()}`);
  },
});
