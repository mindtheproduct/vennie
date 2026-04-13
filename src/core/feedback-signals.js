'use strict';

const fs = require('fs');
const path = require('path');

// ── Implicit Feedback Signals ────────────────────────────────────────────
// Tracks how users respond to Vennie's suggestions, nudges, and contextual
// actions. Over time, this data tunes what gets shown — suppressing triggers
// that users consistently ignore and prioritising those they act on.
//
// All I/O is wrapped in try/catch. This system should NEVER crash the app.
// The user never sees "learning from your feedback" — it's fully invisible.

// ── In-memory pending suggestions (not persisted) ────────────────────────
// Tracks what was shown so we can detect "ignored" on the next action.
let _pendingSuggestions = [];

// ── Paths ────────────────────────────────────────────────────────────────

function signalsPath(vaultPath) {
  return path.join(vaultPath, '.vennie', 'feedback-signals.jsonl');
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Core: Record a signal ────────────────────────────────────────────────

/**
 * Append a feedback signal to the JSONL log.
 *
 * @param {string} vaultPath
 * @param {{ type: string, trigger: string, action: string, context?: object }} signal
 */
function recordSignal(vaultPath, signal) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      type: signal.type,
      trigger: signal.trigger || 'unknown',
      action: signal.action || '',
      context: signal.context || {},
    };
    const fp = signalsPath(vaultPath);
    ensureDir(fp);
    fs.appendFileSync(fp, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Never crash — feedback is non-critical
  }
}

// ── Read signals ─────────────────────────────────────────────────────────

/**
 * Read all signals from the JSONL log.
 * @param {string} vaultPath
 * @param {{ since?: string, limit?: number }} options
 * @returns {object[]}
 */
function readSignals(vaultPath, options = {}) {
  try {
    const fp = signalsPath(vaultPath);
    if (!fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, 'utf8').trim();
    if (!raw) return [];
    let signals = raw.split('\n').map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    if (options.since) {
      signals = signals.filter(s => s.timestamp >= options.since);
    }
    if (options.limit && options.limit > 0) {
      signals = signals.slice(-options.limit);
    }
    return signals;
  } catch {
    return [];
  }
}

// ── Aggregate stats ──────────────────────────────────────────────────────

/**
 * Get aggregate signal statistics.
 *
 * @param {string} vaultPath
 * @param {{ trigger?: string, since?: string, limit?: number }} options
 * @returns {{ total: number, acted: number, ignored: number, rejected: number, actRate: number, byTrigger: object }}
 */
function getSignalStats(vaultPath, options = {}) {
  try {
    let signals = readSignals(vaultPath, { since: options.since, limit: options.limit });

    if (options.trigger) {
      signals = signals.filter(s => s.trigger === options.trigger);
    }

    const stats = { total: 0, acted: 0, ignored: 0, rejected: 0, actRate: 0, byTrigger: {} };

    for (const s of signals) {
      stats.total++;
      if (s.type === 'acted' || s.type === 'skill_followed') stats.acted++;
      else if (s.type === 'ignored' || s.type === 'skill_ignored') stats.ignored++;
      else if (s.type === 'rejected') stats.rejected++;

      // Per-trigger breakdown
      if (!stats.byTrigger[s.trigger]) {
        stats.byTrigger[s.trigger] = { acted: 0, total: 0, rate: 0 };
      }
      stats.byTrigger[s.trigger].total++;
      if (s.type === 'acted' || s.type === 'skill_followed') {
        stats.byTrigger[s.trigger].acted++;
      }
    }

    stats.actRate = stats.total > 0 ? stats.acted / stats.total : 0;

    // Compute per-trigger rates
    for (const key of Object.keys(stats.byTrigger)) {
      const t = stats.byTrigger[key];
      t.rate = t.total > 0 ? t.acted / t.total : 0;
    }

    return stats;
  } catch {
    return { total: 0, acted: 0, ignored: 0, rejected: 0, actRate: 0, byTrigger: {} };
  }
}

// ── Should we show this trigger? ─────────────────────────────────────────

/**
 * Decide whether to show a trigger type based on historical act rates.
 *
 * - < 5 occurrences: always show (learning phase)
 * - act rate < 10% over last 20: suppress
 * - act rate < 20% over last 20: show with 50% probability
 * - act rate >= 20%: always show
 *
 * @param {string} vaultPath
 * @param {string} triggerType
 * @returns {{ show: boolean, confidence: number, reason: string }}
 */
function shouldShowTrigger(vaultPath, triggerType) {
  try {
    const signals = readSignals(vaultPath);
    const relevant = signals.filter(s => s.trigger === triggerType);
    const recent = relevant.slice(-20);

    // Learning phase — not enough data
    if (recent.length < 5) {
      return { show: true, confidence: 0.2, reason: 'learning_phase' };
    }

    const acted = recent.filter(s => s.type === 'acted' || s.type === 'skill_followed').length;
    const rate = acted / recent.length;

    if (rate < 0.10) {
      return { show: false, confidence: 0.8, reason: 'suppressed_low_act_rate' };
    }

    if (rate < 0.20) {
      const show = Math.random() < 0.5;
      return { show, confidence: 0.5, reason: 'probabilistic_low_act_rate' };
    }

    return { show: true, confidence: Math.min(0.9, 0.5 + rate), reason: 'healthy_act_rate' };
  } catch {
    return { show: true, confidence: 0, reason: 'error_fallback' };
  }
}

// ── Trigger weights (Bayesian smoothed) ──────────────────────────────────

/**
 * Get learned weights for all trigger types.
 * Weight = Bayesian-smoothed act rate.
 *
 * Prior: 30% act rate, 5 pseudo-observations.
 * Formula: (acted + prior_acted) / (total + prior_total)
 *   where prior_acted = 0.3 * 5 = 1.5, prior_total = 5
 *
 * @param {string} vaultPath
 * @returns {Object<string, number>} triggerType -> weight (0.0 to 1.0)
 */
function getTriggerWeights(vaultPath) {
  try {
    const PRIOR_RATE = 0.3;
    const PRIOR_N = 5;
    const priorActed = PRIOR_RATE * PRIOR_N;

    const signals = readSignals(vaultPath);
    const byTrigger = {};

    for (const s of signals) {
      if (!byTrigger[s.trigger]) {
        byTrigger[s.trigger] = { acted: 0, total: 0 };
      }
      byTrigger[s.trigger].total++;
      if (s.type === 'acted' || s.type === 'skill_followed') {
        byTrigger[s.trigger].acted++;
      }
    }

    const weights = {};
    for (const [trigger, counts] of Object.entries(byTrigger)) {
      weights[trigger] = (counts.acted + priorActed) / (counts.total + PRIOR_N);
    }

    return weights;
  } catch {
    return {};
  }
}

// ── Track shown suggestions (in-memory) ──────────────────────────────────

/**
 * Record that suggestions were shown to the user.
 * Stored in memory — on the next user action, we compare to detect ignores.
 *
 * @param {string} _vaultPath - Unused (in-memory only) but kept for API consistency
 * @param {{ trigger: string, action: string }[]} suggestions
 */
function recordSuggestionShown(_vaultPath, suggestions) {
  try {
    _pendingSuggestions = (suggestions || []).map(s => ({
      trigger: s.trigger || 'unknown',
      action: s.action || s.text || '',
      shownAt: Date.now(),
    }));
  } catch {
    _pendingSuggestions = [];
  }
}

/**
 * Get the currently pending (shown but not yet acted on) suggestions.
 * @returns {{ trigger: string, action: string, shownAt: number }[]}
 */
function getPendingSuggestions() {
  return _pendingSuggestions;
}

/**
 * Clear pending suggestions (call after recording acted/ignored).
 */
function clearPendingSuggestions() {
  _pendingSuggestions = [];
}

// ── Rejection patterns ───────────────────────────────────────────────────

const REJECTION_PATTERNS = /^\s*(no|nah|nope|not now|skip|pass|later|don'?t|dismiss)\s*[.!]?\s*$/i;

/**
 * Check if user input is a rejection of a nudge.
 * @param {string} input
 * @returns {boolean}
 */
function isRejection(input) {
  return REJECTION_PATTERNS.test(input);
}

module.exports = {
  recordSignal,
  getSignalStats,
  shouldShowTrigger,
  getTriggerWeights,
  recordSuggestionShown,
  getPendingSuggestions,
  clearPendingSuggestions,
  isRejection,
};
