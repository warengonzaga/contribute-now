import { execFile as execFileCb } from 'node:child_process';

function run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFileCb('gh', args, (error, stdout, stderr) => {
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

export async function checkGhInstalled(): Promise<boolean> {
  try {
    const { exitCode } = await run(['--version']);
    return exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkGhAuth(): Promise<boolean> {
  try {
    const { exitCode } = await run(['auth', 'status']);
    return exitCode === 0;
  } catch {
    return false;
  }
}

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

const SAFE_SLUG = /^[\w.-]+$/;

export async function checkRepoPermissions(
  owner: string,
  repo: string,
): Promise<RepoPermissions | null> {
  if (!SAFE_SLUG.test(owner) || !SAFE_SLUG.test(repo)) return null;
  const { exitCode, stdout } = await run(['api', `repos/${owner}/${repo}`, '--jq', '.permissions']);
  if (exitCode !== 0) return null;
  try {
    return JSON.parse(stdout.trim()) as RepoPermissions;
  } catch {
    return null;
  }
}

export async function isRepoFork(): Promise<boolean | null> {
  const { exitCode, stdout } = await run(['repo', 'view', '--json', 'isFork', '-q', '.isFork']);
  if (exitCode !== 0) return null;
  const val = stdout.trim();
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

export async function getCurrentRepoInfo(): Promise<{ owner: string; repo: string } | null> {
  const { exitCode, stdout } = await run([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '-q',
    '.nameWithOwner',
  ]);
  if (exitCode !== 0) return null;
  const nameWithOwner = stdout.trim();
  if (!nameWithOwner) return null;
  const [owner, repo] = nameWithOwner.split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

export async function createPR(options: {
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = [
    'pr',
    'create',
    '--base',
    options.base,
    '--title',
    options.title,
    '--body',
    options.body,
  ];
  if (options.draft) args.push('--draft');
  return run(args);
}

export async function createPRFill(
  base: string,
  draft?: boolean,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = ['pr', 'create', '--base', base, '--fill'];
  if (draft) args.push('--draft');
  return run(args);
}

export interface ExistingPR {
  number: number;
  url: string;
  title: string;
  state: string;
}

/**
 * Check if an open PR already exists for the given head branch.
 * Returns the PR info if found, or null if none exists.
 */
export async function getPRForBranch(headBranch: string): Promise<ExistingPR | null> {
  const { exitCode, stdout } = await run([
    'pr',
    'list',
    '--head',
    headBranch,
    '--state',
    'open',
    '--json',
    'number,url,title,state',
    '--limit',
    '1',
  ]);
  if (exitCode !== 0) return null;
  try {
    const prs = JSON.parse(stdout.trim()) as ExistingPR[];
    return prs.length > 0 ? prs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Check if a merged PR exists for the given head branch.
 * Returns the PR info if found, or null if none exists.
 */
export async function getMergedPRForBranch(headBranch: string): Promise<ExistingPR | null> {
  const { exitCode, stdout } = await run([
    'pr',
    'list',
    '--head',
    headBranch,
    '--state',
    'merged',
    '--json',
    'number,url,title,state',
    '--limit',
    '1',
  ]);
  if (exitCode !== 0) return null;
  try {
    const prs = JSON.parse(stdout.trim()) as ExistingPR[];
    return prs.length > 0 ? prs[0] : null;
  } catch {
    return null;
  }
}
