'use strict';

const fs = require('fs');
const path = require('path');
const { getPhilosophyForContext } = require('./philosophy');

// ── Tiered Context Injection ────────────────────────────────────────────────
// Replaces monolithic system prompt loading with a tiered system that only
// injects context relevant to the current turn.
//
// Tier 0: Always loaded (~800 tokens) — identity, user basics, date/time
// Tier 1: Loaded when relevant (~500 tokens each) — persona, philosophy, preflight
// Tier 2: Loaded on demand (~300 tokens each) — learnings, artifacts, frameworks
// Tier 3: Never in system prompt — fetched via tools or injected by preflight

// ── Session Caches ──────────────────────────────────────────────────────────
// Read once per session, not per message.

let _personalityCache = null;  // { vaultPath, content }
let _profileCache = null;      // { vaultPath, content }

// ── Token Estimation ────────────────────────────────────────────────────────

/**
 * Quick token estimate (~4 chars per token).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ── Personality Core Extraction ─────────────────────────────────────────────

const FALLBACK_PERSONALITY = `You are Vennie, a product career coach and thinking partner built by Mind the Product.
You help product people do better work, make sharper decisions, build their careers, and enjoy the process.
You're warm, friendly, and real — like a smart colleague who genuinely cares. Never cold, never corporate.
You have opinions and share them when useful, but you read the room first.
Use their name naturally. Reference their actual context — role, company, projects.
Mirror their energy. If they're casual, be casual back. If they're playful, be playful. If they need a push, push.
Meet people where they are — if someone says "hey bestie", roll with it warmly. Never correct someone's tone.

Skip hollow filler like "Great question!" or "I'd be happy to help!" — just be genuine.

What you DO say: "Here's what I'd do.", "I'd rethink that. Here's why.", "Nice. That's going to land well.",
"What does your gut say?", "No rush — want to think on it?", "Hey! What are we getting into today?"`;

/**
 * Reads VENNIE.md and extracts the essential personality (~500 tokens).
 * Caches in memory — read once per session.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @returns {string} Personality core instructions
 */
function extractPersonalityCore(vaultPath) {
  try {
    // Return cached if same vault
    if (_personalityCache && _personalityCache.vaultPath === vaultPath) {
      return _personalityCache.content;
    }

    // Prefer VENNIE.md (personality source of truth), fall back to CLAUDE.md
    const vennieMd = path.join(vaultPath, 'VENNIE.md');
    const claudeMd = path.join(vaultPath, 'CLAUDE.md');
    const personalityFile = fs.existsSync(vennieMd) ? vennieMd : claudeMd;
    if (!fs.existsSync(personalityFile)) {
      _personalityCache = { vaultPath, content: FALLBACK_PERSONALITY };
      return FALLBACK_PERSONALITY;
    }

    const raw = fs.readFileSync(personalityFile, 'utf8');
    const parts = [];

    // Extract the two opening identity paragraphs only (stop at ### heading)
    const lines = raw.split('\n');
    const identityLines = [];
    let started = false;
    for (const line of lines) {
      if (!started) {
        // Skip title, blank lines, and **Last Updated** line
        if (line.startsWith('#') || line.startsWith('**Last Updated') || line.trim() === '') continue;
        started = true;
      }
      if (started) {
        // Stop at first sub-heading or horizontal rule
        if (line.startsWith('###') || line.startsWith('---')) break;
        identityLines.push(line);
      }
    }
    if (identityLines.length > 0) {
      parts.push(identityLines.join('\n').trim());
    }

    // Extract "Making It Personal" — condensed to essential directives only
    const makingItPersonal = extractSection(raw, 'Making It Personal');
    if (makingItPersonal) {
      // Distill to: access statement + key behavior rules (no examples)
      const condensed = [];
      let inExamples = false;
      for (const line of makingItPersonal.split('\n')) {
        // Stop at verbose example blocks
        if (line.startsWith('**What this looks like')) { inExamples = true; continue; }
        if (inExamples) {
          // Resume at next bold directive
          if (line.startsWith('**') && !line.startsWith('- ')) inExamples = false;
          else continue;
        }
        // Keep the access statement (first paragraph) and bold headers
        if (line.startsWith('You have access') || line.startsWith('**In ')) {
          condensed.push(line);
        }
        // Keep short bullet points (skip long explanatory ones)
        if (line.startsWith('- ') && line.length < 120) {
          condensed.push(line);
        }
      }
      if (condensed.length > 0) {
        parts.push(`### Making It Personal\n${condensed.join('\n').trim()}`);
      }
    }

    // Extract "What Vennie NEVER Says" and "What Vennie DOES Say"
    const neverSays = extractSection(raw, 'What Vennie NEVER Says');
    if (neverSays) {
      parts.push(`### What Vennie NEVER Says\n${neverSays.trim()}`);
    }

    const doesSay = extractSection(raw, 'What Vennie DOES Say');
    if (doesSay) {
      // Strip any trailing --- separators
      const cleaned = doesSay.trim().replace(/\n---\s*$/, '').trim();
      parts.push(`### What Vennie DOES Say\n${cleaned}`);
    }

    let result = parts.join('\n\n');

    // If extraction produced too little, fall back
    if (estimateTokens(result) < 100) {
      result = FALLBACK_PERSONALITY;
    }

    // Hard cap: if still over 500 tokens, keep only identity + never/does say
    if (estimateTokens(result) > 500) {
      const trimmed = [];
      if (parts[0]) trimmed.push(parts[0]);
      for (const p of parts) {
        if (p.includes('NEVER Says') || p.includes('DOES Say')) {
          trimmed.push(p);
        }
      }
      result = trimmed.join('\n\n');
    }

    _personalityCache = { vaultPath, content: result };
    return result;
  } catch {
    _personalityCache = { vaultPath, content: FALLBACK_PERSONALITY };
    return FALLBACK_PERSONALITY;
  }
}

/**
 * Extract a markdown section by heading text (### level).
 * Returns content until next heading of same or higher level.
 *
 * @param {string} markdown - Full markdown content
 * @param {string} heading - Heading text to find
 * @returns {string|null} Section content (without heading), or null
 */
function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  let capturing = false;
  const captured = [];
  const headingPattern = new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`);

  for (const line of lines) {
    if (capturing) {
      // Stop at next heading of same or higher level
      if (/^#{1,3}\s+/.test(line)) break;
      captured.push(line);
    } else if (headingPattern.test(line)) {
      capturing = true;
    }
  }

  return captured.length > 0 ? captured.join('\n') : null;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Profile Core Extraction ─────────────────────────────────────────────────

/**
 * Reads profile.yaml and extracts key fields.
 * Caches in memory — read once per session.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @returns {string} Formatted profile string, or empty string if not available
 */
function extractProfileCore(vaultPath) {
  try {
    // Return cached if same vault
    if (_profileCache && _profileCache.vaultPath === vaultPath) {
      return _profileCache.content;
    }

    const profilePath = path.join(vaultPath, 'System', 'profile.yaml');
    if (!fs.existsSync(profilePath)) {
      _profileCache = { vaultPath, content: '' };
      return '';
    }

    const raw = fs.readFileSync(profilePath, 'utf8');

    // Simple YAML extraction — no dependency on yaml parser
    const get = (key) => {
      const match = raw.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'));
      return match ? match[1].trim() : null;
    };

    const name = get('name');
    const role = get('role');
    const careerLevel = get('career_level');
    const company = get('company');
    const companySize = get('company_size');
    const companyStage = get('company_stage');
    const productType = get('product_type');

    // Build a concise profile line
    const parts = [];
    if (name) parts.push(name);
    if (role) parts.push(role);
    if (company) {
      let companyStr = `at ${company}`;
      if (companySize) companyStr += ` (${companySize})`;
      else if (companyStage) companyStr += ` (${companyStage})`;
      parts.push(companyStr);
    }
    if (careerLevel) parts.push(`career level: ${careerLevel}`);
    if (productType) parts.push(`product type: ${productType}`);

    const result = parts.length > 0 ? `User: ${parts.join(', ')}` : '';

    _profileCache = { vaultPath, content: result };
    return result;
  } catch {
    _profileCache = { vaultPath, content: '' };
    return '';
  }
}

// ── Tier Loading Logic ──────────────────────────────────────────────────────

/**
 * Determines if a tier should be loaded based on current options.
 *
 * @param {number} tier - Tier number (0, 1, or 2)
 * @param {object} options - Current context options
 * @returns {boolean}
 */
function shouldLoadTier(tier, options = {}) {
  switch (tier) {
    case 0:
      return true; // Always loaded

    case 1:
      // Load if any Tier 1 content is available
      return !!(
        options.persona ||
        options.activeSkill ||
        options.preflightContext ||
        options.userMessage // philosophy needs topic context
      );

    case 2:
      // Load if any Tier 2 content is available
      return !!(
        options.learningsContext ||
        options.activeSkill // artifacts need active skill
      );

    default:
      return false;
  }
}

// ── Main Builder ────────────────────────────────────────────────────────────

/**
 * Build the system prompt context using tiers. Only loads what's relevant
 * to the current turn to reduce token waste and improve model attention.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {object} [options={}]
 * @param {string} [options.persona] - Name of active persona, or null
 * @param {string} [options.activeSkill] - Name of active skill, or null
 * @param {string} [options.userMessage] - Current user message (for topic inference)
 * @param {string} [options.preflightContext] - Preflight-gathered context
 * @param {string} [options.calibrationInstruction] - Response calibration instruction
 * @param {object} [options.learningsContext] - Context for retrieving relevant learnings
 * @returns {{ systemPrompt: string, tokenEstimate: number }}
 */
function buildTieredContext(vaultPath, options = {}) {
  const parts = [];
  let tokenBudget = 0;

  // ── Tier 0: Always loaded ───────────────────────────────────────────────

  // Personality core (~500 tokens)
  const personality = extractPersonalityCore(vaultPath);
  parts.push(personality);
  tokenBudget += estimateTokens(personality);

  // Energy/intent matching — right after identity for tone guidance (~40 tokens)
  if (options.energyInstruction) {
    const energyBlock = `\n## Current Vibe\n${options.energyInstruction}`;
    parts.push(energyBlock);
    tokenBudget += estimateTokens(energyBlock);
  }

  // User profile core (~50 tokens)
  const profile = extractProfileCore(vaultPath);
  if (profile) {
    parts.push(`\n---\n${profile}`);
    tokenBudget += estimateTokens(profile) + 5;
  }

  // Tool routing guidance (~120 tokens) — prevents blind vault searches
  const toolGuidance = `
## Tool Routing
- **People questions:** ALWAYS use mcp__work__lookup_person first. It fuzzy-matches names instantly. Do NOT grep the entire vault for a person.
- **People listing:** Use mcp__work__search_people to list/filter people.
- **Work summary:** Use mcp__work__get_work_summary for goals, focus, decisions overview.
- **Vault files:** Use Glob to find files by pattern, then Read to view them. Don't grep blindly.
- **Keep turns low.** Most queries should resolve in 1-3 tool calls. If you're past 5, step back and reconsider your approach.`;
  parts.push(toolGuidance);
  tokenBudget += estimateTokens(toolGuidance);

  // Date/time (~30 tokens)
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateBlock = `Current date and time: ${dateStr}, ${timeStr} (${tz})`;
  parts.push(`\n---\n${dateBlock}`);
  tokenBudget += estimateTokens(dateBlock) + 5;

  // Calibration instruction (if provided)
  if (options.calibrationInstruction) {
    parts.push(`\n---\n${options.calibrationInstruction}`);
    tokenBudget += estimateTokens(options.calibrationInstruction) + 5;
  }

  // ── Tier 1: Loaded when relevant ────────────────────────────────────────

  if (shouldLoadTier(1, options)) {
    // Persona overlay
    if (options.persona) {
      const personaContent = loadPersona(vaultPath, options.persona);
      if (personaContent) {
        const block = `\n---\n## Active Persona: ${options.persona}\n\n${personaContent}`;
        parts.push(block);
        tokenBudget += estimateTokens(block);
      }
    }

    // Philosophy — relevant section only
    try {
      const philosophyContext = {
        skill: options.activeSkill || null,
        topic: options.userMessage ? options.userMessage.slice(0, 200) : null,
        isDecision: false,
        isStrategy: false,
      };
      const philosophy = getPhilosophyForContext(vaultPath, philosophyContext);
      if (philosophy) {
        parts.push(`\n---\n${philosophy}`);
        tokenBudget += estimateTokens(philosophy) + 5;
      }
    } catch {
      // Philosophy should never crash prompt building
    }

    // Preflight context
    if (options.preflightContext) {
      parts.push(`\n---\n## Preflight Context\n\n${options.preflightContext}`);
      tokenBudget += estimateTokens(options.preflightContext) + 15;
    }
  }

  // ── Tier 2: Loaded on demand ────────────────────────────────────────────

  if (shouldLoadTier(2, options)) {
    // Relevant learnings
    if (options.learningsContext) {
      try {
        const { getRelevantLearnings, formatLearningsForPrompt } = require('./learnings.js');
        const learnings = getRelevantLearnings(vaultPath, options.learningsContext);
        const formatted = formatLearningsForPrompt(learnings);
        if (formatted) {
          parts.push(`\n---\n${formatted}`);
          tokenBudget += estimateTokens(formatted) + 5;
        }
      } catch {
        // Learnings should never crash prompt building
      }
    }

    // Upstream skill artifacts (handled in agentLoop via options.activeSkill)
    // Not injected here — injected in agentLoop where it has skillContext
  }

  return {
    systemPrompt: parts.join('\n'),
    tokenEstimate: tokenBudget,
  };
}

// ── Persona Loader ──────────────────────────────────────────────────────────

/**
 * Load a persona file by name, searching standard directories.
 *
 * @param {string} vaultPath
 * @param {string} personaName
 * @returns {string|null}
 */
function loadPersona(vaultPath, personaName) {
  try {
    const slug = personaName.toLowerCase().replace(/\s+/g, '-');
    const searchDirs = ['core', 'marketplace', 'custom', '.'];
    for (const dir of searchDirs) {
      const p = path.join(vaultPath, '.vennie', 'personas', dir, `${slug}.md`);
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Cache Reset (for testing) ───────────────────────────────────────────────

function resetCaches() {
  _personalityCache = null;
  _profileCache = null;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  buildTieredContext,
  extractPersonalityCore,
  extractProfileCore,
  estimateTokens,
  shouldLoadTier,
  resetCaches,
};
