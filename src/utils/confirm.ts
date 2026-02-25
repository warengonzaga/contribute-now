import pc from 'picocolors';

export async function confirmPrompt(message: string): Promise<boolean> {
  console.log(`\n${message}`);
  process.stdout.write(`${pc.dim('Continue? [y/N] ')}`);

  const response = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
    process.stdin.resume();
  });

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

  const response = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
    process.stdin.resume();
  });

  const index = Number.parseInt(response, 10) - 1;
  if (index >= 0 && index < choices.length) {
    return choices[index];
  }
  return choices[0];
}

export async function inputPrompt(message: string, defaultValue?: string): Promise<string> {
  const hint = defaultValue ? ` ${pc.dim(`[${defaultValue}]`)}` : '';
  process.stdout.write(`\n${message}${hint}: `);

  const response = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
    process.stdin.resume();
  });

  return response || defaultValue || '';
}
