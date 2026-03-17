import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, selectPrompt } from '../utils/confirm.js';
import {
  checkoutBranch,
  getCurrentBranch,
  getLocalBranches,
  hasUncommittedChanges,
  isGitRepo,
} from '../utils/git.js';
import { error, info, projectHeading, success, warn } from '../utils/logger.js';
import { getProtectedBranches } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'switch',
    description: 'Switch to another branch with stash protection for uncommitted changes',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Branch name to switch to (interactive picker if omitted)',
      required: false,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const config = readConfig();
    const protectedBranches = config ? getProtectedBranches(config) : ['main', 'master'];
    const currentBranch = await getCurrentBranch();

    projectHeading('switch', '🔀');

    // ── Resolve target branch ──
    let targetBranch = args.name;

    if (!targetBranch) {
      // Interactive mode: list all local branches and let user pick
      const localBranches = await getLocalBranches();

      if (localBranches.length === 0) {
        error('No local branches found.');
        process.exit(1);
      }

      // Build labeled choices, excluding current branch
      const choices = localBranches
        .filter((b) => b.name !== currentBranch)
        .map((b) => {
          const labels: string[] = [];
          if (protectedBranches.includes(b.name)) labels.push(pc.red('protected'));
          if (b.upstream) labels.push(pc.dim(`→ ${b.upstream}`));
          if (b.gone) labels.push(pc.red('remote gone'));
          const suffix = labels.length > 0 ? `  ${labels.join(' · ')}` : '';
          return `${b.name}${suffix}`;
        });

      if (choices.length === 0) {
        info('You are already on the only local branch.');
        process.exit(0);
      }

      const selected = await selectPrompt('Switch to which branch?', choices);
      // Extract the branch name (before any spacing/labels)
      targetBranch = selected.split(/\s{2,}/)[0].trim();
    }

    // ── Guard: already on target ──
    if (targetBranch === currentBranch) {
      info(`Already on ${pc.bold(targetBranch)}.`);
      return;
    }

    // ── Handle uncommitted changes ──
    if (await hasUncommittedChanges()) {
      warn('You have uncommitted changes.');
      const action = await selectPrompt('How would you like to handle them?', [
        'Save changes and switch',
        'Cancel',
      ]);

      if (action === 'Cancel') {
        info('Switch cancelled.');
        return;
      }

      // Stash with a descriptive message
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      const stashMsg = `contrib-save: auto-save from ${currentBranch}`;
      try {
        await exec('git', ['stash', 'push', '-m', stashMsg]);
        info(`Saved changes: ${pc.dim(stashMsg)}`);
      } catch {
        error('Failed to save changes. Please commit or save manually.');
        process.exit(1);
      }

      // Switch branch
      const result = await checkoutBranch(targetBranch);
      if (result.exitCode !== 0) {
        error(`Failed to switch to ${targetBranch}: ${result.stderr}`);
        // Try to pop stash back since switch failed
        try {
          await exec('git', ['stash', 'pop']);
          info('Restored saved changes.');
        } catch {
          warn('Could not restore save automatically. Use `contrib save --restore` to recover.');
        }
        process.exit(1);
      }

      success(`Switched to ${pc.bold(targetBranch)}`);
      info(`Your changes from ${pc.bold(currentBranch ?? 'previous branch')} are saved.`, '');
      info(`Use ${pc.bold('contrib save --restore')} to bring them back.`, '');
      return;
    }

    // ── Clean switch ──
    const result = await checkoutBranch(targetBranch);
    if (result.exitCode !== 0) {
      error(`Failed to switch to ${targetBranch}: ${result.stderr}`);
      process.exit(1);
    }

    success(`Switched to ${pc.bold(targetBranch)}`);
  },
});
