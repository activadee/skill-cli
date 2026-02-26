# skill-cli

A TypeScript CLI for syncing agent skills from a Git repository into machine-local or project-local destinations.

## Features

- Interactive Ink TUI flow for selecting and syncing skills.
- Pull-only sync from a remote repository path (default: `skills`).
- Destination targets:
  - `root`: `$XDG_HOME/skills` (fallback `~/skills`)
  - `local`: `<cwd>/skills`
- Per-skill overwrite confirmation (or `--yes` for non-interactive confirmations).
- Optional inclusion of `.system/*` skills via `--include-system`.

## Install

```bash
pnpm install
```

## Build

```bash
pnpm run build
```

## Run

```bash
pnpm run dev:sync
```

### Command

```bash
skills sync [options]
```

Options:

- `--repo <url>`: override source repo URL (defaults to local `origin` remote)
- `--branch <name>`: source branch (default: `main`)
- `--repo-path <path>`: source skills directory (default: `skills`)
- `--target <root|local>`: preselect destination target
- `--include-system`: include `.system/*` skills in selection
- `--yes`: skip overwrite confirmations

## Test

```bash
pnpm run test
```
