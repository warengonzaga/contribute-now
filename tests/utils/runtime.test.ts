import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  ensureSupportedRuntime,
  ensureBunRuntime,
  getBunRuntimeGuardMessage,
  getNodeMajorVersion,
  getRuntimeGuardMessage,
  isSupportedNodeRuntime,
  isSupportedRuntime,
  isNpxExecution,
} from '../../src/utils/runtime.js';

const originalConsoleError = console.error;
const originalProcessExit = process.exit;

beforeEach(() => {
  console.error = originalConsoleError;
  process.exit = originalProcessExit;
});

afterEach(() => {
  console.error = originalConsoleError;
  process.exit = originalProcessExit;
});

describe('isNpxExecution', () => {
  it('detects npx from argv', () => {
    expect(isNpxExecution({ argv: ['/usr/bin/npx', 'contribute-now'] })).toBe(true);
  });

  it('detects pnpx from argv', () => {
    expect(isNpxExecution({ argv: ['/usr/bin/pnpx', 'contribute-now'] })).toBe(true);
  });

  it('detects npx from npm environment', () => {
    expect(
      isNpxExecution({
        argv: ['node', 'dist/index.js'],
        env: {
          npm_config_user_agent: 'npm/10.8.1 node/v22.0.0 win32 x64',
          npm_execpath: 'C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js',
        },
      }),
    ).toBe(true);
  });

  it('detects npx from a Windows argv path', () => {
    expect(isNpxExecution({ argv: ['C:/Program Files/nodejs/npx.cmd', 'contribute-now'] })).toBe(
      true,
    );
  });

  it('detects pnpx from a Windows argv path', () => {
    expect(isNpxExecution({ argv: ['C:/Program Files/pnpm/pnpx.cmd', 'contribute-now'] })).toBe(
      true,
    );
  });

  it('detects npx from npm lifecycle metadata', () => {
    expect(
      isNpxExecution({
        argv: ['node', 'dist/index.js'],
        env: {
          npm_config_user_agent: 'npm/10.8.1 node/v22.0.0 linux x64',
          npm_lifecycle_event: 'npx',
        },
      }),
    ).toBe(true);
  });

  it('detects pnpx from pnpm environment metadata', () => {
    expect(
      isNpxExecution({
        argv: ['node', 'dist/index.js'],
        env: {
          npm_config_user_agent: 'pnpm/10.0.0 node/v22.0.0 linux x64',
          npm_execpath: '/usr/local/share/pnpm/pnpx',
          npm_lifecycle_event: 'pnpx',
        },
      }),
    ).toBe(true);
  });

  it('does not mark regular bun execution as npx', () => {
    expect(
      isNpxExecution({
        argv: ['bun', 'dist/index.js'],
        env: {
          npm_config_user_agent: 'bun/1.2.0',
        },
      }),
    ).toBe(false);
  });
});

describe('getNodeMajorVersion', () => {
  it('returns the major version when Node.js is valid', () => {
    expect(getNodeMajorVersion({ nodeVersion: '26.0.0' })).toBe(26);
  });

  it('returns null when Node.js cannot be parsed', () => {
    expect(getNodeMajorVersion({ nodeVersion: 'invalid' })).toBeNull();
  });
});

describe('isSupportedNodeRuntime', () => {
  it('accepts Node.js 22, 24, and 26', () => {
    expect(isSupportedNodeRuntime({ nodeVersion: '22.15.0' })).toBe(true);
    expect(isSupportedNodeRuntime({ nodeVersion: '24.3.1' })).toBe(true);
    expect(isSupportedNodeRuntime({ nodeVersion: '26.0.0' })).toBe(true);
  });

  it('rejects unsupported Node.js majors', () => {
    expect(isSupportedNodeRuntime({ nodeVersion: '21.9.0' })).toBe(false);
    expect(isSupportedNodeRuntime({ nodeVersion: '27.0.0' })).toBe(false);
  });
});

describe('isSupportedRuntime', () => {
  it('accepts Bun as the development toolchain runtime', () => {
    expect(isSupportedRuntime({ isBun: true })).toBe(true);
  });

  it('accepts supported Node.js runtimes', () => {
    expect(isSupportedRuntime({ isBun: false, nodeVersion: '24.8.0' })).toBe(true);
  });

  it('rejects unsupported Node.js runtimes', () => {
    expect(isSupportedRuntime({ isBun: false, nodeVersion: '20.18.0' })).toBe(false);
  });
});

describe('getRuntimeGuardMessage', () => {
  it('explains the supported Node.js policy for npx execution', () => {
    const message = getRuntimeGuardMessage({
      argv: ['/usr/bin/npx', 'contribute-now'],
      nodeVersion: '20.18.0',
    });

    expect(message).toContain('contribute-now runs on Node.js at runtime.');
    expect(message).toContain('Default runtime target: Node.js 26.');
    expect(message).toContain('Supported Node.js versions: 22, 24, 26.');
    expect(message).toContain('npx/pnpx execution is supported');
  });

  it('returns generic Node.js guidance otherwise', () => {
    const message = getRuntimeGuardMessage({
      argv: ['node', 'dist/cli.js'],
      nodeVersion: '20.18.0',
    });

    expect(message).not.toContain('npx/pnpx execution is supported');
    expect(message).toContain('Use Node.js 22, 24, or 26 for the packaged CLI.');
    expect(message).toContain('Bun remains the supported toolchain for local development, builds, and tests.');
    expect(message).toContain('https://nodejs.org/');
  });

  it('keeps the legacy alias wired to the new message', () => {
    expect(getBunRuntimeGuardMessage({ nodeVersion: '20.18.0' })).toBe(
      getRuntimeGuardMessage({ nodeVersion: '20.18.0' }),
    );
  });
});

describe('ensureSupportedRuntime', () => {
  it('does nothing when Bun is available', () => {
    const logged: string[] = [];
    let exitCode: number | undefined;

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      exitCode = code;
      return undefined as never;
    }) as typeof process.exit;

    ensureSupportedRuntime({ isBun: true });

    expect(logged).toHaveLength(0);
    expect(exitCode).toBeUndefined();
  });

  it('does nothing when Node.js is supported', () => {
    const logged: string[] = [];
    let exitCode: number | undefined;

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      exitCode = code;
      return undefined as never;
    }) as typeof process.exit;

    ensureSupportedRuntime({ isBun: false, nodeVersion: '22.15.0' });

    expect(logged).toHaveLength(0);
    expect(exitCode).toBeUndefined();
  });

  it('prints the guard message and exits with code 1 when Node.js is unsupported', () => {
    const logged: string[] = [];

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as typeof process.exit;

    expect(() =>
      ensureSupportedRuntime({
        isBun: false,
        argv: ['node', 'dist/cli.js'],
        nodeVersion: '20.18.0',
      }),
    ).toThrow('exit:1');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('Supported Node.js versions: 22, 24, 26.');
    expect(logged[0]).toContain('Detected Node.js version: 20.18.0');
  });

  it('includes npx guidance when exiting from npx-style execution', () => {
    const logged: string[] = [];

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as typeof process.exit;

    expect(() =>
      ensureSupportedRuntime({
        isBun: false,
        argv: ['/usr/bin/npx', 'contribute-now'],
        nodeVersion: '20.18.0',
      }),
    ).toThrow('exit:1');
    expect(logged[0]).toContain('npx/pnpx execution is supported');
  });
});

describe('ensureBunRuntime', () => {
  it('keeps the legacy alias wired to supported runtime checks', () => {
    const logged: string[] = [];

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as typeof process.exit;

    expect(() => ensureBunRuntime({ isBun: false, nodeVersion: '20.18.0' })).toThrow('exit:1');
    expect(logged[0]).toContain('contribute-now runs on Node.js at runtime.');
  });
});
