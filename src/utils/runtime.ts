type RuntimeContext = {
  argv?: string[];
  env?: Record<string, string | undefined>;
  isBun?: boolean;
  nodeVersion?: string;
};

export const DEFAULT_NODE_MAJOR = 26;
export const SUPPORTED_NODE_MAJORS = [22, 24, 26] as const;

export function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== 'undefined';
}

export function getNodeMajorVersion(context: RuntimeContext = {}): number | null {
  const nodeVersion = context.nodeVersion ?? process.versions.node;
  const normalized = nodeVersion.startsWith('v') ? nodeVersion.slice(1) : nodeVersion;
  const major = Number.parseInt(normalized.split('.')[0] ?? '', 10);

  return Number.isFinite(major) ? major : null;
}

export function isSupportedNodeRuntime(context: RuntimeContext = {}): boolean {
  const major = getNodeMajorVersion(context);

  return major !== null && SUPPORTED_NODE_MAJORS.includes(major as (typeof SUPPORTED_NODE_MAJORS)[number]);
}

export function isSupportedRuntime(context: RuntimeContext = {}): boolean {
  const bunRuntime = context.isBun ?? isBunRuntime();

  if (bunRuntime) {
    return true;
  }

  return isSupportedNodeRuntime(context);
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
    return (
      execPath.includes('npx') ||
      execPath.includes('pnpx') ||
      lifecycle === 'npx' ||
      lifecycle === 'pnpx'
    );
  }

  return false;
}

export function getRuntimeGuardMessage(context: RuntimeContext = {}): string {
  const detectedNpx = isNpxExecution(context);
  const nodeVersion = context.nodeVersion ?? process.versions.node;
  const lines = ['contribute-now runs on Node.js at runtime.', ''];

  lines.push(`Default runtime target: Node.js ${DEFAULT_NODE_MAJOR}.`);
  lines.push(`Supported Node.js versions: ${SUPPORTED_NODE_MAJORS.join(', ')}.`);
  lines.push('');

  if (detectedNpx) {
    lines.push('npx/pnpx execution is supported, but the current Node.js runtime is outside the supported range.');
    lines.push('');
  }

  lines.push(`Detected Node.js version: ${nodeVersion}`);
  lines.push('');
  const majors = [...SUPPORTED_NODE_MAJORS] as number[];
  const versionList =
    majors.length > 1
      ? `${majors.slice(0, -1).join(', ')}, or ${majors[majors.length - 1]}`
      : `${majors[0]}`;

  lines.push(`Use Node.js ${versionList} for the packaged CLI.`);
  lines.push('Bun remains the supported toolchain for local development, builds, and tests.');
  lines.push('');
  lines.push('Download Node.js:');
  lines.push('  https://nodejs.org/');

  return lines.join('\n');
}

export function getBunRuntimeGuardMessage(context: RuntimeContext = {}): string {
  return getRuntimeGuardMessage(context);
}

export function ensureSupportedRuntime(context: RuntimeContext = {}): void {
  if (isSupportedRuntime(context)) {
    return;
  }

  console.error(getRuntimeGuardMessage(context));
  process.exit(1);
}

export function ensureBunRuntime(context: RuntimeContext = {}): void {
  ensureSupportedRuntime(context);
}
