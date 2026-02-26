#!/usr/bin/env python3
"""Create comprehensive GitHub issues from structured user input."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Iterable, List


def run_command(cmd: List[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def fail(message: str, hint: str | None = None) -> None:
    print(f"[ERROR] {message}", file=sys.stderr)
    if hint:
        print(f"Hint: {hint}", file=sys.stderr)
    raise SystemExit(1)


def split_values(values: Iterable[str] | None) -> List[str]:
    items: List[str] = []
    for raw in values or []:
        parts = [part.strip() for part in raw.split(",")]
        items.extend(part for part in parts if part)
    return items


def to_markdown_list(items: List[str], empty_fallback: str) -> str:
    if not items:
        return f"- {empty_fallback}"
    return "\n".join(f"- {item}" for item in items)


def section(title: str, body: str) -> str:
    value = body.strip() if body and body.strip() else "_Not provided_"
    return f"## {title}\n\n{value}\n"


def build_issue_body(args: argparse.Namespace) -> str:
    env_lines = to_markdown_list(split_values(args.environment), "Not provided")
    step_lines = to_markdown_list(split_values(args.step), "Not provided")
    acceptance_lines = to_markdown_list(
        split_values(args.acceptance), "Not provided"
    )

    parts = [
        section("Summary", args.summary),
        section("Problem", args.problem),
        section("Expected Behavior", args.expected),
        section("Actual Behavior", args.actual),
        f"## Steps to Reproduce\n\n{step_lines}\n",
        section("Impact", args.impact),
        f"## Environment\n\n{env_lines}\n",
        f"## Acceptance Criteria\n\n{acceptance_lines}\n",
        section("Additional Context", args.additional_context),
    ]
    return "\n".join(parts).strip() + "\n"


def ensure_gh_available() -> None:
    result = run_command(["gh", "--version"])
    if result.returncode != 0:
        fail("GitHub CLI (`gh`) is not available.", "Install gh and retry.")


def ensure_gh_auth() -> None:
    result = run_command(["gh", "auth", "status"])
    if result.returncode != 0:
        fail(
            "GitHub CLI is not authenticated.",
            "Run `gh auth login` and retry.",
        )


def create_issue(args: argparse.Namespace, body: str) -> str:
    labels = split_values(args.label)
    assignees = split_values(args.assignee)
    projects = split_values(args.project)

    with NamedTemporaryFile(mode="w", delete=False, suffix=".md") as tmp:
        tmp_path = Path(tmp.name)
        tmp.write(body)

    cmd: List[str] = [
        "gh",
        "issue",
        "create",
        "--repo",
        args.repo,
        "--title",
        args.title,
        "--body-file",
        str(tmp_path),
    ]
    for label in labels:
        cmd.extend(["--label", label])
    for assignee in assignees:
        cmd.extend(["--assignee", assignee])
    if args.milestone:
        cmd.extend(["--milestone", args.milestone])
    for project in projects:
        cmd.extend(["--project", project])

    result = run_command(cmd)
    try:
        tmp_path.unlink(missing_ok=True)
    except OSError:
        pass

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        fail("Failed to create issue with gh.", stderr or "Check repo/flags and retry.")

    return (result.stdout or "").strip()


def write_body(path: str, body: str) -> Path:
    output = Path(path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(body)
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate and optionally create a comprehensive GitHub issue."
    )
    parser.add_argument("--repo", required=True, help="Repository in owner/repo format")
    parser.add_argument("--title", required=True, help="Issue title")
    parser.add_argument("--summary", required=True, help="High-level summary")
    parser.add_argument("--problem", default="", help="Problem statement")
    parser.add_argument("--expected", default="", help="Expected behavior")
    parser.add_argument("--actual", default="", help="Actual behavior")
    parser.add_argument(
        "--step",
        action="append",
        default=[],
        help="Step to reproduce (repeatable, comma-separated also supported)",
    )
    parser.add_argument("--impact", default="", help="Impact and severity")
    parser.add_argument(
        "--environment",
        action="append",
        default=[],
        help="Environment detail (repeatable, comma-separated also supported)",
    )
    parser.add_argument(
        "--acceptance",
        action="append",
        default=[],
        help="Acceptance criterion (repeatable, comma-separated also supported)",
    )
    parser.add_argument("--additional-context", default="", help="Optional extra context")
    parser.add_argument(
        "--label",
        action="append",
        default=[],
        help="Label to apply (repeatable, comma-separated also supported)",
    )
    parser.add_argument(
        "--assignee",
        action="append",
        default=[],
        help="Assignee login (repeatable, comma-separated also supported)",
    )
    parser.add_argument("--milestone", default="", help="Milestone title")
    parser.add_argument(
        "--project",
        action="append",
        default=[],
        help="Project title (repeatable, comma-separated also supported)",
    )
    parser.add_argument("--body-out", help="Write generated issue body to this file path")
    parser.add_argument(
        "--create",
        action="store_true",
        help="Create the issue in GitHub with gh issue create",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Do not print the full generated issue body",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    body = build_issue_body(args)

    if args.body_out:
        path = write_body(args.body_out, body)
        print(f"Saved issue body to: {path}")

    if not args.quiet:
        print("# Generated Issue Body")
        print()
        print(body, end="")

    if not args.create:
        print()
        print("Issue was not created. Re-run with --create to open it in GitHub.")
        return

    ensure_gh_available()
    ensure_gh_auth()
    url = create_issue(args, body)
    print()
    print(f"Created issue: {url}")


if __name__ == "__main__":
    main()
