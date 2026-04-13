'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Career Intelligence Engine
// ---------------------------------------------------------------------------
// Longitudinal career analytics for product managers. Scans the vault to build
// point-in-time snapshots, compares them over time, and generates actionable
// insights about career growth.
//
// All file I/O is wrapped in try/catch — this module should never crash the app.
// ---------------------------------------------------------------------------

// -- Constants ---------------------------------------------------------------

const SNAPSHOTS_FILE = '.vennie/career-snapshots.jsonl';
const MILESTONES_FILE = '.vennie/onboarding-milestones.json';
const LEARNINGS_FILE = '.vennie/learnings.jsonl';

// Evidence paths — Vennie vault structure
const EVIDENCE_WINS = '06-Evidence/Wins';
const EVIDENCE_LEARNINGS = '06-Evidence/Learnings';
const EVIDENCE_FEEDBACK = '06-Evidence/Feedback';
// Also check legacy Dex-style path
const LEGACY_EVIDENCE = '05-Areas/Career/Evidence';

const PEOPLE_DIRS = ['05-People/Team', '05-People/Stakeholders', '05-People/Network', '05-Areas/People/Internal', '05-Areas/People/External', '05-Areas/People'];
const DECISIONS_DIR = '03-Decisions';
const MEETINGS_DIR = '00-Inbox/Meetings';
const TASKS_FILE = '03-Tasks/Tasks.md';
const PHILOSOPHY_FILE = 'System/pm-philosophy.md';

// Promotion competency frameworks
const LEVEL_COMPETENCIES = {
  senior: {
    execution: ['shipped', 'launched', 'delivered', 'deadline', 'on time', 'completed'],
    'stakeholder-management': ['stakeholder', 'alignment', 'buy-in', 'influenced', 'presented', 'communicated'],
    'data-fluency': ['data', 'metrics', 'a/b', 'experiment', 'measured', 'analytics', 'kpi'],
    mentoring: ['mentor', 'coached', 'onboarded', 'pair', 'taught', 'guided'],
  },
  lead: {
    strategy: ['strategy', 'roadmap', 'vision', 'direction', 'prioriti', 'trade-off'],
    'cross-functional-leadership': ['led', 'coordinated', 'cross-functional', 'aligned teams', 'managed'],
    'team-building': ['team', 'hired', 'culture', 'process', 'ritual', 'retrospective'],
    vision: ['vision', 'north star', 'long-term', 'positioning', 'market'],
  },
  director: {
    'org-design': ['org', 'structure', 'reorgani', 'scaled', 'operating model'],
    'executive-communication': ['executive', 'board', 'leadership', 'cxo', 'presented to'],
    'p&l-thinking': ['revenue', 'cost', 'margin', 'budget', 'p&l', 'business case', 'roi'],
    hiring: ['hired', 'recruiting', 'interview', 'headcount', 'team growth'],
  },
  vp: {
    'board-communication': ['board', 'investor', 'quarterly review', 'shareholder'],
    'market-strategy': ['market', 'competitive', 'positioning', 'moat', 'differentiat'],
    'culture-building': ['culture', 'values', 'mission', 'company-wide', 'transformation'],
    'portfolio-management': ['portfolio', 'multiple products', 'product line', 'platform'],
  },
};

// -- Helpers -----------------------------------------------------------------

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function listDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function listMdFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

function parseJsonlFile(filePath) {
  const content = readFileSafe(filePath);
  if (!content) return [];
  return content.split('\n').filter(l => l.trim()).map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

function titleCase(str) {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// -- Evidence Scanning -------------------------------------------------------

/**
 * Collect all career evidence entries from the vault.
 * Scans 06-Evidence/{Wins,Learnings,Feedback}/ and legacy 05-Areas/Career/Evidence/.
 */
function collectEvidence(vaultPath) {
  const entries = [];

  // Scan Vennie-style evidence dirs
  for (const subdir of [EVIDENCE_WINS, EVIDENCE_LEARNINGS, EVIDENCE_FEEDBACK]) {
    const dir = path.join(vaultPath, subdir);
    const files = listMdFiles(dir);
    for (const file of files) {
      try {
        const content = readFileSafe(path.join(dir, file));
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : '';
        const skills = extractSkillTags(content);
        const type = subdir.includes('Wins') ? 'win' : subdir.includes('Feedback') ? 'feedback' : 'learning';
        entries.push({ file, date, skills, type, content, source: subdir });
      } catch { /* skip */ }
    }
  }

  // Scan legacy evidence (ship-to-story format: YYYY-MM.md)
  const legacyDir = path.join(vaultPath, LEGACY_EVIDENCE);
  const legacyFiles = listMdFiles(legacyDir).filter(f => /^\d{4}-\d{2}\.md$/.test(f));
  for (const file of legacyFiles) {
    try {
      const content = readFileSafe(path.join(legacyDir, file));
      // Parse individual entries within monthly files
      const headerRe = /^### (.+?): (.+?) \((\d{4}-\d{2}-\d{2})\)/gm;
      let match;
      while ((match = headerRe.exec(content)) !== null) {
        const entryType = match[1].toLowerCase();
        const title = match[2];
        const date = match[3];
        // Get the block of text until next ### or end
        const startIdx = match.index;
        const nextHeader = content.indexOf('\n### ', startIdx + 1);
        const block = nextHeader !== -1 ? content.slice(startIdx, nextHeader) : content.slice(startIdx);
        const skills = extractSkillTags(block);
        entries.push({ file, date, skills, type: entryType, title, content: block, source: 'legacy' });
      }
    } catch { /* skip */ }
  }

  return entries;
}

/**
 * Extract # Career: [skill] tags and **Skills demonstrated:** entries from content.
 */
function extractSkillTags(content) {
  const skills = new Set();

  // # Career: Skill Name
  const careerTagRe = /#\s*Career:\s*(.+?)(?:\n|$)/gi;
  let m;
  while ((m = careerTagRe.exec(content)) !== null) {
    skills.add(m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  }

  // **Skills demonstrated:** X, Y, Z
  const demoRe = /\*\*Skills demonstrated:\*\*\s*(.+)/gi;
  while ((m = demoRe.exec(content)) !== null) {
    m[1].split(',').forEach(s => {
      const clean = s.trim().toLowerCase().replace(/\s+/g, '-');
      if (clean) skills.add(clean);
    });
  }

  // Keyword-based inference as fallback
  const lower = content.toLowerCase();
  const SKILL_KEYWORDS = {
    'cross-functional-leadership': ['led', 'coordinated', 'managed'],
    'system-design': ['architected', 'designed', 'migrated', 'api', 'system'],
    'execution': ['shipped', 'launched', 'deadline', 'on time'],
    'data-driven-decisions': ['data', 'metrics', 'a/b', 'experiment'],
    'user-research': ['user research', 'interviews', 'feedback', 'discovery'],
    'product-strategy': ['roadmap', 'strategy', 'vision', 'prioriti'],
    'stakeholder-management': ['stakeholder', 'alignment', 'buy-in', 'executive'],
  };
  for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
    if (skills.size >= 5) break; // Don't over-infer
    for (const kw of keywords) {
      if (lower.includes(kw)) { skills.add(skill); break; }
    }
  }

  return Array.from(skills);
}

// -- People Scanning ---------------------------------------------------------

function collectPeoplePages(vaultPath) {
  const pages = [];
  for (const rel of PEOPLE_DIRS) {
    const dir = path.join(vaultPath, rel);
    const entries = listDir(dir);
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const full = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(full);
          pages.push({
            name: entry.name.replace('.md', '').replace(/_/g, ' '),
            path: full,
            modified: stat.mtime,
            modifiedStr: stat.mtime.toISOString().slice(0, 10),
            category: rel,
          });
        } catch { /* skip */ }
      } else if (entry.isDirectory()) {
        // One level deeper (Internal/External)
        const subFiles = listMdFiles(path.join(dir, entry.name));
        for (const sf of subFiles) {
          const full = path.join(dir, entry.name, sf);
          try {
            const stat = fs.statSync(full);
            pages.push({
              name: sf.replace('.md', '').replace(/_/g, ' '),
              path: full,
              modified: stat.mtime,
              modifiedStr: stat.mtime.toISOString().slice(0, 10),
              category: `${rel}/${entry.name}`,
            });
          } catch { /* skip */ }
        }
      }
    }
  }
  return pages;
}

// -- Decisions Scanning ------------------------------------------------------

function collectDecisions(vaultPath) {
  const dir = path.join(vaultPath, DECISIONS_DIR);
  const files = listMdFiles(dir);
  const decisions = [];

  for (const file of files) {
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    const content = readFileSafe(path.join(dir, file));

    // Try to detect category from content
    let category = 'general';
    const lower = content.toLowerCase();
    if (/product|feature|roadmap|prioriti/i.test(lower)) category = 'product';
    else if (/technical|architecture|system|migration/i.test(lower)) category = 'technical';
    else if (/people|hiring|team|org/i.test(lower)) category = 'people';
    else if (/strategy|market|competitive|positioning/i.test(lower)) category = 'strategy';
    else if (/process|workflow|ritual/i.test(lower)) category = 'process';

    decisions.push({ file, date, category });
  }

  return decisions;
}

// -- Meetings Scanning -------------------------------------------------------

function collectMeetings(vaultPath) {
  const dir = path.join(vaultPath, MEETINGS_DIR);
  const files = listMdFiles(dir);
  return files.map(f => {
    const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
    return { file: f, date: dateMatch ? dateMatch[1] : '' };
  }).filter(m => m.date);
}

// -- Tasks Scanning ----------------------------------------------------------

function collectTasks(vaultPath) {
  const tasksContent = readFileSafe(path.join(vaultPath, TASKS_FILE));
  if (!tasksContent) return { open: [], completed: [] };

  const lines = tasksContent.split('\n');
  const open = [];
  const completed = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [ ]')) {
      const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
      open.push({ text: trimmed, date: dateMatch ? dateMatch[1] : '' });
    } else if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [X]')) {
      const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
      const completeMatch = trimmed.match(/\u2705\s*(\d{4}-\d{2}-\d{2})/);
      completed.push({
        text: trimmed,
        createdDate: dateMatch ? dateMatch[1] : '',
        completedDate: completeMatch ? completeMatch[1] : '',
      });
    }
  }

  return { open, completed };
}

// -- Core: buildCareerSnapshot -----------------------------------------------

/**
 * Build a comprehensive career snapshot from the current vault state.
 *
 * @param {string} vaultPath
 * @param {object} [options] - { periodDays: number } defaults to 30
 * @returns {object} Career snapshot object
 */
function buildCareerSnapshot(vaultPath, options) {
  const opts = options || {};
  const periodDays = opts.periodDays || 30;
  const now = todayStr();
  const periodStart = daysAgo(periodDays);

  // -- Skills from evidence --
  const allEvidence = collectEvidence(vaultPath);
  const periodEvidence = allEvidence.filter(e => e.date >= periodStart);
  const prevPeriodStart = daysAgo(periodDays * 2);
  const prevEvidence = allEvidence.filter(e => e.date >= prevPeriodStart && e.date < periodStart);

  const skillCounts = {};
  for (const e of periodEvidence) {
    for (const s of e.skills) {
      if (!skillCounts[s]) skillCounts[s] = { count: 0, lastSeen: '' };
      skillCounts[s].count++;
      if (!skillCounts[s].lastSeen || e.date > skillCounts[s].lastSeen) {
        skillCounts[s].lastSeen = e.date;
      }
    }
  }

  const prevSkillCounts = {};
  for (const e of prevEvidence) {
    for (const s of e.skills) {
      if (!prevSkillCounts[s]) prevSkillCounts[s] = 0;
      prevSkillCounts[s]++;
    }
  }

  const allSkillNames = new Set([...Object.keys(skillCounts), ...Object.keys(prevSkillCounts)]);
  const demonstrated = [];
  const growing = [];
  const declining = [];

  for (const skill of allSkillNames) {
    const current = skillCounts[skill]?.count || 0;
    const previous = prevSkillCounts[skill] || 0;
    const lastSeen = skillCounts[skill]?.lastSeen || '';
    let trend = 'stable';
    if (current > previous) trend = 'growing';
    else if (current < previous) trend = 'declining';
    else if (current === 0 && previous > 0) trend = 'declining';

    const entry = { skill, count: current, lastSeen, trend };
    demonstrated.push(entry);
    if (trend === 'growing') growing.push(entry);
    if (trend === 'declining') declining.push(entry);
  }

  demonstrated.sort((a, b) => b.count - a.count);

  // -- Decisions --
  const allDecisions = collectDecisions(vaultPath);
  const periodDecisions = allDecisions.filter(d => d.date >= periodStart);
  const weeks = Math.max(1, periodDays / 7);
  const categoryMap = {};
  for (const d of periodDecisions) {
    categoryMap[d.category] = (categoryMap[d.category] || 0) + 1;
  }
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({ category: cat, count }));

  // -- Relationships --
  const people = collectPeoplePages(vaultPath);
  const activeThisMonth = people.filter(p => p.modifiedStr >= periodStart);
  const thirtyDaysAgo = daysAgo(30);
  const sixtyDaysAgo = daysAgo(60);
  const neglected = people.filter(p => {
    // Active in the 30-60 day window but not in last 30 days
    return p.modifiedStr < thirtyDaysAgo && p.modifiedStr >= sixtyDaysAgo;
  });
  const newPeople = people.filter(p => {
    // Rough check: file creation time is hard to get, use modification as proxy
    return p.modifiedStr >= periodStart;
  });

  // -- Shipping --
  const shippedEvidence = periodEvidence.filter(e =>
    e.type === 'win' || e.type === 'shipped' || e.type === 'shipment'
  );
  const tasks = collectTasks(vaultPath);
  const periodCompleted = tasks.completed.filter(t => t.completedDate >= periodStart);

  // Average time to ship (for tasks with both dates)
  const shipTimes = periodCompleted
    .filter(t => t.createdDate && t.completedDate)
    .map(t => daysBetween(t.createdDate, t.completedDate));
  const avgTimeToShip = shipTimes.length > 0
    ? Math.round(shipTimes.reduce((a, b) => a + b, 0) / shipTimes.length)
    : 0;

  // Shipping streak: consecutive weeks with at least one ship
  const weekBuckets = {};
  for (const e of allEvidence.filter(ev => ev.type === 'win' || ev.type === 'shipped' || ev.type === 'shipment')) {
    if (!e.date) continue;
    const d = new Date(e.date);
    const weekKey = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}`;
    weekBuckets[weekKey] = true;
  }
  // Also count completed tasks as ships
  for (const t of tasks.completed) {
    if (!t.completedDate) continue;
    const d = new Date(t.completedDate);
    const weekKey = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}`;
    weekBuckets[weekKey] = true;
  }
  // Calculate streak from most recent week going back
  let streak = 0;
  const currentWeek = new Date();
  for (let i = 0; i < 52; i++) {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - i * 7);
    const wk = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}`;
    if (weekBuckets[wk]) streak++;
    else if (i > 0) break; // Allow current week to be empty
  }

  // -- Meetings --
  const allMeetings = collectMeetings(vaultPath);
  const periodMeetings = allMeetings.filter(m => m.date >= periodStart);
  const prevPeriodMeetings = allMeetings.filter(m => m.date >= prevPeriodStart && m.date < periodStart);
  const meetingAvgPerWeek = Math.round((periodMeetings.length / weeks) * 10) / 10;
  const prevMeetingAvg = Math.round((prevPeriodMeetings.length / weeks) * 10) / 10;
  let meetingTrend = 'stable';
  if (meetingAvgPerWeek > prevMeetingAvg * 1.2) meetingTrend = 'increasing';
  else if (meetingAvgPerWeek < prevMeetingAvg * 0.8) meetingTrend = 'decreasing';

  // -- Growth --
  let milestones = {};
  try {
    const raw = readFileSafe(path.join(vaultPath, MILESTONES_FILE));
    if (raw) milestones = JSON.parse(raw);
  } catch { /* ignore */ }

  const learnings = parseJsonlFile(path.join(vaultPath, LEARNINGS_FILE));
  const periodLearnings = learnings.filter(l => l.timestamp && l.timestamp.slice(0, 10) >= periodStart);

  let philosophyEvolution = 'not created';
  try {
    const phPath = path.join(vaultPath, PHILOSOPHY_FILE);
    if (fs.existsSync(phPath)) {
      const stat = fs.statSync(phPath);
      const modStr = stat.mtime.toISOString().slice(0, 10);
      if (modStr >= periodStart) philosophyEvolution = 'recently updated';
      else philosophyEvolution = 'stable';
    }
  } catch { /* ignore */ }

  return {
    timestamp: new Date().toISOString(),
    period: { start: periodStart, end: now, days: periodDays },
    skills: {
      demonstrated,
      growing,
      declining,
    },
    decisions: {
      total: periodDecisions.length,
      avgPerWeek: Math.round((periodDecisions.length / weeks) * 10) / 10,
      topCategories,
    },
    relationships: {
      totalPeople: people.length,
      activeThisMonth: activeThisMonth.length,
      neglected: neglected.map(p => p.name),
      networkGrowth: newPeople.length,
    },
    shipping: {
      shipped: shippedEvidence.length + periodCompleted.length,
      avgTimeToShip,
      streak,
    },
    meetings: {
      totalThisPeriod: periodMeetings.length,
      avgPerWeek: meetingAvgPerWeek,
      trend: meetingTrend,
    },
    growth: {
      sessionsTotal: milestones.conversation_count || 0,
      learningsCaptures: periodLearnings.length,
      skillsUsed: milestones.features_discovered || [],
      philosophyEvolution,
    },
  };
}

// -- Core: saveSnapshot ------------------------------------------------------

/**
 * Save a career snapshot to the append-only JSONL store.
 */
function saveSnapshot(vaultPath, snapshot) {
  try {
    const filePath = path.join(vaultPath, SNAPSHOTS_FILE);
    ensureDir(filePath);
    const line = JSON.stringify(snapshot) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
    return true;
  } catch {
    return false;
  }
}

// -- Core: getSnapshotHistory ------------------------------------------------

/**
 * Read recent snapshots from the JSONL store.
 * @param {string} vaultPath
 * @param {number} [limit=12]
 * @returns {object[]}
 */
function getSnapshotHistory(vaultPath, limit) {
  const max = limit || 12;
  const all = parseJsonlFile(path.join(vaultPath, SNAPSHOTS_FILE));
  // Return most recent first
  return all.slice(-max).reverse();
}

// -- Core: comparePeriods ----------------------------------------------------

/**
 * Compare two snapshots and generate natural-language insights.
 * @param {object} current
 * @param {object} previous
 * @returns {Array<{ text: string, type: string, metric: string, delta: number|string }>}
 */
function comparePeriods(current, previous) {
  const insights = [];

  if (!current || !previous) return insights;

  // Decision velocity
  const decCurr = current.decisions.avgPerWeek;
  const decPrev = previous.decisions.avgPerWeek;
  if (decPrev > 0 && decCurr > 0) {
    const delta = Math.round(((decCurr - decPrev) / decPrev) * 100);
    if (Math.abs(delta) >= 20) {
      const dir = delta > 0 ? 'increased' : 'decreased';
      insights.push({
        text: `Your decision velocity ${dir} ${Math.abs(delta)}% (${decPrev}/week -> ${decCurr}/week)`,
        type: delta > 0 ? 'positive' : 'neutral',
        metric: 'decision_velocity',
        delta,
      });
    }
  }

  // Network growth
  const netGrowth = current.relationships.networkGrowth;
  if (netGrowth > 0) {
    insights.push({
      text: `You've added ${netGrowth} new stakeholder relationship${netGrowth > 1 ? 's' : ''} this period`,
      type: 'positive',
      metric: 'network_growth',
      delta: netGrowth,
    });
  }

  // Neglected relationships
  const neglected = current.relationships.neglected;
  if (neglected.length > 0) {
    const names = neglected.slice(0, 3).join(', ');
    const extra = neglected.length > 3 ? ` and ${neglected.length - 3} more` : '';
    insights.push({
      text: `Haven't connected with ${names}${extra} in 30+ days`,
      type: 'warning',
      metric: 'neglected_relationships',
      delta: neglected.length,
    });
  }

  // Shipping comparison
  const shipCurr = current.shipping.shipped;
  const shipPrev = previous.shipping.shipped;
  if (shipPrev > 0 && shipCurr > 0) {
    const delta = Math.round(((shipCurr - shipPrev) / shipPrev) * 100);
    if (delta > 0) {
      insights.push({
        text: `You shipped ${shipCurr} thing${shipCurr > 1 ? 's' : ''} this period vs ${shipPrev} last period -- ${delta > 50 ? 'best stretch yet' : 'nice improvement'}`,
        type: 'positive',
        metric: 'shipping',
        delta,
      });
    }
  } else if (shipCurr > 0 && shipPrev === 0) {
    insights.push({
      text: `You shipped ${shipCurr} thing${shipCurr > 1 ? 's' : ''} this period -- getting into a rhythm`,
      type: 'positive',
      metric: 'shipping',
      delta: shipCurr,
    });
  }

  // Shipping streak
  if (current.shipping.streak >= 3) {
    insights.push({
      text: `${current.shipping.streak}-week shipping streak -- momentum is building`,
      type: 'positive',
      metric: 'shipping_streak',
      delta: current.shipping.streak,
    });
  }

  // Meeting load
  const meetCurr = current.meetings.avgPerWeek;
  const meetPrev = previous.meetings.avgPerWeek;
  if (meetPrev > 0 && meetCurr > 0) {
    const delta = Math.round(((meetCurr - meetPrev) / meetPrev) * 100);
    if (meetCurr < meetPrev && Math.abs(delta) >= 15) {
      insights.push({
        text: `Meeting load dropped ${Math.abs(delta)}% (${meetPrev}/week -> ${meetCurr}/week) -- more time for deep work`,
        type: 'positive',
        metric: 'meetings',
        delta,
      });
    } else if (meetCurr > meetPrev && delta >= 25) {
      insights.push({
        text: `Meeting load up ${delta}% (${meetPrev}/week -> ${meetCurr}/week) -- watch for calendar creep`,
        type: 'warning',
        metric: 'meetings',
        delta,
      });
    }
  }

  // Skill gaps (declining skills)
  for (const skill of current.skills.declining) {
    if (!skill.lastSeen) continue;
    const daysSince = daysBetween(skill.lastSeen, todayStr());
    if (daysSince > 30) {
      insights.push({
        text: `${titleCase(skill.skill)} hasn't appeared in your evidence for ${daysSince} days -- still relevant?`,
        type: 'warning',
        metric: 'skill_decline',
        delta: -daysSince,
      });
    }
  }

  // Growing skills (celebrate)
  for (const skill of current.skills.growing.slice(0, 2)) {
    insights.push({
      text: `${titleCase(skill.skill)} is trending up -- ${skill.count} evidence points this period`,
      type: 'positive',
      metric: 'skill_growth',
      delta: skill.count,
    });
  }

  // Learnings capture
  if (current.growth.learningsCaptures > 0) {
    insights.push({
      text: `Captured ${current.growth.learningsCaptures} learning${current.growth.learningsCaptures > 1 ? 's' : ''} this period -- building your pattern library`,
      type: 'positive',
      metric: 'learnings',
      delta: current.growth.learningsCaptures,
    });
  }

  return insights;
}

// -- Core: generateCareerBrief -----------------------------------------------

/**
 * Generate a one-paragraph career state summary.
 * @param {string} vaultPath
 * @returns {string}
 */
function generateCareerBrief(vaultPath) {
  try {
    const current = buildCareerSnapshot(vaultPath);
    const history = getSnapshotHistory(vaultPath, 2);
    const previous = history.length > 0 ? history[0] : null;

    const parts = [];

    // Phase detection
    const shipped = current.shipping.shipped;
    const decisions = current.decisions.total;
    const netGrowth = current.relationships.networkGrowth;
    const growing = current.skills.growing;

    if (shipped >= 3 && growing.length >= 2) {
      parts.push('You\'re in a growth phase: shipping consistently');
    } else if (shipped >= 2) {
      parts.push('You\'re building momentum: shipping regularly');
    } else if (decisions >= 5) {
      parts.push('You\'re in a decision-heavy phase');
    } else {
      parts.push('You\'re in an early stage of tracking your career data');
    }

    if (shipped > 0) {
      parts.push(`(${shipped} this month)`);
    }

    if (netGrowth > 0) {
      parts.push(`expanding your network (${netGrowth} new stakeholders)`);
    }

    if (growing.length > 0) {
      const topGrowing = growing.slice(0, 2).map(s => titleCase(s.skill)).join(' and ');
      parts.push(`and demonstrating ${topGrowing}`);
    }

    // Watch-outs
    const declining = current.skills.declining.filter(s => s.lastSeen && daysBetween(s.lastSeen, todayStr()) > 30);
    if (declining.length > 0) {
      const topDecline = declining[0];
      parts.push(`Watch out: your ${titleCase(topDecline.skill)} evidence is thin -- consider taking on a ${titleCase(topDecline.skill).toLowerCase()}-heavy project`);
    }

    const neglected = current.relationships.neglected;
    if (neglected.length > 0) {
      parts.push(`Also: ${neglected.length} relationship${neglected.length > 1 ? 's' : ''} could use attention`);
    }

    return parts.join('. ').replace(/\.\./g, '.') + '.';
  } catch {
    return 'Not enough data yet to generate a career brief. Keep capturing evidence, wins, and decisions.';
  }
}

// -- Core: getSkillMatrix ----------------------------------------------------

/**
 * Returns a detailed skill demonstration matrix.
 * @param {string} vaultPath
 * @returns {Array<{ skill: string, demonstrationCount: number, lastDemonstrated: string, sources: string[], trend: string }>}
 */
function getSkillMatrixDetailed(vaultPath) {
  const allEvidence = collectEvidence(vaultPath);
  const now = todayStr();
  const thirtyDaysAgo = daysAgo(30);
  const sixtyDaysAgo = daysAgo(60);

  const skillMap = {};

  for (const e of allEvidence) {
    for (const skill of e.skills) {
      if (!skillMap[skill]) {
        skillMap[skill] = { recent: 0, previous: 0, lastSeen: '', sources: new Set() };
      }
      skillMap[skill].sources.add(e.source);
      if (!skillMap[skill].lastSeen || e.date > skillMap[skill].lastSeen) {
        skillMap[skill].lastSeen = e.date;
      }
      if (e.date >= thirtyDaysAgo) skillMap[skill].recent++;
      else if (e.date >= sixtyDaysAgo) skillMap[skill].previous++;
    }
  }

  // Also scan learnings
  const learnings = parseJsonlFile(path.join(vaultPath, LEARNINGS_FILE));
  for (const l of learnings) {
    if (l.type === 'skill_tip' && l.content) {
      const skills = extractSkillTags(l.content);
      for (const skill of skills) {
        if (!skillMap[skill]) {
          skillMap[skill] = { recent: 0, previous: 0, lastSeen: '', sources: new Set() };
        }
        skillMap[skill].sources.add('learnings');
        const date = l.timestamp ? l.timestamp.slice(0, 10) : '';
        if (date && (!skillMap[skill].lastSeen || date > skillMap[skill].lastSeen)) {
          skillMap[skill].lastSeen = date;
        }
        if (date >= thirtyDaysAgo) skillMap[skill].recent++;
        else if (date >= sixtyDaysAgo) skillMap[skill].previous++;
      }
    }
  }

  return Object.entries(skillMap).map(([skill, data]) => {
    let trend = 'stable';
    if (data.recent > data.previous) trend = 'growing';
    else if (data.recent < data.previous || (data.recent === 0 && data.previous > 0)) trend = 'declining';
    // Stale: no activity in 30+ days
    if (data.lastSeen && data.lastSeen < thirtyDaysAgo) trend = 'stale';

    return {
      skill,
      demonstrationCount: data.recent + data.previous,
      lastDemonstrated: data.lastSeen,
      sources: Array.from(data.sources),
      trend,
    };
  }).sort((a, b) => b.demonstrationCount - a.demonstrationCount);
}

// -- Core: getPromotionReadiness ---------------------------------------------

/**
 * Assess readiness for a target career level.
 * @param {string} vaultPath
 * @param {string} targetLevel - 'senior' | 'lead' | 'director' | 'vp'
 * @returns {{ level: string, readiness: number, strong: object[], gaps: object[], recommendations: string[] }}
 */
function getPromotionReadiness(vaultPath, targetLevel) {
  const level = (targetLevel || 'senior').toLowerCase();
  const competencies = LEVEL_COMPETENCIES[level];
  if (!competencies) {
    return { level, readiness: 0, strong: [], gaps: [], recommendations: ['Unknown target level. Use: senior, lead, director, or vp.'] };
  }

  // Collect all text evidence
  const allEvidence = collectEvidence(vaultPath);
  const allText = allEvidence.map(e => (e.content || '').toLowerCase()).join('\n');

  // Also include decisions and learnings
  const decisions = collectDecisions(vaultPath);
  const decisionTexts = decisions.map(d => {
    return readFileSafe(path.join(vaultPath, DECISIONS_DIR, d.file)).toLowerCase();
  }).join('\n');

  const learnings = parseJsonlFile(path.join(vaultPath, LEARNINGS_FILE));
  const learningText = learnings.map(l => (l.content || '')).join('\n').toLowerCase();

  const fullText = [allText, decisionTexts, learningText].join('\n');

  const results = [];
  let totalScore = 0;

  for (const [competency, keywords] of Object.entries(competencies)) {
    let hits = 0;
    for (const kw of keywords) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = fullText.match(re);
      if (matches) hits += matches.length;
    }

    // Score: 0-100, capped by evidence density
    // 0 hits = 0, 1-2 = 25, 3-5 = 50, 6-10 = 75, 10+ = 90-100
    let score = 0;
    if (hits >= 10) score = Math.min(100, 85 + Math.min(15, hits - 10));
    else if (hits >= 6) score = 70 + Math.round((hits - 6) * 3.75);
    else if (hits >= 3) score = 45 + Math.round((hits - 3) * 8.33);
    else if (hits >= 1) score = 15 + Math.round((hits - 1) * 15);

    results.push({ competency, score, hits });
    totalScore += score;
  }

  const readiness = Math.round(totalScore / results.length);
  const strong = results.filter(r => r.score >= 60).sort((a, b) => b.score - a.score);
  const gaps = results.filter(r => r.score < 60).sort((a, b) => a.score - b.score);

  const recommendations = [];
  for (const gap of gaps) {
    const comp = titleCase(gap.competency);
    if (gap.score < 25) {
      recommendations.push(`${comp} is a significant gap (score: ${gap.score}/100). Look for projects that let you practice this directly.`);
    } else {
      recommendations.push(`${comp} could be stronger (score: ${gap.score}/100). You have some evidence -- look for more visible demonstrations.`);
    }
  }

  if (strong.length > 0 && gaps.length === 0) {
    recommendations.push(`Strong across the board. Consider building evidence for the next level (${level === 'senior' ? 'lead' : level === 'lead' ? 'director' : 'vp'}).`);
  }

  return { level, readiness, strong, gaps, recommendations };
}

// -- Formatting Helpers (for skills) -----------------------------------------

/**
 * Build ASCII progress bar.
 * @param {number} filled - 0-10
 * @returns {string}
 */
function progressBar(filled) {
  const f = Math.max(0, Math.min(10, filled));
  return '\u25A0'.repeat(f) + '\u2591'.repeat(10 - f);
}

/**
 * Format the career dashboard output for terminal display.
 */
function formatDashboard(snapshot, insights) {
  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const lines = [];

  lines.push(`Career Intelligence -- ${monthName}`);
  lines.push('');

  // Key metrics
  const ship = snapshot.shipping.shipped;
  const dec = snapshot.decisions.total;
  const decAvg = snapshot.decisions.avgPerWeek;
  const net = snapshot.relationships.activeThisMonth;
  const netNew = snapshot.relationships.networkGrowth;
  const meetings = snapshot.meetings.totalThisPeriod;
  const meetTrend = snapshot.meetings.trend;

  lines.push(`Shipping: ${ship} this month${snapshot.shipping.streak >= 2 ? '  [' + snapshot.shipping.streak + '-week streak]' : ''}`);
  lines.push(`Decisions: ${dec} this month (${decAvg}/week avg)`);
  lines.push(`Network: ${net} active relationships${netNew > 0 ? ' (+' + netNew + ' new)' : ''}`);
  lines.push(`Meetings: ${meetings} (${meetTrend === 'decreasing' ? 'down -- more focused' : meetTrend === 'increasing' ? 'up -- watch calendar creep' : 'stable'})`);
  lines.push('');

  // Skill bars
  const skills = snapshot.skills.demonstrated.filter(s => s.count > 0).slice(0, 8);
  if (skills.length > 0) {
    lines.push('Skills demonstrated:');
    const maxCount = Math.max(...skills.map(s => s.count), 1);
    for (const s of skills) {
      const filled = Math.round((s.count / maxCount) * 10);
      const bar = progressBar(filled);
      const warning = s.trend === 'declining' ? ' [!] declining' : s.trend === 'stale' ? ' [!] stale' : '';
      lines.push(`  ${bar} ${titleCase(s.skill)} (${s.count})${warning}`);
    }
    lines.push('');
  }

  // Growth signals from insights
  const positives = insights.filter(i => i.type === 'positive');
  const warnings = insights.filter(i => i.type === 'warning');

  if (positives.length > 0 || warnings.length > 0) {
    lines.push('Growth signals:');
    for (const p of positives.slice(0, 4)) {
      lines.push(`  [+] ${p.text}`);
    }
    for (const w of warnings.slice(0, 3)) {
      lines.push(`  [!] ${w.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format trajectory view with ASCII trend lines from snapshot history.
 */
function formatTrajectory(snapshots) {
  if (snapshots.length < 2) {
    return 'Need at least 2 career snapshots for trajectory analysis. Run /career-dashboard weekly to build history.';
  }

  const lines = [];
  const ordered = [...snapshots].reverse(); // oldest first

  lines.push('Career Trajectory');
  lines.push('='.repeat(50));
  lines.push('');

  // Shipping trend
  const shipValues = ordered.map(s => s.shipping.shipped);
  lines.push('Shipping volume:');
  lines.push('  ' + asciiSparkline(shipValues) + ` (latest: ${shipValues[shipValues.length - 1]})`);
  lines.push('');

  // Decision trend
  const decValues = ordered.map(s => s.decisions.avgPerWeek);
  lines.push('Decision velocity (per week):');
  lines.push('  ' + asciiSparkline(decValues) + ` (latest: ${decValues[decValues.length - 1]})`);
  lines.push('');

  // Network trend
  const netValues = ordered.map(s => s.relationships.activeThisMonth);
  lines.push('Active relationships:');
  lines.push('  ' + asciiSparkline(netValues) + ` (latest: ${netValues[netValues.length - 1]})`);
  lines.push('');

  // Meeting trend
  const meetValues = ordered.map(s => s.meetings.avgPerWeek);
  lines.push('Meetings (per week):');
  lines.push('  ' + asciiSparkline(meetValues) + ` (latest: ${meetValues[meetValues.length - 1]})`);
  lines.push('');

  // Skills evolution
  const allSkills = new Set();
  for (const s of ordered) {
    for (const sk of s.skills.demonstrated) {
      if (sk.count > 0) allSkills.add(sk.skill);
    }
  }

  if (allSkills.size > 0) {
    lines.push('Skill evolution:');
    for (const skill of [...allSkills].slice(0, 6)) {
      const counts = ordered.map(s => {
        const found = s.skills.demonstrated.find(sk => sk.skill === skill);
        return found ? found.count : 0;
      });
      const latest = counts[counts.length - 1];
      const first = counts[0];
      const dir = latest > first ? '[+]' : latest < first ? '[-]' : '[=]';
      lines.push(`  ${dir} ${titleCase(skill)}: ${asciiSparkline(counts)}`);
    }
    lines.push('');
  }

  // Inflection points
  lines.push('Inflection points:');
  let foundInflection = false;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const dateLabel = curr.period.end;

    // Big shipping jump
    if (curr.shipping.shipped > prev.shipping.shipped * 2 && prev.shipping.shipped > 0) {
      lines.push(`  ${dateLabel}: Shipping velocity doubled`);
      foundInflection = true;
    }
    // Decision velocity spike
    if (curr.decisions.avgPerWeek > prev.decisions.avgPerWeek * 1.5 && prev.decisions.avgPerWeek > 0) {
      lines.push(`  ${dateLabel}: Decision-making accelerated`);
      foundInflection = true;
    }
    // Network expansion
    if (curr.relationships.networkGrowth > 5) {
      lines.push(`  ${dateLabel}: Significant network expansion (+${curr.relationships.networkGrowth})`);
      foundInflection = true;
    }
  }
  if (!foundInflection) {
    lines.push('  No major inflection points detected yet. Keep building data weekly.');
  }

  return lines.join('\n');
}

/**
 * ASCII sparkline from an array of numbers.
 */
function asciiSparkline(values) {
  if (!values || values.length === 0) return '';
  const chars = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[idx];
  }).join('');
}

// -- Exports -----------------------------------------------------------------

module.exports = {
  buildCareerSnapshot,
  saveSnapshot,
  getSnapshotHistory,
  comparePeriods,
  generateCareerBrief,
  getSkillMatrixDetailed,
  getPromotionReadiness,
  formatDashboard,
  formatTrajectory,
  // Internals exposed for testing
  collectEvidence,
  collectPeoplePages,
  collectDecisions,
  collectMeetings,
  collectTasks,
  extractSkillTags,
  progressBar,
  asciiSparkline,
};
