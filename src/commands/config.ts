import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { AIProvider, CommitConvention, ContributeConfig, WorkflowMode } from '../types.js';
import {
  configExists,
  getConfigLocationLabel,
  getConfigSource,
  isAIEnabled,
  readConfig,
  shouldShowTips,
  writeConfig,
} from '../utils/config.js';
import { confirmPrompt, inputPrompt, passwordPrompt, selectPrompt } from '../utils/confirm.js';
import { CONVENTION_DESCRIPTIONS } from '../utils/convention.js';
import {
  DEFAULT_OLLAMA_CLOUD_MODEL,
  fetchOllamaCloudModels,
  prioritizeOllamaCloudModels,
  resolveAIConfig,
} from '../utils/copilot.js';
import { getRemotes, isGitRepo } from '../utils/git.js';
import { error, info, projectHeading, success, warn } from '../utils/logger.js';
import {
  deleteOllamaCloudApiKey,
  getOllamaCloudApiKey,
  getSecretsStorePath,
  hasOllamaCloudApiKey,
  setOllamaCloudApiKey,
} from '../utils/secrets.js';
import { hasDevBranch, WORKFLOW_DESCRIPTIONS } from '../utils/workflow.js';

const WORKFLOW_OPTIONS: Array<{ value: WorkflowMode; label: string }> = [
  { value: 'clean-flow', label: WORKFLOW_DESCRIPTIONS['clean-flow'] },
  { value: 'github-flow', label: WORKFLOW_DESCRIPTIONS['github-flow'] },
  { value: 'git-flow', label: WORKFLOW_DESCRIPTIONS['git-flow'] },
];

const ROLE_OPTIONS: Array<{ value: ContributeConfig['role']; label: string }> = [
  { value: 'maintainer', label: 'Maintainer' },
  { value: 'contributor', label: 'Contributor' },
];

const CONVENTION_OPTIONS: Array<{ value: CommitConvention; label: string }> = [
  { value: 'clean-commit', label: CONVENTION_DESCRIPTIONS['clean-commit'] },
  { value: 'conventional', label: CONVENTION_DESCRIPTIONS.conventional },
  { value: 'none', label: CONVENTION_DESCRIPTIONS.none },
];

const AI_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'ollama-cloud', label: 'Ollama Cloud' },
];

interface ConfigSnapshotMeta {
  source: 'legacy' | 'local';
  location: string;
  hasOllamaCloudApiKey: boolean;
  secretsPath: string;
}

interface ConfigEditDraft {
  workflow: WorkflowMode;
  role: ContributeConfig['role'];
  mainBranch: string;
  devBranch?: string;
  upstream: string;
  origin: string;
  branchPrefixes: string[];
  commitConvention: CommitConvention;
  aiEnabled: boolean;
  aiProvider?: AIProvider;
  aiModel?: string;
  showTips: boolean;
}

interface ConfigEditResult {
  config: ContributeConfig;
  ollamaApiKeyAction: 'keep' | 'set' | 'delete';
  ollamaApiKey?: string;
}

export interface ConfigSnapshot {
  source: 'legacy' | 'local';
  location: string;
  workflow: WorkflowMode;
  workflowLabel: string;
  role: ContributeConfig['role'];
  mainBranch: string;
  devBranch: string | null;
  origin: string;
  upstream: string;
  branchPrefixes: string[];
  commitConvention: CommitConvention;
  commitConventionLabel: string;
  showTips: boolean;
  ai: {
    enabled: boolean;
    provider: AIProvider | null;
    providerLabel: string | null;
    model: string | null;
    ollamaCloudApiKeyPresent: boolean | null;
    secretsPath: string | null;
  };
}

export function parseBranchPrefixesInput(input: string, fallback: string[]): string[] {
  const values = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
}

export function finalizeEditedConfig(
  current: ContributeConfig,
  draft: ConfigEditDraft,
): ContributeConfig {
  const next: ContributeConfig = {
    ...current,
    workflow: draft.workflow,
    role: draft.role,
    mainBranch: draft.mainBranch.trim(),
    upstream: draft.upstream.trim(),
    origin: draft.origin.trim(),
    branchPrefixes: draft.branchPrefixes,
    commitConvention: draft.commitConvention,
    aiEnabled: draft.aiEnabled,
    showTips: draft.showTips,
  };

  if (hasDevBranch(draft.workflow)) {
    next.devBranch = (
      draft.devBranch?.trim() || defaultDevBranchForWorkflow(draft.workflow)
    ).trim();
  } else {
    delete next.devBranch;
  }

  if (!draft.aiEnabled) {
    delete next.aiProvider;
    delete next.aiModel;
    return next;
  }

  next.aiProvider = draft.aiProvider ?? 'copilot';

  if (next.aiProvider === 'ollama-cloud') {
    next.aiModel = (draft.aiModel?.trim() || DEFAULT_OLLAMA_CLOUD_MODEL).trim();
    return next;
  }

  delete next.aiModel;
  return next;
}

export function buildConfigSnapshot(
  config: ContributeConfig,
  meta: ConfigSnapshotMeta,
): ConfigSnapshot {
  const aiConfig = resolveAIConfig(config);
  const aiEnabled = isAIEnabled(config);
  const usingOllamaCloud = aiEnabled && aiConfig.provider === 'ollama-cloud';

  return {
    source: meta.source,
    location: meta.location,
    workflow: config.workflow,
    workflowLabel: WORKFLOW_DESCRIPTIONS[config.workflow],
    role: config.role,
    mainBranch: config.mainBranch,
    devBranch: config.devBranch ?? null,
    origin: config.origin,
    upstream: config.upstream,
    branchPrefixes: [...config.branchPrefixes],
    commitConvention: config.commitConvention,
    commitConventionLabel: CONVENTION_DESCRIPTIONS[config.commitConvention],
    showTips: shouldShowTips(config),
    ai: {
      enabled: aiEnabled,
      provider: aiEnabled ? aiConfig.provider : null,
      providerLabel: aiEnabled ? aiConfig.providerLabel : null,
      model: aiEnabled ? (aiConfig.model ?? null) : null,
      ollamaCloudApiKeyPresent: usingOllamaCloud ? meta.hasOllamaCloudApiKey : null,
      secretsPath: usingOllamaCloud ? meta.secretsPath : null,
    },
  };
}

function defaultDevBranchForWorkflow(workflow: WorkflowMode): string {
  return workflow === 'git-flow' ? 'develop' : 'dev';
}

async function promptForOllamaCloudModelSelection(
  apiKey: string | null,
  fallbackModel: string,
): Promise<string> {
  if (apiKey) {
    try {
      info('Fetching available Ollama Cloud models...');
      const models = prioritizeOllamaCloudModels(await fetchOllamaCloudModels(apiKey));

      if (models.length > 0) {
        const manualChoice = 'Enter model manually';
        const choices = models.map((model) => ({
          value: model,
          label: model === DEFAULT_OLLAMA_CLOUD_MODEL ? `${model} (default)` : model,
        }));
        const selected = await selectPrompt('Ollama Cloud model', [
          ...choices.map((choice) => choice.label),
          manualChoice,
        ]);
        if (selected !== manualChoice) {
          return choices.find((choice) => choice.label === selected)?.value ?? fallbackModel;
        }
      } else {
        warn('Ollama Cloud returned no available models. Enter the model name manually.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warn(`Could not fetch Ollama Cloud models: ${message}`);
    }
  } else {
    warn('No Ollama Cloud API key is available yet, so the model list cannot be fetched.');
  }

  return inputPrompt('Ollama Cloud model', fallbackModel);
}

async function selectCurrentValue<T extends string>(
  message: string,
  options: Array<{ value: T; label: string }>,
  current: T,
): Promise<T> {
  const choices = options.map((option) => ({
    value: option.value,
    label: option.value === current ? `${option.label} (current)` : option.label,
  }));

  const selectedLabel = await selectPrompt(
    message,
    choices.map((choice) => choice.label),
  );
  return choices.find((choice) => choice.label === selectedLabel)?.value ?? current;
}

async function selectBooleanValue(
  message: string,
  current: boolean,
  trueLabel: string,
  falseLabel: string,
): Promise<boolean> {
  return selectCurrentValue(
    message,
    [
      { value: 'true', label: trueLabel },
      { value: 'false', label: falseLabel },
    ],
    current ? 'true' : 'false',
  ).then((value) => value === 'true');
}

async function promptForConfigEdits(
  current: ContributeConfig,
  hasExistingOllamaApiKey: boolean,
): Promise<ConfigEditResult> {
  const workflow = await selectCurrentValue('Workflow mode', WORKFLOW_OPTIONS, current.workflow);
  const role = await selectCurrentValue('Your role in this clone', ROLE_OPTIONS, current.role);
  const mainBranch = await inputPrompt('Main branch name', current.mainBranch);
  const devBranch = hasDevBranch(workflow)
    ? await inputPrompt(
        'Dev branch name',
        current.devBranch ?? defaultDevBranchForWorkflow(workflow),
      )
    : undefined;

  const remotes = await getRemotes();
  if (remotes.length > 0) {
    info(`Detected remotes: ${remotes.join(', ')}`);
  } else {
    warn(
      'No remotes detected. Keeping config editable, but remote names must be entered manually.',
    );
  }

  const origin = await inputPrompt('Origin remote name', current.origin);
  const upstream = await inputPrompt('Upstream remote name', current.upstream);
  const branchPrefixes = parseBranchPrefixesInput(
    await inputPrompt(
      'Feature branch prefixes (comma-separated)',
      current.branchPrefixes.join(', '),
    ),
    current.branchPrefixes,
  );
  const commitConvention = await selectCurrentValue(
    'Commit convention',
    CONVENTION_OPTIONS,
    current.commitConvention,
  );
  const aiEnabled = await selectBooleanValue(
    'AI features for this clone',
    isAIEnabled(current),
    'Enabled',
    'Disabled',
  );
  const showTips = await selectBooleanValue(
    'Beginner quick guides and loading tips',
    shouldShowTips(current),
    'Shown',
    'Hidden',
  );

  let aiProvider: AIProvider | undefined;
  let aiModel: string | undefined;
  let ollamaApiKeyAction: ConfigEditResult['ollamaApiKeyAction'] = 'keep';
  let ollamaApiKey: string | undefined;

  if (aiEnabled) {
    const currentProvider = current.aiProvider ?? 'copilot';
    aiProvider = await selectCurrentValue('AI provider', AI_PROVIDER_OPTIONS, currentProvider);

    if (aiProvider === 'ollama-cloud') {
      if (hasExistingOllamaApiKey) {
        const apiKeyChoice = await selectPrompt('Ollama Cloud API key', [
          'Keep existing stored key',
          'Replace stored key',
          'Delete stored key',
        ]);

        if (apiKeyChoice === 'Replace stored key') {
          ollamaApiKey = (await passwordPrompt('Enter the new Ollama Cloud API key')).trim();
          if (!ollamaApiKey) {
            throw new Error('Ollama Cloud API key cannot be empty when replacing the stored key.');
          }
          ollamaApiKeyAction = 'set';
        } else if (apiKeyChoice === 'Delete stored key') {
          ollamaApiKeyAction = 'delete';
        }
      } else {
        const addApiKey = await confirmPrompt('No Ollama Cloud API key is stored. Add one now?');
        if (addApiKey) {
          ollamaApiKey = (await passwordPrompt('Enter your Ollama Cloud API key')).trim();
          if (!ollamaApiKey) {
            throw new Error('Ollama Cloud API key cannot be empty when enabling Ollama Cloud.');
          }
          ollamaApiKeyAction = 'set';
        }
      }

      const modelLookupApiKey =
        ollamaApiKeyAction === 'set'
          ? (ollamaApiKey ?? null)
          : ollamaApiKeyAction === 'keep'
            ? await getOllamaCloudApiKey()
            : null;

      aiModel = await promptForOllamaCloudModelSelection(
        modelLookupApiKey,
        current.aiProvider === 'ollama-cloud'
          ? (current.aiModel ?? DEFAULT_OLLAMA_CLOUD_MODEL)
          : DEFAULT_OLLAMA_CLOUD_MODEL,
      );
    } else if (hasExistingOllamaApiKey) {
      const shouldDeleteStoredKey = await confirmPrompt(
        'Delete the stored Ollama Cloud API key from the local secrets store?',
      );
      if (shouldDeleteStoredKey) {
        ollamaApiKeyAction = 'delete';
      }
    }
  } else if (hasExistingOllamaApiKey) {
    const shouldDeleteStoredKey = await confirmPrompt(
      'AI is disabled. Delete the stored Ollama Cloud API key from the local secrets store?',
    );
    if (shouldDeleteStoredKey) {
      ollamaApiKeyAction = 'delete';
    }
  }

  return {
    config: finalizeEditedConfig(current, {
      workflow,
      role,
      mainBranch,
      devBranch,
      upstream,
      origin,
      branchPrefixes,
      commitConvention,
      aiEnabled,
      aiProvider,
      aiModel,
      showTips,
    }),
    ollamaApiKeyAction,
    ollamaApiKey,
  };
}

async function applyOllamaApiKeyEdit(result: ConfigEditResult): Promise<void> {
  if (result.ollamaApiKeyAction === 'set' && result.ollamaApiKey) {
    await setOllamaCloudApiKey(result.ollamaApiKey);
    success('Stored Ollama Cloud API key in the local secrets store.');
    info(`Secrets path: ${pc.bold(getSecretsStorePath())}`);
    return;
  }

  if (result.ollamaApiKeyAction === 'delete') {
    const deleted = await deleteOllamaCloudApiKey();
    if (deleted) {
      success('Deleted stored Ollama Cloud API key.');
    } else {
      info('No stored Ollama Cloud API key was found to delete.');
    }
  }
}

function printConfigSummary(snapshot: ConfigSnapshot): void {
  info(`Config source: ${pc.bold(snapshot.source)}`);
  info(`Config path: ${pc.bold(snapshot.location)}`);
  info(`Workflow: ${pc.bold(snapshot.workflowLabel)}`);
  info(`Convention: ${pc.bold(snapshot.commitConventionLabel)}`);
  info(`Role: ${pc.bold(snapshot.role)}`);
  if (snapshot.devBranch) {
    info(`Main: ${pc.bold(snapshot.mainBranch)} | Dev: ${pc.bold(snapshot.devBranch)}`);
  } else {
    info(`Main: ${pc.bold(snapshot.mainBranch)}`);
  }
  info(`Origin: ${pc.bold(snapshot.origin)} | Upstream: ${pc.bold(snapshot.upstream)}`);
  info(`Branch prefixes: ${pc.bold(snapshot.branchPrefixes.join(', '))}`);
  info(`Guides: ${pc.bold(snapshot.showTips ? 'shown' : 'hidden')}`);
  info(`AI: ${pc.bold(snapshot.ai.enabled ? 'enabled' : 'disabled')}`);

  if (snapshot.ai.enabled && snapshot.ai.providerLabel) {
    info(`AI provider: ${pc.bold(snapshot.ai.providerLabel)}`);
    if (snapshot.ai.model) {
      info(`AI model: ${pc.bold(snapshot.ai.model)}`);
    }
    if (snapshot.ai.provider === 'ollama-cloud') {
      info(
        `Ollama Cloud API key: ${pc.bold(snapshot.ai.ollamaCloudApiKeyPresent ? 'stored' : 'missing')}`,
      );
      if (snapshot.ai.secretsPath) {
        info(`Secrets path: ${pc.bold(snapshot.ai.secretsPath)}`);
      }
    }
  }
}

export default defineCommand({
  meta: {
    name: 'config',
    description: 'Inspect or edit the repo config without rerunning setup',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Print the active repo config as JSON with metadata',
      default: false,
    },
    edit: {
      type: 'boolean',
      description: 'Interactively edit the active repo config',
      default: false,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    if (args.json && args.edit) {
      error('Use either --json or --edit, not both at the same time.');
      process.exit(1);
    }

    await projectHeading('config', '⚙️');

    if (!configExists()) {
      error('No repo config found. Run `contrib setup` first.');
      process.exit(1);
    }

    const config = readConfig();
    if (!config) {
      error('Repo config exists but is invalid. Run `contrib setup` to repair it.');
      process.exit(1);
    }

    const source = getConfigSource();
    if (!source) {
      error('Unable to determine the active repo config source.');
      process.exit(1);
    }

    if (args.edit) {
      try {
        const editResult = await promptForConfigEdits(config, await hasOllamaCloudApiKey());
        writeConfig(editResult.config);
        await applyOllamaApiKeyEdit(editResult);

        success('Updated repo config.');
        printConfigSummary(
          buildConfigSnapshot(editResult.config, {
            source,
            location: getConfigLocationLabel(),
            hasOllamaCloudApiKey: await hasOllamaCloudApiKey(),
            secretsPath: getSecretsStorePath(),
          }),
        );
        return;
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }

    const snapshot = buildConfigSnapshot(config, {
      source,
      location: getConfigLocationLabel(),
      hasOllamaCloudApiKey: await hasOllamaCloudApiKey(),
      secretsPath: getSecretsStorePath(),
    });

    if (args.json) {
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }

    printConfigSummary(snapshot);
    console.log();
    console.log(`  ${pc.dim('Run `contrib config --edit` to update these settings.')}`);
    console.log();
  },
});
