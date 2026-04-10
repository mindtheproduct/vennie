"""
Vennie Voice Training MCP Server.

Analyzes writing samples, maintains a voice profile, and tracks
editing patterns to learn the user's authentic writing style.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("vennie-voice")

VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.path.expanduser("~/Vennie")))
VOICE_PATH = VAULT_PATH / "System" / "voice.yaml"
SAMPLES_DIR = VAULT_PATH / "System" / ".voice-samples"


def _ensure_dirs():
    VOICE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)


def _load_voice_profile() -> dict:
    if not VOICE_PATH.exists():
        return _default_profile()
    # Simple YAML-like parser (avoids pyyaml dependency)
    content = VOICE_PATH.read_text()
    profile = {}
    current_section = None
    current_list = None
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        if not line.startswith(" ") and ":" in stripped:
            key, _, val = stripped.partition(":")
            val = val.strip().strip('"').strip("'")
            if val:
                profile[key.strip()] = val
            else:
                current_section = key.strip()
                profile[current_section] = {}
                current_list = None
        elif line.startswith("  - "):
            item = stripped.lstrip("- ").strip().strip('"').strip("'")
            if current_section:
                if not isinstance(profile[current_section], list):
                    profile[current_section] = []
                profile[current_section].append(item)
        elif line.startswith("  ") and ":" in stripped:
            key, _, val = stripped.partition(":")
            val = val.strip().strip('"').strip("'")
            if current_section and isinstance(profile.get(current_section), dict):
                profile[current_section][key.strip()] = val
    return profile


def _save_voice_profile(profile: dict) -> None:
    _ensure_dirs()
    lines = ["# Vennie Voice Profile", f"# Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ""]
    for key, value in profile.items():
        if isinstance(value, dict):
            lines.append(f"{key}:")
            for k, v in value.items():
                lines.append(f"  {k}: \"{v}\"")
        elif isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - \"{item}\"")
        else:
            lines.append(f"{key}: \"{value}\"")
        lines.append("")
    VOICE_PATH.write_text("\n".join(lines))


def _default_profile() -> dict:
    return {
        "sample_count": "0",
        "confidence": "low",
        "tone": {},
        "structure": {},
        "vocabulary": {},
        "quirks": [],
    }


def _analyze_text(text: str) -> dict:
    """Analyze a single text for style characteristics."""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    words = text.split()

    avg_sentence_length = len(words) / max(len(sentences), 1)
    avg_word_length = sum(len(w) for w in words) / max(len(words), 1)

    # Detect patterns
    uses_contractions = bool(re.search(r"\b\w+'\w+\b", text))
    uses_em_dash = "—" in text or " -- " in text
    uses_parentheticals = "(" in text and ")" in text
    starts_with_and_or_but = bool(re.search(r'\. (And|But|So|Or) ', text))
    uses_questions = "?" in text
    uses_exclamations = "!" in text
    uses_bullet_points = bool(re.search(r'^\s*[-*]\s', text, re.MULTILINE))
    uses_first_person = bool(re.search(r'\b(I|my|me|we|our|us)\b', text, re.IGNORECASE))

    # Formality signals
    formal_words = len(re.findall(r'\b(furthermore|however|consequently|nevertheless|therefore|regarding|accordingly)\b', text, re.IGNORECASE))
    casual_words = len(re.findall(r'\b(gonna|wanna|kinda|pretty much|stuff|thing|cool|awesome|yeah|nope)\b', text, re.IGNORECASE))

    if formal_words > casual_words:
        formality = "formal"
    elif casual_words > formal_words:
        formality = "casual"
    else:
        formality = "neutral"

    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "avg_sentence_length": round(avg_sentence_length, 1),
        "avg_word_length": round(avg_word_length, 1),
        "formality": formality,
        "uses_contractions": uses_contractions,
        "uses_em_dash": uses_em_dash,
        "uses_parentheticals": uses_parentheticals,
        "starts_sentences_with_conjunctions": starts_with_and_or_but,
        "uses_questions": uses_questions,
        "uses_exclamations": uses_exclamations,
        "uses_bullet_points": uses_bullet_points,
        "uses_first_person": uses_first_person,
    }


@server.tool()
async def analyze_writing_samples(texts: list[str]) -> dict:
    """Analyze writing samples and return voice characteristics.

    Examines sentence length, tone, vocabulary patterns, structural preferences,
    and quirks to build a voice fingerprint.

    Args:
        texts: List of writing samples (blog posts, emails, LinkedIn posts, etc.)
    """
    if not texts:
        return {"error": "No texts provided."}

    _ensure_dirs()

    analyses = [_analyze_text(t) for t in texts]

    # Aggregate
    total_words = sum(a["word_count"] for a in analyses)
    avg_sentence = sum(a["avg_sentence_length"] for a in analyses) / len(analyses)
    avg_word = sum(a["avg_word_length"] for a in analyses) / len(analyses)

    # Count frequency of patterns
    pattern_freq = {}
    pattern_keys = [
        "uses_contractions", "uses_em_dash", "uses_parentheticals",
        "starts_sentences_with_conjunctions", "uses_questions",
        "uses_exclamations", "uses_bullet_points", "uses_first_person",
    ]
    for key in pattern_keys:
        count = sum(1 for a in analyses if a.get(key))
        pattern_freq[key] = {"count": count, "pct": round(count / len(analyses) * 100)}

    formality_counts = {}
    for a in analyses:
        f = a["formality"]
        formality_counts[f] = formality_counts.get(f, 0) + 1
    dominant_formality = max(formality_counts, key=formality_counts.get)

    # Determine quirks
    quirks = []
    if pattern_freq["uses_em_dash"]["pct"] > 50:
        quirks.append("Frequent em-dash user")
    if pattern_freq["uses_parentheticals"]["pct"] > 50:
        quirks.append("Uses parenthetical asides")
    if pattern_freq["starts_sentences_with_conjunctions"]["pct"] > 30:
        quirks.append("Starts sentences with And/But/So")
    if avg_sentence < 12:
        quirks.append("Short, punchy sentences")
    elif avg_sentence > 25:
        quirks.append("Long, flowing sentences")
    if pattern_freq["uses_first_person"]["pct"] > 80:
        quirks.append("Strong first-person voice")

    # Save samples
    for i, text in enumerate(texts):
        sample_file = SAMPLES_DIR / f"sample-{datetime.now().strftime('%Y%m%d%H%M%S')}-{i}.txt"
        sample_file.write_text(text)

    # Update profile
    profile = _load_voice_profile()
    sample_count = int(profile.get("sample_count", "0")) + len(texts)
    profile["sample_count"] = str(sample_count)

    if sample_count >= 10:
        profile["confidence"] = "high"
    elif sample_count >= 5:
        profile["confidence"] = "medium"
    else:
        profile["confidence"] = "low"

    profile["tone"] = {
        "formality": dominant_formality,
        "uses_contractions": str(pattern_freq["uses_contractions"]["pct"] > 50).lower(),
        "uses_questions": str(pattern_freq["uses_questions"]["pct"] > 30).lower(),
        "uses_exclamations": str(pattern_freq["uses_exclamations"]["pct"] > 30).lower(),
    }
    profile["structure"] = {
        "avg_sentence_length": str(round(avg_sentence, 1)),
        "avg_word_length": str(round(avg_word, 1)),
        "prefers_bullets": str(pattern_freq["uses_bullet_points"]["pct"] > 40).lower(),
    }
    profile["quirks"] = quirks
    _save_voice_profile(profile)

    return {
        "samples_analyzed": len(texts),
        "total_words": total_words,
        "avg_sentence_length": round(avg_sentence, 1),
        "avg_word_length": round(avg_word, 1),
        "dominant_formality": dominant_formality,
        "patterns": pattern_freq,
        "quirks": quirks,
        "confidence": profile["confidence"],
        "message": f"Analyzed {len(texts)} samples ({total_words} words). Voice profile updated.",
    }


@server.tool()
async def get_voice_profile() -> dict:
    """Read and return the current voice profile from System/voice.yaml."""
    profile = _load_voice_profile()
    return {
        "profile": profile,
        "path": str(VOICE_PATH),
        "exists": VOICE_PATH.exists(),
    }


@server.tool()
async def update_voice_profile(updates: dict) -> dict:
    """Update voice.yaml with new observations or overrides.

    Args:
        updates: Dictionary of profile fields to update.
    """
    profile = _load_voice_profile()
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(profile.get(key), dict):
            profile[key].update(value)
        else:
            profile[key] = value
    _save_voice_profile(profile)
    return {
        "status": "updated",
        "path": str(VOICE_PATH),
        "updated_keys": list(updates.keys()),
    }


@server.tool()
async def record_edit_delta(original: str, edited: str) -> dict:
    """Compare an AI-generated draft with the user's edited version to learn style signals.

    Tracks what the user changes to understand their preferences better.

    Args:
        original: The original AI-generated draft.
        edited: The user's edited version.
    """
    orig_words = set(original.lower().split())
    edit_words = set(edited.lower().split())
    added = edit_words - orig_words
    removed = orig_words - edit_words

    orig_analysis = _analyze_text(original)
    edit_analysis = _analyze_text(edited)

    signals = []
    if edit_analysis["avg_sentence_length"] < orig_analysis["avg_sentence_length"] - 3:
        signals.append("User prefers shorter sentences")
    elif edit_analysis["avg_sentence_length"] > orig_analysis["avg_sentence_length"] + 3:
        signals.append("User prefers longer sentences")

    if edit_analysis["uses_contractions"] and not orig_analysis["uses_contractions"]:
        signals.append("User added contractions (more casual)")
    elif not edit_analysis["uses_contractions"] and orig_analysis["uses_contractions"]:
        signals.append("User removed contractions (more formal)")

    if edit_analysis["uses_exclamations"] and not orig_analysis["uses_exclamations"]:
        signals.append("User added exclamation marks")
    elif not edit_analysis["uses_exclamations"] and orig_analysis["uses_exclamations"]:
        signals.append("User removed exclamation marks")

    # Save delta for learning
    _ensure_dirs()
    delta_file = SAMPLES_DIR / f"delta-{datetime.now().strftime('%Y%m%d%H%M%S')}.json"
    delta_file.write_text(json.dumps({
        "timestamp": datetime.now().isoformat(),
        "signals": signals,
        "words_added": len(added),
        "words_removed": len(removed),
        "original_stats": orig_analysis,
        "edited_stats": edit_analysis,
    }, indent=2))

    return {
        "signals": signals,
        "words_added": len(added),
        "words_removed": len(removed),
        "length_change": len(edited) - len(original),
        "message": f"Detected {len(signals)} style signal(s) from edit." if signals else "No strong style signals detected.",
    }


@server.tool()
async def get_voice_status() -> dict:
    """Return voice training status: sample count, confidence score, areas still learning."""
    profile = _load_voice_profile()
    sample_count = int(profile.get("sample_count", "0"))

    areas_learning = []
    if not profile.get("tone"):
        areas_learning.append("tone")
    if not profile.get("structure"):
        areas_learning.append("structure")
    if not profile.get("vocabulary"):
        areas_learning.append("vocabulary")
    if not profile.get("quirks"):
        areas_learning.append("quirks")

    # Count deltas
    delta_count = len(list(SAMPLES_DIR.glob("delta-*.json"))) if SAMPLES_DIR.exists() else 0

    return {
        "sample_count": sample_count,
        "delta_count": delta_count,
        "confidence": profile.get("confidence", "low"),
        "areas_learning": areas_learning if areas_learning else ["All areas have data"],
        "recommendation": (
            "Feed more writing samples with analyze_writing_samples()."
            if sample_count < 5 else
            "Good coverage. Keep using record_edit_delta() to fine-tune."
            if sample_count < 15 else
            "Strong voice profile. Deltas from edits will keep refining it."
        ),
    }


@server.tool()
async def generate_style_guide() -> dict:
    """Generate a human-readable style guide from the voice profile."""
    profile = _load_voice_profile()
    sample_count = int(profile.get("sample_count", "0"))

    if sample_count == 0:
        return {
            "error": "No writing samples analyzed yet. Run analyze_writing_samples() first.",
        }

    tone = profile.get("tone", {})
    structure = profile.get("structure", {})
    quirks = profile.get("quirks", [])

    lines = [
        "# Writing Style Guide",
        "",
        f"*Based on {sample_count} analyzed samples.*",
        f"*Confidence: {profile.get('confidence', 'low')}*",
        "",
        "## Tone",
        "",
        f"- **Formality:** {tone.get('formality', 'unknown')}",
        f"- **Contractions:** {'Yes' if tone.get('uses_contractions') == 'true' else 'Avoid'}",
        f"- **Questions in writing:** {'Common' if tone.get('uses_questions') == 'true' else 'Rare'}",
        f"- **Exclamation marks:** {'Used' if tone.get('uses_exclamations') == 'true' else 'Avoided'}",
        "",
        "## Structure",
        "",
        f"- **Average sentence length:** {structure.get('avg_sentence_length', '?')} words",
        f"- **Prefers bullet points:** {'Yes' if structure.get('prefers_bullets') == 'true' else 'No'}",
        "",
    ]

    if quirks:
        lines.append("## Quirks & Signatures")
        lines.append("")
        for q in quirks:
            lines.append(f"- {q}")
        lines.append("")

    lines.extend([
        "## Usage Notes",
        "",
        "When writing as this person, mirror these patterns. Don't exaggerate quirks.",
        "Match the formality level and sentence rhythm. When in doubt, shorter is better.",
    ])

    content = "\n".join(lines)
    return {
        "format": "markdown",
        "content": content,
        "confidence": profile.get("confidence", "low"),
    }


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
