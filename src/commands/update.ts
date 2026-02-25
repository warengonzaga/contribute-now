import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { checkCopilotAvailable, suggestConflictResolution } from '../utils/copilot.js';
import {
  fetchRemote,
  getChangedFiles,
  getCurrentBranch,
  hasUncommittedChanges,
  isGitRepo,
  rebase,
  resetHard,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';

export default defineCommand({
  meta: {
    name: 'update',
    description: 'Rebase current branch onto latest dev',
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

    const { mainBranch, devBranch, origin, upstream, role } = config;

    // 1. Verify not on main or dev
    const currentBranch = await getCurrentBranch();
    if (!currentBranch) {
      error('Could not determine current branch.');
      process.exit(1);
    }

    if (currentBranch === mainBranch || currentBranch === devBranch) {
      error(
        `Use \`contrib sync\` to update ${pc.bold(mainBranch)} or ${pc.bold(devBranch)} branches.`,
      );
      process.exit(1);
    }

    // 2. Check for uncommitted changes
    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them first.');
      process.exit(1);
    }

    heading('🔃 contrib update');
    info(`Updating ${pc.bold(currentBranch)} with latest ${pc.bold(devBranch)}...`);

    // 3. Fetch + update local dev silently
    const remote = role === 'contributor' ? upstream : origin;
    const remoteDevRef =
      role === 'contributor' ? `${upstream}/${devBranch}` : `${origin}/${devBranch}`;
    await fetchRemote(remote);
    await resetHard(remoteDevRef);

    // 4. git rebase dev
    const rebaseResult = await rebase(devBranch);

    if (rebaseResult.exitCode !== 0) {
      // 5. On conflict: AI suggestions
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
            const suggestion = await suggestConflictResolution(conflictDiff, args.model);
            if (suggestion) {
              console.log(`\n${pc.bold('💡 AI Conflict Resolution Guidance:')}`);
              console.log(pc.dim('─'.repeat(60)));
              console.log(suggestion);
              console.log(pc.dim('─'.repeat(60)));
              console.log();
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

    success(`✅ ${pc.bold(currentBranch)} has been rebased onto latest ${pc.bold(devBranch)}`);
  },
});
