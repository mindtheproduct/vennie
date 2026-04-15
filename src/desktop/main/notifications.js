'use strict';

const { Notification, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { getPrefs, isQuietHours } = require('./notification-prefs.js');

// ── State ─────────────────────────────────────────────────────────────────

const sentThisSession = new Set();
let dailyCount = 0;
let lastResetDate = new Date().toDateString();
const DAILY_LIMIT = 5;

// ── Frontmatter Parser (lightweight, no YAML dep) ─────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const obj = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_]*):\s*(.+)/);
    if (kv) {
      let val = kv[2].trim().replace(/^["']|["']$/g, '');
      // Parse arrays: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      obj[kv[1]] = val;
    }
  }
  return obj;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function safeReadDir(dirPath) {
  try { return fs.readdirSync(dirPath).filter(f => f.endsWith('.md')); } catch { return []; }
}

function safeReadFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function sendNotification(id, title, body, navigateTo) {
  if (sentThisSession.has(id)) return;

  // Reset daily count at day boundary
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyCount = 0;
    lastResetDate = today;
  }
  if (dailyCount >= DAILY_LIMIT) return;

  const prefs = getPrefs();
  if (!prefs.enabled) return;
  if (isQuietHours()) return;

  const notif = new Notification({ title, body, silent: false });
  notif.on('click', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      const main = wins[0];
      main.show();
      main.focus();
      if (navigateTo) {
        main.webContents.send('navigate', navigateTo);
      }
    }
  });
  notif.show();

  sentThisSession.add(id);
  dailyCount++;
}

// ── Checkers ──────────────────────────────────────────────────────────────

function checkDecisionReviews(vaultPath) {
  const prefs = getPrefs();
  if (!prefs.categories.decisions) return;

  const decisionsDir = path.join(vaultPath, '03-Decisions');
  const files = safeReadDir(decisionsDir);
  const today = new Date().toISOString().slice(0, 10);

  for (const file of files) {
    const content = safeReadFile(path.join(decisionsDir, file));
    const fm = parseFrontmatter(content);
    if (!fm.review_dates) continue;

    const dates = Array.isArray(fm.review_dates) ? fm.review_dates : [fm.review_dates];
    for (const d of dates) {
      const dateStr = String(d).trim();
      if (dateStr <= today) {
        const topic = fm.topic || file.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
        sendNotification(
          `decision-review-${file}-${dateStr}`,
          'Decision review due',
          `"${topic}" — time to check if your prediction held up.`,
          'decisions'
        );
        break; // One notification per decision file
      }
    }
  }
}

function checkStaleCommitments(vaultPath) {
  const prefs = getPrefs();
  if (!prefs.categories.tasks) return;

  const tasksFile = path.join(vaultPath, '03-Tasks', 'Tasks.md');
  if (!fs.existsSync(tasksFile)) return;

  const content = safeReadFile(tasksFile);
  const lines = content.split('\n');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

  let staleCount = 0;
  let firstStale = '';
  for (const line of lines) {
    // Match uncompleted tasks with dates: - [ ] Task text ^task-20260101-001
    const match = line.match(/^- \[ \]\s+(.+?)\s*\^task-(\d{4})(\d{2})(\d{2})/);
    if (match) {
      const taskDate = `${match[2]}-${match[3]}-${match[4]}`;
      if (taskDate < cutoff) {
        staleCount++;
        if (!firstStale) firstStale = match[1].slice(0, 60);
      }
    }
  }

  if (staleCount > 0) {
    sendNotification(
      `stale-tasks-${new Date().toDateString()}`,
      `${staleCount} stale task${staleCount > 1 ? 's' : ''}`,
      `"${firstStale}"${staleCount > 1 ? ` and ${staleCount - 1} more` : ''} — still relevant?`,
      'chat'
    );
  }
}

function checkCareerNudge(vaultPath) {
  const prefs = getPrefs();
  if (!prefs.categories.career) return;

  const now = new Date();
  // Only Friday afternoon (after 3pm)
  if (now.getDay() !== 5 || now.getHours() < 15) return;

  const winsDir = path.join(vaultPath, '06-Evidence', 'Wins');
  const files = safeReadDir(winsDir);

  // Check if any win this week
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const hasWinThisWeek = files.some(f => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
    return dateMatch && dateMatch[1] >= weekStartStr;
  });

  if (!hasWinThisWeek) {
    sendNotification(
      `career-nudge-${now.toDateString()}`,
      'End of week',
      'Any wins worth capturing? Tell Vennie what you shipped this week.',
      'career'
    );
  }
}

function checkRadarStaleness(vaultPath) {
  const prefs = getPrefs();
  if (!prefs.categories.radar) return;

  const radarFile = path.join(vaultPath, '08-Resources', 'competitive-radar.json');
  if (!fs.existsSync(radarFile)) return;

  try {
    const radar = JSON.parse(fs.readFileSync(radarFile, 'utf8'));
    const competitors = radar.competitors || [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

    for (const comp of competitors) {
      if (!comp.lastChecked || comp.lastChecked < cutoff) {
        sendNotification(
          `radar-stale-${comp.name}-${new Date().toDateString()}`,
          'Competitive radar',
          `${comp.name} hasn't been scanned in ${comp.lastChecked ? Math.ceil((Date.now() - new Date(comp.lastChecked)) / 86400000) + ' days' : 'ever'}.`,
          'radar'
        );
        break; // One radar notification per check
      }
    }
  } catch {}
}

// ── Main ──────────────────────────────────────────────────────────────────

function checkAll(vaultPath) {
  if (!vaultPath) return;
  try {
    checkDecisionReviews(vaultPath);
    checkStaleCommitments(vaultPath);
    checkCareerNudge(vaultPath);
    checkRadarStaleness(vaultPath);
  } catch (err) {
    console.error('[vennie:notifications] Check error:', err.message);
  }
}

function setupNotifications(vaultPath) {
  if (!vaultPath) return { stop: () => {} };

  // Initial check after 5 seconds
  const timeout = setTimeout(() => checkAll(vaultPath), 5000);

  // Then every 15 minutes
  const interval = setInterval(() => checkAll(vaultPath), 15 * 60 * 1000);

  return {
    stop: () => {
      clearTimeout(timeout);
      clearInterval(interval);
    },
  };
}

module.exports = { setupNotifications };
