#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import clean from './commands/clean.js';
import commit from './commands/commit.js';
import doctor from './commands/doctor.js';
import hook from './commands/hook.js';
import log from './commands/log.js';
import setup from './commands/setup.js';
import start from './commands/start.js';
import status from './commands/status.js';
import submit from './commands/submit.js';
import sync from './commands/sync.js';
import update from './commands/update.js';
import validate from './commands/validate.js';
import { getVersion, showBanner } from './ui/banner.js';

const isVersion = process.argv.includes('--version') || process.argv.includes('-v');

if (!isVersion) {
  const subCommands = ['setup', 'sync', 'start', 'commit', 'update', 'submit', 'clean', 'status', 'log', 'hook', 'validate', 'doctor'];
  const isHelp = process.argv.includes('--help') || process.argv.includes('-h');
  const hasSubCommand = subCommands.some((cmd) => process.argv.includes(cmd));
  const useBigBanner = isHelp || !hasSubCommand;
  showBanner(useBigBanner ? 'big' : 'small');
}

const main = defineCommand({
  meta: {
    name: 'contrib',
    version: getVersion(),
    description:
      'Git workflow CLI that guides contributors through clean branching, commits, and PRs.',
  },
  args: {
    version: {
      type: 'boolean',
      alias: 'v',
      description: 'Show version number',
    },
  },
  subCommands: {
    setup,
    sync,
    start,
    commit,
    update,
    submit,
    clean,
    status,
    log,
    hook,
    validate,
    doctor,
  },
  run({ args }) {
    if (args.version) {
      console.log(`contrib v${getVersion()}`);
    }
  },
});

runMain(main).then(() => {
  // Ensure the process exits cleanly after any command completes.
  // Citty does not call process.exit() and interactive prompts
  // may leave stdin open, preventing the event loop from draining.
  process.exit(0);
});
