import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, selectPrompt } from '../utils/confirm.js';
import {
  assertCleanGitState,
  checkoutBranch,
  deleteRemoteBranch,
  forceDeleteBranch,
  getCurrentBranch,
  getUpstreamRef,
  hasLocalWork,
  isGitRepo,
  stashChanges,
} from '../utils/git.js';
import { error, info, projectHeading, success, warn } from '../utils/logger.js';
import { getBaseBranch, isBranchProtected } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'discard',
    description: 'Discard the current feature branch and return to the base branch',
  },
  args: {
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Skip confirmation and discard immediately',
      default: false,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    await assertCleanGitState('discarding a branch');

    const config = readConfig();
    if (!config) {
      error('No repo config found. Run `contrib setup` first.');
      process.exit(1);
    }

    const currentBranch = await getCurrentBranch();
    const baseBranch = getBaseBranch(config);

    await projectHeading('discard', '🗑️');

    // Guard: refuse to discard protected branches (main, dev, develop, etc.)
    if (isBranchProtected(currentBranch, config)) {
      error(
        `${pc.bold(currentBranch)} is a protected branch and cannot be discarded.`,
      );
      info(`Switch to a feature branch first, then run ${pc.bold('contrib discard')}.`);
      process.exit(1);
    }

    // Guard: already on the base branch
    if (currentBranch === baseBranch) {
      info(`You are already on ${pc.bold(baseBranch)}.`);
      process.exit(0);
    }

    // Check for local work that would be lost
    const { origin } = config;
    const localWork = await hasLocalWork(origin, currentBranch);
    const hasWork = localWork.uncommitted || localWork.unpushedCommits > 0;

    if (hasWork) {
      if (localWork.uncommitted) {
        warn('You have uncommitted changes in your working tree.');
      }
      if (localWork.unpushedCommits > 0) {
        warn(
          `You have ${pc.bold(String(localWork.unpushedCommits))} unpushed commit${localWork.unpushedCommits !== 1 ? 's' : ''} on this branch.`,
        );
      }
      warn('Discarding this branch will permanently lose that work.');

      const SAVE_FIRST = 'Save my changes first (cn save), then discard';
      const DISCARD_ANYWAY = 'Discard anyway — I do not need this work';
      const CANCEL = 'Keep the branch, take me back';

      const action = await selectPrompt(
        'This branch has unsaved work. What would you like to do?',
        [SAVE_FIRST, DISCARD_ANYWAY, CANCEL],
      );

      if (action === CANCEL) {
        info('Discard cancelled. Your branch is untouched.');
        process.exit(0);
      }

      if (action === SAVE_FIRST) {
        if (!localWork.uncommitted) {
          info('No uncommitted changes to stash — unpushed commits will still be lost.');
          const confirm = await confirmPrompt('Continue discarding the branch?');
          if (!confirm) {
            info('Discard cancelled.');
            process.exit(0);
          }
        } else {
          const stashResult = await stashChanges(`work-in-progress on ${currentBranch}`);
          if (stashResult.exitCode !== 0) {
            error(`Failed to save changes: ${stashResult.stderr}`);
            process.exit(1);
          }
          success(`Changes saved. Use ${pc.bold('contrib save --restore')} to bring them back.`);
        }
      }
    } else if (!args.force) {
      // No unsaved work — still confirm unless --force is passed
      const confirmed = await confirmPrompt(
        `Discard ${pc.bold(currentBranch)} and return to ${pc.bold(baseBranch)}?`,
      );
      if (!confirmed) {
        info('Discard cancelled.');
        process.exit(0);
      }
    }

    // Check if there is a remote tracking branch to offer deletion
    const upstreamRef = await getUpstreamRef();
    let deleteRemote = false;
    if (upstreamRef) {
      deleteRemote = await confirmPrompt(
        `Also delete the remote branch ${pc.bold(upstreamRef)}?`,
      );
    }

    // Switch to base branch first
    const checkoutResult = await checkoutBranch(baseBranch);
    if (checkoutResult.exitCode !== 0) {
      error(`Failed to switch to ${pc.bold(baseBranch)}: ${checkoutResult.stderr}`);
      process.exit(1);
    }

    // Force-delete the feature branch locally
    // (force-delete is required since the branch may not be merged)
    const deleteResult = await forceDeleteBranch(currentBranch);
    if (deleteResult.exitCode !== 0) {
      error(`Failed to delete branch ${pc.bold(currentBranch)}: ${deleteResult.stderr}`);
      process.exit(1);
    }

    success(`Discarded ${pc.bold(currentBranch)} and switched back to ${pc.bold(baseBranch)}`);

    // Optionally delete remote branch
    if (deleteRemote) {
      const remoteDeleteResult = await deleteRemoteBranch(origin, currentBranch);
      if (remoteDeleteResult.exitCode !== 0) {
        warn(`Could not delete remote branch: ${remoteDeleteResult.stderr.trim()}`);
      } else {
        success(`Deleted remote branch ${pc.bold(`${origin}/${currentBranch}`)}`);
      }
    }
  },
});
