---
applyTo: "**"
---

# Clean Commit Workflow

This repository follows the **Clean Commit** workflow for all commit messages.

Reference: https://github.com/wgtechlabs/clean-commit

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
