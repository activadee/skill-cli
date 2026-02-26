---
name: split-prd-into-tasks
description: Transform a PRD markdown document into implementation-ready atomic task markdown files. Use when asked to break down a PRD into small actionable tasks, and each task must include a story, acceptance criteria, test cases, plus a linked tasklist with task states (open/in_progress/ready4review/done).
---

# Split PRD Into Tasks

Use this skill to convert one PRD markdown file into a task package that engineering can execute directly.

## Workflow

1. Read the PRD file.
2. Run the generator script to create task files and a tasklist.
3. Review generated tasks and adjust titles/scope only if needed.
4. Keep each task atomic (single deliverable and testable outcome).

## Run The Generator

```bash
python3 scripts/split_prd_into_tasks.py \
  --prd <path-to-prd.md> \
  --out-dir <output-task-directory> \
  [--tasklist <path-to-tasklist.md>] \
  [--task-prefix TASK] \
  [--initial-state open]
```

Default behavior:
- Write one markdown file per generated task in `--out-dir`.
- Write `TASKLIST.md` in `--out-dir` when `--tasklist` is not provided.
- Set every generated task state to `open` unless `--initial-state` is specified.

Allowed states:
- `open`
- `in_progress`
- `ready4review`
- `done`

## Output Contract

Each task file must contain:
- Task title and ID.
- Task state.
- Source PRD section.
- `## Story`.
- `## Acceptance Criteria`.
- `## Test Cases`.

Each tasklist entry must contain:
- A markdown link to the task file.
- The current state (`open/in_progress/ready4review/done`).

## Quality Rules

- Keep tasks small enough to complete independently.
- Keep acceptance criteria observable and verifiable.
- Keep test cases executable as Given/When/Then style checks.
- Avoid combining unrelated capabilities in one task.

## Script

Use `scripts/split_prd_into_tasks.py`.
