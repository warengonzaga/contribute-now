import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { confirmPrompt } from '../utils/confirm.js';
import {
  checkoutBranch,
  fetchRemote,
  getDivergence,
  hasUncommittedChanges,
  isGitRepo,
  pushForceWithLease,
  resetHard,
} from '../utils/git.js';
import { error, heading, info, success } from '../utils/logger.js';

export default defineCommand({
  meta: {
    name: 'sync',
    description: 'Reset dev branch to match origin/main (maintainer) or upstream/dev (contributor)',
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

    const { role, mainBranch, devBranch, origin, upstream } = config;

    // 1. Check for uncommitted changes
    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them before syncing.');
      process.exit(1);
    }

    heading(`🔄 contrib sync (${role})`);

    if (role === 'maintainer') {
      // Maintainer flow
      // 2. Fetch origin
      info(`Fetching ${origin}...`);
      const fetchResult = await fetchRemote(origin);
      if (fetchResult.exitCode !== 0) {
        error(`Failed to fetch ${origin}: ${fetchResult.stderr}`);
        process.exit(1);
      }

      // 3. Show divergence
      const div = await getDivergence(devBranch, `${origin}/${mainBranch}`);
      if (div.ahead > 0 || div.behind > 0) {
        info(
          `${pc.bold(devBranch)} is ${pc.yellow(`${div.ahead} ahead`)} and ${pc.red(`${div.behind} behind`)} ${origin}/${mainBranch}`,
        );
      } else {
        info(`${pc.bold(devBranch)} is already in sync with ${origin}/${mainBranch}`);
      }

      // 4. Confirm
      if (!args.yes) {
        const ok = await confirmPrompt(
          `This will reset ${pc.bold(devBranch)} to match ${pc.bold(`${origin}/${mainBranch}`)}.`,
        );
        if (!ok) process.exit(0);
      }

      // 5. Execute
      const coResult = await checkoutBranch(devBranch);
      if (coResult.exitCode !== 0) {
        error(`Failed to checkout ${devBranch}: ${coResult.stderr}`);
        process.exit(1);
      }

      const resetResult = await resetHard(`${origin}/${mainBranch}`);
      if (resetResult.exitCode !== 0) {
        error(`Failed to reset: ${resetResult.stderr}`);
        process.exit(1);
      }

      const pushResult = await pushForceWithLease(origin, devBranch);
      if (pushResult.exitCode !== 0) {
        error(`Failed to push: ${pushResult.stderr}`);
        process.exit(1);
      }

      success(`✅ ${devBranch} has been reset to match ${origin}/${mainBranch} and pushed.`);
    } else {
      // Contributor flow
      // 2. Fetch upstream
      info(`Fetching ${upstream}...`);
      const fetchResult = await fetchRemote(upstream);
      if (fetchResult.exitCode !== 0) {
        error(`Failed to fetch ${upstream}: ${fetchResult.stderr}`);
        process.exit(1);
      }

      // 3. Confirm
      if (!args.yes) {
        const ok = await confirmPrompt(
          `This will reset local ${pc.bold(devBranch)} to match ${pc.bold(`${upstream}/${devBranch}`)}.`,
        );
        if (!ok) process.exit(0);
      }

      // 4. Execute
      const coResult = await checkoutBranch(devBranch);
      if (coResult.exitCode !== 0) {
        error(`Failed to checkout ${devBranch}: ${coResult.stderr}`);
        process.exit(1);
      }

      const resetResult = await resetHard(`${upstream}/${devBranch}`);
      if (resetResult.exitCode !== 0) {
        error(`Failed to reset: ${resetResult.stderr}`);
        process.exit(1);
      }

      const pushResult = await pushForceWithLease(origin, devBranch);
      if (pushResult.exitCode !== 0) {
        error(`Failed to push: ${pushResult.stderr}`);
        process.exit(1);
      }

      success(`✅ ${devBranch} has been reset to match ${upstream}/${devBranch} and pushed.`);
    }
  },
});
