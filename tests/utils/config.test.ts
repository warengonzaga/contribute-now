import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContributeConfig } from '../../src/types.js';
import {
  configExists,
  getDefaultConfig,
  isGitignored,
  readConfig,
  writeConfig,
} from '../../src/utils/config.js';

const TEST_DIR = join(import.meta.dir, '__config_test_tmp__');

beforeEach(() => {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('config utilities', () => {
  it('getDefaultConfig returns expected defaults', () => {
    const cfg = getDefaultConfig();
    expect(cfg.workflow).toBe('clean-flow');
    expect(cfg.role).toBe('contributor');
    expect(cfg.mainBranch).toBe('main');
    expect(cfg.devBranch).toBe('dev');
    expect(cfg.origin).toBe('origin');
    expect(cfg.upstream).toBe('upstream');
    expect(Array.isArray(cfg.branchPrefixes)).toBe(true);
    expect(cfg.commitConvention).toBe('clean-commit');
  });

  it('configExists returns false when no config', () => {
    expect(configExists(TEST_DIR)).toBe(false);
  });

  it('writeConfig and readConfig round-trip', () => {
    const cfg: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
    };
    writeConfig(cfg, TEST_DIR);
    expect(configExists(TEST_DIR)).toBe(true);
    const read = readConfig(TEST_DIR);
    expect(read).toEqual(cfg);
  });

  it('readConfig returns null for missing config', () => {
    expect(readConfig(TEST_DIR)).toBeNull();
  });

  it('isGitignored returns false when no .gitignore', () => {
    expect(isGitignored(TEST_DIR)).toBe(false);
  });

  it('isGitignored returns true when .contributerc.json is in .gitignore', () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), '.contributerc.json\n');
    expect(isGitignored(TEST_DIR)).toBe(true);
  });

  it('isGitignored returns false when .contributerc.json not in .gitignore', () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), 'node_modules\ndist\n');
    expect(isGitignored(TEST_DIR)).toBe(false);
  });

  it('writeConfig and readConfig round-trip with github-flow (no devBranch)', () => {
    const cfg: ContributeConfig = {
      workflow: 'github-flow',
      role: 'contributor',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
    };
    writeConfig(cfg, TEST_DIR);
    const read = readConfig(TEST_DIR);
    expect(read).toEqual(cfg);
    expect(read?.devBranch).toBeUndefined();
  });
});
