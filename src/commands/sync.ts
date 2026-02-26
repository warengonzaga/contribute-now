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
  pullBranch,
} from '../utils/git.js';
import { error, heading, info, success } from '../utils/logger.js';
import { getBaseBranch, getSyncSource, hasDevBranch } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'sync',
    description: 'Sync your local branches with the remote',
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

    const { workflow, role, origin } = config;

    // 1. Check for uncommitted changes
    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them before syncing.');
      process.exit(1);
    }

    heading(`🔄 contrib sync (${workflow}, ${role})`);

    const baseBranch = getBaseBranch(config);
    const syncSource = getSyncSource(config);

    // 2. Fetch remote
    info(`Fetching ${syncSource.remote}...`);
    const fetchResult = await fetchRemote(syncSource.remote);
    if (fetchResult.exitCode !== 0) {
      error(`Failed to fetch ${syncSource.remote}: ${fetchResult.stderr}`);
      process.exit(1);
    }

    // Also fetch origin if contributor (need to push to origin)
    if (role === 'contributor' && syncSource.remote !== origin) {
      await fetchRemote(origin);
    }

    // 3. Show divergence
    const div = await getDivergence(baseBranch, syncSource.ref);
    if (div.ahead > 0 || div.behind > 0) {
      info(
        `${pc.bold(baseBranch)} is ${pc.yellow(`${div.ahead} ahead`)} and ${pc.red(`${div.behind} behind`)} ${syncSource.ref}`,
      );
    } else {
      info(`${pc.bold(baseBranch)} is already in sync with ${syncSource.ref}`);
    }

    // 4. Confirm
    if (!args.yes) {
      const ok = await confirmPrompt(
        `This will pull ${pc.bold(syncSource.ref)} into local ${pc.bold(baseBranch)}.`,
      );
      if (!ok) process.exit(0);
    }

    // 5. Checkout and pull
    const coResult = await checkoutBranch(baseBranch);
    if (coResult.exitCode !== 0) {
      error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
      process.exit(1);
    }

    const pullResult = await pullBranch(syncSource.remote, baseBranch);
    if (pullResult.exitCode !== 0) {
      error(`Failed to pull: ${pullResult.stderr}`);
      process.exit(1);
    }

    success(`✅ ${baseBranch} is now in sync with ${syncSource.ref}`);

    // For workflows with dev branch, also sync main if maintainer
    if (hasDevBranch(workflow) && role === 'maintainer') {
      const mainDiv = await getDivergence(config.mainBranch, `${origin}/${config.mainBranch}`);
      if (mainDiv.behind > 0) {
        info(`Also syncing ${pc.bold(config.mainBranch)}...`);
        const mainCoResult = await checkoutBranch(config.mainBranch);
        if (mainCoResult.exitCode === 0) {
          const mainPullResult = await pullBranch(origin, config.mainBranch);
          if (mainPullResult.exitCode === 0) {
            success(`✅ ${config.mainBranch} is now in sync with ${origin}/${config.mainBranch}`);
          }
        }
        // Return to base branch
        await checkoutBranch(baseBranch);
      }
    }
  },
});
