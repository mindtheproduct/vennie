"""
Vennie Network Intelligence MCP Server.

Provides anonymized benchmarks and aggregated insights from the
Vennie user network. Currently stubbed with realistic sample data.
"""

import hashlib
import json
import os
from datetime import datetime
from pathlib import Path

from mcp.server.fastmcp import FastMCP

server = FastMCP("vennie-network")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
PROFILE_FILE = VAULT_PATH / "System" / "profile.yaml"


def _get_profile_field(field: str) -> str | None:
    if not PROFILE_FILE.exists():
        return None
    content = PROFILE_FILE.read_text()
    for line in content.split("\n"):
        if line.startswith(f"{field}:"):
            return line.split(":", 1)[1].strip()
    return None


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:16]


# Realistic sample benchmark data
SAMPLE_BENCHMARKS = {
    "shipping_cadence": {
        "description": "How often PMs ship meaningful features to production.",
        "benchmarks": {
            "junior": {"median": "bi-weekly", "p25": "monthly", "p75": "weekly", "sample_size": 234},
            "mid": {"median": "weekly", "p25": "bi-weekly", "p75": "2x/week", "sample_size": 512},
            "senior": {"median": "weekly", "p25": "bi-weekly", "p75": "2x/week", "sample_size": 389},
            "lead": {"median": "bi-weekly", "p25": "monthly", "p75": "weekly", "sample_size": 201},
            "director": {"median": "monthly", "p25": "quarterly", "p75": "bi-weekly", "sample_size": 87},
        },
        "insight": "Shipping cadence typically peaks at mid/senior level, then decreases as scope increases.",
    },
    "decision_frequency": {
        "description": "How many documented product decisions per month.",
        "benchmarks": {
            "junior": {"median": 3, "p25": 1, "p75": 5, "sample_size": 198},
            "mid": {"median": 6, "p25": 3, "p75": 10, "sample_size": 445},
            "senior": {"median": 8, "p25": 5, "p75": 14, "sample_size": 367},
            "lead": {"median": 12, "p25": 7, "p75": 18, "sample_size": 189},
            "director": {"median": 15, "p25": 10, "p75": 25, "sample_size": 76},
        },
        "insight": "Top PMs document 2-3x more decisions than average. The act of documenting forces clarity.",
    },
    "evidence_capture_rate": {
        "description": "Career evidence items captured per month (wins, learnings, feedback).",
        "benchmarks": {
            "junior": {"median": 2, "p25": 0, "p75": 4, "sample_size": 156},
            "mid": {"median": 4, "p25": 2, "p75": 7, "sample_size": 401},
            "senior": {"median": 6, "p25": 3, "p75": 10, "sample_size": 312},
            "lead": {"median": 5, "p25": 2, "p75": 9, "sample_size": 167},
            "director": {"median": 3, "p25": 1, "p75": 6, "sample_size": 65},
        },
        "insight": "Evidence capture drops at director+ level despite having more impact. The best leaders maintain the habit.",
    },
    "common_blind_spots": {
        "description": "Most frequently untracked areas by career level.",
        "benchmarks": {
            "junior": {
                "blind_spots": ["stakeholder management", "decision rationale", "cross-team impact"],
                "sample_size": 178,
            },
            "mid": {
                "blind_spots": ["career evidence", "decision outcomes", "network building"],
                "sample_size": 423,
            },
            "senior": {
                "blind_spots": ["team development", "strategic narrative", "industry positioning"],
                "sample_size": 298,
            },
            "lead": {
                "blind_spots": ["personal brand", "org-level impact", "succession planning"],
                "sample_size": 145,
            },
            "director": {
                "blind_spots": ["hands-on practice", "IC skill maintenance", "direct customer contact"],
                "sample_size": 58,
            },
        },
        "insight": "Blind spots shift predictably with seniority. Awareness is the first step to addressing them.",
    },
}

SAMPLE_INSIGHTS = [
    {
        "id": "insight-001",
        "title": "PMs who document decisions ship 40% faster",
        "description": "Analysis of 1,200+ PMs shows that those who document decisions in a structured way "
                       "spend less time in meetings rehashing context and more time executing.",
        "category": "productivity",
        "relevance_roles": ["mid", "senior", "lead"],
        "source": "vennie-network-analysis",
    },
    {
        "id": "insight-002",
        "title": "Career evidence compounds — start before you need it",
        "description": "PMs who capture evidence weekly for 6+ months have 3x more material at review time "
                       "and report higher confidence in self-assessments.",
        "category": "career",
        "relevance_roles": ["junior", "mid", "senior"],
        "source": "vennie-network-analysis",
    },
    {
        "id": "insight-003",
        "title": "The 'voice training' effect on personal brand",
        "description": "Users who train Vennie's voice model produce content 60% faster and report "
                       "the output sounds 'more like me' — reducing editing time from 45min to 15min.",
        "category": "brand",
        "relevance_roles": ["senior", "lead", "director"],
        "source": "vennie-network-analysis",
    },
    {
        "id": "insight-004",
        "title": "Decision review dates prevent 'zombie decisions'",
        "description": "PMs who set review dates on decisions are 5x more likely to revisit and update them. "
                       "Without review dates, 82% of decisions are never evaluated for outcomes.",
        "category": "decision_making",
        "relevance_roles": ["mid", "senior", "lead", "director"],
        "source": "vennie-network-analysis",
    },
    {
        "id": "insight-005",
        "title": "Personas activate different thinking modes",
        "description": "Users who switch personas during brainstorming generate 2x more distinct ideas. "
                       "The 'Critic' persona is most popular for decision stress-testing.",
        "category": "productivity",
        "relevance_roles": ["mid", "senior", "lead"],
        "source": "vennie-network-analysis",
    },
]


@server.tool()
async def get_benchmarks(
    category: str,
    role_level: str | None = None,
    company_stage: str | None = None,
) -> dict:
    """Return anonymized benchmarks for a given category.

    Benchmarks are aggregated from the Vennie network (currently sample data).

    Args:
        category: Benchmark category — shipping_cadence, decision_frequency, evidence_capture_rate, common_blind_spots.
        role_level: Filter to a specific career level. If None, uses profile career_level.
        company_stage: Company stage filter (startup, scaleup, enterprise). Not yet used.
    """
    if category not in SAMPLE_BENCHMARKS:
        return {
            "error": f"Unknown category: '{category}'. "
                     f"Available: {', '.join(SAMPLE_BENCHMARKS.keys())}",
        }

    benchmark = SAMPLE_BENCHMARKS[category]
    level = role_level or _get_profile_field("career_level") or "mid"

    level_data = benchmark["benchmarks"].get(level)
    if not level_data:
        return {
            "error": f"No benchmark data for role level '{level}' in category '{category}'.",
            "available_levels": list(benchmark["benchmarks"].keys()),
        }

    return {
        "category": category,
        "description": benchmark["description"],
        "role_level": level,
        "benchmark": level_data,
        "insight": benchmark["insight"],
        "source": "vennie-network-sample-data",
        "note": "Benchmarks are from sample data. Real network aggregation coming soon.",
    }


@server.tool()
async def get_insights() -> dict:
    """Return relevant insights based on the user's profile.

    Filters insights to the user's career level for relevance.
    """
    level = _get_profile_field("career_level") or "mid"

    relevant = [
        i for i in SAMPLE_INSIGHTS
        if level in i.get("relevance_roles", [])
    ]

    return {
        "insights": relevant,
        "total": len(relevant),
        "role_level": level,
        "source": "vennie-network-sample-data",
    }


@server.tool()
async def submit_anonymous_data() -> dict:
    """Opt-in submission of anonymized patterns to the Vennie network.

    Submits only aggregated counts (not content) for benchmarking:
    - Decision count this month
    - Evidence items captured
    - Skills/personas used
    - Hashed company domain
    """
    # Gather local stats
    decisions_dir = VAULT_PATH / "03-Decisions"
    evidence_dir = VAULT_PATH / "06-Evidence"

    decision_count = len(list(decisions_dir.glob("*.md"))) if decisions_dir.exists() else 0
    evidence_count = 0
    for sub in ["Wins", "Learnings", "Feedback"]:
        sub_dir = evidence_dir / sub
        if sub_dir.exists():
            evidence_count += len(list(sub_dir.glob("*.md")))

    submission = {
        "hashed_domain": _hash_value(_get_profile_field("company_domain") or "unknown"),
        "role_level": _get_profile_field("career_level") or "unknown",
        "decision_count": decision_count,
        "evidence_count": evidence_count,
        "timestamp": datetime.now().isoformat(),
    }

    # In production: POST to api.vennie.ai/network/submit
    # For now: local acknowledgment only
    return {
        "status": "stubbed",
        "submission": submission,
        "message": "Network submission is not yet active. "
                   "When the API launches, this data will contribute to "
                   "anonymized benchmarks that help all PMs improve.",
    }


if __name__ == "__main__":
    server.run()
