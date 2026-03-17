import { describe, expect, it } from 'bun:test';
import {
  buildConfigSnapshot,
  finalizeEditedConfig,
  parseBranchPrefixesInput,
} from '../../src/commands/config.js';
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
    aiEnabled: true,
    aiProvider: 'ollama-cloud',
    aiModel: 'gpt-oss:120b',
    showTips: true,
  };
}

describe('parseBranchPrefixesInput', () => {
  it('parses comma-separated values and trims whitespace', () => {
    expect(parseBranchPrefixesInput('feature, fix, docs ', ['fallback'])).toEqual([
      'feature',
      'fix',
      'docs',
    ]);
  });

  it('falls back when no valid prefixes are provided', () => {
    expect(parseBranchPrefixesInput(' ,  , ', ['feature', 'fix'])).toEqual(['feature', 'fix']);
  });
});

describe('finalizeEditedConfig', () => {
  it('removes workflow dev branch and AI metadata when not applicable', () => {
    const current = sampleConfig();
    const next = finalizeEditedConfig(current, {
      workflow: 'github-flow',
      role: 'maintainer',
      mainBranch: 'main',
      devBranch: 'dev',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature'],
      commitConvention: 'conventional',
      aiEnabled: false,
      showTips: false,
    });

    expect(next.workflow).toBe('github-flow');
    expect(next.devBranch).toBeUndefined();
    expect(next.aiEnabled).toBe(false);
    expect(next.aiProvider).toBeUndefined();
    expect(next.aiModel).toBeUndefined();
    expect(next.showTips).toBe(false);
  });

  it('normalizes ollama-cloud defaults when AI stays enabled', () => {
    const current = sampleConfig();
    const next = finalizeEditedConfig(current, {
      workflow: 'git-flow',
      role: 'contributor',
      mainBranch: 'main',
      devBranch: '',
      upstream: 'upstream',
      origin: 'origin',
      branchPrefixes: ['feature', 'fix'],
      commitConvention: 'clean-commit',
      aiEnabled: true,
      aiProvider: 'ollama-cloud',
      aiModel: '',
      showTips: true,
    });

    expect(next.devBranch).toBe('develop');
    expect(next.aiProvider).toBe('ollama-cloud');
    expect(next.aiModel).toBe('gpt-oss:120b');
  });
});

describe('buildConfigSnapshot', () => {
  it('includes config metadata and ollama secrets status', () => {
    const snapshot = buildConfigSnapshot(sampleConfig(), {
      source: 'local',
      location: '.git/contribute-now/config.json',
      hasOllamaCloudApiKey: true,
      secretsPath: '/home/test/.contribute-now/secrets',
    });

    expect(snapshot.source).toBe('local');
    expect(snapshot.location).toBe('.git/contribute-now/config.json');
    expect(snapshot.workflowLabel).toContain('Clean Flow');
    expect(snapshot.ai.enabled).toBe(true);
    expect(snapshot.ai.provider).toBe('ollama-cloud');
    expect(snapshot.ai.ollamaCloudApiKeyPresent).toBe(true);
    expect(snapshot.ai.secretsPath).toBe('/home/test/.contribute-now/secrets');
  });

  it('omits provider metadata when AI is disabled', () => {
    const snapshot = buildConfigSnapshot(
      {
        ...sampleConfig(),
        aiEnabled: false,
      },
      {
        source: 'legacy',
        location: '.contributerc.json',
        hasOllamaCloudApiKey: true,
        secretsPath: '/home/test/.contribute-now/secrets',
      },
    );

    expect(snapshot.ai.enabled).toBe(false);
    expect(snapshot.ai.provider).toBeNull();
    expect(snapshot.ai.ollamaCloudApiKeyPresent).toBeNull();
    expect(snapshot.ai.secretsPath).toBeNull();
  });
});
