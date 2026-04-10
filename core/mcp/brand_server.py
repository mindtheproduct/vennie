"""
Vennie Personal Brand Management MCP Server.

Generates content from evidence, manages LinkedIn drafts, newsletters,
and builds a content calendar from your actual work.
"""

import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("vennie-brand")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))


def _dirs():
    return {
        "linkedin": VAULT_PATH / "07-Brand" / "LinkedIn",
        "newsletter": VAULT_PATH / "07-Brand" / "Newsletter",
        "talks": VAULT_PATH / "07-Brand" / "Talks",
        "wins": VAULT_PATH / "06-Evidence" / "Wins",
        "learnings": VAULT_PATH / "06-Evidence" / "Learnings",
        "decisions": VAULT_PATH / "03-Decisions",
        "voice": VAULT_PATH / "System" / "voice.yaml",
    }


def _ensure_dirs():
    for key in ["linkedin", "newsletter", "talks"]:
        _dirs()[key].mkdir(parents=True, exist_ok=True)


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _now_ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", slug).strip("-")[:60]


def _read_md_files(directory: Path, limit: int = 20) -> list[dict]:
    if not directory.exists():
        return []
    items = []
    for f in sorted(directory.glob("*.md"), reverse=True)[:limit]:
        content = f.read_text()
        lines = content.strip().split("\n")
        title = lines[0].lstrip("# ").strip() if lines else f.stem
        items.append({"file": f.name, "title": title, "content": content})
    return items


def _load_voice_hints() -> dict:
    """Load voice profile hints for content generation."""
    voice_path = _dirs()["voice"]
    if not voice_path.exists():
        return {"formality": "professional_casual", "quirks": []}
    # Simplified read
    content = voice_path.read_text()
    hints = {"formality": "professional_casual", "quirks": []}
    for line in content.split("\n"):
        if "formality:" in line.lower():
            hints["formality"] = line.split(":")[-1].strip().strip('"').strip("'")
    return hints


@server.tool()
async def generate_linkedin_post(
    topic: str,
    evidence_refs: list[str] | None = None,
    tone: str | None = None,
) -> dict:
    """Generate a LinkedIn post draft using the user's voice profile.

    Returns a draft that matches the user's writing style. The AI should
    refine this further before posting.

    Args:
        topic: What the post is about.
        evidence_refs: Optional list of evidence file names to reference.
        tone: Override tone (thoughtful, bold, vulnerable, tactical). Uses voice.yaml default otherwise.
    """
    voice = _load_voice_hints()
    effective_tone = tone or voice.get("formality", "professional_casual")

    # Gather evidence content if referenced
    evidence_content = []
    if evidence_refs:
        dirs = _dirs()
        for ref in evidence_refs:
            for search_dir in [dirs["wins"], dirs["learnings"], dirs["decisions"]]:
                filepath = search_dir / ref
                if filepath.exists():
                    evidence_content.append(filepath.read_text()[:500])

    # Build a structured draft prompt (the AI layer will refine this)
    draft_lines = [
        f"# LinkedIn Draft: {topic}",
        "",
        f"**Tone:** {effective_tone}",
        f"**Generated:** {_now_ts()}",
        f"**Status:** draft",
        "",
        "---",
        "",
        f"[Hook line about {topic}]",
        "",
        f"[2-3 paragraphs expanding on {topic} with personal experience]",
        "",
    ]

    if evidence_content:
        draft_lines.append("**Evidence to weave in:**")
        for i, ev in enumerate(evidence_content, 1):
            # First 200 chars of each evidence piece
            preview = ev.replace("\n", " ")[:200]
            draft_lines.append(f"{i}. {preview}...")
        draft_lines.append("")

    draft_lines.extend([
        "[Closing insight or call to action]",
        "",
        "---",
        "*Edit this draft to match your voice. Vennie generated the structure, you add the soul.*",
    ])

    draft = "\n".join(draft_lines)

    return {
        "status": "generated",
        "topic": topic,
        "tone": effective_tone,
        "draft": draft,
        "evidence_count": len(evidence_content),
        "message": "Draft generated. Review, edit, and make it yours.",
    }


@server.tool()
async def generate_content_calendar(weeks: int = 4) -> dict:
    """Create a content calendar from recent wins, decisions, and learnings.

    Analyzes your evidence vault and suggests what to post and when.

    Args:
        weeks: Number of weeks to plan. Default 4.
    """
    dirs = _dirs()
    wins = _read_md_files(dirs["wins"], limit=10)
    learnings = _read_md_files(dirs["learnings"], limit=10)
    decisions = _read_md_files(dirs["decisions"], limit=10)

    # Generate calendar entries from evidence
    calendar = []
    sources = []
    sources.extend([{"title": w["title"], "type": "win", "file": w["file"]} for w in wins])
    sources.extend([{"title": l["title"], "type": "learning", "file": l["file"]} for l in learnings])
    sources.extend([{"title": d["title"], "type": "decision", "file": d["file"]} for d in decisions])

    # Spread across weeks
    today = datetime.now()
    for i, source in enumerate(sources[:weeks * 2]):  # ~2 posts per week
        week_offset = i // 2
        day_offset = (i % 2) * 3 + 1  # Tuesday and Friday-ish
        post_date = today + timedelta(weeks=week_offset, days=day_offset)

        content_type_map = {
            "win": "Achievement post",
            "learning": "Lessons learned post",
            "decision": "Decision-making insight post",
        }

        calendar.append({
            "date": post_date.strftime("%Y-%m-%d"),
            "day": post_date.strftime("%A"),
            "week": week_offset + 1,
            "topic": source["title"],
            "content_type": content_type_map.get(source["type"], "General post"),
            "source_file": source["file"],
            "platform": "LinkedIn",
        })

    return {
        "calendar": calendar,
        "total_posts": len(calendar),
        "weeks_covered": weeks,
        "evidence_available": {
            "wins": len(wins),
            "learnings": len(learnings),
            "decisions": len(decisions),
        },
        "message": f"Content calendar generated: {len(calendar)} posts across {weeks} weeks.",
    }


@server.tool()
async def get_brand_stats() -> dict:
    """Return brand activity stats: posts written, talks given, content published."""
    dirs = _dirs()
    linkedin_posts = list(dirs["linkedin"].glob("*.md")) if dirs["linkedin"].exists() else []
    newsletters = list(dirs["newsletter"].glob("*.md")) if dirs["newsletter"].exists() else []
    talks = list(dirs["talks"].glob("*.md")) if dirs["talks"].exists() else []

    # Count by status
    drafts = 0
    published = 0
    for f in linkedin_posts:
        content = f.read_text()
        if "**Status:** published" in content:
            published += 1
        else:
            drafts += 1

    return {
        "linkedin": {
            "total": len(linkedin_posts),
            "drafts": drafts,
            "published": published,
        },
        "newsletters": {
            "total": len(newsletters),
        },
        "talks": {
            "total": len(talks),
        },
        "total_content_pieces": len(linkedin_posts) + len(newsletters) + len(talks),
    }


@server.tool()
async def suggest_content_ideas(count: int = 5) -> dict:
    """Analyze evidence and decisions to suggest content ideas.

    Args:
        count: Number of ideas to suggest. Default 5.
    """
    dirs = _dirs()
    wins = _read_md_files(dirs["wins"], limit=10)
    learnings = _read_md_files(dirs["learnings"], limit=10)
    decisions = _read_md_files(dirs["decisions"], limit=10)

    ideas = []

    # Generate ideas from evidence
    for w in wins[:count]:
        ideas.append({
            "title": f"How I achieved: {w['title']}",
            "angle": "achievement_story",
            "source": w["file"],
            "why": "People love concrete results with the backstory.",
        })

    for l in learnings[:count]:
        ideas.append({
            "title": f"What I learned: {l['title']}",
            "angle": "lesson_learned",
            "source": l["file"],
            "why": "Vulnerability and growth resonate on LinkedIn.",
        })

    for d in decisions[:count]:
        ideas.append({
            "title": f"Why I decided: {d['title']}",
            "angle": "decision_insight",
            "source": d["file"],
            "why": "Decision-making frameworks get saved and shared.",
        })

    # Trim to requested count
    ideas = ideas[:count]

    return {
        "ideas": ideas,
        "total": len(ideas),
        "evidence_scanned": {
            "wins": len(wins),
            "learnings": len(learnings),
            "decisions": len(decisions),
        },
    }


@server.tool()
async def save_linkedin_post(
    content: str,
    status: str = "draft",
) -> dict:
    """Save a LinkedIn post to the brand vault.

    Args:
        content: The post content (markdown).
        status: Post status — 'draft', 'ready', or 'published'.
    """
    _ensure_dirs()
    linkedin_dir = _dirs()["linkedin"]

    # Extract title from first line or generate one
    lines = content.strip().split("\n")
    title = lines[0].lstrip("# ").strip() if lines else "Untitled Post"
    slug = _slugify(title)
    filename = f"{_today()}-{slug}.md"

    # Ensure status header exists
    if "**Status:**" not in content:
        content = f"**Status:** {status}\n**Saved:** {_now_ts()}\n\n{content}"

    filepath = linkedin_dir / filename
    filepath.write_text(content)

    return {
        "status": "saved",
        "file": filename,
        "path": str(filepath),
        "post_status": status,
        "title": title,
    }


@server.tool()
async def save_newsletter_draft(
    title: str,
    content: str,
) -> dict:
    """Save a newsletter draft to the brand vault.

    Args:
        title: Newsletter edition title.
        content: Full newsletter content (markdown).
    """
    _ensure_dirs()
    newsletter_dir = _dirs()["newsletter"]
    slug = _slugify(title)
    filename = f"{_today()}-{slug}.md"

    full_content = (
        f"# {title}\n\n"
        f"**Status:** draft\n"
        f"**Created:** {_now_ts()}\n\n"
        f"---\n\n"
        f"{content}\n"
    )

    filepath = newsletter_dir / filename
    filepath.write_text(full_content)

    return {
        "status": "saved",
        "file": filename,
        "path": str(filepath),
        "title": title,
    }


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
