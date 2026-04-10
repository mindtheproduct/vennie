"""
Vennie Work MCP Server.

Manages decisions, goals, weekly focus, and projects.
The structured backbone of a product person's working life.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

from mcp.server.fastmcp import FastMCP

server = FastMCP("vennie-work")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))


def _dirs():
    return {
        "decisions": VAULT_PATH / "03-Decisions",
        "goals": VAULT_PATH / "01-Goals",
        "focus": VAULT_PATH / "02-Focus",
        "projects": VAULT_PATH / "04-Projects",
    }


def _ensure_dirs():
    for d in _dirs().values():
        d.mkdir(parents=True, exist_ok=True)


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", slug).strip("-")[:60]


def _read_md_files(directory: Path) -> list[dict]:
    items = []
    if not directory.exists():
        return items
    for f in sorted(directory.glob("*.md"), reverse=True):
        content = f.read_text()
        lines = content.strip().split("\n")
        title = lines[0].lstrip("# ").strip() if lines else f.stem
        # Extract frontmatter-like metadata from the body
        meta = {}
        for line in lines[1:20]:
            if line.startswith("**") and ":**" in line:
                key = line.split(":**")[0].strip("* ")
                val = line.split(":**")[1].strip().rstrip("*")
                meta[key.lower()] = val
        items.append({
            "file": f.name,
            "path": str(f),
            "title": title,
            "meta": meta,
            "content": content,
        })
    return items


@server.tool()
async def create_decision(
    title: str,
    context: str,
    options: list[str],
    decision: str,
    rationale: str,
    expected_outcome: str,
    review_date: str | None = None,
) -> dict:
    """Record a product decision with full context and rationale.

    Decisions are the most valuable artifacts a PM produces. This captures
    the 'why' behind choices for future reference.

    Args:
        title: Short decision title.
        context: What situation or question prompted this decision.
        options: List of options that were considered.
        decision: The option chosen.
        rationale: Why this option was chosen over alternatives.
        expected_outcome: What you expect to happen as a result.
        review_date: When to review the outcome (YYYY-MM-DD). Optional.
    """
    _ensure_dirs()
    decisions_dir = _dirs()["decisions"]
    slug = _slugify(title)
    filename = f"{_today()}-{slug}.md"

    options_md = "\n".join(f"{i+1}. {opt}" for i, opt in enumerate(options))

    content = (
        f"# {title}\n\n"
        f"**Date:** {_today()}\n"
        f"**Status:** decided\n"
    )
    if review_date:
        content += f"**Review by:** {review_date}\n"
    content += (
        f"\n## Context\n\n{context}\n\n"
        f"## Options Considered\n\n{options_md}\n\n"
        f"## Decision\n\n{decision}\n\n"
        f"## Rationale\n\n{rationale}\n\n"
        f"## Expected Outcome\n\n{expected_outcome}\n\n"
        f"## Actual Outcome\n\n*Pending review.*\n"
    )

    filepath = decisions_dir / filename
    filepath.write_text(content)

    return {
        "status": "created",
        "file": filename,
        "path": str(filepath),
        "title": title,
        "review_date": review_date,
        "message": f"Decision recorded: '{title}'."
                   + (f" Review scheduled for {review_date}." if review_date else ""),
    }


@server.tool()
async def list_decisions(
    period: str | None = None,
    status: str | None = None,
) -> dict:
    """List recorded decisions with optional filters.

    Args:
        period: Filter by date prefix, e.g. '2026-Q1', '2026-03', '2026'.
        status: Filter by status: 'decided', 'reviewed', 'reversed'.
    """
    decisions = _read_md_files(_dirs()["decisions"])

    if period:
        if "Q" in period:
            year, q = period.split("-Q")
            q_ranges = {"1": ("01", "03"), "2": ("04", "06"), "3": ("07", "09"), "4": ("10", "12")}
            start, end = q_ranges.get(q, ("01", "12"))
            decisions = [d for d in decisions if d["file"][:4] == year and start <= d["file"][5:7] <= end]
        else:
            decisions = [d for d in decisions if d["file"].startswith(period)]

    if status:
        decisions = [d for d in decisions if d["meta"].get("status", "").lower() == status.lower()]

    return {
        "decisions": [
            {
                "file": d["file"],
                "title": d["title"],
                "date": d["file"][:10],
                "status": d["meta"].get("status", "decided"),
                "review_by": d["meta"].get("review by"),
            }
            for d in decisions
        ],
        "total": len(decisions),
    }


@server.tool()
async def update_decision_outcome(
    decision_file: str,
    actual_outcome: str,
) -> dict:
    """Backfill the actual outcome of a decision.

    Args:
        decision_file: Filename of the decision (e.g., '2026-03-15-api-strategy.md').
        actual_outcome: What actually happened.
    """
    filepath = _dirs()["decisions"] / decision_file
    if not filepath.exists():
        return {"error": f"Decision file not found: {decision_file}"}

    content = filepath.read_text()
    updated = content.replace(
        "## Actual Outcome\n\n*Pending review.*",
        f"## Actual Outcome\n\n{actual_outcome}\n\n*Reviewed: {_now_ts()}*"
    )
    updated = updated.replace("**Status:** decided", "**Status:** reviewed")
    filepath.write_text(updated)

    return {
        "status": "updated",
        "file": decision_file,
        "message": f"Decision outcome recorded and status changed to 'reviewed'.",
    }


@server.tool()
async def get_decisions_pending_review() -> dict:
    """Return decisions that are past their review date but don't have actual outcomes."""
    decisions = _read_md_files(_dirs()["decisions"])
    today = _today()
    pending = []

    for d in decisions:
        review_date = d["meta"].get("review by", "")
        status = d["meta"].get("status", "decided")
        if review_date and review_date <= today and status == "decided":
            pending.append({
                "file": d["file"],
                "title": d["title"],
                "review_by": review_date,
                "days_overdue": (datetime.now() - datetime.strptime(review_date, "%Y-%m-%d")).days,
            })

    return {
        "pending": pending,
        "total": len(pending),
        "message": f"{len(pending)} decision(s) pending review." if pending else "No decisions pending review.",
    }


@server.tool()
async def create_goal(
    title: str,
    description: str,
    quarter: str,
    key_results: list[str] | None = None,
) -> dict:
    """Create a quarterly goal with optional key results.

    Args:
        title: Goal title.
        description: What achieving this goal means.
        quarter: Quarter identifier (e.g., '2026-Q2').
        key_results: Measurable outcomes that indicate success.
    """
    _ensure_dirs()
    goals_dir = _dirs()["goals"]
    slug = _slugify(title)
    filename = f"{quarter}-{slug}.md"

    content = (
        f"# {title}\n\n"
        f"**Quarter:** {quarter}\n"
        f"**Status:** active\n"
        f"**Created:** {_today()}\n\n"
        f"## Description\n\n{description}\n\n"
    )

    if key_results:
        content += "## Key Results\n\n"
        for kr in key_results:
            content += f"- [ ] {kr}\n"
        content += "\n"

    content += "## Progress Notes\n\n*No updates yet.*\n"

    filepath = goals_dir / filename
    filepath.write_text(content)

    return {
        "status": "created",
        "file": filename,
        "path": str(filepath),
        "title": title,
        "quarter": quarter,
        "key_results_count": len(key_results) if key_results else 0,
    }


@server.tool()
async def set_weekly_focus(items: list[str]) -> dict:
    """Write or overwrite this week's focus priorities.

    Args:
        items: List of focus items for this week (max 5 recommended).
    """
    _ensure_dirs()
    focus_dir = _dirs()["focus"]
    filepath = focus_dir / "Week_Priorities.md"

    # Determine week
    now = datetime.now()
    week_num = now.isocalendar()[1]
    week_label = f"Week {week_num} ({now.strftime('%B %d')})"

    content = (
        f"# Weekly Focus — {week_label}\n\n"
        f"*Updated: {_now_ts()}*\n\n"
    )
    for i, item in enumerate(items, 1):
        content += f"{i}. {item}\n"

    filepath.write_text(content)

    return {
        "status": "set",
        "path": str(filepath),
        "items": items,
        "week": week_label,
        "message": f"Weekly focus set: {len(items)} priorities for {week_label}.",
    }


@server.tool()
async def get_work_summary() -> dict:
    """Return a summary: open goals, this week's focus, recent decisions, pending reviews."""
    dirs = _dirs()

    # Goals
    goals = _read_md_files(dirs["goals"])
    active_goals = [g for g in goals if g["meta"].get("status", "").lower() == "active"]

    # Focus
    focus_file = dirs["focus"] / "Week_Priorities.md"
    focus_items = []
    if focus_file.exists():
        for line in focus_file.read_text().split("\n"):
            stripped = line.strip()
            if re.match(r"^\d+\.\s", stripped):
                focus_items.append(re.sub(r"^\d+\.\s*", "", stripped))

    # Decisions (last 5)
    decisions = _read_md_files(dirs["decisions"])[:5]

    # Pending reviews
    pending = await get_decisions_pending_review()

    # Projects
    projects = _read_md_files(dirs["projects"])
    active_projects = [p for p in projects if p["meta"].get("status", "").lower() == "active"]

    return {
        "goals": {
            "active": [{"title": g["title"], "quarter": g["meta"].get("quarter")} for g in active_goals],
            "total_active": len(active_goals),
        },
        "focus": {
            "items": focus_items,
            "count": len(focus_items),
        },
        "decisions": {
            "recent": [{"title": d["title"], "date": d["file"][:10]} for d in decisions],
            "pending_review": pending["total"],
        },
        "projects": {
            "active": [{"title": p["title"]} for p in active_projects],
            "total_active": len(active_projects),
        },
    }


@server.tool()
async def create_project(
    name: str,
    description: str,
    stakeholders: list[str] | None = None,
    status: str = "active",
) -> dict:
    """Create a project page in the vault.

    Args:
        name: Project name.
        description: What this project is about.
        stakeholders: Key people involved.
        status: Project status (active, paused, complete).
    """
    _ensure_dirs()
    projects_dir = _dirs()["projects"]
    slug = _slugify(name)
    filename = f"{slug}.md"

    content = (
        f"# {name}\n\n"
        f"**Status:** {status}\n"
        f"**Created:** {_today()}\n"
    )
    if stakeholders:
        content += f"**Stakeholders:** {', '.join(stakeholders)}\n"

    content += (
        f"\n## Overview\n\n{description}\n\n"
        f"## Key Decisions\n\n*None yet.*\n\n"
        f"## Open Questions\n\n*None yet.*\n\n"
        f"## Progress Log\n\n### {_today()}\n\nProject created.\n"
    )

    filepath = projects_dir / filename
    filepath.write_text(content)

    return {
        "status": "created",
        "file": filename,
        "path": str(filepath),
        "name": name,
        "message": f"Project '{name}' created.",
    }


if __name__ == "__main__":
    server.run()
