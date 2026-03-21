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

  if (argv.some((arg) => /(?:^|[\\/])(?:npx|pnpx)(?:\.cmd)?$/i.test(arg))) {
    return true;
  }

  const normalizedUserAgent = (env.npm_config_user_agent ?? '').toLowerCase();
  const execPath = (env.npm_execpath ?? '').toLowerCase();
  const lifecycle = (env.npm_lifecycle_event ?? '').toLowerCase();

  if (normalizedUserAgent.startsWith('npm/') || normalizedUserAgent.startsWith('pnpm/')) {
    return execPath.includes('npx') || execPath.includes('pnpx') || lifecycle === 'npx' || lifecycle === 'pnpx';
  }

  return false;
}

export function getBunRuntimeGuardMessage(context: RuntimeContext = {}): string {
  const detectedNpx = isNpxExecution(context);
  const lines = ['contribute-now requires Bun at runtime.', ''];

  if (detectedNpx) {
    lines.push('You are running it with Node/npx or pnpx. Use Bun instead:');
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
