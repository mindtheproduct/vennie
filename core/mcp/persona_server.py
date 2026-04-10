"""
Vennie Persona Management & Marketplace MCP Server.

Manages persona installation, activation, memory, and marketplace browsing.
Personas shape how Vennie thinks and challenges the user.
"""

import json
import os
from datetime import datetime
from pathlib import Path

from mcp.server.fastmcp import FastMCP

server = FastMCP("vennie-persona")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
VENNIE_DIR = VAULT_PATH / ".vennie"
CORE_PERSONAS = VENNIE_DIR / "personas" / "core"
MARKETPLACE_PERSONAS = VENNIE_DIR / "personas" / "marketplace"
CUSTOM_PERSONAS = VENNIE_DIR / "personas" / "custom"
MEMORY_DIR = VENNIE_DIR / "personas" / "memory"
ACTIVE_PERSONA_FILE = VAULT_PATH / "System" / ".active-persona"

# Built-in core personas
BUILTIN_PERSONAS = {
    "coach": {
        "name": "coach",
        "display_name": "The Coach",
        "category": "career",
        "description": "A supportive but challenging career coach who pushes you to think bigger and capture evidence of your impact.",
        "style": "Encouraging but direct. Asks probing questions. Celebrates wins but always asks 'what's next?'",
        "priorities": ["career growth", "evidence capture", "self-advocacy", "skill development"],
        "challenge_patterns": [
            "When user downplays achievement -> highlight the real impact",
            "When user avoids difficult conversation -> coach through it",
            "When user lacks evidence -> help quantify and capture it",
        ],
        "version": "1.0.0",
        "author": "vennie-core",
    },
    "strategist": {
        "name": "strategist",
        "display_name": "The Strategist",
        "category": "product",
        "description": "A sharp product strategist who stress-tests ideas, demands customer evidence, and thinks in systems.",
        "style": "Analytical, concise, Socratic. Uses frameworks but doesn't hide behind them.",
        "priorities": ["customer impact", "strategic clarity", "trade-off awareness", "evidence-based decisions"],
        "challenge_patterns": [
            "When user proposes feature -> ask about the job-to-be-done",
            "When user lacks data -> push for customer evidence",
            "When user overscopes -> force prioritization",
        ],
        "version": "1.0.0",
        "author": "vennie-core",
    },
    "writer": {
        "name": "writer",
        "display_name": "The Writer",
        "category": "brand",
        "description": "A skilled content strategist who helps craft authentic, engaging content in your voice.",
        "style": "Creative, voice-aware, concise. Matches the user's natural writing patterns from voice.yaml.",
        "priorities": ["authentic voice", "audience awareness", "clear messaging", "personal brand"],
        "challenge_patterns": [
            "When content is generic -> push for personal angle",
            "When writing is too formal/casual -> nudge toward natural voice",
            "When missing a hook -> suggest a stronger opening",
        ],
        "version": "1.0.0",
        "author": "vennie-core",
    },
    "critic": {
        "name": "critic",
        "display_name": "The Critic",
        "category": "product",
        "description": "A tough but fair critic who finds the holes in your thinking before someone else does.",
        "style": "Direct, sometimes blunt. Asks the hard questions. Values clarity over comfort.",
        "priorities": ["intellectual honesty", "risk identification", "assumption testing", "clear thinking"],
        "challenge_patterns": [
            "When user is overconfident -> surface risks they haven't considered",
            "When plan lacks specifics -> demand concrete next steps",
            "When reasoning has gaps -> call them out directly",
        ],
        "version": "1.0.0",
        "author": "vennie-core",
    },
}

# Mock marketplace data
MARKETPLACE_CATALOG = [
    {
        "id": "mp-cto-advisor",
        "name": "CTO Advisor",
        "category": "leadership",
        "description": "Technical leadership perspective for architecture and team decisions.",
        "author": "vennie-community",
        "downloads": 342,
        "rating": 4.6,
    },
    {
        "id": "mp-vc-lens",
        "name": "VC Lens",
        "category": "strategy",
        "description": "Evaluates ideas through an investor's lens — TAM, moat, GTM, unit economics.",
        "author": "vennie-community",
        "downloads": 891,
        "rating": 4.8,
    },
    {
        "id": "mp-ux-researcher",
        "name": "UX Researcher",
        "category": "product",
        "description": "Challenges product decisions with user research principles and cognitive biases.",
        "author": "vennie-community",
        "downloads": 567,
        "rating": 4.5,
    },
    {
        "id": "mp-stoic-pm",
        "name": "Stoic PM",
        "category": "mindset",
        "description": "Marcus Aurelius meets product management. Focuses on what you can control.",
        "author": "vennie-community",
        "downloads": 1203,
        "rating": 4.9,
    },
    {
        "id": "mp-data-detective",
        "name": "Data Detective",
        "category": "analytics",
        "description": "Demands data for every claim. Helps design experiments and interpret metrics.",
        "author": "vennie-community",
        "downloads": 445,
        "rating": 4.4,
    },
]


def _ensure_dirs():
    for d in [CORE_PERSONAS, MARKETPLACE_PERSONAS, CUSTOM_PERSONAS, MEMORY_DIR]:
        d.mkdir(parents=True, exist_ok=True)
    ACTIVE_PERSONA_FILE.parent.mkdir(parents=True, exist_ok=True)


def _write_persona_file(directory: Path, name: str, persona: dict) -> Path:
    filepath = directory / f"{name}.json"
    filepath.write_text(json.dumps(persona, indent=2))
    return filepath


def _read_persona_file(filepath: Path) -> dict | None:
    if filepath.exists():
        return json.loads(filepath.read_text())
    return None


def _list_persona_files(directory: Path) -> list[dict]:
    results = []
    if not directory.exists():
        return results
    for f in sorted(directory.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            results.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return results


@server.tool()
async def list_personas() -> dict:
    """List all installed personas — core, marketplace, and custom — with metadata."""
    _ensure_dirs()

    # Write core personas to disk if not present
    for name, persona in BUILTIN_PERSONAS.items():
        filepath = CORE_PERSONAS / f"{name}.json"
        if not filepath.exists():
            _write_persona_file(CORE_PERSONAS, name, persona)

    core = _list_persona_files(CORE_PERSONAS)
    marketplace = _list_persona_files(MARKETPLACE_PERSONAS)
    custom = _list_persona_files(CUSTOM_PERSONAS)

    active = await get_active_persona()

    return {
        "core": [{"name": p.get("name"), "display_name": p.get("display_name"), "category": p.get("category"), "description": p.get("description")} for p in core],
        "marketplace": [{"name": p.get("name"), "display_name": p.get("display_name"), "category": p.get("category"), "description": p.get("description")} for p in marketplace],
        "custom": [{"name": p.get("name"), "display_name": p.get("display_name"), "category": p.get("category"), "description": p.get("description")} for p in custom],
        "total": len(core) + len(marketplace) + len(custom),
        "active": active.get("name") if active.get("status") == "active" else None,
    }


@server.tool()
async def get_persona(name: str) -> dict:
    """Read the full persona definition by name.

    Args:
        name: Persona name (e.g., 'coach', 'strategist').
    """
    _ensure_dirs()

    # Check all directories
    for directory in [CORE_PERSONAS, MARKETPLACE_PERSONAS, CUSTOM_PERSONAS]:
        filepath = directory / f"{name}.json"
        data = _read_persona_file(filepath)
        if data:
            return {"status": "found", "persona": data, "source": directory.name}

    # Check builtins
    if name in BUILTIN_PERSONAS:
        _write_persona_file(CORE_PERSONAS, name, BUILTIN_PERSONAS[name])
        return {"status": "found", "persona": BUILTIN_PERSONAS[name], "source": "core"}

    return {"error": f"Persona '{name}' not found."}


@server.tool()
async def activate_persona(name: str) -> dict:
    """Activate a persona. Writes to System/.active-persona and returns the persona context.

    Args:
        name: Name of the persona to activate.
    """
    result = await get_persona(name)
    if "error" in result:
        return result

    persona = result["persona"]
    _ensure_dirs()

    activation = {
        "name": persona["name"],
        "display_name": persona.get("display_name", persona["name"]),
        "activated_at": datetime.now().isoformat(),
        "style": persona.get("style", ""),
        "priorities": persona.get("priorities", []),
        "challenge_patterns": persona.get("challenge_patterns", []),
    }

    ACTIVE_PERSONA_FILE.write_text(json.dumps(activation, indent=2))

    return {
        "status": "activated",
        "persona": activation,
        "message": f"'{persona.get('display_name', name)}' is now active. "
                   f"Style: {persona.get('style', 'default')}",
    }


@server.tool()
async def deactivate_persona() -> dict:
    """Clear the active persona. Returns to default Vennie behavior."""
    if ACTIVE_PERSONA_FILE.exists():
        ACTIVE_PERSONA_FILE.unlink()
    return {"status": "deactivated", "message": "Persona deactivated. Back to default Vennie."}


@server.tool()
async def get_active_persona() -> dict:
    """Return the currently active persona, or None if no persona is active."""
    if not ACTIVE_PERSONA_FILE.exists():
        return {"status": "none", "message": "No persona active."}
    try:
        data = json.loads(ACTIVE_PERSONA_FILE.read_text())
        return {"status": "active", **data}
    except (json.JSONDecodeError, OSError):
        return {"status": "none", "message": "No persona active (file corrupted)."}


@server.tool()
async def create_custom_persona(
    name: str,
    style: str,
    priorities: list[str],
    challenge_patterns: list[str],
    source_material: str | None = None,
) -> dict:
    """Create a custom persona.

    Args:
        name: Unique persona name (lowercase, hyphens ok).
        style: Description of the persona's communication style.
        priorities: List of things this persona prioritizes.
        challenge_patterns: List of 'When X -> do Y' patterns.
        source_material: Optional reference material the persona is based on.
    """
    _ensure_dirs()

    # Validate name
    clean_name = name.lower().replace(" ", "-")
    if (CUSTOM_PERSONAS / f"{clean_name}.json").exists():
        return {"error": f"Custom persona '{clean_name}' already exists."}

    persona = {
        "name": clean_name,
        "display_name": name.title().replace("-", " "),
        "category": "custom",
        "description": f"Custom persona: {style[:100]}",
        "style": style,
        "priorities": priorities,
        "challenge_patterns": challenge_patterns,
        "source_material": source_material,
        "version": "1.0.0",
        "author": "user",
        "created_at": datetime.now().isoformat(),
    }

    filepath = _write_persona_file(CUSTOM_PERSONAS, clean_name, persona)

    return {
        "status": "created",
        "name": clean_name,
        "path": str(filepath),
        "message": f"Custom persona '{clean_name}' created. Activate with activate_persona('{clean_name}').",
    }


@server.tool()
async def get_persona_memory(name: str) -> dict:
    """Read a persona's interaction history.

    Args:
        name: Persona name.
    """
    _ensure_dirs()
    memory_file = MEMORY_DIR / f"{name}.json"
    if not memory_file.exists():
        return {"name": name, "interactions": [], "message": "No interaction history yet."}

    try:
        data = json.loads(memory_file.read_text())
        return {"name": name, "interactions": data.get("interactions", []), "total": len(data.get("interactions", []))}
    except (json.JSONDecodeError, OSError):
        return {"name": name, "interactions": [], "message": "Memory file corrupted."}


@server.tool()
async def update_persona_memory(
    name: str,
    interaction_type: str,
    summary: str,
) -> dict:
    """Append to a persona's interaction memory.

    Args:
        name: Persona name.
        interaction_type: Type of interaction (challenge, coaching, review, brainstorm).
        summary: Brief summary of what happened.
    """
    _ensure_dirs()
    memory_file = MEMORY_DIR / f"{name}.json"

    if memory_file.exists():
        try:
            data = json.loads(memory_file.read_text())
        except (json.JSONDecodeError, OSError):
            data = {"interactions": []}
    else:
        data = {"interactions": []}

    entry = {
        "timestamp": datetime.now().isoformat(),
        "type": interaction_type,
        "summary": summary,
    }
    data["interactions"].append(entry)

    # Keep last 100 interactions
    data["interactions"] = data["interactions"][-100:]
    memory_file.write_text(json.dumps(data, indent=2))

    return {
        "status": "recorded",
        "name": name,
        "total_interactions": len(data["interactions"]),
    }


@server.tool()
async def search_marketplace(
    query: str | None = None,
    category: str | None = None,
) -> dict:
    """Search the persona marketplace. Returns available personas matching the query.

    Currently returns curated sample data. Real API integration coming soon.

    Args:
        query: Search text to match against persona names and descriptions.
        category: Filter by category (leadership, strategy, product, mindset, analytics).
    """
    results = MARKETPLACE_CATALOG

    if category:
        results = [p for p in results if p["category"] == category.lower()]

    if query:
        q = query.lower()
        results = [p for p in results if q in p["name"].lower() or q in p["description"].lower()]

    return {
        "results": results,
        "total": len(results),
        "source": "marketplace-stub",
        "message": "Marketplace is in preview. These are curated personas. Full marketplace coming soon.",
    }


@server.tool()
async def install_persona(persona_id: str) -> dict:
    """Download and install a persona from the marketplace.

    Args:
        persona_id: Marketplace persona ID (e.g., 'mp-cto-advisor').
    """
    _ensure_dirs()

    # Find in marketplace catalog
    persona = next((p for p in MARKETPLACE_CATALOG if p["id"] == persona_id), None)
    if not persona:
        return {"error": f"Persona '{persona_id}' not found in marketplace."}

    name = persona_id.replace("mp-", "")

    # Check if already installed
    if (MARKETPLACE_PERSONAS / f"{name}.json").exists():
        return {"error": f"Persona '{name}' is already installed."}

    # Create full persona definition from marketplace stub
    full_persona = {
        "name": name,
        "display_name": persona["name"],
        "category": persona["category"],
        "description": persona["description"],
        "style": f"Community-created {persona['category']} persona. Adapt to user's context.",
        "priorities": [persona["category"], "user growth", "practical advice"],
        "challenge_patterns": [
            f"Apply {persona['category']} thinking to user's situation",
        ],
        "version": "1.0.0",
        "author": persona["author"],
        "marketplace_id": persona_id,
        "installed_at": datetime.now().isoformat(),
    }

    filepath = _write_persona_file(MARKETPLACE_PERSONAS, name, full_persona)

    return {
        "status": "installed",
        "name": name,
        "path": str(filepath),
        "message": f"Installed '{persona['name']}'. Activate with activate_persona('{name}').",
    }


if __name__ == "__main__":
    server.run()
