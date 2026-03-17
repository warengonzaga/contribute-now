export interface QuickGuideExample {
  command: string;
  description: string;
}

export interface CommandGuide {
  summary: string;
  examples: QuickGuideExample[];
}

const COMMAND_GUIDES: Record<string, CommandGuide> = {
  setup: {
    summary: 'Initialize workflow rules, remotes, AI settings, and personal repo defaults.',
    examples: [
      { command: 'cn setup --help', description: 'learn all setup options and prompts' },
      { command: 'cn setup', description: 'initialize workflow, conventions, and remotes' },
      {
        command: 'cn setup',
        description: 're-run setup to update repo preferences for this clone',
      },
      {
        command: 'cn setup',
        description: 'migrate legacy repo-root config into local Git storage',
      },
    ],
  },
  start: {
    summary: 'Create a new working branch from the correct base branch for your workflow.',
    examples: [
      { command: 'cn start --help', description: 'learn branch naming and creation flags' },
      {
        command: 'cn start feature/user-auth',
        description: 'create a branch from an explicit name',
      },
      {
        command: 'cn start "fix login timeout"',
        description: 'describe the work and let the CLI help',
      },
      {
        command: 'cn start "fix login timeout" --no-ai',
        description: 'skip AI and keep control manual',
      },
    ],
  },
  sync: {
    summary: 'Sync your protected branches with the right upstream source for your role.',
    examples: [
      { command: 'cn sync --help', description: 'learn sync modes and confirmation flags' },
      { command: 'cn sync', description: 'pull the right base branch for your workflow' },
      { command: 'cn sync --yes', description: 'skip the confirmation prompt' },
      { command: 'cn sync', description: 'refresh local protected branches before feature work' },
    ],
  },
  commit: {
    summary: 'Stage changes, validate the message format, and create one or more commits.',
    examples: [
      { command: 'cn commit --help', description: 'learn commit generation and grouping flags' },
      { command: 'cn commit', description: 'stage and create one commit' },
      { command: 'cn commit --no-ai', description: 'write the commit message yourself' },
      { command: 'cn commit --group', description: 'split a large changeset into atomic commits' },
    ],
  },
  update: {
    summary: 'Rebase your current feature branch onto the latest configured base branch.',
    examples: [
      { command: 'cn update --help', description: 'learn rebase and conflict guidance options' },
      { command: 'cn update', description: 'rebase your branch onto the latest base branch' },
      { command: 'cn update --no-ai', description: 'skip AI conflict guidance' },
      { command: 'cn update', description: 'refresh your branch before pushing or opening a PR' },
    ],
  },
  submit: {
    summary: 'Push your branch and submit it through a pull request or local merge flow.',
    examples: [
      { command: 'cn submit --help', description: 'learn PR and local submit modes' },
      { command: 'cn submit', description: 'push and create or update a PR' },
      { command: 'cn submit --pullrequest', description: 'go straight to the PR flow' },
      { command: 'cn submit -l', description: 'maintainers can squash-merge locally' },
    ],
  },
  switch: {
    summary: 'Switch branches safely and protect uncommitted work before moving around.',
    examples: [
      { command: 'cn switch --help', description: 'learn interactive and direct switch usage' },
      { command: 'cn switch', description: 'pick a branch interactively' },
      { command: 'cn switch feature/login-fix', description: 'switch directly to a named branch' },
      { command: 'cn switch dev', description: 'jump back to a protected branch directly' },
    ],
  },
  save: {
    summary: 'Store uncommitted work for later and restore or delete saved change sets.',
    examples: [
      { command: 'cn save --help', description: 'learn save, restore, list, and drop actions' },
      { command: 'cn save', description: 'stash current uncommitted work' },
      { command: 'cn save --restore', description: 'bring back a saved change set' },
      { command: 'cn save --list', description: 'review what you saved before restoring' },
      { command: 'cn save --drop', description: 'discard a saved change set you no longer need' },
    ],
  },
  clean: {
    summary: 'Delete merged or stale branches and keep the local repo tidy.',
    examples: [
      { command: 'cn clean --help', description: 'learn cleanup behavior and shortcuts' },
      { command: 'cn clean', description: 'review merged and stale branches before deleting' },
      { command: 'cn clean --yes', description: 'skip the confirmation prompt' },
      { command: 'cn clean', description: 'remove stale local branches after merge cleanup' },
    ],
  },
  status: {
    summary: 'Inspect branch alignment, working tree state, and next recommended actions.',
    examples: [
      { command: 'cn status --help', description: 'learn what the status dashboard shows' },
      { command: 'cn status', description: 'see branch alignment and working tree state' },
      { command: 'cn status', description: 'check whether protected branches are aligned' },
      { command: 'cn status', description: 'review staged, modified, and untracked files' },
    ],
  },
  log: {
    summary: 'View commit history for your current branch, remote diffs, or the full repo graph.',
    examples: [
      { command: 'cn log --help', description: 'learn all log views and filtering flags' },
      { command: 'cn log', description: 'show local and remote history in one split view' },
      { command: 'cn log --local', description: 'show only local unpushed commits' },
      { command: 'cn log --remote', description: 'show only remote branch history' },
      { command: 'cn log --full', description: 'show full history for the current branch' },
      { command: 'cn log --all', description: 'show history across all branches' },
      { command: 'cn log -b dev', description: 'inspect a specific branch' },
    ],
  },
  branch: {
    summary: 'List branches with workflow-aware labels and local or remote tracking details.',
    examples: [
      { command: 'cn branch --help', description: 'learn branch list modes and filters' },
      { command: 'cn branch', description: 'list local branches and tracking info' },
      { command: 'cn branch --all', description: 'include local and remote branches' },
      { command: 'cn branch --remote', description: 'show only remote branches' },
    ],
  },
  hook: {
    summary: 'Install or remove a managed commit-msg hook for commit convention validation.',
    examples: [
      { command: 'cn hook --help', description: 'learn hook install and uninstall usage' },
      { command: 'cn hook install', description: 'validate commit messages automatically' },
      { command: 'cn hook uninstall', description: 'remove the managed git hook' },
      {
        command: 'cn hook install',
        description: 'keep commit convention checks active in this clone',
      },
    ],
  },
  validate: {
    summary: 'Check a commit message against the repository commit convention rules.',
    examples: [
      {
        command: 'cn validate --help',
        description: 'learn direct and file-based validation usage',
      },
      {
        command: 'cn validate "🔧 update: tidy config"',
        description: 'validate one message inline',
      },
      {
        command: 'cn validate --file .git/COMMIT_EDITMSG',
        description: 'validate a commit message file',
      },
      {
        command: 'cn validate "📦 new: add API client"',
        description: 'check another message before committing',
      },
    ],
  },
  doctor: {
    summary: 'Run environment, dependency, config, and workflow diagnostics for the CLI.',
    examples: [
      { command: 'cn doctor --help', description: 'learn human and JSON output modes' },
      { command: 'cn doctor', description: 'run a full environment and config check' },
      { command: 'cn doctor --json', description: 'export machine-readable diagnostics' },
      {
        command: 'cn doctor',
        description: 'check config, remotes, and workflow resolution together',
      },
    ],
  },
};

export const LOADING_TIPS = [
  'Manual commit mode: cn commit --no-ai',
  'Disable AI for this clone: set "aiEnabled": false',
  'Describe work for naming help: cn start "fix login timeout"',
  'Remote-only history: cn log --remote',
  'Skip PR mode prompt: cn submit --pullrequest',
];

export function getCommandGuide(command: string): CommandGuide | null {
  const key = normalizeCommandKey(command);
  return COMMAND_GUIDES[key] ?? null;
}

export function getVisibleCommandGuide(
  command: string,
  rotationIndex = 0,
): {
  guide: CommandGuide;
  examples: QuickGuideExample[];
  rotatableCount: number;
  key: string;
} | null {
  const key = normalizeCommandKey(command);
  const guide = COMMAND_GUIDES[key];
  if (!guide) return null;

  const helpExample = guide.examples.find((example) => example.command.endsWith('--help')) ?? null;
  const rotatingExamples = dedupeGuideExamples(
    helpExample ? guide.examples.filter((example) => example !== helpExample) : [...guide.examples],
  );

  const visibleExamples: QuickGuideExample[] = [];
  if (helpExample) {
    visibleExamples.push(helpExample);
  }

  const remainingSlots = Math.max(0, 3 - visibleExamples.length);
  if (rotatingExamples.length <= remainingSlots) {
    visibleExamples.push(...rotatingExamples);
  } else {
    for (let index = 0; index < remainingSlots; index++) {
      visibleExamples.push(rotatingExamples[(rotationIndex + index) % rotatingExamples.length]);
    }
  }

  return {
    guide,
    examples: visibleExamples.slice(0, 3),
    rotatableCount: rotatingExamples.length,
    key,
  };
}

function normalizeCommandKey(command: string): string {
  const normalized = command.replace(/\s*\(.+\)$/, '').trim();
  return normalized.split(/\s+/)[0] ?? normalized;
}

function dedupeGuideExamples(examples: QuickGuideExample[]): QuickGuideExample[] {
  const seen = new Set<string>();
  const deduped: QuickGuideExample[] = [];

  for (const example of examples) {
    if (seen.has(example.command)) {
      continue;
    }

    seen.add(example.command);
    deduped.push(example);
  }

  return deduped;
}
