# contribute-now

![GitHub Repo Banner](https://ghrb.waren.build/banner?header=contribute-now+%F0%9F%94%84&subheader=Any+workflow.+Clean+commits.+Zero+friction.&bg=0D1117-21262D&color=FFFFFF&headerfont=Google+Sans+Code&subheaderfont=Sour+Gummy&support=true)
<!-- Created with GitHub Repo Banner by Waren Gonzaga: https://ghrb.waren.build -->

**contribute-now** is a developer CLI that automates git workflows — branching, syncing, staging, committing, and opening PRs — so you can focus on shipping, not on memorizing git commands.

It natively supports multiple workflow models and commit conventions, with AI-powered assistance throughout.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![npm version](https://img.shields.io/npm/v/contribute-now.svg)](https://www.npmjs.com/package/contribute-now)

---

## Workflow Modes

Pick the model that matches your project during `contrib setup`. contribute-now adapts its commands to your chosen workflow automatically — no manual branch names to remember.

| Mode | Branches | Strategy | Default |
|------|----------|----------|:-------:|
| 🌊 **Clean Flow** *(by WGTech Labs)* | `main` + `dev` + feature branches | Squash features → `dev`, merge `dev` → `main` | ✅ |
| 🐙 **GitHub Flow** | `main` + feature branches | Squash/merge features → `main` | |
| 🔀 **Git Flow** | `main` + `develop` + release/hotfix branches | Full ceremony branching | |

## Commit Conventions

contribute-now validates commit messages and guides your AI toward the right format — based on whichever convention you configure.

| Convention | Format | Default |
|------------|--------|:-------:|
| 🧹 **Clean Commit** *(by WGTech Labs)* | `<emoji> <type>[!][(<scope>)]: <description>` | ✅ |
| 📝 **Conventional Commits** | `<type>[!][(<scope>)]: <description>` | |
| 🚫 **None** | No enforcement | |

---

## Quick Start

```bash
npx contribute-now setup
```

Or install globally:

```bash
npm install -g contribute-now
contrib setup
```

> Both `contrib` and `contribute` invoke the same binary.

---

## Installation

```bash
# npm
npm install -g contribute-now

# bun
bun install -g contribute-now
```

## Prerequisites

- **[Git](https://git-scm.com/)** — required
- **[GitHub CLI](https://cli.github.com)** (`gh`) — optional; enables role auto-detection and PR creation
- **[GitHub Copilot](https://github.com/features/copilot)** — optional; enables AI features

---

## Commands

### `contrib setup`

Interactive setup wizard. Configures your repo's workflow mode, commit convention, your role, and branch/remote names. Writes `.contributerc.json`.

```bash
contrib setup
```

Steps:
1. Choose **workflow mode** — Clean Flow, GitHub Flow, or Git Flow
2. Choose **commit convention** — Clean Commit, Conventional Commits, or None
3. Detect remotes and auto-detect your **role** (maintainer or contributor)
4. Confirm branch and remote names
5. Write `.contributerc.json`

---

### `contrib sync`

Pull the latest changes from the correct remote branch based on your workflow and role.

```bash
contrib sync         # with confirmation
contrib sync --yes   # skip confirmation
```

| Role | Clean Flow / Git Flow | GitHub Flow |
|------|-----------------------|-------------|
| Maintainer | pulls `origin/dev` | pulls `origin/main` |
| Contributor | pulls `upstream/dev` | pulls `upstream/main` |

---

### `contrib start`

Create a new feature branch from the correct base branch, with optional AI-powered branch naming.

```bash
# Direct branch name
contrib start feature/user-auth

# Natural language — AI suggests the branch name
contrib start "add user authentication"

# Skip AI
contrib start "add user authentication" --no-ai
```

---

### `contrib commit`

Stage your changes and create a validated, AI-generated commit message matching your configured convention.

```bash
contrib commit                     # AI-generated message
contrib commit --no-ai             # manual entry, still validated
contrib commit --model gpt-4.1    # specific AI model
```

After the AI generates a message, you can **accept**, **edit**, **regenerate**, or **write manually**. Messages are always validated against your convention — with a soft warning if they don't match (you can still commit).

---

### `contrib update`

Rebase your current branch onto the latest base branch, with AI guidance if conflicts occur.

```bash
contrib update
contrib update --no-ai   # skip AI conflict guidance
```

---

### `contrib submit`

Push your branch and open a pull request with an AI-generated title and description.

```bash
contrib submit
contrib submit --draft
contrib submit --no-ai
contrib submit --model gpt-4.1
```

---

### `contrib clean`

Delete merged branches and prune stale remote refs.

```bash
contrib clean          # shows candidates, asks to confirm
contrib clean --yes    # skip confirmation
```

---

### `contrib status`

Show a sync status dashboard for your main, dev, and current branch.

```bash
contrib status
```

---

### `contrib hook`

Install or uninstall a `commit-msg` git hook that validates every commit against your configured convention — no Husky or lint-staged needed.

```bash
contrib hook install     # writes .git/hooks/commit-msg
contrib hook uninstall   # removes it
```

- Automatically skips merge commits, fixup, squash, and amend commits
- Won't overwrite hooks it didn't create

---

### `contrib validate`

Validate a commit message against your configured convention. Exits `0` if valid, `1` if not — useful in CI pipelines or custom hooks.

```bash
contrib validate "📦 new: user auth module"     # exit 0
contrib validate "added stuff"                   # exit 1
```

---

## AI Features

All AI features are powered by **GitHub Copilot** via `@github/copilot-sdk` and are entirely **optional** — every command has a manual fallback.

| Command | AI Feature | Fallback |
|---------|------------|---------|
| `commit` | Generate commit message from staged diff | Type manually |
| `start` | Suggest branch name from natural language | Prefix picker + manual |
| `update` | Conflict resolution guidance | Standard git instructions |
| `submit` | Generate PR title and body | `gh pr create --fill` or manual |

Pass `--no-ai` to any command to skip AI entirely. Use `--model <name>` to select a specific Copilot model (e.g., `gpt-4.1`, `claude-sonnet-4`).

---

## Commit Convention Reference

### Clean Commit *(default)*

Format: `<emoji> <type>[!][(<scope>)]: <description>`

| Emoji | Type | When to use |
|:-----:|------|-------------|
| 📦 | `new` | New features, files, or capabilities |
| 🔧 | `update` | Changes, refactoring, improvements |
| 🗑️ | `remove` | Removing code, files, or dependencies |
| 🔒 | `security` | Security fixes or patches |
| ⚙️ | `setup` | Configs, CI/CD, tooling, build systems |
| ☕ | `chore` | Maintenance, dependency updates |
| 🧪 | `test` | Adding or updating tests |
| 📖 | `docs` | Documentation changes |
| 🚀 | `release` | Version releases |

Examples:
```
📦 new: user authentication system
🔧 update (api): improve error handling
⚙️ setup (ci): configure github actions
🔧 update!: breaking change to config format
```

→ [Clean Commit spec](https://github.com/wgtechlabs/clean-commit)

### Conventional Commits

Format: `<type>[!][(<scope>)]: <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Examples:
```
feat: add user authentication
fix(auth): resolve token expiry issue
docs: update contributing guide
feat!: redesign authentication API
```

→ [conventionalcommits.org](https://www.conventionalcommits.org/)

---

## Config File

`contrib setup` writes `.contributerc.json` to your repo root:

```json
{
  "workflow": "clean-flow",
  "commitConvention": "clean-commit",
  "role": "contributor",
  "mainBranch": "main",
  "devBranch": "dev",
  "upstream": "upstream",
  "origin": "origin",
  "branchPrefixes": ["feature", "fix", "docs", "chore", "test", "refactor"]
}
```

> Add `.contributerc.json` to your `.gitignore` — it contains personal config and should not be committed.

---

## Development

```bash
git clone https://github.com/warengonzaga/contribute-now.git
cd contribute-now
bun install

bun run build   # compile to dist/index.js
bun test        # run tests
bun run lint    # check code quality
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, commit convention, and PR guidelines.

## License

[GPL-3.0](LICENSE) © [Waren Gonzaga](https://warengonzaga.com)

---

💻💖☕ Made with ❤️ by [Waren Gonzaga](https://github.com/warengonzaga)

