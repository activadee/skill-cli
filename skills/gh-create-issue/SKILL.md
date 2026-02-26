---
name: gh-create-issue
description: Create comprehensive GitHub issues from user input using GitHub CLI, including structured problem context, reproduction steps, impact, environment details, and acceptance criteria. Use when Codex is asked to file a new issue in a repository with clear, actionable content.
---

# GitHub Issue Creator

## Overview

Use this skill to convert raw user problem reports into high-quality GitHub issues with complete context and consistent formatting, then create the issue in the target repository.

## Prerequisites

- Require GitHub CLI and authentication:
  - `gh --version`
  - `gh auth status`
- If authentication fails, ask the user to run `gh auth login`, then continue.

## Workflow

### 1. Collect Structured Inputs

Gather or infer:
- Repository (`owner/repo`)
- Title
- Summary
- Problem statement
- Expected behavior
- Actual behavior
- Steps to reproduce
- Impact
- Environment (OS, app version, browser, runtime)
- Acceptance criteria
- Optional metadata (labels, assignees, milestone, project)

If user input is incomplete, ask focused follow-up questions for only missing critical fields (repo, title, summary, reproduction, expected vs actual).

### 2. Generate Issue Draft

Run:

```bash
python3 scripts/create_comprehensive_issue.py \
  --repo owner/repo \
  --title "Short issue title" \
  --summary "One paragraph summary" \
  --problem "Clear problem statement" \
  --expected "Expected behavior" \
  --actual "Observed behavior" \
  --step "Step one" \
  --step "Step two" \
  --impact "Why this matters" \
  --environment "OS: Ubuntu 24.04" \
  --environment "Version: 1.2.3" \
  --acceptance "Issue is reproducible in a test" \
  --acceptance "Fix prevents regression" \
  --label bug \
  --body-out /tmp/issue.md
```

- Review the generated markdown with the user.
- Refine title and acceptance criteria before creation.

### 3. Create the Issue

Create directly:

```bash
python3 scripts/create_comprehensive_issue.py \
  --repo owner/repo \
  --title "Short issue title" \
  --summary "One paragraph summary" \
  --create
```

- Add labels/assignees/milestone/project flags when provided.
- Share the created issue URL in the final response.

### 4. Quality Checklist

Before creation, ensure the issue contains:
- Reproducible steps
- Expected and actual behavior
- Impact
- Acceptance criteria
- Environment details where relevant

## Script

### `scripts/create_comprehensive_issue.py`

Generate a comprehensive issue body and optionally create the issue with `gh issue create`.

Usage:
```bash
python3 scripts/create_comprehensive_issue.py --repo owner/repo --title "Bug" --summary "High-level summary"
python3 scripts/create_comprehensive_issue.py --repo owner/repo --title "Bug" --summary "..." --create
```
