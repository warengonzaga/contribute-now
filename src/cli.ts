import { defineCommand, runMain } from 'citty';
import branch from './commands/branch.js';
import clean from './commands/clean.js';
import commit from './commands/commit.js';
import config from './commands/config.js';
import doctor from './commands/doctor.js';
import hook from './commands/hook.js';
import log from './commands/log.js';
import save from './commands/save.js';
import setup from './commands/setup.js';
import start from './commands/start.js';
import status from './commands/status.js';
import submit from './commands/submit.js';
import switchCmd from './commands/switch.js';
import sync from './commands/sync.js';
import update from './commands/update.js';
import validate from './commands/validate.js';
import { getVersion, showBanner } from './ui/banner.js';

function normalizeCliArgs(argv: string[]): string[] {
  return argv.map((arg, index) => {
    const previous = argv[index - 1];
    const isSubmitCommand = previous === 'submit' || argv.includes('submit');

    if (!isSubmitCommand) {
      return arg;
    }

    if (arg === '-pr' || arg === '--pr') {
      return '--pullrequest';
    }

    return arg;
  });
}

process.argv = normalizeCliArgs(process.argv);

const isVersion = process.argv.includes('--version') || process.argv.includes('-v');

if (!isVersion) {
  const subCommands = [
    'setup',
    'config',
    'sync',
    'start',
    'commit',
    'update',
    'submit',
    'switch',
    'save',
    'clean',
    'status',
    'log',
    'branch',
    'hook',
    'validate',
    'doctor',
  ];
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
    config,
    sync,
    start,
    commit,
    update,
    submit,
    switch: switchCmd,
    save,
    branch,
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
  process.exit(0);
});
