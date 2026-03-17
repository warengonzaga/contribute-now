import { LogEngine, LogMode } from '@wgtechlabs/log-engine';
import pc from 'picocolors';
import { readConfig, shouldShowTips, writeConfig } from './config.js';
import { getVisibleCommandGuide } from './tips.js';

export const PROJECT_DISPLAY_NAME = 'Contribute Now';

LogEngine.configure({
  mode: LogMode.INFO,
  format: {
    includeIsoTimestamp: false,
    includeLocalTime: false,
    includeEmoji: true,
  },
});

export function success(msg: string, emoji = '✅') {
  LogEngine.log(msg, undefined, { emoji });
}

export function error(msg: string, emoji = '🚨') {
  LogEngine.error(msg, undefined, { emoji });
}

export function warn(msg: string, emoji = '⚠️') {
  LogEngine.warn(msg, undefined, { emoji });
}

export function info(msg: string, emoji = 'ℹ️') {
  LogEngine.info(msg, undefined, { emoji });
}

export function heading(msg: string) {
  console.log(`\n${pc.bold(msg)}`);
}

export function projectHeading(command: string, emoji?: string) {
  const prefix = emoji ? `${emoji} ` : '';
  console.log(`  ${pc.bold(pc.cyan(`${prefix}${command}`))}`);

  const config = readConfig();
  const rotationIndex = config?.guideRotation?.[normalizeGuideKey(command)] ?? 0;
  const visibleGuide = getVisibleCommandGuide(command, rotationIndex);

  if (visibleGuide) {
    console.log(`  ${pc.dim(visibleGuide.guide.summary)}`);
  }

  if (!shouldShowTips(config)) {
    return;
  }

  if (!visibleGuide || visibleGuide.examples.length === 0) {
    return;
  }

  if (config && visibleGuide.rotatableCount > 0) {
    config.guideRotation = config.guideRotation ?? {};
    config.guideRotation[visibleGuide.key] = (rotationIndex + 1) % visibleGuide.rotatableCount;
    writeConfig(config);
  }

  console.log();

  const terminalWidth = process.stdout.columns ?? 80;
  const maxContentWidth = Math.max(28, terminalWidth - 8);
  const commandWidth = visibleGuide.examples.reduce(
    (max, example) => Math.max(max, example.command.length),
    0,
  );
  const descriptionWidth = Math.max(12, maxContentWidth - commandWidth - 2);
  const rows = visibleGuide.examples.map((example) => {
    const description = truncateText(example.description, descriptionWidth);
    const commandText = example.command.padEnd(commandWidth + 2);
    return {
      commandText,
      description,
      rawLength: commandText.length + description.length,
    };
  });
  const contentWidth = Math.min(maxContentWidth, Math.max(28, ...rows.map((row) => row.rawLength)));
  const label = '─ quick guide ';
  const topBorder = `┌${label}${'─'.repeat(Math.max(1, contentWidth - label.length + 1))}┐`;

  console.log(`  ${pc.dim(topBorder)}`);
  for (const row of rows) {
    const left = pc.cyan(row.commandText);
    const right = pc.dim(row.description);
    const trailing = ' '.repeat(Math.max(0, contentWidth - row.rawLength));
    console.log(`  ${pc.dim('│')} ${left}${right}${trailing}${pc.dim('│')}`);
  }
  console.log(`  ${pc.dim(`└${'─'.repeat(contentWidth + 1)}┘`)}`);
}

function normalizeGuideKey(command: string): string {
  return (
    command
      .replace(/\s*\(.+\)$/, '')
      .trim()
      .split(/\s+/)[0] ?? command
  );
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

export function dim(msg: string) {
  console.log(pc.dim(msg));
}

export { LogEngine };
