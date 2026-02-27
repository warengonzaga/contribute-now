import pc from 'picocolors';

/** Read one line from stdin with proper cleanup on stream end. */
function readLine(): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf-8');
    const onData = (data: Buffer | string) => {
      cleanup();
      resolve(data.toString().trim());
    };
    const onEnd = () => {
      cleanup();
      resolve('');
    };
    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.pause();
    };
    process.stdin.once('data', onData);
    process.stdin.once('end', onEnd);
    process.stdin.resume();
  });
}

export async function confirmPrompt(message: string): Promise<boolean> {
  console.log(`\n${message}`);
  process.stdout.write(`${pc.dim('Continue? [y/N] ')}`);

  const response = await readLine();

  if (response.toLowerCase() !== 'y') {
    console.log(pc.yellow('Aborted.'));
    return false;
  }

  return true;
}

export async function selectPrompt(message: string, choices: string[]): Promise<string> {
  console.log(`\n${message}`);
  choices.forEach((choice, i) => {
    console.log(`  ${pc.dim(`${i + 1}.`)} ${choice}`);
  });
  process.stdout.write(pc.dim(`Enter number [1-${choices.length}]: `));

  const response = await readLine();

  const index = Number.parseInt(response, 10) - 1;
  if (index >= 0 && index < choices.length) {
    return choices[index];
  }
  console.log(pc.yellow(`Invalid selection — defaulting to "${choices[0]}".`));
  return choices[0];
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  const hint = defaultValue ? ` ${pc.dim(`[${defaultValue}]`)}` : '';
  process.stdout.write(`\n${message}${hint}: `);

  const response = await readLine();

  return response || defaultValue || '';
}

/**
 * Multi-select prompt: displays a numbered list and lets the user pick
 * multiple items by entering comma-separated numbers, a range (e.g. 1-3),
 * or "a" to select all.
 */
export async function multiSelectPrompt(message: string, choices: string[]): Promise<string[]> {
  console.log(`\n${message}`);
  choices.forEach((choice, i) => {
    console.log(`  ${pc.dim(`${i + 1}.`)} ${choice}`);
  });
  process.stdout.write(pc.dim(`\nEnter numbers (e.g. 1,3,5 or 1-3) or "a" for all: `));

  const response = await readLine();

  if (response.toLowerCase() === 'a') {
    return [...choices];
  }

  const indices = new Set<number>();
  for (const part of response.split(',')) {
    const trimmed = part.trim();
    const rangeParts = trimmed.split('-');
    if (rangeParts.length === 2) {
      const start = Number.parseInt(rangeParts[0], 10);
      const end = Number.parseInt(rangeParts[1], 10);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= choices.length) indices.add(i - 1);
        }
      }
    } else {
      const idx = Number.parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < choices.length) indices.add(idx);
    }
  }

  if (indices.size === 0) {
    console.log(pc.yellow('No valid selections parsed — nothing selected.'));
  }

  return [...indices].sort((a, b) => a - b).map((i) => choices[i]);
}
