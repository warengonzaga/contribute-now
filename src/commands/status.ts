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

export default defineCommand({
  meta: {
    name: 'status',
    description: 'Show sync status of main, dev, and current branch',
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

    // Silently fetch all remotes
    await fetchAll();

    const currentBranch = await getCurrentBranch();
    const { mainBranch, devBranch, origin, upstream } = config;
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

    // Dev branch status
    const devRemoteRef = isContributor ? `${upstream}/${devBranch}` : `${origin}/${mainBranch}`;
    const devDiv = await getDivergence(devBranch, devRemoteRef);
    let devLine = formatStatus(devBranch, devRemoteRef, devDiv.ahead, devDiv.behind);

    // Detect squash-merge divergence: dev is both ahead AND behind main
    if (!isContributor && devDiv.ahead > 0 && devDiv.behind > 0) {
      devLine += pc.red(' (needs sync! squash-merge divergence detected)');
    } else if (devDiv.ahead > 0 && devDiv.behind === 0) {
      devLine += pc.yellow(' (needs sync!)');
    }
    console.log(devLine);

    // Current feature branch (if not on main or dev)
    if (currentBranch && currentBranch !== mainBranch && currentBranch !== devBranch) {
      const branchDiv = await getDivergence(currentBranch, devBranch);
      const branchLine = formatStatus(currentBranch, devBranch, branchDiv.ahead, branchDiv.behind);
      console.log(branchLine + pc.dim(` (current ${pc.green('*')})`));
    } else if (currentBranch) {
      // Mark current branch
      if (currentBranch === mainBranch) {
        console.log(pc.dim(`  (on ${pc.bold(mainBranch)} branch)`));
      } else if (currentBranch === devBranch) {
        console.log(pc.dim(`  (on ${pc.bold(devBranch)} branch)`));
      }
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
