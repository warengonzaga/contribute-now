import type { ContributeConfig, WorkflowMode } from '../types.js';

/**
 * Workflow mode descriptions for display and selection.
 *
 * Clean Flow — by WGTech Labs (https://github.com/wgtechlabs)
 *   main + dev branches. Feature branches squash-merge into dev,
 *   dev merges into main with merge commits. Clean history, no divergence.
 *
 * GitHub Flow
 *   Single main branch. Feature branches squash/merge directly into main.
 *   Simplest model for small projects and OSS.
 *
 * Git Flow
 *   main + develop + release + hotfix branches. Full-ceremony branching
 *   model for versioned software with multiple supported releases.
 */
export const WORKFLOW_DESCRIPTIONS: Record<WorkflowMode, string> = {
  'clean-flow': 'Clean Flow — main + dev, squash features into dev, merge dev into main',
  'github-flow': 'GitHub Flow — main + feature branches, squash/merge into main',
  'git-flow': 'Git Flow — main + develop + release + hotfix branches',
};

/**
 * Returns the base branch that feature branches should be created from
 * and that PRs should target.
 */
export function getBaseBranch(config: ContributeConfig): string {
  switch (config.workflow) {
    case 'clean-flow':
    case 'git-flow':
      return config.devBranch ?? 'dev';
    case 'github-flow':
      return config.mainBranch;
  }
}

/**
 * Returns whether the workflow uses a separate dev/develop branch.
 */
export function hasDevBranch(workflow: WorkflowMode): boolean {
  return workflow === 'clean-flow' || workflow === 'git-flow';
}

/**
 * Returns the remote ref that dev should be compared against for sync.
 *
 * - Clean Flow maintainer: pull (fast-forward) from origin/dev
 * - Clean Flow contributor: pull from upstream/dev
 * - GitHub Flow: fetch origin/main
 * - Git Flow: pull from origin/develop
 */
export function getSyncSource(config: ContributeConfig): {
  remote: string;
  ref: string;
  strategy: 'pull' | 'reset';
} {
  const { workflow, role, mainBranch, origin, upstream } = config;
  const devBranch = config.devBranch ?? 'dev';

  switch (workflow) {
    case 'clean-flow':
      if (role === 'contributor') {
        return { remote: upstream, ref: `${upstream}/${devBranch}`, strategy: 'pull' };
      }
      return { remote: origin, ref: `${origin}/${devBranch}`, strategy: 'pull' };

    case 'github-flow':
      if (role === 'contributor') {
        return { remote: upstream, ref: `${upstream}/${mainBranch}`, strategy: 'pull' };
      }
      return { remote: origin, ref: `${origin}/${mainBranch}`, strategy: 'pull' };

    case 'git-flow':
      if (role === 'contributor') {
        return { remote: upstream, ref: `${upstream}/${devBranch}`, strategy: 'pull' };
      }
      return { remote: origin, ref: `${origin}/${devBranch}`, strategy: 'pull' };
  }
}

/**
 * Returns the list of protected branches that should never be deleted.
 * For git-flow, this also protects release/* and hotfix/* prefixes.
 */
export function getProtectedBranches(config: ContributeConfig): string[] {
  const branches = [config.mainBranch];
  if (hasDevBranch(config.workflow) && config.devBranch) {
    branches.push(config.devBranch);
  }
  return branches;
}

/**
 * Returns prefixes for branches that are protected in the given workflow.
 * For git-flow, release/* and hotfix/* branches are semantically protected
 * and should not be deleted by `contrib clean`.
 */
export function getProtectedPrefixes(config: ContributeConfig): string[] {
  if (config.workflow === 'git-flow') {
    return ['release/', 'hotfix/'];
  }
  return [];
}

/**
 * Returns true if the given branch name is protected (either exact match
 * or matches a protected prefix pattern like release/* or hotfix/*).
 */
export function isBranchProtected(branch: string, config: ContributeConfig): boolean {
  const protectedBranches = getProtectedBranches(config);
  if (protectedBranches.includes(branch)) return true;

  const protectedPrefixes = getProtectedPrefixes(config);
  return protectedPrefixes.some((prefix) => branch.startsWith(prefix));
}
