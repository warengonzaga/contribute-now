import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContributeConfig } from '../types.js';

const CONFIG_FILENAME = '.contributerc.json';

export function getConfigPath(cwd = process.cwd()): string {
  return join(cwd, CONFIG_FILENAME);
}

export function configExists(cwd = process.cwd()): boolean {
  return existsSync(getConfigPath(cwd));
}

export function readConfig(cwd = process.cwd()): ContributeConfig | null {
  const path = getConfigPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as ContributeConfig;
  } catch {
    return null;
  }
}

export function writeConfig(config: ContributeConfig, cwd = process.cwd()): void {
  const path = getConfigPath(cwd);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
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

export function getDefaultConfig(): ContributeConfig {
  return {
    role: 'contributor',
    mainBranch: 'main',
    devBranch: 'dev',
    upstream: 'upstream',
    origin: 'origin',
    branchPrefixes: ['feature', 'fix', 'docs', 'chore', 'test', 'refactor'],
  };
}
