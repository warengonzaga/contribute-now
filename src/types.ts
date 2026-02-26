export type WorkflowMode = 'clean-flow' | 'github-flow' | 'git-flow';

export type CommitConvention = 'conventional' | 'clean-commit' | 'none';

export interface ContributeConfig {
  workflow: WorkflowMode;
  role: 'maintainer' | 'contributor';
  mainBranch: string;
  devBranch?: string;
  upstream: string;
  origin: string;
  branchPrefixes: string[];
  commitConvention: CommitConvention;
}

export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}
