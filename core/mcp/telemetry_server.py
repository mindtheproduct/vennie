"""
Vennie Telemetry MCP Server.

Anonymous, transparent usage telemetry. Events are batched locally
and optionally sent to api.vennie.ai/telemetry (currently stubbed).
Never sends content — only hashed identifiers and event names.
"""

import hashlib
import json
import os
from datetime import datetime
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("vennie-telemetry")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
TELEMETRY_DIR = VAULT_PATH / "System" / ".telemetry"
CONFIG_FILE = TELEMETRY_DIR / "config.json"
LOG_FILE = TELEMETRY_DIR / "events.jsonl"
PROFILE_FILE = VAULT_PATH / "System" / "profile.yaml"

# Stubbed endpoint
API_ENDPOINT = "https://api.vennie.ai/telemetry"


def _ensure_dirs():
    TELEMETRY_DIR.mkdir(parents=True, exist_ok=True)


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"enabled": True, "created": datetime.now().isoformat()}


def _save_config(config: dict) -> None:
    _ensure_dirs()
    CONFIG_FILE.write_text(json.dumps(config, indent=2))


def _hash_value(value: str) -> str:
    """One-way hash for anonymization."""
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def _get_hashed_domain() -> str | None:
    """Read company domain from profile and hash it."""
    if not PROFILE_FILE.exists():
        return None
    content = PROFILE_FILE.read_text()
    for line in content.split("\n"):
        if line.startswith("company_domain:"):
            domain = line.split(":", 1)[1].strip()
            return _hash_value(domain) if domain else None
    return None


def _get_role_level() -> str | None:
    if not PROFILE_FILE.exists():
        return None
    content = PROFILE_FILE.read_text()
    for line in content.split("\n"):
        if line.startswith("career_level:"):
            return line.split(":", 1)[1].strip()
    return None


def _append_event(event: dict) -> None:
    """Append an event to the local log."""
    _ensure_dirs()
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(event) + "\n")


def _read_events() -> list[dict]:
    """Read all logged events."""
    if not LOG_FILE.exists():
        return []
    events = []
    for line in LOG_FILE.read_text().strip().split("\n"):
        if line.strip():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


@server.tool()
async def track_event(
    event_name: str,
    properties: dict | None = None,
) -> dict:
    """Log an anonymous telemetry event.

    Events are stored locally and optionally batched to the Vennie API.
    Never includes content — only event names and anonymized metadata.

    Args:
        event_name: Name of the event (e.g., 'skill_used', 'persona_activated').
        properties: Optional event properties (skill name, persona name, etc.).
    """
    config = _load_config()
    if not config.get("enabled", True):
        return {"status": "disabled", "message": "Telemetry is disabled. Event not logged."}

    event = {
        "event": event_name,
        "timestamp": datetime.now().isoformat(),
        "hashed_domain": _get_hashed_domain(),
        "role_level": _get_role_level(),
    }

    if properties:
        # Only allow safe property keys — never content
        safe_keys = {"skill_name", "persona_name", "tool_name", "category",
                     "duration_seconds", "success", "count"}
        safe_props = {k: v for k, v in properties.items() if k in safe_keys}
        event["properties"] = safe_props

    _append_event(event)

    # In production: batch and send to API_ENDPOINT
    # For now: local-only
    return {
        "status": "logged",
        "event": event_name,
        "stored_locally": True,
        "sent_to_api": False,  # Stubbed
    }


@server.tool()
async def get_telemetry_status() -> dict:
    """Return telemetry configuration: enabled/disabled, what's collected, hashed domain."""
    config = _load_config()
    events = _read_events()

    return {
        "enabled": config.get("enabled", True),
        "hashed_domain": _get_hashed_domain(),
        "role_level": _get_role_level(),
        "total_events_logged": len(events),
        "api_endpoint": API_ENDPOINT,
        "api_active": False,  # Stubbed
        "what_we_collect": [
            "Event names (e.g., 'skill_used', 'persona_activated')",
            "Hashed company domain (one-way, cannot be reversed)",
            "Career level (junior/mid/senior/lead/director/vp/c-suite)",
            "Skill and persona names used",
            "Timestamps",
        ],
        "what_we_never_collect": [
            "File contents",
            "Meeting notes",
            "Person names",
            "Decision details",
            "Any vault content",
        ],
    }


@server.tool()
async def set_telemetry_enabled(enabled: bool) -> dict:
    """Toggle telemetry on or off.

    Args:
        enabled: True to enable, False to disable.
    """
    config = _load_config()
    config["enabled"] = enabled
    config["toggled_at"] = datetime.now().isoformat()
    _save_config(config)

    return {
        "status": "enabled" if enabled else "disabled",
        "message": (
            "Telemetry enabled. Anonymous usage data will be collected."
            if enabled else
            "Telemetry disabled. No data will be collected or sent."
        ),
    }


@server.tool()
async def get_telemetry_report() -> dict:
    """Show the user exactly what telemetry data has been logged.

    Full transparency: returns every event that has been recorded locally.
    """
    events = _read_events()

    # Summarize by event type
    event_counts: dict[str, int] = {}
    for e in events:
        name = e.get("event", "unknown")
        event_counts[name] = event_counts.get(name, 0) + 1

    return {
        "total_events": len(events),
        "event_breakdown": event_counts,
        "recent_events": events[-20:],  # Last 20
        "earliest_event": events[0].get("timestamp") if events else None,
        "latest_event": events[-1].get("timestamp") if events else None,
        "data_sent_to_api": False,  # Stubbed — nothing sent yet
        "message": "This is everything Vennie has logged. Nothing else exists.",
    }


@server.tool()
async def check_team_adoption() -> dict:
    """Return count of Vennie users at the same company domain.

    Only works if telemetry is enabled. Uses hashed domain for privacy.
    Currently stubbed — returns sample data.
    """
    config = _load_config()
    if not config.get("enabled", True):
        return {
            "status": "disabled",
            "message": "Enable telemetry to see team adoption data.",
        }

    hashed = _get_hashed_domain()
    if not hashed:
        return {
            "status": "no_domain",
            "message": "No company domain configured. Complete onboarding first.",
        }

    # Stubbed response — in production, this queries the API
    return {
        "status": "stubbed",
        "hashed_domain": hashed,
        "team_count": 1,  # Just this user for now
        "message": "Team adoption tracking is coming soon. "
                   "When the API is live, this will show how many people "
                   "at your company use Vennie (anonymized, hashed domain only).",
    }


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
