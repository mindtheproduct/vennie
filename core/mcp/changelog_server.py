"""
Vennie Changelog Monitor MCP Server.

Tracks tool changelogs so PMs know when their stack changes.
Monitors Claude Code, Cursor, Linear, Figma, Notion, and custom tools.
"""

import hashlib
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from mcp.server.fastmcp import FastMCP

server = FastMCP("vennie-changelog")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
TOOLS_FILE = VAULT_PATH / "System" / "monitored-tools.json"
UPDATES_DIR = VAULT_PATH / "System" / ".changelog-cache"

DEFAULT_TOOLS = [
    {
        "name": "Claude Code",
        "changelog_url": "https://docs.anthropic.com/en/docs/claude-code/changelog",
        "category": "ai",
    },
    {
        "name": "Cursor",
        "changelog_url": "https://changelog.cursor.com",
        "category": "ai",
    },
    {
        "name": "Linear",
        "changelog_url": "https://linear.app/changelog",
        "category": "project_management",
    },
    {
        "name": "Figma",
        "changelog_url": "https://www.figma.com/release-notes/",
        "category": "design",
    },
    {
        "name": "Notion",
        "changelog_url": "https://www.notion.so/releases",
        "category": "knowledge",
    },
]


def _ensure_dirs():
    TOOLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)


def _load_tools() -> list[dict]:
    if TOOLS_FILE.exists():
        try:
            return json.loads(TOOLS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return DEFAULT_TOOLS


def _save_tools(tools: list[dict]) -> None:
    _ensure_dirs()
    TOOLS_FILE.write_text(json.dumps(tools, indent=2))


def _update_id(tool: str, title: str) -> str:
    return hashlib.md5(f"{tool}:{title}".encode()).hexdigest()[:10]


def _load_updates(days: int = 30) -> list[dict]:
    updates = []
    if not UPDATES_DIR.exists():
        return updates
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    for f in sorted(UPDATES_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("date", "") >= cutoff:
                    updates.append(item)
        except (json.JSONDecodeError, OSError):
            continue
    return updates


def _save_update(update: dict) -> Path:
    _ensure_dirs()
    uid = update.get("id", "unknown")
    filepath = UPDATES_DIR / f"{uid}.json"
    filepath.write_text(json.dumps(update, indent=2))
    return filepath


@server.tool()
async def check_changelogs() -> dict:
    """Check all monitored tools for new updates.

    In the current version, returns a placeholder. Full scraping requires
    a web fetching tool to be wired in. The structure is ready for real data.
    """
    _ensure_dirs()
    tools = _load_tools()

    # Placeholder: in production this would scrape each changelog URL
    results = []
    for tool in tools:
        placeholder = {
            "id": _update_id(tool["name"], f"check-{datetime.now().strftime('%Y%m%d')}"),
            "tool": tool["name"],
            "category": tool["category"],
            "date": datetime.now().strftime("%Y-%m-%d"),
            "title": f"{tool['name']} changelog check",
            "summary": f"Checked {tool['changelog_url']} — wire up a web fetching tool for real data.",
            "url": tool["changelog_url"],
            "seen": False,
            "checked_at": datetime.now().isoformat(),
        }
        results.append(placeholder)

    return {
        "status": "checked",
        "tools_checked": len(tools),
        "updates": results,
        "message": f"Checked {len(tools)} tools. Wire up Scrapling or similar for real changelog data.",
    }


@server.tool()
async def get_changelog_updates(
    tool: str | None = None,
    days: int = 7,
) -> dict:
    """Return recent changelog entries from the cache.

    Args:
        tool: Filter to a specific tool name. None for all tools.
        days: Number of days to look back. Default 7.
    """
    updates = _load_updates(days=days)

    if tool:
        updates = [u for u in updates if u.get("tool", "").lower() == tool.lower()]

    unseen = [u for u in updates if not u.get("seen", False)]

    return {
        "updates": updates,
        "total": len(updates),
        "unseen": len(unseen),
        "period_days": days,
        "filter_tool": tool,
    }


@server.tool()
async def add_monitored_tool(
    name: str,
    changelog_url: str,
    category: str,
) -> dict:
    """Add a tool to the changelog monitoring list.

    Args:
        name: Tool display name (e.g., 'Vercel').
        changelog_url: URL where the tool publishes its changelog.
        category: Tool category (ai, project_management, design, knowledge, devtools, other).
    """
    tools = _load_tools()

    if any(t["name"].lower() == name.lower() for t in tools):
        return {"error": f"Tool '{name}' is already monitored."}

    tools.append({
        "name": name,
        "changelog_url": changelog_url,
        "category": category,
    })
    _save_tools(tools)

    return {
        "status": "added",
        "name": name,
        "changelog_url": changelog_url,
        "category": category,
        "total_monitored": len(tools),
    }


@server.tool()
async def list_monitored_tools() -> dict:
    """List all tools being monitored for changelog updates."""
    tools = _load_tools()
    return {
        "tools": tools,
        "total": len(tools),
    }


@server.tool()
async def mark_update_seen(update_id: str) -> dict:
    """Mark a changelog update as seen/acknowledged.

    Args:
        update_id: The update ID to mark as seen.
    """
    filepath = UPDATES_DIR / f"{update_id}.json"
    if not filepath.exists():
        return {"error": f"Update '{update_id}' not found."}

    try:
        data = json.loads(filepath.read_text())
        data["seen"] = True
        data["seen_at"] = datetime.now().isoformat()
        filepath.write_text(json.dumps(data, indent=2))
        return {"status": "marked_seen", "id": update_id}
    except (json.JSONDecodeError, OSError) as e:
        return {"error": f"Failed to update: {e}"}


if __name__ == "__main__":
    server.run()
