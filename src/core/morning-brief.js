'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// -- Morning Brief ------------------------------------------------------------
// Zero-prompt value on startup: scans the vault and produces a structured
// morning brief covering priorities, meetings, decisions, tasks, and
// overnight changes. Everything is local file scanning, no API calls.

// -- Helpers ------------------------------------------------------------------

/**
 * Read a file and return its contents, or '' if it doesn't exist.
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * List .md files in a directory. Returns [] if dir doesn't exist.
 */
function listMdFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f, full: path.join(dir, f) }));
  } catch {
    return [];
  }
}

/**
 * Get today's date as YYYY-MM-DD.
 */
function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Check if a file was modified within the last N days.
 */
function modifiedWithinDays(filePath, days) {
  try {
    const stat = fs.statSync(filePath);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return stat.mtimeMs >= cutoff;
  } catch {
    return false;
  }
}

/**
 * Recursively find .md files modified within the last N days.
 */
function recentMdFiles(dir, days) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md') && modifiedWithinDays(full, days)) {
      results.push(full);
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...recentMdFiles(full, days));
    }
  }
  return results;
}

// -- Section Generators -------------------------------------------------------

/**
 * Priority Focus: reads week priorities and tasks, identifies top priority.
 */
function buildPriorityFocus(vaultPath) {
  const weekFile = path.join(vaultPath, '02-Week_Priorities', 'Week_Priorities.md');
  const tasksFile = path.join(vaultPath, '03-Tasks', 'Tasks.md');

  const weekContent = readFileSafe(weekFile);
  const tasksContent = readFileSafe(tasksFile);

  const lines = [];
  let topPriority = '';

  // Extract current week priorities (non-empty, non-heading lines after first heading)
  if (weekContent) {
    const weekLines = weekContent.split('\n');
    const priorities = [];
    let inSection = false;
    for (const line of weekLines) {
      if (line.match(/^#{1,3}\s/)) {
        // Start collecting after the first heading, stop at next major section
        if (inSection && line.match(/^#{1,2}\s/)) break;
        inSection = true;
        continue;
      }
      if (inSection) {
        const trimmed = line.trim();
        if (trimmed && (trimmed.startsWith('- ') || trimmed.startsWith('* '))) {
          priorities.push(trimmed);
        }
      }
    }
    if (priorities.length > 0) {
      lines.push('Week priorities:');
      for (const p of priorities.slice(0, 5)) {
        lines.push('  ' + p);
      }
      // First priority is the default top priority
      topPriority = priorities[0].replace(/^[-*]\s*(\[.\]\s*)?/, '').trim();
    }
  }

  // Look for overdue or urgent tasks
  if (tasksContent) {
    const taskLines = tasksContent.split('\n');
    const overdue = [];
    const urgent = [];
    const todayStr = today();
    for (const line of taskLines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- [ ]')) continue;
      const isUrgent = /urgent|blocked|asap|critical/i.test(trimmed);
      // Check for date references that are before today
      const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
      const isOverdue = dateMatch && dateMatch[1] < todayStr;
      if (isOverdue) overdue.push(trimmed);
      else if (isUrgent) urgent.push(trimmed);
    }
    if (overdue.length > 0) {
      lines.push('');
      lines.push(`Overdue tasks (${overdue.length}):`);
      for (const t of overdue.slice(0, 3)) {
        lines.push('  ' + t);
      }
      // Overdue tasks take priority
      topPriority = overdue[0].replace(/^-\s*\[.\]\s*/, '').replace(/\^task-\S+/g, '').trim();
    }
    if (urgent.length > 0) {
      lines.push('');
      lines.push(`Urgent tasks (${urgent.length}):`);
      for (const t of urgent.slice(0, 3)) {
        lines.push('  ' + t);
      }
      if (!topPriority || overdue.length === 0) {
        topPriority = urgent[0].replace(/^-\s*\[.\]\s*/, '').replace(/\^task-\S+/g, '').trim();
      }
    }
  }

  if (!topPriority) {
    topPriority = 'No clear top priority found -- check your week priorities';
  }

  return {
    section: {
      title: 'Priority Focus',
      content: lines.length > 0 ? lines.join('\n') : 'No week priorities or tasks found.',
    },
    topPriority,
  };
}

/**
 * Today's Meetings: scans Inbox/Meetings for files matching today's date.
 */
function buildTodaysMeetings(vaultPath) {
  const meetingsDir = path.join(vaultPath, '00-Inbox', 'Meetings');
  const todayStr = today();
  const files = listMdFiles(meetingsDir);
  const todayFiles = files.filter(f => f.name.includes(todayStr));

  const lines = [];
  for (const f of todayFiles) {
    const title = f.name
      .replace(/\.md$/, '')
      .replace(todayStr, '')
      .replace(/^\s*-\s*/, '')
      .trim();
    lines.push('- ' + (title || f.name));
  }

  // Also check for meeting prep files
  const prepDir = path.join(vaultPath, '00-Inbox', 'Meeting_Prep');
  const prepFiles = listMdFiles(prepDir).filter(f => f.name.includes(todayStr));
  for (const f of prepFiles) {
    const title = f.name.replace(/\.md$/, '').replace(todayStr, '').replace(/^\s*-\s*/, '').trim();
    lines.push('- [prep] ' + (title || f.name));
  }

  const count = todayFiles.length + prepFiles.length;
  const content = count > 0
    ? `${count} meeting${count === 1 ? '' : 's'} today:\n${lines.join('\n')}`
    : 'No meetings found for today.';

  return { title: "Today's Meetings", content };
}

/**
 * Open Decisions: scans Inbox/Decisions and greps recent files for decision keywords.
 */
function buildOpenDecisions(vaultPath) {
  const decisionsDir = path.join(vaultPath, '00-Inbox', 'Decisions');
  const decisionFiles = listMdFiles(decisionsDir);
  const lines = [];

  for (const f of decisionFiles.slice(0, 5)) {
    const title = f.name.replace(/\.md$/, '').trim();
    lines.push('- ' + title);
  }

  // Scan recent files for "decision" or "decide" keywords
  const recentFiles = recentMdFiles(path.join(vaultPath, '00-Inbox'), 7);
  const keywordMatches = [];
  for (const filePath of recentFiles) {
    const content = readFileSafe(filePath);
    const fileLines = content.split('\n');
    for (const line of fileLines) {
      if (/\b(decision|decide|need to decide|open question)\b/i.test(line)) {
        const trimmed = line.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
          keywordMatches.push(trimmed);
        }
      }
    }
  }

  if (keywordMatches.length > 0 && decisionFiles.length > 0) {
    lines.push('');
    lines.push('Also mentioned in recent files:');
  }
  for (const m of keywordMatches.slice(0, 3)) {
    lines.push('  - ' + m);
  }

  const total = decisionFiles.length + Math.min(keywordMatches.length, 3);
  const content = total > 0
    ? lines.join('\n')
    : 'No open decisions found.';

  return { title: 'Open Decisions', content };
}

/**
 * Pending Actions: extracts top incomplete tasks from Tasks.md.
 */
function buildPendingActions(vaultPath) {
  const tasksFile = path.join(vaultPath, '03-Tasks', 'Tasks.md');
  const tasksContent = readFileSafe(tasksFile);

  if (!tasksContent) {
    return { title: 'Pending Actions', content: 'No tasks file found.' };
  }

  const taskLines = tasksContent.split('\n');
  const incomplete = [];
  const todayStr = today();

  for (const line of taskLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- [ ]')) continue;
    const text = trimmed.replace(/^-\s*\[\s*\]\s*/, '').trim();
    if (!text) continue;

    // Score tasks for relevance
    let score = 0;
    if (/\d{4}-\d{2}-\d{2}/.test(text)) score += 2; // has a date
    if (/\[\[/.test(text)) score += 1; // mentions a person (wikilink)
    if (/urgent|blocked|asap|critical/i.test(text)) score += 3; // urgency markers
    // Check for overdue date
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch && dateMatch[1] < todayStr) score += 4; // overdue

    incomplete.push({ text, score, raw: trimmed });
  }

  // Sort by score descending, take top 5
  incomplete.sort((a, b) => b.score - a.score);
  const top = incomplete.slice(0, 5);

  const overdueCount = incomplete.filter(t => {
    const m = t.text.match(/(\d{4}-\d{2}-\d{2})/);
    return m && m[1] < todayStr;
  }).length;

  const lines = [];
  lines.push(`${incomplete.length} open task${incomplete.length === 1 ? '' : 's'}${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}:`);
  for (const t of top) {
    lines.push('- ' + t.text);
  }
  if (incomplete.length > 5) {
    lines.push(`  ... and ${incomplete.length - 5} more`);
  }

  return { title: 'Pending Actions', content: lines.join('\n') };
}

/**
 * Overnight Changes: uses git log to find vault changes since yesterday.
 */
function buildOvernightChanges(vaultPath) {
  // Check if vault is a git repo
  const gitDir = path.join(vaultPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return { title: 'Overnight Changes', content: 'Vault is not a git repository.' };
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const since = yesterday.toISOString().split('T')[0];

    const output = execSync(
      `git -C "${vaultPath}" log --since="${since}" --name-only --pretty=format:"" --diff-filter=ACMR 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    );

    const files = [...new Set(
      output.split('\n')
        .map(l => l.trim())
        .filter(l => l && l.endsWith('.md'))
    )];

    if (files.length === 0) {
      return { title: 'Overnight Changes', content: 'No vault changes since yesterday.' };
    }

    const lines = [`${files.length} file${files.length === 1 ? '' : 's'} changed since yesterday:`];
    for (const f of files.slice(0, 10)) {
      lines.push('- ' + f);
    }
    if (files.length > 10) {
      lines.push(`  ... and ${files.length - 10} more`);
    }

    return { title: 'Overnight Changes', content: lines.join('\n') };
  } catch {
    return { title: 'Overnight Changes', content: 'Could not read git history.' };
  }
}

// -- Formatting ---------------------------------------------------------------

/**
 * Build the full formatted markdown string from sections.
 */
function buildFormattedMarkdown(sections, topPriority) {
  const lines = ['# Morning Brief', ''];
  lines.push(`**Top Priority:** ${topPriority}`);
  lines.push('');
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.content);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Format brief for compact terminal display (no emoji, text markers only).
 */
function formatBriefForDisplay(brief) {
  if (!brief || !brief.sections) return '';

  const width = 52;
  const hr = '-'.repeat(width);
  const lines = [];

  lines.push('+' + '-'.repeat(width - 2) + '+');
  lines.push('|  MORNING BRIEF' + ' '.repeat(width - 18) + '|');
  lines.push('+' + '-'.repeat(width - 2) + '+');

  // Top priority
  lines.push('|' + ' '.repeat(width - 2) + '|');
  const priLine = `  > Top priority: ${brief.topPriority}`;
  wrapLine(priLine, width - 4).forEach(l => {
    lines.push('| ' + l.padEnd(width - 3) + '|');
  });

  // Each section (compact)
  for (const section of brief.sections) {
    lines.push('|' + ' '.repeat(width - 2) + '|');
    lines.push('| ' + `-- ${section.title} --`.padEnd(width - 3) + '|');

    // Show a compact summary of each section
    const contentLines = section.content.split('\n').filter(l => l.trim());
    const display = contentLines.slice(0, 4);
    for (const cl of display) {
      const trimmed = cl.trim();
      wrapLine('  ' + trimmed, width - 4).forEach(l => {
        lines.push('| ' + l.padEnd(width - 3) + '|');
      });
    }
    if (contentLines.length > 4) {
      lines.push('| ' + `  ... ${contentLines.length - 4} more lines`.padEnd(width - 3) + '|');
    }
  }

  lines.push('|' + ' '.repeat(width - 2) + '|');
  lines.push('+' + '-'.repeat(width - 2) + '+');

  return lines.join('\n');
}

/**
 * Wrap a line to fit within maxWidth, returning an array of lines.
 */
function wrapLine(text, maxWidth) {
  if (text.length <= maxWidth) return [text];
  const result = [];
  let remaining = text;
  while (remaining.length > maxWidth) {
    let breakAt = remaining.lastIndexOf(' ', maxWidth);
    if (breakAt <= 0) breakAt = maxWidth;
    result.push(remaining.slice(0, breakAt));
    remaining = '    ' + remaining.slice(breakAt).trimStart();
  }
  if (remaining.trim()) result.push(remaining);
  return result;
}

// -- Gate Check ---------------------------------------------------------------

/**
 * Returns true if a brief should be shown:
 * - Before 2pm local time
 * - Not already shown today (tracked in .vennie/last-brief.json)
 * - Vault has enough content (tasks or meetings exist)
 */
function shouldShowBrief(vaultPath) {
  // Time check: before 2pm
  const hour = new Date().getHours();
  if (hour >= 14) return false;

  // Already-shown check
  const todayStr = today();
  const trackFile = path.join(vaultPath, '.vennie', 'last-brief.json');
  try {
    const data = JSON.parse(fs.readFileSync(trackFile, 'utf8'));
    if (data.lastShown === todayStr) return false;
  } catch {
    // File doesn't exist or is corrupt -- that's fine, show the brief
  }

  // Content check: at least tasks file or some meetings
  const hasTasksFile = fs.existsSync(path.join(vaultPath, '03-Tasks', 'Tasks.md'));
  const meetingsDir = path.join(vaultPath, '00-Inbox', 'Meetings');
  const hasMeetings = fs.existsSync(meetingsDir) && fs.readdirSync(meetingsDir).some(f => f.endsWith('.md'));
  const hasWeekPriorities = fs.existsSync(path.join(vaultPath, '02-Week_Priorities', 'Week_Priorities.md'));

  return hasTasksFile || hasMeetings || hasWeekPriorities;
}

/**
 * Mark the brief as shown today (write tracking file).
 */
function markBriefShown(vaultPath) {
  const vennieDir = path.join(vaultPath, '.vennie');
  try {
    if (!fs.existsSync(vennieDir)) {
      fs.mkdirSync(vennieDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(vennieDir, 'last-brief.json'),
      JSON.stringify({ lastShown: today() }, null, 2),
      'utf8'
    );
  } catch {
    // Non-critical, silently ignore
  }
}

// -- Main Export ---------------------------------------------------------------

/**
 * Generate a complete morning brief by scanning the vault.
 *
 * @param {string} vaultPath - Absolute path to the Dex vault root
 * @returns {{ sections: Array<{title: string, content: string}>, topPriority: string, formatted: string }}
 */
function generateMorningBrief(vaultPath) {
  const priorityResult = buildPriorityFocus(vaultPath);
  const meetings = buildTodaysMeetings(vaultPath);
  const decisions = buildOpenDecisions(vaultPath);
  const actions = buildPendingActions(vaultPath);
  const overnight = buildOvernightChanges(vaultPath);

  const sections = [
    priorityResult.section,
    meetings,
    decisions,
    actions,
    overnight,
  ];

  const topPriority = priorityResult.topPriority;
  const formatted = buildFormattedMarkdown(sections, topPriority);

  // Mark as shown
  markBriefShown(vaultPath);

  return { sections, topPriority, formatted };
}

module.exports = {
  generateMorningBrief,
  formatBriefForDisplay,
  shouldShowBrief,
};
