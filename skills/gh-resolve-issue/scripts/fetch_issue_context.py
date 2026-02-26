#!/usr/bin/env python3
"""Fetch GitHub issue context and print a compact implementation brief."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

ISSUE_FIELDS = (
    "number,title,body,state,author,labels,assignees,milestone,"
    "createdAt,updatedAt,url,comments"
)

REPO_ISSUE_REF = re.compile(r"^(?P<repo>[\w.-]+/[\w.-]+)#(?P<number>\d+)$")
ISSUE_NUMBER = re.compile(r"^\d+$")


def run_command(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def fail(message: str, hint: Optional[str] = None) -> None:
    print(f"[ERROR] {message}", file=sys.stderr)
    if hint:
        print(f"Hint: {hint}", file=sys.stderr)
    raise SystemExit(1)


def ensure_gh_available() -> None:
    result = run_command(["gh", "--version"])
    if result.returncode != 0:
        fail("GitHub CLI (`gh`) is not available.", "Install gh and retry.")


def ensure_gh_auth() -> None:
    result = run_command(["gh", "auth", "status"])
    if result.returncode != 0:
        fail(
            "GitHub CLI is not authenticated.",
            "Run `gh auth login`, then rerun this script.",
        )


def resolve_issue_ref(raw_ref: str, repo: Optional[str]) -> Tuple[str, Optional[str]]:
    raw_ref = raw_ref.strip()

    if raw_ref.startswith("https://") or raw_ref.startswith("http://"):
        return raw_ref, None

    match = REPO_ISSUE_REF.match(raw_ref)
    if match:
        return match.group("number"), match.group("repo")

    if ISSUE_NUMBER.match(raw_ref):
        if not repo:
            fail(
                "Issue number was provided without --repo.",
                "Use --repo owner/repo or pass owner/repo#number.",
            )
        return raw_ref, repo

    fail(
        f"Unsupported issue reference format: {raw_ref}",
        "Use issue number, issue URL, or owner/repo#number.",
    )
    return "", None


def fetch_issue_data(issue_ref: str, repo: Optional[str]) -> Dict[str, Any]:
    cmd = [
        "gh",
        "issue",
        "view",
        issue_ref,
        "--comments",
        "--json",
        ISSUE_FIELDS,
    ]
    if repo:
        cmd.extend(["--repo", repo])

    result = run_command(cmd)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        fail("Failed to fetch issue details with gh.", stderr or "Check repo/ref values.")

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        fail(f"Failed to parse gh JSON output: {exc}")
    return {}


def truncate(text: str, max_chars: int) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[: max_chars - 3].rstrip()}..."


def wrap_block(text: str, indent: str = "  ", width: int = 100) -> str:
    if not text.strip():
        return f"{indent}(empty)"
    wrapped_lines = []
    for paragraph in text.strip().splitlines():
        if not paragraph.strip():
            wrapped_lines.append("")
            continue
        wrapped_lines.append(
            textwrap.fill(
                paragraph,
                width=width,
                initial_indent=indent,
                subsequent_indent=indent,
            )
        )
    return "\n".join(wrapped_lines)


def get_logins(entries: list[Dict[str, Any]]) -> str:
    logins = [entry.get("login") for entry in entries if entry.get("login")]
    return ", ".join(logins) if logins else "(none)"


def get_labels(entries: list[Dict[str, Any]]) -> str:
    labels = [entry.get("name") for entry in entries if entry.get("name")]
    return ", ".join(labels) if labels else "(none)"


def print_issue_brief(issue: Dict[str, Any], comment_limit: int) -> None:
    author = (issue.get("author") or {}).get("login") or "unknown"
    milestone = (issue.get("milestone") or {}).get("title") or "(none)"
    comments = issue.get("comments") or []

    print(f"Issue: #{issue.get('number')} - {issue.get('title', '(no title)')}")
    print(f"URL: {issue.get('url', '(unknown)')}")
    print(f"State: {issue.get('state', '(unknown)')}")
    print(f"Author: @{author}")
    print(f"Labels: {get_labels(issue.get('labels') or [])}")
    print(f"Assignees: {get_logins(issue.get('assignees') or [])}")
    print(f"Milestone: {milestone}")
    print(f"Created: {issue.get('createdAt', '(unknown)')}")
    print(f"Updated: {issue.get('updatedAt', '(unknown)')}")
    print()
    print("Body:")
    print(wrap_block(issue.get("body") or ""))
    print()

    shown = min(comment_limit, len(comments))
    print(f"Comments: {len(comments)} total, showing {shown}")
    for index, comment in enumerate(comments[:comment_limit], start=1):
        commenter = (comment.get("author") or {}).get("login") or "unknown"
        created = comment.get("createdAt") or "(unknown time)"
        body = truncate(comment.get("body") or "", 500)
        print()
        print(f"{index}. @{commenter} at {created}")
        print(wrap_block(body, indent="    "))


def write_json(path: str, issue: Dict[str, Any]) -> None:
    output = Path(path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(issue, indent=2) + "\n")
    print()
    print(f"Saved JSON output to: {output}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch a GitHub issue via gh and print a compact context brief. "
            "Issue can be number, URL, or owner/repo#number."
        )
    )
    parser.add_argument("issue_ref", help="Issue number, issue URL, or owner/repo#number")
    parser.add_argument(
        "--repo",
        help="Repository in owner/repo format (required when issue_ref is only a number)",
    )
    parser.add_argument(
        "--comment-limit",
        type=int,
        default=5,
        help="Number of issue comments to print (default: 5)",
    )
    parser.add_argument(
        "--json-out",
        help="Optional file path to save raw JSON issue data",
    )
    args = parser.parse_args()
    if args.comment_limit < 0:
        fail("--comment-limit must be >= 0.")
    return args


def main() -> None:
    args = parse_args()
    ensure_gh_available()
    ensure_gh_auth()
    issue_ref, repo = resolve_issue_ref(args.issue_ref, args.repo)
    issue = fetch_issue_data(issue_ref, repo)
    print_issue_brief(issue, args.comment_limit)
    if args.json_out:
        write_json(args.json_out, issue)


if __name__ == "__main__":
    main()
