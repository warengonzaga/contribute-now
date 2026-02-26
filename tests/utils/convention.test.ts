import { describe, expect, test } from 'bun:test';
import {
  CONVENTION_FORMAT_HINTS,
  CONVENTION_LABELS,
  getValidationError,
  validateCommitMessage,
} from '../../src/utils/convention';

describe('convention validator', () => {
  describe('conventional commits', () => {
    test('valid messages pass', () => {
      expect(validateCommitMessage('feat: add login page', 'conventional')).toBe(true);
      expect(validateCommitMessage('fix(auth): resolve token expiry', 'conventional')).toBe(true);
      expect(validateCommitMessage('docs: update README', 'conventional')).toBe(true);
      expect(validateCommitMessage('chore: update dependencies', 'conventional')).toBe(true);
      expect(validateCommitMessage('refactor(api): simplify handlers', 'conventional')).toBe(true);
      expect(validateCommitMessage('perf: optimize query', 'conventional')).toBe(true);
      expect(validateCommitMessage('test: add unit tests', 'conventional')).toBe(true);
      expect(validateCommitMessage('build: update webpack config', 'conventional')).toBe(true);
      expect(validateCommitMessage('ci: add github actions', 'conventional')).toBe(true);
      expect(validateCommitMessage('style: fix formatting', 'conventional')).toBe(true);
      expect(validateCommitMessage('revert: undo last commit', 'conventional')).toBe(true);
    });

    test('breaking changes pass', () => {
      expect(validateCommitMessage('feat!: redesign auth API', 'conventional')).toBe(true);
      expect(validateCommitMessage('fix!(auth): change error codes', 'conventional')).toBe(true);
    });

    test('scoped messages pass', () => {
      expect(validateCommitMessage('feat(user-profile): add avatar', 'conventional')).toBe(true);
      expect(validateCommitMessage('fix(api.v2): patch endpoint', 'conventional')).toBe(true);
    });

    test('invalid messages fail', () => {
      expect(validateCommitMessage('Add new feature', 'conventional')).toBe(false);
      expect(validateCommitMessage('feat add new feature', 'conventional')).toBe(false);
      expect(validateCommitMessage('FEAT: uppercase type', 'conventional')).toBe(false);
      expect(validateCommitMessage('feat:', 'conventional')).toBe(false);
      expect(validateCommitMessage('feat:missing space', 'conventional')).toBe(false);
      expect(validateCommitMessage('unknown: invalid type', 'conventional')).toBe(false);
    });

    test('rejects messages over 72 chars', () => {
      // The pattern allows up to 72 chars for the description part only
      // Total: "feat: " (6) + 72 chars = 78 — at 78 total the desc is exactly 72, still valid
      const valid = `feat: ${'a'.repeat(72)}`;
      expect(valid.length).toBe(78);
      expect(validateCommitMessage(valid, 'conventional')).toBe(true);

      const tooLong = `feat: ${'a'.repeat(73)}`;
      expect(validateCommitMessage(tooLong, 'conventional')).toBe(false);
    });
  });

  describe('clean commit', () => {
    test('valid messages pass', () => {
      expect(validateCommitMessage('📦 new: user authentication', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('🔧 update (api): improve errors', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('🗑️ remove: drop legacy code', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('🔒 security: sanitize input', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('⚙️ setup (ci): add workflow', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('☕ chore: update deps', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('🧪 test: add unit tests', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('📖 docs: update readme', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('🚀 release: version 1.0.0', 'clean-commit')).toBe(true);
    });

    test('breaking changes pass', () => {
      expect(validateCommitMessage('📦 new!: redesign config format', 'clean-commit')).toBe(true);
      expect(validateCommitMessage('🔧 update! (sync): change default', 'clean-commit')).toBe(true);
    });

    test('invalid messages fail', () => {
      expect(validateCommitMessage('feat: conventional style', 'clean-commit')).toBe(false);
      expect(validateCommitMessage('📦 new add feature', 'clean-commit')).toBe(false);
      expect(validateCommitMessage('📦 unknown: bad type', 'clean-commit')).toBe(false);
      expect(validateCommitMessage('new: missing emoji', 'clean-commit')).toBe(false);
    });
  });

  describe('none convention', () => {
    test('any message passes', () => {
      expect(validateCommitMessage('anything goes', 'none')).toBe(true);
      expect(validateCommitMessage('WIP', 'none')).toBe(true);
      expect(validateCommitMessage('', 'none')).toBe(true);
    });
  });

  describe('getValidationError', () => {
    test('returns empty for none', () => {
      expect(getValidationError('none')).toEqual([]);
    });

    test('returns error lines for conventional', () => {
      const errors = getValidationError('conventional');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Conventional Commits');
    });

    test('returns error lines for clean-commit', () => {
      const errors = getValidationError('clean-commit');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Clean Commit');
    });
  });

  describe('metadata', () => {
    test('all conventions have labels', () => {
      expect(CONVENTION_LABELS.conventional).toBeDefined();
      expect(CONVENTION_LABELS['clean-commit']).toBeDefined();
      expect(CONVENTION_LABELS.none).toBeDefined();
    });

    test('enforced conventions have format hints', () => {
      expect(CONVENTION_FORMAT_HINTS.conventional.length).toBeGreaterThan(0);
      expect(CONVENTION_FORMAT_HINTS['clean-commit'].length).toBeGreaterThan(0);
    });
  });
});
