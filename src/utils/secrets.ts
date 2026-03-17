import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const CONTRIBUTE_NOW_SECRETS_DIRNAME = '.contribute-now';
const CONTRIBUTE_NOW_SECRETS_STORE_DIRNAME = 'secrets';
const OLLAMA_CLOUD_API_KEY = 'ollama.cloud.apiKey';

interface SecretsStore {
  [OLLAMA_CLOUD_API_KEY]?: string;
}

export function getSecretsStorePath(baseDir = homedir()): string {
  return resolve(baseDir, CONTRIBUTE_NOW_SECRETS_DIRNAME, CONTRIBUTE_NOW_SECRETS_STORE_DIRNAME);
}

function getSecretsFilePath(baseDir = homedir()): string {
  return join(getSecretsStorePath(baseDir), 'store.json');
}

function readSecretsStore(baseDir = homedir()): SecretsStore | null {
  const filePath = getSecretsFilePath(baseDir);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SecretsStore;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function writeSecretsStore(store: SecretsStore, baseDir = homedir()): void {
  const storePath = getSecretsStorePath(baseDir);
  const filePath = getSecretsFilePath(baseDir);

  mkdirSync(storePath, { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });

  try {
    chmodSync(storePath, 0o700);
    chmodSync(filePath, 0o600);
  } catch {
    // Best-effort permissions tightening for platforms that support it.
  }
}

export function hasSecretsStore(baseDir = homedir()): boolean {
  return existsSync(getSecretsFilePath(baseDir));
}

export async function hasOllamaCloudApiKey(baseDir = homedir()): Promise<boolean> {
  return typeof readSecretsStore(baseDir)?.[OLLAMA_CLOUD_API_KEY] === 'string';
}

export async function getOllamaCloudApiKey(baseDir = homedir()): Promise<string | null> {
  return readSecretsStore(baseDir)?.[OLLAMA_CLOUD_API_KEY] ?? null;
}

export async function setOllamaCloudApiKey(value: string, baseDir = homedir()): Promise<void> {
  const existingStore = readSecretsStore(baseDir) ?? {};
  writeSecretsStore(
    {
      ...existingStore,
      [OLLAMA_CLOUD_API_KEY]: value,
    },
    baseDir,
  );
}

export async function deleteOllamaCloudApiKey(baseDir = homedir()): Promise<boolean> {
  const existingStore = readSecretsStore(baseDir);
  if (!existingStore || !(OLLAMA_CLOUD_API_KEY in existingStore)) {
    return false;
  }

  const nextStore = { ...existingStore };
  delete nextStore[OLLAMA_CLOUD_API_KEY];

  if (Object.keys(nextStore).length === 0) {
    try {
      rmSync(getSecretsFilePath(baseDir), { force: true });
      rmSync(getSecretsStorePath(baseDir), { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures; the key is already removed from memory.
    }
    return true;
  }

  writeSecretsStore(nextStore, baseDir);
  return true;
}

export async function closeSecretsStore(baseDir = homedir()): Promise<void> {
  void baseDir;
}
