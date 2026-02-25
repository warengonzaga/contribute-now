import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { confirmPrompt } from '../utils/confirm.js';
import {
  deleteBranch,
  getCurrentBranch,
  getMergedBranches,
  isGitRepo,
  pruneRemote,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';

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

    const { mainBranch, devBranch, origin } = config;
    const currentBranch = await getCurrentBranch();

    heading('🧹 contrib clean');

    // 1. List branches merged into dev
    const mergedBranches = await getMergedBranches(devBranch);

    // 2. Exclude main, dev, and current branch
    const protected_ = new Set([mainBranch, devBranch, currentBranch ?? '']);
    const candidates = mergedBranches.filter((b) => !protected_.has(b));

    if (candidates.length === 0) {
      info('No merged branches to clean up.');
    } else {
      // 3. Show candidates and confirm
      console.log(`\n${pc.bold('Branches to delete:')}`);
      for (const b of candidates) {
        console.log(`  ${pc.dim('•')} ${b}`);
      }
      console.log();

      const ok =
        args.yes ||
        (await confirmPrompt(
          `Delete ${pc.bold(String(candidates.length))} merged branch${candidates.length !== 1 ? 'es' : ''}?`,
        ));
      if (!ok) {
        info('Skipped branch deletion.');
      } else {
        // 4. Delete each branch
        for (const branch of candidates) {
          const result = await deleteBranch(branch);
          if (result.exitCode === 0) {
            success(`  Deleted ${pc.bold(branch)}`);
          } else {
            warn(`  Failed to delete ${branch}: ${result.stderr.trim()}`);
          }
        }
      }
    }

    // 5. Prune remote refs
    info(`Pruning ${origin} remote refs...`);
    const pruneResult = await pruneRemote(origin);
    if (pruneResult.exitCode === 0) {
      success(`✅ Pruned ${origin} remote refs.`);
    } else {
      warn(`Could not prune remote: ${pruneResult.stderr.trim()}`);
    }
  },
});
