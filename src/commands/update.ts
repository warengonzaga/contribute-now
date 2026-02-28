import { readFileSync } from 'node:fs';
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
import {
  checkCopilotAvailable,
  suggestBranchName,
  suggestConflictResolution,
} from '../utils/copilot.js';
import { getMergedPRForBranch } from '../utils/gh.js';
import {
  checkoutBranch,
  createBranch,
  determineRebaseStrategy,
  fetchAll,
  fetchRemote,
  forceDeleteBranch,
  getChangedFiles,
  getCommitHash,
  getCurrentBranch,
  getUpstreamRef,
  hasLocalWork,
  hasUncommittedChanges,
  isGitRepo,
  rebase,
  rebaseOnto,
  renameBranch,
  unsetUpstream,
  updateLocalBranch,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import { getBaseBranch, getProtectedBranches, getSyncSource } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Rebase current branch onto the latest base branch',
  },
  args: {
    model: {
      type: 'string',
      description: 'AI model to use for conflict resolution suggestions',
    },
    'no-ai': {
      type: 'boolean',
      description: 'Skip AI conflict resolution suggestions',
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

    const baseBranch = getBaseBranch(config);
    const protectedBranches = getProtectedBranches(config);
    const syncSource = getSyncSource(config);

    // 1. Verify not on a protected branch
    const currentBranch = await getCurrentBranch();
    if (!currentBranch) {
      error('Could not determine current branch.');
      process.exit(1);
    }

    if (protectedBranches.includes(currentBranch)) {
      heading('🔃 contrib update');
      warn(
        `You're on ${pc.bold(currentBranch)}, which is a protected branch. Updates (rebase) apply to feature branches.`,
      );

      // Check if the user has local commits or uncommitted changes worth saving
      await fetchAll();
      const { origin } = config;
      const remoteRef = `${origin}/${currentBranch}`;
      const localWork = await hasLocalWork(origin, currentBranch);
      const dirty = await hasUncommittedChanges();
      const hasCommits = localWork.unpushedCommits > 0;
      const hasAnything = hasCommits || dirty;

      if (!hasAnything) {
        info(`No local changes found on ${pc.bold(currentBranch)}.`);
        info(`Use ${pc.bold('contrib sync')} to sync protected branches, or ${pc.bold('contrib start')} to create a feature branch.`);
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

      const action = await selectPrompt(
        "Let's get you back on track. What would you like to do?",
        [MOVE_BRANCH, CANCEL],
      );

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
      if (!args['no-ai'] && looksLikeNaturalLanguage(description)) {
        const copilotError = await checkCopilotAvailable();
        if (!copilotError) {
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
      const branchResult = await createBranch(newBranchName);
      if (branchResult.exitCode !== 0) {
        error(`Failed to create branch: ${branchResult.stderr}`);
        process.exit(1);
      }
      success(`Created ${pc.bold(newBranchName)} with your changes.`);

      // Reset the protected branch back to its remote state
      await updateLocalBranch(currentBranch, remoteRef);
      info(
        `Reset ${pc.bold(currentBranch)} back to ${pc.bold(remoteRef)} — no damage done.`,
      );

      console.log();
      success(`You're now on ${pc.bold(newBranchName)} with all your work intact.`);
      info(`Run ${pc.bold('contrib update')} again to rebase onto latest ${pc.bold(baseBranch)}.`);
      return;
    }

    // 2. Check for uncommitted changes
    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them first.');
      process.exit(1);
    }

    heading('🔃 contrib update');

    // 3. Check if the branch's PR has already been merged (stale branch)
    const mergedPR = await getMergedPRForBranch(currentBranch);
    if (mergedPR) {
      warn(`PR #${mergedPR.number} (${pc.bold(mergedPR.title)}) has already been merged.`);
      info(`Link: ${pc.underline(mergedPR.url)}`);

      const localWork = await hasLocalWork(syncSource.remote, currentBranch);
      const hasWork = localWork.uncommitted || localWork.unpushedCommits > 0;

      if (hasWork) {
        if (localWork.uncommitted) {
          info('You have uncommitted local changes.');
        }
        if (localWork.unpushedCommits > 0) {
          info(`You have ${localWork.unpushedCommits} unpushed commit(s).`);
        }

        const SAVE_NEW_BRANCH = 'Save changes to a new branch';
        const DISCARD = 'Discard all changes and clean up';
        const CANCEL = 'Cancel';

        const action = await selectPrompt(
          `${pc.bold(currentBranch)} is stale but has local work. What would you like to do?`,
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
          // Only commits after this point (user's new work) need to be replayed.
          const staleUpstream = await getUpstreamRef();
          const staleUpstreamHash = staleUpstream ? await getCommitHash(staleUpstream) : null;

          const renameResult = await renameBranch(currentBranch, newBranchName);
          if (renameResult.exitCode !== 0) {
            error(`Failed to rename branch: ${renameResult.stderr}`);
            process.exit(1);
          }
          success(`Renamed ${pc.bold(currentBranch)} → ${pc.bold(newBranchName)}`);

          // Clear the stale upstream tracking (points to the old deleted remote branch)
          await unsetUpstream();

          // Rebase onto latest base so saved work is up-to-date.
          await fetchRemote(syncSource.remote);

          // If we captured the stale upstream hash, use --onto to only replay
          // commits after the old branch tip (skipping already-merged PR commits).
          // Otherwise fall back to smart strategy detection.
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

        // DISCARD path
        warn('Discarding local changes...');
      }

      // No local work or user chose discard — switch to base, sync, delete stale branch
      await fetchRemote(syncSource.remote);
      const coResult = await checkoutBranch(baseBranch);
      if (coResult.exitCode !== 0) {
        error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
        process.exit(1);
      }
      await updateLocalBranch(baseBranch, syncSource.ref);
      success(`Synced ${pc.bold(baseBranch)} with ${pc.bold(syncSource.ref)}.`);

      info(`Deleting stale branch ${pc.bold(currentBranch)}...`);
      await forceDeleteBranch(currentBranch);
      success(`Deleted ${pc.bold(currentBranch)}.`);

      info(`Run ${pc.bold('contrib start')} to begin a new feature branch.`);
      return;
    }

    info(`Updating ${pc.bold(currentBranch)} with latest ${pc.bold(baseBranch)}...`);

    // 4. Fetch + update local base branch ref (without switching to it)
    await fetchRemote(syncSource.remote);
    await updateLocalBranch(baseBranch, syncSource.ref);

    // 5. Smart rebase: determine whether plain rebase or --onto is needed.
    //    Uses merge-base analysis to avoid false conflicts:
    //    - Plain rebase: branch was created from (or tracks) the base branch
    //    - --onto rebase: branch was based on another feature branch that's since been merged
    const rebaseStrategy = await determineRebaseStrategy(currentBranch, syncSource.ref);

    if (rebaseStrategy.strategy === 'onto' && rebaseStrategy.ontoOldBase) {
      info(pc.dim(`Using --onto rebase (branch was based on a different ref)`));
    }

    const rebaseResult =
      rebaseStrategy.strategy === 'onto' && rebaseStrategy.ontoOldBase
        ? await rebaseOnto(syncSource.ref, rebaseStrategy.ontoOldBase)
        : await rebase(syncSource.ref);

    if (rebaseResult.exitCode !== 0) {
      // 6. On conflict: AI suggestions
      warn('Rebase hit conflicts. Resolve them manually.');
      console.log();

      if (!args['no-ai']) {
        const copilotError = await checkCopilotAvailable();
        if (!copilotError) {
          info('Fetching AI conflict resolution suggestions...');
          const conflictFiles = await getChangedFiles();
          let conflictDiff = '';
          for (const file of conflictFiles.slice(0, 3)) {
            try {
              const content = readFileSync(file, 'utf-8');
              if (content.includes('<<<<<<<')) {
                conflictDiff += `\n--- ${file} ---\n${content.slice(0, 2000)}\n`;
              }
            } catch {
              // skip unreadable files
            }
          }

          if (conflictDiff) {
            const spinner = createSpinner('Analyzing conflicts with AI...');
            const suggestion = await suggestConflictResolution(conflictDiff, args.model);
            if (suggestion) {
              spinner.success('AI conflict guidance ready.');
              console.log(`\n${pc.bold('💡 AI Conflict Resolution Guidance:')}`);
              console.log(pc.dim('─'.repeat(60)));
              console.log(suggestion);
              console.log(pc.dim('─'.repeat(60)));
              console.log();
            } else {
              spinner.fail('AI could not analyze the conflicts.');
            }
          }
        }
      }

      console.log(pc.bold('To resolve:'));
      console.log(`  1. Fix conflicts in the affected files`);
      console.log(`  2. ${pc.cyan('git add <resolved-files>')}`);
      console.log(`  3. ${pc.cyan('git rebase --continue')}`);
      console.log();
      console.log(`  Or abort: ${pc.cyan('git rebase --abort')}`);
      process.exit(1);
    }

    success(`✅ ${pc.bold(currentBranch)} has been rebased onto latest ${pc.bold(baseBranch)}`);
  },
});
