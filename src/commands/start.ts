import { defineCommand } from 'citty';
import pc from 'picocolors';
import { promptForBranchName } from '../utils/branchPrompt.js';
import { isAIEnabled, readConfig } from '../utils/config.js';
import { confirmPrompt } from '../utils/confirm.js';
import {
  assertCleanGitState,
  countCommitsAhead,
  createBranch,
  fetchRemote,
  getCurrentBranch,
  hasUncommittedChanges,
  isGitRepo,
  refExists,
  updateLocalBranch,
} from '../utils/git.js';
import { error, info, projectHeading, success, warn } from '../utils/logger.js';
import { getBaseBranch, getSyncSource } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'start',
    description: 'Create a new feature branch from the latest base branch',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Branch name or description (prompted if omitted)',
      required: false,
    },
    model: {
      type: 'string',
      description: 'AI model to use for branch name suggestion',
    },
    'no-ai': {
      type: 'boolean',
      description: 'Skip AI branch name suggestion',
      default: false,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    // Guard: check for in-progress git operations, lock files, and shallow clone
    await assertCleanGitState('starting a new branch');

    const config = readConfig();
    if (!config) {
      error('No repo config found. Run `cn setup` first.');
      process.exit(1);
    }

    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them before creating a branch.');
      process.exit(1);
    }

    const { branchPrefixes } = config;
    const baseBranch = getBaseBranch(config);
    const syncSource = getSyncSource(config);
    let branchName = args.name?.trim();

    await projectHeading('start', '🌿');

    branchName = await promptForBranchName({
      initialValue: branchName,
      branchPrefixes,
      useAI: isAIEnabled(config, args['no-ai']),
      model: args.model,
    });

    if (!branchName) {
      warn('Start cancelled.');
      process.exit(0);
    }

    info(`Creating branch: ${pc.bold(branchName)}`);

    // Silently sync base branch first
    await fetchRemote(syncSource.remote);

    // Validate that the remote sync ref exists before using it
    if (!(await refExists(syncSource.ref))) {
      warn(
        `Remote ref ${pc.bold(syncSource.ref)} not found. Creating branch from local ${pc.bold(baseBranch)}.`,
      );
    }

    // Guard: if the user is sitting on the base branch and has local commits
    // that would be destroyed by the hard-reset path, warn before proceeding.
    const currentBranch = await getCurrentBranch();
    if (currentBranch === baseBranch && (await refExists(syncSource.ref))) {
      const ahead = await countCommitsAhead(baseBranch, syncSource.ref);
      if (ahead > 0) {
        warn(
          `You are on ${pc.bold(baseBranch)} with ${pc.bold(String(ahead))} local commit${ahead > 1 ? 's' : ''} not in ${pc.bold(syncSource.ref)}.`,
        );
        info(
          '  Syncing will discard those commits. Consider backing them up first (e.g. create a branch).',
        );
        const proceed = await confirmPrompt('Discard local commits and sync to remote?');
        if (!proceed) {
          info('Aborted. Your local commits are untouched.');
          process.exit(0);
        }
      }
    }

    // Update local base branch ref to match remote (without switching to it)
    const updateResult = await updateLocalBranch(baseBranch, syncSource.ref);
    if (updateResult.exitCode !== 0) {
      // If the local base branch doesn't exist, try creating from the remote ref directly
      if (await refExists(syncSource.ref)) {
        const result = await createBranch(branchName, syncSource.ref);
        if (result.exitCode !== 0) {
          error(`Failed to create branch: ${result.stderr}`);
          process.exit(1);
        }
        success(`Created ${pc.bold(branchName)} from ${pc.bold(syncSource.ref)}`);
        return;
      }
      error(`Failed to update ${pc.bold(baseBranch)}: ${updateResult.stderr}`);
      info('Make sure your base branch exists locally or the remote ref is available.', '');
      process.exit(1);
    }

    // Create branch from base
    const result = await createBranch(branchName, baseBranch);
    if (result.exitCode !== 0) {
      error(`Failed to create branch: ${result.stderr}`);
      process.exit(1);
    }

    success(`Created ${pc.bold(branchName)} from latest ${pc.bold(baseBranch)}`);
  },
});
