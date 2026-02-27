import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { inputPrompt, selectPrompt } from '../utils/confirm.js';
import { checkCopilotAvailable, suggestConflictResolution } from '../utils/copilot.js';
import { getMergedPRForBranch } from '../utils/gh.js';
import {
  checkoutBranch,
  fetchRemote,
  forceDeleteBranch,
  getChangedFiles,
  getCurrentBranch,
  hasLocalWork,
  hasUncommittedChanges,
  isGitRepo,
  rebase,
  renameBranch,
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
      error(
        `Use \`contrib sync\` to update ${protectedBranches.map((b) => pc.bold(b)).join(' or ')} branches.`,
      );
      process.exit(1);
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
      warn(
        `PR #${mergedPR.number} (${pc.bold(mergedPR.title)}) has already been merged.`,
      );
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
          const suggestedName = currentBranch.replace(
            /^(feature|fix|docs|chore|test|refactor)\//,
            '$1/new-',
          );
          const newBranchName = await inputPrompt(
            'New branch name',
            suggestedName !== currentBranch ? suggestedName : `${currentBranch}-v2`,
          );

          const renameResult = await renameBranch(currentBranch, newBranchName);
          if (renameResult.exitCode !== 0) {
            error(`Failed to rename branch: ${renameResult.stderr}`);
            process.exit(1);
          }
          success(`Renamed ${pc.bold(currentBranch)} → ${pc.bold(newBranchName)}`);

          // Rebase onto latest base so saved work is up-to-date
          await fetchRemote(syncSource.remote);
          const rebaseResult = await rebase(syncSource.ref);
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

    // 5. git rebase base branch
    const rebaseResult = await rebase(baseBranch);

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
