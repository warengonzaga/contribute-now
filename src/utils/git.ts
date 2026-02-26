import { execFile as execFileCb } from 'node:child_process';
import type { GitResult } from '../types.js';

function run(args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFileCb('git', args, (error, stdout, stderr) => {
      resolve({
        exitCode: error
          ? (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 127
            : (error as NodeJS.ErrnoException).code != null
              ? Number((error as NodeJS.ErrnoException).code)
              : 1
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
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3));
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
