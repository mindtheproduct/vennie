'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PREFS_FILE = path.join(os.homedir(), '.config', 'vennie', 'notification-prefs.json');

const DEFAULT_PREFS = {
  enabled: true,
  quiet_hours: { start: 22, end: 8 },
  categories: {
    decisions: true,
    meetings: true,
    tasks: true,
    career: true,
    radar: true,
  },
};

function getPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
      return { ...DEFAULT_PREFS, ...data, categories: { ...DEFAULT_PREFS.categories, ...data.categories } };
    }
  } catch {}
  return { ...DEFAULT_PREFS };
}

function updatePrefs(partial) {
  const current = getPrefs();
  const updated = {
    ...current,
    ...partial,
    categories: { ...current.categories, ...(partial.categories || {}) },
    quiet_hours: { ...current.quiet_hours, ...(partial.quiet_hours || {}) },
  };

  const dir = path.dirname(PREFS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

function isQuietHours() {
  const prefs = getPrefs();
  const hour = new Date().getHours();
  const { start, end } = prefs.quiet_hours;

  if (start > end) {
    // Wraps midnight (e.g., 22-8)
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

module.exports = { getPrefs, updatePrefs, isQuietHours };
