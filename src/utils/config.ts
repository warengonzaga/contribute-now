import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ContributeConfig } from '../types.js';

const CONFIG_FILENAME = '.contributerc.json';
const LOCAL_CONFIG_DIRNAME = 'contribute-now';
const LOCAL_CONFIG_FILENAME = 'config.json';

function findRepoRoot(cwd = process.cwd()): string | null {
  let current = resolve(cwd);

  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function resolveGitDir(cwd = process.cwd()): string | null {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    return null;
  }

  const dotGitPath = join(repoRoot, '.git');

  try {
    const stat = statSync(dotGitPath);
    if (stat.isDirectory()) {
      return dotGitPath;
    }

    if (!stat.isFile()) {
      return null;
    }

    const content = readFileSync(dotGitPath, 'utf-8').trim();
    const match = /^gitdir:\s*(.+)$/i.exec(content);
    if (!match) {
      return null;
    }

    return resolve(repoRoot, match[1].trim());
  } catch {
    return null;
  }
}

function parseConfigFile(path: string): ContributeConfig | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    // Runtime validation of required fields
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.workflow !== 'string' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.mainBranch !== 'string' ||
      typeof parsed.upstream !== 'string' ||
      typeof parsed.origin !== 'string' ||
      !Array.isArray(parsed.branchPrefixes) ||
      typeof parsed.commitConvention !== 'string'
    ) {
      return null;
    }

    if (!VALID_WORKFLOWS.includes(parsed.workflow)) {
      console.error(
        `Invalid workflow "${parsed.workflow}" in ${path.endsWith(CONFIG_FILENAME) ? CONFIG_FILENAME : LOCAL_CONFIG_FILENAME}. Valid: ${VALID_WORKFLOWS.join(', ')}`,
      );
      return null;
    }
    if (!VALID_ROLES.includes(parsed.role)) {
      console.error(
        `Invalid role "${parsed.role}" in ${path.endsWith(CONFIG_FILENAME) ? CONFIG_FILENAME : LOCAL_CONFIG_FILENAME}. Valid: ${VALID_ROLES.join(', ')}`,
      );
      return null;
    }
    if (!VALID_CONVENTIONS.includes(parsed.commitConvention)) {
      console.error(
        `Invalid commitConvention "${parsed.commitConvention}" in ${path.endsWith(CONFIG_FILENAME) ? CONFIG_FILENAME : LOCAL_CONFIG_FILENAME}. Valid: ${VALID_CONVENTIONS.join(', ')}`,
      );
      return null;
    }
    if (
      parsed.aiProvider !== undefined &&
      (typeof parsed.aiProvider !== 'string' || !VALID_AI_PROVIDERS.includes(parsed.aiProvider))
    ) {
      console.error(
        `Invalid aiProvider "${String(parsed.aiProvider)}" in ${path.endsWith(CONFIG_FILENAME) ? CONFIG_FILENAME : LOCAL_CONFIG_FILENAME}. Valid: ${VALID_AI_PROVIDERS.join(', ')}`,
      );
      return null;
    }
    if (
      parsed.aiModel !== undefined &&
      (typeof parsed.aiModel !== 'string' || !parsed.aiModel.trim())
    ) {
      console.error(`Invalid config (${path}): aiModel must be a non-empty string when set.`);
      return null;
    }
    if (!parsed.mainBranch.trim()) {
      console.error(`Invalid config (${path}): mainBranch must not be empty.`);
      return null;
    }
    if (!parsed.origin.trim()) {
      console.error(`Invalid config (${path}): origin must not be empty.`);
      return null;
    }
    if (parsed.role === 'contributor' && !parsed.upstream.trim()) {
      console.error(`Invalid config (${path}): upstream must not be empty for contributors.`);
      return null;
    }

    if (parsed.branchPrefixes.length === 0) {
      console.error(`Invalid config (${path}): branchPrefixes must not be empty.`);
      return null;
    }
    if (
      !parsed.branchPrefixes.every((p: unknown) => typeof p === 'string' && p.trim().length > 0)
    ) {
      console.error(`Invalid config (${path}): all branchPrefixes must be non-empty strings.`);
      return null;
    }

    const {
      guideRotation: _guideRotation,
      aiHost: _aiHost,
      ...config
    } = parsed as ContributeConfig & {
      guideRotation?: Record<string, number>;
      aiHost?: string;
    };

    return {
      ...config,
      aiEnabled: parsed.aiEnabled !== false,
      aiProvider: parsed.aiProvider,
      aiModel: parsed.aiModel?.trim() || undefined,
      showTips: parsed.showTips !== false,
    };
  } catch {
    return null;
  }
}

export function getConfigPath(cwd = process.cwd()): string {
  const legacyPath = getLegacyConfigPath(cwd);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  return getLocalConfigPath(cwd) ?? legacyPath;
}

export function getLegacyConfigPath(cwd = process.cwd()): string {
  return join(findRepoRoot(cwd) ?? cwd, CONFIG_FILENAME);
}

export function getLocalConfigPath(cwd = process.cwd()): string | null {
  const gitDir = resolveGitDir(cwd);
  if (!gitDir) {
    return null;
  }

  return join(gitDir, LOCAL_CONFIG_DIRNAME, LOCAL_CONFIG_FILENAME);
}

export function getConfigSource(cwd = process.cwd()): 'local' | 'legacy' | null {
  if (existsSync(getLegacyConfigPath(cwd))) {
    return 'legacy';
  }

  const localPath = getLocalConfigPath(cwd);
  if (localPath && existsSync(localPath)) {
    return 'local';
  }

  return null;
}

export function hasLegacyConfig(cwd = process.cwd()): boolean {
  return existsSync(getLegacyConfigPath(cwd));
}

export function hasLocalConfig(cwd = process.cwd()): boolean {
  const localPath = getLocalConfigPath(cwd);
  return !!localPath && existsSync(localPath);
}

export function getConfigLocationLabel(cwd = process.cwd()): string {
  const source = getConfigSource(cwd);
  if (source === 'legacy') {
    return CONFIG_FILENAME;
  }

  return getLocalConfigPath(cwd)
    ? `.git/${LOCAL_CONFIG_DIRNAME}/${LOCAL_CONFIG_FILENAME}`
    : CONFIG_FILENAME;
}

export function configExists(cwd = process.cwd()): boolean {
  return getConfigSource(cwd) !== null;
}

const VALID_WORKFLOWS = ['clean-flow', 'github-flow', 'git-flow'];
const VALID_ROLES = ['maintainer', 'contributor'];
const VALID_CONVENTIONS = ['conventional', 'clean-commit', 'none'];
const VALID_AI_PROVIDERS = ['copilot', 'ollama-cloud'];

export function isAIEnabled(config: ContributeConfig, cliNoAI = false): boolean {
  return config.aiEnabled !== false && !cliNoAI;
}

export function shouldShowTips(config: ContributeConfig | null | undefined): boolean {
  return config?.showTips !== false;
}

export function readConfig(cwd = process.cwd()): ContributeConfig | null {
  const source = getConfigSource(cwd);
  if (!source) return null;

  const path = source === 'local' ? getLocalConfigPath(cwd) : getLegacyConfigPath(cwd);
  if (!path) return null;
  return parseConfigFile(path);
}

export function writeConfig(config: ContributeConfig, cwd = process.cwd()): void {
  const path = getConfigPath(cwd);
  const { aiHost: _aiHost, ...storedConfig } = config as ContributeConfig & { aiHost?: string };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(storedConfig, null, 2)}\n`, 'utf-8');
}

export function isGitignored(cwd = process.cwd()): boolean {
  const gitignorePath = join(cwd, '.gitignore');
  if (!existsSync(gitignorePath)) return false;
  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    return content.split('\n').some((line) => line.trim() === CONFIG_FILENAME);
  } catch {
    return false;
  }
}

export function ensureGitignored(cwd = process.cwd()): boolean {
  if (isGitignored(cwd)) return false;

  const gitignorePath = join(cwd, '.gitignore');
  const line = `${CONFIG_FILENAME}\n`;

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, line, 'utf-8');
    return true;
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const needsLeadingNewline = content.length > 0 && !content.endsWith('\n');
  appendFileSync(gitignorePath, `${needsLeadingNewline ? '\n' : ''}${line}`, 'utf-8');
  return true;
}

export function getDefaultConfig(): ContributeConfig {
  return {
    workflow: 'clean-flow',
    role: 'contributor',
    mainBranch: 'main',
    devBranch: 'dev',
    upstream: 'upstream',
    origin: 'origin',
    branchPrefixes: ['feature', 'fix', 'docs', 'chore', 'test', 'refactor'],
    commitConvention: 'clean-commit',
    aiEnabled: true,
    showTips: true,
  };
}
