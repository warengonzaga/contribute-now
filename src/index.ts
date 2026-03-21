#!/usr/bin/env bun
function isNpxExecution(): boolean {
  if (process.argv.some((arg) => /(?:^|[\\/])npx(?:\.cmd)?$/i.test(arg))) {
    return true;
  }

  const userAgent = process.env.npm_config_user_agent ?? '';
  if (userAgent.startsWith('npm/')) {
    const execPath = process.env.npm_execpath ?? '';
    const lifecycle = process.env.npm_lifecycle_event ?? '';
    return execPath.includes('npx') || lifecycle === 'npx';
  }

  return false;
}

function getBunRuntimeGuardMessage(): string {
  const lines = ['contribute-now requires Bun at runtime.', ''];

  if (isNpxExecution()) {
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

if (typeof globalThis.Bun === 'undefined') {
  console.error(getBunRuntimeGuardMessage());
  process.exit(1);
}

await import('./cli.js');
