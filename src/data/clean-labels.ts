export interface CleanLabel {
  name: string;
  description: string;
  color: string;
}

/**
 * The canonical 21-label Clean Labels dataset (v1.0.0).
 * Source: https://github.com/wgtechlabs/clean-labels
 */
export const CLEAN_LABELS: CleanLabel[] = [
  // ── Type ──────────────────────────────────────────────────────────────────
  {
    name: 'bug',
    description: "[Type] Something isn't working [issues, PRs]",
    color: 'd73a4a',
  },
  {
    name: 'enhancement',
    description: '[Type] New feature or improvement to existing functionality [issues, PRs]',
    color: '1a7f37',
  },
  {
    name: 'documentation',
    description: '[Type] Improvements or additions to docs, README, or guides [issues, PRs]',
    color: '0075ca',
  },
  {
    name: 'refactor',
    description: '[Type] Code improvement without changing functionality [PRs]',
    color: '8957e5',
  },
  {
    name: 'performance',
    description: '[Type] Optimization, speed, or resource usage improvements [issues, PRs]',
    color: 'e3795c',
  },
  {
    name: 'security',
    description: '[Type] Security vulnerability or hardening [issues, PRs]',
    color: 'd4a72c',
  },

  // ── Status ────────────────────────────────────────────────────────────────
  {
    name: 'blocked',
    description: '[Status] Waiting on another issue, decision, or external factor [issues]',
    color: 'cf222e',
  },
  {
    name: 'needs triage',
    description: '[Status] New issue — needs review and categorization [issues]',
    color: 'e16f24',
  },
  {
    name: 'awaiting response',
    description: '[Status] Waiting for more information from the reporter [issues]',
    color: '1a7ec7',
  },
  {
    name: 'ready',
    description: '[Status] Triaged and ready to be picked up [issues]',
    color: '2da44e',
  },

  // ── Community ─────────────────────────────────────────────────────────────
  {
    name: 'good first issue',
    description: '[Community] Good for newcomers — well-scoped and documented [issues]',
    color: '7057ff',
  },
  {
    name: 'help wanted',
    description: '[Community] Open for community contribution [issues]',
    color: '0e8a16',
  },
  {
    name: 'maintainer only',
    description:
      '[Community] Reserved for maintainers — not open for external contribution [issues, PRs]',
    color: 'b60205',
  },

  // ── Resolution ────────────────────────────────────────────────────────────
  {
    name: 'duplicate',
    description: '[Resolution] This issue or pull request already exists [issues, PRs]',
    color: 'cfd3d7',
  },
  {
    name: 'invalid',
    description: "[Resolution] This doesn't seem right [issues, PRs]",
    color: 'cfd3d7',
  },
  {
    name: 'wontfix',
    description: '[Resolution] This will not be worked on [issues]',
    color: 'cfd3d7',
  },

  // ── Area ──────────────────────────────────────────────────────────────────
  {
    name: 'core',
    description: '[Area] Core logic, business rules, and primary functionality [issues, PRs]',
    color: '0052cc',
  },
  {
    name: 'interface',
    description: '[Area] User-facing layer — UI, CLI, API endpoints, or SDK surface [issues, PRs]',
    color: '5319e7',
  },
  {
    name: 'data',
    description: '[Area] Database, storage, caching, or data models [issues, PRs]',
    color: '006b75',
  },
  {
    name: 'infra',
    description: '[Area] Build system, CI/CD, deployment, config, and DevOps [issues, PRs]',
    color: 'e16f24',
  },
  {
    name: 'testing',
    description: '[Area] Unit tests, integration tests, E2E, and test tooling [issues, PRs]',
    color: '1a7f37',
  },
];
