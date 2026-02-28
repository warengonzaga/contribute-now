import { execFile as execFileCb } from 'node:child_process';
import { defineCommand } from 'citty';
import pc from 'picocolors';
import pkg from '../../package.json';
import { configExists, isGitignored, readConfig } from '../utils/config.js';
import { checkGhAuth, checkGhInstalled } from '../utils/gh.js';
import {
  getCurrentBranch,
  getRemotes,
  getRemoteUrl,
  hasUncommittedChanges,
  isGitRepo,
} from '../utils/git.js';
import { heading } from '../utils/logger.js';
import { detectForkSetup, parseRepoFromUrl } from '../utils/remote.js';
import {
  getBaseBranch,
  getSyncSource,
  hasDevBranch,
  WORKFLOW_DESCRIPTIONS,
} from '../utils/workflow.js';

// ─── helpers ──────────────────────────────────────────────────────
const PASS = `  ${pc.green('✔')} `;
const FAIL = `  ${pc.red('✗')} `;
const WARN = `  ${pc.yellow('⚠')} `;

interface DoctorReport {
  sections: SectionReport[];
}

interface SectionReport {
  title: string;
  checks: CheckResult[];
}

interface CheckResult {
  label: string;
  ok: boolean;
  warning?: boolean;
  detail?: string;
}

function printReport(report: DoctorReport): void {
  for (const section of report.sections) {
    console.log(`\n  ${pc.bold(pc.underline(section.title))}`);
    for (const check of section.checks) {
      const prefix = check.ok ? (check.warning ? WARN : PASS) : FAIL;
      const text = check.detail ? `${check.label} ${pc.dim(`— ${check.detail}`)}` : check.label;
      console.log(`${prefix}${text}`);
    }
  }
  console.log();
}

function toJson(report: DoctorReport): string {
  return JSON.stringify(
    report.sections.map((s) => ({
      section: s.title,
      checks: s.checks.map((c) => ({
        label: c.label,
        ok: c.ok,
        warning: c.warning ?? false,
        detail: c.detail ?? null,
      })),
    })),
    null,
    2,
  );
}

function runCmd(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFileCb(cmd, args, (error, stdout) => {
      resolve({
        ok: !error,
        stdout: (stdout ?? '').trim(),
      });
    });
  });
}

// ─── section builders ─────────────────────────────────────────────

async function toolSection(): Promise<SectionReport> {
  const checks: CheckResult[] = [];

  // CLI version
  checks.push({
    label: `contrib v${pkg.version ?? 'unknown'}`,
    ok: true,
  });

  // Runtime (Bun or Node)
  const runtime =
    typeof globalThis.Bun !== 'undefined'
      ? `Bun ${(globalThis.Bun as { version?: string }).version ?? '?'}`
      : `Node ${process.version}`;
  checks.push({ label: runtime, ok: true, detail: `${process.platform}-${process.arch}` });

  return { title: 'Tool', checks };
}

async function depsSection(): Promise<SectionReport> {
  const checks: CheckResult[] = [];

  // git
  const git = await runCmd('git', ['--version']);
  checks.push({
    label: git.ok ? git.stdout.replace('git version ', 'git ') : 'git not found',
    ok: git.ok,
  });

  // gh CLI
  const ghInstalled = await checkGhInstalled();
  if (ghInstalled) {
    const ghVer = await runCmd('gh', ['--version']);
    const ver = ghVer.stdout.split('\n')[0] ?? 'gh';
    checks.push({ label: ver, ok: true });

    const ghAuth = await checkGhAuth();
    checks.push({
      label: ghAuth ? 'gh authenticated' : 'gh not authenticated',
      ok: ghAuth,
      warning: !ghAuth,
      detail: ghAuth ? undefined : 'run `gh auth login`',
    });
  } else {
    checks.push({
      label: 'gh CLI not installed',
      ok: false,
      detail: 'install from https://cli.github.com',
    });
  }

  // Copilot SDK reachability (quick import check)
  try {
    await import('@github/copilot-sdk');
    checks.push({ label: 'Copilot SDK importable', ok: true });
  } catch {
    checks.push({
      label: 'Copilot SDK not loadable',
      ok: false,
      warning: true,
      detail: 'AI features will be unavailable',
    });
  }

  return { title: 'Dependencies', checks };
}

async function configSection(): Promise<SectionReport> {
  const checks: CheckResult[] = [];
  const exists = configExists();

  if (!exists) {
    checks.push({
      label: '.contributerc.json not found',
      ok: false,
      detail: 'run `contrib setup` to create it',
    });
    return { title: 'Config', checks };
  }

  const config = readConfig();
  if (!config) {
    checks.push({ label: '.contributerc.json found but invalid', ok: false });
    return { title: 'Config', checks };
  }

  checks.push({ label: '.contributerc.json found and valid', ok: true });

  // Workflow & role
  const desc = WORKFLOW_DESCRIPTIONS[config.workflow] ?? config.workflow;
  checks.push({
    label: `Workflow: ${config.workflow}`,
    ok: true,
    detail: desc,
  });
  checks.push({ label: `Role: ${config.role}`, ok: true });
  checks.push({ label: `Commit convention: ${config.commitConvention}`, ok: true });

  if (hasDevBranch(config.workflow)) {
    checks.push({
      label: `Dev branch: ${config.devBranch ?? '(not set)'}`,
      ok: !!config.devBranch,
    });
  }

  // .gitignore check
  const ignored = isGitignored();
  checks.push({
    label: ignored ? '.contributerc.json in .gitignore' : '.contributerc.json NOT in .gitignore',
    ok: true,
    warning: !ignored,
    detail: ignored ? undefined : 'consider adding it to .gitignore',
  });

  return { title: 'Config', checks };
}

async function gitSection(): Promise<SectionReport> {
  const checks: CheckResult[] = [];
  const inRepo = await isGitRepo();
  checks.push({
    label: inRepo ? 'Inside a git repository' : 'Not inside a git repository',
    ok: inRepo,
  });

  if (!inRepo) return { title: 'Git Environment', checks };

  // Current branch + HEAD
  const branch = await getCurrentBranch();
  const head = await runCmd('git', ['rev-parse', '--short', 'HEAD']);
  checks.push({
    label: `Branch: ${branch ?? '(detached)'}`,
    ok: !!branch,
    detail: head.ok ? `HEAD ${head.stdout}` : undefined,
  });

  // Remotes
  const remotes = await getRemotes();
  if (remotes.length === 0) {
    checks.push({ label: 'No remotes configured', ok: false, warning: true });
  } else {
    for (const remote of remotes) {
      const url = await getRemoteUrl(remote);
      const repoInfo = url ? parseRepoFromUrl(url) : null;
      const detail = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : (url ?? 'unknown URL');
      checks.push({ label: `Remote: ${remote}`, ok: true, detail });
    }
  }

  // Working tree
  const dirty = await hasUncommittedChanges();
  checks.push({
    label: dirty ? 'Uncommitted changes detected' : 'Working tree clean',
    ok: true,
    warning: dirty,
  });

  return { title: 'Git Environment', checks };
}

async function forkSection(): Promise<SectionReport> {
  const checks: CheckResult[] = [];
  const fork = await detectForkSetup();

  checks.push({
    label: fork.isFork
      ? 'Fork detected (upstream remote exists)'
      : 'Not a fork (no upstream remote)',
    ok: true,
  });

  if (fork.originRemote) {
    checks.push({ label: `Origin remote: ${fork.originRemote}`, ok: true });
  }
  if (fork.upstreamRemote) {
    checks.push({ label: `Upstream remote: ${fork.upstreamRemote}`, ok: true });
  }

  return { title: 'Fork Detection', checks };
}

async function workflowSection(): Promise<SectionReport> {
  const checks: CheckResult[] = [];
  const config = readConfig();

  if (!config) {
    checks.push({
      label: 'Cannot resolve workflow (no config)',
      ok: false,
      detail: 'run `contrib setup` first',
    });
    return { title: 'Workflow Resolution', checks };
  }

  const baseBranch = getBaseBranch(config);
  checks.push({ label: `Base branch: ${baseBranch}`, ok: true });

  const sync = getSyncSource(config);
  checks.push({
    label: `Sync source: ${sync.ref}`,
    ok: true,
    detail: `strategy: ${sync.strategy}`,
  });

  checks.push({
    label: `Branch prefixes: ${config.branchPrefixes.join(', ')}`,
    ok: config.branchPrefixes.length > 0,
  });

  return { title: 'Workflow Resolution', checks };
}

function envSection(): SectionReport {
  const checks: CheckResult[] = [];
  const vars = ['GITHUB_TOKEN', 'GH_TOKEN', 'COPILOT_AGENT_TOKEN', 'NO_COLOR', 'FORCE_COLOR', 'CI'];

  for (const name of vars) {
    const val = process.env[name];
    if (val !== undefined) {
      // Mask tokens — show only first 4 chars
      const isSecret = name.toLowerCase().includes('token');
      const display = isSecret
        ? `${val.slice(0, 4)}${'*'.repeat(Math.min(val.length - 4, 12))}`
        : val;
      checks.push({ label: `${name} = ${display}`, ok: true });
    }
  }

  if (checks.length === 0) {
    checks.push({ label: 'No relevant environment variables set', ok: true });
  }

  return { title: 'Environment', checks };
}

// ─── command ──────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Diagnose the contribute-now CLI environment and configuration',
  },
  args: {
    json: {
      type: 'boolean',
      description: 'Output report as JSON',
      default: false,
    },
  },
  async run({ args }) {
    const isJson = args.json as boolean;

    // Build all sections in parallel where possible
    const [tool, deps, config, git, fork, workflow] = await Promise.all([
      toolSection(),
      depsSection(),
      configSection(),
      gitSection(),
      forkSection(),
      workflowSection(),
    ]);

    const env = envSection();

    const report: DoctorReport = {
      sections: [tool, deps, config, git, fork, workflow, env],
    };

    if (isJson) {
      console.log(toJson(report));
      return;
    }

    heading('🩺 contribute-now doctor');
    printReport(report);

    // Summary line
    const total = report.sections.flatMap((s) => s.checks);
    const failures = total.filter((c) => !c.ok);
    const warnings = total.filter((c) => c.ok && c.warning);

    if (failures.length === 0 && warnings.length === 0) {
      console.log(`  ${pc.green('All checks passed!')} No issues detected.\n`);
    } else {
      if (failures.length > 0) {
        console.log(
          `  ${pc.red(`${failures.length} issue${failures.length !== 1 ? 's' : ''} found.`)}`,
        );
      }
      if (warnings.length > 0) {
        console.log(
          `  ${pc.yellow(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}.`)}`,
        );
      }
      console.log();
    }
  },
});
