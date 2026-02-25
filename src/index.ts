#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import clean from './commands/clean.js';
import commit from './commands/commit.js';
import setup from './commands/setup.js';
import start from './commands/start.js';
import status from './commands/status.js';
import submit from './commands/submit.js';
import sync from './commands/sync.js';
import update from './commands/update.js';
import { getVersion, showBanner } from './ui/banner.js';

const isHelp = process.argv.includes('--help') || process.argv.includes('-h');
showBanner(isHelp);

const main = defineCommand({
  meta: {
    name: 'contrib',
    version: getVersion(),
    description:
      'Git workflow CLI for squash-merge two-branch models. Keeps dev in sync with main after squash merges.',
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
  },
  run({ args }) {
    if (args.version) {
      console.log(`contrib v${getVersion()}`);
    }
  },
});

runMain(main);
