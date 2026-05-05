import { execFile as execFileCb } from 'node:child_process';
import { warn } from './logger.js';

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
 * Uses a high limit in a single call for broad compatibility across
 * GitHub CLI versions (some versions do not support pagination flags here).
 */
export async function getRepoLabels(): Promise<LabelInfo[]> {
  const FETCH_LIMIT = 1000;

  const { exitCode, stdout } = await run([
    'label',
    'list',
    '--json',
    'name,description,color',
    '--limit',
    String(FETCH_LIMIT),
  ]);

  if (exitCode !== 0) {
    return [];
  }

  let parsed: Array<{ name?: unknown; description?: unknown; color?: unknown }> = [];
  try {
    parsed = JSON.parse(stdout.trim()) as typeof parsed;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }

  if (parsed.length >= FETCH_LIMIT) {
    warn(
      `Repository has at least ${FETCH_LIMIT} labels (fetch limit). Some labels may not appear in suggestions. Consider reviewing your label set.`,
    );
  }

  return parsed
    .filter((item): item is { name: string; description?: unknown; color?: unknown } => {
      return typeof item.name === 'string' && item.name.trim().length > 0;
    })
    .map((item) => ({
      name: item.name.trim(),
      description: typeof item.description === 'string' ? item.description.trim() : '',
      color: typeof item.color === 'string' ? item.color.trim().replace(/^#/, '') : '',
    }));
}

export interface IssueOrPRContent {
  title: string;
  body: string;
}

export interface IssueOrPRDetails extends IssueOrPRContent {
  labels: string[];
}

export interface WorkItemSummary {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

function parseLabelNames(rawLabels: unknown): string[] {
  if (!Array.isArray(rawLabels)) {
    return [];
  }

  const names: string[] = [];
  for (const label of rawLabels) {
    if (typeof label === 'object' && label !== null) {
      const name = (label as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) {
        names.push(name.trim());
      }
    }
  }

  return names;
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
 * Fetch the title, body, and labels of a GitHub issue.
 */
export async function getIssueDetails(issueNumber: number): Promise<IssueOrPRDetails | null> {
  const { exitCode, stdout } = await run([
    'issue',
    'view',
    String(issueNumber),
    '--json',
    'title,body,labels',
  ]);
  if (exitCode !== 0) return null;
  try {
    const parsed = JSON.parse(stdout.trim()) as {
      title?: unknown;
      body?: unknown;
      labels?: unknown;
    };

    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      labels: parseLabelNames(parsed.labels),
    };
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
 * Fetch the title, body, and labels of a GitHub pull request.
 */
export async function getPRDetails(prNumber: number): Promise<IssueOrPRDetails | null> {
  const { exitCode, stdout } = await run([
    'pr',
    'view',
    String(prNumber),
    '--json',
    'title,body,labels',
  ]);
  if (exitCode !== 0) return null;
  try {
    const parsed = JSON.parse(stdout.trim()) as {
      title?: unknown;
      body?: unknown;
      labels?: unknown;
    };

    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      labels: parseLabelNames(parsed.labels),
    };
  } catch {
    return null;
  }
}

async function listOpenWorkItems(
  type: 'issue' | 'pr',
  limit: number,
): Promise<WorkItemSummary[]> {
  const { exitCode, stdout } = await run([
    type,
    'list',
    '--state',
    'open',
    '--limit',
    String(limit),
    '--json',
    'number,title,body,labels',
  ]);
  if (exitCode !== 0) return [];

  let parsed: Array<{ number?: unknown; title?: unknown; body?: unknown; labels?: unknown }> = [];
  try {
    parsed = JSON.parse(stdout.trim()) as typeof parsed;
  } catch {
    return [];
  }

  return parsed
    .filter(
      (item): item is { number: number; title?: unknown; body?: unknown; labels?: unknown } => {
        return typeof item.number === 'number' && Number.isInteger(item.number) && item.number > 0;
      },
    )
    .map((item) => ({
      number: item.number,
      title: typeof item.title === 'string' ? item.title : '',
      body: typeof item.body === 'string' ? item.body : '',
      labels: parseLabelNames(item.labels),
    }));
}

/**
 * List open GitHub issues with title/body/labels for bulk label operations.
 */
export async function listOpenIssues(limit: number): Promise<WorkItemSummary[]> {
  return listOpenWorkItems('issue', limit);
}

/**
 * List open GitHub pull requests with title/body/labels for bulk label operations.
 */
export async function listOpenPRs(limit: number): Promise<WorkItemSummary[]> {
  return listOpenWorkItems('pr', limit);
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
