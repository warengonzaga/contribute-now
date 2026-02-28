import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import {
  getCurrentBranch,
  getLocalBranches,
  getRemoteBranches,
  isGitRepo,
} from '../utils/git.js';
import { error, heading } from '../utils/logger.js';
import { getProtectedBranches } from '../utils/workflow.js';

export default defineCommand({
  meta: {
    name: 'branch',
    description: 'List branches with workflow-aware labels and status',
  },
  args: {
    all: {
      type: 'boolean',
      alias: 'a',
      description: 'Show both local and remote branches',
      default: false,
    },
    remote: {
      type: 'boolean',
      alias: 'r',
      description: 'Show only remote branches',
      default: false,
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
    const showRemoteOnly = args.remote;
    const showAll = args.all;

    heading('🌿 branches');
    console.log();

    // ── Local branches ──
    if (!showRemoteOnly) {
      const localBranches = await getLocalBranches();

      if (localBranches.length === 0) {
        console.log(pc.dim('  No local branches found.'));
      } else {
        console.log(`  ${pc.bold('Local')}`);
        console.log();

        for (const branch of localBranches) {
          const parts: string[] = [];

          // Current branch marker
          if (branch.isCurrent) {
            parts.push(pc.green('* '));
          } else {
            parts.push('  ');
          }

          // Branch name with color
          const nameStr = colorBranchName(branch.name, protectedBranches, currentBranch);
          parts.push(nameStr.padEnd(30));

          // Tracking info
          if (branch.gone) {
            parts.push(pc.red(' ✗ remote gone'));
          } else if (branch.upstream) {
            parts.push(pc.dim(` → ${branch.upstream}`));
          } else {
            parts.push(pc.dim(' (no remote)'));
          }

          // Workflow labels
          const labels = getBranchLabels(branch.name, protectedBranches, config);
          if (labels.length > 0) {
            parts.push(`  ${labels.join(' ')}`);
          }

          console.log(`  ${parts.join('')}`);
        }
      }
    }

    // ── Remote branches ──
    if (showRemoteOnly || showAll) {
      const remoteBranches = await getRemoteBranches();

      if (!showRemoteOnly) {
        console.log();
      }

      if (remoteBranches.length === 0) {
        console.log(pc.dim('  No remote branches found.'));
      } else {
        // Group by remote name
        const grouped = groupByRemote(remoteBranches);

        for (const [remote, branches] of Object.entries(grouped)) {
          console.log(`  ${pc.bold(`Remote: ${remote}`)}`);
          console.log();

          for (const fullRef of branches) {
            // Extract the branch name after "remote/"
            const branchName = fullRef.slice(remote.length + 1);
            const nameStr = colorBranchName(branchName, protectedBranches, currentBranch);
            const remotePrefix = pc.dim(`${remote}/`);
            console.log(`    ${remotePrefix}${nameStr}`);
          }

          console.log();
        }
      }
    }

    // ── Footer tips ──
    const tips: string[] = [];
    if (!showAll && !showRemoteOnly) {
      tips.push(`Use ${pc.bold('contrib branch -a')} to include remote branches`);
    }
    if (!showRemoteOnly) {
      tips.push(`Use ${pc.bold('contrib start')} to create a new feature branch`);
      tips.push(`Use ${pc.bold('contrib clean')} to remove merged/stale branches`);
    }

    if (tips.length > 0) {
      console.log(`  ${pc.dim('💡 Tip:')}`);
      for (const tip of tips) {
        console.log(`     ${pc.dim(tip)}`);
      }
    }

    console.log();
  },
});

/**
 * Colorize a branch name based on its role in the workflow.
 */
function colorBranchName(
  name: string,
  protectedBranches: string[],
  currentBranch: string | null,
): string {
  if (name === currentBranch) {
    return pc.bold(pc.green(name));
  }
  if (protectedBranches.includes(name)) {
    return pc.bold(pc.red(name));
  }
  return name;
}

/**
 * Get workflow-relevant labels for a branch (e.g. [protected], [base]).
 */
function getBranchLabels(
  name: string,
  protectedBranches: string[],
  config: ReturnType<typeof readConfig>,
): string[] {
  const labels: string[] = [];

  if (protectedBranches.includes(name)) {
    labels.push(pc.dim(pc.red('[protected]')));
  }

  if (config) {
    if (name === config.mainBranch) {
      labels.push(pc.dim(pc.cyan('[main]')));
    }
    if (config.devBranch && name === config.devBranch) {
      labels.push(pc.dim(pc.cyan('[dev]')));
    }
  }

  return labels;
}

/**
 * Group remote branch refs by their remote name.
 * e.g. "origin/main" → { origin: ["origin/main"] }
 */
function groupByRemote(branches: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const ref of branches) {
    const slashIdx = ref.indexOf('/');
    const remote = slashIdx !== -1 ? ref.slice(0, slashIdx) : 'unknown';
    if (!grouped[remote]) {
      grouped[remote] = [];
    }
    grouped[remote].push(ref);
  }
  return grouped;
}
