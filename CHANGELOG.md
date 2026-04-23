# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


















## [0.7.4] - 2026-04-23

### Changed

- CI workflow for GitHub token handling and CLI improvements (#12)

## [0.7.3] - 2026-04-23

### Changed

- improve CI workflow for GitHub token handling and npm publish (#11)

## [0.7.2] - 2026-03-21

### Changed

- switch examples to bunx and clarify local testing workflow
- migrate ci workflows and documentation to bun runtime

## [0.7.1] - 2026-03-17

### Changed

- refine state handling
- improve secret handling
- refine AI provider selection logic
- improve health check sections
- adjust config command for removed dependency

### Removed

- remove config-engine dependency

## [0.7.0] - 2026-03-17

### Added

- add configuration management with state and secrets
- add branch utility and update branch prompt
- add tips utility with per-command quick guides
- add announcements utility with condition-based filtering
- add AI config toggle and shared branch prompt utility
- add `--pr` and `--local` flags to skip mode prompt

### Changed

- extend config parsing utility
- improve update command logic
- add legacy config detection support
- skip empty groups gracefully on group commit
- extract formatSpinnerTip and slow default tip interval
- replace clearBlock with incremental renderNextState
- display copilot and config status in banner
- expand copilot integration and batch config
- extend config read and write logic
- add new config type fields
- add loading tips to spinners and refactor group commit helpers
- normalize config-missing error messages
- revise API reference and docs structure
- add data assets and update tsconfig
- add quick guide box to command headings
- add rotating tips support to spinner
- generalize config not-found error message
- improve AI message retry flow for squash merge
- fix commit message not sync with hook
- improve group normalization and handle unassigned files

### Removed

- delete temporary Copilot icon SVG file
- remove footer tips from branch listing
- remove contextual tips section from status output

## [0.6.2] - 2026-03-09

### Changed

- remove `--packages external` flag from bun build script
- add branch alignment summary after sync
- add branch alignment section with commit subjects
- separate emoji from message strings into logger arguments

## [0.6.1] - 2026-03-07

### Changed

- ask maintainers for merge strategy before AI generation
- replace nav CTA with icon links for Discord, GitHub, and star count

## [0.6.0] - 2026-03-07

### Added

- add TinyClaw logo asset
- add save and switch commands

### Changed

- refresh hero copy and add GitHub button icon
- add `cn` as shorthand binary alias
- replace positional actions with flag-based interface

## [0.5.0] - 2026-03-06

### Added

- add mobile hamburger nav menu

### Changed

- improve commit ux with large-commit warnings and squash message review
- add merged and stale branch detection to status
- enhance log command and rename www/ to landing/ (#8)
- add concurrency configuration for npm-publish workflow

## [0.4.1] - 2026-03-05

### Changed

- replace em dashes with pipes in meta tags and add sponsor nav link
- sort imports alphabetically
- update website content and styles
- handle continuation prompt for invalid existing config
- replace magic number with BATCH_CONFIG threshold
- extract batch threshold into BATCH_CONFIG constant
- add optimized batching for large changesets with spinner feedback
- add existing config gate and role-detection spinner
- ensure .contributerc.json is added to .gitignore

## [0.4.0] - 2026-02-28

### Added

- add function to count commits ahead of upstream branch

### Changed

- warn users about local commits before syncing base branch

## [0.3.0] - 2026-02-28

### Added

- add protected branch prefix detection for git-flow
- add branch listing command with workflow-aware labels
- add colorized workflow-aware commit log command
- add suggestBranchName AI utility
- add group commit mode and interactive staging (#3)

### Changed

- minor formatting and UX improvements
- expose shallow clone, in-progress ops, and lock file checks
- auto-add upstream remote and verify branch refs after save
- guard against unclean git state and duplicate branch names
- add enum and field validation in readConfig
- strengthen branch name validation with full git rules
- add git state detection, lock guard, and new utility functions
- auto-accept ai commit message and skip missing remote branch deletion
- improve interactive branch workflow with AI suggestions
- recover gracefully when submitting from a protected branch
- add small banner variant and skip banner for version flag
- add doctor command, fix rebase strategy, and refactor submit
- add AI branch name suggestion on save
- improve PR title generation prompt clarity (#5)
- enhance git workflows with AI, rebase, and stale branch handling (#4)

## [0.2.1] - 2026-02-26

### Changed

- fix/ai start issues (#1)

## [0.2.0] - 2026-02-26

### Added

- add hook command for git commit-msg hook management
- add validate command for commit message linting
- add Conventional Commits AI generation support
- add commit convention validators and metadata
- add CommitConvention type and default config
- multi-workflow support (clean-flow, github-flow, git-flow)

### Changed

- improve null checks and formatting in main.ts and vite.config.ts
- update landing page
- update readme info
- register hook and validate commands in CLI
- add commit convention selection step
- use configurable commit convention for validation

## [0.1.2] - 2026-02-25

### Changed

- add no-errors-on-unmatched to pre-commit hook
- change og image URL to waren.build/contribute-now
- add www:dev, www:build, and www:preview root scripts

## [0.1.1] - 2026-02-25

### Changed

- add complete open graph and twitter card meta tags

## [0.1.0] - 2026-02-25

### Added

- add vite landing page with dark theme and full cli showcase
- add cli entry point with all 8 subcommands via citty
- add contrib clean command for merged branch cleanup
- add contrib submit command with ai pr description generation
- add contrib update command with ai conflict guidance
- add contrib commit command with ai clean commit generation
- add contrib start command with ai branch name suggestion
- add contrib sync command for dev branch reset
- add contrib status dashboard command
- add contrib setup command with role auto-detection
- add ascii art banner with figlet and version display
- add config, remote, branch, confirm, and logger utilities
- add copilot sdk wrapper for ai-powered features
- add github cli wrapper for role detection and pr creation
- add git command wrapper utility
- add ContributeConfig, GitResult, and RepoInfo interfaces

### Changed

- exclude www build and node_modules artifacts
- add github pages deployment workflow for landing page
- add package build and release workflow actions
- add copilot instructions with clean commit convention
- add clean commit validation and pre-commit biome hooks
- initialize project scaffold with bun, typescript, and biome

