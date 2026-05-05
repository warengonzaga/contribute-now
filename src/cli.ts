import { defineCommand, runMain } from 'citty';
import pc from 'picocolors';
import branch from './commands/branch.js';
import clean from './commands/clean.js';
import commit from './commands/commit.js';
import config from './commands/config.js';
import discard from './commands/discard.js';
import doctor from './commands/doctor.js';
import hook from './commands/hook.js';
import label from './commands/label.js';
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

function formatVersionInfo(): string {
  return `Contribute Now v${getVersion()} - Built by Waren Gonzaga`;
}

function cmd(name: string, desc: string): string {
  return `  ${pc.cyan(name.padEnd(12))}${pc.white(desc)}`;
}

function showCompactRootHelp(): void {
  console.log(`${pc.bold('USAGE')}  ${pc.cyan('cn <command> [options]')}`);
  console.log();
  console.log(pc.bold('WORKFLOW'));
  console.log(cmd('setup', 'Initialize your local environment and GitHub access'));
  console.log(cmd('start', 'Create a new branch for your contribution'));
  console.log(cmd('commit', 'Stage and commit changes with guided prompts'));
  console.log(cmd('update', 'Sync your branch and update the PR description'));
  console.log(cmd('submit', 'Push and open a pull request on GitHub'));
  console.log();
  console.log(pc.bold('BRANCH & COMMITS'));
  console.log(cmd('branch', 'List, create, or delete branches'));
  console.log(cmd('switch', 'Switch to a different branch'));
  console.log(cmd('save', 'Stash uncommitted changes for later'));
  console.log(cmd('discard', 'Discard uncommitted changes'));
  console.log();
  console.log(pc.bold('GITHUB'));
  console.log(cmd('sync', 'Sync the default branch and rebase your work'));
  console.log(cmd('label', 'Suggest and apply labels on issues and PRs'));
  console.log(cmd('config', 'View or update your Contribute Now config'));
  console.log();
  console.log(pc.bold('UTILITIES'));
  console.log(cmd('status', 'Show current branch and working tree status'));
  console.log(cmd('log', 'Display a compact commit log'));
  console.log(cmd('clean', 'Remove stale branches and tidy up'));
  console.log(cmd('validate', 'Check branch name and commit message format'));
  console.log(cmd('hook', 'Install or uninstall Git hooks'));
  console.log(cmd('doctor', 'Diagnose and fix common setup issues'));
  console.log();
  console.log(`${pc.bold('FLAGS')}  ${pc.cyan('-v, --version')}  ${pc.dim('Show version')}`);
  console.log();
  console.log(pc.dim('Run cn <command> --help for detailed options and examples.'));
}

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
  'label',
];
const isHelp = process.argv.includes('--help') || process.argv.includes('-h');
const hasSubCommand = subCommands.some((cmd) => process.argv.includes(cmd));
const isRootHelp = isHelp && !hasSubCommand;

if (!isVersion) {
  const useBigBanner = !hasSubCommand && !isHelp;
  showBanner(useBigBanner ? 'big' : 'small');
}

if (isRootHelp) {
  showCompactRootHelp();
  process.exit(0);
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
    label,
  },
  run({ args }) {
    if (args.version) {
      console.log(formatVersionInfo());
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
