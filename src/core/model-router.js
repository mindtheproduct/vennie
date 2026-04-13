'use strict';

const fs = require('fs');
const path = require('path');

// ── Model Router ────────────────────────────────────────────────────────────
// Smart model routing for Vennie. Picks the best model based on intent,
// skill name, and optional user overrides. Reads custom rules from
// System/model-routing.yaml in the vault if it exists.

// ── Model Info ──────────────────────────────────────────────────────────────

const MODEL_INFO = {
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    description: 'Fastest, cheapest — great for quick questions and simple lookups',
    inputPer1K: 0.0008,
    outputPer1K: 0.004,
    tier: 'fast',
  },
  sonnet: {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    description: 'Balanced speed and intelligence — best for most tasks',
    inputPer1K: 0.003,
    outputPer1K: 0.015,
    tier: 'balanced',
  },
  opus: {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    description: 'Smartest model — best for strategy, complex analysis, and creative work',
    inputPer1K: 0.015,
    outputPer1K: 0.075,
    tier: 'powerful',
  },
};

// Reverse lookup: model ID → friendly key
const MODEL_ID_TO_KEY = {};
for (const [key, info] of Object.entries(MODEL_INFO)) {
  MODEL_ID_TO_KEY[info.id] = key;
}
// Also map common aliases
MODEL_ID_TO_KEY['claude-sonnet-4-20250514'] = 'sonnet';
MODEL_ID_TO_KEY['claude-opus-4-20250514'] = 'opus';

// ── Default Routing Rules ───────────────────────────────────────────────────

// Skills that should use Opus (complex, strategic, creative)
const OPUS_SKILLS = new Set([
  'career-coach', 'resume-builder', 'product-brief', 'agent-prd',
  'quarter-plan', 'quarter-review', 'identity-snapshot', 'week-review',
  'industry-truths', '10x-idea', 'impact-brief', '1on1-prep',
  'challenge', 'ralph-readiness-dave',
]);

// Skills that should use Sonnet (balanced — most skill work)
const SONNET_SKILLS = new Set([
  'daily-plan', 'daily-review', 'week-plan', 'meeting-prep',
  'process-meetings', 'project-health', 'triage', 'review',
  'dex-level-up', 'dex-backlog', 'dex-improve', 'leadership-update',
  'decision-log', 'tech-debt', 'commitment-scan', 'mtp-sprint',
  'save-insight', 'create-skill', 'scrape',
]);

// Skills that can use Haiku (simple, lookup-oriented)
const HAIKU_SKILLS = new Set([
  'health-check', 'ai-status', 'beta-status', 'dex-whats-new',
  'mtp-metrics', 'xray', 'cost',
]);

// Patterns that suggest a quick/simple question (→ haiku)
const QUICK_PATTERNS = [
  /^(what|when|where|who|how much|how many)\s.{3,40}\??$/i,
  /^(yes|no|ok|sure|thanks|thank you|got it|sounds good)\.?$/i,
  /^(remind me|what time|what day|when is)/i,
  /^(show|list|find)\s\w+$/i,
];

// Patterns that suggest complex/strategic work (→ opus)
const COMPLEX_PATTERNS = [
  /\b(strategy|strategic|roadmap|vision|architecture)\b/i,
  /\b(prd|product requirements|spec|specification)\b/i,
  /\b(career|promotion|compensation|negotiate)\b/i,
  /\b(review my|critique|analyse|analyze|evaluate)\b.*\b(plan|approach|design|architecture)\b/i,
  /\b(compare|trade-?offs?|pros and cons)\b/i,
  /\b(write a|draft a|create a)\s+(prd|brief|proposal|pitch|essay)/i,
];

// ── Config Loader ───────────────────────────────────────────────────────────

let _cachedConfig = null;
let _cachedConfigPath = null;
let _cachedConfigMtime = 0;

/**
 * Load custom routing config from vault. Caches and reloads on file change.
 * @param {string} vaultPath
 * @returns {object|null}
 */
function loadRoutingConfig(vaultPath) {
  if (!vaultPath) return null;

  const configPath = path.join(vaultPath, 'System', 'model-routing.yaml');

  if (!fs.existsSync(configPath)) return null;

  try {
    const stat = fs.statSync(configPath);
    if (configPath === _cachedConfigPath && stat.mtimeMs === _cachedConfigMtime) {
      return _cachedConfig;
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const config = parseSimpleYaml(raw);
    _cachedConfig = config;
    _cachedConfigPath = configPath;
    _cachedConfigMtime = stat.mtimeMs;
    return config;
  } catch {
    return null;
  }
}

/**
 * Minimal YAML parser for the routing config.
 * Handles: default_model, skill overrides, and pattern rules.
 */
function parseSimpleYaml(raw) {
  const config = { default: null, skills: {}, patterns: [] };
  let currentSection = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Top-level keys
    const kvMatch = trimmed.match(/^(\w[\w_-]*)\s*:\s*(.*)$/);
    if (kvMatch && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      if (key === 'default' || key === 'default_model') {
        config.default = value || null;
        currentSection = null;
      } else if (key === 'skills') {
        currentSection = 'skills';
      } else if (key === 'patterns') {
        currentSection = 'patterns';
      }
      continue;
    }

    // Indented items under skills section
    if (currentSection === 'skills') {
      const skillMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(\w+)\s*$/);
      if (skillMatch) {
        config.skills[skillMatch[1]] = skillMatch[2];
      }
    }
  }

  return config;
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Route to the best model based on intent, skill, and options.
 *
 * @param {string} intent - The user's input text (or empty string)
 * @param {string|null} skillName - Active skill name, or null
 * @param {object} [options]
 * @param {string} [options.override] - Explicit model override (always wins)
 * @param {string} [options.vaultPath] - Vault path for custom config
 * @returns {string} Model ID string
 */
function routeModel(intent, skillName, options = {}) {
  // 1. Explicit override always wins
  if (options.override) {
    return resolveModelAlias(options.override);
  }

  // 2. VENNIE_MODEL env var (user's default preference)
  //    Only used when auto-routing is disabled
  if (options.useEnvDefault && process.env.VENNIE_MODEL) {
    return process.env.VENNIE_MODEL;
  }

  // 3. Custom config from vault
  const config = loadRoutingConfig(options.vaultPath);
  if (config) {
    // Skill-specific override in config
    if (skillName && config.skills[skillName]) {
      return resolveModelAlias(config.skills[skillName]);
    }
    // Default model from config
    if (config.default) {
      // Only use config default when no skill/intent routing applies
      // (fall through to check rules first, use as final fallback)
    }
  }

  // 4. Skill-based routing
  if (skillName) {
    if (OPUS_SKILLS.has(skillName)) return MODEL_INFO.opus.id;
    if (HAIKU_SKILLS.has(skillName)) return MODEL_INFO.haiku.id;
    if (SONNET_SKILLS.has(skillName)) return MODEL_INFO.sonnet.id;
    // Unknown skill → sonnet (safe default)
    return MODEL_INFO.sonnet.id;
  }

  // 5. Intent-based routing (pattern matching on user input)
  if (intent) {
    // Check complex patterns first (more specific)
    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(intent)) return MODEL_INFO.opus.id;
    }

    // Check quick patterns
    for (const pattern of QUICK_PATTERNS) {
      if (pattern.test(intent)) return MODEL_INFO.haiku.id;
    }

    // Short messages (< 20 chars, no newlines) → likely quick
    if (intent.length < 20 && !intent.includes('\n')) {
      return MODEL_INFO.haiku.id;
    }
  }

  // 6. Config default or sonnet
  if (config && config.default) {
    return resolveModelAlias(config.default);
  }

  return MODEL_INFO.sonnet.id;
}

/**
 * Resolve a friendly name to a full model ID.
 * @param {string} alias - 'opus', 'sonnet', 'haiku', or a full model ID
 * @returns {string}
 */
function resolveModelAlias(alias) {
  if (!alias) return MODEL_INFO.sonnet.id;
  const lower = alias.toLowerCase().trim();
  if (MODEL_INFO[lower]) return MODEL_INFO[lower].id;
  // Already a full model ID
  return alias;
}

/**
 * Get the friendly name for a model ID.
 * @param {string} modelId
 * @returns {string}
 */
function getModelDisplayName(modelId) {
  const key = MODEL_ID_TO_KEY[modelId];
  if (key && MODEL_INFO[key]) return MODEL_INFO[key].name;
  return modelId;
}

/**
 * Format a cost comparison between two models.
 * @param {string} fromId - Current model ID
 * @param {string} toId - Target model ID
 * @returns {string}
 */
function formatCostComparison(fromId, toId) {
  const fromKey = MODEL_ID_TO_KEY[fromId];
  const toKey = MODEL_ID_TO_KEY[toId];
  if (!fromKey || !toKey || fromKey === toKey) return '';

  const from = MODEL_INFO[fromKey];
  const to = MODEL_INFO[toKey];

  const inputRatio = to.inputPer1K / from.inputPer1K;
  const outputRatio = to.outputPer1K / from.outputPer1K;
  const avgRatio = (inputRatio + outputRatio) / 2;

  if (avgRatio > 1) {
    return `~${avgRatio.toFixed(1)}x more expensive than ${from.name}`;
  } else {
    return `~${(1 / avgRatio).toFixed(1)}x cheaper than ${from.name}`;
  }
}

/**
 * Get routing info string for display.
 * @param {string} modelId - Current model ID
 * @param {boolean} autoRouting - Whether auto-routing is active
 * @returns {string}
 */
function getRoutingInfo(modelId, autoRouting) {
  const key = MODEL_ID_TO_KEY[modelId];
  const info = key ? MODEL_INFO[key] : null;
  const lines = [];

  lines.push(`Current: ${info ? info.name : modelId}`);
  if (info) lines.push(`  ${info.description}`);
  lines.push(`Routing: ${autoRouting ? 'auto (model chosen per task)' : 'manual (fixed model)'}`);
  lines.push('');
  lines.push('Available models:');
  for (const [k, m] of Object.entries(MODEL_INFO)) {
    const marker = m.id === modelId ? ' ←' : '';
    lines.push(`  ${k.padEnd(7)} ${m.name.padEnd(12)} $${m.inputPer1K}/$${m.outputPer1K} per 1K tokens${marker}`);
  }

  return lines.join('\n');
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  routeModel,
  resolveModelAlias,
  getModelDisplayName,
  formatCostComparison,
  getRoutingInfo,
  MODEL_INFO,
  MODEL_ID_TO_KEY,
};
