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
import { checkCopilotAvailable, suggestBranchName } from '../utils/copilot.js';
import {
  assertCleanGitState,
  branchExists,
  checkoutBranch,
  createBranch,
  fetchRemote,
  getCurrentBranch,
  getDivergence,
  hasUncommittedChanges,
  isGitRepo,
  pullBranch,
  pullFastForwardOnly,
  refExists,
  updateLocalBranch,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
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

    // Validate remote ref exists after fetch
    if (!(await refExists(syncSource.ref))) {
      error(`Remote ref ${pc.bold(syncSource.ref)} does not exist.`);
      info('This can happen if the branch was renamed or deleted on the remote.');
      info(`Check your config: the base branch may need updating via ${pc.bold('contrib setup')}.`);
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
          info(
            pc.dim(
              "Tip: Describe what you're going to work on in plain English and we'll generate a branch name.",
            ),
          );
          const description = await inputPrompt('What are you going to work on?');

          let newBranchName = description;
          if (!args['no-ai'] && looksLikeNaturalLanguage(description)) {
            const copilotError = await checkCopilotAvailable();
            if (!copilotError) {
              const spinner = createSpinner('Generating branch name suggestion...');
              const suggested = await suggestBranchName(description, args.model);
              if (suggested) {
                spinner.success('Branch name suggestion ready.');
                console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(suggested))}`);
                const accepted = await confirmPrompt(
                  `Use ${pc.bold(suggested)} as your branch name?`,
                );
                newBranchName = accepted
                  ? suggested
                  : await inputPrompt('Enter branch name', description);
              } else {
                spinner.fail('AI did not return a suggestion.');
                newBranchName = await inputPrompt('Enter branch name', description);
              }
            }
          }

          if (!hasPrefix(newBranchName, config.branchPrefixes)) {
            const prefix = await selectPrompt(
              `Choose a branch type for ${pc.bold(newBranchName)}:`,
              config.branchPrefixes,
            );
            newBranchName = formatBranchName(prefix, newBranchName);
          }

          if (!isValidBranchName(newBranchName)) {
            error(
              'Invalid branch name. Use only alphanumeric characters, dots, hyphens, underscores, and slashes.',
            );
            process.exit(1);
          }

          // Create feature branch from current HEAD (carries commits)
          if (await branchExists(newBranchName)) {
            error(`Branch ${pc.bold(newBranchName)} already exists. Choose a different name.`);
            process.exit(1);
          }

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

          success(`✅ ${pc.bold(baseBranch)} is now in sync with ${syncSource.ref}`);
          console.log();
          info(`Your commits are safe on ${pc.bold(newBranchName)}.`);
          info(
            `Run ${pc.bold(`git checkout ${newBranchName}`)} then ${pc.bold('contrib update')} to rebase onto the synced ${pc.bold(baseBranch)}.`,
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
        );
      }
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
          const mainPullResult = await pullFastForwardOnly(origin, config.mainBranch);
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
