import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import {
  fetchAll,
  getCurrentBranch,
  getDivergence,
  hasUncommittedChanges,
  isGitRepo,
} from '../utils/git.js';
import { error, heading } from '../utils/logger.js';
import { getBaseBranch, hasDevBranch, WORKFLOW_DESCRIPTIONS } from '../utils/workflow.js';

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
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    heading('📊 contribute-now status');

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

    // Check uncommitted changes
    const dirty = await hasUncommittedChanges();
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
    if (currentBranch && currentBranch !== mainBranch && currentBranch !== config.devBranch) {
      const branchDiv = await getDivergence(currentBranch, baseBranch);
      const branchLine = formatStatus(currentBranch, baseBranch, branchDiv.ahead, branchDiv.behind);
      console.log(branchLine + pc.dim(` (current ${pc.green('*')})`));
    } else if (currentBranch) {
      console.log(pc.dim(`  (on ${pc.bold(currentBranch)} branch)`));
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
