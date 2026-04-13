'use strict';

const fs = require('fs');
const path = require('path');

// ── Ambient Insights ─────────────────────────────────────────────────────
// Lightweight, occasional insight generation based on vault data.
// Surfaces one pithy observation per session (~30% of the time).
// No API calls — all local file scanning.

// ── Constants ────────────────────────────────────────────────────────────

const INSIGHTS_FILE = '.vennie/insights-shown.json';
const REPEAT_COOLDOWN_DAYS = 14;
const SHOW_PROBABILITY = 0.3;
const MIN_DATA_POINTS = 5;

// ── File Helpers ─────────────────────────────────────────────────────────

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function walkMd(dir) {
  const results = [];
  function walk(d) {
    for (const entry of safeReaddir(d)) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function extractDateFromFilename(filename) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ── Shown Insights Tracker ───────────────────────────────────────────────

function loadShownInsights(vaultPath) {
  const filePath = path.join(vaultPath, INSIGHTS_FILE);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { shown: [] };
  }
}

function saveShownInsight(vaultPath, insightKey) {
  const filePath = path.join(vaultPath, INSIGHTS_FILE);
  const data = loadShownInsights(vaultPath);

  // Prune entries older than the cooldown
  const cutoff = daysAgo(REPEAT_COOLDOWN_DAYS);
  data.shown = data.shown.filter(entry => entry.date >= cutoff);

  data.shown.push({ key: insightKey, date: today() });

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function wasRecentlyShown(vaultPath, insightKey) {
  const data = loadShownInsights(vaultPath);
  const cutoff = daysAgo(REPEAT_COOLDOWN_DAYS);
  return data.shown.some(entry => entry.key === insightKey && entry.date >= cutoff);
}

// ── Data Collection Helpers ──────────────────────────────────────────────

/**
 * Count decisions by type (gut vs framework) from 03-Decisions/ and 00-Inbox/Decisions/.
 * Returns { total, gut, framework } or null if insufficient data.
 */
function countDecisionsByType(vaultPath) {
  const dirs = [
    path.join(vaultPath, '03-Decisions'),
    path.join(vaultPath, '00-Inbox', 'Decisions'),
  ];

  let total = 0;
  let framework = 0;
  let gut = 0;

  const frameworkKeywords = ['framework', 'matrix', 'criteria', 'weighted', 'scored', 'pros and cons', 'trade-off analysis', 'cost-benefit', 'decision matrix', 'evaluation'];
  const gutKeywords = ['gut', 'instinct', 'feels right', 'just going with', 'obvious choice', 'no-brainer', 'quick call', 'ship it', 'just do it'];

  for (const dir of dirs) {
    for (const filePath of walkMd(dir)) {
      const content = safeRead(filePath).toLowerCase();
      if (!content) continue;
      total++;

      const hasFramework = frameworkKeywords.some(kw => content.includes(kw));
      const hasGut = gutKeywords.some(kw => content.includes(kw));

      if (hasFramework) framework++;
      else if (hasGut) gut++;
      else gut++; // default to gut if no framework language found
    }
  }

  // Also scan vault-wide for inline decision patterns
  const inlineRe = /\*\*Decision:\*\*/gi;
  const vaultDirs = safeReaddir(vaultPath)
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'System')
    .map(e => path.join(vaultPath, e.name));

  for (const dir of vaultDirs) {
    for (const filePath of walkMd(dir)) {
      const content = safeRead(filePath);
      const matches = content.match(inlineRe);
      if (matches) total += matches.length;
    }
  }

  if (total < MIN_DATA_POINTS) return null;
  return { total, gut, framework };
}

/**
 * Count meetings from 00-Inbox/Meetings/ within the last N days.
 * Returns { thisWeek, lastWeek } or null if insufficient data.
 */
function getMeetingLoad(vaultPath, days) {
  const meetingsDir = path.join(vaultPath, '00-Inbox', 'Meetings');
  const files = safeReaddir(meetingsDir).filter(e => e.isFile() && e.name.endsWith('.md'));

  if (files.length < MIN_DATA_POINTS) return null;

  const now = new Date();
  const thisWeekStart = daysAgo(7);
  const lastWeekStart = daysAgo(14);

  let thisWeek = 0;
  let lastWeek = 0;

  for (const file of files) {
    const date = extractDateFromFilename(file.name);
    if (!date) continue;
    if (date >= thisWeekStart) thisWeek++;
    else if (date >= lastWeekStart) lastWeek++;
  }

  if (thisWeek + lastWeek < MIN_DATA_POINTS) return null;
  return { thisWeek, lastWeek };
}

/**
 * Scan 03-Tasks/Tasks.md for completion rates.
 * Returns { completed, pending, total, slippedPillars } or null.
 */
function getTaskCompletionRate(vaultPath, days) {
  const tasksFile = path.join(vaultPath, '03-Tasks', 'Tasks.md');
  const content = safeRead(tasksFile);
  if (!content) return null;

  const lines = content.split('\n');
  let completed = 0;
  let pending = 0;
  const slippedByPillar = {};
  let currentPillar = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Track current pillar/section
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      currentPillar = headingMatch[1].trim();
      continue;
    }

    if (trimmed.startsWith('- [x]') || trimmed.includes('✅')) {
      completed++;
    } else if (trimmed.startsWith('- [ ]')) {
      pending++;
      // Track slipped tasks by pillar
      if (currentPillar) {
        slippedByPillar[currentPillar] = (slippedByPillar[currentPillar] || 0) + 1;
      }
    }
  }

  const total = completed + pending;
  if (total < MIN_DATA_POINTS) return null;

  // Find the pillar with the most slipped tasks
  let topSlippedPillar = null;
  let topSlippedCount = 0;
  for (const [pillar, count] of Object.entries(slippedByPillar)) {
    if (count > topSlippedCount) {
      topSlippedCount = count;
      topSlippedPillar = pillar;
    }
  }

  return { completed, pending, total, topSlippedPillar, topSlippedCount };
}

/**
 * Count meeting references per person from 05-Areas/People/.
 * Returns { totalPeople, topPeople, neglected } or null.
 */
function getPersonInteractionFrequency(vaultPath) {
  const peopleDir = path.join(vaultPath, '05-Areas', 'People');
  const personFiles = walkMd(peopleDir);

  if (personFiles.length < MIN_DATA_POINTS) return null;

  const interactions = [];
  const thirtyDaysAgo = daysAgo(30);

  for (const filePath of personFiles) {
    const content = safeRead(filePath);
    if (!content) continue;

    const name = path.basename(filePath, '.md').replace(/_/g, ' ');

    // Count meeting references (lines containing dates in YYYY-MM-DD format)
    const meetingRefs = content.match(/\d{4}-\d{2}-\d{2}/g) || [];
    const recentRefs = meetingRefs.filter(d => d >= thirtyDaysAgo).length;

    // Find last interaction date
    const allDates = meetingRefs.sort().reverse();
    const lastInteraction = allDates[0] || null;

    interactions.push({
      name,
      totalRefs: meetingRefs.length,
      recentRefs,
      lastInteraction,
    });
  }

  if (interactions.length < MIN_DATA_POINTS) return null;

  // Sort by recent interactions
  interactions.sort((a, b) => b.recentRefs - a.recentRefs);

  const totalPeople = interactions.length;
  const topPeople = interactions.slice(0, 4).map(p => p.name);
  const topPeopleCount = interactions.slice(0, 4).reduce((sum, p) => sum + p.recentRefs, 0);
  const totalRecentRefs = interactions.reduce((sum, p) => sum + p.recentRefs, 0);

  // Find neglected contacts — people with history but no recent interaction
  const neglected = interactions
    .filter(p => p.totalRefs >= 3 && p.recentRefs === 0 && p.lastInteraction)
    .sort((a, b) => (a.lastInteraction || '').localeCompare(b.lastInteraction || ''))
    .slice(0, 3)
    .map(p => p.name);

  const topPeoplePercent = totalRecentRefs > 0
    ? Math.round((topPeopleCount / totalRecentRefs) * 100)
    : 0;

  return { totalPeople, topPeople, topPeoplePercent, neglected };
}

/**
 * Count evidence/shipment items from 05-Areas/Career/Evidence/ within the last N days.
 * Returns { thisMonth, lastMonth } or null.
 */
function getShipmentCount(vaultPath, days) {
  const evidenceDir = path.join(vaultPath, '05-Areas', 'Career', 'Evidence');
  if (!fs.existsSync(evidenceDir)) return null;

  const files = safeReaddir(evidenceDir).filter(e => e.isFile() && e.name.endsWith('.md'));
  if (files.length === 0) return null;

  let thisMonth = 0;
  let lastMonth = 0;
  const thisMonthStr = today().slice(0, 7);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);

  for (const file of files) {
    const content = safeRead(path.join(evidenceDir, file.name));
    // Count ### Shipped: entries
    const shipMatches = content.match(/^### Shipped:/gm);
    if (!shipMatches) continue;

    // Check each entry's date
    const entryDates = content.match(/### .+?\((\d{4}-\d{2}-\d{2})\)/g) || [];
    for (const entry of entryDates) {
      const dateMatch = entry.match(/(\d{4}-\d{2})/);
      if (!dateMatch) continue;
      if (dateMatch[1] === thisMonthStr) thisMonth++;
      else if (dateMatch[1] === lastMonthStr) lastMonth++;
    }
  }

  if (thisMonth + lastMonth === 0) return null;
  return { thisMonth, lastMonth };
}

// ── Insight Generators ───────────────────────────────────────────────────
// Each returns { key: string, text: string } or null.

function insightDecisionPatterns(vaultPath) {
  const data = countDecisionsByType(vaultPath);
  if (!data) return null;

  const { total, gut, framework } = data;
  if (total < MIN_DATA_POINTS) return null;

  const key = `decisions-${today().slice(0, 7)}`;
  if (framework > gut) {
    return {
      key,
      text: `I noticed ${total} decisions this month. ${framework} used frameworks, ${gut} were gut calls. Your structured approach is paying off.`,
    };
  }
  return {
    key,
    text: `I noticed ${total} decisions this month. ${gut} were gut calls, ${framework} used frameworks. The framework-backed ones tend to have better documented outcomes.`,
  };
}

function insightMeetingLoad(vaultPath) {
  const data = getMeetingLoad(vaultPath, 14);
  if (!data) return null;

  const { thisWeek, lastWeek } = data;
  const diff = thisWeek - lastWeek;
  const key = `meetings-${today().slice(0, 7)}-w`;

  if (diff > 3) {
    return {
      key,
      text: `I noticed ${thisWeek} meetings this week — that's ${diff} more than last week. Are all of them necessary?`,
    };
  }
  if (diff < -3) {
    return {
      key,
      text: `I noticed ${thisWeek} meetings this week, down from ${lastWeek} last week. More maker time — nice.`,
    };
  }
  return null;
}

function insightPeopleNetwork(vaultPath) {
  const data = getPersonInteractionFrequency(vaultPath);
  if (!data) return null;

  const { totalPeople, topPeoplePercent, neglected } = data;
  const key = `network-${today().slice(0, 7)}`;

  if (neglected.length > 0) {
    return {
      key,
      text: `I noticed you've interacted with ${totalPeople} people this month. ${topPeoplePercent}% of meetings are with your top 4. When did you last talk to ${neglected[0]}?`,
    };
  }
  if (topPeoplePercent >= 70) {
    return {
      key,
      text: `I noticed ${topPeoplePercent}% of your recent interactions are with just 4 people. Might be worth broadening the circle.`,
    };
  }
  return null;
}

function insightTaskCompletion(vaultPath) {
  const data = getTaskCompletionRate(vaultPath, 7);
  if (!data) return null;

  const { completed, total, topSlippedPillar, topSlippedCount } = data;
  const key = `tasks-${today().slice(0, 7)}`;

  const slipped = total - completed;
  if (slipped > 0 && topSlippedPillar && topSlippedCount >= 3) {
    return {
      key,
      text: `I noticed you completed ${completed} of ${total} tasks. The ${slipped} that slipped were mostly in ${topSlippedPillar}. Pattern worth noticing.`,
    };
  }
  if (completed >= total * 0.9 && total >= MIN_DATA_POINTS) {
    return {
      key,
      text: `I noticed ${completed} of ${total} tasks done. That's a ${Math.round((completed / total) * 100)}% completion rate — strong execution.`,
    };
  }
  return null;
}

function insightCareerMomentum(vaultPath) {
  const data = getShipmentCount(vaultPath, 60);
  if (!data) return null;

  const { thisMonth, lastMonth } = data;
  const key = `career-${today().slice(0, 7)}`;

  if (thisMonth > lastMonth && lastMonth > 0) {
    return {
      key,
      text: `I noticed you've shipped ${thisMonth} thing${thisMonth === 1 ? '' : 's'} this month — up from ${lastMonth} last month. Worth capturing for your next review.`,
    };
  }
  if (thisMonth > 0 && lastMonth === 0) {
    return {
      key,
      text: `I noticed ${thisMonth} shipment${thisMonth === 1 ? '' : 's'} this month after a quiet last month. Momentum is building.`,
    };
  }
  return null;
}

function insightTimeAllocation(vaultPath) {
  // Look at tasks to determine reactive vs proactive
  const tasksFile = path.join(vaultPath, '03-Tasks', 'Tasks.md');
  const content = safeRead(tasksFile);
  if (!content) return null;

  const lines = content.split('\n');
  let reactive = 0;
  let proactive = 0;

  const reactiveKeywords = ['follow up', 'follow-up', 'from meeting', 'asked to', 'action item', 'requested', 'respond to', 'reply to'];
  const proactiveKeywords = ['plan', 'strategy', 'initiative', 'build', 'design', 'create', 'research', 'explore', 'improve', 'optimize'];

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (!trimmed.startsWith('- [ ]')) continue;

    if (reactiveKeywords.some(kw => trimmed.includes(kw))) reactive++;
    else if (proactiveKeywords.some(kw => trimmed.includes(kw))) proactive++;
  }

  const total = reactive + proactive;
  if (total < MIN_DATA_POINTS) return null;

  const reactivePct = Math.round((reactive / total) * 100);
  const key = `allocation-${today().slice(0, 7)}`;

  if (reactivePct >= 60) {
    return {
      key,
      text: `I noticed ${reactivePct}% of your open tasks are reactive (from meetings/requests). Only ${100 - reactivePct}% are proactive. Is that the balance you want?`,
    };
  }
  if (reactivePct <= 30) {
    return {
      key,
      text: `I noticed ${100 - reactivePct}% of your open tasks are self-initiated. Good proactive balance.`,
    };
  }
  return null;
}

function insightDecisionSpeed(vaultPath) {
  // Approximate by looking at decisions dir for time between creation and completion markers
  const decisionsDir = path.join(vaultPath, '03-Decisions');
  const files = walkMd(decisionsDir);

  if (files.length < MIN_DATA_POINTS) return null;

  const durations = [];
  const categoryDurations = {};

  for (const filePath of files) {
    const content = safeRead(filePath);
    if (!content) continue;

    // Look for created/resolved date pairs
    const createdMatch = content.match(/(?:created|raised|opened|date):\s*(\d{4}-\d{2}-\d{2})/i);
    const resolvedMatch = content.match(/(?:resolved|decided|closed|completed):\s*(\d{4}-\d{2}-\d{2})/i);

    if (createdMatch && resolvedMatch) {
      const created = new Date(createdMatch[1] + 'T00:00:00');
      const resolved = new Date(resolvedMatch[1] + 'T00:00:00');
      const days = Math.round((resolved - created) / (1000 * 60 * 60 * 24));
      if (days >= 0 && days < 365) {
        durations.push(days);

        // Categorize
        const lower = content.toLowerCase();
        if (lower.includes('competitor') || lower.includes('market')) {
          if (!categoryDurations['competitor']) categoryDurations['competitor'] = [];
          categoryDurations['competitor'].push(days);
        }
      }
    }
  }

  if (durations.length < MIN_DATA_POINTS) return null;

  const avgDays = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const key = `speed-${today().slice(0, 7)}`;

  if (categoryDurations['competitor'] && categoryDurations['competitor'].length >= 3) {
    const competitorAvg = Math.round(
      categoryDurations['competitor'].reduce((a, b) => a + b, 0) / categoryDurations['competitor'].length
    );
    if (competitorAvg > avgDays * 1.5) {
      return {
        key,
        text: `I noticed your average decision-to-action time is ${avgDays} days. For competitor-related decisions, it's ${competitorAvg} days. Might be worth examining.`,
      };
    }
  }

  if (avgDays <= 2) {
    return {
      key,
      text: `I noticed your average decision-to-action time is ${avgDays} day${avgDays === 1 ? '' : 's'}. Fast mover.`,
    };
  }
  return null;
}

// ── Main Entry Point ─────────────────────────────────────────────────────

/**
 * Occasionally generate a small, data-driven insight about the user's work patterns.
 *
 * @param {string} vaultPath - Absolute path to the vault root
 * @param {object} [conversationContext] - Optional context about the current session
 * @returns {{ text: string, key: string } | null} An insight, or null if nothing to show
 */
function generateInsight(vaultPath, conversationContext) {
  // 30% probability gate — don't overwhelm
  if (Math.random() > SHOW_PROBABILITY) return null;

  // Collect all possible insights
  const generators = [
    insightMeetingLoad,
    insightTaskCompletion,
    insightPeopleNetwork,
    insightCareerMomentum,
    insightTimeAllocation,
    insightDecisionPatterns,
    insightDecisionSpeed,
  ];

  // Shuffle to vary what gets shown
  for (let i = generators.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [generators[i], generators[j]] = [generators[j], generators[i]];
  }

  // Try each generator until one produces an insight not recently shown
  for (const gen of generators) {
    try {
      const insight = gen(vaultPath);
      if (!insight) continue;
      if (wasRecentlyShown(vaultPath, insight.key)) continue;

      // Record it and return
      saveShownInsight(vaultPath, insight.key);
      return insight;
    } catch {
      // Skip failed generators silently
      continue;
    }
  }

  return null;
}

// ── Module Exports ───────────────────────────────────────────────────────

module.exports = {
  generateInsight,
  // Data helpers exported for testing and reuse
  countDecisionsByType,
  getMeetingLoad,
  getTaskCompletionRate,
  getPersonInteractionFrequency,
  getShipmentCount,
};
