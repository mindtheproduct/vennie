'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ── Hooks System ────────────────────────────────────────────────────────────
// Simple before/after hooks for skill execution. Hooks are defined in
// .vennie/hooks.yaml and run as child processes with a 10s timeout.
//
// Format:
//   before:daily-plan:
//     - command: "node .scripts/sync-calendar.js"
//   after:process-meetings:
//     - command: "node .scripts/auto-link-people.cjs --today"
//   after:any:
//     - command: "echo 'done' >> /tmp/vennie-log.txt"
//
// Hooks never block the main flow — errors are caught and logged.

const HOOK_TIMEOUT = 10_000; // 10 seconds

let _cachedHooks = null;
let _cachedHooksPath = null;
let _cachedHooksMtime = 0;

/**
 * Load hooks config from .vennie/hooks.yaml. Caches and reloads on change.
 * @param {string} vaultPath
 * @returns {object} Map of hook keys to arrays of hook definitions
 */
function loadHooks(vaultPath) {
  if (!vaultPath) return {};

  const hooksPath = path.join(vaultPath, '.vennie', 'hooks.yaml');

  if (!fs.existsSync(hooksPath)) return {};

  try {
    const stat = fs.statSync(hooksPath);
    if (hooksPath === _cachedHooksPath && stat.mtimeMs === _cachedHooksMtime) {
      return _cachedHooks || {};
    }

    const raw = fs.readFileSync(hooksPath, 'utf8');
    const hooks = parseHooksYaml(raw);
    _cachedHooks = hooks;
    _cachedHooksPath = hooksPath;
    _cachedHooksMtime = stat.mtimeMs;
    return hooks;
  } catch {
    return {};
  }
}

/**
 * Parse the hooks YAML file into a structured object.
 *
 * Expected format:
 *   before:skill-name:
 *     - command: "some command"
 *       timeout: 5000
 *
 * Returns: { "before:skill-name": [{ command: "...", timeout: 5000 }], ... }
 */
function parseHooksYaml(raw) {
  const hooks = {};
  let currentKey = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Top-level hook key: "before:daily-plan:" or "after:any:"
    const keyMatch = trimmed.match(/^((?:before|after):[\w-]+)\s*:\s*$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      if (!hooks[currentKey]) hooks[currentKey] = [];
      continue;
    }

    // Array item start: "- command: ..."
    if (currentKey && trimmed.startsWith('- ')) {
      const cmdMatch = trimmed.match(/^-\s+command\s*:\s*["']?(.+?)["']?\s*$/);
      if (cmdMatch) {
        hooks[currentKey].push({ command: cmdMatch[1] });
      }
      continue;
    }

    // Indented property on the current array item (e.g., timeout)
    if (currentKey && hooks[currentKey].length > 0) {
      const propMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
      if (propMatch) {
        const lastHook = hooks[currentKey][hooks[currentKey].length - 1];
        const key = propMatch[1];
        let value = propMatch[2].trim().replace(/^["']|["']$/g, '');
        // Parse numbers
        if (/^\d+$/.test(value)) value = parseInt(value, 10);
        lastHook[key] = value;
      }
    }
  }

  return hooks;
}

/**
 * Execute a single hook command as a child process.
 * @param {object} hook - Hook definition { command, timeout? }
 * @param {object} env - Environment variables to pass
 * @param {string} cwd - Working directory
 * @returns {Promise<{ok: boolean, output?: string, error?: string}>}
 */
function executeHook(hook, env, cwd) {
  return new Promise((resolve) => {
    const timeout = hook.timeout || HOOK_TIMEOUT;

    const child = exec(hook.command, {
      cwd,
      timeout,
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 512, // 512KB
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          error: error.killed ? `Timed out after ${timeout}ms` : error.message,
          output: stderr || stdout,
        });
      } else {
        resolve({ ok: true, output: stdout });
      }
    });
  });
}

/**
 * Run all matching hooks for a given timing and skill.
 *
 * Matches both specific hooks (e.g., "before:daily-plan") and
 * wildcard hooks (e.g., "before:any", "after:any").
 *
 * @param {'before'|'after'} timing - When to run (before or after skill)
 * @param {string} skillName - Name of the skill being executed
 * @param {object} [context]
 * @param {string} [context.vaultPath] - Vault path (used as cwd and env var)
 * @param {string} [context.model] - Current model ID
 * @returns {Promise<{hookName: string, ok: boolean, error?: string}[]>}
 */
async function runHooks(timing, skillName, context = {}) {
  const vaultPath = context.vaultPath;
  if (!vaultPath) return [];

  const hooks = loadHooks(vaultPath);
  if (!hooks || Object.keys(hooks).length === 0) return [];

  // Collect matching hooks: specific + wildcard
  const specificKey = `${timing}:${skillName}`;
  const wildcardKey = `${timing}:any`;

  const toRun = [];
  if (hooks[specificKey]) {
    for (const h of hooks[specificKey]) toRun.push({ ...h, hookName: specificKey });
  }
  if (hooks[wildcardKey]) {
    for (const h of hooks[wildcardKey]) toRun.push({ ...h, hookName: wildcardKey });
  }

  if (toRun.length === 0) return [];

  // Build environment variables for hooks
  const env = {
    VENNIE_VAULT: vaultPath,
    VENNIE_SKILL: skillName || '',
    VENNIE_MODEL: context.model || process.env.VENNIE_MODEL || '',
  };

  // Run hooks sequentially (order matters for before/after semantics)
  const results = [];
  for (const hook of toRun) {
    try {
      const result = await executeHook(hook, env, vaultPath);
      results.push({
        hookName: hook.hookName,
        command: hook.command,
        ok: result.ok,
        error: result.error,
      });
    } catch (err) {
      // Never let a hook crash the main flow
      results.push({
        hookName: hook.hookName,
        command: hook.command,
        ok: false,
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Check if any hooks are configured for a given timing/skill.
 * @param {'before'|'after'} timing
 * @param {string} skillName
 * @param {string} vaultPath
 * @returns {boolean}
 */
function hasHooks(timing, skillName, vaultPath) {
  const hooks = loadHooks(vaultPath);
  const specificKey = `${timing}:${skillName}`;
  const wildcardKey = `${timing}:any`;
  return !!(
    (hooks[specificKey] && hooks[specificKey].length > 0) ||
    (hooks[wildcardKey] && hooks[wildcardKey].length > 0)
  );
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  runHooks,
  hasHooks,
  loadHooks,
};
