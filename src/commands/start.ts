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
  createBranch,
  fetchRemote,
  hasUncommittedChanges,
  isGitRepo,
  updateLocalBranch,
} from '../utils/git.js';
import { error, heading, info, success } from '../utils/logger.js';
import { getBaseBranch, getSyncSource } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'start',
    description: 'Create a new feature branch from the latest base branch',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Branch name or description',
      required: true,
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

    const config = readConfig();
    if (!config) {
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them before creating a branch.');
      process.exit(1);
    }

    const { branchPrefixes } = config;
    const baseBranch = getBaseBranch(config);
    const syncSource = getSyncSource(config);
    let branchName = args.name;

    heading('🌿 contrib start');

    // AI enhancement: if name looks like natural language, suggest a branch name
    const useAI = !args['no-ai'] && looksLikeNaturalLanguage(branchName);
    if (useAI) {
      info('Generating branch name suggestion from description...');
      const suggested = await suggestBranchName(branchName, args.model);
      if (suggested) {
        console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(suggested))}`);
        const accepted = await confirmPrompt(`Use ${pc.bold(suggested)} as your branch name?`);
        if (accepted) {
          branchName = suggested;
        } else {
          branchName = await inputPrompt('Enter branch name', branchName);
        }
      }
    }

    // If no prefix, prompt for type
    if (!hasPrefix(branchName, branchPrefixes)) {
      const prefix = await selectPrompt(
        `Choose a branch type for ${pc.bold(branchName)}:`,
        branchPrefixes,
      );
      branchName = formatBranchName(prefix, branchName);
    }

    // Validate final branch name before any git operations
    if (!isValidBranchName(branchName)) {
      error(
        'Invalid branch name. Use only alphanumeric characters, dots, hyphens, underscores, and slashes.',
      );
      process.exit(1);
    }

    info(`Creating branch: ${pc.bold(branchName)}`);

    // Silently sync base branch first
    await fetchRemote(syncSource.remote);

    // Update local base branch ref to match remote (without switching to it)
    const updateResult = await updateLocalBranch(baseBranch, syncSource.ref);
    if (updateResult.exitCode !== 0) {
      // Base may not exist locally yet; branch will be created from remote ref directly
    }

    // Create branch from base
    const result = await createBranch(branchName, baseBranch);
    if (result.exitCode !== 0) {
      error(`Failed to create branch: ${result.stderr}`);
      process.exit(1);
    }

    success(`✅ Created ${pc.bold(branchName)} from latest ${pc.bold(baseBranch)}`);
  },
});
