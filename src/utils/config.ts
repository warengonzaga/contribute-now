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

const VALID_WORKFLOWS = ['clean-flow', 'github-flow', 'git-flow'];
const VALID_ROLES = ['maintainer', 'contributor'];
const VALID_CONVENTIONS = ['conventional', 'clean-commit', 'none'];

export function readConfig(cwd = process.cwd()): ContributeConfig | null {
  const path = getConfigPath(cwd);
  if (!existsSync(path)) return null;
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

    // Validate enum values to catch hand-edited or corrupted config
    if (!VALID_WORKFLOWS.includes(parsed.workflow)) {
      console.error(
        `Invalid workflow "${parsed.workflow}" in .contributerc.json. Valid: ${VALID_WORKFLOWS.join(', ')}`,
      );
      return null;
    }
    if (!VALID_ROLES.includes(parsed.role)) {
      console.error(
        `Invalid role "${parsed.role}" in .contributerc.json. Valid: ${VALID_ROLES.join(', ')}`,
      );
      return null;
    }
    if (!VALID_CONVENTIONS.includes(parsed.commitConvention)) {
      console.error(
        `Invalid commitConvention "${parsed.commitConvention}" in .contributerc.json. Valid: ${VALID_CONVENTIONS.join(', ')}`,
      );
      return null;
    }

    // Validate non-empty strings for critical fields
    if (!parsed.mainBranch.trim()) {
      console.error('Invalid .contributerc.json: mainBranch must not be empty.');
      return null;
    }
    if (!parsed.origin.trim()) {
      console.error('Invalid .contributerc.json: origin must not be empty.');
      return null;
    }
    if (parsed.role === 'contributor' && !parsed.upstream.trim()) {
      console.error('Invalid .contributerc.json: upstream must not be empty for contributors.');
      return null;
    }

    // Validate branch prefixes are all non-empty strings
    if (parsed.branchPrefixes.length === 0) {
      console.error('Invalid .contributerc.json: branchPrefixes must not be empty.');
      return null;
    }
    if (
      !parsed.branchPrefixes.every((p: unknown) => typeof p === 'string' && p.trim().length > 0)
    ) {
      console.error('Invalid .contributerc.json: all branchPrefixes must be non-empty strings.');
      return null;
    }

    return parsed as ContributeConfig;
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
    workflow: 'clean-flow',
    role: 'contributor',
    mainBranch: 'main',
    devBranch: 'dev',
    upstream: 'upstream',
    origin: 'origin',
    branchPrefixes: ['feature', 'fix', 'docs', 'chore', 'test', 'refactor'],
    commitConvention: 'clean-commit',
  };
}
