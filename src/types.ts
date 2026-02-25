export interface ContributeConfig {
  role: 'maintainer' | 'contributor';
  mainBranch: string;
  devBranch: string;
  upstream: string;
  origin: string;
  branchPrefixes: string[];
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
