import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { CommitConvention, ContributeConfig, WorkflowMode } from '../types.js';
import { getDefaultConfig, isGitignored, writeConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import { CONVENTION_DESCRIPTIONS } from '../utils/convention.js';
import {
  checkGhAuth,
  checkGhInstalled,
  checkRepoPermissions,
  getCurrentRepoInfo,
  isRepoFork,
} from '../utils/gh.js';
import {
  addRemote,
  fetchRemote,
  getRemotes,
  getRemoteUrl,
  isGitRepo,
  refExists,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { parseRepoFromUrl } from '../utils/remote.js';
import { hasDevBranch, WORKFLOW_DESCRIPTIONS } from '../utils/workflow.js';

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

    // 2. Select workflow mode
    const workflowChoice = await selectPrompt('Which git workflow does this project use?', [
      'Clean Flow — main + dev, squash features into dev, merge dev into main (recommended)',
      'GitHub Flow — main + feature branches, squash/merge into main',
      'Git Flow — main + develop + release + hotfix branches',
    ]);

    let workflow: WorkflowMode = 'clean-flow';
    if (workflowChoice.startsWith('GitHub')) workflow = 'github-flow';
    else if (workflowChoice.startsWith('Git Flow')) workflow = 'git-flow';

    info(`Workflow: ${pc.bold(WORKFLOW_DESCRIPTIONS[workflow])}`);

    // 2b. Select commit convention
    const conventionChoice = await selectPrompt(
      'Which commit convention should this project use?',
      [
        `${CONVENTION_DESCRIPTIONS['clean-commit']} (recommended)`,
        CONVENTION_DESCRIPTIONS.conventional,
        CONVENTION_DESCRIPTIONS.none,
      ],
    );

    let commitConvention: CommitConvention = 'clean-commit';
    if (conventionChoice.includes('Conventional Commits')) commitConvention = 'conventional';
    else if (conventionChoice.includes('No commit')) commitConvention = 'none';

    // 3. Detect remotes
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

    let devBranch: string | undefined;
    if (hasDevBranch(workflow)) {
      const defaultDev = workflow === 'git-flow' ? 'develop' : 'dev';
      devBranch = await inputPrompt('Dev/develop branch name', defaultDev);
    }

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
          const addResult = await addRemote(upstreamRemote, upstreamUrl);
          if (addResult.exitCode !== 0) {
            error(`Failed to add remote "${upstreamRemote}": ${addResult.stderr.trim()}`);
            error('Setup cannot continue without the upstream remote for contributors.');
            process.exit(1);
          }
          success(`Added remote ${pc.bold(upstreamRemote)} → ${upstreamUrl}`);
        } else {
          error('An upstream remote URL is required for contributors.');
          info('Add it manually: git remote add upstream <url>');
          process.exit(1);
        }
      }
    }

    // 6. Write config
    const config: ContributeConfig = {
      workflow,
      role: detectedRole,
      mainBranch,
      ...(devBranch ? { devBranch } : {}),
      upstream: upstreamRemote,
      origin: originRemote,
      branchPrefixes: defaultConfig.branchPrefixes,
      commitConvention,
    };

    writeConfig(config);
    success(`✅ Config written to .contributerc.json`);

    // Verify configured branches exist on their remotes
    const syncRemote = config.role === 'contributor' ? config.upstream : config.origin;
    info(`Fetching ${pc.bold(syncRemote)} to verify branch configuration...`);
    await fetchRemote(syncRemote);

    const mainRef = `${syncRemote}/${config.mainBranch}`;
    if (!(await refExists(mainRef))) {
      warn(`Main branch ref ${pc.bold(mainRef)} not found on remote.`);
      warn('Config was saved — verify the branch name and re-run setup if needed.');
    }
    if (config.devBranch) {
      const devRef = `${syncRemote}/${config.devBranch}`;
      if (!(await refExists(devRef))) {
        warn(`Dev branch ref ${pc.bold(devRef)} not found on remote.`);
        warn('Config was saved — verify the branch name and re-run setup if needed.');
      }
    }

    // 7. Warn if not in .gitignore
    if (!isGitignored()) {
      warn('.contributerc.json is not in .gitignore. Add it to avoid committing personal config.');
      warn('  echo ".contributerc.json" >> .gitignore');
    }

    console.log();
    info(`Workflow: ${pc.bold(WORKFLOW_DESCRIPTIONS[config.workflow])}`);
    info(`Convention: ${pc.bold(CONVENTION_DESCRIPTIONS[config.commitConvention])}`);
    info(`Role: ${pc.bold(config.role)}`);
    if (config.devBranch) {
      info(`Main: ${pc.bold(config.mainBranch)} | Dev: ${pc.bold(config.devBranch)}`);
    } else {
      info(`Main: ${pc.bold(config.mainBranch)}`);
    }
    info(
      `Origin: ${pc.bold(config.origin)}${config.role === 'contributor' ? ` | Upstream: ${pc.bold(config.upstream)}` : ''}`,
    );
  },
});
