---
name: gh-resolve-issue
description: Fetch and resolve a specific GitHub issue in a target repository using GitHub CLI. Use when Codex is asked to fix an issue by number, URL, or owner/repo#number, then validate the fix and prepare a PR that closes the issue.
---

# GitHub Issue Resolver

## Overview

Use this skill to turn a single GitHub issue into an end-to-end fix: fetch issue context, reproduce the problem, implement a change, validate locally, and open a PR linked to the issue.

## Prerequisites

- Require GitHub CLI and authentication:
  - `gh --version`
  - `gh auth status`
- If authentication fails, ask the user to run `gh auth login`, then continue.
- Require a local checkout of the target repository before editing code.

## Workflow

### 1. Gather Required Inputs

- Capture:
  - Issue reference (`123`, full URL, or `owner/repo#123`)
  - Repository (`owner/repo`) when issue reference is only a number
  - Any explicit acceptance criteria from the user

### 2. Fetch Issue Context

Run:

```bash
python3 scripts/fetch_issue_context.py <issue-ref> [--repo owner/repo] [--json-out /tmp/issue.json]
```

- This prints a compact issue brief with labels, assignees, body, and recent comments.
- If output is ambiguous, open the issue in browser for extra context:
  - `gh issue view <issue-ref> --repo owner/repo --web`

### 3. Reproduce and Scope the Fix

- Reproduce the reported behavior with the smallest reliable test or command.
- Identify the minimal files and code path involved.
- If the issue request is unclear or conflicts with observed behavior, ask a focused clarification question before coding.

### 4. Implement and Validate

- Implement the smallest change that resolves the issue.
- Add or update tests when possible.
- Run project checks relevant to touched code (unit tests, lint, build, or targeted commands).
- Include concrete command outputs in your summary.

### 5. Prepare Commit and PR

- Suggested branch name: `codex/issue-<number>-<short-slug>`
- Suggested commit message: `fix: <concise summary> (#<number>)`
- Create PR with:
  - Problem summary
  - Root cause
  - Fix summary
  - Validation steps
  - Closing keyword (for example `Closes #<number>`)

## Script

### `scripts/fetch_issue_context.py`

Fetch structured issue context via GitHub CLI and print a compact brief for implementation.

Usage:
```bash
python3 scripts/fetch_issue_context.py 123 --repo owner/repo
python3 scripts/fetch_issue_context.py owner/repo#123 --comment-limit 8
python3 scripts/fetch_issue_context.py https://github.com/owner/repo/issues/123
```
