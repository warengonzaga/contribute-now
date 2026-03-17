import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ConfigEngine } from '@wgtechlabs/config-engine';

interface LocalState {
  guideRotation: Record<string, number>;
}

const LOCAL_STATE_DIRNAME = 'contribute-now';
const LOCAL_STATE_CONFIG_NAME = 'state';
const LOCAL_STATE_LOCATION_LABEL = `.git/${LOCAL_STATE_DIRNAME}/${LOCAL_STATE_CONFIG_NAME}.db`;

const stateStoreCache = new Map<string, Promise<ConfigEngine<LocalState> | null>>();

function findRepoRoot(cwd = process.cwd()): string | null {
  let current = resolve(cwd);

  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function resolveGitDir(cwd = process.cwd()): string | null {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    return null;
  }

  const dotGitPath = join(repoRoot, '.git');

  try {
    const stat = statSync(dotGitPath);
    if (stat.isDirectory()) {
      return dotGitPath;
    }

    if (!stat.isFile()) {
      return null;
    }

    const content = readFileSync(dotGitPath, 'utf-8').trim();
    const match = /^gitdir:\s*(.+)$/i.exec(content);
    if (!match) {
      return null;
    }

    return resolve(repoRoot, match[1].trim());
  } catch {
    return null;
  }
}

function getLocalStateDir(cwd = process.cwd()): string | null {
  const gitDir = resolveGitDir(cwd);
  if (!gitDir) {
    return null;
  }

  return join(gitDir, LOCAL_STATE_DIRNAME);
}

async function openLocalStateStore(cwd = process.cwd()): Promise<ConfigEngine<LocalState> | null> {
  const stateDir = getLocalStateDir(cwd);
  if (!stateDir) {
    return null;
  }

  return ConfigEngine.open<LocalState>({
    projectName: 'contribute-now',
    cwd: stateDir,
    configName: LOCAL_STATE_CONFIG_NAME,
    defaults: {
      guideRotation: {},
    },
    flushStrategy: 'immediate',
  });
}

async function getLocalStateStore(cwd = process.cwd()): Promise<ConfigEngine<LocalState> | null> {
  const statePath = getLocalStatePath(cwd);
  const cacheKey = statePath ?? resolve(cwd);
  const existing = stateStoreCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const storePromise = openLocalStateStore(cwd).catch(() => null);
  stateStoreCache.set(cacheKey, storePromise);
  return storePromise;
}

export function getLocalStatePath(cwd = process.cwd()): string | null {
  const stateDir = getLocalStateDir(cwd);
  if (!stateDir) {
    return null;
  }

  return join(stateDir, `${LOCAL_STATE_CONFIG_NAME}.db`);
}

export function getLocalStateLocationLabel(cwd = process.cwd()): string | null {
  return getLocalStatePath(cwd) ? LOCAL_STATE_LOCATION_LABEL : null;
}

export function hasLocalStateStore(cwd = process.cwd()): boolean {
  const statePath = getLocalStatePath(cwd);
  return !!statePath && existsSync(statePath);
}

export async function getGuideRotationIndex(
  commandKey: string,
  cwd = process.cwd(),
): Promise<number> {
  const store = await getLocalStateStore(cwd);
  if (!store) {
    return 0;
  }

  const rotationIndex = store.get<number>(`guideRotation.${commandKey}`, 0);
  return typeof rotationIndex === 'number' ? rotationIndex : 0;
}

export async function advanceGuideRotation(
  commandKey: string,
  rotatableCount: number,
  cwd = process.cwd(),
): Promise<void> {
  if (rotatableCount <= 0) {
    return;
  }

  const store = await getLocalStateStore(cwd);
  if (!store) {
    return;
  }

  const rotationIndex = store.get<number>(`guideRotation.${commandKey}`, 0);
  const currentIndex = typeof rotationIndex === 'number' ? rotationIndex : 0;
  const nextIndex = (currentIndex + 1) % rotatableCount;
  store.set(`guideRotation.${commandKey}`, nextIndex);
}

export async function closeLocalStateStore(cwd = process.cwd()): Promise<void> {
  const statePath = getLocalStatePath(cwd);
  const cacheKey = statePath ?? resolve(cwd);
  const storePromise = stateStoreCache.get(cacheKey);
  if (!storePromise) {
    return;
  }

  stateStoreCache.delete(cacheKey);
  const store = await storePromise;
  store?.close();
}
