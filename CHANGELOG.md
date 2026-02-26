# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]




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

