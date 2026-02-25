# contribute-now

![GitHub Repo Banner](https://ghrb.waren.build/banner?header=contribute-now+%F0%9F%94%84&subheader=Squash.+Merge.+Stay+in+sync.&bg=0D1117-21262D&color=FFFFFF&headerfont=Google+Sans+Code&subheaderfont=Sour+Gummy&support=true)
<!-- Created with GitHub Repo Banner by Waren Gonzaga: https://ghrb.waren.build -->

A lightweight CLI that automates git operations for projects using a **two-branch model** (`main` + `dev`) with squash merges — so maintainers and contributors never have to memorize complex sync flows.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![npm version](https://img.shields.io/npm/v/contribute-now.svg)](https://www.npmjs.com/package/contribute-now)

## The Problem

Squash-merging `dev` → `main` is clean for release history, but it breaks the branch relationship. After the merge, `dev` retains old individual commits that are already in `main`'s squash commit. This causes:

- Dev history becomes messy and diverges from main
- New PRs from dev to main show stale/duplicate commits
- Contributors struggle to keep their forks in sync

**contribute-now** fixes this with a single command: `contrib sync`.

## Features

- 🔄 **`contrib sync`** — Resets `dev` to match `main` (maintainer) or `upstream/dev` (contributor) using safe `--force-with-lease`
- 🌿 **`contrib start`** — Creates feature branches from latest dev, with AI-powered branch name suggestions
- 💾 **`contrib commit`** — Generates [Clean Commit](https://github.com/wgtechlabs/clean-commit) messages using GitHub Copilot AI
- 🔃 **`contrib update`** — Rebases your branch onto latest dev, with AI conflict resolution guidance
- 🚀 **`contrib submit`** — Pushes your branch and creates a PR with an AI-generated title and body
- 🧹 **`contrib clean`** — Deletes merged branches and prunes remote refs
- 📊 **`contrib status`** — Dashboard showing sync state for all branches
- ⚙️ **`contrib setup`** — Auto-detects your role (maintainer/contributor) and writes `.contributerc.json`
- 🤖 **AI-powered** — All AI features degrade gracefully if GitHub Copilot is unavailable
- 🎨 **ASCII Banner** — Beautiful ANSI Shadow figlet banner

## Quick Start

```bash
# Using npx
npx contribute-now setup

# Using bunx
bunx contribute-now setup
```

Or install globally:

```bash
npm install -g contribute-now
# then use:
contrib setup
# or:
contribute setup
```

## Installation

```bash
# npm
npm install -g contribute-now

# bun
bun install -g contribute-now
```

Both `contrib` and `contribute` invoke the same binary.

## Prerequisites

- [Git](https://git-scm.com/) (required)
- [GitHub CLI](https://cli.github.com) (`gh`) — optional, enables role auto-detection and PR creation
- [GitHub Copilot](https://github.com/features/copilot) subscription — optional, enables AI features

## Usage

### Setup

Initialize contribute-now for the current repository:

```bash
contrib setup
```

This will:
1. Detect your git remotes
2. Auto-detect your role as **maintainer** or **contributor** (via `gh` CLI, remote heuristics, or interactive prompt)
3. Confirm branch names (`main`, `dev`) and remote names (`origin`, `upstream`)
4. Write `.contributerc.json` to the repo root

### Sync

Keep `dev` in sync after a squash merge:

```bash
contrib sync         # interactive confirmation
contrib sync --yes   # skip confirmation
```

**Maintainer flow:** resets `dev` → `origin/main`  
**Contributor flow:** resets `dev` → `upstream/dev`

Always uses `--force-with-lease` (never bare `--force`).

### Start

Create a new feature branch from the latest dev:

```bash
contrib start feature/user-auth
contrib start fix/login-timeout

# Natural language — AI suggests a proper branch name
contrib start "fix the login timeout bug"

# Skip AI suggestion
contrib start "fix the login timeout bug" --no-ai
```

### Commit

Generate a [Clean Commit](https://github.com/wgtechlabs/clean-commit) message with AI, then commit:

```bash
contrib commit

# Use a specific AI model
contrib commit --model gpt-4.1

# Skip AI, type message manually (still validated against Clean Commit format)
contrib commit --no-ai
```

The AI generates a message like:
```
🔧 update (auth): fix login timeout handling
```

You can accept, edit, regenerate, or write manually.

### Update

Rebase your current branch onto the latest dev:

```bash
contrib update

# Skip AI conflict suggestions
contrib update --no-ai
```

If a conflict occurs, AI guidance is shown alongside standard resolution instructions.

### Submit

Push your branch and open a pull request:

```bash
contrib submit
contrib submit --draft
contrib submit --no-ai        # skip AI PR description
contrib submit --model gpt-4.1
```

### Clean

Delete merged branches and prune remote refs:

```bash
contrib clean         # shows candidates, asks to confirm
contrib clean --yes   # skip confirmation
```

### Status

View a dashboard of branch sync states:

```bash
contrib status
```

Example output:
```
main                 ✓  in sync with origin/main
dev                  ↑  3 commits ahead of origin/main (needs sync!)
feature/user-auth    ↑  2 ahead, 0 behind dev  (current *)
```

## Config File

`contrib setup` writes `.contributerc.json` to your repo root:

```json
{
  "role": "contributor",
  "mainBranch": "main",
  "devBranch": "dev",
  "upstream": "upstream",
  "origin": "origin",
  "branchPrefixes": ["feature", "fix", "docs", "chore", "test", "refactor"]
}
```

> Add `.contributerc.json` to your `.gitignore` — it's personal config, not meant to be committed.

## CLI Reference

```
contrib — Git workflow CLI for squash-merge two-branch models

USAGE
  contrib [OPTIONS] setup|sync|start|commit|update|submit|clean|status

OPTIONS
  -v, --version    Show version number

COMMANDS
  setup    Initialize config for this repo (.contributerc.json)
  sync     Reset dev branch to match origin/main or upstream/dev
  start    Create a new feature branch from the latest dev
  commit   Stage changes and create a Clean Commit message (AI-powered)
  update   Rebase current branch onto latest dev
  submit   Push current branch and create a pull request
  clean    Delete merged branches and prune remote refs
  status   Show sync status of main, dev, and current branch

Use contrib <command> --help for more information about a command.
```

## AI Features

All AI features use **GitHub Copilot** via `@github/copilot-sdk`. They are entirely **optional** — if Copilot is unavailable (no subscription, not installed), the CLI falls back to manual input. You are never blocked.

| Command | AI Feature | Fallback |
|---------|-----------|---------|
| `commit` | Generate Clean Commit message from staged diff | Type message manually |
| `start` | Suggest branch name from natural language | Prefix picker + manual name |
| `update` | Conflict resolution guidance | Standard rebase instructions |
| `submit` | Generate PR title + body from commits + diff | `gh pr create --fill` or manual |

Use `--model <model>` on any AI-powered command to select a specific Copilot model (e.g., `gpt-4.1`, `claude-sonnet-4`).

## Clean Commit Convention

This project uses the **[Clean Commit](https://github.com/wgtechlabs/clean-commit)** convention by [@wgtechlabs](https://github.com/wgtechlabs). Every commit must follow this format:

```
<emoji> <type>[!][(<scope>)]: <description>
```

| Emoji | Type | Purpose |
|:-----:|------|---------|
| 📦 | `new` | New features, files, or capabilities |
| 🔧 | `update` | Changes, refactoring, improvements |
| 🗑️ | `remove` | Removing code, files, or dependencies |
| 🔒 | `security` | Security fixes or patches |
| ⚙️ | `setup` | Configs, CI/CD, tooling, build systems |
| ☕ | `chore` | Maintenance, dependency updates |
| 🧪 | `test` | Adding or updating tests |
| 📖 | `docs` | Documentation changes |
| 🚀 | `release` | Version releases |

A Husky commit-msg hook enforces this automatically.

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
