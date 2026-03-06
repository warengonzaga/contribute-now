import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import {
  branchExists,
  getCurrentBranch,
  getLocalCommitsEntries,
  getLocalCommitsGraph,
  getLogEntries,
  getLogGraph,
  getRemoteOnlyCommitsEntries,
  getRemoteOnlyCommitsGraph,
  getUpstreamRef,
  isGitRepo,
} from '../utils/git.js';
import { error, heading } from '../utils/logger.js';
import { getBaseBranch, getProtectedBranches } from '../utils/workflow.js';

/** Which slice of the log to display. */
type LogMode = 'local' | 'remote' | 'full' | 'all';

export default defineCommand({
  meta: {
    name: 'log',
    description: 'Show a colorized, workflow-aware commit log with graph',
  },
  args: {
    count: {
      type: 'string',
      alias: 'n',
      description: 'Number of commits to show (default: 20)',
    },
    all: {
      type: 'boolean',
      alias: 'a',
      description: 'Show commits from all branches',
      default: false,
    },
    remote: {
      type: 'boolean',
      alias: 'r',
      description: 'Show only remote commits not yet pulled locally',
      default: false,
    },
    full: {
      type: 'boolean',
      alias: 'f',
      description: 'Show full commit history for the current branch',
      default: false,
    },
    graph: {
      type: 'boolean',
      alias: 'g',
      description: 'Show graph view with branch lines',
      default: true,
    },
    branch: {
      type: 'string',
      alias: 'b',
      description: 'Show log for a specific branch',
    },
  },
  async run({ args }) {
    if (!(await isGitRepo())) {
      error('Not inside a git repository.');
      process.exit(1);
    }

    const config = readConfig();
    const count = args.count ? Number.parseInt(args.count, 10) : 20;
    const showGraph = args.graph;
    const targetBranch = args.branch;

    // Determine the log mode
    let mode: LogMode = 'local';
    if (args.all) mode = 'all';
    else if (args.remote) mode = 'remote';
    else if (args.full || targetBranch) mode = 'full';

    // Derive protected branches for highlighting
    const protectedBranches = config ? getProtectedBranches(config) : ['main', 'master'];
    const currentBranch = await getCurrentBranch();
    const upstream = await getUpstreamRef();

    // Resolve the comparison ref: upstream tracking branch first,
    // then fall back to the remote base branch from config (e.g. origin/dev).
    let compareRef = upstream;
    let usingFallback = false;
    if (!compareRef) {
      const fallback = await resolveBaseBranchRef(config);
      if (fallback) {
        compareRef = fallback;
        usingFallback = true;
      }
    }

    heading('📜 commit log');

    // Show mode context
    printModeHeader(mode, currentBranch, compareRef, usingFallback);

    if (mode === 'local' || mode === 'remote') {
      if (!compareRef) {
        console.log();
        console.log(
          pc.yellow('  ⚠ Could not determine a comparison branch.'),
        );
        console.log(
          pc.dim('    No upstream tracking set and no remote base branch found.'),
        );
        console.log(
          pc.dim(`    Use ${pc.bold('contrib log --full')} to see the full commit history instead.`),
        );
        console.log();
        printGuidance();
        return;
      }

      await renderScopedLog({ mode, count, upstream: compareRef, showGraph, protectedBranches, currentBranch });
    } else {
      // 'full' or 'all' — use existing full log behavior
      await renderFullLog({ count, all: mode === 'all', showGraph, targetBranch, protectedBranches, currentBranch });
    }

    // Footer
    printFooter(mode, count, targetBranch);
    printGuidance();
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Resolve a remote base branch ref from config to use when the current
 * branch has no upstream tracking set (not pushed yet).
 * Returns e.g. "origin/dev" or "origin/main".
 */
async function resolveBaseBranchRef(
  config: ReturnType<typeof readConfig>,
): Promise<string | null> {
  if (!config) {
    // No config — try common defaults
    for (const candidate of ['origin/main', 'origin/master']) {
      if (await branchExists(candidate)) return candidate;
    }
    return null;
  }

  const baseBranch = getBaseBranch(config);
  const remote = config.origin ?? 'origin';
  const candidate = `${remote}/${baseBranch}`;
  if (await branchExists(candidate)) return candidate;

  // Last resort: try origin/main, origin/master
  for (const fallback of ['origin/main', 'origin/master']) {
    if (fallback !== candidate && (await branchExists(fallback))) return fallback;
  }
  return null;
}

// ── Rendering helpers ─────────────────────────────────────────────────

function printModeHeader(
  mode: LogMode,
  currentBranch: string | null,
  compareRef: string | null,
  usingFallback = false,
): void {
  const branch = currentBranch ?? 'HEAD';
  const fallbackNote = usingFallback ? pc.yellow(' (no upstream — comparing against base branch)') : '';
  console.log();
  switch (mode) {
    case 'local':
      console.log(
        pc.dim(`  mode: ${pc.bold('local')} — unpushed commits on ${pc.bold(branch)}`) + fallbackNote,
      );
      if (compareRef) {
        console.log(pc.dim(`  comparing: ${pc.bold(compareRef)} ➜ ${pc.bold('HEAD')}`));
      }
      break;
    case 'remote':
      console.log(
        pc.dim(`  mode: ${pc.bold('remote')} — commits on remote not yet pulled into ${pc.bold(branch)}`) + fallbackNote,
      );
      if (compareRef) {
        console.log(pc.dim(`  comparing: ${pc.bold('HEAD')} ➜ ${pc.bold(compareRef)}`));
      }
      break;
    case 'full':
      console.log(
        pc.dim(`  mode: ${pc.bold('full')} — complete commit history for ${pc.bold(branch)}`),
      );
      break;
    case 'all':
      console.log(
        pc.dim(`  mode: ${pc.bold('all')} — commits across all branches`),
      );
      break;
  }
}

async function renderScopedLog(options: {
  mode: 'local' | 'remote';
  count: number;
  upstream: string;
  showGraph: boolean;
  protectedBranches: string[];
  currentBranch: string | null;
}): Promise<void> {
  const { mode, count, upstream, showGraph, protectedBranches, currentBranch } = options;

  if (showGraph) {
    const graphFn = mode === 'local' ? getLocalCommitsGraph : getRemoteOnlyCommitsGraph;
    const lines = await graphFn({ count, upstream });
    if (lines.length === 0) {
      printEmptyState(mode);
      return;
    }
    console.log();
    for (const line of lines) {
      console.log(`  ${colorizeGraphLine(line, protectedBranches, currentBranch)}`);
    }
  } else {
    const entryFn = mode === 'local' ? getLocalCommitsEntries : getRemoteOnlyCommitsEntries;
    const entries = await entryFn({ count, upstream });
    if (entries.length === 0) {
      printEmptyState(mode);
      return;
    }
    console.log();
    for (const entry of entries) {
      const hashStr = pc.yellow(entry.hash);
      const refsStr = entry.refs
        ? ` ${colorizeRefs(entry.refs, protectedBranches, currentBranch)}`
        : '';
      const subjectStr = colorizeSubject(entry.subject);
      console.log(`  ${hashStr}${refsStr} ${subjectStr}`);
    }
  }
}

function printEmptyState(mode: 'local' | 'remote'): void {
  console.log();
  if (mode === 'local') {
    console.log(pc.dim('  No local unpushed commits — you\'re up to date with remote!'));
  } else {
    console.log(pc.dim('  No remote-only commits — your local branch is up to date!'));
  }
  console.log();
}

async function renderFullLog(options: {
  count: number;
  all: boolean;
  showGraph: boolean;
  targetBranch?: string;
  protectedBranches: string[];
  currentBranch: string | null;
}): Promise<void> {
  const { count, all, showGraph, targetBranch, protectedBranches, currentBranch } = options;

  if (showGraph) {
    const lines = await getLogGraph({ count, all, branch: targetBranch });
    if (lines.length === 0) {
      console.log(pc.dim('  No commits found.'));
      console.log();
      return;
    }
    console.log();
    for (const line of lines) {
      console.log(`  ${colorizeGraphLine(line, protectedBranches, currentBranch)}`);
    }
  } else {
    const entries = await getLogEntries({ count, all, branch: targetBranch });
    if (entries.length === 0) {
      console.log(pc.dim('  No commits found.'));
      console.log();
      return;
    }
    console.log();
    for (const entry of entries) {
      const hashStr = pc.yellow(entry.hash);
      const refsStr = entry.refs
        ? ` ${colorizeRefs(entry.refs, protectedBranches, currentBranch)}`
        : '';
      const subjectStr = colorizeSubject(entry.subject);
      console.log(`  ${hashStr}${refsStr} ${subjectStr}`);
    }
  }
}

function printFooter(mode: LogMode, count: number, targetBranch?: string): void {
  console.log();
  switch (mode) {
    case 'local':
      console.log(pc.dim(`  Showing up to ${count} unpushed commits`));
      break;
    case 'remote':
      console.log(pc.dim(`  Showing up to ${count} remote-only commits`));
      break;
    case 'full':
      console.log(
        pc.dim(
          `  Showing ${count} most recent commits${targetBranch ? ` (${targetBranch})` : ''}`,
        ),
      );
      break;
    case 'all':
      console.log(pc.dim(`  Showing ${count} most recent commits (all branches)`));
      break;
  }
}

function printGuidance(): void {
  console.log();
  console.log(pc.dim('  ─── quick guide ───'));
  console.log(pc.dim(`  ${pc.bold('contrib log')}            local unpushed commits (default)`));
  console.log(pc.dim(`  ${pc.bold('contrib log --remote')}   commits on remote not yet pulled`));
  console.log(pc.dim(`  ${pc.bold('contrib log --full')}     full history for the current branch`));
  console.log(pc.dim(`  ${pc.bold('contrib log --all')}      commits across all branches`));
  console.log(pc.dim(`  ${pc.bold('contrib log -n 50')}      change the commit limit (default: 20)`));
  console.log(pc.dim(`  ${pc.bold('contrib log -b dev')}     view log for a specific branch`));
  console.log(pc.dim(`  ${pc.bold('contrib log --no-graph')} flat list without graph lines`));
  console.log();
}

/**
 * Colorize a single graph line from `git log --graph --oneline --decorate`.
 * Regex breakdown: graph chars (|/\*_ ) | refs (abc1234) | (HEAD -> branch, ...) | subject
 */
function colorizeGraphLine(
  line: string,
  protectedBranches: string[],
  currentBranch: string | null,
): string {
  // Match: graph prefix, hash, optional decoration, and subject
  const match = line.match(/^([|/\\*\s_.-]*)([a-f0-9]{7,12})(\s+\(([^)]+)\))?\s*(.*)/);
  if (!match) {
    // Pure graph line (no commit), just colorize the graph chars
    return pc.cyan(line);
  }

  const [, graphPart = '', hash, , refs, subject = ''] = match;
  const parts: string[] = [];

  // Graph lines in cyan
  if (graphPart) {
    parts.push(colorizeGraphChars(graphPart));
  }

  // Hash in yellow
  parts.push(pc.yellow(hash));

  // Refs (decorations) with workflow awareness
  if (refs) {
    parts.push(` (${colorizeRefs(refs, protectedBranches, currentBranch)})`);
  }

  // Subject with emoji-aware coloring
  parts.push(` ${colorizeSubject(subject)}`);

  return parts.join('');
}

/**
 * Colorize graph characters (|, /, \, *, etc.)
 */
function colorizeGraphChars(graphPart: string): string {
  return graphPart
    .split('')
    .map((ch) => {
      switch (ch) {
        case '*':
          return pc.green(ch);
        case '|':
          return pc.cyan(ch);
        case '/':
        case '\\':
          return pc.cyan(ch);
        case '-':
        case '_':
          return pc.cyan(ch);
        default:
          return ch;
      }
    })
    .join('');
}

/**
 * Colorize ref decorations (HEAD -> branch, origin/main, tag: v1.0, etc.)
 */
function colorizeRefs(
  refs: string,
  protectedBranches: string[],
  currentBranch: string | null,
): string {
  return refs
    .split(',')
    .map((ref) => {
      const trimmed = ref.trim();

      // HEAD pointer
      if (trimmed.startsWith('HEAD ->') || trimmed === 'HEAD') {
        const branchName = trimmed.replace('HEAD -> ', '');
        if (trimmed === 'HEAD') {
          return pc.bold(pc.cyan('HEAD'));
        }
        return `${pc.bold(pc.cyan('HEAD'))} ${pc.dim('->')} ${colorizeRefName(branchName, protectedBranches, currentBranch)}`;
      }

      // Tags
      if (trimmed.startsWith('tag:')) {
        return pc.bold(pc.magenta(trimmed));
      }

      // Branch refs
      return colorizeRefName(trimmed, protectedBranches, currentBranch);
    })
    .join(pc.dim(', '));
}

/**
 * Colorize a single branch ref name with workflow awareness.
 * - Protected branches (main/dev) in red+bold
 * - Current branch in green+bold
 * - Remote refs in blue
 * - Everything else in normal color
 */
function colorizeRefName(
  name: string,
  protectedBranches: string[],
  currentBranch: string | null,
): string {
  const isRemote = name.includes('/');
  const localName = isRemote ? name.split('/').slice(1).join('/') : name;

  // Protected branches get special treatment
  if (protectedBranches.includes(localName)) {
    return isRemote ? pc.bold(pc.red(name)) : pc.bold(pc.red(name));
  }

  // Current branch
  if (localName === currentBranch) {
    return pc.bold(pc.green(name));
  }

  // Remote tracking branches
  if (isRemote) {
    return pc.blue(name);
  }

  // Regular local branch
  return pc.green(name);
}

/**
 * Colorize commit subject with awareness of Clean Commit emojis.
 * Preserves the emoji and dims metadata-style subjects.
 */
function colorizeSubject(subject: string): string {
  // If it starts with an emoji (common in Clean Commit), keep it bright
  const emojiMatch = subject.match(/^((?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)+\s*)/u);
  if (emojiMatch) {
    const emoji = emojiMatch[1];
    const rest = subject.slice(emoji.length);
    return `${emoji}${pc.white(rest)}`;
  }

  // Merge commits get dimmed
  if (subject.startsWith('Merge ')) {
    return pc.dim(subject);
  }

  return pc.white(subject);
}
