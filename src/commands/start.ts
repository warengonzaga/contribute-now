import { defineCommand } from 'citty';
import pc from 'picocolors';
import { formatBranchName, hasPrefix, looksLikeNaturalLanguage } from '../utils/branch.js';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import { suggestBranchName } from '../utils/copilot.js';
import {
  createBranch,
  fetchRemote,
  hasUncommittedChanges,
  isGitRepo,
  resetHard,
} from '../utils/git.js';
import { error, heading, info, success } from '../utils/logger.js';

export default defineCommand({
  meta: {
    name: 'start',
    description: 'Create a new feature branch from the latest dev',
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

    const { devBranch, origin, upstream, branchPrefixes, role } = config;
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

    info(`Creating branch: ${pc.bold(branchName)}`);

    // Silently sync dev first
    const remote = role === 'contributor' ? upstream : origin;
    const remoteDevRef =
      role === 'contributor' ? `${upstream}/${devBranch}` : `${origin}/${devBranch}`;
    await fetchRemote(remote);

    // Reset dev to latest
    const resetResult = await resetHard(remoteDevRef);
    if (resetResult.exitCode !== 0) {
      // Dev may not be checked out; just continue from current state
    }

    // Create branch from dev
    const result = await createBranch(branchName, devBranch);
    if (result.exitCode !== 0) {
      error(`Failed to create branch: ${result.stderr}`);
      process.exit(1);
    }

    success(`✅ Created ${pc.bold(branchName)} from latest ${pc.bold(devBranch)}`);
  },
});
