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
