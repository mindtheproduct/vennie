'use strict';

const fs = require('fs');
const path = require('path');

// ── PM Philosophy Injection ─────────────────────────────────────────────────
// Loads the user's pm-philosophy.md and injects relevant sections into the
// system prompt. Inspired by gstack's ETHOS.md pattern — core principles
// that shape all reasoning.
//
// The philosophy file lives in the user's vault (System/pm-philosophy.md)
// so it's fully editable. If it doesn't exist, everything no-ops silently.

// ── Session Cache ───────────────────────────────────────────────────────────
// Read once per session, not per message.

let _cache = null;       // { vaultPath, content, sections }
let _cacheVault = null;  // Track which vault was cached

// ── Section Parser ──────────────────────────────────────────────────────────

/**
 * Parse markdown content into named sections keyed by heading text.
 * @param {string} content - Raw markdown
 * @returns {Object<string, string>} Map of heading → section content
 */
function parseSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentKey = null;
  let currentLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentKey) {
        sections[currentKey] = currentLines.join('\n').trim();
      }
      currentKey = headingMatch[1].trim();
      currentLines = [];
    } else if (currentKey) {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentKey) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Load the PM philosophy file from the vault.
 * Caches in memory — reads the file at most once per session per vault.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @returns {string|null} Raw file content, or null if file doesn't exist
 */
function loadPhilosophy(vaultPath) {
  try {
    // Return cached if same vault
    if (_cache && _cacheVault === vaultPath) {
      return _cache.content;
    }

    const filePath = path.join(vaultPath, 'System', 'pm-philosophy.md');
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const sections = parseSections(content);

    _cache = { content, sections };
    _cacheVault = vaultPath;

    return content;
  } catch {
    return null;
  }
}

/**
 * Return the most relevant philosophy section(s) for the current context.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {object} [context={}]
 * @param {string} [context.skill] - Active skill name (e.g. 'daily-review')
 * @param {string} [context.topic] - Topic keywords from the conversation
 * @param {boolean} [context.isDecision] - Whether the user is making a decision
 * @param {boolean} [context.isStrategy] - Whether the conversation is strategic
 * @returns {string|null} Formatted philosophy text ready for prompt injection, or null
 */
function getPhilosophyForContext(vaultPath, context = {}) {
  try {
    const content = loadPhilosophy(vaultPath);
    if (!content || !_cache) return null;

    const { sections } = _cache;
    const parts = [];

    // Decision context → Core Beliefs + Thinking Tools
    if (context.isDecision) {
      if (sections['Core Beliefs']) parts.push(sections['Core Beliefs']);
      if (sections['Thinking Tools']) parts.push(sections['Thinking Tools']);
      return formatPhilosophyForPrompt(parts.join('\n\n'));
    }

    // Strategy context → Core Beliefs + Anti-Patterns
    if (context.isStrategy) {
      if (sections['Core Beliefs']) parts.push(sections['Core Beliefs']);
      if (sections['Anti-Patterns to Challenge']) parts.push(sections['Anti-Patterns to Challenge']);
      return formatPhilosophyForPrompt(parts.join('\n\n'));
    }

    // Review skills → Growth Signals
    const reviewSkills = ['daily-review', 'week-review', 'quarter-review', 'review', 'career-coach'];
    if (context.skill && reviewSkills.includes(context.skill)) {
      if (sections['Growth Signals']) {
        return formatPhilosophyForPrompt(sections['Growth Signals']);
      }
    }

    // Decision-adjacent skills → Core Beliefs + Thinking Tools
    const decisionSkills = ['decision-log', 'product-brief', 'meeting-prep', 'stakeholder-sim'];
    if (context.skill && decisionSkills.includes(context.skill)) {
      if (sections['Core Beliefs']) parts.push(sections['Core Beliefs']);
      if (sections['Thinking Tools']) parts.push(sections['Thinking Tools']);
      return formatPhilosophyForPrompt(parts.join('\n\n'));
    }

    // Strategy-adjacent skills → Core Beliefs + Anti-Patterns
    const strategySkills = ['quarter-plan', 'week-plan', 'project-health', '10x-idea', 'industry-truths'];
    if (context.skill && strategySkills.includes(context.skill)) {
      if (sections['Core Beliefs']) parts.push(sections['Core Beliefs']);
      if (sections['Anti-Patterns to Challenge']) parts.push(sections['Anti-Patterns to Challenge']);
      return formatPhilosophyForPrompt(parts.join('\n\n'));
    }

    // General / fallback → just Core Beliefs (keep it short)
    if (sections['Core Beliefs']) {
      return formatPhilosophyForPrompt(sections['Core Beliefs']);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Wrap philosophy content in a system prompt section.
 *
 * @param {string} content - Philosophy content to inject
 * @returns {string} Formatted for system prompt
 */
function formatPhilosophyForPrompt(content) {
  if (!content) return '';
  return `## PM Philosophy\n\nApply these principles when advising:\n\n${content}`;
}

module.exports = {
  loadPhilosophy,
  getPhilosophyForContext,
  formatPhilosophyForPrompt,
};
