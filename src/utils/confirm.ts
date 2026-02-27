import * as clack from '@clack/prompts';
import pc from 'picocolors';

/**
 * Handle cancellation (Ctrl+C / Esc) from any clack prompt.
 * Exits cleanly with a "Cancelled." message.
 */
function handleCancel(value: unknown): void {
  if (clack.isCancel(value)) {
    clack.cancel('Cancelled.');
    process.exit(0);
  }
}

export async function confirmPrompt(message: string): Promise<boolean> {
  const result = await clack.confirm({ message });
  handleCancel(result);
  return result as boolean;
}

export async function selectPrompt(message: string, choices: string[]): Promise<string> {
  const result = await clack.select({
    message,
    options: choices.map((choice) => ({ value: choice, label: choice })),
  });
  handleCancel(result);
  return result as string;
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  const result = await clack.text({
    message,
    placeholder: defaultValue,
    defaultValue,
  });
  handleCancel(result);
  return (result as string) || defaultValue || '';
}

/**
 * Multi-select prompt with arrow-key navigation and space-to-toggle.
 * Returns the selected items as strings.
 */
export async function multiSelectPrompt(message: string, choices: string[]): Promise<string[]> {
  const result = await clack.multiselect({
    message: `${message} ${pc.dim('(space to toggle, enter to confirm)')}`,
    options: choices.map((choice) => ({ value: choice, label: choice })),
    required: false,
  });
  handleCancel(result);
  return result as string[];
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
