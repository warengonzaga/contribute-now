import { CopilotClient } from '@github/copilot-sdk';
import type { AIProvider, CommitConvention, ContributeConfig } from '../types.js';
import { readConfig } from './config.js';
import { getOllamaCloudApiKey, hasOllamaCloudApiKey } from './secrets.js';

const CONVENTIONAL_COMMIT_SYSTEM_PROMPT = `Git commit message generator. Format: <type>[!][(<scope>)]: <description>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
Rules: breaking (!) only for feat/fix/refactor/perf; imperative mood; max 72 chars; lowercase start; scope optional camelCase/kebab-case. Do NOT use backticks, quotes, or markdown formatting around filenames, functions, or identifiers. Return ONLY the message line.
Examples: feat: add user auth | fix(auth): resolve token expiry | feat!: redesign auth API`;

const CLEAN_COMMIT_SYSTEM_PROMPT = `Git commit message generator. EXACT format: <emoji> <type>[!][ (<scope>)]: <description>
Spacing: EMOJI SPACE TYPE [SPACE OPENPAREN SCOPE CLOSEPAREN] COLON SPACE DESCRIPTION
Types: 📦 new, 🔧 update, 🗑️ remove, 🔒 security, ⚙️ setup, ☕ chore, 🧪 test, 📖 docs, 🚀 release
Rules: breaking (!) only for new/update/remove/security; imperative mood; max 72 chars; lowercase start; scope optional. Do NOT use backticks, quotes, or markdown formatting around filenames, functions, or identifiers. Return ONLY the message line.
Correct: 📦 new: add user auth | 🔧 update (api): improve error handling | ⚙️ setup (ci): configure github actions
WRONG: ⚙️setup(ci): ... | 🔧 update(api): ... ← always space before scope parenthesis`;

function getGroupingSystemPrompt(convention: CommitConvention): string {
  const conventionBlock =
    convention === 'conventional'
      ? `Use Conventional Commit format: <type>[(<scope>)]: <description>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`
      : `Use Clean Commit format: <emoji> <type>[!][ (<scope>)]: <description>
Emoji/type table:
📦 new, 🔧 update, 🗑️ remove, 🔒 security, ⚙️ setup, ☕ chore, 🧪 test, 📖 docs, 🚀 release`;

  return `You are a smart commit grouping assistant. Given a list of changed files and their diffs, group related changes into logical atomic commits.

${conventionBlock}

Return a JSON array of commit groups with this EXACT structure (no markdown fences, no explanation):
[
  {
    "files": ["path/to/file1.ts", "path/to/file2.ts"],
    "message": "<commit message following the convention above>"
  }
]

Rules:
- Group files that are logically related (e.g. a utility and its tests, a feature and its types)
- Each group should represent ONE logical change
- Every file must appear in exactly one group
- Commit messages must follow the convention, be concise, imperative, max 72 chars
- Do not use backticks, quotes, or markdown formatting in commit messages
- Order groups so foundational changes come first (types, utils) and consumers come after
- Return ONLY the JSON array, nothing else`;
}

const BRANCH_NAME_SYSTEM_PROMPT = `You are a git branch name generator. Your ONLY job is to output a single git branch name. NOTHING ELSE.
Output format: <prefix>/<kebab-case-name>
Valid prefixes: feature, fix, docs, chore, test, refactor
Rules: lowercase, kebab-case, 2-5 words after the prefix, no punctuation.
CRITICAL: Output ONLY the branch name on a single line. No explanation. No markdown. No questions. No other text.
Examples: fix/login-timeout | feature/user-profile-page | docs/update-readme | chore/update-pr-title`;

const PR_DESCRIPTION_SYSTEM_PROMPT_BASE = `GitHub PR description generator. Return JSON: {"title":"<72 chars>","body":"## Summary\\n...\\n\\n## Changes\\n- ...\\n\\n## Test Plan\\n..."}
IMPORTANT: The title must capture the overall theme or goal of the PR — NOT enumerate individual changes. Think: what problem does this PR solve or what capability does it add? Keep it focused and specific but high-level.`;

function getPRDescriptionSystemPrompt(convention: CommitConvention): string {
  if (convention === 'clean-commit') {
    return `${PR_DESCRIPTION_SYSTEM_PROMPT_BASE}
CRITICAL: The PR title MUST follow the Clean Commit format exactly: <emoji> <type>: <description>
Emoji/type table: 📦 new, 🔧 update, 🗑️ remove, 🔒 security, ⚙️ setup, ☕ chore, 🧪 test, 📖 docs, 🚀 release
Title examples: 📦 new: add user authentication | 🔧 update: improve error handling | 🗑️ remove: drop legacy API
Rules: title follows convention, present tense, max 72 chars, describes the PR theme not individual commits; body has Summary, Changes (bullets), Test Plan sections. Return ONLY the JSON object, no fences.`;
  }
  if (convention === 'conventional') {
    return `${PR_DESCRIPTION_SYSTEM_PROMPT_BASE}
CRITICAL: The PR title MUST follow Conventional Commits format: <type>[(<scope>)]: <description>
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
Title examples: feat: add user authentication | fix(auth): resolve token expiry | docs: update contributing guide
Rules: title follows convention, present tense, max 72 chars, describes the PR theme not individual commits; body has Summary, Changes (bullets), Test Plan sections. Return ONLY the JSON object, no fences.`;
  }
  return `${PR_DESCRIPTION_SYSTEM_PROMPT_BASE}
Rules: title concise present tense, describes the PR theme not individual commits; body has Summary, Changes (bullets), Test Plan sections. Return ONLY the JSON object, no fences.`;
}

const CONFLICT_RESOLUTION_SYSTEM_PROMPT = `Git merge conflict advisor. Explain each side, suggest resolution strategy. Never auto-resolve — guidance only. Be concise and actionable.`;

export const DEFAULT_OLLAMA_CLOUD_MODEL = 'gpt-oss:120b';
export const DEFAULT_OLLAMA_CLOUD_HOST = 'https://ollama.com/v1';

export interface ResolvedAIConfig {
  provider: AIProvider;
  providerLabel: string;
  model?: string;
  host?: string;
}

export function prioritizeOllamaCloudModels(
  models: string[],
  preferredModel = DEFAULT_OLLAMA_CLOUD_MODEL,
): string[] {
  const uniqueModels = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  const sortedModels = [...uniqueModels].sort((left, right) => left.localeCompare(right));

  return sortedModels.includes(preferredModel)
    ? [preferredModel, ...sortedModels.filter((model) => model !== preferredModel)]
    : sortedModels;
}

export function extractOllamaCloudModelIds(payload: unknown): string[] {
  const records =
    typeof payload === 'object' && payload !== null
      ? Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : Array.isArray((payload as { models?: unknown }).models)
          ? (payload as { models: unknown[] }).models
          : []
      : [];

  return [...new Set(records.map(getOllamaCloudModelId).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function getOllamaCloudModelId(record: unknown): string | null {
  if (typeof record !== 'object' || record === null) {
    return null;
  }

  const candidate =
    typeof (record as { id?: unknown }).id === 'string'
      ? (record as { id: string }).id
      : typeof (record as { name?: unknown }).name === 'string'
        ? (record as { name: string }).name
        : null;

  const normalized = candidate?.trim();
  return normalized ? normalized : null;
}

export async function fetchOllamaCloudModels(apiKey: string, host?: string): Promise<string[]> {
  const response = await fetch(`${normalizeOllamaCloudHost(host)}/models`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Ollama Cloud authentication failed');
    }

    throw new Error(`Ollama Cloud model lookup failed (${response.status} ${response.statusText})`);
  }

  return extractOllamaCloudModelIds(await response.json());
}

export function normalizeOllamaCloudHost(host?: string): string {
  const trimmed = (host?.trim() || DEFAULT_OLLAMA_CLOUD_HOST).replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

export function resolveAIConfig(config?: ContributeConfig | null): ResolvedAIConfig {
  const resolvedConfig = config ?? readConfig();
  const provider = resolvedConfig?.aiProvider ?? 'copilot';

  if (provider === 'ollama-cloud') {
    return {
      provider,
      providerLabel: 'Ollama Cloud',
      model: resolvedConfig?.aiModel?.trim() || DEFAULT_OLLAMA_CLOUD_MODEL,
      host: DEFAULT_OLLAMA_CLOUD_HOST,
    };
  }

  return {
    provider: 'copilot',
    providerLabel: 'GitHub Copilot',
  };
}

/** Suppress Node.js subprocess warnings once at init time. */
function suppressSubprocessWarnings(): void {
  process.env.NODE_NO_WARNINGS = '1';
}

/** Race a promise against a timeout. Rejects with a descriptive error on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Copilot request timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const COPILOT_TIMEOUT_MS = 30_000;
const COPILOT_LONG_TIMEOUT_MS = 90_000;

// ── Batch processing for large changesets ──────────────────────────

/** Thresholds for intelligent batching when many files change at once. */
export const BATCH_CONFIG = {
  /** File count above which compact diff representation is used */
  LARGE_CHANGESET_THRESHOLD: 15,
  /** File count above which grouping skips the giant single-call prompt and batches immediately */
  DIRECT_BATCH_THRESHOLD: 40,
  /** Max chars per file in compact diff mode */
  COMPACT_PER_FILE_CHARS: 300,
  /** Max total chars for compact diff payload sent to AI */
  MAX_COMPACT_PAYLOAD: 10_000,
  /** Max files to process per batch when single-call grouping fails */
  FALLBACK_BATCH_SIZE: 8,
} as const;

type GroupingProgressCallback = (message: string) => void;

function getRecoveryGroupKey(file: string): string {
  const parts = file.split('/').filter(Boolean);
  const [topLevel = '', secondLevel = ''] = parts;
  const extension = parts.at(-1)?.split('.').at(-1)?.toLowerCase() ?? '';

  if (topLevel === 'src' || topLevel === 'tests') {
    return `${topLevel}/${secondLevel || 'root'}`;
  }

  if (topLevel === 'docs' || topLevel === 'landing') {
    return topLevel;
  }

  if (!topLevel.includes('.')) {
    return topLevel || 'root';
  }

  if (extension === 'md' || extension === 'mdx') {
    return 'root-docs';
  }

  if (['json', 'yaml', 'yml', 'toml'].includes(extension)) {
    return 'root-config';
  }

  return 'root';
}

function createFallbackMessageForGroup(
  files: string[],
  key: string,
  convention: CommitConvention,
): string {
  const countLabel = files.length === 1 ? 'file' : 'files';

  if (key === 'docs' || key === 'root-docs') {
    return convention === 'conventional'
      ? `docs: update ${files.length} documentation ${countLabel}`
      : convention === 'clean-commit'
        ? `📖 docs: update ${files.length} documentation ${countLabel}`
        : `update ${files.length} documentation ${countLabel}`;
  }

  if (key.startsWith('tests/')) {
    const scope = key.split('/')[1];
    return convention === 'conventional'
      ? `test${scope && scope !== 'root' ? `(${scope})` : ''}: update ${files.length} test ${countLabel}`
      : convention === 'clean-commit'
        ? `🧪 test${scope && scope !== 'root' ? ` (${scope})` : ''}: update ${files.length} test ${countLabel}`
        : `update ${files.length} test ${countLabel}`;
  }

  if (key === 'landing') {
    return convention === 'conventional'
      ? `chore(ui): update ${files.length} landing ${countLabel}`
      : convention === 'clean-commit'
        ? `🔧 update (ui): update ${files.length} landing ${countLabel}`
        : `update ${files.length} landing ${countLabel}`;
  }

  if (key === 'root-config') {
    return convention === 'conventional'
      ? `chore(config): update ${files.length} config ${countLabel}`
      : convention === 'clean-commit'
        ? `⚙️ setup (config): update ${files.length} config ${countLabel}`
        : `update ${files.length} config ${countLabel}`;
  }

  if (key.startsWith('src/')) {
    const scope = key.split('/')[1];
    const scopeLabel = scope && scope !== 'root' ? scope : 'code';
    return convention === 'conventional'
      ? `chore(${scopeLabel}): update ${files.length} source ${countLabel}`
      : convention === 'clean-commit'
        ? `🔧 update (${scopeLabel}): update ${files.length} source ${countLabel}`
        : `update ${files.length} source ${countLabel}`;
  }

  return convention === 'conventional'
    ? `chore: update ${files.length} repo ${countLabel}`
    : convention === 'clean-commit'
      ? `☕ chore: update ${files.length} repo ${countLabel}`
      : `update ${files.length} repo ${countLabel}`;
}

export function createRecoveryCommitGroups(
  files: string[],
  convention: CommitConvention = 'clean-commit',
): CommitGroup[] {
  if (files.length === 0) {
    return [];
  }

  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const key = getRecoveryGroupKey(file);
    const entry = grouped.get(key);
    if (entry) {
      entry.push(file);
    } else {
      grouped.set(key, [file]);
    }
  }

  const result: CommitGroup[] = [];
  for (const [key, groupedFiles] of grouped.entries()) {
    for (let index = 0; index < groupedFiles.length; index += BATCH_CONFIG.FALLBACK_BATCH_SIZE) {
      const chunk = groupedFiles.slice(index, index + BATCH_CONFIG.FALLBACK_BATCH_SIZE);
      result.push({
        files: chunk,
        message: createFallbackMessageForGroup(chunk, key, convention),
      });
    }
  }

  return result;
}

function hasIncompleteDiffCoverage(files: string[], rawDiff: string): boolean {
  const diffSections = parseDiffByFile(rawDiff);
  return files.some((file) => !diffSections.has(file));
}

/**
 * Parse a raw unified diff into per-file sections.
 * Keys are file paths, values are the full diff text for that file.
 * @internal exported for testing
 */
export function parseDiffByFile(rawDiff: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headerPattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;
  const positions: { aFile: string; bFile: string; start: number }[] = [];

  for (
    let match = headerPattern.exec(rawDiff);
    match !== null;
    match = headerPattern.exec(rawDiff)
  ) {
    const aFile = match[1];
    const bFile = match[2] ?? aFile;
    positions.push({ aFile, bFile, start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const { aFile, bFile, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : rawDiff.length;
    const section = rawDiff.slice(start, end);
    sections.set(aFile, section);
    if (bFile && bFile !== aFile) {
      sections.set(bFile, section);
    }
  }

  return sections;
}

/**
 * Extract quick add/remove line counts from a per-file diff section.
 * @internal exported for testing
 */
export function extractDiffStats(diffSection: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diffSection.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { added, removed };
}

/**
 * Create a compact, budget-aware diff representation that ensures ALL files
 * get coverage. Distributes the character budget evenly across files instead
 * of blindly truncating the combined diff (which loses most files).
 * @internal exported for testing
 */
export function createCompactDiff(
  files: string[],
  rawDiff: string,
  maxTotalChars = BATCH_CONFIG.MAX_COMPACT_PAYLOAD,
): string {
  if (files.length === 0) return '';

  const diffSections = parseDiffByFile(rawDiff);
  const perFileBudget = Math.min(
    BATCH_CONFIG.COMPACT_PER_FILE_CHARS,
    Math.floor(maxTotalChars / files.length),
  );

  const parts: string[] = [];
  for (const file of files) {
    const section = diffSections.get(file);
    if (section) {
      const stats = extractDiffStats(section);
      const header = `[${file}] (+${stats.added}/-${stats.removed})`;
      if (section.length <= perFileBudget) {
        parts.push(`${header}\n${section}`);
      } else {
        // Keep diff header + first hunks within budget
        const availableForBody = perFileBudget - header.length - 20;
        if (availableForBody <= 0) {
          // Budget too small for diff body; fall back to header only
          parts.push(header);
        } else {
          const truncated = section.slice(0, availableForBody);
          parts.push(`${header}\n${truncated}\n...(truncated)`);
        }
      }
    } else {
      parts.push(`[${file}] (new/binary file — no diff available)`);
    }
  }

  const result = parts.join('\n\n');
  return result.length > maxTotalChars
    ? `${result.slice(0, maxTotalChars - 15)}\n...(truncated)`
    : result;
}

export async function checkCopilotAvailable(): Promise<string | null> {
  const aiConfig = resolveAIConfig();
  if (aiConfig.provider === 'ollama-cloud') {
    if (!(await hasOllamaCloudApiKey())) {
      return 'Ollama Cloud API key not found. Run `cn setup` to save it.';
    }

    try {
      const apiKey = await getOllamaCloudApiKey();
      if (!apiKey) {
        return 'Ollama Cloud API key not found. Run `cn setup` to save it.';
      }

      await fetchOllamaCloudModels(apiKey, aiConfig.host);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Ollama Cloud authentication failed') {
        return 'Ollama Cloud authentication failed. Update your saved API key with `cn setup`.';
      }
      if (msg.startsWith('Ollama Cloud model lookup failed')) {
        return msg.replace('model lookup', 'health check');
      }
      return `Could not reach Ollama Cloud API: ${msg}`;
    }
  }

  try {
    const client = await getManagedClient();
    try {
      await client.ping();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('auth') ||
        msg.includes('token') ||
        msg.includes('401') ||
        msg.includes('403')
      ) {
        return 'Copilot authentication failed. Run `gh auth login` to refresh your token.';
      }
      if (msg.includes('ECONNREFUSED') || msg.includes('timeout') || msg.includes('network')) {
        return 'Could not reach GitHub Copilot service. Check your internet connection.';
      }
      return `Copilot health check failed: ${msg}`;
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      return 'Copilot CLI binary not found. Ensure GitHub Copilot is installed and your gh CLI is up to date.';
    }
    return `Failed to start Copilot service: ${msg}`;
  }
}

/** Lazy singleton Copilot client — started once, reused across calls, stopped on process exit. */
let _managedClient: InstanceType<typeof CopilotClient> | null = null;
let _clientStarted = false;

async function getManagedClient(): Promise<InstanceType<typeof CopilotClient>> {
  if (!_managedClient || !_clientStarted) {
    suppressSubprocessWarnings();
    _managedClient = new CopilotClient();
    await _managedClient.start();
    _clientStarted = true;
    // Auto-cleanup on process exit
    const cleanup = () => {
      if (_managedClient && _clientStarted) {
        try {
          _managedClient.stop();
        } catch {
          // ignore
        }
        _clientStarted = false;
        _managedClient = null;
      }
    };
    process.once('exit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }
  return _managedClient;
}

async function callCopilot(
  systemMessage: string,
  userMessage: string,
  model?: string,
  timeoutMs = COPILOT_TIMEOUT_MS,
): Promise<string | null> {
  const client = await getManagedClient();
  const sessionConfig: Record<string, unknown> = {
    systemMessage: { mode: 'replace', content: systemMessage },
  };
  if (model) sessionConfig.model = model;
  const session = await client.createSession(sessionConfig);
  try {
    const response = await withTimeout(session.sendAndWait({ prompt: userMessage }), timeoutMs);
    if (!response?.data?.content) return null;
    return response.data.content;
  } finally {
    await session.destroy();
  }
}

async function callOllamaCloud(
  systemMessage: string,
  userMessage: string,
  model?: string,
  timeoutMs = COPILOT_TIMEOUT_MS,
): Promise<string | null> {
  const aiConfig = resolveAIConfig();
  const apiKey = await getOllamaCloudApiKey();
  if (!apiKey) {
    throw new Error('Ollama Cloud API key is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${aiConfig.host}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model?.trim() || aiConfig.model || DEFAULT_OLLAMA_CLOUD_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error('Ollama Cloud authentication failed');
      }
      throw new Error(
        `Ollama Cloud request failed (${response.status} ${response.statusText}): ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() || null;
  } finally {
    clearTimeout(timer);
  }
}

async function callAI(
  systemMessage: string,
  userMessage: string,
  model?: string,
  timeoutMs = COPILOT_TIMEOUT_MS,
): Promise<string | null> {
  const aiConfig = resolveAIConfig();
  if (aiConfig.provider === 'ollama-cloud') {
    return callOllamaCloud(systemMessage, userMessage, model, timeoutMs);
  }

  return callCopilot(systemMessage, userMessage, model, timeoutMs);
}

function getCommitSystemPrompt(convention: CommitConvention): string {
  if (convention === 'conventional') return CONVENTIONAL_COMMIT_SYSTEM_PROMPT;
  // Default to Clean Commit for both 'clean-commit' and 'none'
  return CLEAN_COMMIT_SYSTEM_PROMPT;
}

/**
 * Extract a JSON array or object from an AI response that may contain
 * preamble text, markdown fences, or trailing commentary.
 */
function extractJson(raw: string): string {
  // Strip markdown code fences first
  let text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // If it already starts with [ or {, try it as-is
  if (text.startsWith('[') || text.startsWith('{')) return text;

  // Find the first [ or { and the matching last ] or }
  const arrayStart = text.indexOf('[');
  const objStart = text.indexOf('{');

  let start: number;
  let closeChar: string;
  if (arrayStart === -1 && objStart === -1) return text;
  if (arrayStart === -1) {
    start = objStart;
    closeChar = '}';
  } else if (objStart === -1) {
    start = arrayStart;
    closeChar = ']';
  } else if (arrayStart < objStart) {
    start = arrayStart;
    closeChar = ']';
  } else {
    start = objStart;
    closeChar = '}';
  }

  const end = text.lastIndexOf(closeChar);
  if (end > start) {
    text = text.slice(start, end + 1);
  }
  return text;
}

export function sanitizeGeneratedCommitMessage(message: string): string {
  return message.replace(/`+/g, '').replace(/\s+/g, ' ').trim();
}

export async function generateCommitMessage(
  diff: string,
  stagedFiles: string[],
  model?: string,
  convention: CommitConvention = 'clean-commit',
  context?: 'squash-merge',
): Promise<string | null> {
  try {
    const isLarge = stagedFiles.length >= BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD;
    const hasMissingDiffCoverage = hasIncompleteDiffCoverage(stagedFiles, diff);
    const multiFileHint =
      stagedFiles.length > 1
        ? '\n\nIMPORTANT: Multiple files are staged. Generate ONE commit message that captures the high-level purpose of ALL changes together. Focus on the overall intent, not individual file changes. Be specific but concise — do not list every file.'
        : '';

    const squashHint =
      context === 'squash-merge'
        ? '\n\nCONTEXT: This is a squash merge of an entire feature branch into the base branch. All commits are being combined into ONE single commit. Generate a single high-level summary that describes the overall feature or change — NOT a list of individual commits. Think: what capability was added or what problem was solved? Be specific but concise.'
        : '';

    // Use compact representation for large changesets so ALL files get coverage
    const diffContent =
      isLarge || hasMissingDiffCoverage
        ? createCompactDiff(stagedFiles, diff)
        : diff.slice(0, 4000);

    const userMessage = `Generate a commit message for these staged changes:\n\nFiles (${stagedFiles.length}): ${stagedFiles.join(', ')}\n\nDiff:\n${diffContent}${multiFileHint}${squashHint}`;
    const result = await callAI(
      getCommitSystemPrompt(convention),
      userMessage,
      model,
      isLarge ? COPILOT_LONG_TIMEOUT_MS : COPILOT_TIMEOUT_MS,
    );
    return result ? sanitizeGeneratedCommitMessage(result) : null;
  } catch {
    return null;
  }
}

export async function generatePRDescription(
  commits: string[],
  diff: string,
  model?: string,
  convention: CommitConvention = 'clean-commit',
): Promise<{ title: string; body: string } | null> {
  try {
    const userMessage = `Generate a PR description for these changes:\n\nCommits:\n${commits.join('\n')}\n\nDiff (truncated):\n${diff.slice(0, 4000)}`;
    const result = await callAI(getPRDescriptionSystemPrompt(convention), userMessage, model);
    if (!result) return null;
    const cleaned = extractJson(result);
    return JSON.parse(cleaned) as { title: string; body: string };
  } catch {
    return null;
  }
}

export async function suggestBranchName(
  description: string,
  model?: string,
): Promise<string | null> {
  try {
    const result = await callAI(BRANCH_NAME_SYSTEM_PROMPT, description, model);
    const trimmed = result?.trim() ?? null;
    // Validate it looks like an actual branch name, not a conversational response
    if (trimmed && /^[a-z]+\/[a-z0-9-]+$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function suggestConflictResolution(
  conflictDiff: string,
  model?: string,
): Promise<string | null> {
  try {
    const userMessage = `Help me resolve this merge conflict:\n\n${conflictDiff.slice(0, 4000)}`;
    const result = await callAI(CONFLICT_RESOLUTION_SYSTEM_PROMPT, userMessage, model);
    return result?.trim() ?? null;
  } catch {
    return null;
  }
}

export interface CommitGroup {
  files: string[];
  message: string;
}

export interface NormalizedCommitGroups {
  groups: CommitGroup[];
  unknownFiles: string[];
  duplicateFiles: string[];
  unassignedFiles: string[];
}

export function normalizeCommitGroups(
  changedFiles: string[],
  groups: CommitGroup[],
): NormalizedCommitGroups {
  const changedSet = new Set(changedFiles);
  const assignedFiles = new Set<string>();
  const unknownFiles = new Set<string>();
  const duplicateFiles = new Set<string>();

  const normalizedGroups = groups
    .map((group) => {
      const uniqueFiles = new Set<string>();
      const files: string[] = [];

      for (const file of group.files) {
        if (!changedSet.has(file)) {
          unknownFiles.add(file);
          continue;
        }

        if (uniqueFiles.has(file) || assignedFiles.has(file)) {
          duplicateFiles.add(file);
          continue;
        }

        uniqueFiles.add(file);
        assignedFiles.add(file);
        files.push(file);
      }

      return {
        ...group,
        files,
      };
    })
    .filter((group) => group.files.length > 0);

  const unassignedFiles = changedFiles.filter((file) => !assignedFiles.has(file));

  return {
    groups: normalizedGroups,
    unknownFiles: [...unknownFiles],
    duplicateFiles: [...duplicateFiles],
    unassignedFiles,
  };
}

export async function generateCommitGroups(
  files: string[],
  diffs: string,
  model?: string,
  convention: CommitConvention = 'clean-commit',
  onProgress?: GroupingProgressCallback,
): Promise<CommitGroup[]> {
  const isLarge = files.length >= BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD;
  const shouldBatchImmediately = files.length >= BATCH_CONFIG.DIRECT_BATCH_THRESHOLD;
  const hasMissingDiffCoverage = hasIncompleteDiffCoverage(files, diffs);

  if (shouldBatchImmediately) {
    onProgress?.(
      `Large changeset detected. Grouping in focused batches of ${BATCH_CONFIG.FALLBACK_BATCH_SIZE} files...`,
    );
    return generateCommitGroupsInBatches(files, diffs, model, convention, onProgress);
  }

  // Use compact diff to ensure ALL files get representation in the prompt
  const diffContent =
    isLarge || hasMissingDiffCoverage ? createCompactDiff(files, diffs) : diffs.slice(0, 6000);

  const largeHint = isLarge
    ? `\n\nNOTE: This is a large changeset (${files.length} files). Compact diffs are provided for every file. Focus on creating well-organized logical groups.`
    : '';

  const userMessage = `Group these changed files into logical atomic commits:\n\nFiles:\n${files.join('\n')}\n\nDiffs:\n${diffContent}${largeHint}`;
  let result: string | null = null;
  try {
    onProgress?.(`Analyzing ${files.length} files together before batching fallback...`);
    result = await callAI(
      getGroupingSystemPrompt(convention),
      userMessage,
      model,
      COPILOT_LONG_TIMEOUT_MS,
    );
  } catch {
    if (isLarge) {
      onProgress?.(
        `Initial grouping timed out. Switching to focused batches of ${BATCH_CONFIG.FALLBACK_BATCH_SIZE} files...`,
      );
      return generateCommitGroupsInBatches(files, diffs, model, convention, onProgress);
    }
    throw new Error('AI grouping failed before a response was returned');
  }
  if (!result) {
    // For large changesets, fall back to batch processing before giving up
    if (isLarge) {
      onProgress?.(`AI returned an empty response. Switching to focused batches...`);
      return generateCommitGroupsInBatches(files, diffs, model, convention, onProgress);
    }
    throw new Error('AI returned an empty response');
  }
  const cleaned = extractJson(result);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    if (isLarge) {
      onProgress?.(
        'AI returned invalid JSON for the full changeset. Switching to focused batches...',
      );
      return generateCommitGroupsInBatches(files, diffs, model, convention, onProgress);
    }
    throw new Error(`AI response is not valid JSON. Raw start: "${result.slice(0, 120)}..."`);
  }
  const groups = parsed as CommitGroup[];
  if (!Array.isArray(groups) || groups.length === 0) {
    if (isLarge) {
      onProgress?.(
        'AI returned no usable groups for the full changeset. Switching to focused batches...',
      );
      return generateCommitGroupsInBatches(files, diffs, model, convention, onProgress);
    }
    throw new Error('AI response was not a valid JSON array of commit groups');
  }
  for (const group of groups) {
    if (!Array.isArray(group.files) || typeof group.message !== 'string') {
      throw new Error('AI returned groups with invalid structure (missing files or message)');
    }
  }
  return groups.map((group) => ({
    ...group,
    message: sanitizeGeneratedCommitMessage(group.message),
  }));
}

/**
 * Fallback: split files into smaller batches and group each batch independently.
 * Used automatically when a single-call grouping attempt fails for large changesets.
 *
 * Each batch gets its own focused diffs so the AI sees meaningful context per file,
 * avoiding the token-limit issues that caused the initial failure.
 */
async function generateCommitGroupsInBatches(
  files: string[],
  diffs: string,
  model?: string,
  convention: CommitConvention = 'clean-commit',
  onProgress?: GroupingProgressCallback,
): Promise<CommitGroup[]> {
  const batchSize = BATCH_CONFIG.FALLBACK_BATCH_SIZE;
  const allGroups: CommitGroup[] = [];
  const diffSections = parseDiffByFile(diffs);
  const totalBatches = Math.ceil(files.length / batchSize);

  for (let i = 0; i < files.length; i += batchSize) {
    const batchFiles = files.slice(i, i + batchSize);

    // Build a focused diff containing only this batch's files
    const batchDiff = batchFiles
      .map((f) => diffSections.get(f) ?? '')
      .filter(Boolean)
      .join('\n');

    const batchDiffContent =
      batchFiles.length >= BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD ||
      hasIncompleteDiffCoverage(batchFiles, batchDiff)
        ? createCompactDiff(batchFiles, batchDiff)
        : batchDiff.slice(0, 6000);

    const batchNum = Math.floor(i / batchSize) + 1;
    onProgress?.(`Grouping batch ${batchNum}/${totalBatches} (${batchFiles.length} files)...`);

    const userMessage = `Group these changed files into logical atomic commits:\n\nFiles:\n${batchFiles.join('\n')}\n\nDiffs:\n${batchDiffContent}\n\nNOTE: Processing batch ${batchNum}/${totalBatches} of a large changeset. Group only the files listed above.`;

    try {
      const result = await callAI(
        getGroupingSystemPrompt(convention),
        userMessage,
        model,
        COPILOT_LONG_TIMEOUT_MS,
      );
      if (!result) continue;

      const cleaned = extractJson(result);
      const parsed = JSON.parse(cleaned) as CommitGroup[];
      if (Array.isArray(parsed)) {
        for (const group of parsed) {
          if (Array.isArray(group.files) && typeof group.message === 'string') {
            // Constrain files to only those in the current batch to prevent cross-batch leakage
            const batchFileSet = new Set(batchFiles);
            const filteredFiles = group.files.filter((f) => batchFileSet.has(f));
            if (filteredFiles.length > 0) {
              allGroups.push({
                ...group,
                files: filteredFiles,
                message: sanitizeGeneratedCommitMessage(group.message),
              });
            }
          }
        }
      }
    } catch {
      // Skip failed batches — remaining batches may still succeed
    }
  }

  // Detect ungrouped files and auto-resolve them into smaller deterministic groups.
  const groupedFiles = new Set(allGroups.flatMap((g) => g.files));
  const ungrouped = files.filter((f) => !groupedFiles.has(f));
  if (ungrouped.length > 0) {
    allGroups.push(...createRecoveryCommitGroups(ungrouped, convention));
  }

  if (allGroups.length === 0) {
    throw new Error('AI could not group any files even with batch processing');
  }

  return allGroups;
}

/**
 * Regenerate commit messages for all groups while keeping file groupings intact.
 * Returns a new array of CommitGroups with updated messages.
 */
export async function regenerateAllGroupMessages(
  groups: CommitGroup[],
  diffs: string,
  model?: string,
  convention: CommitConvention = 'clean-commit',
): Promise<CommitGroup[]> {
  const totalFiles = groups.reduce((sum, g) => sum + g.files.length, 0);
  const isLarge = totalFiles >= BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD;

  const diffContent = isLarge
    ? createCompactDiff(
        groups.flatMap((g) => g.files),
        diffs,
      )
    : diffs.slice(0, 6000);

  const groupSummary = groups.map((g, i) => `Group ${i + 1}: [${g.files.join(', ')}]`).join('\n');
  const userMessage = `Regenerate ONLY the commit messages for these pre-defined file groups. Do NOT change the file groupings.\n\nGroups:\n${groupSummary}\n\nDiffs:\n${diffContent}`;
  const result = await callAI(
    getGroupingSystemPrompt(convention),
    userMessage,
    model,
    COPILOT_LONG_TIMEOUT_MS,
  );
  if (!result) return groups;
  try {
    const cleaned = extractJson(result);
    const parsed = JSON.parse(cleaned) as CommitGroup[];
    if (!Array.isArray(parsed) || parsed.length !== groups.length) return groups;
    // Preserve original file groupings, only take new messages
    return groups.map((g, i) => ({
      files: g.files,
      message:
        typeof parsed[i]?.message === 'string'
          ? sanitizeGeneratedCommitMessage(parsed[i].message)
          : g.message,
    }));
  } catch {
    return groups;
  }
}

/**
 * Regenerate a commit message for a single group of files.
 */
export async function regenerateGroupMessage(
  files: string[],
  diffs: string,
  model?: string,
  convention: CommitConvention = 'clean-commit',
): Promise<string | null> {
  try {
    const isLarge = files.length >= BATCH_CONFIG.LARGE_CHANGESET_THRESHOLD;
    const diffContent = isLarge ? createCompactDiff(files, diffs) : diffs.slice(0, 4000);

    const userMessage = `Generate a single commit message for these files:\n\nFiles: ${files.join(', ')}\n\nDiff:\n${diffContent}`;
    const result = await callAI(getCommitSystemPrompt(convention), userMessage, model);
    return result ? sanitizeGeneratedCommitMessage(result) : null;
  } catch {
    return null;
  }
}
