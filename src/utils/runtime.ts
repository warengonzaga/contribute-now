type RuntimeContext = {
  argv?: string[];
  env?: Record<string, string | undefined>;
  isBun?: boolean;
};

export function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== 'undefined';
}

export function isNpxExecution(context: RuntimeContext = {}): boolean {
  const argv = context.argv ?? process.argv;
  const env = context.env ?? process.env;

  if (argv.some((arg) => /(?:^|[\\/])npx(?:\.cmd)?$/i.test(arg))) {
    return true;
  }

  const userAgent = env.npm_config_user_agent ?? '';
  if (userAgent.startsWith('npm/')) {
    const execPath = env.npm_execpath ?? '';
    const lifecycle = env.npm_lifecycle_event ?? '';
    return execPath.includes('npx') || lifecycle === 'npx';
  }

  return false;
}

export function getBunRuntimeGuardMessage(context: RuntimeContext = {}): string {
  const detectedNpx = isNpxExecution(context);
  const lines = ['contribute-now requires Bun at runtime.', ''];

  if (detectedNpx) {
    lines.push('You are running it with Node/npx. Use Bun instead:');
    lines.push('  bunx contribute-now setup');
    lines.push('');
  }

  lines.push('Install Bun first:');
  lines.push('  npm install -g bun');
  lines.push('');
  lines.push('Then verify:');
  lines.push('  bun --version');
  lines.push('');
  lines.push('Official install guide:');
  lines.push('  https://bun.sh/docs/installation');

  return lines.join('\n');
}

export function ensureBunRuntime(context: RuntimeContext = {}): void {
  const bunRuntime = context.isBun ?? isBunRuntime();
  if (bunRuntime) {
    return;
  }

  console.error(getBunRuntimeGuardMessage(context));
  process.exit(1);
}
