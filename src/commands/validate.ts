import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import {
  CONVENTION_LABELS,
  getValidationError,
  validateCommitMessage,
} from '../utils/convention.js';
import { error, info, projectHeading, success } from '../utils/logger.js';

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate a commit message against the configured convention',
  },
  args: {
    message: {
      type: 'positional',
      description: 'The commit message to validate',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to a commit message file; only the first line is validated',
    },
  },
  async run({ args }) {
    const config = readConfig();
    if (!config) {
      error('No repo config found. Run `contrib setup` first.');
      process.exit(1);
    }

    await projectHeading('validate', '✅');

    const convention = config.commitConvention;
    if (convention === 'none') {
      info('Commit convention is set to "none". All messages are accepted.');
      process.exit(0);
    }

    const message = args.file
      ? (readFileSync(args.file, 'utf-8').split(/\r?\n/, 1)[0] ?? '')
      : args.message;

    if (!message) {
      error('No commit message provided. Pass a message or use --file <path>.');
      process.exit(1);
    }

    if (validateCommitMessage(message, convention)) {
      success(`Valid ${CONVENTION_LABELS[convention]} message.`);
      process.exit(0);
    }

    // Validation failed
    const errors = getValidationError(convention);
    for (const line of errors) {
      console.error(pc.red(`  ✗ ${line}`));
    }
    process.exit(1);
  },
});
