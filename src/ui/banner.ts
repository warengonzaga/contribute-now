import pc from 'picocolors';
import pkg from '../../package.json';
import {
  type Announcement,
  type AnnouncementKind,
  getActiveAnnouncements,
} from '../utils/announcements.js';

// Pre-rendered ASCII banner.
//
// Previously generated at runtime with `figlet`, but bundled builds can't
// reliably locate figlet's font files, which caused the banner to silently
// fall back to plain text after `npm install -g`. Baking the output here
// removes the runtime font-loading fragility and drops the figlet dep.
//
// Source:
//   figlet.textSync('Contribute Now', { font: 'Slant' })
//
// `String.raw` preserves backslashes in the art exactly as-is.
const LOGO = String.raw`   ______            __       _ __          __          _   __             
  / ____/___  ____  / /______(_) /_  __  __/ /____     / | / /___ _      __
 / /   / __ \/ __ \/ __/ ___/ / __ \/ / / / __/ _ \   /  |/ / __ \ | /| / /
/ /___/ /_/ / / / / /_/ /  / / /_/ / /_/ / /_/  __/  / /|  / /_/ / |/ |/ / 
\____/\____/_/ /_/\__/_/  /_/_.___/\__,_/\__/\___/  /_/ |_/\____/|__/|__/  
                                                                           `;

export function getVersion(): string {
  return pkg.version ?? 'unknown';
}

export function getAuthor(): string {
  return typeof pkg.author === 'string' ? pkg.author : 'unknown';
}

export function showBanner(variant: 'big' | 'small' = 'small'): void {
  console.log(pc.cyan(`\n${LOGO}`));
  console.log(
    `  ${pc.dim(`v${getVersion()}`)} ${pc.dim('—')} ${pc.dim(`Built by ${getAuthor()}`)}`,
  );

  const announcements = getActiveAnnouncements();
  if (announcements.length > 0) {
    console.log();
    renderAnnouncements(announcements);
  }

  if (variant === 'big') {
    const panelLines = [
      {
        label: pc.bold(pc.cyan('Getting Started')),
        rawLabel: 'Getting Started',
        value: '',
        rawValue: '',
      },
      {
        label: pc.cyan('cn setup'),
        rawLabel: 'cn setup',
        value: pc.dim('configure workflow, remotes, and defaults'),
        rawValue: 'configure workflow, remotes, and defaults',
      },
      {
        label: pc.cyan('cn doctor'),
        rawLabel: 'cn doctor',
        value: pc.dim('verify your environment before doing any work'),
        rawValue: 'verify your environment before doing any work',
      },
      {
        label: pc.cyan('cn start'),
        rawLabel: 'cn start',
        value: pc.dim('create a branch and begin the next task'),
        rawValue: 'create a branch and begin the next task',
      },
      {
        label: '',
        rawLabel: '',
        value: '',
        rawValue: '',
      },
      {
        label: pc.bold(pc.cyan('Workflow')),
        rawLabel: 'Workflow',
        value: '',
        rawValue: '',
      },
      {
        label: pc.dim('cn setup → cn commit → cn update → cn submit'),
        rawLabel: 'cn setup → cn commit → cn update → cn submit',
        value: '',
        rawValue: '',
      },
    ];

    const terminalWidth = process.stdout.columns ?? 80;
    const maxContentWidth = Math.max(36, terminalWidth - 8);
    const unclampedLabelWidth = panelLines.reduce(
      (max, line) => Math.max(max, line.rawLabel.length),
      0,
    );
    const labelWidth = Math.min(unclampedLabelWidth, 18);
    const valueWidth = Math.max(14, maxContentWidth - labelWidth - 2);
    const rows = panelLines.map((line) => {
      const rawLabel = line.rawValue ? truncateText(line.rawLabel, labelWidth) : line.rawLabel;
      const rawValue = line.rawValue ? truncateText(line.rawValue, valueWidth) : '';
      return {
        ...line,
        rawLabel,
        rawValue,
      };
    });
    const contentWidth = Math.min(
      maxContentWidth,
      rows.reduce((max, line) => {
        const lineLength = line.rawValue
          ? labelWidth + 2 + line.rawValue.length
          : line.rawLabel.length;
        return Math.max(max, lineLength);
      }, 0),
    );

    console.log();
    console.log(`  ${pc.dim(`┌${'─'.repeat(contentWidth + 2)}┐`)}`);
    for (const line of rows) {
      if (!line.rawLabel && !line.rawValue) {
        console.log(`  ${pc.dim('│')} ${' '.repeat(contentWidth)} ${pc.dim('│')}`);
        continue;
      }

      const left = line.rawValue
        ? `${line.label}${' '.repeat(Math.max(0, labelWidth - line.rawLabel.length + 2))}`
        : line.label;
      const value = line.rawValue ? pc.dim(line.rawValue) : '';
      const rawLength = line.rawValue
        ? labelWidth + 2 + line.rawValue.length
        : line.rawLabel.length;
      const trailing = ' '.repeat(Math.max(0, contentWidth - rawLength));
      console.log(`  ${pc.dim('│')} ${left}${value}${trailing} ${pc.dim('│')}`);
    }
    console.log(`  ${pc.dim(`└${'─'.repeat(contentWidth + 2)}┘`)}`);
    console.log();
    console.log(
      `  ${pc.dim('Star or contribute:')} ${pc.dim(linkify('gh.waren.build/contribute-now', 'https://gh.waren.build/contribute-now'))}`,
    );
    console.log(
      `  ${pc.dim('Sponsor:')} ${pc.dim(linkify('warengonzaga.com/sponsor', 'https://warengonzaga.com/sponsor'))}`,
    );
  }

  console.log();
}

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }

  if (maxWidth <= 1) {
    return text.slice(0, maxWidth);
  }

  return `${text.slice(0, maxWidth - 1)}…`;
}

function linkify(label: string, url: string): string {
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

function renderAnnouncements(announcements: Announcement[]): void {
  for (const announcement of announcements) {
    renderAnnouncementBanner(announcement);
  }
}

function renderAnnouncementBanner(announcement: Announcement): void {
  const terminalWidth = process.stdout.columns ?? 80;
  const contentWidth = Math.max(36, Math.min(terminalWidth - 8, 92));
  const tone = getAnnouncementTone(announcement.kind);
  const title = `${tone.emoji} ${announcement.title}`;
  const messageLines = wrapText(announcement.message, contentWidth);
  const lines = [title, ...messageLines];
  const rawWidth = Math.max(...lines.map((line) => line.length));

  console.log(`  ${tone.border(`┌${'─'.repeat(rawWidth + 2)}┐`)}`);
  for (const line of lines) {
    const trailing = ' '.repeat(Math.max(0, rawWidth - line.length));
    const content = line === title ? tone.title(line) : pc.dim(line);
    console.log(`  ${tone.border('│')} ${content}${trailing} ${tone.border('│')}`);
  }
  console.log(`  ${tone.border(`└${'─'.repeat(rawWidth + 2)}┘`)}`);
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxWidth));
      current = word.slice(maxWidth);
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function getAnnouncementTone(kind: AnnouncementKind): {
  emoji: string;
  border: (value: string) => string;
  title: (value: string) => string;
} {
  switch (kind) {
    case 'info':
      return {
        emoji: 'ℹ',
        border: pc.blue,
        title: (value: string) => pc.bold(pc.blue(value)),
      };
    case 'warning':
      return {
        emoji: '🚨',
        border: pc.red,
        title: (value: string) => pc.bold(pc.red(value)),
      };
    default:
      return {
        emoji: '⚠',
        border: pc.yellow,
        title: (value: string) => pc.bold(pc.yellow(value)),
      };
  }
}
