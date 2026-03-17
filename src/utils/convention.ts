import type { CommitConvention } from '../types.js';

/**
 * Commit convention validators and metadata.
 *
 * Supported conventions:
 * - Conventional Commits (https://www.conventionalcommits.org/)
 * - Clean Commit by WGTech Labs (https://github.com/wgtechlabs/clean-commit)
 */

// Clean Commit: <emoji> <type>[!][(<scope>)]: <description>
const CLEAN_COMMIT_PATTERN =
  /^(📦|🔧|🗑\uFE0F?|🔒|⚙\uFE0F?|☕|🧪|📖|🚀) (new|update|remove|security|setup|chore|test|docs|release)(!?)( \([a-zA-Z0-9][a-zA-Z0-9-]*\))?: .{1,72}$/u;

// Conventional Commits: <type>[!][(<scope>)]: <description>
const CONVENTIONAL_COMMIT_PATTERN =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(!?)(\([a-zA-Z0-9][a-zA-Z0-9._-]*\))?: .{1,72}$/;

export const CONVENTION_LABELS: Record<CommitConvention, string> = {
  conventional: 'Conventional Commits',
  'clean-commit': 'Clean Commit (by WGTech Labs)',
  none: 'No convention',
};

export const CONVENTION_DESCRIPTIONS: Record<CommitConvention, string> = {
  conventional:
    'Conventional Commits — feat: | fix: | docs: | chore: etc. (conventionalcommits.org)',
  'clean-commit': 'Clean Commit — 📦 new: | 🔧 update: | 🗑️ remove: etc. (by WGTech Labs)',
  none: 'No commit convention enforcement',
};

export const CONVENTION_FORMAT_HINTS: Record<Exclude<CommitConvention, 'none'>, string[]> = {
  conventional: [
    'Format: <type>[!][(<scope>)]: <description>',
    'Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert',
    'Examples: feat: add login page | fix(auth): resolve token expiry | docs: update README',
    'Do not use backticks or markdown formatting in the message.',
  ],
  'clean-commit': [
    'Format: <emoji> <type>[!][(<scope>)]: <description>',
    'Types: 📦 new | 🔧 update | 🗑️ remove | 🔒 security | ⚙️ setup | ☕ chore | 🧪 test | 📖 docs | 🚀 release',
    'Examples: 📦 new: user auth | 🔧 update (api): improve errors | ⚙️ setup (ci): add workflow',
    'Do not use backticks or markdown formatting in the message.',
  ],
};

export function hasUnsupportedCommitMessageChars(message: string): boolean {
  return message.includes('`');
}

/**
 * Validate a commit message against the given convention.
 * Returns true if the message passes validation.
 */
export function validateCommitMessage(message: string, convention: CommitConvention): boolean {
  if (convention === 'none') return true;
  if (hasUnsupportedCommitMessageChars(message)) return false;
  if (convention === 'clean-commit') return CLEAN_COMMIT_PATTERN.test(message);
  if (convention === 'conventional') return CONVENTIONAL_COMMIT_PATTERN.test(message);
  return true;
}

/**
 * Get a user-friendly error message explaining why validation failed.
 */
export function getValidationError(convention: CommitConvention): string[] {
  if (convention === 'none') return [];
  return [
    `Commit message does not follow ${CONVENTION_LABELS[convention]} format.`,
    'Do not use backticks or markdown formatting in commit messages.',
    ...CONVENTION_FORMAT_HINTS[convention],
  ];
}
