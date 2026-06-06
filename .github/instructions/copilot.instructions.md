---
applyTo: "**"
---

# Clean Commit Workflow

This repository follows the **Clean Commit** workflow for all commit messages.

Reference: https://github.com/wgtechlabs/clean-commit

## Copilot Enforcement

**Every commit Copilot creates** — including fix-up commits, merge commits, and conflict resolution commits — must follow the Clean Commit format. Plain messages like `fix: address PR review comments` (Conventional Commits style) or `Merge origin/main into dev` (plain merge) are **not acceptable**.

Correct equivalents:

- `fix: address PR review comments` → `🔧 update: address PR review comments`
- `Merge origin/main into dev` → `⚙️ setup: merge origin/main into dev`

Never use plain messages like `"Initial commit"`, `"WIP"`, or default merge messages — always use the Clean Commit format.

## Commit Message Format

```text
<emoji> <type>: <description>
<emoji> <type> (<scope>): <description>
<emoji> <type>!: <description>
<emoji> <type>! (<scope>): <description>
```

## The 9 Types

| Emoji | Type | What it covers |
|:-----:|------|----------------|
| 📦 | `new` | Adding new features, files, or capabilities |
| 🔧 | `update` | Changing existing code, refactoring, improvements |
| 🗑️ | `remove` | Removing code, files, features, or dependencies |
| 🔒 | `security` | Security fixes, patches, vulnerability resolutions |
| ⚙️ | `setup` | Project configs, CI/CD, tooling, build systems |
| ☕ | `chore` | Maintenance tasks, dependency updates, housekeeping |
| 🧪 | `test` | Adding, updating, or fixing tests |
| 📖 | `docs` | Documentation changes and updates |
| 🚀 | `release` | Version releases and release preparation |

## Rules

- Use lowercase for type
- Use `!` immediately after type (no space) to signal a breaking change — only for `new`, `update`, `remove`, `security`
- Use present tense ("add" not "added")
- No period at the end
- Keep description under 72 characters

## Scopes (common in this project)

- `(setup)`, `(sync)`, `(start)`, `(commit)`, `(update)`, `(submit)`, `(clean)`, `(status)` — CLI commands
- `(git)`, `(gh)`, `(copilot)`, `(config)`, `(branch)`, `(remote)` — utilities
- `(ui)` — banner and display
- `(ci)` — CI/CD and build tooling

## Examples

- `📦 new (start): add AI branch name suggestion`
- `🔧 update (sync): improve force-with-lease error message`
- `🗑️ remove (copilot): drop unused model parameter`
- `🔒 security: sanitize branch name input`
- `⚙️ setup (ci): add github actions workflow`
- `☕ chore: update dependencies`
- `🧪 test (config): add round-trip tests for writeConfig`
- `📖 docs: update contributing guide`
- `🚀 release: version 1.0.0`
- `📦 new!: redesign config file format`
- `🔧 update! (sync): change default branch from master to main`

## PR Title Convention

PR titles must also follow the Clean Commit format, exactly like commit messages:

```text
<emoji> <type>[!][(<scope>)]: <description>
```

Examples:

- `📖 docs: add WSL2 SSH agent setup guide`
- `🔧 update (ci): improve publish verification step`
- `📦 new (start): add AI branch name suggestion`

PR titles must **not** use Conventional Commits style (e.g., `fix:`, `feat:`) or plain English titles.

## Branch Naming Convention (Clean Flow)

This project follows the **Clean Flow** branch naming convention.

Reference: https://github.com/nicedoc/clean-flow

### Format

```text
<prefix>/<kebab-case-description>
```

### Valid Prefixes

`feature`, `fix`, `docs`, `chore`, `test`, `refactor`

### Examples

- `feature/user-auth`
- `fix/login-timeout`
- `docs/update-readme`
- `chore/update-dependencies`

### Rules

- Always lowercase and kebab-case
- 2–5 words after the prefix
- No punctuation or special characters

## Clean Flow Workflow Rules

This project uses **Clean Flow**: `main` + `dev` + feature branches.

Reference: https://github.com/nicedoc/clean-flow

- All PRs must target the **`dev`** branch — never `main` directly
- Feature branches are created from `dev`
- `dev` is merged into `main` only via a release PR
- When resolving merge conflicts or syncing, merge/rebase from `origin/dev` (not `origin/main`) unless explicitly instructed otherwise

## Label Convention

When Copilot suggests or applies labels, use the project's existing label set. Labels follow a clean, lowercase, hyphenated naming style.

### Common Label Categories

- **Type labels:** `bug`, `enhancement`, `documentation`, `chore`, `test`, `security`
- **Status labels:** `needs-review`, `in-progress`, `blocked`, `ready-to-merge`
- **Priority labels:** `priority: high`, `priority: low`
- **Scope labels** (matching CLI commands): `scope: setup`, `scope: sync`, `scope: start`, `scope: commit`, `scope: submit`, `scope: clean`, `scope: status`

### Rules

- Never create new labels that don't follow the lowercase hyphenated convention
- Only apply labels that already exist in the repository's label set
