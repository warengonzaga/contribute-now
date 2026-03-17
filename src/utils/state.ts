import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

interface LocalState {
  guideRotation: Record<string, number>;
}

const LOCAL_STATE_DIRNAME = 'contribute-now';
const LOCAL_STATE_CONFIG_NAME = 'state';
const LOCAL_STATE_LOCATION_LABEL = `.git/${LOCAL_STATE_DIRNAME}/${LOCAL_STATE_CONFIG_NAME}.db`;

const DEFAULT_LOCAL_STATE: LocalState = {
  guideRotation: {},
};

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

function readLocalState(cwd = process.cwd()): LocalState {
  const statePath = getLocalStatePath(cwd);
  if (!statePath || !existsSync(statePath)) {
    return DEFAULT_LOCAL_STATE;
  }

  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as Partial<LocalState>;
    const guideRotation =
      raw.guideRotation && typeof raw.guideRotation === 'object' ? raw.guideRotation : {};

    return {
      guideRotation: Object.fromEntries(
        Object.entries(guideRotation).filter((entry): entry is [string, number] => {
          const [key, value] = entry;
          return typeof key === 'string' && typeof value === 'number' && Number.isFinite(value);
        }),
      ),
    };
  } catch {
    return DEFAULT_LOCAL_STATE;
  }
}

function writeLocalState(state: LocalState, cwd = process.cwd()): void {
  const statePath = getLocalStatePath(cwd);
  if (!statePath) {
    return;
  }

  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
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
  const rotationIndex = readLocalState(cwd).guideRotation[commandKey];
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

  const state = readLocalState(cwd);
  const rotationIndex = state.guideRotation[commandKey];
  const currentIndex = typeof rotationIndex === 'number' ? rotationIndex : 0;
  const nextIndex = (currentIndex + 1) % rotatableCount;
  writeLocalState(
    {
      guideRotation: {
        ...state.guideRotation,
        [commandKey]: nextIndex,
      },
    },
    cwd,
  );
}

export async function closeLocalStateStore(cwd = process.cwd()): Promise<void> {
  void cwd;
}
