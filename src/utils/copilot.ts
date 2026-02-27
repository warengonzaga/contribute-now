import { CopilotClient } from '@github/copilot-sdk';
import type { CommitConvention } from '../types.js';

const CONVENTIONAL_COMMIT_SYSTEM_PROMPT = `You are a git commit message generator. Generate a Conventional Commit message following this exact format:
<type>[!][(<scope>)]: <description>

Types:
feat     – a new feature
fix      – a bug fix
docs     – documentation only changes
style    – changes that do not affect code meaning (whitespace, formatting)
refactor – code change that neither fixes a bug nor adds a feature
perf     – performance improvement
test     – adding or correcting tests
build    – changes to the build system or external dependencies
ci       – changes to CI configuration files and scripts
chore    – other changes that don't modify src or test files
revert   – reverts a previous commit

Rules:
- Breaking change (!) only for: feat, fix, refactor, perf
- Description: concise, imperative mood, max 72 chars, lowercase start
- Scope: optional, camelCase or kebab-case component name
- Return ONLY the commit message line, nothing else

Examples:
feat: add user authentication system
fix(auth): resolve token expiry issue
docs: update contributing guidelines
feat!: redesign authentication API`;

const CLEAN_COMMIT_SYSTEM_PROMPT = `You are a git commit message generator. Generate a Clean Commit message following this EXACT format:
<emoji> <type>[!][ (<scope>)]: <description>

CRITICAL spacing rules (must follow exactly):
- There MUST be a space between the emoji and the type
- If a scope is used, there MUST be a space before the opening parenthesis
- There MUST be a colon and a space after the type or scope before the description
- Pattern: EMOJI SPACE TYPE SPACE OPENPAREN SCOPE CLOSEPAREN COLON SPACE DESCRIPTION

Emoji and type table:
📦 new      – new features, files, or capabilities
🔧 update   – changes, refactoring, improvements
🗑️ remove   – removing code, files, or dependencies
🔒 security – security fixes or patches
⚙️ setup    – configs, CI/CD, tooling, build systems
☕ chore    – maintenance, dependency updates
🧪 test     – adding or updating tests
📖 docs     – documentation changes
🚀 release  – version releases

Rules:
- Breaking change (!) only for: new, update, remove, security
- Description: concise, imperative mood, max 72 chars, lowercase start
- Scope: optional, camelCase or kebab-case component name
- Return ONLY the commit message line, nothing else

Correct examples:
📦 new: add user authentication system
🔧 update (api): improve error handling
⚙️ setup (ci): configure github actions workflow
📦 new!: redesign authentication system
🗑️ remove (deps): drop unused lodash dependency

WRONG (never do this):
⚙️setup(ci): ... ← missing spaces
📦new: ... ← missing space after emoji
🔧 update(api): ... ← missing space before scope`;

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
- Order groups so foundational changes come first (types, utils) and consumers come after
- Return ONLY the JSON array, nothing else`;
}

const BRANCH_NAME_SYSTEM_PROMPT = `You are a git branch name generator. Convert natural language descriptions into proper git branch names.

Format: <prefix>/<kebab-case-name>
Prefixes: feature, fix, docs, chore, test, refactor

Rules:
- Use lowercase kebab-case for the name part
- Keep it short and descriptive (2-5 words max)
- Return ONLY the branch name, nothing else

Examples:
Input: "fix the login timeout bug" → fix/login-timeout
Input: "add user profile page" → feature/user-profile-page
Input: "update readme documentation" → docs/update-readme`;

const PR_DESCRIPTION_SYSTEM_PROMPT = `You are a GitHub pull request description generator. Create a clear, structured PR description.

Return a JSON object with this exact structure:
{
  "title": "Brief PR title (50 chars max)",
  "body": "## Summary\\n...\\n\\n## Changes\\n...\\n\\n## Test Plan\\n..."
}

Rules:
- title: concise, present tense, describes what the PR does
- body: markdown with Summary, Changes (bullet list), and Test Plan sections
- Return ONLY the JSON object, no markdown fences, no extra text`;

const CONFLICT_RESOLUTION_SYSTEM_PROMPT = `You are a git merge conflict resolution advisor. Analyze the conflict markers and provide guidance.

Rules:
- Explain what each side of the conflict contains
- Suggest the most likely correct resolution strategy
- Never auto-resolve — provide guidance only
- Be concise and actionable`;

function suppressSubprocessWarnings(): string | undefined {
  const prev = process.env.NODE_NO_WARNINGS;
  process.env.NODE_NO_WARNINGS = '1';
  return prev;
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

function restoreWarnings(prev: string | undefined): void {
  if (prev === undefined) {
    delete process.env.NODE_NO_WARNINGS;
  } else {
    process.env.NODE_NO_WARNINGS = prev;
  }
}

export async function checkCopilotAvailable(): Promise<string | null> {
  const prev = suppressSubprocessWarnings();
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
  } finally {
    restoreWarnings(prev);
  }
}

/** Lazy singleton Copilot client — started once, reused across calls, stopped on process exit. */
let _managedClient: InstanceType<typeof CopilotClient> | null = null;
let _clientStarted = false;

async function getManagedClient(): Promise<InstanceType<typeof CopilotClient>> {
  if (!_managedClient || !_clientStarted) {
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
  const prev = suppressSubprocessWarnings();
  try {
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
  } finally {
    restoreWarnings(prev);
  }
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

export async function generateCommitMessage(
  diff: string,
  stagedFiles: string[],
  model?: string,
  convention: CommitConvention = 'clean-commit',
): Promise<string | null> {
  try {
    const userMessage = `Generate a commit message for these staged changes:\n\nFiles: ${stagedFiles.join(', ')}\n\nDiff:\n${diff.slice(0, 4000)}`;
    const result = await callCopilot(getCommitSystemPrompt(convention), userMessage, model);
    return result?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function generatePRDescription(
  commits: string[],
  diff: string,
  model?: string,
): Promise<{ title: string; body: string } | null> {
  try {
    const userMessage = `Generate a PR description for these changes:\n\nCommits:\n${commits.join('\n')}\n\nDiff (truncated):\n${diff.slice(0, 4000)}`;
    const result = await callCopilot(PR_DESCRIPTION_SYSTEM_PROMPT, userMessage, model);
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
    const result = await callCopilot(BRANCH_NAME_SYSTEM_PROMPT, description, model);
    return result?.trim() ?? null;
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
    const result = await callCopilot(CONFLICT_RESOLUTION_SYSTEM_PROMPT, userMessage, model);
    return result?.trim() ?? null;
  } catch {
    return null;
  }
}

export interface CommitGroup {
  files: string[];
  message: string;
}

export async function generateCommitGroups(
  files: string[],
  diffs: string,
  model?: string,
  convention: CommitConvention = 'clean-commit',
): Promise<CommitGroup[]> {
  const userMessage = `Group these changed files into logical atomic commits:\n\nFiles:\n${files.join('\n')}\n\nDiffs (truncated):\n${diffs.slice(0, 6000)}`;
  const result = await callCopilot(
    getGroupingSystemPrompt(convention),
    userMessage,
    model,
    COPILOT_LONG_TIMEOUT_MS,
  );
  if (!result) {
    throw new Error('AI returned an empty response');
  }
  const cleaned = extractJson(result);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI response is not valid JSON. Raw start: "${result.slice(0, 120)}..."`);
  }
  const groups = parsed as CommitGroup[];
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('AI response was not a valid JSON array of commit groups');
  }
  for (const group of groups) {
    if (!Array.isArray(group.files) || typeof group.message !== 'string') {
      throw new Error('AI returned groups with invalid structure (missing files or message)');
    }
  }
  return groups;
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
  const groupSummary = groups.map((g, i) => `Group ${i + 1}: [${g.files.join(', ')}]`).join('\n');
  const userMessage = `Regenerate ONLY the commit messages for these pre-defined file groups. Do NOT change the file groupings.\n\nGroups:\n${groupSummary}\n\nDiffs (truncated):\n${diffs.slice(0, 6000)}`;
  const result = await callCopilot(
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
      message: typeof parsed[i]?.message === 'string' ? parsed[i].message : g.message,
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
    const userMessage = `Generate a single commit message for these files:\n\nFiles: ${files.join(', ')}\n\nDiff:\n${diffs.slice(0, 4000)}`;
    const result = await callCopilot(getCommitSystemPrompt(convention), userMessage, model);
    return result?.trim() ?? null;
  } catch {
    return null;
  }
}
