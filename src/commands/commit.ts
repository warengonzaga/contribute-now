import { defineCommand } from 'citty';
import pc from 'picocolors';
import type { ContributeConfig } from '../types.js';
import { readConfig } from '../utils/config.js';
import { confirmPrompt, inputPrompt, multiSelectPrompt, selectPrompt } from '../utils/confirm.js';
import {
  CONVENTION_FORMAT_HINTS,
  getValidationError,
  validateCommitMessage,
} from '../utils/convention.js';
import {
  checkCopilotAvailable,
  generateCommitGroups,
  generateCommitMessage,
  regenerateAllGroupMessages,
  regenerateGroupMessage,
} from '../utils/copilot.js';
import {
  assertCleanGitState,
  commitWithMessage,
  getChangedFiles,
  getFullDiffForFiles,
  getStagedDiff,
  getStagedFiles,
  isGitRepo,
  stageAll,
  stageFiles,
  unstageFiles,
} from '../utils/git.js';
import { error, heading, info, success, warn } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

export default defineCommand({
  meta: {
    name: 'commit',
    description: 'Stage changes and create a commit message (AI-powered)',
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
    group: {
      type: 'boolean',
      description: 'AI groups related changes into separate atomic commits',
      default: false,
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    // Guard: check for in-progress git operations, lock files, and shallow clone
    await assertCleanGitState('committing');

    const config = readConfig();
    if (!config) {
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    heading('💾 contrib commit');

    // ── Group commit mode ──────────────────────────────────────────────
    if (args.group) {
      await runGroupCommit(args.model, config);
      return;
    }

    // ── Single commit mode ─────────────────────────────────────────────

    // 1. Check for staged changes
    let stagedFiles = await getStagedFiles();

    // 2. If nothing staged, offer interactive staging
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

      const stageAction = await selectPrompt('No staged changes. How would you like to stage?', [
        'Stage all changes',
        'Select files to stage',
        'Cancel',
      ]);

      if (stageAction === 'Cancel') {
        process.exit(0);
      }

      if (stageAction === 'Stage all changes') {
        const result = await stageAll();
        if (result.exitCode !== 0) {
          error(`Failed to stage files: ${result.stderr}`);
          process.exit(1);
        }
        success('Staged all changes.');
      } else {
        const selected = await multiSelectPrompt('Select files to stage:', changedFiles);
        if (selected.length === 0) {
          error('No files selected.');
          process.exit(1);
        }
        const result = await stageFiles(selected);
        if (result.exitCode !== 0) {
          error(`Failed to stage files: ${result.stderr}`);
          process.exit(1);
        }
        success(`Staged ${selected.length} file(s).`);
      }

      stagedFiles = await getStagedFiles();
      if (stagedFiles.length === 0) {
        error('No staged changes after staging attempt.');
        process.exit(1);
      }
    }

    info(`Staged files: ${stagedFiles.join(', ')}`);

    let commitMessage: string | null = null;

    // 3. AI: generate commit message
    const useAI = !args['no-ai'];
    if (useAI) {
      // Parallelize: check Copilot availability while fetching diff
      const [copilotError, diff] = await Promise.all([checkCopilotAvailable(), getStagedDiff()]);
      if (copilotError) {
        warn(`AI unavailable: ${copilotError}`);
        warn('Falling back to manual commit message entry.');
      } else {
        const spinner = createSpinner('Generating commit message with AI...');
        commitMessage = await generateCommitMessage(
          diff,
          stagedFiles,
          args.model,
          config.commitConvention,
        );

        if (commitMessage) {
          spinner.success('AI commit message generated.');
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(commitMessage))}`);
        } else {
          spinner.fail('AI did not return a commit message.');
          warn('Falling back to manual entry.');
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
        const spinner = createSpinner('Regenerating commit message...');
        const diff = await getStagedDiff();
        const regen = await generateCommitMessage(
          diff,
          stagedFiles,
          args.model,
          config.commitConvention,
        );
        if (regen) {
          spinner.success('Commit message regenerated.');
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(regen))}`);
          const ok = await confirmPrompt('Use this message?');
          finalMessage = ok ? regen : await inputPrompt('Enter commit message manually');
        } else {
          spinner.fail('Regeneration failed.');
          finalMessage = await inputPrompt('Enter commit message');
        }
      } else {
        finalMessage = await inputPrompt('Enter commit message');
      }
    } else {
      // Fallback: manual entry with convention hints
      const convention = config.commitConvention;
      if (convention !== 'none') {
        console.log();
        for (const hint of CONVENTION_FORMAT_HINTS[convention]) {
          console.log(pc.dim(hint));
        }
        console.log();
      }
      finalMessage = await inputPrompt('Enter commit message');
    }

    if (!finalMessage) {
      error('No commit message provided.');
      process.exit(1);
    }

    // Validate commit message against configured convention
    const convention = config.commitConvention;
    if (!validateCommitMessage(finalMessage, convention)) {
      for (const line of getValidationError(convention)) {
        warn(line);
      }
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

// ── Group Commit Mode ────────────────────────────────────────────────

async function runGroupCommit(model: string | undefined, config: ContributeConfig): Promise<void> {
  // Parallelize: check Copilot + gather changed files concurrently
  const [copilotError, changedFiles] = await Promise.all([
    checkCopilotAvailable(),
    getChangedFiles(),
  ]);

  if (copilotError) {
    error(`AI is required for --group mode but unavailable: ${copilotError}`);
    process.exit(1);
  }

  if (changedFiles.length === 0) {
    error('No changes to group-commit.');
    process.exit(1);
  }

  console.log(`\n${pc.bold('Changed files:')}`);
  for (const f of changedFiles) {
    console.log(`  ${pc.dim('•')} ${f}`);
  }

  const spinner = createSpinner(
    `Asking AI to group ${changedFiles.length} file(s) into logical commits...`,
  );

  const diffs = await getFullDiffForFiles(changedFiles);
  if (!diffs.trim()) {
    spinner.stop();
    warn('Could not retrieve diff context for any files. AI needs diffs to produce groups.');
  }

  let groups: Awaited<ReturnType<typeof generateCommitGroups>>;
  try {
    groups = await generateCommitGroups(changedFiles, diffs, model, config.commitConvention);
    spinner.success(`AI generated ${groups.length} commit group(s).`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    spinner.fail(`AI grouping failed: ${reason}`);
    process.exit(1);
  }

  if (groups.length === 0) {
    error('AI could not produce commit groups. Try committing files manually.');
    process.exit(1);
  }

  // Validate AI-returned filenames against actual changed files
  const changedSet = new Set(changedFiles);
  for (const group of groups) {
    const invalid = group.files.filter((f) => !changedSet.has(f));
    if (invalid.length > 0) {
      warn(`AI suggested unknown file(s): ${invalid.join(', ')} — removed from group.`);
    }
    group.files = group.files.filter((f) => changedSet.has(f));
  }
  // Remove empty groups after filtering
  let validGroups = groups.filter((g) => g.files.length > 0);
  if (validGroups.length === 0) {
    error('No valid groups remain after validation. Try committing files manually.');
    process.exit(1);
  }

  // ── Summary + regenerate-all loop ──────────────────────────────────
  let proceedToCommit = false;
  let commitAll = false;
  while (!proceedToCommit) {
    // Present groups to user
    console.log(`\n${pc.bold(`AI suggested ${validGroups.length} commit group(s):`)}\n`);
    for (let i = 0; i < validGroups.length; i++) {
      const g = validGroups[i];
      console.log(`  ${pc.cyan(`Group ${i + 1}:`)} ${pc.bold(g.message)}`);
      for (const f of g.files) {
        console.log(`    ${pc.dim('•')} ${f}`);
      }
      console.log();
    }

    const summaryAction = await selectPrompt('What would you like to do?', [
      'Commit all',
      'Review each group',
      'Regenerate all messages',
      'Cancel',
    ]);

    if (summaryAction === 'Cancel') {
      warn('Group commit cancelled.');
      process.exit(0);
    }

    if (summaryAction === 'Regenerate all messages') {
      const regenSpinner = createSpinner('Regenerating all commit messages...');
      try {
        validGroups = await regenerateAllGroupMessages(
          validGroups,
          diffs,
          model,
          config.commitConvention,
        );
        regenSpinner.success('All commit messages regenerated.');
      } catch {
        regenSpinner.fail('Failed to regenerate messages. Keeping current ones.');
      }
      continue;
    }

    proceedToCommit = true;
    commitAll = summaryAction === 'Commit all';
  }

  // ── Process each group ─────────────────────────────────────────────
  let committed = 0;

  if (commitAll) {
    // Batch commit: stage + commit each group without prompting
    for (let i = 0; i < validGroups.length; i++) {
      const group = validGroups[i];
      const stageResult = await stageFiles(group.files);
      if (stageResult.exitCode !== 0) {
        error(`Failed to stage group ${i + 1}: ${stageResult.stderr}`);
        continue;
      }
      const commitResult = await commitWithMessage(group.message);
      if (commitResult.exitCode !== 0) {
        const detail = (commitResult.stderr || commitResult.stdout).trim();
        error(`Failed to commit group ${i + 1}: ${detail}`);
        await unstageFiles(group.files);
        continue;
      }
      committed++;
      success(`✅ Committed group ${i + 1}: ${pc.bold(group.message)}`);
    }
  } else {
    // Interactive: review each group individually
    for (let i = 0; i < validGroups.length; i++) {
      const group = validGroups[i];
      console.log(pc.bold(`\n── Group ${i + 1}/${validGroups.length} ──`));
      console.log(`  ${pc.cyan(group.message)}`);
      for (const f of group.files) {
        console.log(`  ${pc.dim('•')} ${f}`);
      }

      let message = group.message;
      let actionDone = false;

      while (!actionDone) {
        const action = await selectPrompt('Action for this group:', [
          'Commit as-is',
          'Edit message and commit',
          'Regenerate message',
          'Skip this group',
        ]);

        if (action === 'Skip this group') {
          warn(`Skipped group ${i + 1}.`);
          actionDone = true;
          continue;
        }

        if (action === 'Regenerate message') {
          const regenSpinner = createSpinner('Regenerating commit message for this group...');
          // Use pre-fetched diffs filtered to this group's files instead of re-fetching
          const newMsg = await regenerateGroupMessage(
            group.files,
            diffs,
            model,
            config.commitConvention,
          );
          if (newMsg) {
            message = newMsg;
            group.message = newMsg;
            regenSpinner.success(`New message: ${pc.bold(message)}`);
          } else {
            regenSpinner.fail('AI could not generate a new message. Keeping current one.');
          }
          // Loop back to show action menu again with the new message
          continue;
        }

        if (action === 'Edit message and commit') {
          message = await inputPrompt('Edit commit message', message);
          if (!message) {
            warn(`Skipped group ${i + 1} (empty message).`);
            actionDone = true;
            continue;
          }
        }

        // Validate convention
        if (!validateCommitMessage(message, config.commitConvention)) {
          for (const line of getValidationError(config.commitConvention)) {
            warn(line);
          }
          const proceed = await confirmPrompt('Commit anyway?');
          if (!proceed) {
            warn(`Skipped group ${i + 1}.`);
            actionDone = true;
            continue;
          }
        }

        // Stage only this group's files, then commit
        const stageResult = await stageFiles(group.files);
        if (stageResult.exitCode !== 0) {
          error(`Failed to stage group ${i + 1}: ${stageResult.stderr}`);
          actionDone = true;
          continue;
        }

        const commitResult = await commitWithMessage(message);
        if (commitResult.exitCode !== 0) {
          const detail = (commitResult.stderr || commitResult.stdout).trim();
          error(`Failed to commit group ${i + 1}: ${detail}`);
          await unstageFiles(group.files);
          actionDone = true;
          continue;
        }

        committed++;
        success(`✅ Committed group ${i + 1}: ${pc.bold(message)}`);
        actionDone = true;
      }
    }
  }

  if (committed === 0) {
    warn('No groups were committed.');
  } else {
    success(`\n🎉 ${committed} of ${validGroups.length} group(s) committed successfully.`);
  }

  process.exit(0);
}
