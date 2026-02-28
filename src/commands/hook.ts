import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { CONVENTION_LABELS } from '../utils/convention.js';
import { isGitRepo } from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';

const HOOK_MARKER = '# managed by contribute-now';

function getHooksDir(cwd = process.cwd()): string {
  return join(cwd, '.git', 'hooks');
}

function getHookPath(cwd = process.cwd()): string {
  return join(getHooksDir(cwd), 'commit-msg');
}

/**
 * Generate the commit-msg hook script.
 * The hook calls `contrib validate` with the commit message file.
 */
function generateHookScript(): string {
  return `#!/bin/sh
${HOOK_MARKER}
# Validates commit messages against your configured convention.
# Install:   contrib hook install
# Uninstall: contrib hook uninstall

commit_msg_file="$1"
commit_msg=$(head -1 "$commit_msg_file")

# Skip merge commits and fixup/squash commits
case "$commit_msg" in
  Merge\\ *|fixup!*|squash!*|amend!*) exit 0 ;;
esac

# Detect available package runner
if command -v contrib >/dev/null 2>&1; then
  contrib validate "$commit_msg"
elif command -v bunx >/dev/null 2>&1; then
  bunx contrib validate "$commit_msg"
elif command -v pnpx >/dev/null 2>&1; then
  pnpx contrib validate "$commit_msg"
elif command -v npx >/dev/null 2>&1; then
  npx contrib validate "$commit_msg"
else
  echo "Warning: No package runner found. Skipping commit message validation."
  exit 0
fi
`;
}

export default defineCommand({
  meta: {
    name: 'hook',
    description: 'Install or uninstall the commit-msg git hook',
  },
  args: {
    action: {
      type: 'positional',
      description: 'Action to perform: install or uninstall',
      required: true,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const action = args.action;
    if (action !== 'install' && action !== 'uninstall') {
      error(`Unknown action "${action}". Use "install" or "uninstall".`);
      process.exit(1);
    }

    if (action === 'install') {
      await installHook();
    } else {
      await uninstallHook();
    }
  },
});

async function installHook(): Promise<void> {
  heading('🪝 hook install');

  const config = readConfig();
  if (!config) {
    error('No .contributerc.json found. Run `contrib setup` first.');
    process.exit(1);
  }

  if (config.commitConvention === 'none') {
    warn('Commit convention is set to "none". No hook to install.');
    info('Change your convention with `contrib setup` first.');
    process.exit(0);
  }

  const hookPath = getHookPath();
  const hooksDir = getHooksDir();

  // Check for existing non-managed hook
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf-8');
    if (!existing.includes(HOOK_MARKER)) {
      error('A commit-msg hook already exists and was not installed by contribute-now.');
      warn(`Path: ${hookPath}`);
      warn('Remove it manually or back it up before installing.');
      process.exit(1);
    }
    info('Updating existing contribute-now hook...');
  }

  // Ensure hooks directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  writeFileSync(hookPath, generateHookScript(), { mode: 0o755 });

  success(`commit-msg hook installed.`);
  info(`Convention: ${pc.bold(CONVENTION_LABELS[config.commitConvention])}`);
  info(`Path: ${pc.dim(hookPath)}`);
  warn('Note: hooks can be bypassed with `git commit --no-verify`.');
}

async function uninstallHook(): Promise<void> {
  heading('🪝 hook uninstall');

  const hookPath = getHookPath();

  if (!existsSync(hookPath)) {
    info('No commit-msg hook found. Nothing to uninstall.');
    return;
  }

  const content = readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) {
    error('The commit-msg hook was not installed by contribute-now. Leaving it untouched.');
    process.exit(1);
  }

  rmSync(hookPath);
  success('commit-msg hook removed.');
}
