'use strict';

const fs = require('fs');
const path = require('path');

// ── Decision Patterns ─────────────────────────────────────────────────────
// Analyses a PM's decision history to surface patterns, biases, and insights.
// All analysis is local/heuristic — no API calls. Handles missing files
// gracefully throughout.

// ── Constants ─────────────────────────────────────────────────────────────

const DECISIONS_DIR = '03-Decisions';
const INBOX_DECISIONS_DIR = '00-Inbox/Decisions';
const TASKS_FILE = '03-Tasks/Tasks.md';
const MEMORY_DIR = '.vennie/memory';

const DECISION_PATTERNS_RE = [
  /\*\*Decision:\*\*/i,
  /\bdecided to\b/i,
  /\bwe decided\b/i,
  /\bthe call is\b/i,
  /\bgoing with\b/i,
  /\bchose to\b/i,
  /\btrade-off:/i,
  /\bdecision:/i,
];

const CATEGORY_KEYWORDS = {
  prioritisation: [
    'priority', 'roadmap', 'backlog', 'rank', 'sequence', 'first',
    'defer', 'later', 'prioriti', 'deprioritise', 'deprioritize',
  ],
  technical: [
    'architecture', 'stack', 'api', 'database', 'framework',
    'infrastructure', 'build vs buy', 'migration', 'tech debt',
    'refactor', 'deploy', 'hosting',
  ],
  people: [
    'hire', 'team', 'role', 'responsibility', 'delegate', 'promote',
    'org', 'headcount', 'manager', 'report', 'reorg',
  ],
  strategy: [
    'market', 'competitor', 'positioning', 'pricing', 'segment',
    'gtm', 'partnership', 'go-to-market', 'strategic', 'vision',
    'invest', 'bet',
  ],
  scope: [
    'mvp', 'cut', 'add', 'feature', 'scope', 'ship', 'launch',
    'v1', 'v2', 'release', 'slim down', 'descope',
  ],
};

const SPEED_KEYWORDS = ['ship it', 'just do it', 'fast', 'move quickly', 'asap', 'quick win', 'good enough', 'bias to action', "let's just"];
const CAUTION_KEYWORDS = ["let's wait", 'need more data', 'research first', 'hold off', 'more analysis', 'not ready', 'take our time', 'due diligence'];
const BUILD_KEYWORDS = ['build', 'built', 'custom', 'in-house', 'homegrown', 'write our own', 'develop internally'];
const BUY_KEYWORDS = ['buy', 'vendor', 'saas', 'third-party', 'third party', 'off-the-shelf', 'outsource', 'existing tool', 'use an existing'];
const REVERSAL_KEYWORDS = ['actually', 'changed our mind', 'pivoted', 'reversed', 'went back on', 'reconsidered', 'u-turn', 'undid'];

const MIN_PATTERN_DATA_POINTS = 3;

// ── File Helpers ──────────────────────────────────────────────────────────

/**
 * Safely read a file's contents. Returns empty string if missing.
 */
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Safely read a directory. Returns [] if missing.
 */
function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Walk a directory recursively collecting .md files (absolute paths).
 */
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

/**
 * Extract date from a filename or frontmatter. Returns YYYY-MM-DD or null.
 */
function extractDate(filePath, content) {
  // Try filename first (e.g. "2026-03-15 - Some Decision.md")
  const fnameMatch = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  if (fnameMatch) return fnameMatch[1];

  // Try frontmatter date field
  const fmMatch = content.match(/^---[\s\S]*?date:\s*(\d{4}-\d{2}-\d{2})[\s\S]*?---/);
  if (fmMatch) return fmMatch[1];

  // Fall back to file mtime
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Check if a date string is within the last N days.
 */
function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

/**
 * Count keyword hits in a text (case-insensitive).
 */
function countKeywordHits(text, keywords) {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    // Count occurrences, not just presence
    const idx = lower.indexOf(kw);
    if (idx !== -1) count++;
  }
  return count;
}

// ── Category Inference ────────────────────────────────────────────────────

/**
 * Infer the best category for a decision based on keyword scoring.
 */
function inferCategory(text) {
  const lower = text.toLowerCase();
  let bestCategory = 'uncategorised';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// ── Decision Extraction ───────────────────────────────────────────────────

/**
 * Extract decisions from a single file. Returns array of decision objects.
 */
function extractDecisionsFromFile(filePath, content) {
  const decisions = [];
  const date = extractDate(filePath, content);
  const lines = content.split('\n');

  // Check if the whole file is a decision doc (in Decisions folder)
  const inDecisionsDir = filePath.includes(DECISIONS_DIR) || filePath.includes(INBOX_DECISIONS_DIR);

  if (inDecisionsDir) {
    // Treat the whole file as a decision
    const title = lines.find(l => l.startsWith('# '));
    const summary = title ? title.replace(/^#+\s*/, '') : path.basename(filePath, '.md');

    // Try to extract what was chosen vs rejected
    const chosen = extractChosen(content);
    const rejected = extractRejected(content);

    decisions.push({
      date,
      summary,
      category: inferCategory(content),
      context: content.slice(0, 300).trim(),
      chosen,
      rejected,
      file: filePath,
    });
  }

  // Also scan line by line for inline decisions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isDecisionLine = DECISION_PATTERNS_RE.some(re => re.test(line));
    if (!isDecisionLine) continue;

    // Skip if we already captured this file as a whole decision and
    // this is just the title line
    if (inDecisionsDir && i < 3) continue;

    // Grab surrounding context (2 lines before, 2 after)
    const contextStart = Math.max(0, i - 2);
    const contextEnd = Math.min(lines.length, i + 3);
    const context = lines.slice(contextStart, contextEnd).join('\n').trim();

    // Extract a clean summary from the decision line
    let summary = line
      .replace(/\*\*Decision:\*\*\s*/i, '')
      .replace(/^[-*]\s*/, '')
      .replace(/\bdecision:\s*/i, '')
      .trim();

    if (summary.length > 120) {
      summary = summary.slice(0, 117) + '...';
    }

    // Avoid duplicate if the summary is essentially the same as the file-level one
    if (inDecisionsDir && decisions.length > 0 && decisions[0].summary === summary) {
      continue;
    }

    decisions.push({
      date,
      summary,
      category: inferCategory(context),
      context,
      chosen: null,
      rejected: null,
      file: filePath,
    });
  }

  return decisions;
}

/**
 * Try to extract what was chosen from decision content.
 */
function extractChosen(content) {
  const patterns = [
    /\*\*Chosen:\*\*\s*(.+)/i,
    /\*\*Decision:\*\*\s*(.+)/i,
    /Going with\s+(.+?)[\.\n]/i,
    /Chose to\s+(.+?)[\.\n]/i,
    /The call is\s+(.+?)[\.\n]/i,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Try to extract what was rejected from decision content.
 */
function extractRejected(content) {
  const patterns = [
    /\*\*Rejected:\*\*\s*(.+)/i,
    /\*\*Alternative[s]?:\*\*\s*(.+)/i,
    /Instead of\s+(.+?)[\.\n]/i,
    /Ruled out\s+(.+?)[\.\n]/i,
    /Considered but rejected\s+(.+?)[\.\n]/i,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Extract completed tasks as "acted-on decisions" from Tasks.md.
 */
function extractCompletedTasks(vaultPath) {
  const tasksFile = path.join(vaultPath, TASKS_FILE);
  const content = safeRead(tasksFile);
  if (!content) return [];

  const decisions = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match completed tasks: - [x] or ✅
    if (!/(?:\[x\]|✅)/.test(line)) continue;

    // Extract date from completion timestamp if present (e.g. ✅ 2026-01-28 14:35)
    const dateMatch = line.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : null;

    // Clean up the summary
    let summary = line
      .replace(/^[-*]\s*\[x\]\s*/i, '')
      .replace(/✅\s*\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}\s*/, '')
      .replace(/\^task-\S+/g, '')
      .replace(/#\s*Career:\s*\S+/g, '')
      .trim();

    if (!summary) continue;

    decisions.push({
      date,
      summary: `Completed: ${summary}`,
      category: inferCategory(summary),
      context: line.trim(),
      chosen: null,
      rejected: null,
      file: tasksFile,
    });
  }

  return decisions;
}

// ── Pattern Detection ─────────────────────────────────────────────────────

/**
 * Detect patterns from a collection of decisions.
 * Requires MIN_PATTERN_DATA_POINTS data points before surfacing a pattern.
 */
function detectPatterns(decisions) {
  const patterns = [];

  if (decisions.length < MIN_PATTERN_DATA_POINTS) return patterns;

  // ── Speed vs Thoroughness ──────────────────────────────────────────────
  const scopeDecisions = decisions.filter(d => d.category === 'scope');
  if (scopeDecisions.length >= MIN_PATTERN_DATA_POINTS) {
    let speedCount = 0;
    let cautionCount = 0;

    for (const d of scopeDecisions) {
      const text = (d.context || d.summary).toLowerCase();
      if (SPEED_KEYWORDS.some(kw => text.includes(kw))) speedCount++;
      if (CAUTION_KEYWORDS.some(kw => text.includes(kw))) cautionCount++;
    }

    const recent = scopeDecisions.slice(-10);
    const recentSpeed = recent.filter(d => {
      const text = (d.context || d.summary).toLowerCase();
      return SPEED_KEYWORDS.some(kw => text.includes(kw));
    }).length;

    if (speedCount >= MIN_PATTERN_DATA_POINTS && speedCount > cautionCount * 2) {
      patterns.push(
        `Consistently chooses speed over thoroughness (${recentSpeed} of last ${recent.length} scope decisions)`
      );
    } else if (cautionCount >= MIN_PATTERN_DATA_POINTS && cautionCount > speedCount * 2) {
      patterns.push(
        `Tends to favour thoroughness over speed (${cautionCount} of ${scopeDecisions.length} scope decisions show caution)`
      );
    }
  }

  // ── Build vs Buy ───────────────────────────────────────────────────────
  const techDecisions = decisions.filter(d => d.category === 'technical');
  if (techDecisions.length >= MIN_PATTERN_DATA_POINTS) {
    let buildCount = 0;
    let buyCount = 0;

    for (const d of techDecisions) {
      const text = (d.context || d.summary).toLowerCase();
      if (BUILD_KEYWORDS.some(kw => text.includes(kw))) buildCount++;
      if (BUY_KEYWORDS.some(kw => text.includes(kw))) buyCount++;
    }

    const total = buildCount + buyCount;
    if (total >= MIN_PATTERN_DATA_POINTS) {
      if (buildCount > buyCount * 2) {
        patterns.push(
          `Strong bias toward building over buying (${buildCount} of ${total} technical decisions)`
        );
      } else if (buyCount > buildCount * 2) {
        patterns.push(
          `Strong bias toward buying over building (${buyCount} of ${total} technical decisions)`
        );
      }
    }
  }

  // ── People Decision Deferral ───────────────────────────────────────────
  const peopleDecisions = decisions.filter(d => d.category === 'people' && d.date);
  const otherTimedDecisions = decisions.filter(d => d.category !== 'people' && d.date);

  if (peopleDecisions.length >= MIN_PATTERN_DATA_POINTS && otherTimedDecisions.length >= MIN_PATTERN_DATA_POINTS) {
    // Compare average "staleness" — how old are people decisions relative to
    // when the issue first appeared? We approximate by looking at file dates.
    // Since exact deferral time is hard to measure, we note if people decisions
    // cluster toward older dates relative to other categories.
    const avgAge = (decs) => {
      const now = Date.now();
      const ages = decs.map(d => now - new Date(d.date + 'T00:00:00').getTime());
      return ages.reduce((a, b) => a + b, 0) / ages.length;
    };

    const peopleAvgMs = avgAge(peopleDecisions);
    const otherAvgMs = avgAge(otherTimedDecisions);
    const peopleDays = Math.round(peopleAvgMs / (1000 * 60 * 60 * 24));
    const otherDays = Math.round(otherAvgMs / (1000 * 60 * 60 * 24));

    if (peopleDays > otherDays * 1.5 && (peopleDays - otherDays) >= 3) {
      patterns.push(
        `Tends to defer people-related decisions (avg ${peopleDays} days vs ${otherDays} days for other categories)`
      );
    }
  }

  // ── Scope Patterns (features added vs cut) ─────────────────────────────
  if (scopeDecisions.length >= MIN_PATTERN_DATA_POINTS) {
    const addKeywords = ['add', 'include', 'expand', 'also', 'extra', 'plus', 'bonus'];
    const cutKeywords = ['cut', 'remove', 'descope', 'slim', 'drop', 'skip', 'defer', 'later'];

    let addCount = 0;
    let cutCount = 0;

    for (const d of scopeDecisions) {
      const text = (d.context || d.summary).toLowerCase();
      if (addKeywords.some(kw => text.includes(kw))) addCount++;
      if (cutKeywords.some(kw => text.includes(kw))) cutCount++;
    }

    const total = addCount + cutCount;
    if (total >= MIN_PATTERN_DATA_POINTS) {
      if (addCount > cutCount * 2) {
        patterns.push(
          `Scope tends to expand rather than contract (${addCount} additions vs ${cutCount} cuts)`
        );
      } else if (cutCount > addCount * 2) {
        patterns.push(
          `Disciplined scope reducer (${cutCount} cuts vs ${addCount} additions)`
        );
      }
    }
  }

  // ── Reversal Rate ──────────────────────────────────────────────────────
  if (decisions.length >= MIN_PATTERN_DATA_POINTS) {
    let reversalCount = 0;
    for (const d of decisions) {
      const text = (d.context || d.summary).toLowerCase();
      if (REVERSAL_KEYWORDS.some(kw => text.includes(kw))) reversalCount++;
    }

    if (reversalCount >= MIN_PATTERN_DATA_POINTS) {
      const pct = Math.round((reversalCount / decisions.length) * 100);
      patterns.push(
        `Reversal rate: ${pct}% of decisions show signs of being revisited (${reversalCount} of ${decisions.length})`
      );
    } else if (reversalCount === 0 && decisions.length >= 10) {
      patterns.push(
        `Low reversal rate — none of ${decisions.length} decisions show signs of being reversed`
      );
    }
  }

  // ── Category Distribution Skew ─────────────────────────────────────────
  if (decisions.length >= MIN_PATTERN_DATA_POINTS * 2) {
    const cats = {};
    for (const d of decisions) {
      cats[d.category] = (cats[d.category] || 0) + 1;
    }

    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const [topCat, topCount] = sorted[0] || [];
    const topPct = Math.round((topCount / decisions.length) * 100);

    if (topPct >= 40 && topCount >= MIN_PATTERN_DATA_POINTS) {
      patterns.push(
        `${topPct}% of decisions are ${topCat}-related — this may be where your attention naturally gravitates`
      );
    }

    // Check for underrepresented categories
    const expectedCats = Object.keys(CATEGORY_KEYWORDS);
    const missing = expectedCats.filter(c => !cats[c] || cats[c] === 0);
    if (missing.length > 0 && missing.length <= 2) {
      patterns.push(
        `No logged decisions for: ${missing.join(', ')} — blind spot or delegated away?`
      );
    }
  }

  return patterns;
}

// ── Core Exports ──────────────────────────────────────────────────────────

/**
 * Scan the vault for all decision-related content and return a full analysis.
 */
function analyseDecisions(vaultPath) {
  const allDecisions = [];

  // 1. Read files in dedicated decisions directories
  const decisionsDirs = [
    path.join(vaultPath, DECISIONS_DIR),
    path.join(vaultPath, INBOX_DECISIONS_DIR),
  ];

  for (const dir of decisionsDirs) {
    for (const filePath of walkMd(dir)) {
      const content = safeRead(filePath);
      if (content) {
        allDecisions.push(...extractDecisionsFromFile(filePath, content));
      }
    }
  }

  // 2. Grep across the wider vault for decision-pattern lines
  const vaultDirs = safeReaddir(vaultPath)
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'System')
    .map(e => path.join(vaultPath, e.name));

  const seenFiles = new Set(allDecisions.map(d => d.file));

  for (const dir of vaultDirs) {
    for (const filePath of walkMd(dir)) {
      if (seenFiles.has(filePath)) continue;
      const content = safeRead(filePath);
      if (!content) continue;

      const hasDecision = DECISION_PATTERNS_RE.some(re => re.test(content));
      if (hasDecision) {
        const extracted = extractDecisionsFromFile(filePath, content);
        allDecisions.push(...extracted);
        seenFiles.add(filePath);
      }
    }
  }

  // 3. Extract completed tasks as acted-on decisions
  allDecisions.push(...extractCompletedTasks(vaultPath));

  // Deduplicate by summary + date
  const deduped = [];
  const seen = new Set();
  for (const d of allDecisions) {
    const key = `${d.date}::${d.summary}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(d);
    }
  }

  // Sort chronologically
  deduped.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return a.date.localeCompare(b.date);
  });

  // Build category counts
  const categories = {};
  for (const d of deduped) {
    categories[d.category] = (categories[d.category] || 0) + 1;
  }

  // Recent decisions (last 30 days)
  const recentDecisions = deduped.filter(d => isWithinDays(d.date, 30));

  // Detect patterns
  const patterns = detectPatterns(deduped);

  // Build timeline
  const timeline = deduped.map(d => ({
    date: d.date || 'unknown',
    summary: d.summary,
    category: d.category,
    file: d.file,
  }));

  const formatted = formatPatternReport({
    totalDecisions: deduped.length,
    recentDecisions,
    categories,
    patterns,
    timeline,
  });

  return {
    totalDecisions: deduped.length,
    recentDecisions,
    categories,
    patterns,
    timeline,
    formatted,
  };
}

/**
 * For a specific topic, find all related past decisions.
 */
function getDecisionContext(vaultPath, topic) {
  const analysis = analyseDecisions(vaultPath);
  const topicLower = topic.toLowerCase();
  const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2);

  const relatedDecisions = analysis.timeline.filter(d => {
    const text = d.summary.toLowerCase();
    // Match if any significant topic word appears in the summary
    return topicWords.some(w => text.includes(w));
  }).map(d => ({
    date: d.date,
    summary: d.summary,
    file: d.file,
  }));

  // Try to detect a pattern in the related decisions
  let pattern = null;
  if (relatedDecisions.length >= MIN_PATTERN_DATA_POINTS) {
    // Look at category distribution within related decisions
    const cats = {};
    for (const d of relatedDecisions) {
      const fullDecision = analysis.recentDecisions.find(
        rd => rd.summary === d.summary && rd.date === d.date
      ) || { category: 'uncategorised' };
      cats[fullDecision.category] = (cats[fullDecision.category] || 0) + 1;
    }

    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
      // Generate a pattern description based on content analysis
      const allText = relatedDecisions.map(d => d.summary).join(' ').toLowerCase();

      if (countKeywordHits(allText, ['customer', 'user', 'friendly', 'free', 'discount']) > 2) {
        pattern = `You've consistently chosen customer-friendly ${topic} over revenue optimization`;
      } else if (countKeywordHits(allText, ['aggressive', 'growth', 'maximize', 'increase', 'raise']) > 2) {
        pattern = `You've leaned toward aggressive ${topic} decisions — growth over caution`;
      } else if (countKeywordHits(allText, ['conservative', 'safe', 'gradual', 'phased']) > 2) {
        pattern = `You've taken a conservative approach to ${topic} — incremental changes over big swings`;
      } else {
        pattern = `${relatedDecisions.length} decisions about "${topic}" — mostly ${topCat[0]}-category`;
      }
    }
  }

  return {
    relatedDecisions,
    pattern,
  };
}

/**
 * Format a decision analysis into a readable markdown report.
 */
function formatPatternReport(analysis) {
  const lines = [];

  lines.push('# Decision Pattern Analysis');
  lines.push('');
  lines.push(`**Total decisions logged:** ${analysis.totalDecisions}`);
  lines.push(`**Last 30 days:** ${analysis.recentDecisions.length}`);
  lines.push('');

  // Categories
  if (Object.keys(analysis.categories).length > 0) {
    lines.push('## Decision Categories');
    lines.push('');

    const sorted = Object.entries(analysis.categories).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      const bar = '\u2588'.repeat(Math.min(count, 30));
      lines.push(`- **${cat}:** ${count} ${bar}`);
    }
    lines.push('');
  }

  // Patterns
  if (analysis.patterns.length > 0) {
    lines.push('## Detected Patterns');
    lines.push('');
    for (const p of analysis.patterns) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  } else {
    lines.push('## Detected Patterns');
    lines.push('');
    lines.push('_Not enough data to detect patterns (need 3+ decisions in a category)._');
    lines.push('');
  }

  // Recent timeline
  if (analysis.recentDecisions.length > 0) {
    lines.push('## Recent Decisions (Last 30 Days)');
    lines.push('');
    for (const d of analysis.recentDecisions.slice(-15)) {
      const dateLabel = d.date || 'undated';
      const catLabel = d.category ? ` [${d.category}]` : '';
      lines.push(`- **${dateLabel}**${catLabel} — ${d.summary}`);
    }
    if (analysis.recentDecisions.length > 15) {
      lines.push(`- _...and ${analysis.recentDecisions.length - 15} more_`);
    }
    lines.push('');
  }

  // Full timeline summary
  if (analysis.timeline.length > 0) {
    lines.push('## Full Timeline');
    lines.push('');
    const byMonth = {};
    for (const d of analysis.timeline) {
      const month = d.date ? d.date.slice(0, 7) : 'undated';
      if (!byMonth[month]) byMonth[month] = 0;
      byMonth[month]++;
    }
    for (const [month, count] of Object.entries(byMonth).sort()) {
      lines.push(`- **${month}:** ${count} decisions`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Look at recent session memory for decisions that might not have been logged.
 * Returns suggestions for missing decision logs.
 */
function detectMissingContext(vaultPath) {
  const suggestions = [];
  const memoryDir = path.join(vaultPath, MEMORY_DIR);

  if (!fs.existsSync(memoryDir)) return suggestions;

  // Collect all logged decision summaries for deduplication
  const analysis = analyseDecisions(vaultPath);
  const loggedSummaries = new Set(
    analysis.timeline.map(d => d.summary.toLowerCase())
  );

  // Decision-adjacent phrases in conversation that suggest a decision was made
  const decisionAdjacentRE = [
    /(?:let's go with|we should go with|i('m| am) going to)\s+(.+?)(?:\.|$)/gi,
    /(?:the plan is to|we('re| are) going to)\s+(.+?)(?:\.|$)/gi,
    /(?:decided|decision).*?(?:to|that|on)\s+(.+?)(?:\.|$)/gi,
    /(?:strategy|approach) (?:is|will be)\s+(.+?)(?:\.|$)/gi,
  ];

  // Scan memory files from the last 14 days
  const entries = safeReaddir(memoryDir);
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const filePath = path.join(memoryDir, entry.name);

    // Check file age
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtime < cutoff) continue;
    } catch {
      continue;
    }

    const content = safeRead(filePath);
    if (!content) continue;

    const fileDate = extractDate(filePath, content) || now.toISOString().slice(0, 10);

    // Scan for decision-adjacent language
    for (const re of decisionAdjacentRE) {
      let match;
      re.lastIndex = 0; // reset for global regex
      while ((match = re.exec(content)) !== null) {
        // Get the captured group (the decision description)
        const hint = (match[2] || match[1] || '').trim();
        if (!hint || hint.length < 10 || hint.length > 200) continue;

        // Check if this is already logged
        const hintLower = hint.toLowerCase();
        const alreadyLogged = [...loggedSummaries].some(s =>
          s.includes(hintLower) || hintLower.includes(s)
        );

        if (alreadyLogged) continue;

        // Check for duplicate suggestions
        const alreadySuggested = suggestions.some(s =>
          s.hint.toLowerCase().includes(hintLower) || hintLower.includes(s.hint.toLowerCase())
        );

        if (alreadySuggested) continue;

        suggestions.push({
          date: fileDate,
          hint: `You discussed "${hint}" but no decision was logged`,
          suggestedLog: `/log decision ${hint}`,
        });
      }
    }
  }

  // Sort by date descending (most recent first)
  suggestions.sort((a, b) => b.date.localeCompare(a.date));

  return suggestions;
}

// ── Module Exports ────────────────────────────────────────────────────────

module.exports = {
  analyseDecisions,
  getDecisionContext,
  formatPatternReport,
  detectMissingContext,
};
