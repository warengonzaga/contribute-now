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

export interface LabelInfo {
  name: string;
  description: string;
  color: string;
}

/**
 * Fetch all labels defined in the current repository.
 * Paginates automatically so repos with more than the default page size still
 * return the full label set.
 */
export async function getRepoLabels(): Promise<LabelInfo[]> {
  const PAGE_SIZE = 100;
  const allLabels: LabelInfo[] = [];
  let page = 1;

  while (true) {
    const { exitCode, stdout } = await run([
      'label',
      'list',
      '--json',
      'name,description,color',
      '--limit',
      String(PAGE_SIZE),
      '--page',
      String(page),
    ]);

    if (exitCode !== 0) break;

    let batch: Array<{ name?: unknown; description?: unknown; color?: unknown }> = [];
    try {
      batch = JSON.parse(stdout.trim()) as typeof batch;
    } catch {
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const item of batch) {
      if (typeof item.name === 'string' && item.name.trim().length > 0) {
        allLabels.push({
          name: item.name.trim(),
          description: typeof item.description === 'string' ? item.description.trim() : '',
          color: typeof item.color === 'string' ? item.color.trim().replace(/^#/, '') : '',
        });
      }
    }

    // If the batch was smaller than the page size we've received the last page.
    if (batch.length < PAGE_SIZE) break;

    page++;
  }

  return allLabels;
}

export interface IssueOrPRContent {
  title: string;
  body: string;
}

/**
 * Fetch the title and body of a GitHub issue.
 */
export async function getIssueContent(issueNumber: number): Promise<IssueOrPRContent | null> {
  const { exitCode, stdout } = await run([
    'issue',
    'view',
    String(issueNumber),
    '--json',
    'title,body',
  ]);
  if (exitCode !== 0) return null;
  try {
    const parsed = JSON.parse(stdout.trim()) as { title?: unknown; body?: unknown };
    const title = typeof parsed.title === 'string' ? parsed.title : '';
    const body = typeof parsed.body === 'string' ? parsed.body : '';
    return { title, body };
  } catch {
    return null;
  }
}

/**
 * Fetch the title and body of a GitHub pull request.
 */
export async function getPRContent(prNumber: number): Promise<IssueOrPRContent | null> {
  const { exitCode, stdout } = await run(['pr', 'view', String(prNumber), '--json', 'title,body']);
  if (exitCode !== 0) return null;
  try {
    const parsed = JSON.parse(stdout.trim()) as { title?: unknown; body?: unknown };
    const title = typeof parsed.title === 'string' ? parsed.title : '';
    const body = typeof parsed.body === 'string' ? parsed.body : '';
    return { title, body };
  } catch {
    return null;
  }
}

/**
 * Apply one or more labels to a GitHub issue.
 * Labels must already exist in the repository.
 */
export async function addLabelsToIssue(
  issueNumber: number,
  labels: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return run(['issue', 'edit', String(issueNumber), '--add-label', labels.join(',')]);
}

/**
 * Apply one or more labels to a GitHub pull request.
 * Labels must already exist in the repository.
 */
export async function addLabelsToPR(
  prNumber: number,
  labels: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return run(['pr', 'edit', String(prNumber), '--add-label', labels.join(',')]);
}
