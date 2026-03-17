import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { SecretsEngine } from '@wgtechlabs/secrets-engine';

const CONTRIBUTE_NOW_SECRETS_DIRNAME = '.contribute-now';
const CONTRIBUTE_NOW_SECRETS_STORE_DIRNAME = 'secrets';
const OLLAMA_CLOUD_API_KEY = 'ollama.cloud.apiKey';

const secretsStoreCache = new Map<string, Promise<SecretsEngine>>();

export function getSecretsStorePath(baseDir = homedir()): string {
  return resolve(baseDir, CONTRIBUTE_NOW_SECRETS_DIRNAME, CONTRIBUTE_NOW_SECRETS_STORE_DIRNAME);
}

async function getSecretsStore(
  baseDir = homedir(),
  createIfMissing = true,
): Promise<SecretsEngine | null> {
  const storePath = getSecretsStorePath(baseDir);
  const existing = secretsStoreCache.get(storePath);
  if (existing) {
    return existing;
  }

  if (!createIfMissing && !existsSync(storePath)) {
    return null;
  }

  const storePromise = SecretsEngine.open({ path: storePath });
  secretsStoreCache.set(storePath, storePromise);
  return storePromise;
}

export function hasSecretsStore(baseDir = homedir()): boolean {
  return existsSync(getSecretsStorePath(baseDir));
}

export async function hasOllamaCloudApiKey(baseDir = homedir()): Promise<boolean> {
  const store = await getSecretsStore(baseDir, false);
  return store ? store.has(OLLAMA_CLOUD_API_KEY) : false;
}

export async function getOllamaCloudApiKey(baseDir = homedir()): Promise<string | null> {
  const store = await getSecretsStore(baseDir, false);
  return store ? store.get(OLLAMA_CLOUD_API_KEY) : null;
}

export async function setOllamaCloudApiKey(value: string, baseDir = homedir()): Promise<void> {
  const store = await getSecretsStore(baseDir);
  if (!store) {
    throw new Error('Secrets store could not be opened');
  }
  await store.set(OLLAMA_CLOUD_API_KEY, value);
}

export async function deleteOllamaCloudApiKey(baseDir = homedir()): Promise<boolean> {
  const store = await getSecretsStore(baseDir, false);
  return store ? store.delete(OLLAMA_CLOUD_API_KEY) : false;
}

export async function closeSecretsStore(baseDir = homedir()): Promise<void> {
  const storePath = getSecretsStorePath(baseDir);
  const storePromise = secretsStoreCache.get(storePath);
  if (!storePromise) {
    return;
  }

  secretsStoreCache.delete(storePath);
  const store = await storePromise;
  await store.close();
}
