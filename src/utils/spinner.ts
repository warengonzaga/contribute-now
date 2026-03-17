import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const MIN_LINE_WIDTH = 20;

interface SpinnerOptions {
  tips?: string[];
  tipIntervalMs?: number;
}

export interface Spinner {
  /** Update the spinner text while it's still running. */
  update(text: string): void;
  /** Stop the spinner and show a final success message. */
  success(text: string): void;
  /** Stop the spinner and show a final failure message. */
  fail(text: string): void;
  /** Stop the spinner silently (no final message). */
  stop(): void;
}

export function formatSpinnerLines(
  text: string,
  tip: string | undefined,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) {
    return [];
  }

  const normalizedText = text.trim();
  const normalizedTip = tip?.trim() ?? '';
  const primary = truncateText(normalizedText, Math.max(MIN_LINE_WIDTH, maxWidth));

  if (!normalizedTip) {
    return [primary];
  }

  const secondary = truncateText(normalizedTip, Math.max(MIN_LINE_WIDTH, maxWidth - 2));
  return [primary, secondary];
}

/**
 * Create and immediately start a lightweight CLI spinner.
 * Zero external dependencies — uses picocolors + setInterval.
 */
export function createSpinner(text: string, options: SpinnerOptions = {}): Spinner {
  let frameIdx = 0;
  let currentText = text;
  let stopped = false;
  let tipIdx = 0;
  let renderedLineCount = 0;
  let lastPrimaryLine = '';
  let lastSecondaryLine = '';

  const tips = options.tips?.filter(Boolean) ?? [];
  const tipIntervalMs = options.tipIntervalMs ?? 2200;

  const clearBlock = () => {
    if (renderedLineCount === 0) {
      return;
    }

    for (let index = 0; index < renderedLineCount; index++) {
      process.stderr.write('\r\x1b[2K');
      if (index < renderedLineCount - 1) {
        process.stderr.write('\x1b[1A');
      }
    }

    process.stderr.write('\r');
    lastPrimaryLine = '';
    lastSecondaryLine = '';
  };

  const renderNextState = (primaryLine: string, secondaryLine: string | undefined) => {
    if (renderedLineCount === 0) {
      process.stderr.write(primaryLine);
      if (secondaryLine) {
        process.stderr.write(`\n${secondaryLine}`);
        renderedLineCount = 2;
      } else {
        renderedLineCount = 1;
      }
      lastPrimaryLine = primaryLine;
      lastSecondaryLine = secondaryLine ?? '';
      return;
    }

    if (renderedLineCount === 1) {
      if (lastPrimaryLine !== primaryLine) {
        process.stderr.write(`\r\x1b[2K${primaryLine}`);
      }

      if (secondaryLine) {
        process.stderr.write(`\n${secondaryLine}`);
        renderedLineCount = 2;
      }

      lastPrimaryLine = primaryLine;
      lastSecondaryLine = secondaryLine ?? '';
      return;
    }

    process.stderr.write(`\x1b[1A\r\x1b[2K${primaryLine}\n`);

    if (secondaryLine) {
      if (lastSecondaryLine !== secondaryLine) {
        process.stderr.write(`\r\x1b[2K${secondaryLine}`);
      }
      renderedLineCount = 2;
    } else {
      process.stderr.write('\r\x1b[2K\x1b[1A\r');
      renderedLineCount = 1;
    }

    lastPrimaryLine = primaryLine;
    lastSecondaryLine = secondaryLine ?? '';
  };

  const render = () => {
    if (stopped) return;
    const frame = pc.cyan(FRAMES[frameIdx % FRAMES.length]);
    const width = Math.max(
      MIN_LINE_WIDTH,
      (process.stderr.columns ?? process.stdout.columns ?? 100) - 4,
    );
    const lines = formatSpinnerLines(currentText, tips[tipIdx % tips.length], width);

    renderNextState(
      `${frame} ${pc.cyan(lines[0] ?? '')}`,
      lines[1] ? `  ${pc.dim(lines[1])}` : undefined,
    );

    frameIdx++;
  };

  const timer = setInterval(render, 80);
  const tipTimer =
    tips.length > 1
      ? setInterval(() => {
          tipIdx = (tipIdx + 1) % tips.length;
        }, tipIntervalMs)
      : null;
  render(); // Immediate first frame

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (tipTimer) clearInterval(tipTimer);
    clearBlock();
    renderedLineCount = 0;
  };

  return {
    update(newText: string) {
      currentText = newText;
    },
    success(msg: string) {
      stop();
      process.stderr.write(`${pc.green('✔')} ${msg}\n`);
    },
    fail(msg: string) {
      stop();
      process.stderr.write(`${pc.red('✖')} ${msg}\n`);
    },
    stop() {
      stop();
    },
  };
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
