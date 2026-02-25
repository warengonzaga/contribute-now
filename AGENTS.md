# Clean Commit Workflow

When generating commit messages for this repository, follow the **Clean Commit** workflow.

Reference: https://github.com/wgtechlabs/clean-commit

## Format

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

- **Every single commit** must follow this format — including the very first commit (e.g. initial plan, scaffold, or setup)
- Never use plain messages like `"Initial commit"` or `"WIP"` — always use the Clean Commit format
- Use lowercase for type
- Use `!` immediately after type (no space) to signal a breaking change — only for `new`, `update`, `remove`, `security`
- Use present tense ("add" not "added")
- No period at the end
- Keep description under 72 characters

## Scopes (common in this project)

Use a scope to clarify which part of the CLI is affected:

- `(setup)` — contrib setup command
- `(sync)` — contrib sync command
- `(start)` — contrib start command
- `(commit)` — contrib commit command
- `(update)` — contrib update command
- `(submit)` — contrib submit command
- `(clean)` — contrib clean command
- `(status)` — contrib status command
- `(git)` — git utility
- `(gh)` — GitHub CLI utility
- `(copilot)` — Copilot SDK integration
- `(config)` — config read/write
- `(branch)` — branch utilities
- `(remote)` — remote detection utilities
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
