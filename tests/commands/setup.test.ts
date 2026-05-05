import { describe, expect, it } from 'bun:test';
import {
  resolveApiKeyForSetup,
  shouldContinueSetupWithExistingConfig,
} from '../../src/commands/setup.js';
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
    const messages = { info: [] as string[], warn: [] as string[], success: [] as string[] };
    let summaryCalled = false;

    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: sampleConfig(),
      hasConfigFile: true,
      confirm: async () => false,
      onInfo: (message) => messages.info.push(message),
      onWarn: (message) => messages.warn.push(message),
      onSuccess: (message) => messages.success.push(message),
      summary: () => {
        summaryCalled = true;
      },
    });

    expect(shouldContinue).toBe(false);
    expect(summaryCalled).toBe(true);
    expect(messages.success).toContain('Keeping existing setup.');
    expect(messages.warn).toHaveLength(0);
  });

  it('continues setup when valid config exists and user chooses overwrite', async () => {
    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: sampleConfig(),
      hasConfigFile: true,
      confirm: async () => true,
      onInfo: () => {},
      onWarn: () => {},
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(true);
  });

  it('stops setup when invalid config file exists and user chooses keep', async () => {
    const warnings: string[] = [];
    const infos: string[] = [];

    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: null,
      hasConfigFile: true,
      confirm: async () => false,
      onInfo: (message) => infos.push(message),
      onWarn: (message) => warnings.push(message),
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(false);
    expect(warnings).toContain('Found an existing repo config but it appears invalid.');
    expect(infos).toContain('Keeping existing file. Run setup again when ready to repair it.');
  });

  it('continues setup when invalid config file exists and user chooses overwrite', async () => {
    const shouldContinue = await shouldContinueSetupWithExistingConfig({
      existingConfig: null,
      hasConfigFile: true,
      confirm: async () => true,
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
      onInfo: () => {},
      onWarn: () => {},
      onSuccess: () => {},
      summary: () => {},
    });

    expect(shouldContinue).toBe(true);
  });
});

describe('setup API key resolution', () => {
  it('reuses stored key when keep is selected', async () => {
    const result = await resolveApiKeyForSetup({
      providerLabel: 'OpenRouter',
      hasStoredKey: true,
      getStoredKey: async () => 'stored-secret',
      select: async () => 'Keep existing stored key',
      promptSecret: async () => 'should-not-be-used',
    });

    expect(result.apiKey).toBe('stored-secret');
    expect(result.shouldStore).toBe(false);
    expect(result.reusedStoredKey).toBe(true);
  });

  it('prompts for replacement when keep is selected but stored key is missing', async () => {
    const result = await resolveApiKeyForSetup({
      providerLabel: 'Ollama Cloud',
      hasStoredKey: true,
      getStoredKey: async () => null,
      select: async () => 'Keep existing stored key',
      promptSecret: async () => 'new-secret',
    });

    expect(result.apiKey).toBe('new-secret');
    expect(result.shouldStore).toBe(true);
    expect(result.reusedStoredKey).toBe(false);
  });

  it('prompts for initial key when no stored key exists', async () => {
    const result = await resolveApiKeyForSetup({
      providerLabel: 'OpenRouter',
      hasStoredKey: false,
      getStoredKey: async () => null,
      select: async () => 'Keep existing stored key',
      promptSecret: async () => 'first-secret',
    });

    expect(result.apiKey).toBe('first-secret');
    expect(result.shouldStore).toBe(true);
    expect(result.reusedStoredKey).toBe(false);
  });

  it('prompts for replacement when replace is selected', async () => {
    const result = await resolveApiKeyForSetup({
      providerLabel: 'OpenRouter',
      hasStoredKey: true,
      getStoredKey: async () => 'stored-secret',
      select: async () => 'Replace stored key',
      promptSecret: async () => 'replacement-secret',
    });

    expect(result.apiKey).toBe('replacement-secret');
    expect(result.shouldStore).toBe(true);
    expect(result.reusedStoredKey).toBe(false);
  });

  it('throws validation error when replacement key is empty', async () => {
    await expect(
      resolveApiKeyForSetup({
        providerLabel: 'Ollama Cloud',
        hasStoredKey: true,
        getStoredKey: async () => 'stored-secret',
        select: async () => 'Replace stored key',
        promptSecret: async () => '   ',
      }),
    ).rejects.toThrow('Ollama Cloud API key is required when Ollama Cloud is selected.');
  });
});
