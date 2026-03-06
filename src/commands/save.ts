import { defineCommand } from 'citty';
import pc from 'picocolors';
import { selectPrompt } from '../utils/confirm.js';
import { getCurrentBranch, isGitRepo } from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import type { GitResult } from '../types.js';
import { execFile as execFileCb } from 'node:child_process';

function gitRun(args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFileCb('git', args, (err, stdout, stderr) => {
      resolve({
        exitCode: err
          ? (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? 127
            : ((err as { status?: number }).status ?? 1)
          : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
      });
    });
  });
}

export default defineCommand({
  meta: {
    name: 'save',
    description: 'Save, restore, or manage uncommitted changes',
  },
  args: {
    action: {
      type: 'positional',
      description: 'Action: save (default), restore, list, drop',
      required: false,
    },
    message: {
      type: 'string',
      alias: 'm',
      description: 'Description for saved changes',
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const action = args.action ?? 'save';

    switch (action) {
      case 'save':
        await handleSave(args.message);
        break;
      case 'restore':
        await handleRestore();
        break;
      case 'list':
        await handleList();
        break;
      case 'drop':
        await handleDrop();
        break;
      default:
        error(`Unknown action: ${action}. Use save, restore, list, or drop.`);
        process.exit(1);
    }
  },
});

// ── Save ──
async function handleSave(message?: string) {
  heading('💾 contrib save');

  const currentBranch = await getCurrentBranch();
  const label = message ?? `work-in-progress on ${currentBranch ?? 'unknown'}`;
  const stashMsg = `contrib-save: ${label}`;

  const result = await gitRun(['stash', 'push', '-m', stashMsg]);
  if (result.exitCode !== 0) {
    error(`Failed to save: ${result.stderr}`);
    process.exit(1);
  }

  if (result.stdout.includes('No local changes to save')) {
    info('No uncommitted changes to save.');
    return;
  }

  success(`Saved: ${pc.dim(label)}`);
  info(`Use ${pc.bold('contrib save restore')} to bring them back.`);
}

// ── Restore ──
async function handleRestore() {
  heading('💾 contrib save restore');

  const stashes = await getStashList();
  if (stashes.length === 0) {
    info('No saved changes found.');
    return;
  }

  if (stashes.length === 1) {
    const result = await gitRun(['stash', 'pop', 'stash@{0}']);
    if (result.exitCode !== 0) {
      error(`Failed to restore: ${result.stderr}`);
      warn('You may have conflicts. Resolve them and run `git stash drop` when done.');
      process.exit(1);
    }
    success(`Restored: ${pc.dim(stashes[0].message)}`);
    return;
  }

  // Multiple stashes — let user pick
  const choices = stashes.map((s) => `${s.index}  ${s.message}`);
  const selected = await selectPrompt('Which save to restore?', choices);
  const idx = selected.split(/\s{2,}/)[0].trim();

  const result = await gitRun(['stash', 'pop', `stash@{${idx}}`]);
  if (result.exitCode !== 0) {
    error(`Failed to restore: ${result.stderr}`);
    warn('You may have conflicts. Resolve them and run `git stash drop` when done.');
    process.exit(1);
  }
  const match = stashes.find((s) => String(s.index) === idx);
  success(`Restored: ${pc.dim(match?.message ?? 'saved changes')}`);
}

// ── List ──
async function handleList() {
  heading('💾 contrib save list');

  const stashes = await getStashList();
  if (stashes.length === 0) {
    info('No saved changes.');
    return;
  }

  console.log();
  for (const s of stashes) {
    const idx = pc.dim(`[${s.index}]`);
    const msg = s.message;
    console.log(`  ${idx}  ${msg}`);
  }
  console.log();
  info(`Use ${pc.bold('contrib save restore')} to bring changes back.`);
  info(`Use ${pc.bold('contrib save drop')} to discard saved changes.`);
}

// ── Drop ──
async function handleDrop() {
  heading('💾 contrib save drop');

  const stashes = await getStashList();
  if (stashes.length === 0) {
    info('No saved changes to drop.');
    return;
  }

  const choices = stashes.map((s) => `${s.index}  ${s.message}`);
  const selected = await selectPrompt('Which save to drop?', choices);
  const idx = selected.split(/\s{2,}/)[0].trim();

  const result = await gitRun(['stash', 'drop', `stash@{${idx}}`]);
  if (result.exitCode !== 0) {
    error(`Failed to drop: ${result.stderr}`);
    process.exit(1);
  }
  const match = stashes.find((s) => String(s.index) === idx);
  success(`Dropped: ${pc.dim(match?.message ?? 'saved changes')}`);
}

// ── Helpers ──
interface StashEntry {
  index: number;
  message: string;
}

async function getStashList(): Promise<StashEntry[]> {
  const result = await gitRun(['stash', 'list']);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  return result.stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // Format: "stash@{0}: On branch: message"
      const idxMatch = line.match(/^stash@\{(\d+)\}/);
      const index = idxMatch ? Number.parseInt(idxMatch[1], 10) : 0;
      // Extract the message after the last colon-space
      const parts = line.split(': ');
      const message = parts.length > 2 ? parts.slice(2).join(': ') : parts[parts.length - 1];
      return { index, message };
    });
}
