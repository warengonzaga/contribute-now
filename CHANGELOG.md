# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]







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

