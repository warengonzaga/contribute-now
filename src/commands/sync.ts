import { defineCommand } from 'citty';
import pc from 'picocolors';
import { promptForBranchName } from '../utils/branchPrompt.js';
import { isAIEnabled, readConfig } from '../utils/config.js';
import { confirmPrompt, selectPrompt } from '../utils/confirm.js';
import {
  assertCleanGitState,
  checkoutBranch,
  createBranch,
  fetchRemote,
  getCommitHash,
  getCommitSubject,
  getCurrentBranch,
  getDivergence,
  hasUncommittedChanges,
  isGitRepo,
  pullBranch,
  pullFastForwardOnly,
  refExists,
  updateLocalBranch,
} from '../utils/git.js';
import { error, info, projectHeading, success, warn } from '../utils/logger.js';
import {
  getBaseBranch,
  getProtectedBranches,
  getSyncSource,
  hasDevBranch,
} from '../utils/workflow.js';

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
    await assertCleanGitState('syncing');

    const config = readConfig();
    if (!config) {
      error('No repo config found. Run `contrib setup` first.');
      process.exit(1);
    }

    const { workflow, role, origin } = config;

    // 1. Check for uncommitted changes
    if (await hasUncommittedChanges()) {
      error('You have uncommitted changes. Please commit or stash them before syncing.');
      process.exit(1);
    }

    projectHeading(`sync (${workflow}, ${role})`, '🔄');

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

    // Validate remote ref exists after fetch
    if (!(await refExists(syncSource.ref))) {
      error(`Remote ref ${pc.bold(syncSource.ref)} does not exist.`);
      info('This can happen if the branch was renamed or deleted on the remote.', '');
      info(
        `Check your config: the base branch may need updating via ${pc.bold('contrib setup')}.`,
        '',
      );
      process.exit(1);
    }

    // 3. Show divergence
    let allowMergeCommit = false;
    const div = await getDivergence(baseBranch, syncSource.ref);
    if (div.ahead > 0 || div.behind > 0) {
      info(
        `${pc.bold(baseBranch)} is ${pc.yellow(`${div.ahead} ahead`)} and ${pc.red(`${div.behind} behind`)} ${syncSource.ref}`,
      );
    } else {
      info(`${pc.bold(baseBranch)} is already in sync with ${syncSource.ref}`);
    }

    // 3b. If the user has local commits ahead on the base branch,
    // offer to move them to a feature branch before syncing
    if (div.ahead > 0) {
      const currentBranch = await getCurrentBranch();
      const protectedBranches = getProtectedBranches(config);
      const isOnProtected = currentBranch && protectedBranches.includes(currentBranch);

      if (isOnProtected) {
        warn(
          `You have ${pc.bold(String(div.ahead))} local commit${div.ahead !== 1 ? 's' : ''} on ${pc.bold(baseBranch)} that aren't on the remote.`,
        );
        info('Pulling now could create a merge commit, which breaks clean history.');
        console.log();

        const MOVE_BRANCH = 'Move my commits to a new feature branch, then sync';
        const PULL_ANYWAY = 'Pull anyway (may create a merge commit)';
        const CANCEL = 'Cancel';

        const action = await selectPrompt('How would you like to handle this?', [
          MOVE_BRANCH,
          PULL_ANYWAY,
          CANCEL,
        ]);

        if (action === CANCEL) {
          info('No changes made.');
          return;
        }

        if (action === MOVE_BRANCH) {
          const newBranchName = await promptForBranchName({
            branchPrefixes: config.branchPrefixes,
            useAI: isAIEnabled(config, args['no-ai']),
            model: args.model,
          });

          if (!newBranchName) {
            info('No changes made.');
            return;
          }

          // Create feature branch from current HEAD (carries commits)
          const branchResult = await createBranch(newBranchName);
          if (branchResult.exitCode !== 0) {
            error(`Failed to create branch: ${branchResult.stderr}`);
            process.exit(1);
          }
          success(`Created ${pc.bold(newBranchName)} with your commits.`);

          // Switch back to the base branch and reset it to remote
          const coResult = await checkoutBranch(baseBranch);
          if (coResult.exitCode !== 0) {
            error(`Failed to checkout ${baseBranch}: ${coResult.stderr}`);
            process.exit(1);
          }

          const remoteRef = syncSource.ref;
          await updateLocalBranch(baseBranch, remoteRef);
          success(`Reset ${pc.bold(baseBranch)} to ${pc.bold(remoteRef)}.`);

          success(`${pc.bold(baseBranch)} is now in sync with ${syncSource.ref}`);
          console.log();
          info(`Your commits are safe on ${pc.bold(newBranchName)}.`, '');
          info(
            `Run ${pc.bold(`git checkout ${newBranchName}`)} then ${pc.bold('contrib update')} to rebase onto the synced ${pc.bold(baseBranch)}.`,
            '',
          );
          return;
        }

        // PULL_ANYWAY — fall through to normal sync
        allowMergeCommit = true;
        warn('Proceeding with pull — a merge commit may be created.');
      }
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

    const pullResult = allowMergeCommit
      ? await pullBranch(syncSource.remote, baseBranch)
      : await pullFastForwardOnly(syncSource.remote, baseBranch);
    if (pullResult.exitCode !== 0) {
      if (allowMergeCommit) {
        error(`Pull failed: ${pullResult.stderr.trim()}`);
      } else {
        error(`Fast-forward pull failed. Your local ${pc.bold(baseBranch)} may have diverged.`);
        info(
          `Use ${pc.bold('contrib sync')} again and choose "Move my commits to a new feature branch" to fix this.`,
          '',
        );
      }
      process.exit(1);
    }

    success(`${baseBranch} is now in sync with ${syncSource.ref}`);

    // For workflows with dev branch, also sync main if maintainer
    if (hasDevBranch(workflow) && role === 'maintainer') {
      const mainDiv = await getDivergence(config.mainBranch, `${origin}/${config.mainBranch}`);
      if (mainDiv.behind > 0) {
        info(`Also syncing ${pc.bold(config.mainBranch)}...`);
        const mainCoResult = await checkoutBranch(config.mainBranch);
        if (mainCoResult.exitCode === 0) {
          const mainPullResult = await pullFastForwardOnly(origin, config.mainBranch);
          if (mainPullResult.exitCode === 0) {
            success(`${config.mainBranch} is now in sync with ${origin}/${config.mainBranch}`);
          }
        }
        // Return to base branch
        await checkoutBranch(baseBranch);
      } else {
        success(`${config.mainBranch} already in sync with ${origin}/${config.mainBranch}`);
      }
    }

    // Branch alignment summary
    if (hasDevBranch(workflow) && config.devBranch) {
      const devRemote = role === 'contributor' ? config.upstream : origin;
      const [mainHash, devHash, remoteMainHash, remoteDevHash] = await Promise.all([
        getCommitHash(config.mainBranch),
        getCommitHash(config.devBranch),
        getCommitHash(`${origin}/${config.mainBranch}`),
        getCommitHash(`${devRemote}/${config.devBranch}`),
      ]);

      const refs: { name: string; hash: string }[] = [];
      if (mainHash) refs.push({ name: config.mainBranch, hash: mainHash });
      if (remoteMainHash)
        refs.push({ name: `${origin}/${config.mainBranch}`, hash: remoteMainHash });
      if (devHash) refs.push({ name: config.devBranch, hash: devHash });
      if (remoteDevHash)
        refs.push({ name: `${devRemote}/${config.devBranch}`, hash: remoteDevHash });

      if (refs.length > 1) {
        const groups = new Map<string, string[]>();
        for (const { name, hash } of refs) {
          if (!groups.has(hash)) groups.set(hash, []);
          const group = groups.get(hash);
          if (group) {
            group.push(name);
          }
        }

        console.log();
        console.log(`  ${pc.bold('\ud83d\udd17 Branch Alignment')}`);

        for (const [hash, names] of groups) {
          const short = hash.slice(0, 7);
          const nameStr = names.map((n) => pc.bold(n)).join(pc.dim(' \u00b7 '));
          console.log(`     ${pc.yellow(short)} ${pc.dim('\u2500\u2500')} ${nameStr}`);
          const subject = await getCommitSubject(hash);
          if (subject) {
            console.log(`                ${pc.dim(subject)}`);
          }
        }

        if (groups.size === 1) {
          console.log(
            `     ${pc.green('\u2713')} ${pc.green('All branches aligned')} ${pc.dim('\u2014 ready to start')}`,
          );
        } else {
          console.log(`     ${pc.yellow('\u26a0')} ${pc.yellow('Branches are not fully aligned')}`);
        }
      }
    }
  },
});
