import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContributeConfig } from '../../src/types.js';
import {
  configExists,
  ensureGitignored,
  getConfigLocationLabel,
  getDefaultConfig,
  getLocalConfigPath,
  isAIEnabled,
  isGitignored,
  readConfig,
  writeConfig,
} from '../../src/utils/config.js';

const TEST_DIR = join(tmpdir(), 'contribute-now-config-test');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
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
    expect(cfg.aiEnabled).toBe(true);
    expect(cfg.showTips).toBe(true);
    expect('guideRotation' in cfg).toBe(false);
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
      aiEnabled: false,
      showTips: true,
    };
    writeConfig(cfg, TEST_DIR);
    expect(configExists(TEST_DIR)).toBe(true);
    const read = readConfig(TEST_DIR);
    expect(read).toEqual(cfg);
  });

  it('writeConfig and readConfig preserve optional AI provider metadata', () => {
    const cfg: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      aiProvider: 'ollama-cloud',
      aiModel: 'gpt-oss:120b',
      showTips: false,
    };

    writeConfig(cfg, TEST_DIR);

    expect(readConfig(TEST_DIR)).toEqual(cfg);
  });

  it('readConfig ignores legacy aiHost metadata from older config files', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      aiProvider: 'ollama-cloud',
      aiModel: 'gpt-oss:120b',
      aiHost: 'https://ollama.com/v1',
      showTips: true,
    };

    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg, null, 2));

    expect(readConfig(TEST_DIR)).toEqual({
      ...cfg,
      aiHost: undefined,
    });
  });

  it('writeConfig stores config in local git metadata when repo exists', () => {
    mkdirSync(join(TEST_DIR, '.git'), { recursive: true });

    const cfg: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'contributor',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      showTips: true,
    };

    writeConfig(cfg, TEST_DIR);

    expect(existsSync(join(TEST_DIR, '.git', 'contribute-now', 'config.json'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.contributerc.json'))).toBe(false);
    expect(getConfigLocationLabel(TEST_DIR)).toBe('.git/contribute-now/config.json');
    expect(readConfig(TEST_DIR)).toEqual(cfg);
  });

  it('readConfig prefers legacy config when both legacy and local config exist', () => {
    mkdirSync(join(TEST_DIR, '.git'), { recursive: true });

    const legacyConfig: ContributeConfig = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix', 'docs'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      showTips: true,
    };

    const localConfig: ContributeConfig = {
      workflow: 'github-flow',
      role: 'contributor',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      showTips: true,
    };

    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(legacyConfig, null, 2));
    mkdirSync(join(TEST_DIR, '.git', 'contribute-now'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.git', 'contribute-now', 'config.json'),
      JSON.stringify(localConfig, null, 2),
    );

    expect(getConfigLocationLabel(TEST_DIR)).toBe('.contributerc.json');
    expect(readConfig(TEST_DIR)).toEqual(legacyConfig);
  });

  it('writeConfig updates the legacy config file when both legacy and local config exist', () => {
    mkdirSync(join(TEST_DIR, '.git'), { recursive: true });

    const legacyConfig = getDefaultConfig();
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(legacyConfig, null, 2));
    mkdirSync(join(TEST_DIR, '.git', 'contribute-now'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, '.git', 'contribute-now', 'config.json'),
      JSON.stringify({ ...legacyConfig, workflow: 'github-flow' }, null, 2),
    );

    const updatedConfig = { ...legacyConfig, showTips: false };

    writeConfig(updatedConfig, TEST_DIR);

    const legacyRaw = readFileSync(join(TEST_DIR, '.contributerc.json'), 'utf-8');
    const localConfigPath = getLocalConfigPath(TEST_DIR);

    expect(localConfigPath).not.toBeNull();

    const localRaw = readFileSync(localConfigPath ?? '', 'utf-8');

    expect(JSON.parse(legacyRaw)).toMatchObject(updatedConfig);
    expect(JSON.parse(localRaw)).toMatchObject({ ...legacyConfig, workflow: 'github-flow' });
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

  it('ensureGitignored creates .gitignore with .contributerc.json when missing', () => {
    expect(existsSync(join(TEST_DIR, '.gitignore'))).toBe(false);

    const changed = ensureGitignored(TEST_DIR);

    expect(changed).toBe(true);
    expect(isGitignored(TEST_DIR)).toBe(true);
  });

  it('ensureGitignored appends .contributerc.json when .gitignore exists', () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), 'node_modules\ndist');

    const changed = ensureGitignored(TEST_DIR);

    expect(changed).toBe(true);
    expect(isGitignored(TEST_DIR)).toBe(true);
  });

  it('ensureGitignored does not duplicate .contributerc.json entry', () => {
    writeFileSync(join(TEST_DIR, '.gitignore'), '.contributerc.json\n');

    const changed = ensureGitignored(TEST_DIR);

    expect(changed).toBe(false);
    const content = readFileSync(join(TEST_DIR, '.gitignore'), 'utf-8');
    const matches = content.split('\n').filter((line) => line.trim() === '.contributerc.json');
    expect(matches).toHaveLength(1);
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
      aiEnabled: true,
      showTips: true,
    };
    writeConfig(cfg, TEST_DIR);
    const read = readConfig(TEST_DIR);
    expect(read).toEqual(cfg);
    expect(read?.devBranch).toBeUndefined();
  });

  it('readConfig defaults aiEnabled to true for legacy config files', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
    };

    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));

    expect(readConfig(TEST_DIR)?.aiEnabled).toBe(true);
  });

  it('readConfig ignores legacy guideRotation state from older config files', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
      guideRotation: { doctor: 1 },
    };

    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));

    expect(readConfig(TEST_DIR)).toEqual({
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      showTips: true,
    });
  });

  it('isAIEnabled honors config and cli overrides', () => {
    const cfg = getDefaultConfig();

    expect(isAIEnabled(cfg)).toBe(true);
    expect(isAIEnabled(cfg, true)).toBe(false);
    expect(isAIEnabled({ ...cfg, aiEnabled: false })).toBe(false);
  });

  it('readConfig returns null for invalid workflow enum', () => {
    const cfg = {
      workflow: 'yolo-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
    };
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));
    expect(readConfig(TEST_DIR)).toBeNull();
  });

  it('readConfig returns null for invalid role enum', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'admin',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
    };
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));
    expect(readConfig(TEST_DIR)).toBeNull();
  });

  it('readConfig returns null for invalid commitConvention enum', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'gitmoji',
    };
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));
    expect(readConfig(TEST_DIR)).toBeNull();
  });

  it('readConfig returns null for empty mainBranch', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: '  ',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
    };
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));
    expect(readConfig(TEST_DIR)).toBeNull();
  });

  it('readConfig returns null for empty branchPrefixes', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'maintainer',
      mainBranch: 'main',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: [],
      commitConvention: 'clean-commit',
    };
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));
    expect(readConfig(TEST_DIR)).toBeNull();
  });

  it('readConfig returns null for empty upstream when role is contributor', () => {
    const cfg = {
      workflow: 'clean-flow',
      role: 'contributor',
      mainBranch: 'main',
      upstream: '  ',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'clean-commit',
    };
    writeFileSync(join(TEST_DIR, '.contributerc.json'), JSON.stringify(cfg));
    expect(readConfig(TEST_DIR)).toBeNull();
  });
});
