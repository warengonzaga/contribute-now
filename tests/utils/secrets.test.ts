import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  closeSecretsStore,
  deleteOllamaCloudApiKey,
  getOllamaCloudApiKey,
  getSecretsStorePath,
  hasOllamaCloudApiKey,
  hasSecretsStore,
  setOllamaCloudApiKey,
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
});
