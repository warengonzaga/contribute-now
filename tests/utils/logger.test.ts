import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectHeading } from '../../src/utils/logger.js';
import { closeLocalStateStore, getGuideRotationIndex } from '../../src/utils/state.js';

let testDir = '';

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `contribute-now-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(testDir, '.git'), { recursive: true });
  writeFileSync(
    join(testDir, '.contributerc.json'),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
  );
});

afterEach(async () => {
  await closeLocalStateStore(testDir);

  try {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore Windows SQLite handle timing during temp cleanup.
  }
});

describe('projectHeading', () => {
  it('stores guide rotation in local state without rewriting workflow config', async () => {
    const originalConfig = readFileSync(join(testDir, '.contributerc.json'), 'utf-8');
    const originalLog = console.log;

    console.log = () => {};

    try {
      await projectHeading('commit', '💾', testDir);
    } finally {
      console.log = originalLog;
    }

    expect(readFileSync(join(testDir, '.contributerc.json'), 'utf-8')).toBe(originalConfig);
    expect(await getGuideRotationIndex('commit', testDir)).toBe(1);
    expect(existsSync(join(testDir, '.git', 'contribute-now', 'state.db'))).toBe(true);
  });
});
