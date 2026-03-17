import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { AIProvider, CommitConvention, ContributeConfig, WorkflowMode } from '../types.js';
import {
  configExists,
  getConfigLocationLabel,
  getDefaultConfig,
  isAIEnabled,
  readConfig,
  shouldShowTips,
  writeConfig,
} from '../utils/config.js';
import { confirmPrompt, inputPrompt, passwordPrompt, selectPrompt } from '../utils/confirm.js';
import { CONVENTION_DESCRIPTIONS } from '../utils/convention.js';
import {
  DEFAULT_OLLAMA_CLOUD_HOST,
  DEFAULT_OLLAMA_CLOUD_MODEL,
  fetchOllamaCloudModels,
  prioritizeOllamaCloudModels,
  resolveAIConfig,
} from '../utils/copilot.js';
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
import { error, info, projectHeading, success, warn } from '../utils/logger.js';
import { parseRepoFromUrl } from '../utils/remote.js';
import { getSecretsStorePath, setOllamaCloudApiKey } from '../utils/secrets.js';
import { createSpinner } from '../utils/spinner.js';
import { hasDevBranch, WORKFLOW_DESCRIPTIONS } from '../utils/workflow.js';

export interface ExistingConfigGateOptions {
  existingConfig: ContributeConfig | null;
  hasConfigFile: boolean;
  confirm: (message: string) => Promise<boolean>;
  onInfo: (message: string) => void;
  onWarn: (message: string) => void;
  onSuccess: (message: string) => void;
  summary: (config: ContributeConfig) => void;
}

export async function shouldContinueSetupWithExistingConfig(
  options: ExistingConfigGateOptions,
): Promise<boolean> {
  const { existingConfig, hasConfigFile, confirm, onInfo, onWarn, onSuccess, summary } = options;

  if (existingConfig) {
    onInfo('Existing repo config detected:');
    summary(existingConfig);

    const shouldContinue = await confirm('Continue setup and overwrite existing config?');
    if (!shouldContinue) {
      onSuccess('Keeping existing setup.');
      return false;
    }

    return true;
  }

  if (hasConfigFile) {
    onWarn('Found an existing repo config but it appears invalid.');
    const shouldContinue = await confirm('Continue setup and overwrite invalid config?');
    if (!shouldContinue) {
      onInfo('Keeping existing file. Run setup again when ready to repair it.');
      return false;
    }
  }

  return true;
}

async function promptForOllamaCloudModel(
  apiKey: string,
  host = DEFAULT_OLLAMA_CLOUD_HOST,
): Promise<string> {
  try {
    info('Fetching available Ollama Cloud models...');
    const models = prioritizeOllamaCloudModels(await fetchOllamaCloudModels(apiKey, host));

    if (models.length > 0) {
      const manualChoice = 'Enter model manually';
      const choices = models.map((model) => ({
        value: model,
        label: model === DEFAULT_OLLAMA_CLOUD_MODEL ? `${model} (default)` : model,
      }));
      const selected = await selectPrompt('Which Ollama Cloud model should this clone use?', [
        ...choices.map((choice) => choice.label),
        manualChoice,
      ]);

      if (selected !== manualChoice) {
        return (
          choices.find((choice) => choice.label === selected)?.value ?? DEFAULT_OLLAMA_CLOUD_MODEL
        );
      }
    } else {
      warn('Ollama Cloud returned no available models. Enter the model name manually.');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Could not fetch Ollama Cloud models: ${message}`);
  }

  return inputPrompt(
    `Ollama Cloud model (default: ${DEFAULT_OLLAMA_CLOUD_MODEL} — press Enter to keep)`,
    DEFAULT_OLLAMA_CLOUD_MODEL,
  );
}

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Initialize contribute-now config for this repo using local Git storage',
  },
  async run() {
    // 1. Verify inside a git repo
    if (!(await isGitRepo())) {
      error('Not inside a git repository. Run this command from within a git repo.');
      process.exit(1);
    }

    await projectHeading('setup', '🔧');

    const existingConfig = readConfig();
    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig,
      hasConfigFile: configExists(),
      confirm: confirmPrompt,
      onInfo: info,
      onWarn: warn,
      onSuccess: success,
      summary: logConfigSummary,
    });
    if (!shouldContinue) {
      return;
    }

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

    const enableAI = await confirmPrompt(
      'Enable AI-assisted features like commit messages, branch naming, PR text, and conflict guidance?',
    );

    let aiProvider: AIProvider | undefined;
    let aiModel: string | undefined;

    if (enableAI) {
      const providerChoice = await selectPrompt('Which AI provider should this clone use?', [
        'GitHub Copilot — use your existing GitHub/Copilot auth',
        'Ollama Cloud — use an API key stored in the local secrets store',
      ]);

      aiProvider = providerChoice.startsWith('Ollama Cloud') ? 'ollama-cloud' : 'copilot';

      if (aiProvider === 'ollama-cloud') {
        const apiKey = (await passwordPrompt('Enter your Ollama Cloud API key')).trim();
        if (!apiKey) {
          error('Ollama Cloud API key is required when Ollama Cloud is selected.');
          process.exit(1);
        }

        aiModel = await promptForOllamaCloudModel(apiKey);

        try {
          await setOllamaCloudApiKey(apiKey);
          success('Stored Ollama Cloud API key in the local secrets store.');
          info(`Secrets path: ${pc.bold(getSecretsStorePath())}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          error(`Failed to store Ollama Cloud API key: ${message}`);
          process.exit(1);
        }
      }
    }

    const showTips = await confirmPrompt(
      'Show beginner quick guides and loading tips in command output?',
    );

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
    const roleSpinner = createSpinner('Detecting your role...');
    try {
      // Layer 1: gh CLI
      roleSpinner.update('Checking GitHub CLI and auth...');
      const ghInstalled = await checkGhInstalled();
      if (ghInstalled && (await checkGhAuth())) {
        roleSpinner.update('Inspecting repository relationship (fork/permissions)...');
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
        roleSpinner.update('Analyzing git remotes...');
        if (remotes.includes('upstream')) {
          detectedRole = 'contributor';
          detectionSource = 'heuristic (upstream remote exists)';
        } else if (remotes.includes('origin') && remotes.length === 1) {
          detectedRole = 'maintainer';
          detectionSource = 'heuristic (only origin remote)';
        }
      }

      roleSpinner.success('Role detection complete.');
    } catch {
      roleSpinner.fail('Role detection failed; falling back to manual selection.');
      detectedRole = null;
      detectionSource = '';
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
    info(pc.dim('Tip: press Enter to keep the default branch name shown in each prompt.'));

    const mainBranchDefault = defaultConfig.mainBranch;
    const mainBranch = await inputPrompt(
      `Main branch name (default: ${mainBranchDefault} — press Enter to keep)`,
      mainBranchDefault,
    );

    let devBranch: string | undefined;
    if (hasDevBranch(workflow)) {
      const defaultDev = workflow === 'git-flow' ? 'develop' : 'dev';
      devBranch = await inputPrompt(
        `Dev/develop branch name (default: ${defaultDev} — press Enter to keep)`,
        defaultDev,
      );
    }

    const originRemoteDefault = defaultConfig.origin;
    const originRemote = await inputPrompt(
      `Origin remote name (default: ${originRemoteDefault} — press Enter to keep)`,
      originRemoteDefault,
    );

    let upstreamRemote = defaultConfig.upstream;
    if (detectedRole === 'contributor') {
      const upstreamRemoteDefault = defaultConfig.upstream;
      upstreamRemote = await inputPrompt(
        `Upstream remote name (default: ${upstreamRemoteDefault} — press Enter to keep)`,
        upstreamRemoteDefault,
      );

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
          info('Add it manually: git remote add upstream <url>', '');
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
      aiEnabled: enableAI,
      ...(aiProvider ? { aiProvider } : {}),
      ...(aiModel ? { aiModel } : {}),
      showTips,
    };

    writeConfig(config);
    success(`Config written to ${pc.bold(getConfigLocationLabel())}`);
    info('This setup is stored locally for this clone and does not modify tracked files.', '');

    // Verify configured branches exist on their remotes
    const syncRemote = config.role === 'contributor' ? config.upstream : config.origin;
    info(`Fetching ${pc.bold(syncRemote)} to verify branch configuration...`, '');
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
    console.log();
    const resolvedAIConfig = resolveAIConfig(config);
    info(`Workflow: ${pc.bold(WORKFLOW_DESCRIPTIONS[config.workflow])}`);
    info(`Convention: ${pc.bold(CONVENTION_DESCRIPTIONS[config.commitConvention])}`);
    info(`AI: ${pc.bold(isAIEnabled(config) ? 'enabled' : 'disabled')}`);
    if (isAIEnabled(config)) {
      info(`AI provider: ${pc.bold(resolvedAIConfig.providerLabel)}`);
      if (resolvedAIConfig.model) {
        info(`AI model: ${pc.bold(resolvedAIConfig.model)}`);
      }
    }
    info(`Guides: ${pc.bold(shouldShowTips(config) ? 'shown' : 'hidden')}`);
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

function logConfigSummary(config: ContributeConfig): void {
  const aiConfig = resolveAIConfig(config);
  info(`Workflow: ${pc.bold(WORKFLOW_DESCRIPTIONS[config.workflow])}`);
  info(`Convention: ${pc.bold(CONVENTION_DESCRIPTIONS[config.commitConvention])}`);
  info(`AI: ${pc.bold(isAIEnabled(config) ? 'enabled' : 'disabled')}`);
  if (isAIEnabled(config)) {
    info(`AI provider: ${pc.bold(aiConfig.providerLabel)}`);
    if (aiConfig.model) {
      info(`AI model: ${pc.bold(aiConfig.model)}`);
    }
  }
  info(`Guides: ${pc.bold(shouldShowTips(config) ? 'shown' : 'hidden')}`);
  info(`Role: ${pc.bold(config.role)}`);
  if (config.devBranch) {
    info(`Main: ${pc.bold(config.mainBranch)} | Dev: ${pc.bold(config.devBranch)}`);
  } else {
    info(`Main: ${pc.bold(config.mainBranch)}`);
  }
  info(
    `Origin: ${pc.bold(config.origin)}${config.role === 'contributor' ? ` | Upstream: ${pc.bold(config.upstream)}` : ''}`,
  );
}
