import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { ContributeConfig } from '../types.js';
import { getDefaultConfig, isGitignored, writeConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import {
  checkGhAuth,
  checkGhInstalled,
  checkRepoPermissions,
  getCurrentRepoInfo,
  isRepoFork,
} from '../utils/gh.js';
import { getRemotes, getRemoteUrl, isGitRepo } from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { parseRepoFromUrl } from '../utils/remote.js';

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Initialize contribute-now config for this repo (.contributerc.json)',
  },
  async run() {
    // 1. Verify inside a git repo
    if (!(await isGitRepo())) {
      error('Not inside a git repository. Run this command from within a git repo.');
      process.exit(1);
    }

    heading('🔧 contribute-now setup');

    // 2. Detect remotes
    const remotes = await getRemotes();
    if (remotes.length === 0) {
      error('No git remotes found. Add a remote first (e.g., git remote add origin <url>).');
      process.exit(1);
    }

    info(`Found remotes: ${remotes.join(', ')}`);

    // 3. Auto-detect role (layered approach)
    let detectedRole: 'maintainer' | 'contributor' | null = null;
    let detectionSource = '';

    // Layer 1: gh CLI
    const ghInstalled = await checkGhInstalled();
    if (ghInstalled && (await checkGhAuth())) {
      const isFork = await isRepoFork();
      if (isFork === true) {
        detectedRole = 'contributor';
        detectionSource = 'gh CLI (fork detected)';
      } else if (isFork === false) {
        // Check permissions
        const repoInfo = await getCurrentRepoInfo();
        if (repoInfo) {
          const perms = await checkRepoPermissions(repoInfo.owner, repoInfo.repo);
          if (perms?.admin || perms?.push) {
            detectedRole = 'maintainer';
            detectionSource = 'gh CLI (admin/push permissions)';
          }
        }
      }
    }

    // Layer 2: Remote heuristics
    if (detectedRole === null) {
      if (remotes.includes('upstream')) {
        detectedRole = 'contributor';
        detectionSource = 'heuristic (upstream remote exists)';
      } else if (remotes.includes('origin') && remotes.length === 1) {
        detectedRole = 'maintainer';
        detectionSource = 'heuristic (only origin remote)';
      }
    }

    // Layer 3: Interactive prompt
    if (detectedRole === null) {
      const roleChoice = await selectPrompt('What is your role in this project?', [
        'maintainer',
        'contributor',
      ]);
      detectedRole = roleChoice as 'maintainer' | 'contributor';
      detectionSource = 'user selection';
    } else {
      info(`Detected role: ${pc.bold(detectedRole)} (via ${detectionSource})`);
      const confirmed = await confirmPrompt(
        `Role detected as ${pc.bold(detectedRole)}. Is this correct?`,
      );
      if (!confirmed) {
        const roleChoice = await selectPrompt('Select your role:', ['maintainer', 'contributor']);
        detectedRole = roleChoice as 'maintainer' | 'contributor';
      }
    }

    // 4. Confirm branch settings
    const defaultConfig = getDefaultConfig();
    const mainBranch = await inputPrompt('Main branch name', defaultConfig.mainBranch);
    const devBranch = await inputPrompt('Dev branch name', defaultConfig.devBranch);
    const originRemote = await inputPrompt('Origin remote name', defaultConfig.origin);

    let upstreamRemote = defaultConfig.upstream;
    if (detectedRole === 'contributor') {
      upstreamRemote = await inputPrompt('Upstream remote name', defaultConfig.upstream);

      // 5. For contributors without upstream, prompt to add it
      if (!remotes.includes(upstreamRemote)) {
        warn(`Remote "${upstreamRemote}" not found.`);
        const originUrl = await getRemoteUrl(originRemote);
        const repoInfo = originUrl ? parseRepoFromUrl(originUrl) : null;

        const upstreamUrl = await inputPrompt(
          'Enter upstream repository URL to add',
          repoInfo ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}` : undefined,
        );

        if (upstreamUrl) {
          info(`Run: git remote add ${upstreamRemote} ${upstreamUrl}`);
          warn('Please add the upstream remote and re-run setup, or add it manually.');
        }
      }
    }

    // 6. Write config
    const config: ContributeConfig = {
      role: detectedRole,
      mainBranch,
      devBranch,
      upstream: upstreamRemote,
      origin: originRemote,
      branchPrefixes: defaultConfig.branchPrefixes,
    };

    writeConfig(config);
    success(`✅ Config written to .contributerc.json`);

    // 7. Warn if not in .gitignore
    if (!isGitignored()) {
      warn('.contributerc.json is not in .gitignore. Add it to avoid committing personal config.');
      warn('  echo ".contributerc.json" >> .gitignore');
    }

    console.log();
    info(`Role: ${pc.bold(config.role)}`);
    info(`Main: ${pc.bold(config.mainBranch)} | Dev: ${pc.bold(config.devBranch)}`);
    info(
      `Origin: ${pc.bold(config.origin)}${config.role === 'contributor' ? ` | Upstream: ${pc.bold(config.upstream)}` : ''}`,
    );
  },
});
