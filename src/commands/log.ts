import { defineCommand } from 'citty';
import pc from 'picocolors';
import { readConfig } from '../utils/config.js';
import { getCurrentBranch, getLogEntries, getLogGraph, isGitRepo } from '../utils/git.js';
import { error, heading } from '../utils/logger.js';
import { getProtectedBranches } from '../utils/workflow.js';

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
      description: 'Show all branches, not just current',
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
    const showAll = args.all;
    const showGraph = args.graph;
    const targetBranch = args.branch;

    // Derive protected branches for highlighting
    const protectedBranches = config ? getProtectedBranches(config) : ['main', 'master'];
    const currentBranch = await getCurrentBranch();

    heading('📜 commit log');

    if (showGraph) {
      // Graph mode: colorized git log --graph --oneline --decorate
      const lines = await getLogGraph({ count, all: showAll, branch: targetBranch });
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
      // Flat mode: structured entries without graph lines
      const entries = await getLogEntries({ count, all: showAll, branch: targetBranch });
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

    // Footer with count info
    console.log();
    console.log(
      pc.dim(
        `  Showing ${count} most recent commits${showAll ? ' (all branches)' : targetBranch ? ` (${targetBranch})` : ''}`,
      ),
    );
    console.log(
      pc.dim(
        `  Use ${pc.bold('contrib log -n 50')} for more, or ${pc.bold('contrib log --all')} for all branches`,
      ),
    );
    console.log();
  },
});

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
