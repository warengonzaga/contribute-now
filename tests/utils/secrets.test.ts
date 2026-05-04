import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeSecretsStore,
  deleteOllamaCloudApiKey,
  deleteOpenRouterApiKey,
  getOllamaCloudApiKey,
  getOpenRouterApiKey,
  getSecretsStorePath,
  hasOllamaCloudApiKey,
  hasOpenRouterApiKey,
  hasSecretsStore,
  setOllamaCloudApiKey,
  setOpenRouterApiKey,
} from '../../src/utils/secrets.js';

let testDir = '';

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `contribute-now-secrets-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(async () => {
  await closeSecretsStore(testDir);

  try {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore platform-specific delayed handle release during temp cleanup.
  }
});

describe('secrets utilities', () => {
  it('stores and reads the Ollama Cloud API key from the explicit secrets path', async () => {
    expect(hasSecretsStore(testDir)).toBe(false);

    await setOllamaCloudApiKey('ollama-test-key', testDir);

    expect(hasSecretsStore(testDir)).toBe(true);
    expect(getSecretsStorePath(testDir)).toContain('.contribute-now');
    expect(await hasOllamaCloudApiKey(testDir)).toBe(true);
    expect(await getOllamaCloudApiKey(testDir)).toBe('ollama-test-key');
  });

  it('deletes the stored Ollama Cloud API key', async () => {
    await setOllamaCloudApiKey('ollama-test-key', testDir);

    expect(await deleteOllamaCloudApiKey(testDir)).toBe(true);
    expect(await hasOllamaCloudApiKey(testDir)).toBe(false);
    expect(await getOllamaCloudApiKey(testDir)).toBeNull();
  });

  it('stores and reads the OpenRouter API key from the explicit secrets path', async () => {
    expect(hasSecretsStore(testDir)).toBe(false);

    await setOpenRouterApiKey('or-test-key', testDir);

    expect(hasSecretsStore(testDir)).toBe(true);
    expect(getSecretsStorePath(testDir)).toContain('.contribute-now');
    expect(await hasOpenRouterApiKey(testDir)).toBe(true);
    expect(await getOpenRouterApiKey(testDir)).toBe('or-test-key');
  });

  it('deletes the stored OpenRouter API key', async () => {
    await setOpenRouterApiKey('or-test-key', testDir);

    expect(await deleteOpenRouterApiKey(testDir)).toBe(true);
    expect(await hasOpenRouterApiKey(testDir)).toBe(false);
    expect(await getOpenRouterApiKey(testDir)).toBeNull();
  });

  it('stores both Ollama Cloud and OpenRouter keys independently', async () => {
    await setOllamaCloudApiKey('ollama-key', testDir);
    await setOpenRouterApiKey('openrouter-key', testDir);

    expect(await hasOllamaCloudApiKey(testDir)).toBe(true);
    expect(await hasOpenRouterApiKey(testDir)).toBe(true);
    expect(await getOllamaCloudApiKey(testDir)).toBe('ollama-key');
    expect(await getOpenRouterApiKey(testDir)).toBe('openrouter-key');

    // Deleting one key does not affect the other
    await deleteOllamaCloudApiKey(testDir);
    expect(await hasOllamaCloudApiKey(testDir)).toBe(false);
    expect(await hasOpenRouterApiKey(testDir)).toBe(true);
    expect(await getOpenRouterApiKey(testDir)).toBe('openrouter-key');
  });
});
