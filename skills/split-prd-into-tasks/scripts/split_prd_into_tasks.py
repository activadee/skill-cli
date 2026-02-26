#!/usr/bin/env python3
"""Generate atomic task markdown files from a PRD markdown file."""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

VALID_STATES = ("open", "in_progress", "ready4review", "done")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
BULLET_RE = re.compile(r"^\s*[-*]\s+(.*\S)\s*$")
NUMBERED_RE = re.compile(r"^\s*\d+[.)]\s+(.*\S)\s*$")


@dataclass
class Section:
    source: str
    body: str


@dataclass
class TaskSeed:
    source: str
    text: str


@dataclass
class Task:
    task_id: str
    title: str
    state: str
    source: str
    story: str
    acceptance_criteria: list[str]
    test_cases: list[str]
    path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split a PRD markdown file into task files plus a linked tasklist."
    )
    parser.add_argument("--prd", required=True, help="Input PRD markdown file path.")
    parser.add_argument(
        "--out-dir",
        required=True,
        help="Directory where individual task markdown files are written.",
    )
    parser.add_argument(
        "--tasklist",
        default="",
        help="Output path for TASKLIST markdown (default: <out-dir>/TASKLIST.md).",
    )
    parser.add_argument(
        "--task-prefix",
        default="TASK",
        help="Task ID prefix (default: TASK).",
    )
    parser.add_argument(
        "--initial-state",
        default="open",
        choices=VALID_STATES,
        help="Initial state for every generated task.",
    )
    return parser.parse_args()


def read_markdown(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise SystemExit(f"PRD file not found: {path}") from exc


def cleanup_inline_markdown(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def sentence(text: str) -> str:
    normalized = cleanup_inline_markdown(text).strip(" -")
    if not normalized:
        return ""
    return normalized if normalized.endswith((".", "!", "?")) else f"{normalized}."


def parse_sections(markdown: str) -> list[Section]:
    lines = markdown.splitlines()
    sections: list[Section] = []

    heading_stack: list[str] = []
    current_source: str | None = None
    current_body: list[str] = []
    saw_structured_headings = False

    for raw_line in lines:
        heading_match = HEADING_RE.match(raw_line)
        if heading_match:
            level = len(heading_match.group(1))
            title = cleanup_inline_markdown(heading_match.group(2).rstrip("#").strip())
            if level >= 2:
                saw_structured_headings = True
                if current_source is not None:
                    body = "\n".join(current_body)
                    if body.strip():
                        sections.append(Section(source=current_source, body=body))

                depth = max(level - 2, 0)
                heading_stack = heading_stack[:depth]
                heading_stack.append(title or "Untitled")
                current_source = " > ".join(heading_stack)
                current_body = []
            continue

        if saw_structured_headings:
            current_body.append(raw_line)

    if current_source is not None:
        body = "\n".join(current_body)
        if body.strip():
            sections.append(Section(source=current_source, body=body))

    if sections:
        return sections

    fallback = cleanup_inline_markdown(markdown)
    if fallback:
        return [Section(source="General", body=fallback)]
    return []


def split_sentences(text: str) -> list[str]:
    scrubbed = re.sub(r"```.*?```", " ", text, flags=re.S)
    lines: list[str] = []
    for raw_line in scrubbed.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(("#", ">", "|")):
            continue
        if BULLET_RE.match(line) or NUMBERED_RE.match(line):
            continue
        lines.append(cleanup_inline_markdown(line))

    corpus = " ".join(lines)
    if not corpus:
        return []

    chunks = [chunk.strip() for chunk in re.split(r"(?<=[.!?])\s+", corpus) if chunk.strip()]
    return [chunk for chunk in chunks if len(chunk) >= 20]


def extract_seeds(section: Section) -> list[TaskSeed]:
    seeds: list[str] = []
    for line in section.body.splitlines():
        match = BULLET_RE.match(line) or NUMBERED_RE.match(line)
        if not match:
            continue
        candidate = cleanup_inline_markdown(match.group(1))
        candidate = re.sub(r"^\[[ xX]\]\s*", "", candidate)
        if candidate:
            seeds.append(candidate)

    if not seeds:
        seeds.extend(split_sentences(section.body)[:4])

    if not seeds:
        seeds = [section.source.split(" > ")[-1]]

    result: list[TaskSeed] = []
    for candidate in seeds[:12]:
        text = cleanup_inline_markdown(candidate)
        if text:
            result.append(TaskSeed(source=section.source, text=text))
    return result


def deduplicate(seeds: Iterable[TaskSeed]) -> list[TaskSeed]:
    seen: set[str] = set()
    unique: list[TaskSeed] = []
    for seed in seeds:
        key = re.sub(r"[^a-z0-9]+", "", seed.text.lower())
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(seed)
    return unique


def infer_actor(text: str) -> str:
    lowered = text.lower()
    for actor in ("administrator", "admin", "customer", "operator", "manager", "analyst", "developer", "user"):
        if re.search(rf"\b{re.escape(actor)}\b", lowered):
            return actor
    return "user"


def article(actor: str) -> str:
    if actor.startswith(("a ", "an ", "the ")):
        return actor
    if actor.lower() in {"user", "unicorn", "university"}:
        return f"a {actor}"
    return f"{'an' if actor[:1].lower() in 'aeiou' else 'a'} {actor}"


def to_capability(text: str) -> str:
    value = re.sub(
        r"^(the\s+system|system|platform|application|app)\s+(must|should|shall|needs\s+to)\s+",
        "",
        text,
        flags=re.I,
    )
    value = re.sub(r"^(must|should|shall|needs\s+to)\s+", "", value, flags=re.I)
    value = value.strip().rstrip(".")
    if not value:
        value = "deliver the required behavior"
    if not value.lower().startswith("to "):
        value = f"to {value[0].lower()}{value[1:]}" if len(value) > 1 else f"to {value.lower()}"
    return value


def build_story(seed: TaskSeed) -> str:
    existing_story = re.search(r"(as\s+an?.+?so\s+that.+?)(?:[.?!]|$)", seed.text, flags=re.I)
    if existing_story:
        return sentence(existing_story.group(1))

    actor = article(infer_actor(seed.text))
    capability = to_capability(seed.text)
    return sentence(
        f"As {actor}, I want {capability}, so that the PRD requirement is delivered successfully"
    )


def build_title(seed_text: str, source: str) -> str:
    candidate = re.sub(r"^(must|should|shall|needs\s+to)\s+", "", seed_text, flags=re.I)
    candidate = cleanup_inline_markdown(candidate).strip(" .:-")
    if not candidate:
        candidate = source.split(" > ")[-1]
    words = candidate.split()
    short = " ".join(words[:10]) if words else candidate
    if not short:
        short = "Untitled Task"
    return short[0].upper() + short[1:]


def build_acceptance_criteria(seed: TaskSeed, title: str) -> list[str]:
    first = sentence(seed.text)
    label = title.lower()
    return [
        first,
        sentence(f"The {label} workflow succeeds with valid input and expected prerequisites"),
        sentence(
            f"The {label} workflow handles validation errors and dependency failures with actionable feedback"
        ),
    ]


def build_test_cases(title: str) -> list[str]:
    label = title.lower()
    return [
        sentence(
            f"Given valid prerequisites for {label}, when the workflow runs, then it completes successfully with expected output"
        ),
        sentence(
            f"Given invalid or missing input for {label}, when the workflow runs, then validation blocks completion and explains how to fix it"
        ),
        sentence(
            f"Given a downstream failure during {label}, when the workflow runs, then the failure is reported and data remains consistent"
        ),
    ]


def slugify(text: str, max_len: int = 64) -> str:
    value = cleanup_inline_markdown(text).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    if len(value) > max_len:
        value = value[:max_len].rstrip("-")
    return value or "task"


def render_task_markdown(task: Task) -> str:
    lines: list[str] = [
        f"# {task.task_id} - {task.title}",
        "",
        f"- State: {task.state}",
        f"- Source: {task.source}",
        "",
        "## Story",
        task.story,
        "",
        "## Acceptance Criteria",
    ]
    lines.extend(f"{idx}. {item}" for idx, item in enumerate(task.acceptance_criteria, start=1))
    lines.extend(["", "## Test Cases"])
    lines.extend(f"{idx}. {item}" for idx, item in enumerate(task.test_cases, start=1))
    lines.append("")
    return "\n".join(lines)


def write_tasks(tasks: list[Task]) -> None:
    for task in tasks:
        task.path.parent.mkdir(parents=True, exist_ok=True)
        task.path.write_text(render_task_markdown(task), encoding="utf-8")


def write_tasklist(tasks: list[Task], tasklist_path: Path) -> None:
    tasklist_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Task List",
        "",
        "| Task | State |",
        "| --- | --- |",
    ]
    for task in tasks:
        rel = os.path.relpath(task.path, start=tasklist_path.parent).replace(os.sep, "/")
        lines.append(f"| [{task.task_id} - {task.title}]({rel}) | {task.state} |")
    lines.append("")
    tasklist_path.write_text("\n".join(lines), encoding="utf-8")


def build_tasks(
    seeds: list[TaskSeed], out_dir: Path, task_prefix: str, initial_state: str
) -> list[Task]:
    tasks: list[Task] = []
    safe_prefix = re.sub(r"[^A-Za-z0-9_-]+", "", task_prefix).upper() or "TASK"

    for index, seed in enumerate(seeds, start=1):
        task_id = f"{safe_prefix}-{index:03d}"
        title = build_title(seed.text, seed.source)
        story = build_story(seed)
        acceptance_criteria = build_acceptance_criteria(seed, title)
        test_cases = build_test_cases(title)
        filename = f"{task_id}-{slugify(title)}.md"
        path = out_dir / filename
        tasks.append(
            Task(
                task_id=task_id,
                title=title,
                state=initial_state,
                source=seed.source,
                story=story,
                acceptance_criteria=acceptance_criteria,
                test_cases=test_cases,
                path=path,
            )
        )

    return tasks


def main() -> int:
    args = parse_args()

    prd_path = Path(args.prd).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()
    tasklist_path = (
        Path(args.tasklist).expanduser().resolve()
        if args.tasklist
        else (out_dir / "TASKLIST.md").resolve()
    )

    markdown = read_markdown(prd_path)
    if not markdown.strip():
        raise SystemExit("PRD file is empty; provide a markdown document with requirements.")

    sections = parse_sections(markdown)
    if not sections:
        raise SystemExit("Could not derive sections from PRD content.")

    all_seeds: list[TaskSeed] = []
    for section in sections:
        all_seeds.extend(extract_seeds(section))

    seeds = deduplicate(all_seeds)
    if not seeds:
        raise SystemExit("No task candidates were extracted from the PRD.")

    tasks = build_tasks(
        seeds=seeds,
        out_dir=out_dir,
        task_prefix=args.task_prefix,
        initial_state=args.initial_state,
    )

    write_tasks(tasks)
    write_tasklist(tasks, tasklist_path)

    print(f"Generated {len(tasks)} task files in {out_dir}")
    print(f"Task list written to {tasklist_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
