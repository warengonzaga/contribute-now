import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import {
  CONVENTION_LABELS,
  getValidationError,
  validateCommitMessage,
} from '../utils/convention.js';
import { error, info, success } from '../utils/logger.js';

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate a commit message against the configured convention',
  },
  args: {
    message: {
      type: 'positional',
      description: 'The commit message to validate',
      required: true,
    },
  },
  async run({ args }) {
    const config = readConfig();
    if (!config) {
      error('No .contributerc.json found. Run `contrib setup` first.');
      process.exit(1);
    }

    const convention = config.commitConvention;
    if (convention === 'none') {
      info('Commit convention is set to "none". All messages are accepted.');
      process.exit(0);
    }

    const message = args.message;
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
