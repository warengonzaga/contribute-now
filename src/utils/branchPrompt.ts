import pc from 'picocolors';
import {
  formatBranchName,
  hasPrefix,
  isValidBranchName,
  looksLikeNaturalLanguage,
} from './branch.js';
import { inputPrompt, selectPrompt } from './confirm.js';
import { checkCopilotAvailable, suggestBranchName } from './copilot.js';
import { branchExists } from './git.js';
import { warn } from './logger.js';
import { createSpinner } from './spinner.js';
import { LOADING_TIPS } from './tips.js';

interface PromptForBranchNameOptions {
  branchPrefixes: string[];
  initialValue?: string;
  promptMessage?: string;
  useAI?: boolean;
  model?: string;
}

export async function promptForBranchName(
  options: PromptForBranchNameOptions,
): Promise<string | null> {
  const promptMessage = options.promptMessage ?? 'What are you going to work on?';
  let branchInput = options.initialValue?.trim() ?? '';

  while (!branchInput) {
    branchInput = (await inputPrompt(promptMessage)).trim();
    if (branchInput) break;

    warn('A branch name or description is required.');
    const action = await selectPrompt('What would you like to do?', ['Try again', 'Cancel']);
    if (action === 'Cancel') return null;
  }

  let branchName = branchInput;
  const useAI = options.useAI !== false && looksLikeNaturalLanguage(branchInput);

  if (useAI) {
    const copilotError = await checkCopilotAvailable();
    if (copilotError) {
      warn(`AI unavailable: ${copilotError}`);
    } else {
      while (true) {
        const spinner = createSpinner('Generating branch name suggestion...', {
          tips: LOADING_TIPS,
        });
        const suggested = await suggestBranchName(branchInput, options.model);

        if (suggested) {
          spinner.success('Branch name suggestion ready.');
          console.log(`\n  ${pc.dim('AI suggestion:')} ${pc.bold(pc.cyan(suggested))}`);

          const action = await selectPrompt('What would you like to do with this branch name?', [
            'Use this suggestion',
            'Try again with AI',
            'Enter branch name manually',
            'Use my original description',
            'Cancel',
          ]);

          if (action === 'Use this suggestion') {
            branchName = suggested;
            break;
          }

          if (action === 'Try again with AI') {
            continue;
          }

          if (action === 'Enter branch name manually') {
            branchName = (await inputPrompt('Enter branch name', branchInput)).trim();
            break;
          }

          if (action === 'Use my original description') {
            branchName = branchInput;
            break;
          }

          return null;
        }

        spinner.fail('AI did not return a branch name suggestion.');

        const action = await selectPrompt(
          'AI could not generate a branch name. What would you like to do?',
          [
            'Try again with AI',
            'Enter branch name manually',
            'Use my original description',
            'Cancel',
          ],
        );

        if (action === 'Try again with AI') {
          continue;
        }

        if (action === 'Enter branch name manually') {
          branchName = (await inputPrompt('Enter branch name', branchInput)).trim();
          break;
        }

        if (action === 'Use my original description') {
          branchName = branchInput;
          break;
        }

        return null;
      }
    }
  }

  while (true) {
    if (!branchName) {
      branchName = (await inputPrompt('Enter branch name', branchInput)).trim();
      if (!branchName) {
        const action = await selectPrompt('What would you like to do?', ['Try again', 'Cancel']);
        if (action === 'Cancel') return null;
        continue;
      }
    }

    if (!hasPrefix(branchName, options.branchPrefixes)) {
      const prefix = await selectPrompt(
        `Choose a branch type for ${pc.bold(branchName)}:`,
        options.branchPrefixes,
      );
      branchName = formatBranchName(prefix, branchName);
    }

    if (!isValidBranchName(branchName)) {
      warn(
        'Invalid branch name. Use only alphanumeric characters, dots, hyphens, underscores, and slashes.',
      );
      branchName = (await inputPrompt('Enter branch name', branchName)).trim();
      continue;
    }

    if (await branchExists(branchName)) {
      warn(`Branch ${pc.bold(branchName)} already exists. Choose a different name.`);
      branchName = (await inputPrompt('Enter branch name', branchName)).trim();
      continue;
    }

    return branchName;
  }
}
