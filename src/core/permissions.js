'use strict';

const fs = require('fs');
const path = require('path');
const { getToolTier } = require('./agent.js');

// ── Permission Manager ─────────────────────────────────────────────────────
// Three-tier permission model for tool execution:
//   auto    — Read, Glob, Grep, WebFetch, etc. Always allowed.
//   confirm — Write, Edit, MCP tools. Ask once, remember "always" choice.
//   approve — Bash. Show full context, require explicit approval.
//
// Persistent "always allow" preferences stored in vault config.

const ALWAYS_ALLOW_FILE = 'permissions.json';

/**
 * Load persisted permission preferences from vault.
 */
function loadPreferences(vaultPath) {
  const prefsPath = path.join(vaultPath, '.vennie', ALWAYS_ALLOW_FILE);
  try {
    if (fs.existsSync(prefsPath)) {
      return JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    }
  } catch {}
  return { alwaysAllow: {}, alwaysDeny: {} };
}

/**
 * Save permission preferences to vault.
 */
function savePreferences(vaultPath, prefs) {
  const dir = path.join(vaultPath, '.vennie');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ALWAYS_ALLOW_FILE),
    JSON.stringify(prefs, null, 2),
    'utf8'
  );
}

/**
 * Create a permission checker function.
 *
 * @param {string} vaultPath
 * @param {Function} promptUser - async (toolName, input, tier, description) => 'yes'|'no'|'always'|'never'
 * @returns {Function} checkPermission(toolName, input, tier) => boolean
 */
function createPermissionChecker(vaultPath, promptUser) {
  const prefs = loadPreferences(vaultPath);
  // Session-level allows (don't persist but don't re-ask)
  const sessionAllows = new Set();

  return async function checkPermission(toolName, input, tier) {
    // Auto tier — always allowed
    if (tier === 'auto') return true;

    // Check persistent always-allow
    if (prefs.alwaysAllow[toolName]) return true;

    // Check persistent always-deny
    if (prefs.alwaysDeny && prefs.alwaysDeny[toolName]) return false;

    // Check session allow
    if (sessionAllows.has(toolName)) return true;

    // Build description for the prompt
    const description = buildPermissionDescription(toolName, input);

    // Ask the user
    const response = await promptUser(toolName, input, tier, description);

    switch (response) {
      case 'yes':
      case 'y':
        sessionAllows.add(toolName);
        return true;
      case 'always':
      case 'a':
        prefs.alwaysAllow[toolName] = true;
        savePreferences(vaultPath, prefs);
        return true;
      case 'never':
        if (!prefs.alwaysDeny) prefs.alwaysDeny = {};
        prefs.alwaysDeny[toolName] = true;
        savePreferences(vaultPath, prefs);
        return false;
      case 'no':
      case 'n':
      default:
        return false;
    }
  };
}

/**
 * Build a human-readable description of what a tool will do.
 */
function buildPermissionDescription(toolName, input) {
  const descriptions = {
    Write: () => {
      const file = (input.file_path || '').split('/').pop();
      const size = input.content ? `${(input.content.length / 1024).toFixed(1)}KB` : '';
      return `Write ${file}${size ? ` (${size})` : ''}`;
    },
    Edit: () => {
      const file = (input.file_path || '').split('/').pop();
      return `Edit ${file}: replace "${(input.old_string || '').slice(0, 40)}..."`;
    },
    Bash: () => {
      return `Run: ${(input.command || '').slice(0, 80)}`;
    },
  };

  const fn = descriptions[toolName];
  if (fn) return fn();

  // MCP tools
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return `MCP ${parts[1]}: ${parts.slice(2).join('__')}`;
  }

  return toolName;
}

/**
 * Format a permission prompt for display.
 */
function formatPermissionPrompt(toolName, input, tier, description) {
  const tierLabels = {
    confirm: '⚡',
    approve: '⚠️',
  };
  const icon = tierLabels[tier] || '?';
  const options = tier === 'approve'
    ? '[Y/n/always/never]'
    : '[Y/n/always]';

  return {
    icon,
    description,
    options,
    tier,
    toolName,
  };
}

module.exports = {
  createPermissionChecker,
  loadPreferences,
  savePreferences,
  formatPermissionPrompt,
  buildPermissionDescription,
};
