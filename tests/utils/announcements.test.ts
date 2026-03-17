import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getActiveAnnouncements } from '../../src/utils/announcements.js';

const TEST_DIR = join(tmpdir(), 'contribute-now-announcements-test');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('announcements', () => {
  it('returns no announcements when no matching conditions are active', () => {
    expect(getActiveAnnouncements(TEST_DIR)).toEqual([]);
  });

  it('returns the legacy config migration notice when .contributerc.json exists', () => {
    mkdirSync(join(TEST_DIR, '.git'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.contributerc.json'), '{}\n');

    const announcements = getActiveAnnouncements(TEST_DIR);

    expect(announcements).toHaveLength(1);
    expect(announcements[0]?.id).toBe('legacy-config-migration');
    expect(announcements[0]?.kind).toBe('notice');
  });
});
