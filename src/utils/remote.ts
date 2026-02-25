import type { RepoInfo } from '../types.js';
import { getRemotes, getRemoteUrl } from './git.js';

export function parseRepoFromUrl(url: string): RepoInfo | null {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  // SSH: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

export interface ForkSetup {
  isFork: boolean;
  originRemote: string | null;
  upstreamRemote: string | null;
}

export async function detectForkSetup(): Promise<ForkSetup> {
  const remotes = await getRemotes();
  const hasOrigin = remotes.includes('origin');
  const hasUpstream = remotes.includes('upstream');

  return {
    isFork: hasUpstream,
    originRemote: hasOrigin ? 'origin' : null,
    upstreamRemote: hasUpstream ? 'upstream' : null,
  };
}

export async function getRepoInfoFromRemote(remote = 'origin'): Promise<RepoInfo | null> {
  const url = await getRemoteUrl(remote);
  if (!url) return null;
  return parseRepoFromUrl(url);
}
