import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

/**
 * Create and immediately start a lightweight CLI spinner.
 * Zero external dependencies — uses picocolors + setInterval.
 */
export function createSpinner(text: string): Spinner {
  let frameIdx = 0;
  let currentText = text;
  let stopped = false;

  const clearLine = () => {
    process.stderr.write('\r\x1b[K');
  };

  const render = () => {
    if (stopped) return;
    const frame = pc.cyan(FRAMES[frameIdx % FRAMES.length]);
    clearLine();
    process.stderr.write(`${frame} ${currentText}`);
    frameIdx++;
  };

  const timer = setInterval(render, 80);
  render(); // Immediate first frame

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    clearLine();
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
