import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { checkGhInstalled, getMergedPRForBranch } from '../utils/gh.js';
import {
  fetchAll,
  getCommitHash,
  getCommitSubject,
  getCurrentBranch,
  getDivergence,
  getFileStatus,
  getGoneBranches,
  getLastCommitDate,
  getMergedBranches,
  hasUncommittedChanges,
  isBranchMergedInto,
  isGitRepo,
} from '../utils/git.js';
import { error, projectHeading } from '../utils/logger.js';
import {
  getBaseBranch,
  getProtectedBranches,
  hasDevBranch,
  WORKFLOW_DESCRIPTIONS,
} from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'status',
    description: 'Show sync status of branches',
  },
  async run() {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const config = readConfig();
    if (!config) {
      error('No repo config found. Run `contrib setup` first.');
      process.exit(1);
    }

    projectHeading('status', '📊');

    // Show workflow mode
    console.log(`  ${pc.dim('Workflow:')} ${pc.bold(WORKFLOW_DESCRIPTIONS[config.workflow])}`);
    console.log(`  ${pc.dim('Role:')} ${pc.bold(config.role)}`);
    console.log();

    // Silently fetch all remotes
    await fetchAll();

    const currentBranch = await getCurrentBranch();
    const { mainBranch, origin, upstream, workflow } = config;
    const baseBranch = getBaseBranch(config);
    const isContributor = config.role === 'contributor';

    // Check uncommitted changes and file status
    const [dirty, fileStatus] = await Promise.all([hasUncommittedChanges(), getFileStatus()]);
    if (dirty) {
      console.log(`  ${pc.yellow('⚠')}  ${pc.yellow('Uncommitted changes in working tree')}`);
      console.log();
    }

    // Main branch status
    const mainRemote = `${origin}/${mainBranch}`;
    const mainDiv = await getDivergence(mainBranch, mainRemote);
    const mainStatus = formatStatus(mainBranch, mainRemote, mainDiv.ahead, mainDiv.behind);
    console.log(mainStatus);

    // Dev/develop branch status (only for workflows with dev branch)
    if (hasDevBranch(workflow) && config.devBranch) {
      const devRemoteRef = isContributor
        ? `${upstream}/${config.devBranch}`
        : `${origin}/${config.devBranch}`;
      const devDiv = await getDivergence(config.devBranch, devRemoteRef);
      const devLine = formatStatus(config.devBranch, devRemoteRef, devDiv.ahead, devDiv.behind);
      console.log(devLine);
    }

    // Current feature branch (if not on a protected branch)
    const protectedBranches = getProtectedBranches(config);
    const isFeatureBranch = currentBranch && !protectedBranches.includes(currentBranch);
    let branchStatus: BranchStatus | null = null;

    if (isFeatureBranch) {
      const branchDiv = await getDivergence(currentBranch, baseBranch);
      const branchLine = formatStatus(currentBranch, baseBranch, branchDiv.ahead, branchDiv.behind);
      console.log(branchLine + pc.dim(` (current ${pc.green('*')})`));

      // Merged / stale detection for feature branches
      branchStatus = await detectBranchStatus(currentBranch, baseBranch);

      if (branchStatus.merged) {
        console.log(
          `  ${pc.green('\u2713')}  ${pc.green('Branch merged')} \u2014 ${pc.dim(branchStatus.mergedReason ?? 'all commits reachable from base')}`,
        );
      }

      if (branchStatus.stale) {
        console.log(
          `  ${pc.yellow('\u23f3')}  ${pc.yellow('Branch is stale')} \u2014 ${pc.dim(`last commit ${branchStatus.staleDaysAgo} days ago`)}`,
        );
      }
    } else if (currentBranch) {
      console.log(pc.dim(`  (on ${pc.bold(currentBranch)} branch)`));
    }

    // Branch alignment section
    let branchesAligned = true;
    {
      const alignRefs: { name: string; hash: string }[] = [];
      const devRemote = isContributor ? upstream : origin;
      const devBranch = hasDevBranch(workflow) ? config.devBranch : undefined;
      const hashResults = await Promise.all([
        getCommitHash(mainBranch).then((h) => ({ name: mainBranch, hash: h })),
        getCommitHash(`${origin}/${mainBranch}`).then((h) => ({
          name: `${origin}/${mainBranch}`,
          hash: h,
        })),
        ...(devBranch
          ? [
              getCommitHash(devBranch).then((h) => ({ name: devBranch, hash: h })),
              getCommitHash(`${devRemote}/${devBranch}`).then((h) => ({
                name: `${devRemote}/${devBranch}`,
                hash: h,
              })),
            ]
          : []),
      ]);

      for (const { name, hash } of hashResults) {
        if (hash) alignRefs.push({ name, hash });
      }

      if (alignRefs.length > 1) {
        const groups = new Map<string, string[]>();
        for (const { name, hash } of alignRefs) {
          if (!groups.has(hash)) groups.set(hash, []);
          const group = groups.get(hash);
          if (group) {
            group.push(name);
          }
        }

        branchesAligned = groups.size === 1;

        console.log();
        console.log(`  ${pc.bold('🔗 Branch Alignment')}`);

        for (const [hash, names] of groups) {
          const short = hash.slice(0, 7);
          const nameStr = names.map((n) => pc.bold(n)).join(pc.dim(' · '));
          console.log(`     ${pc.yellow(short)} ${pc.dim('──')} ${nameStr}`);
          const subject = await getCommitSubject(hash);
          if (subject) {
            console.log(`                ${pc.dim(subject)}`);
          }
        }

        if (branchesAligned) {
          console.log(
            `     ${pc.green('✓')} ${pc.green('All branches aligned')} ${pc.dim('— ready to start')}`,
          );
        } else {
          console.log(`     ${pc.yellow('⚠')} ${pc.yellow('Branches are not fully aligned')}`);
        }
      }
    }

    // File status section
    const hasFiles =
      fileStatus.staged.length > 0 ||
      fileStatus.modified.length > 0 ||
      fileStatus.untracked.length > 0;

    if (hasFiles) {
      console.log();
      if (fileStatus.staged.length > 0) {
        console.log(`  ${pc.green('Staged for commit:')}`);
        for (const { file, status } of fileStatus.staged) {
          console.log(`    ${pc.green('+')} ${pc.dim(`${status}:`)} ${file}`);
        }
      }
      if (fileStatus.modified.length > 0) {
        console.log(`  ${pc.yellow('Unstaged changes:')}`);
        for (const { file, status } of fileStatus.modified) {
          console.log(`    ${pc.yellow('~')} ${pc.dim(`${status}:`)} ${file}`);
        }
      }
      if (fileStatus.untracked.length > 0) {
        console.log(`  ${pc.red('Untracked files:')}`);
        for (const file of fileStatus.untracked) {
          console.log(`    ${pc.red('?')} ${file}`);
        }
      }
    } else if (!dirty) {
      console.log(`  ${pc.green('✓')}  ${pc.dim('Working tree clean')}`);
    }

    console.log();
  },
});

function formatStatus(branch: string, base: string, ahead: number, behind: number): string {
  const label = pc.bold(branch.padEnd(20));
  if (ahead === 0 && behind === 0) {
    return `  ${pc.green('✓')}  ${label} ${pc.dim(`in sync with ${base}`)}`;
  }
  if (ahead > 0 && behind === 0) {
    return `  ${pc.yellow('↑')}  ${label} ${pc.yellow(`${ahead} commit${ahead !== 1 ? 's' : ''} ahead of ${base}`)}`;
  }
  if (behind > 0 && ahead === 0) {
    return `  ${pc.red('↓')}  ${label} ${pc.red(`${behind} commit${behind !== 1 ? 's' : ''} behind ${base}`)}`;
  }
  return `  ${pc.red('⚡')}  ${label} ${pc.yellow(`${ahead} ahead`)}${pc.dim(', ')}${pc.red(`${behind} behind`)} ${pc.dim(base)}`;
}

const STALE_THRESHOLD_DAYS = 14;

interface BranchStatus {
  merged: boolean;
  mergedReason: string | null;
  stale: boolean;
  staleDaysAgo: number | null;
}

async function detectBranchStatus(branch: string, baseBranch: string): Promise<BranchStatus> {
  const result: BranchStatus = {
    merged: false,
    mergedReason: null,
    stale: false,
    staleDaysAgo: null,
  };

  // A branch with 0 commits ahead of the base is just fresh — not merged.
  // Only run merge detection if the branch has actually diverged with work.
  const div = await getDivergence(branch, baseBranch);
  const hasWork = div.ahead > 0;

  if (hasWork) {
    // 1. Check if branch is fully merged via git ancestry
    if (await isBranchMergedInto(branch, baseBranch)) {
      result.merged = true;
      result.mergedReason = `all commits reachable from ${baseBranch}`;
      return result;
    }

    // 2. Check if branch appears in `git branch --merged`
    const mergedBranches = await getMergedBranches(baseBranch);
    if (mergedBranches.includes(branch)) {
      result.merged = true;
      result.mergedReason = `listed in merged branches of ${baseBranch}`;
      return result;
    }
  }

  // 3. Check if remote tracking branch is gone (squash-merge detection)
  // This applies even without local commits — remote deletion signals a merge happened
  const goneBranches = await getGoneBranches();
  if (goneBranches.includes(branch)) {
    result.merged = true;
    result.mergedReason = 'remote branch deleted (likely squash-merged)';
    return result;
  }

  // 4. Check if a merged PR exists via gh CLI
  if (await checkGhInstalled()) {
    const mergedPR = await getMergedPRForBranch(branch);
    if (mergedPR) {
      result.merged = true;
      result.mergedReason = `PR #${mergedPR.number} was merged`;
      return result;
    }
  }

  // 5. Stale detection — check last commit age
  const lastDate = await getLastCommitDate(branch);
  if (lastDate) {
    const daysAgo = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo >= STALE_THRESHOLD_DAYS) {
      result.stale = true;
      result.staleDaysAgo = daysAgo;
    }
  }

  return result;
}
