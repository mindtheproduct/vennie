"""
Vennie AI News Aggregation MCP Server.

Surfaces the one AI news item worth knowing today. Caches signals
in the vault for history and reduces noise to signal.
"""

import hashlib
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from mcp.server.fastmcp import FastMCP

server = FastMCP("vennie-news")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
SIGNALS_DIR = VAULT_PATH / "00-Inbox" / "Signals"
SOURCES_FILE = VAULT_PATH / "System" / "news-sources.json"

DEFAULT_SOURCES = [
    {"name": "Anthropic Blog", "url": "https://www.anthropic.com/news", "category": "ai_labs"},
    {"name": "OpenAI Blog", "url": "https://openai.com/blog", "category": "ai_labs"},
    {"name": "The Verge AI", "url": "https://www.theverge.com/ai-artificial-intelligence", "category": "tech_news"},
    {"name": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/", "category": "tech_news"},
    {"name": "Lenny's Newsletter", "url": "https://www.lennysnewsletter.com", "category": "product"},
    {"name": "SVPG Blog", "url": "https://www.svpg.com/articles/", "category": "product"},
]


def _ensure_dirs():
    SIGNALS_DIR.mkdir(parents=True, exist_ok=True)
    SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _load_sources() -> list[dict]:
    if SOURCES_FILE.exists():
        try:
            return json.loads(SOURCES_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return DEFAULT_SOURCES


def _save_sources(sources: list[dict]) -> None:
    _ensure_dirs()
    SOURCES_FILE.write_text(json.dumps(sources, indent=2))


def _signal_id(title: str) -> str:
    return hashlib.md5(title.encode()).hexdigest()[:8]


def _load_signals(days: int = 7) -> list[dict]:
    """Load cached signal files from the last N days."""
    signals = []
    if not SIGNALS_DIR.exists():
        return signals
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    for f in sorted(SIGNALS_DIR.glob("*.json"), reverse=True):
        if f.stem[:10] < cutoff:
            continue
        try:
            data = json.loads(f.read_text())
            if isinstance(data, list):
                signals.extend(data)
            else:
                signals.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return signals


def _save_signal(signal: dict) -> Path:
    _ensure_dirs()
    filename = f"{_today()}-{signal.get('id', 'unknown')}.json"
    filepath = SIGNALS_DIR / filename
    filepath.write_text(json.dumps(signal, indent=2))
    return filepath


@server.tool()
async def get_todays_signal() -> dict:
    """Return the one AI news item worth knowing today.

    Checks cached signals first. If none for today, returns the most recent
    cached signal with a note to run refresh_news().
    """
    today = _today()
    signals = _load_signals(days=1)

    todays = [s for s in signals if s.get("date") == today]
    if todays:
        top = todays[0]
        return {
            "status": "fresh",
            "signal": top,
            "message": f"Today's signal: {top.get('title', 'Unknown')}",
        }

    # Fall back to most recent
    all_signals = _load_signals(days=7)
    if all_signals:
        latest = all_signals[0]
        return {
            "status": "stale",
            "signal": latest,
            "message": f"No fresh signal today. Latest from {latest.get('date', '?')}: {latest.get('title', 'Unknown')}. "
                       "Run refresh_news() to fetch new items.",
        }

    return {
        "status": "empty",
        "signal": None,
        "message": "No signals cached yet. Run refresh_news() to populate.",
    }


@server.tool()
async def refresh_news(sources: list[str] | None = None) -> dict:
    """Scrape news sources, rank by PM relevance, and cache the top item.

    In the current version, this creates a placeholder signal. Full scraping
    requires a web fetching tool (Scrapling, etc.) to be wired in.

    Args:
        sources: Optional list of source names to check. Defaults to all configured sources.
    """
    _ensure_dirs()
    configured = _load_sources()

    if sources:
        configured = [s for s in configured if s["name"] in sources]

    # Placeholder: in production, this would scrape each source URL
    # and use LLM ranking to pick the most PM-relevant item
    signal = {
        "id": _signal_id(f"placeholder-{_today()}"),
        "date": _today(),
        "title": "News refresh pending",
        "summary": "Vennie checked your configured sources but needs a web fetching tool "
                   "(like Scrapling MCP) to scrape content. Wire up a fetch tool and this "
                   "will return real, ranked AI news.",
        "source": "system",
        "url": None,
        "pm_relevance": "high",
        "sources_checked": [s["name"] for s in configured],
        "refreshed_at": datetime.now().isoformat(),
    }

    filepath = _save_signal(signal)

    return {
        "status": "refreshed",
        "signal": signal,
        "sources_checked": len(configured),
        "cached_at": str(filepath),
        "message": f"Checked {len(configured)} sources. Signal cached.",
    }


@server.tool()
async def get_news_history(days: int = 7) -> dict:
    """Return past signals from the cache.

    Args:
        days: Number of days to look back. Default 7.
    """
    signals = _load_signals(days=days)
    return {
        "signals": signals,
        "total": len(signals),
        "period_days": days,
    }


@server.tool()
async def add_news_source(name: str, url: str, category: str) -> dict:
    """Add a custom news source to monitor.

    Args:
        name: Display name for the source (e.g., 'Stratechery').
        url: URL to scrape for news.
        category: Source category (ai_labs, tech_news, product, industry, other).
    """
    sources = _load_sources()

    # Check for duplicates
    if any(s["name"].lower() == name.lower() for s in sources):
        return {"error": f"Source '{name}' already exists."}

    sources.append({"name": name, "url": url, "category": category})
    _save_sources(sources)

    return {
        "status": "added",
        "name": name,
        "url": url,
        "category": category,
        "total_sources": len(sources),
    }


@server.tool()
async def list_news_sources() -> dict:
    """List all configured news sources."""
    sources = _load_sources()
    return {
        "sources": sources,
        "total": len(sources),
    }


if __name__ == "__main__":
    server.run()
