import { execFile as execFileCb } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GitResult } from '../types.js';

function run(args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFileCb('git', args, (error, stdout, stderr) => {
      resolve({
        exitCode: error
          ? (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 127
            : ((error as { status?: number }).status ?? 1)
          : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
      });
    });
  });
}

export async function isGitRepo(): Promise<boolean> {
  const { exitCode } = await run(['rev-parse', '--is-inside-work-tree']);
  return exitCode === 0;
}

export async function getCurrentBranch(): Promise<string | null> {
  const { exitCode, stdout } = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

export async function getRemotes(): Promise<string[]> {
  const { exitCode, stdout } = await run(['remote']);
  if (exitCode !== 0) return [];
  return stdout
    .trim()
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

export async function getRemoteUrl(remote: string): Promise<string | null> {
  const { exitCode, stdout } = await run(['remote', 'get-url', remote]);
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

export async function hasUncommittedChanges(): Promise<boolean> {
  const { exitCode, stdout } = await run(['status', '--porcelain']);
  if (exitCode !== 0) return false;
  return stdout.trim().length > 0;
}

export async function branchExists(branch: string): Promise<boolean> {
  const { exitCode } = await run(['rev-parse', '--verify', branch]);
  return exitCode === 0;
}

export async function commitsBetween(base: string, head: string): Promise<string[]> {
  const { exitCode, stdout } = await run(['log', `${base}..${head}`, '--oneline']);
  if (exitCode !== 0) return [];
  return stdout.trim().split('\n').filter(Boolean);
}

export async function fetchRemote(remote: string): Promise<GitResult> {
  return run(['fetch', remote]);
}

export async function fetchAll(): Promise<GitResult> {
  return run(['fetch', '--all', '--quiet']);
}

export async function checkoutBranch(branch: string): Promise<GitResult> {
  return run(['checkout', branch]);
}

export async function createBranch(branch: string, from?: string): Promise<GitResult> {
  const args = from ? ['checkout', '-b', branch, from] : ['checkout', '-b', branch];
  return run(args);
}

export async function resetHard(ref: string): Promise<GitResult> {
  return run(['reset', '--hard', ref]);
}

/**
 * Move a local branch ref to point at a given target without checking it out.
 * Uses `git branch -f <branch> <target>`. Safe to call while on a different branch.
 * If you ARE on the target branch, falls back to `git reset --hard`.
 */
export async function updateLocalBranch(branch: string, target: string): Promise<GitResult> {
  const current = await getCurrentBranch();
  if (current === branch) {
    // Already on this branch, use reset --hard instead
    return resetHard(target);
  }
  return run(['branch', '-f', branch, target]);
}

export async function pushSetUpstream(remote: string, branch: string): Promise<GitResult> {
  return run(['push', '-u', remote, branch]);
}

export async function rebase(branch: string): Promise<GitResult> {
  return run(['rebase', branch]);
}

/** Returns the upstream tracking ref for the current branch (e.g. "origin/feature/git-add"), or null if none. */
export async function getUpstreamRef(): Promise<string | null> {
  const { exitCode, stdout } = await run([
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{u}',
  ]);
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

/** Unset the upstream tracking ref for the current branch. */
export async function unsetUpstream(): Promise<GitResult> {
  return run(['branch', '--unset-upstream']);
}

/** Rebases commits not in `oldBase` onto `newBase` (git rebase --onto newBase oldBase). */
export async function rebaseOnto(newBase: string, oldBase: string): Promise<GitResult> {
  return run(['rebase', '--onto', newBase, oldBase]);
}

/**
 * Returns the merge-base (common ancestor) of two refs.
 * This is the commit where the branch originally forked from.
 */
export async function getMergeBase(ref1: string, ref2: string): Promise<string | null> {
  const { exitCode, stdout } = await run(['merge-base', ref1, ref2]);
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

/**
 * Returns the full commit hash for a ref.
 */
export async function getCommitHash(ref: string): Promise<string | null> {
  const { exitCode, stdout } = await run(['rev-parse', ref]);
  if (exitCode !== 0) return null;
  return stdout.trim() || null;
}

/**
 * Determine the correct rebase strategy for updating a feature branch.
 *
 * Scenarios:
 * 1. No upstream tracking ref → plain rebase onto syncRef
 * 2. Upstream is the remote copy of the same branch (e.g. origin/feature/xyz)
 *    → plain rebase onto syncRef (the branch was created from the base branch)
 * 3. Upstream tracks a DIFFERENT branch (e.g. branch was based on another feature
 *    that has since been merged) → use --onto to only replay commits unique to this branch
 *
 * The key insight: we use merge-base to find where the branch actually forked from.
 * If the fork point is reachable from the base branch, a plain rebase is safe.
 * If not, we need --onto to avoid replaying already-merged commits.
 */
export async function determineRebaseStrategy(
  currentBranch: string,
  syncRef: string,
): Promise<{ strategy: 'plain' | 'onto'; ontoOldBase?: string }> {
  const upstreamRef = await getUpstreamRef();

  // No upstream tracking → plain rebase
  if (!upstreamRef) {
    return { strategy: 'plain' };
  }

  // Validate the upstream ref still resolves to a real commit.
  // After branch rename from a stale branch, the upstream may point to a
  // deleted remote branch (e.g. origin/feature/old-branch that was pruned).
  const upstreamHash = await getCommitHash(upstreamRef);
  if (!upstreamHash) {
    // Upstream ref is stale/gone — treat as no upstream
    return { strategy: 'plain' };
  }

  // Extract the branch name from the upstream ref (e.g. "origin/feature/xyz" → "feature/xyz")
  const slashIdx = upstreamRef.indexOf('/');
  const upstreamBranchName = slashIdx !== -1 ? upstreamRef.slice(slashIdx + 1) : upstreamRef;

  // If upstream is just the remote copy of the same branch → plain rebase
  // e.g. branch "feature/xyz" tracking "origin/feature/xyz"
  if (upstreamBranchName === currentBranch) {
    return { strategy: 'plain' };
  }

  // Upstream tracks a different branch. Check if our fork point is still
  // reachable from the sync target (meaning our base hasn't changed).
  const [forkFromUpstream, forkFromSync] = await Promise.all([
    getMergeBase('HEAD', upstreamRef),
    getMergeBase('HEAD', syncRef),
  ]);

  // If both merge-bases are the same, the branch history is compatible → plain rebase
  if (forkFromUpstream && forkFromSync && forkFromUpstream === forkFromSync) {
    return { strategy: 'plain' };
  }

  // The branch was forked from somewhere that's not the current sync target.
  // Use --onto to transplant only our unique commits.
  // Use the merge-base with the upstream ref as the old base, so we only replay
  // commits that are unique to this branch (not the ones from the old base).
  if (forkFromUpstream) {
    return { strategy: 'onto', ontoOldBase: forkFromUpstream };
  }

  // Fallback: can't determine — play it safe with plain rebase
  return { strategy: 'plain' };
}

export async function getStagedDiff(): Promise<string> {
  const { stdout } = await run(['diff', '--cached']);
  return stdout;
}

export async function getStagedFiles(): Promise<string[]> {
  const { exitCode, stdout } = await run(['diff', '--cached', '--name-only']);
  if (exitCode !== 0) return [];
  return stdout.trim().split('\n').filter(Boolean);
}

export async function getChangedFiles(): Promise<string[]> {
  const { exitCode, stdout } = await run(['status', '--porcelain']);
  if (exitCode !== 0) return [];
  return stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      // Strip trailing \r (Windows CRLF compat)
      const line = l.replace(/\r$/, '');
      // Porcelain format: XY PATH — match 2-char status code + whitespace
      const match = line.match(/^..\s+(.*)/);
      if (!match) return '';
      const file = match[1];
      // Handle renames: "old -> new" — use the new name
      const renameIdx = file.indexOf(' -> ');
      return renameIdx !== -1 ? file.slice(renameIdx + 4) : file;
    })
    .filter(Boolean);
}

export async function getDivergence(
  branch: string,
  base: string,
): Promise<{ ahead: number; behind: number }> {
  const { exitCode, stdout } = await run([
    'rev-list',
    '--left-right',
    '--count',
    `${base}...${branch}`,
  ]);
  if (exitCode !== 0) return { ahead: 0, behind: 0 };
  const parts = stdout.trim().split(/\s+/);
  return {
    behind: Number.parseInt(parts[0] ?? '0', 10),
    ahead: Number.parseInt(parts[1] ?? '0', 10),
  };
}

export async function getMergedBranches(base: string): Promise<string[]> {
  const { exitCode, stdout } = await run(['branch', '--merged', base]);
  if (exitCode !== 0) return [];
  return stdout
    .trim()
    .split('\n')
    .map((b) => b.replace(/^\*?\s+/, '').trim())
    .filter(Boolean);
}

/**
 * Returns local branches whose remote tracking branch has been deleted.
 * After `git fetch --prune`, branches with upstream set to `[gone]` are
 * stale — typically because the remote branch was deleted after a merge.
 * This catches squash-merged branches that `git branch --merged` misses.
 */
export async function getGoneBranches(): Promise<string[]> {
  // `git branch -vv` shows tracking info like [origin/branch: gone]
  const { exitCode, stdout } = await run(['branch', '-vv']);
  if (exitCode !== 0) return [];
  return stdout
    .trimEnd()
    .split('\n')
    .filter((line) => line.includes(': gone]'))
    .map((line) => line.replace(/^\*?\s+/, '').split(/\s+/)[0])
    .filter(Boolean);
}

export async function deleteBranch(branch: string): Promise<GitResult> {
  return run(['branch', '-d', branch]);
}

/**
 * Force-delete a local branch even if it hasn't been fully merged.
 * Required after squash merges where git can't detect the merge.
 */
export async function forceDeleteBranch(branch: string): Promise<GitResult> {
  return run(['branch', '-D', branch]);
}

/**
 * Rename a local branch. Preserves all commits and uncommitted changes.
 * If renaming the current branch, just pass the new name.
 */
export async function renameBranch(oldName: string, newName: string): Promise<GitResult> {
  return run(['branch', '-m', oldName, newName]);
}

/**
 * Check if the current branch has local work that would be lost if deleted.
 * Returns true if there are uncommitted changes OR unpushed commits
 * (commits ahead of the remote tracking branch).
 */
export async function hasLocalWork(
  remote: string,
  branch: string,
): Promise<{
  uncommitted: boolean;
  unpushedCommits: number;
}> {
  const uncommitted = await hasUncommittedChanges();
  const trackingRef = `${remote}/${branch}`;
  // Check for commits that exist locally but not on remote
  const { exitCode, stdout } = await run(['rev-list', '--count', `${trackingRef}..${branch}`]);
  const unpushedCommits = exitCode === 0 ? Number.parseInt(stdout.trim(), 10) || 0 : 0;
  return { uncommitted, unpushedCommits };
}

export async function deleteRemoteBranch(remote: string, branch: string): Promise<GitResult> {
  return run(['push', remote, '--delete', branch]);
}

export async function mergeSquash(branch: string): Promise<GitResult> {
  return run(['merge', '--squash', branch]);
}

export async function pushBranch(remote: string, branch: string): Promise<GitResult> {
  return run(['push', remote, branch]);
}

export async function pruneRemote(remote: string): Promise<GitResult> {
  return run(['remote', 'prune', remote]);
}

export async function commitWithMessage(message: string): Promise<GitResult> {
  return run(['commit', '-m', message]);
}

export async function getLogDiff(base: string, head: string): Promise<string> {
  const { stdout } = await run(['diff', `${base}...${head}`]);
  return stdout;
}

export async function getLog(base: string, head: string): Promise<string[]> {
  const { exitCode, stdout } = await run(['log', `${base}..${head}`, '--oneline']);
  if (exitCode !== 0) return [];
  return stdout.trim().split('\n').filter(Boolean);
}

export async function pullBranch(remote: string, branch: string): Promise<GitResult> {
  return run(['pull', remote, branch]);
}

export async function stageFiles(files: string[]): Promise<GitResult> {
  return run(['add', '--', ...files]);
}

export async function unstageFiles(files: string[]): Promise<GitResult> {
  return run(['reset', 'HEAD', '--', ...files]);
}

export async function stageAll(): Promise<GitResult> {
  return run(['add', '-A']);
}

export async function getDiffForFiles(files: string[]): Promise<string> {
  const { stdout } = await run(['diff', '--', ...files]);
  return stdout;
}

/**
 * Returns the combined staged + unstaged diff for the given files.
 * For untracked files (no diff output), includes file content as context.
 */
export async function getFullDiffForFiles(files: string[]): Promise<string> {
  const [unstaged, staged, untracked] = await Promise.all([
    run(['diff', '--', ...files]),
    run(['diff', '--cached', '--', ...files]),
    getUntrackedFiles(),
  ]);

  const parts = [staged.stdout, unstaged.stdout].filter(Boolean);

  // For untracked files, git diff produces nothing — read content directly
  const untrackedSet = new Set(untracked);
  const MAX_FILE_CONTENT = 2000;
  for (const file of files) {
    if (untrackedSet.has(file)) {
      try {
        const content = readFileSync(join(process.cwd(), file), 'utf-8');
        const truncated =
          content.length > MAX_FILE_CONTENT
            ? `${content.slice(0, MAX_FILE_CONTENT)}\n... (truncated)`
            : content;
        // Format as a pseudo-diff so the AI understands it's a new file
        const lines = truncated.split('\n').map((l) => `+${l}`);
        parts.push(
          `diff --git a/${file} b/${file}\nnew file\n--- /dev/null\n+++ b/${file}\n${lines.join('\n')}`,
        );
      } catch {
        // If we can't read the file (binary, etc.), skip it
      }
    }
  }

  return parts.join('\n');
}

/**
 * Returns a list of untracked files (not yet added to the index).
 */
export async function getUntrackedFiles(): Promise<string[]> {
  const { exitCode, stdout } = await run(['ls-files', '--others', '--exclude-standard']);
  if (exitCode !== 0) return [];
  return stdout.trim().split('\n').filter(Boolean);
}

export interface FileStatus {
  staged: { file: string; status: string }[];
  modified: { file: string; status: string }[];
  untracked: string[];
}

/**
 * Parse `git status --porcelain` into categorized file lists.
 * - staged: files in the index (ready to commit)
 * - modified: tracked files with unstaged changes
 * - untracked: new files not yet tracked
 */
export async function getFileStatus(): Promise<FileStatus> {
  const { exitCode, stdout } = await run(['status', '--porcelain']);
  if (exitCode !== 0) return { staged: [], modified: [], untracked: [] };

  const result: FileStatus = { staged: [], modified: [], untracked: [] };
  const STATUS_LABELS: Record<string, string> = {
    A: 'new file',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    T: 'type changed',
  };

  for (const raw of stdout.trimEnd().split('\n').filter(Boolean)) {
    const line = raw.replace(/\r$/, '');
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const pathPart = line.slice(3);
    // Handle renames: "old -> new"
    const renameIdx = pathPart.indexOf(' -> ');
    const file = renameIdx !== -1 ? pathPart.slice(renameIdx + 4) : pathPart;

    if (indexStatus === '?' && workTreeStatus === '?') {
      result.untracked.push(file);
      continue;
    }

    // Index status (staged)
    if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
      result.staged.push({ file, status: STATUS_LABELS[indexStatus] ?? indexStatus });
    }

    // Work-tree status (unstaged modifications)
    if (workTreeStatus && workTreeStatus !== ' ' && workTreeStatus !== '?') {
      result.modified.push({ file, status: STATUS_LABELS[workTreeStatus] ?? workTreeStatus });
    }
  }

  return result;
}
