import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advanceGuideRotation,
  closeLocalStateStore,
  getGuideRotationIndex,
  getLocalStateLocationLabel,
  getLocalStatePath,
  hasLocalStateStore,
} from '../../src/utils/state.js';

let testDir = '';

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `contribute-now-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(testDir, '.git'), { recursive: true });
});

afterEach(async () => {
  await closeLocalStateStore(testDir);

  try {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore Windows SQLite handle timing during temp cleanup.
  }
});

describe('local state utilities', () => {
  it('stores guide rotation in repo-local state db', async () => {
    expect(hasLocalStateStore(testDir)).toBe(false);
    expect(getLocalStateLocationLabel(testDir)).toBe('.git/contribute-now/state.db');

    await advanceGuideRotation('commit', 4, testDir);

    expect(await getGuideRotationIndex('commit', testDir)).toBe(1);
    expect(hasLocalStateStore(testDir)).toBe(true);
    expect(existsSync(getLocalStatePath(testDir) ?? '')).toBe(true);
  });

  it('wraps guide rotation index by the rotatable example count', async () => {
    await advanceGuideRotation('commit', 2, testDir);
    await advanceGuideRotation('commit', 2, testDir);

    expect(await getGuideRotationIndex('commit', testDir)).toBe(0);
  });
});
