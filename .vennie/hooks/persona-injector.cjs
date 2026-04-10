#!/usr/bin/env node
/**
 * persona-injector.cjs — PreToolUse hook
 *
 * Reads the active persona from System/.active-persona and injects
 * the persona's full prompt wrapped in <active_persona> XML tags.
 * Also loads persona-specific memory for continuity across sessions.
 *
 * Applies to ALL tool uses — the persona context shapes how Vennie
 * thinks about every action, not just specific skills.
 *
 * Output: JSON with optional `context` field to inject into the conversation.
 */

const fs = require("fs");
const path = require("path");

const SYSTEM_DIR = process.env.SYSTEM_DIR || "System";
const VENNIE_DIR = process.env.VENNIE_DIR || ".vennie";
const ACTIVE_PERSONA_FILE = path.join(SYSTEM_DIR, ".active-persona");
const PERSONAS_DIR = path.join(VENNIE_DIR, "personas");
const CORE_PERSONAS_DIR = path.join(PERSONAS_DIR, "core");
const CUSTOM_PERSONAS_DIR = path.join(PERSONAS_DIR, "custom");
const PERSONA_MEMORY_DIR = path.join(SYSTEM_DIR, ".persona-memory");

function main() {
  // Check if a persona is active
  if (!fs.existsSync(ACTIVE_PERSONA_FILE)) {
    output({ skip: true });
    return;
  }

  let activePersonaId;
  try {
    activePersonaId = fs.readFileSync(ACTIVE_PERSONA_FILE, "utf8").trim();
  } catch {
    output({ skip: true });
    return;
  }

  if (!activePersonaId || activePersonaId === "none") {
    output({ skip: true });
    return;
  }

  // Locate the persona file — check core first, then custom
  const personaFile = resolvePersonaFile(activePersonaId);
  if (!personaFile) {
    output({
      error: `Active persona "${activePersonaId}" not found in core or custom personas.`,
    });
    return;
  }

  // Read persona content
  let personaContent;
  try {
    personaContent = fs.readFileSync(personaFile, "utf8");
  } catch (err) {
    output({ error: `Failed to read persona file: ${err.message}` });
    return;
  }

  // Parse frontmatter for metadata
  const metadata = parseFrontmatter(personaContent);
  const bodyContent = stripFrontmatter(personaContent);

  // Load persona memory if it exists
  const memory = loadPersonaMemory(activePersonaId);

  // Build injection context
  const parts = [];

  parts.push(`<active_persona id="${activePersonaId}">`);

  if (metadata.name) {
    parts.push(`<persona_identity>`);
    parts.push(`Name: ${metadata.name}`);
    if (metadata.archetype) parts.push(`Archetype: ${metadata.archetype}`);
    if (metadata.style) parts.push(`Style: ${metadata.style}`);
    if (metadata.challenge_pattern)
      parts.push(`Challenge Pattern: ${metadata.challenge_pattern}`);
    if (metadata.blind_spots)
      parts.push(`Known Blind Spots: ${metadata.blind_spots}`);
    if (metadata.best_for) parts.push(`Best For: ${metadata.best_for}`);
    parts.push(`</persona_identity>`);
  }

  parts.push(`<persona_prompt>`);
  parts.push(bodyContent.trim());
  parts.push(`</persona_prompt>`);

  if (memory) {
    parts.push(`<persona_memory>`);
    parts.push(memory);
    parts.push(`</persona_memory>`);
  }

  parts.push(`</active_persona>`);

  output({ context: parts.join("\n") });
}

/**
 * Resolve a persona ID to a file path.
 * Checks core/ first (built-in personas), then custom/ (user-created).
 */
function resolvePersonaFile(personaId) {
  const candidates = [
    path.join(CORE_PERSONAS_DIR, `${personaId}.md`),
    path.join(CUSTOM_PERSONAS_DIR, `${personaId}.md`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Also check by scanning directories for files with matching id in frontmatter
  for (const dir of [CORE_PERSONAS_DIR, CUSTOM_PERSONAS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf8");
        const meta = parseFrontmatter(content);
        if (meta.id === personaId) {
          return path.join(dir, file);
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Load persona-specific memory for continuity.
 * Memory files are stored as System/.persona-memory/<persona-id>.md
 */
function loadPersonaMemory(personaId) {
  const memoryFile = path.join(PERSONA_MEMORY_DIR, `${personaId}.md`);
  if (!fs.existsSync(memoryFile)) return null;

  try {
    const content = fs.readFileSync(memoryFile, "utf8").trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns an object with the frontmatter fields.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Strip YAML frontmatter from markdown, returning only the body.
 */
function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

/**
 * Output result as JSON to stdout.
 */
function output(data) {
  console.log(JSON.stringify(data));
}

main();
