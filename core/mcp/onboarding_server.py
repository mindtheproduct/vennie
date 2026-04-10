"""
Vennie Onboarding MCP Server.

Stateful onboarding flow that guides users through initial setup,
validates required fields, and generates the vault structure.
"""

import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("vennie-onboarding")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
SESSION_FILE = VAULT_PATH / ".onboarding-session.json"
COMPLETE_FILE = VAULT_PATH / ".onboarding-complete"

STEPS = {
    1: {"name": "linkedin_url", "required": False},
    2: {"name": "identity", "required": True},
    3: {"name": "role", "required": True},
    4: {"name": "company", "required": True},  # MANDATORY
    5: {"name": "philosophy", "required": False},
    6: {"name": "ai_adoption", "required": False},
    7: {"name": "communication", "required": False},
    8: {"name": "connected_tools", "required": False},
    9: {"name": "finalize", "required": True},
}

VALID_CAREER_LEVELS = ["junior", "mid", "senior", "lead", "director", "vp", "c-suite"]
VALID_AI_LEVELS = ["novice", "intermediate", "advanced", "expert"]
VALID_FORMALITY = ["formal", "professional_casual", "casual"]
VALID_DIRECTNESS = ["very_direct", "balanced", "supportive"]
VALID_COACHING = ["challenging", "balanced", "encouraging"]


def _load_session() -> dict:
    if SESSION_FILE.exists():
        return json.loads(SESSION_FILE.read_text())
    return {}


def _save_session(session: dict) -> None:
    VAULT_PATH.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(session, indent=2))


def _validate_url(url: str) -> bool:
    return bool(re.match(r"https?://", url))


def _validate_domain(domain: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$", domain))


def _create_vault_structure(session: dict) -> list[str]:
    """Create all vault directories and initial files."""
    from core.paths import get_paths, ensure_dirs
    ensure_dirs()
    paths = get_paths()
    created = []

    # Write profile.yaml
    profile_data = {
        "name": session.get("name", ""),
        "email": session.get("email", ""),
        "role": session.get("role", ""),
        "career_level": session.get("career_level", ""),
        "company": session.get("company_name", ""),
        "company_domain": session.get("company_domain", ""),
        "linkedin_url": session.get("linkedin_url", ""),
        "ai_adoption": session.get("ai_adoption", "intermediate"),
        "communication": session.get("communication", {
            "formality": "professional_casual",
            "directness": "balanced",
            "coaching_style": "balanced",
        }),
        "connected_tools": session.get("connected_tools", []),
        "telemetry": {"enabled": True},
        "created": datetime.now().strftime("%Y-%m-%d"),
    }

    profile_path = Path(paths["profile"])
    profile_path.parent.mkdir(parents=True, exist_ok=True)

    # Write as YAML-like format (simple key-value, no pyyaml dependency)
    lines = ["# Vennie User Profile", f"# Generated: {profile_data['created']}", ""]
    for key, value in profile_data.items():
        if isinstance(value, dict):
            lines.append(f"{key}:")
            for k, v in value.items():
                lines.append(f"  {k}: {v}")
        elif isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        else:
            lines.append(f"{key}: {value}")
    profile_path.write_text("\n".join(lines) + "\n")
    created.append(str(profile_path))

    # Write philosophy.yaml if answers exist
    philosophy = session.get("philosophy", {})
    if philosophy:
        phil_path = Path(paths["philosophy"])
        phil_lines = ["# Product Philosophy", f"# Generated: {datetime.now().strftime('%Y-%m-%d')}", ""]
        for key, value in philosophy.items():
            phil_lines.append(f"{key}: \"{value}\"")
        phil_path.write_text("\n".join(phil_lines) + "\n")
        created.append(str(phil_path))

    # Write empty personality-model.md
    pm_path = Path(paths["personality_model"])
    if not pm_path.exists():
        pm_path.write_text(
            "# Personality Model\n\n"
            "Vennie builds this over time by observing your working patterns,\n"
            "decision-making style, and communication preferences.\n\n"
            "## Observations\n\n*No observations yet.*\n"
        )
        created.append(str(pm_path))

    return created


@server.tool()
async def start_onboarding() -> dict:
    """Initialize or resume an onboarding session.

    Creates a session file to track progress through the onboarding steps.
    If a session already exists, resumes from where the user left off.
    """
    if COMPLETE_FILE.exists():
        return {
            "status": "already_complete",
            "message": "Onboarding was already completed. Delete .onboarding-complete to restart.",
        }

    session = _load_session()
    if session:
        completed = [s for s in range(1, 10) if session.get(f"step_{s}_complete")]
        return {
            "status": "resumed",
            "completed_steps": completed,
            "next_step": max(completed) + 1 if completed else 1,
            "total_steps": 9,
            "message": f"Resumed onboarding. {len(completed)}/9 steps complete.",
        }

    session = {
        "started_at": datetime.now().isoformat(),
        "version": "1.0.0",
    }
    _save_session(session)
    return {
        "status": "started",
        "completed_steps": [],
        "next_step": 1,
        "total_steps": 9,
        "message": "Onboarding started. Begin with Step 1: LinkedIn URL.",
    }


@server.tool()
async def validate_and_save_step(step_number: int, data: dict) -> dict:
    """Validate and save data for a specific onboarding step.

    Each step has its own validation rules. Step 4 (company) is mandatory
    and cannot be skipped.

    Args:
        step_number: The step to validate (1-9).
        data: Step-specific data to validate and save.
    """
    if step_number not in STEPS:
        return {"error": f"Invalid step number: {step_number}. Must be 1-9."}

    session = _load_session()
    if not session:
        return {"error": "No active session. Call start_onboarding() first."}

    # Step-specific validation
    if step_number == 1:
        url = data.get("linkedin_url", "")
        if url and not _validate_url(url):
            return {"error": "Invalid LinkedIn URL format. Expected https://linkedin.com/in/..."}
        session["linkedin_url"] = url

    elif step_number == 2:
        name = data.get("name", "").strip()
        email = data.get("email", "").strip()
        if not name:
            return {"error": "Name is required."}
        if not email or "@" not in email:
            return {"error": "Valid email is required."}
        session["name"] = name
        session["email"] = email

    elif step_number == 3:
        role = data.get("role", "").strip()
        career_level = data.get("career_level", "").strip().lower()
        if not role:
            return {"error": "Role is required."}
        if career_level and career_level not in VALID_CAREER_LEVELS:
            return {
                "error": f"Invalid career level: '{career_level}'. "
                         f"Must be one of: {', '.join(VALID_CAREER_LEVELS)}"
            }
        session["role"] = role
        session["career_level"] = career_level or "mid"

    elif step_number == 4:
        # MANDATORY step
        company_name = data.get("company_name", "").strip()
        company_domain = data.get("company_domain", "").strip().lower()
        if not company_name:
            return {"error": "Company name is REQUIRED and cannot be skipped."}
        if not company_domain:
            return {"error": "Company domain is REQUIRED (e.g., 'acme.com'). Cannot be skipped."}
        if not _validate_domain(company_domain):
            return {"error": f"Invalid domain format: '{company_domain}'. Expected format: company.com"}
        session["company_name"] = company_name
        session["company_domain"] = company_domain

    elif step_number == 5:
        philosophy = data.get("philosophy", {})
        session["philosophy"] = philosophy

    elif step_number == 6:
        level = data.get("ai_adoption", "").strip().lower()
        if level and level not in VALID_AI_LEVELS:
            return {
                "error": f"Invalid AI adoption level: '{level}'. "
                         f"Must be one of: {', '.join(VALID_AI_LEVELS)}"
            }
        session["ai_adoption"] = level or "intermediate"

    elif step_number == 7:
        comm = data.get("communication", {})
        formality = comm.get("formality", "professional_casual")
        directness = comm.get("directness", "balanced")
        coaching = comm.get("coaching_style", "balanced")
        errors = []
        if formality not in VALID_FORMALITY:
            errors.append(f"formality must be one of: {', '.join(VALID_FORMALITY)}")
        if directness not in VALID_DIRECTNESS:
            errors.append(f"directness must be one of: {', '.join(VALID_DIRECTNESS)}")
        if coaching not in VALID_COACHING:
            errors.append(f"coaching_style must be one of: {', '.join(VALID_COACHING)}")
        if errors:
            return {"error": "; ".join(errors)}
        session["communication"] = {
            "formality": formality,
            "directness": directness,
            "coaching_style": coaching,
        }

    elif step_number == 8:
        tools = data.get("connected_tools", [])
        if not isinstance(tools, list):
            return {"error": "connected_tools must be a list of tool names."}
        session["connected_tools"] = tools

    elif step_number == 9:
        # Finalize: check mandatory fields
        if not session.get("company_name") or not session.get("company_domain"):
            return {
                "error": "Cannot finalize: Step 4 (company) is mandatory and incomplete. "
                         "Please complete Step 4 first.",
                "missing_step": 4,
            }
        created = _create_vault_structure(session)
        session["finalized_at"] = datetime.now().isoformat()
        session["created_files"] = created

    session[f"step_{step_number}_complete"] = True
    session[f"step_{step_number}_completed_at"] = datetime.now().isoformat()
    _save_session(session)

    completed = [s for s in range(1, 10) if session.get(f"step_{s}_complete")]
    return {
        "status": "saved",
        "step": step_number,
        "step_name": STEPS[step_number]["name"],
        "completed_steps": completed,
        "next_step": step_number + 1 if step_number < 9 else None,
        "message": f"Step {step_number} ({STEPS[step_number]['name']}) saved.",
    }


@server.tool()
async def get_onboarding_status() -> dict:
    """Return current onboarding progress including completed steps and missing requirements."""
    if COMPLETE_FILE.exists():
        return {"status": "complete", "message": "Onboarding is complete."}

    session = _load_session()
    if not session:
        return {"status": "not_started", "message": "Onboarding has not been started."}

    completed = [s for s in range(1, 10) if session.get(f"step_{s}_complete")]
    missing_required = []
    for step_num, step_info in STEPS.items():
        if step_info["required"] and step_num not in completed:
            missing_required.append({"step": step_num, "name": step_info["name"]})

    return {
        "status": "in_progress",
        "completed_steps": completed,
        "total_steps": 9,
        "missing_required": missing_required,
        "can_finalize": all(s["step"] not in [4] or s["step"] in completed for s in missing_required) if missing_required else True,
        "started_at": session.get("started_at"),
    }


@server.tool()
async def finalize_onboarding() -> dict:
    """Mark onboarding as complete. Creates .onboarding-complete marker file.

    This should only be called after all required steps are validated.
    """
    session = _load_session()
    if not session:
        return {"error": "No active session."}

    if not session.get("step_4_complete"):
        return {"error": "Cannot finalize: Step 4 (company) is mandatory."}

    if not session.get("step_9_complete"):
        return {"error": "Cannot finalize: Step 9 (finalize) must be completed first."}

    COMPLETE_FILE.write_text(json.dumps({
        "completed_at": datetime.now().isoformat(),
        "name": session.get("name", ""),
        "company": session.get("company_name", ""),
    }, indent=2))

    return {
        "status": "complete",
        "message": "Onboarding complete! Your Vennie vault is ready.",
        "vault_path": str(VAULT_PATH),
        "name": session.get("name", ""),
        "company": session.get("company_name", ""),
    }


@server.tool()
async def verify_dependencies() -> dict:
    """Check that Python, Node.js, and AI CLI tools are available on the system."""
    import subprocess

    deps = {}
    checks = {
        "python": ["python3", "--version"],
        "node": ["node", "--version"],
        "npm": ["npm", "--version"],
        "claude": ["claude", "--version"],
    }

    for name, cmd in checks.items():
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            deps[name] = {
                "available": result.returncode == 0,
                "version": result.stdout.strip() if result.returncode == 0 else None,
            }
        except (FileNotFoundError, subprocess.TimeoutExpired):
            deps[name] = {"available": False, "version": None}

    all_ok = all(d["available"] for d in deps.values() if d is not None)
    return {
        "status": "ok" if all_ok else "missing_dependencies",
        "dependencies": deps,
        "message": "All dependencies available." if all_ok else "Some dependencies are missing.",
    }


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
