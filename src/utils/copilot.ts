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

function restoreWarnings(prev: string | undefined): void {
  if (prev === undefined) {
    delete process.env.NODE_NO_WARNINGS;
  } else {
    process.env.NODE_NO_WARNINGS = prev;
  }
}

export async function checkCopilotAvailable(): Promise<string | null> {
  let client: InstanceType<typeof CopilotClient> | null = null;
  const prev = suppressSubprocessWarnings();
  try {
    client = new CopilotClient();
    await client.start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      return 'Copilot CLI binary not found. Ensure GitHub Copilot is installed and your gh CLI is up to date.';
    }
    return `Failed to start Copilot service: ${msg}`;
  }
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
  } finally {
    restoreWarnings(prev);
    try {
      await client.stop();
    } catch {
      // ignore cleanup errors
    }
  }
  return null;
}

async function callCopilot(
  systemMessage: string,
  userMessage: string,
  model?: string,
): Promise<string | null> {
  const prev = suppressSubprocessWarnings();
  const client = new CopilotClient();
  await client.start();
  try {
    const sessionConfig: Record<string, unknown> = {
      systemMessage: { mode: 'replace', content: systemMessage },
    };
    if (model) sessionConfig.model = model;
    const session = await client.createSession(sessionConfig);
    try {
      const response = await session.sendAndWait({ prompt: userMessage });
      if (!response?.data?.content) return null;
      return response.data.content;
    } finally {
      await session.destroy();
    }
  } finally {
    restoreWarnings(prev);
    await client.stop();
  }
}

function getCommitSystemPrompt(convention: CommitConvention): string {
  if (convention === 'conventional') return CONVENTIONAL_COMMIT_SYSTEM_PROMPT;
  // Default to Clean Commit for both 'clean-commit' and 'none'
  return CLEAN_COMMIT_SYSTEM_PROMPT;
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
    const cleaned = result
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
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
