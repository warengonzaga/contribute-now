import { defineCommand, runMain } from 'citty';
import branch from './commands/branch.js';
import clean from './commands/clean.js';
import discard from './commands/discard.js';
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
    'discard',
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
    name: 'cn',
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
    discard,
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
      console.log(`cn v${getVersion()}`);
    }
  },
});

// Force a clean exit once the command finishes.
//
// Several dependencies keep Node's event loop alive after a command completes:
//   - `@clack/prompts` leaves stdin in raw mode with listeners attached after prompts resolve
//   - `@github/copilot-sdk` retains keep-alive HTTP sockets (and likely internal timers)
//
// Without an explicit exit, successful commands (`commit`, `switch`, `submit`, etc.) leave the
// terminal hanging until the user hits Ctrl+C. Exiting here — after `runMain` has flushed
// citty's own output — keeps the fix in one place instead of sprinkling `process.exit(0)`
// across every command's success path.
runMain(main)
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
