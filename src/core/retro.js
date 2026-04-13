'use strict';

const fs = require('fs');
const path = require('path');

// ── Deep Retrospective Data Gathering ─────────────────────────────────────
// Pre-processes vault data for the /retro skill. Scans meetings, tasks,
// people, and decisions within a given time range and returns structured
// data that the agent can reason over without needing dozens of tool calls.

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read a file safely, returning empty string on failure.
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
 * Extract a date from a filename. Handles common patterns:
 *   YYYY-MM-DD - Topic.md
 *   YYYY-MM-DD-topic.md
 *   YYYY-MM-DD_topic.md
 *   YYYYMMDD-topic.md
 * Returns a Date object or null.
 */
function extractDateFromFilename(filename) {
  // YYYY-MM-DD pattern
  const isoMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const d = new Date(isoMatch[1] + 'T12:00:00');
    if (!isNaN(d.getTime())) return d;
  }

  // YYYYMMDD pattern
  const compactMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    const d = new Date(`${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Check if a date falls within the retro period.
 */
function isInPeriod(date, start, end) {
  if (!date) return false;
  return date >= start && date <= end;
}

/**
 * Extract the topic/title from a meeting note filename.
 * "2026-04-10 - Quarterly Planning.md" => "Quarterly Planning"
 */
function extractTopicFromFilename(filename) {
  // Remove .md extension
  let name = filename.replace(/\.md$/, '');
  // Remove date prefix
  name = name.replace(/^\d{4}-?\d{2}-?\d{2}\s*[-_]?\s*/, '');
  return name.trim() || filename;
}

/**
 * Extract people names from text content. Looks for:
 * - WikiLinks: [[Firstname_Lastname|Display]]  or [[Firstname_Lastname]]
 * - Frontmatter attendees/participants fields
 * - @mentions
 */
function extractPeopleFromContent(content) {
  const people = new Set();

  // WikiLinks: [[First_Last|Name]] or [[First_Last]]
  const wikiMatches = content.matchAll(/\[\[([A-Z][a-z]+_[A-Z][a-z]+)(?:\|([^\]]+))?\]\]/g);
  for (const m of wikiMatches) {
    people.add(m[2] || m[1].replace(/_/g, ' '));
  }

  // Frontmatter: attendees: or participants: (simple list)
  const attendeeMatch = content.match(/(?:attendees|participants)\s*:\s*\[?([^\]\n]+)/i);
  if (attendeeMatch) {
    const names = attendeeMatch[1].split(',').map(n => n.trim().replace(/^["']|["']$/g, ''));
    for (const n of names) {
      if (n && n.length > 1) people.add(n);
    }
  }

  return [...people];
}

/**
 * Extract action items / commitments from text. Looks for:
 * - [ ] or - [ ] patterns (open tasks)
 * - [x] or - [x] patterns (completed tasks)
 * - Lines starting with "Action:" or "TODO:" or "Follow-up:"
 */
function extractActionItems(content) {
  const items = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Checkbox items
    const checkMatch = trimmed.match(/^[-*]\s*\[([ xX])\]\s+(.+)/);
    if (checkMatch) {
      items.push({
        text: checkMatch[2].trim(),
        completed: checkMatch[1] !== ' ',
      });
      continue;
    }

    // Action/TODO/Follow-up prefixed lines
    const actionMatch = trimmed.match(/^(?:Action|TODO|Follow-up|Follow up)\s*:\s*(.+)/i);
    if (actionMatch) {
      items.push({
        text: actionMatch[1].trim(),
        completed: false,
      });
    }
  }

  return items;
}

/**
 * Parse the days argument from the user command.
 * "week" => 7, "month" => 30, "quarter" => 90, number => that number
 */
function parsePeriodDays(arg) {
  if (!arg) return 7;
  const lower = arg.toLowerCase().trim();
  if (lower === 'week') return 7;
  if (lower === 'month') return 30;
  if (lower === 'quarter' || lower === 'q') return 90;
  const num = parseInt(lower, 10);
  if (!isNaN(num) && num > 0 && num <= 365) return num;
  return 7;
}

/**
 * Get the period label for display.
 */
function getPeriodLabel(days) {
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  if (days <= 90) return 'quarter';
  return `${days} days`;
}

// ── Core Data Gathering ───────────────────────────────────────────────────

/**
 * Gather all retrospective data from the vault within a date range.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {number} days - Number of days to look back
 * @returns {{ meetings: object[], completedTasks: object[], openTasks: object[], people: string[], decisions: object[], period: { start: Date, end: Date, days: number, label: string } }}
 */
function gatherRetroData(vaultPath, days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const period = { start, end, days, label: getPeriodLabel(days) };

  const meetings = gatherMeetings(vaultPath, start, end);
  const { completed: completedTasks, open: openTasks } = gatherTasks(vaultPath, start, end);
  const decisions = gatherDecisions(vaultPath, start, end);
  const people = gatherPeopleFromData(meetings, completedTasks, openTasks);

  return { meetings, completedTasks, openTasks, people, decisions, period };
}

/**
 * Scan meeting notes within the date range.
 */
function gatherMeetings(vaultPath, start, end) {
  const meetingsDir = path.join(vaultPath, '00-Inbox', 'Meetings');
  const files = listMdFiles(meetingsDir);
  const meetings = [];

  for (const file of files) {
    try {
      const fileDate = extractDateFromFilename(file.name);

      // Also check file modification time as fallback
      let inRange = false;
      if (fileDate) {
        inRange = isInPeriod(fileDate, start, end);
      } else {
        try {
          const stat = fs.statSync(file.full);
          inRange = stat.mtimeMs >= start.getTime() && stat.mtimeMs <= end.getTime();
        } catch {
          continue;
        }
      }

      if (!inRange) continue;

      const content = readFileSafe(file.full);
      const topic = extractTopicFromFilename(file.name);
      const people = extractPeopleFromContent(content);
      const actions = extractActionItems(content);

      meetings.push({
        file: file.name,
        date: fileDate ? fileDate.toISOString().slice(0, 10) : 'unknown',
        topic,
        people,
        actions,
        preview: content.slice(0, 500),
      });
    } catch {
      // Skip files that can't be parsed
    }
  }

  return meetings.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * Scan tasks for completed and open items within the date range.
 */
function gatherTasks(vaultPath, start, end) {
  const completed = [];
  const open = [];

  // Check 03-Tasks/ directory
  const tasksDir = path.join(vaultPath, '03-Tasks');
  const taskFiles = listMdFiles(tasksDir);

  // Also check for a single Tasks.md file
  const singleTaskFile = path.join(tasksDir, 'Tasks.md');
  const allFiles = taskFiles.length > 0 ? taskFiles : [];
  if (fs.existsSync(singleTaskFile) && !allFiles.find(f => f.name === 'Tasks.md')) {
    allFiles.push({ name: 'Tasks.md', full: singleTaskFile });
  }

  for (const file of allFiles) {
    try {
      const content = readFileSafe(file.full);
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Completed task: - [x] or checkbox with completion markers
        const completedMatch = trimmed.match(/^[-*]\s*\[[xX]\]\s+(.+)/);
        if (completedMatch) {
          const text = completedMatch[1].trim();
          // Try to extract completion date from the line (e.g., "done 2026-04-10" or timestamp)
          const dateInLine = text.match(/(\d{4}-\d{2}-\d{2})/);
          const taskDate = dateInLine ? new Date(dateInLine[1] + 'T12:00:00') : null;

          // If we can date it, check range. If not, include it (better to over-include).
          if (!taskDate || isInPeriod(taskDate, start, end)) {
            completed.push({
              text: text.replace(/\^task-\d{8}-\d+/g, '').trim(),
              date: taskDate ? taskDate.toISOString().slice(0, 10) : null,
              source: file.name,
            });
          }
          continue;
        }

        // Open task: - [ ]
        const openMatch = trimmed.match(/^[-*]\s*\[ \]\s+(.+)/);
        if (openMatch) {
          const text = openMatch[1].trim();
          open.push({
            text: text.replace(/\^task-\d{8}-\d+/g, '').trim(),
            source: file.name,
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return { completed, open };
}

/**
 * Scan decision logs within the date range.
 */
function gatherDecisions(vaultPath, start, end) {
  const decisionsDir = path.join(vaultPath, '03-Decisions');
  const files = listMdFiles(decisionsDir);
  const decisions = [];

  for (const file of files) {
    try {
      const fileDate = extractDateFromFilename(file.name);

      let inRange = false;
      if (fileDate) {
        inRange = isInPeriod(fileDate, start, end);
      } else {
        try {
          const stat = fs.statSync(file.full);
          inRange = stat.mtimeMs >= start.getTime() && stat.mtimeMs <= end.getTime();
        } catch {
          continue;
        }
      }

      if (!inRange) continue;

      const content = readFileSafe(file.full);
      const topic = extractTopicFromFilename(file.name);

      // Extract status from frontmatter
      const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/i) ||
                          content.match(/status\s*:\s*(\w+)/i);
      const status = statusMatch ? statusMatch[1] : 'unknown';

      // Extract review date
      const reviewMatch = content.match(/\*\*Review Date:\*\*\s*(\d{4}-\d{2}-\d{2})/i) ||
                          content.match(/review.date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
      const reviewDate = reviewMatch ? reviewMatch[1] : null;

      decisions.push({
        file: file.name,
        date: fileDate ? fileDate.toISOString().slice(0, 10) : 'unknown',
        topic,
        status,
        reviewDate,
        preview: content.slice(0, 300),
      });
    } catch {
      // Skip unreadable files
    }
  }

  return decisions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * Collect unique people names mentioned across all gathered data.
 */
function gatherPeopleFromData(meetings, completedTasks, openTasks) {
  const people = new Set();

  for (const m of meetings) {
    for (const p of m.people) {
      people.add(p);
    }
  }

  // People mentioned in tasks (basic extraction)
  const allTasks = [...completedTasks, ...openTasks];
  for (const t of allTasks) {
    const wikiMatches = t.text.matchAll(/\[\[([A-Z][a-z]+_[A-Z][a-z]+)(?:\|([^\]]+))?\]\]/g);
    for (const m of wikiMatches) {
      people.add(m[2] || m[1].replace(/_/g, ' '));
    }
  }

  return [...people].sort();
}

// ── Per-Person Breakdown ──────────────────────────────────────────────────

/**
 * Generate per-person interaction summaries for the review period.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {number} days - Number of days to look back
 * @returns {{ name: string, meetings: number, topics: string[], openActions: object[], lastInteraction: string }[]}
 */
function generatePersonBreakdown(vaultPath, days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const meetings = gatherMeetings(vaultPath, start, end);
  const personMap = new Map();

  // Build person data from meetings
  for (const meeting of meetings) {
    for (const person of meeting.people) {
      if (!personMap.has(person)) {
        personMap.set(person, {
          name: person,
          meetings: 0,
          topics: [],
          openActions: [],
          lastInteraction: null,
        });
      }

      const data = personMap.get(person);
      data.meetings++;
      if (meeting.topic && !data.topics.includes(meeting.topic)) {
        data.topics.push(meeting.topic);
      }
      if (!data.lastInteraction || meeting.date > data.lastInteraction) {
        data.lastInteraction = meeting.date;
      }

      // Collect open action items that mention this person
      for (const action of meeting.actions) {
        if (!action.completed) {
          data.openActions.push({
            text: action.text,
            from: meeting.topic,
            date: meeting.date,
          });
        }
      }
    }
  }

  // Enrich with person page data
  const peopleDirs = [
    path.join(vaultPath, '05-People'),
    path.join(vaultPath, '05-People', 'Internal'),
    path.join(vaultPath, '05-People', 'External'),
  ];

  for (const [name, data] of personMap) {
    const slug = name.replace(/\s+/g, '_');
    for (const dir of peopleDirs) {
      const personFile = path.join(dir, `${slug}.md`);
      if (fs.existsSync(personFile)) {
        try {
          const content = readFileSafe(personFile);
          // Extract open action items from person page
          const actions = extractActionItems(content);
          for (const action of actions) {
            if (!action.completed) {
              const exists = data.openActions.some(a => a.text === action.text);
              if (!exists) {
                data.openActions.push({ text: action.text, from: 'person page', date: null });
              }
            }
          }
        } catch {
          // Skip unreadable person pages
        }
        break;
      }
    }
  }

  return [...personMap.values()].sort((a, b) => b.meetings - a.meetings);
}

// ── Pattern Detection ─────────────────────────────────────────────────────

/**
 * Detect patterns across retrospective data.
 *
 * @param {{ meetings: object[], completedTasks: object[], openTasks: object[], people: string[], decisions: object[], period: object }} retroData
 * @returns {{ recurringTopics: { topic: string, count: number }[], reactiveRatio: number, completionRate: number, busiestDay: string|null, commitmentsMade: number, commitmentsOpen: number }}
 */
function detectPatterns(retroData) {
  const { meetings, completedTasks, openTasks, period } = retroData;

  // ── Recurring topics ────────────────────────────────────────────────────
  // Count word frequency across meeting topics and task descriptions
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'it', 'its', 'not', 'no', 'so', 'up', 'out', 'if', 'about', 'who',
    'what', 'when', 'where', 'which', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'than',
    'too', 'very', 'just', 'also', 'into', 'over', 'after', 'before',
    'between', 'under', 'above', 'then', 'once', 'here', 'there',
    'any', 'our', 'your', 'their', 'my', 'me', 'we', 'they', 'he',
    'she', 'him', 'her', 'his', 'us', 'them', 'i', 'you',
  ]);

  const wordCounts = new Map();

  function countWords(text) {
    if (!text) return;
    const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
    for (const word of words) {
      if (word.length < 3 || stopWords.has(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  for (const m of meetings) {
    countWords(m.topic);
    countWords(m.preview);
  }
  for (const t of completedTasks) {
    countWords(t.text);
  }
  for (const t of openTasks) {
    countWords(t.text);
  }

  const recurringTopics = [...wordCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  // ── Reactive vs proactive ratio ─────────────────────────────────────────
  // Heuristic: tasks with same-day creation and completion dates are reactive.
  // Tasks without dates are considered reactive (ad-hoc).
  let reactiveCount = 0;
  let plannedCount = 0;

  for (const task of completedTasks) {
    if (!task.date) {
      reactiveCount++;
    } else {
      // If we can't determine creation date, use position in file as proxy
      plannedCount++;
    }
  }

  const totalTracked = reactiveCount + plannedCount;
  const reactiveRatio = totalTracked > 0 ? Math.round((reactiveCount / totalTracked) * 100) : 0;

  // ── Completion rate ─────────────────────────────────────────────────────
  const totalCreated = completedTasks.length + openTasks.length;
  const completionRate = totalCreated > 0
    ? Math.round((completedTasks.length / totalCreated) * 100)
    : 0;

  // ── Busiest day ─────────────────────────────────────────────────────────
  const dayCounts = new Map();
  for (const m of meetings) {
    if (m.date && m.date !== 'unknown') {
      const day = new Date(m.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }
  }
  const busiestDay = dayCounts.size > 0
    ? [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // ── Commitment tracking ─────────────────────────────────────────────────
  let commitmentsMade = 0;
  let commitmentsOpen = 0;

  for (const m of meetings) {
    commitmentsMade += m.actions.length;
    commitmentsOpen += m.actions.filter(a => !a.completed).length;
  }

  return {
    recurringTopics,
    reactiveRatio,
    completionRate,
    busiestDay,
    commitmentsMade,
    commitmentsOpen,
  };
}

// ── Format for Prompt ─────────────────────────────────────────────────────

/**
 * Format gathered retro data as a context block for the agent prompt.
 *
 * @param {{ meetings: object[], completedTasks: object[], openTasks: object[], people: string[], decisions: object[], period: object }} retroData
 * @param {object[]} personBreakdown - From generatePersonBreakdown
 * @param {object} patterns - From detectPatterns
 * @returns {string} Formatted context block
 */
function formatRetroContext(retroData, personBreakdown, patterns) {
  const { meetings, completedTasks, openTasks, decisions, period } = retroData;
  const parts = [];

  const startStr = period.start.toISOString().slice(0, 10);
  const endStr = period.end.toISOString().slice(0, 10);

  parts.push(`## Pre-Gathered Retro Data (${startStr} to ${endStr}, ${period.label})\n`);
  parts.push('Use this data as your foundation. You can read individual files for more detail.\n');

  // Meetings
  parts.push(`### Meetings (${meetings.length})\n`);
  if (meetings.length === 0) {
    parts.push('No meeting notes found in this period.\n');
  } else {
    for (const m of meetings) {
      parts.push(`- **${m.date}** — ${m.topic}`);
      if (m.people.length > 0) parts.push(`  People: ${m.people.join(', ')}`);
      if (m.actions.length > 0) {
        const openCount = m.actions.filter(a => !a.completed).length;
        parts.push(`  Actions: ${m.actions.length} total, ${openCount} open`);
      }
    }
    parts.push('');
  }

  // Decisions
  parts.push(`### Decisions (${decisions.length})\n`);
  if (decisions.length === 0) {
    parts.push('No formal decisions logged in this period.\n');
  } else {
    for (const d of decisions) {
      parts.push(`- **${d.date}** — ${d.topic} (status: ${d.status})`);
      if (d.reviewDate) parts.push(`  Review date: ${d.reviewDate}`);
    }
    parts.push('');
  }

  // Tasks
  parts.push(`### Tasks\n`);
  parts.push(`- Completed: ${completedTasks.length}`);
  parts.push(`- Open: ${openTasks.length}`);
  if (completedTasks.length > 0) {
    parts.push('\n**Completed:**');
    for (const t of completedTasks.slice(0, 20)) {
      parts.push(`- ${t.text}${t.date ? ` (${t.date})` : ''}`);
    }
    if (completedTasks.length > 20) {
      parts.push(`- ... and ${completedTasks.length - 20} more`);
    }
  }
  if (openTasks.length > 0) {
    parts.push('\n**Open:**');
    for (const t of openTasks.slice(0, 15)) {
      parts.push(`- ${t.text}`);
    }
    if (openTasks.length > 15) {
      parts.push(`- ... and ${openTasks.length - 15} more`);
    }
  }
  parts.push('');

  // Per-person breakdown
  parts.push(`### People Interactions (${personBreakdown.length})\n`);
  if (personBreakdown.length === 0) {
    parts.push('No person interactions detected in this period.\n');
  } else {
    for (const p of personBreakdown) {
      parts.push(`#### ${p.name}`);
      parts.push(`- Meetings: ${p.meetings}`);
      if (p.topics.length > 0) parts.push(`- Topics: ${p.topics.join(', ')}`);
      if (p.lastInteraction) parts.push(`- Last interaction: ${p.lastInteraction}`);
      if (p.openActions.length > 0) {
        parts.push(`- Open actions (${p.openActions.length}):`);
        for (const a of p.openActions.slice(0, 5)) {
          parts.push(`  - ${a.text}${a.from ? ` (from: ${a.from})` : ''}`);
        }
        if (p.openActions.length > 5) {
          parts.push(`  - ... and ${p.openActions.length - 5} more`);
        }
      }
      parts.push('');
    }
  }

  // Patterns
  parts.push('### Detected Patterns\n');
  if (patterns.recurringTopics.length > 0) {
    parts.push('**Recurring topics:**');
    for (const t of patterns.recurringTopics.slice(0, 7)) {
      parts.push(`- "${t.topic}" — appeared ${t.count} times`);
    }
    parts.push('');
  }
  parts.push(`**Completion rate:** ${patterns.completionRate}% (${completedTasks.length} done / ${completedTasks.length + openTasks.length} total)`);
  if (patterns.busiestDay) {
    parts.push(`**Busiest meeting day:** ${patterns.busiestDay}`);
  }
  if (patterns.commitmentsMade > 0) {
    parts.push(`**Commitments:** ${patterns.commitmentsMade} made, ${patterns.commitmentsOpen} still open`);
  }
  parts.push('');

  return parts.join('\n');
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  gatherRetroData,
  generatePersonBreakdown,
  detectPatterns,
  formatRetroContext,
  parsePeriodDays,
  getPeriodLabel,
};
