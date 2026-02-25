# Contributing to contribute-now 🤝

Thanks for your interest in contributing to **contribute-now**! This project exists to make git workflows easier for everyone — contributions that improve that mission are always welcome.

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Git](https://git-scm.com/)
- A [GitHub](https://github.com/) account

## Setup

```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/contribute-now.git
cd contribute-now
git remote add upstream https://github.com/warengonzaga/contribute-now.git
bun install
```

## Development

```bash
# Run the CLI locally
bun src/index.ts --help

# Build for production
bun run build

# Run tests
bun test

# Lint
bun run lint
bun run lint:fix
```

## Development Workflow

1. **Create an issue first** — describe what you want to work on before writing code.
2. **Sync your fork** — keep your fork current:
   ```bash
   contrib sync   # if you have contribute-now installed
   # or manually:
   git fetch upstream && git reset --hard upstream/dev
   ```
3. **Create a branch** from `dev` using one of these prefixes:
   - `feature/*` — new functionality
   - `fix/*` — bug fixes
   - `docs/*` — documentation changes
   - `chore/*` — maintenance, dependency updates
   - `test/*` — adding or updating tests
   - `refactor/*` — code restructuring without behavior changes
4. **Make your changes** — write code, add tests, update docs as needed.
5. **Verify locally**:
   ```bash
   bun run build   # ensure it compiles
   bun test        # ensure tests pass
   bun run lint    # ensure no lint errors
   ```
6. **Submit a PR** targeting the **`dev`** branch (never `main`).

## Commit Convention

This project follows the **[Clean Commit](https://github.com/wgtechlabs/clean-commit)** convention by [@wgtechlabs](https://github.com/wgtechlabs). Every commit must follow this format:

```
<emoji> <type>[!][(<scope>)]: <description>
```

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

**Rules:**

- Use lowercase for type
- Use `!` immediately after type (no space) to signal a breaking change — only allowed for `new`, `update`, `remove`, `security`
- Use present tense ("add" not "added")
- No period at the end
- Keep description under 72 characters

**Examples:**

```
📦 new (start): add AI branch name suggestion
🔧 update (sync): improve force-with-lease error message
🧪 test (config): add round-trip tests for writeConfig
📖 docs: update contributing guide
⚙️ setup (ci): add github actions workflow
```

> A Husky commit-msg hook enforces this format automatically. Invalid commits are rejected with a helpful error message.

## Pull Requests

### Before Submitting

- [ ] An issue exists and is referenced in the PR description (e.g., `Closes #42`)
- [ ] PR targets the **`dev`** branch
- [ ] All commits follow the [Clean Commit](https://github.com/wgtechlabs/clean-commit) convention
- [ ] `bun run build` succeeds
- [ ] `bun test` passes
- [ ] `bun run lint` passes
- [ ] Documentation updated (if applicable)

### PR Description

Include a clear summary of what changed and why. Reference the issue number.

### Review Process

- A maintainer will review your PR and may request changes.
- Please respond to feedback promptly — stale PRs may be closed after 30 days of inactivity.
- Once approved, a maintainer will merge your PR into `dev`.

## Writing Tests

Tests live in `tests/`. We use [Bun's built-in test runner](https://bun.sh/docs/cli/test).

```bash
bun test               # run all tests
bun test --watch       # watch mode
```

When contributing code, please:

- Add tests for new features and bug fixes.
- Keep tests focused — one behavior per test.
- Use descriptive test names that explain *what* is being tested.

## Code Style

- **TypeScript** with strict typing — avoid `any`.
- **Biome** handles formatting and linting (single quotes, semicolons, 2-space indent, 100 line width).
- Follow existing patterns and conventions in the codebase.
- Keep functions small and focused.
- Handle errors gracefully — don't swallow exceptions silently.

## Reporting Bugs

[Open a new issue](https://github.com/warengonzaga/contribute-now/issues/new) and include:

- A clear, descriptive title.
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Your environment (OS, Bun version, Git version).
- Relevant logs or error messages.

Please search [existing issues](https://github.com/warengonzaga/contribute-now/issues) first to avoid duplicates.

## Suggesting Features

Feature ideas are welcome! [Open an issue](https://github.com/warengonzaga/contribute-now/issues/new) with:

- A clear description of the problem the feature solves.
- Your proposed solution or approach.
- Any alternatives you've considered.

## License

By contributing, you agree that your contributions will be licensed under the [GPL-3.0 License](LICENSE).

---

💻💖☕ Thanks for helping make git workflows easier for everyone!
