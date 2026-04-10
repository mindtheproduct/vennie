"""
Centralized path resolution for Vennie vault.

Single source of truth for all vault paths. Reads VAULT_PATH from environment
variable and exports structured paths for both Python and Node.js consumers.
"""

import json
import os
from pathlib import Path


def get_vault_path() -> Path:
    """Return the vault root path from env or default."""
    return Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))


def get_paths() -> dict[str, str]:
    """Return dict of all vault paths as strings.

    This is the canonical path registry. Every MCP server and script
    should resolve paths through this function.
    """
    vault = get_vault_path()

    paths = {
        # Capture
        "inbox": str(vault / "00-Inbox"),
        "ideas": str(vault / "00-Inbox" / "Ideas"),
        "meetings": str(vault / "00-Inbox" / "Meetings"),
        "signals": str(vault / "00-Inbox" / "Signals"),

        # Planning
        "goals": str(vault / "01-Goals"),
        "focus": str(vault / "02-Focus"),
        "decisions": str(vault / "03-Decisions"),

        # Work
        "projects": str(vault / "04-Projects"),

        # People
        "people": str(vault / "05-People"),
        "people_team": str(vault / "05-People" / "Team"),
        "people_stakeholders": str(vault / "05-People" / "Stakeholders"),
        "people_network": str(vault / "05-People" / "Network"),

        # Evidence
        "evidence": str(vault / "06-Evidence"),
        "evidence_wins": str(vault / "06-Evidence" / "Wins"),
        "evidence_learnings": str(vault / "06-Evidence" / "Learnings"),
        "evidence_feedback": str(vault / "06-Evidence" / "Feedback"),

        # Brand
        "brand": str(vault / "07-Brand"),
        "brand_linkedin": str(vault / "07-Brand" / "LinkedIn"),
        "brand_newsletter": str(vault / "07-Brand" / "Newsletter"),
        "brand_talks": str(vault / "07-Brand" / "Talks"),

        # Resources
        "resources": str(vault / "08-Resources"),
        "resources_frameworks": str(vault / "08-Resources" / "Frameworks"),
        "resources_industry": str(vault / "08-Resources" / "Industry"),
        "resources_writing": str(vault / "08-Resources" / "Writing"),

        # System
        "system": str(vault / "System"),
        "profile": str(vault / "System" / "profile.yaml"),
        "philosophy": str(vault / "System" / "philosophy.yaml"),
        "voice": str(vault / "System" / "voice.yaml"),
        "personality_model": str(vault / "System" / "personality-model.md"),
        "active_persona": str(vault / "System" / ".active-persona"),
        "vennie_state_db": str(vault / "System" / "vennie-state.db"),

        # Root
        "vault": str(vault),
    }

    return paths


def write_paths_json() -> str:
    """Write paths.json for Node.js consumers. Returns the output path."""
    paths = get_paths()
    output = Path(__file__).parent / "paths.json"
    output.write_text(json.dumps(paths, indent=2) + "\n")
    return str(output)


def ensure_dirs(path_keys: list[str] | None = None) -> None:
    """Create vault directories if they don't exist.

    Args:
        path_keys: specific path keys to create. If None, creates all directory paths.
    """
    paths = get_paths()
    # These are file paths, not directories
    file_keys = {"profile", "philosophy", "voice", "personality_model",
                 "active_persona", "vennie_state_db"}

    keys = path_keys or [k for k in paths if k not in file_keys]
    for key in keys:
        if key in file_keys:
            continue
        if key in paths:
            Path(paths[key]).mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    p = get_paths()
    for name, path in p.items():
        print(f"  {name}: {path}")
    out = write_paths_json()
    print(f"\nWrote {out}")
