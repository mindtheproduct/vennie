"""
Vennie Career Coaching & Evidence MCP Server.

Captures wins, learnings, and feedback. Generates brag sheets and
review prep materials from accumulated evidence.
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("vennie-career")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))


def _paths():
    wins = VAULT_PATH / "06-Evidence" / "Wins"
    learnings = VAULT_PATH / "06-Evidence" / "Learnings"
    feedback = VAULT_PATH / "06-Evidence" / "Feedback"
    personality = VAULT_PATH / "System" / "personality-model.md"
    return wins, learnings, feedback, personality


def _ensure_dirs():
    for d in _paths()[:3]:
        d.mkdir(parents=True, exist_ok=True)


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _next_id(directory: Path, prefix: str) -> str:
    existing = list(directory.glob(f"{prefix}-*.md"))
    nums = []
    for f in existing:
        parts = f.stem.split("-")
        if parts and parts[-1].isdigit():
            nums.append(int(parts[-1]))
    next_num = max(nums, default=0) + 1
    return f"{prefix}-{next_num:03d}"


def _read_all_evidence(directory: Path) -> list[dict]:
    """Read all markdown files in a directory and return basic metadata."""
    items = []
    if not directory.exists():
        return items
    for f in sorted(directory.glob("*.md")):
        content = f.read_text()
        lines = content.strip().split("\n")
        title = lines[0].lstrip("# ").strip() if lines else f.stem
        items.append({
            "file": f.name,
            "title": title,
            "content": content,
            "date": f.stem[:10] if len(f.stem) >= 10 else None,
        })
    return items


@server.tool()
async def capture_win(
    title: str,
    description: str,
    metrics: str | None = None,
    stakeholders: str | None = None,
    date: str | None = None,
) -> dict:
    """Save a structured win to the evidence vault.

    Args:
        title: Short title for the win.
        description: What happened and why it matters.
        metrics: Quantifiable impact (revenue, time saved, users affected).
        stakeholders: People involved or who noticed.
        date: When it happened (YYYY-MM-DD). Defaults to today.
    """
    _ensure_dirs()
    wins_dir = _paths()[0]
    win_date = date or _today()
    win_id = _next_id(wins_dir, win_date)
    filename = f"{win_id}.md"

    lines = [
        f"# {title}",
        "",
        f"**Date:** {win_date}",
        f"**Captured:** {_now_ts()}",
        "",
        "## What Happened",
        "",
        description,
        "",
    ]

    if metrics:
        lines.extend(["## Metrics", "", metrics, ""])
    if stakeholders:
        lines.extend(["## Stakeholders", "", stakeholders, ""])

    filepath = wins_dir / filename
    filepath.write_text("\n".join(lines))

    return {
        "status": "captured",
        "type": "win",
        "file": filename,
        "path": str(filepath),
        "title": title,
        "date": win_date,
    }


@server.tool()
async def capture_learning(
    title: str,
    what_happened: str,
    why_it_matters: str,
    date: str | None = None,
) -> dict:
    """Save a learning to the evidence vault.

    Args:
        title: Short title for the learning.
        what_happened: Specific situation or context.
        why_it_matters: Impact on your work or growth.
        date: When it happened (YYYY-MM-DD). Defaults to today.
    """
    _ensure_dirs()
    learnings_dir = _paths()[1]
    learn_date = date or _today()
    learn_id = _next_id(learnings_dir, learn_date)
    filename = f"{learn_id}.md"

    content = (
        f"# {title}\n\n"
        f"**Date:** {learn_date}\n"
        f"**Captured:** {_now_ts()}\n\n"
        f"## What Happened\n\n{what_happened}\n\n"
        f"## Why It Matters\n\n{why_it_matters}\n"
    )

    filepath = learnings_dir / filename
    filepath.write_text(content)

    return {
        "status": "captured",
        "type": "learning",
        "file": filename,
        "path": str(filepath),
        "title": title,
        "date": learn_date,
    }


@server.tool()
async def capture_feedback(
    source: str,
    content: str,
    sentiment: str,
    date: str | None = None,
) -> dict:
    """Save feedback received from someone.

    Args:
        source: Who gave the feedback (name, role, or context like '1:1 with manager').
        content: The actual feedback.
        sentiment: positive, constructive, or mixed.
        date: When received (YYYY-MM-DD). Defaults to today.
    """
    _ensure_dirs()
    feedback_dir = _paths()[2]
    fb_date = date or _today()
    fb_id = _next_id(feedback_dir, fb_date)
    filename = f"{fb_id}.md"

    valid_sentiments = ["positive", "constructive", "mixed"]
    if sentiment.lower() not in valid_sentiments:
        return {"error": f"Sentiment must be one of: {', '.join(valid_sentiments)}"}

    fb_content = (
        f"# Feedback from {source}\n\n"
        f"**Date:** {fb_date}\n"
        f"**Sentiment:** {sentiment.lower()}\n"
        f"**Captured:** {_now_ts()}\n\n"
        f"## Feedback\n\n{content}\n"
    )

    filepath = feedback_dir / filename
    filepath.write_text(fb_content)

    return {
        "status": "captured",
        "type": "feedback",
        "file": filename,
        "path": str(filepath),
        "source": source,
        "sentiment": sentiment.lower(),
        "date": fb_date,
    }


@server.tool()
async def generate_brag_sheet(
    format: str = "markdown",
    period: str | None = None,
) -> dict:
    """Compile all evidence into a formatted brag sheet.

    Args:
        format: Output format — 'markdown' or 'json'.
        period: Filter to a time period, e.g. '2026-Q1' or '2026-03'. None for all.
    """
    wins_dir, learnings_dir, feedback_dir, _ = _paths()
    wins = _read_all_evidence(wins_dir)
    learnings = _read_all_evidence(learnings_dir)
    feedback = _read_all_evidence(feedback_dir)

    # Filter by period if specified
    if period:
        def matches_period(item):
            d = item.get("date", "")
            if not d:
                return True
            if "Q" in period:
                year, q = period.split("-Q")
                q_start = {"1": "01", "2": "04", "3": "07", "4": "10"}[q]
                q_end = {"1": "03", "2": "06", "3": "09", "4": "12"}[q]
                return d[:4] == year and q_start <= d[5:7] <= q_end
            return d.startswith(period)

        wins = [w for w in wins if matches_period(w)]
        learnings = [l for l in learnings if matches_period(l)]
        feedback = [f for f in feedback if matches_period(f)]

    if format == "json":
        return {
            "period": period or "all",
            "wins": [{"title": w["title"], "date": w["date"]} for w in wins],
            "learnings": [{"title": l["title"], "date": l["date"]} for l in learnings],
            "feedback": [{"title": f["title"], "date": f["date"]} for f in feedback],
            "totals": {
                "wins": len(wins),
                "learnings": len(learnings),
                "feedback": len(feedback),
            },
        }

    # Markdown format
    lines = [f"# Brag Sheet{f' — {period}' if period else ''}", ""]
    lines.append(f"*Generated: {_now_ts()}*\n")

    if wins:
        lines.append("## Wins\n")
        for w in wins:
            lines.append(f"### {w['title']}")
            lines.append(f"*{w.get('date', 'undated')}*\n")
            # Extract description (skip header and metadata)
            body = "\n".join(w["content"].split("\n")[5:]).strip()
            if body:
                lines.append(body + "\n")

    if learnings:
        lines.append("## Learnings\n")
        for l in learnings:
            lines.append(f"- **{l['title']}** ({l.get('date', 'undated')})")

    if feedback:
        lines.append("\n## Feedback Received\n")
        for f in feedback:
            lines.append(f"- **{f['title']}** ({f.get('date', 'undated')})")

    return {
        "format": "markdown",
        "content": "\n".join(lines),
        "totals": {
            "wins": len(wins),
            "learnings": len(learnings),
            "feedback": len(feedback),
        },
    }


@server.tool()
async def generate_review_prep(
    period: str,
    format: str = "markdown",
) -> dict:
    """Generate a performance review self-assessment from evidence.

    Args:
        period: Time period to cover, e.g. '2026-Q1' or '2026-H1'.
        format: Output format — 'markdown' or 'json'.
    """
    brag = await generate_brag_sheet(format="json", period=period)

    wins = brag.get("wins", [])
    learnings = brag.get("learnings", [])
    feedback = brag.get("feedback", [])

    if format == "json":
        return {
            "period": period,
            "summary": {
                "total_wins": len(wins),
                "total_learnings": len(learnings),
                "total_feedback": len(feedback),
            },
            "wins": wins,
            "learnings": learnings,
            "feedback": feedback,
            "guidance": "Use these evidence points to structure your self-assessment. "
                        "Lead with impact, quantify where possible, show growth trajectory.",
        }

    lines = [
        f"# Performance Review Self-Assessment — {period}",
        "",
        f"*Generated: {_now_ts()}*",
        "",
        "## Impact & Achievements",
        "",
    ]

    if wins:
        for w in wins:
            lines.append(f"- **{w['title']}** ({w['date']})")
    else:
        lines.append("*No wins captured for this period. Consider adding evidence.*")

    lines.extend(["", "## Growth & Learning", ""])
    if learnings:
        for l in learnings:
            lines.append(f"- **{l['title']}** ({l['date']})")
    else:
        lines.append("*No learnings captured.*")

    lines.extend(["", "## Feedback Received", ""])
    if feedback:
        for f in feedback:
            lines.append(f"- **{f['title']}** ({f['date']})")
    else:
        lines.append("*No feedback captured.*")

    lines.extend([
        "",
        "---",
        "",
        "*Tip: Lead with impact, quantify results, show growth trajectory.*",
    ])

    return {
        "format": "markdown",
        "period": period,
        "content": "\n".join(lines),
    }


@server.tool()
async def get_career_stats() -> dict:
    """Return career evidence statistics: totals, quarterly breakdown, skills demonstrated."""
    wins_dir, learnings_dir, feedback_dir, _ = _paths()
    wins = _read_all_evidence(wins_dir)
    learnings = _read_all_evidence(learnings_dir)
    feedback = _read_all_evidence(feedback_dir)

    now = datetime.now()
    q_start_month = ((now.month - 1) // 3) * 3 + 1
    q_start = f"{now.year}-{q_start_month:02d}"

    wins_this_q = [w for w in wins if w.get("date", "") >= q_start]

    return {
        "total_wins": len(wins),
        "total_learnings": len(learnings),
        "total_feedback": len(feedback),
        "wins_this_quarter": len(wins_this_q),
        "evidence_by_category": {
            "wins": len(wins),
            "learnings": len(learnings),
            "feedback": len(feedback),
        },
        "latest_win": wins[-1]["title"] if wins else None,
        "latest_learning": learnings[-1]["title"] if learnings else None,
    }


@server.tool()
async def get_personality_insights() -> dict:
    """Read the personality model and return current understanding of working style."""
    _, _, _, personality_path = _paths()
    if not personality_path.exists():
        return {
            "status": "empty",
            "message": "No personality model yet. Vennie builds this over time.",
        }

    content = personality_path.read_text()
    return {
        "status": "active",
        "content": content,
        "path": str(personality_path),
    }


@server.tool()
async def update_personality_model(insights: str) -> dict:
    """Append new observations to the personality model.

    Args:
        insights: New observations about working style, preferences, or patterns.
    """
    _, _, _, personality_path = _paths()
    personality_path.parent.mkdir(parents=True, exist_ok=True)

    if not personality_path.exists():
        personality_path.write_text(
            "# Personality Model\n\n"
            "Vennie builds this over time by observing your working patterns.\n\n"
            "## Observations\n\n"
        )

    current = personality_path.read_text()
    entry = f"\n### {_now_ts()}\n\n{insights}\n"
    personality_path.write_text(current + entry)

    return {
        "status": "updated",
        "path": str(personality_path),
        "message": "Personality model updated with new observations.",
    }


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
