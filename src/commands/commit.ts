import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, selectPrompt } from '../utils/confirm.js';
import { checkCopilotAvailable, generateCommitMessage } from '../utils/copilot.js';
import {
  commitWithMessage,
  getChangedFiles,
  getStagedDiff,
  getStagedFiles,
  isGitRepo,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';

// Clean Commit regex for validation
const CLEAN_COMMIT_PATTERN =
  /^(📦|🔧|🗑\uFE0F?|🔒|⚙\uFE0F?|☕|🧪|📖|🚀) (new|update|remove|security|setup|chore|test|docs|release)(!?)( \([a-zA-Z0-9][a-zA-Z0-9-]*\))?: .{1,72}$/u;

function validateCleanCommit(msg: string): boolean {
  return CLEAN_COMMIT_PATTERN.test(msg);
}

export default defineCommand({
  meta: {
    name: 'commit',
    description: 'Stage changes and create a Clean Commit message (AI-powered)',
  },
  args: {
    model: {
      type: 'string',
      description: 'AI model to use for commit message generation',
    },
    'no-ai': {
      type: 'boolean',
      description: 'Skip AI and write commit message manually',
      default: false,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const config = readConfig();
    if (!config) {
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    heading('💾 contrib commit');

    // 1. Check for staged changes
    const stagedFiles = await getStagedFiles();

    // 2. If nothing staged, show changed files and prompt to stage
    if (stagedFiles.length === 0) {
      const changedFiles = await getChangedFiles();
      if (changedFiles.length === 0) {
        error('No changes to commit.');
        process.exit(1);
      }

      console.log(`\n${pc.bold('Changed files:')}`);
      for (const f of changedFiles) {
        console.log(`  ${pc.dim('•')} ${f}`);
      }
      console.log();
      warn('No staged changes. Stage your files with `git add` and re-run.');
      process.exit(1);
    }

    info(`Staged files: ${stagedFiles.join(', ')}`);

    let commitMessage: string | null = null;

    // 3. AI: generate commit message
    const useAI = !args['no-ai'];
    if (useAI) {
      const copilotError = await checkCopilotAvailable();
      if (copilotError) {
        warn(`AI unavailable: ${copilotError}`);
        warn('Falling back to manual commit message entry.');
      } else {
        info('Generating commit message with AI...');
        const diff = await getStagedDiff();
        commitMessage = await generateCommitMessage(diff, stagedFiles, args.model);

        if (commitMessage) {
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(commitMessage))}`);
        } else {
          warn('AI did not return a commit message. Falling back to manual entry.');
        }
      }
    }

    // 4. Let user accept / edit / regenerate / write manually
    let finalMessage: string | null = null;

    if (commitMessage) {
      const action = await selectPrompt('What would you like to do?', [
        'Accept this message',
        'Edit this message',
        'Regenerate',
        'Write manually',
      ]);

      if (action === 'Accept this message') {
        finalMessage = commitMessage;
      } else if (action === 'Edit this message') {
        finalMessage = await inputPrompt('Edit commit message', commitMessage);
      } else if (action === 'Regenerate') {
        info('Regenerating...');
        const diff = await getStagedDiff();
        const regen = await generateCommitMessage(diff, stagedFiles, args.model);
        if (regen) {
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(regen))}`);
          const ok = await confirmPrompt('Use this message?');
          finalMessage = ok ? regen : await inputPrompt('Enter commit message manually');
        } else {
          warn('Regeneration failed. Falling back to manual entry.');
          finalMessage = await inputPrompt('Enter commit message');
        }
      } else {
        finalMessage = await inputPrompt('Enter commit message');
      }
    } else {
      // Fallback: manual entry with Clean Commit validation
      console.log();
      console.log(pc.dim('Clean Commit format: <emoji> <type>[!][(<scope>)]: <description>'));
      console.log(pc.dim('Examples: 📦 new: user auth | 🔧 update (api): improve errors'));
      console.log();
      finalMessage = await inputPrompt('Enter commit message');
    }

    if (!finalMessage) {
      error('No commit message provided.');
      process.exit(1);
    }

    // Validate Clean Commit format
    if (!validateCleanCommit(finalMessage)) {
      warn('Commit message does not follow Clean Commit format.');
      warn('Format: <emoji> <type>[!][(<scope>)]: <description>');
      const proceed = await confirmPrompt('Commit anyway?');
      if (!proceed) process.exit(1);
    }

    // 5. git commit
    const result = await commitWithMessage(finalMessage);
    if (result.exitCode !== 0) {
      error(`Failed to commit: ${result.stderr}`);
      process.exit(1);
    }

    success(`✅ Committed: ${pc.bold(finalMessage)}`);
  },
});
