import { defineCommand } from 'citty';
import pc from 'picocolors';
import {
  formatBranchName,
  hasPrefix,
  isValidBranchName,
  looksLikeNaturalLanguage,
} from '../utils/branch.js';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import { suggestBranchName } from '../utils/copilot.js';
import {
  checkGhAuth,
  checkGhInstalled,
  getMergedPRForBranch,
} from '../utils/gh.js';
import {
  deleteBranch,
  fetchRemote,
  forceDeleteBranch,
  getCurrentBranch,
  getGoneBranches,
  getMergedBranches,
  getUpstreamRef,
  hasLocalWork,
  isGitRepo,
  pruneRemote,
  rebase,
  rebaseOnto,
  renameBranch,
  updateLocalBranch,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { getBaseBranch, getProtectedBranches, getSyncSource } from '../utils/workflow.js';

/**
 * If the user is on a branch that's about to be deleted, check for
 * local work and either save it to a new branch or switch to base.
 * Returns 'switched' if we moved to base, 'saved' if renamed, 'skipped' if cancelled.
 */
async function handleCurrentBranchDeletion(
  currentBranch: string,
  baseBranch: string,
  config: ReturnType<typeof readConfig>,
): Promise<'switched' | 'saved' | 'skipped'> {
  if (!config) return 'skipped';

  const { origin } = config;
  const localWork = await hasLocalWork(origin, currentBranch);
  const hasWork = localWork.uncommitted || localWork.unpushedCommits > 0;

  if (hasWork) {
    if (localWork.uncommitted) {
      warn('You have uncommitted changes in your working tree.');
    }
    if (localWork.unpushedCommits > 0) {
      warn(
        `You have ${pc.bold(String(localWork.unpushedCommits))} local commit${localWork.unpushedCommits !== 1 ? 's' : ''} not pushed.`,
      );
    }

    const SAVE_NEW_BRANCH = 'Save changes to a new branch';
    const DISCARD = 'Discard all changes and clean up';
    const CANCEL = 'Skip this branch';

    const action = await selectPrompt(
      `${pc.bold(currentBranch)} has local changes. What would you like to do?`,
      [SAVE_NEW_BRANCH, DISCARD, CANCEL],
    );

    if (action === CANCEL) return 'skipped';

    if (action === SAVE_NEW_BRANCH) {
      if (!config) return 'skipped';
      info(pc.dim("Tip: Describe what you're working on in plain English and we'll generate a branch name."));
      const description = await inputPrompt('What are you working on?');

      let newBranchName = description;
      if (looksLikeNaturalLanguage(description)) {
        const spinner = createSpinner('Generating branch name suggestion...');
        const suggested = await suggestBranchName(description);
        if (suggested) {
          spinner.success('Branch name suggestion ready.');
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(suggested))}`);
          const accepted = await confirmPrompt(`Use ${pc.bold(suggested)} as your branch name?`);
          newBranchName = accepted ? suggested : await inputPrompt('Enter branch name', description);
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
        error('Invalid branch name. Use only alphanumeric characters, dots, hyphens, underscores, and slashes.');
        return 'skipped';
      }

      const renameResult = await renameBranch(currentBranch, newBranchName);
      if (renameResult.exitCode !== 0) {
        error(`Failed to rename branch: ${renameResult.stderr}`);
        return 'skipped';
      }
      success(`Renamed ${pc.bold(currentBranch)} → ${pc.bold(newBranchName)}`);

      // Rebase saved branch onto latest base so the work is up-to-date
      const syncSource = getSyncSource(config);
      await fetchRemote(syncSource.remote);
      const savedUpstreamRef = await getUpstreamRef();
      const rebaseResult =
        savedUpstreamRef && savedUpstreamRef !== syncSource.ref
          ? await rebaseOnto(syncSource.ref, savedUpstreamRef)
          : await rebase(syncSource.ref);
      if (rebaseResult.exitCode !== 0) {
        warn('Rebase encountered conflicts. Resolve them after cleanup:');
        info(`  ${pc.bold(`git checkout ${newBranchName} && git rebase --continue`)}`);
      } else {
        success(`Rebased ${pc.bold(newBranchName)} onto ${pc.bold(syncSource.ref)}.`);
      }

      // Now switch to base so we can continue cleaning
      const coResult = await checkoutBranch(baseBranch);
      if (coResult.exitCode !== 0) {
        error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
        return 'saved';
      }
      await updateLocalBranch(baseBranch, syncSource.ref);
      success(`Synced ${pc.bold(baseBranch)} with ${pc.bold(syncSource.ref)}.`);
      return 'saved';
    }
  }

  // No local work or user chose discard — switch to base and allow deletion
  const syncSource = getSyncSource(config);
  info(`Switching to ${pc.bold(baseBranch)} and syncing...`);
  await fetchRemote(syncSource.remote);
  const coResult = await checkoutBranch(baseBranch);
  if (coResult.exitCode !== 0) {
    error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
    return 'skipped';
  }
  await updateLocalBranch(baseBranch, syncSource.ref);
  success(`Synced ${pc.bold(baseBranch)} with ${pc.bold(syncSource.ref)}.`);
  return 'switched';
}

export default defineCommand({
  meta: {
    name: 'clean',
    description: 'Delete merged branches and prune remote refs',
  },
  args: {
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'Skip confirmation prompt',
      default: false,
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
    let currentBranch = await getCurrentBranch();

    heading('🧹 contrib clean');

    // 1. Prune remote refs first (so we can detect gone branches)
    info(`Pruning ${origin} remote refs...`);
    const pruneResult = await pruneRemote(origin);
    if (pruneResult.exitCode === 0) {
      success(`Pruned ${origin} remote refs.`);
    } else {
      warn(`Could not prune remote: ${pruneResult.stderr.trim()}`);
    }

    // Protected branches should never be deleted (but current branch CAN be if it's stale)
    const protectedBranches = new Set(getProtectedBranches(config));

    // 2. Detect branches merged via real merge commits
    const mergedBranches = await getMergedBranches(baseBranch);
    const mergedCandidates = mergedBranches.filter((b) => !protectedBranches.has(b));

    // 3. Detect branches whose remote was deleted (squash-merged on GitHub)
    const goneBranches = await getGoneBranches();
    const goneCandidates = goneBranches.filter(
      (b) => !protectedBranches.has(b) && !mergedCandidates.includes(b),
    );

    // 4. GitHub-aware check: detect if current branch's PR was merged (catches squash-merges
    //    where the remote branch still exists or git hasn't detected [gone] yet)
    if (
      currentBranch &&
      !protectedBranches.has(currentBranch) &&
      !mergedCandidates.includes(currentBranch) &&
      !goneCandidates.includes(currentBranch)
    ) {
      const ghInstalled = await checkGhInstalled();
      const ghAuthed = ghInstalled && (await checkGhAuth());
      if (ghInstalled && ghAuthed) {
        const mergedPR = await getMergedPRForBranch(currentBranch);
        if (mergedPR) {
          warn(`PR #${mergedPR.number} (${pc.bold(mergedPR.title)}) has already been merged.`);
          info(`Link: ${pc.underline(mergedPR.url)}`);
          goneCandidates.push(currentBranch);
        }
      }
    }


    if (mergedCandidates.length > 0) {
      console.log(`\n${pc.bold('Merged branches to delete:')}`);
      for (const b of mergedCandidates) {
        const marker = b === currentBranch ? pc.yellow(' (current)') : '';
        console.log(`  ${pc.dim('•')} ${b}${marker}`);
      }
      console.log();

      const ok =
        args.yes ||
        (await confirmPrompt(
          `Delete ${pc.bold(String(mergedCandidates.length))} merged branch${mergedCandidates.length !== 1 ? 'es' : ''}?`,
        ));
      if (ok) {
        for (const branch of mergedCandidates) {
          if (branch === currentBranch) {
            const result = await handleCurrentBranchDeletion(currentBranch, baseBranch, config);
            if (result === 'skipped') {
              warn(`  Skipped ${branch}.`);
              continue;
            }
            if (result === 'saved') {
              // Branch was renamed — old name no longer exists, skip deletion
              currentBranch = baseBranch;
              continue;
            }
            currentBranch = baseBranch;
          }
          const result = await deleteBranch(branch);
          if (result.exitCode === 0) {
            success(`  Deleted ${pc.bold(branch)}`);
          } else {
            warn(`  Failed to delete ${branch}: ${result.stderr.trim()}`);
          }
        }
      } else {
        info('Skipped merged branch deletion.');
      }
    }

    // 5. Delete stale branches (remote gone — likely squash-merged on GitHub)
    if (goneCandidates.length > 0) {
      console.log(`\n${pc.bold('Stale branches (remote deleted, likely squash-merged):')}`);
      for (const b of goneCandidates) {
        const marker = b === currentBranch ? pc.yellow(' (current)') : '';
        console.log(`  ${pc.dim('•')} ${b}${marker}`);
      }
      console.log();

      const ok =
        args.yes ||
        (await confirmPrompt(
          `Delete ${pc.bold(String(goneCandidates.length))} stale branch${goneCandidates.length !== 1 ? 'es' : ''}?`,
        ));
      if (ok) {
        for (const branch of goneCandidates) {
          if (branch === currentBranch) {
            const result = await handleCurrentBranchDeletion(currentBranch, baseBranch, config);
            if (result === 'skipped') {
              warn(`  Skipped ${branch}.`);
              continue;
            }
            if (result === 'saved') {
              // Branch was renamed — old name no longer exists, skip deletion
              currentBranch = baseBranch;
              continue;
            }
            currentBranch = baseBranch;
          }
          // Force delete needed — git doesn't know squash merges happened
          const result = await forceDeleteBranch(branch);
          if (result.exitCode === 0) {
            success(`  Deleted ${pc.bold(branch)}`);
          } else {
            warn(`  Failed to delete ${branch}: ${result.stderr.trim()}`);
          }
        }
      } else {
        info('Skipped stale branch deletion.');
      }
    }

    if (mergedCandidates.length === 0 && goneCandidates.length === 0) {
      info('No branches to clean up. Everything is tidy! 🧹');
    }

    // Final guidance
    const finalBranch = await getCurrentBranch();
    if (finalBranch && protectedBranches.has(finalBranch)) {
      console.log();
      info(`You're on ${pc.bold(finalBranch)}. Run ${pc.bold('contrib start')} to begin a new feature.`);
    }
  },
});
