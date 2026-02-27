import * as clack from '@clack/prompts';

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
    message,
    options: choices.map((choice) => ({ value: choice, label: choice })),
    required: false,
  });
  handleCancel(result);
  return result as string[];
}
