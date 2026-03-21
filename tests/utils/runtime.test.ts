import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  ensureBunRuntime,
  getBunRuntimeGuardMessage,
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

describe('getBunRuntimeGuardMessage', () => {
  it('suggests bunx when npx execution is detected', () => {
    const message = getBunRuntimeGuardMessage({ argv: ['/usr/bin/npx', 'contribute-now'] });

    expect(message).toContain('You are running it with Node/npx or pnpx. Use Bun instead:');
    expect(message).toContain('bunx contribute-now setup');
    expect(message).toContain('npm install -g bun');
  });

  it('suggests bunx when pnpx execution is detected', () => {
    const message = getBunRuntimeGuardMessage({ argv: ['/usr/bin/pnpx', 'contribute-now'] });

    expect(message).toContain('You are running it with Node/npx or pnpx. Use Bun instead:');
    expect(message).toContain('bunx contribute-now setup');
  });

  it('returns the generic Bun install guidance otherwise', () => {
    const message = getBunRuntimeGuardMessage({ argv: ['node', 'dist/index.js'] });

    expect(message).not.toContain('You are running it with Node/npx or pnpx');
    expect(message).toContain('contribute-now requires Bun at runtime.');
    expect(message).toContain('https://bun.sh/docs/installation');
  });
});

describe('ensureBunRuntime', () => {
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

    ensureBunRuntime({ isBun: true });

    expect(logged).toHaveLength(0);
    expect(exitCode).toBeUndefined();
  });

  it('prints the guard message and exits with code 1 when Bun is unavailable', () => {
    const logged: string[] = [];

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as typeof process.exit;

    expect(() => ensureBunRuntime({ isBun: false, argv: ['node', 'dist/index.js'] })).toThrow(
      'exit:1',
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('contribute-now requires Bun at runtime.');
    expect(logged[0]).toContain('npm install -g bun');
  });

  it('includes bunx guidance when exiting from npx-style execution', () => {
    const logged: string[] = [];

    console.error = (message?: unknown) => {
      logged.push(String(message ?? ''));
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as typeof process.exit;

    expect(() =>
      ensureBunRuntime({
        isBun: false,
        argv: ['/usr/bin/npx', 'contribute-now'],
      }),
    ).toThrow('exit:1');
    expect(logged[0]).toContain('bunx contribute-now setup');
  });
});
