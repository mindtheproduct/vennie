'use strict';

const fs = require('fs');
const path = require('path');

// ── Persona Memory ────────────────────────────────────────────────────────
// Accumulates observations about the user across persona sessions. After
// repeated use, a persona builds a rich picture of recurring patterns,
// blind spots, and strengths — enabling increasingly targeted coaching.
//
// Storage: `.vennie/personas/memory/<persona-id>.json`
// Format: JSON (structured data, not markdown)

const PERSONA_MEMORY_DIR = '.vennie/personas/memory';
const MAX_OBSERVATIONS = 50;
const MAX_PATTERNS = 10;

// ── Helpers ───────────────────────────────────────────────────────────────

function ensurePersonaMemoryDir(vaultPath) {
  const dir = path.join(vaultPath, PERSONA_MEMORY_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function memoryFilePath(vaultPath, personaId) {
  return path.join(vaultPath, PERSONA_MEMORY_DIR, `${personaId}.json`);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function blankMemory(personaId) {
  return {
    personaId,
    sessionCount: 0,
    observations: [],
    patterns: [],
    lastSession: null,
  };
}

/**
 * Read a persona memory file from disk. Returns blank structure if missing.
 */
function readMemoryFile(vaultPath, personaId) {
  const filePath = memoryFilePath(vaultPath, personaId);
  if (!fs.existsSync(filePath)) {
    return blankMemory(personaId);
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    // Ensure all expected fields exist (defensive against partial writes)
    return {
      personaId: data.personaId || personaId,
      sessionCount: data.sessionCount || 0,
      observations: Array.isArray(data.observations) ? data.observations : [],
      patterns: Array.isArray(data.patterns) ? data.patterns : [],
      lastSession: data.lastSession || null,
    };
  } catch (_) {
    // Corrupted file — start fresh rather than crash
    return blankMemory(personaId);
  }
}

/**
 * Write persona memory to disk. Creates directory if needed.
 * Read-modify-write pattern: callers read first, mutate, then write.
 */
function writeMemoryFile(vaultPath, personaId, data) {
  ensurePersonaMemoryDir(vaultPath);
  const filePath = memoryFilePath(vaultPath, personaId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── Format Helpers ────────────────────────────────────────────────────────

/**
 * Format a date string (YYYY-MM-DD) as a short label like "Apr 8".
 */
function shortDate(dateStr) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${months[monthIdx] || parts[1]} ${day}`;
}

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * Load accumulated observations for a persona.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} personaId - Persona identifier (e.g. 'growth-pm')
 * @returns {Object} Persona memory object
 */
function loadPersonaMemory(vaultPath, personaId) {
  return readMemoryFile(vaultPath, personaId);
}

/**
 * Append an observation to a persona's memory.
 * Observations are capped at MAX_OBSERVATIONS (FIFO — oldest dropped first).
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} personaId - Persona identifier
 * @param {string} observation - Free-text observation string
 * @returns {Object} Updated persona memory
 */
function savePersonaObservation(vaultPath, personaId, observation) {
  const memory = readMemoryFile(vaultPath, personaId);

  memory.observations.push({
    date: todayStr(),
    text: observation,
  });

  // FIFO cap: drop oldest when over limit
  if (memory.observations.length > MAX_OBSERVATIONS) {
    memory.observations = memory.observations.slice(-MAX_OBSERVATIONS);
  }

  writeMemoryFile(vaultPath, personaId, memory);
  return memory;
}

/**
 * Update the high-level patterns array for a persona.
 * Patterns are synthesized by Claude during sessions, not heuristically.
 * Capped at MAX_PATTERNS (newest replace oldest).
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} personaId - Persona identifier
 * @param {string[]} patterns - Array of pattern strings
 * @returns {Object} Updated persona memory
 */
function updatePersonaPatterns(vaultPath, personaId, patterns) {
  const memory = readMemoryFile(vaultPath, personaId);

  memory.patterns = Array.isArray(patterns) ? patterns.slice(0, MAX_PATTERNS) : [];

  writeMemoryFile(vaultPath, personaId, memory);
  return memory;
}

/**
 * Returns a formatted string for injection into the system prompt.
 * Includes patterns (all) and recent observations (last 10).
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} personaId - Persona identifier
 * @returns {string} Formatted context block, or empty string if no memory
 */
function getPersonaContext(vaultPath, personaId) {
  const memory = readMemoryFile(vaultPath, personaId);

  if (memory.sessionCount === 0) return '';

  // Build a human-friendly persona label from the ID
  const label = personaId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const lines = [`## Persona Memory (${label})\n`];
  lines.push(
    `You've worked with this user ${memory.sessionCount} time${memory.sessionCount === 1 ? '' : 's'}. Here's what you've observed:\n`
  );

  if (memory.patterns.length > 0) {
    lines.push('**Patterns:**');
    for (const p of memory.patterns) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  if (memory.observations.length > 0) {
    lines.push('**Recent observations:**');
    // Show the last 10 observations, most recent first
    const recent = memory.observations.slice(-10).reverse();
    for (const obs of recent) {
      lines.push(`- [${shortDate(obs.date)}] ${obs.text}`);
    }
    lines.push('');
  }

  lines.push(
    'Use these observations to provide more targeted, personalized coaching. Challenge recurring blind spots. Build on known strengths.'
  );

  return lines.join('\n');
}

/**
 * Bump the session count and update lastSession date.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} personaId - Persona identifier
 * @returns {Object} Updated persona memory
 */
function incrementSessionCount(vaultPath, personaId) {
  const memory = readMemoryFile(vaultPath, personaId);

  memory.sessionCount += 1;
  memory.lastSession = todayStr();

  writeMemoryFile(vaultPath, personaId, memory);
  return memory;
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  loadPersonaMemory,
  savePersonaObservation,
  updatePersonaPatterns,
  getPersonaContext,
  incrementSessionCount,
};
