import { describe, expect, it } from 'bun:test';
import { shouldContinueSetupWithExistingConfig } from '../../src/commands/setup.js';
import type { ContributeConfig } from '../../src/types.js';

function sampleConfig(): ContributeConfig {
  return {
    workflow: 'clean-flow',
    role: 'contributor',
    mainBranch: 'main',
    devBranch: 'dev',
    upstream: 'upstream',
    origin: 'origin',
    branchPrefixes: ['feature', 'fix'],
    commitConvention: 'clean-commit',
  };
}

describe('setup existing config gate', () => {
  it('stops setup when valid config exists and user chooses keep', async () => {
    let ensureIgnoredCalls = 0;
    const messages = { info: [] as string[], warn: [] as string[], success: [] as string[] };
    let summaryCalled = false;

    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: sampleConfig(),
      hasConfigFile: true,
      confirm: async () => false,
      ensureIgnored: () => {
        ensureIgnoredCalls++;
        return true;
      },
      onInfo: (message) => messages.info.push(message),
      onWarn: (message) => messages.warn.push(message),
      onSuccess: (message) => messages.success.push(message),
      summary: () => {
        summaryCalled = true;
      },
    });

    expect(shouldContinue).toBe(false);
    expect(summaryCalled).toBe(true);
    expect(ensureIgnoredCalls).toBe(1);
    expect(messages.success).toContain('Keeping existing setup.');
    expect(messages.warn).toHaveLength(0);
  });

  it('continues setup when valid config exists and user chooses overwrite', async () => {
    let ensureIgnoredCalls = 0;

    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: sampleConfig(),
      hasConfigFile: true,
      confirm: async () => true,
      ensureIgnored: () => {
        ensureIgnoredCalls++;
        return true;
      },
      onInfo: () => {},
      onWarn: () => {},
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(true);
    expect(ensureIgnoredCalls).toBe(0);
  });

  it('stops setup when invalid config file exists and user chooses keep', async () => {
    const warnings: string[] = [];
    const infos: string[] = [];

    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: null,
      hasConfigFile: true,
      confirm: async () => false,
      ensureIgnored: () => false,
      onInfo: (message) => infos.push(message),
      onWarn: (message) => warnings.push(message),
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(false);
    expect(warnings).toContain('Found .contributerc.json but it appears invalid.');
    expect(infos).toContain('Keeping existing file. Run setup again when ready to repair it.');
  });

  it('continues setup when invalid config file exists and user chooses overwrite', async () => {
    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: null,
      hasConfigFile: true,
      confirm: async () => true,
      ensureIgnored: () => false,
      onInfo: () => {},
      onWarn: () => {},
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(true);
  });

  it('continues setup when there is no existing config file', async () => {
    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: null,
      hasConfigFile: false,
      confirm: async () => true,
      ensureIgnored: () => false,
      onInfo: () => {},
      onWarn: () => {},
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(true);
  });
});
