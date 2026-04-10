'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Keyword → skill map
// ---------------------------------------------------------------------------

const SKILL_KEYWORDS = {
  'cross-functional-leadership': ['led', 'coordinated', 'managed'],
  'system-design':               ['architected', 'designed', 'migrated', 'api', 'system'],
  'execution':                   ['shipped', 'launched', 'deadline', 'on time'],
  'data-driven-decisions':       ['data', 'metrics', 'a/b', 'experiment'],
  'user-research':               ['user research', 'interviews', 'feedback', 'discovery'],
  'product-strategy':            ['roadmap', 'strategy', 'vision', 'prioriti'],
  'stakeholder-management':      ['stakeholder', 'alignment', 'buy-in', 'executive'],
  'people-development':          ['mentor', 'coach', 'grow', 'team'],
  'growth':                      ['revenue', 'growth', 'conversion', 'funnel'],
  'operational-excellence':      ['process', 'workflow', 'automation', 'efficiency'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function titleCase(str) {
  return str
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function monthFile(vaultPath, date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return path.join(vaultPath, '05-Areas', 'Career', 'Evidence', `${yyyy}-${mm}.md`);
}

function parseDate(v) {
  if (!v) return new Date().toISOString().slice(0, 10);
  return typeof v === 'string' ? v : new Date(v).toISOString().slice(0, 10);
}

/**
 * Parse all evidence entries from a single monthly markdown file.
 * Returns an array of shipment-like objects.
 */
function parseEvidenceFile(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const entries = [];
  const headerRe = /^### (.+?): (.+?) \((\d{4}-\d{2}-\d{2})\)/;
  const lines = content.split('\n');
  let current = null;

  for (const line of lines) {
    const hm = line.match(headerRe);
    if (hm) {
      if (current) entries.push(current);
      current = {
        type: hm[1].toLowerCase(),
        title: hm[2],
        date: hm[3],
        description: '',
        impact: '',
        skills: [],
        stakeholders: [],
      };
      continue;
    }

    if (!current) continue;

    const whatMatch = line.match(/^- \*\*What:\*\* (.+)/);
    if (whatMatch) { current.description = whatMatch[1]; continue; }

    const impactMatch = line.match(/^- \*\*Impact:\*\* (.+)/);
    if (impactMatch) { current.impact = impactMatch[1]; continue; }

    const skillsMatch = line.match(/^- \*\*Skills demonstrated:\*\* (.+)/);
    if (skillsMatch) {
      current.skills = skillsMatch[1].split(',').map(s => s.trim().toLowerCase().replace(/ /g, '-'));
      continue;
    }

    const stakeholdersMatch = line.match(/^- \*\*Stakeholders:\*\* (.+)/);
    if (stakeholdersMatch) {
      current.stakeholders = stakeholdersMatch[1].split(',').map(s => s.trim());
      continue;
    }
  }

  if (current) entries.push(current);
  return entries;
}

// ---------------------------------------------------------------------------
// Core exports
// ---------------------------------------------------------------------------

/**
 * Record a shipped feature / milestone as career evidence.
 *
 * @param {string} vaultPath  - Absolute path to the vault root
 * @param {string} description - Short description of what shipped
 * @param {object} [metadata]  - Optional enrichment (impact, skills, stakeholders, date)
 * @returns {{ file: string, entry: string }} Written file path and markdown entry
 */
function captureShipment(vaultPath, description, metadata) {
  if (!vaultPath || !description) {
    throw new Error('vaultPath and description are required');
  }

  const meta = metadata || {};
  const date = parseDate(meta.date);
  const skills = meta.skills && meta.skills.length
    ? meta.skills
    : suggestSkillFromDescription(description);
  const impact = meta.impact || '';
  const stakeholders = meta.stakeholders || [];

  // Derive a short title from description (first ~50 chars, first sentence)
  const title = description.length > 60
    ? description.slice(0, 57).replace(/\s+\S*$/, '') + '...'
    : description;

  const file = monthFile(vaultPath, date);
  ensureDir(path.dirname(file));

  const skillsFormatted = skills.map(titleCase).join(', ');
  const stakeholdersFormatted = stakeholders.join(', ');
  const hasSTAR = !!(impact && skills.length);

  const lines = [
    '',
    `### Shipped: ${title} (${date})`,
    `- **What:** ${description}`,
  ];
  if (impact) lines.push(`- **Impact:** ${impact}`);
  if (skills.length) lines.push(`- **Skills demonstrated:** ${skillsFormatted}`);
  if (stakeholders.length) lines.push(`- **Stakeholders:** ${stakeholdersFormatted}`);
  lines.push(`- **STAR ready:** ${hasSTAR ? 'Yes' : 'Needs impact/skills'}`);
  lines.push('');

  const entry = lines.join('\n');

  // Append-only: create file with header if new, otherwise append
  if (!fs.existsSync(file)) {
    const header = `# Career Evidence — ${date.slice(0, 7)}\n`;
    fs.writeFileSync(file, header + entry, 'utf-8');
  } else {
    fs.appendFileSync(file, entry, 'utf-8');
  }

  return { file, entry: entry.trim() };
}

/**
 * Convert a shipment object into STAR interview format.
 *
 * @param {object} shipment - Object with at least description; optionally impact, skills, stakeholders, title, date
 * @returns {{ situation: string, task: string, action: string, result: string, formatted: string }}
 */
function generateSTARStory(shipment) {
  if (!shipment || !shipment.description) {
    throw new Error('shipment.description is required');
  }

  const title = shipment.title || shipment.description.slice(0, 50);
  const impact = shipment.impact || '[Expand: what measurable outcome resulted?]';
  const skills = shipment.skills || [];
  const stakeholders = shipment.stakeholders || [];
  const stakeholderNote = stakeholders.length
    ? `Worked with ${stakeholders.join(', ')}.`
    : '[Expand: who did you collaborate with?]';

  const situation = `[Context prompt: What was the business/team situation before this work? Why did it matter?] ${shipment.description}`;
  const task = `[Task prompt: What was your specific responsibility? What were you asked or expected to deliver?] ${title}`;
  const action = `[Action prompt: What concrete steps did YOU take? Be specific about your individual contribution.] ${stakeholderNote} ${skills.length ? 'Demonstrated: ' + skills.map(titleCase).join(', ') + '.' : ''}`;
  const result = `[Result prompt: What was the measurable outcome? Use numbers where possible.] ${impact}`;

  const formatted = [
    `## STAR: ${title}`,
    '',
    `**Situation:** ${situation}`,
    '',
    `**Task:** ${task}`,
    '',
    `**Action:** ${action}`,
    '',
    `**Result:** ${result}`,
    '',
  ].join('\n');

  return { situation, task, action, result, formatted };
}

/**
 * Scan all evidence files and return a chronological timeline.
 *
 * @param {string} vaultPath
 * @param {object} [options] - { months: number, skills: string[] }
 * @returns {Array<{ date, type, title, impact, skills }>}
 */
function getCareerTimeline(vaultPath, options) {
  const opts = options || {};
  const evidenceDir = path.join(vaultPath, '05-Areas', 'Career', 'Evidence');

  if (!fs.existsSync(evidenceDir)) return [];

  const files = fs.readdirSync(evidenceDir)
    .filter(f => /^\d{4}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  let entries = [];

  for (const file of files) {
    const parsed = parseEvidenceFile(path.join(evidenceDir, file));
    entries = entries.concat(parsed);
  }

  // Sort by date descending
  entries.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  // Filter by months
  if (opts.months) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - opts.months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    entries = entries.filter(e => e.date >= cutoffStr);
  }

  // Filter by skills
  if (opts.skills && opts.skills.length) {
    const target = new Set(opts.skills.map(s => s.toLowerCase()));
    entries = entries.filter(e =>
      e.skills.some(sk => target.has(sk))
    );
  }

  return entries.map(e => ({
    date: e.date,
    type: e.type || 'shipment',
    title: e.title,
    impact: e.impact,
    skills: e.skills,
  }));
}

/**
 * Aggregate all evidence by skill into a matrix.
 *
 * @param {string} vaultPath
 * @returns {Object<string, { count: number, lastDemonstrated: string, examples: string[] }>}
 */
function getSkillMatrix(vaultPath) {
  const timeline = getCareerTimeline(vaultPath);
  const matrix = {};

  for (const entry of timeline) {
    for (const skill of entry.skills) {
      if (!matrix[skill]) {
        matrix[skill] = { count: 0, lastDemonstrated: '', examples: [] };
      }
      matrix[skill].count += 1;
      if (!matrix[skill].lastDemonstrated || entry.date > matrix[skill].lastDemonstrated) {
        matrix[skill].lastDemonstrated = entry.date;
      }
      matrix[skill].examples.push(entry.title);
    }
  }

  return matrix;
}

/**
 * Infer likely skills from a free-text description.
 *
 * @param {string} description
 * @returns {string[]} Skill slugs
 */
function suggestSkillFromDescription(description) {
  if (!description) return [];

  const lower = description.toLowerCase();
  const matched = new Set();

  for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.add(skill);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Format a human-readable career summary from timeline and skill matrix.
 *
 * @param {Array} timeline  - Output of getCareerTimeline
 * @param {Object} matrix   - Output of getSkillMatrix
 * @returns {string} Markdown-formatted summary
 */
function formatCareerSummary(timeline, matrix) {
  const lines = ['# Career Summary', ''];

  // Top skills
  const sortedSkills = Object.entries(matrix)
    .sort((a, b) => b[1].count - a[1].count);

  if (sortedSkills.length) {
    lines.push('## Top Skills');
    lines.push('');
    for (const [skill, data] of sortedSkills) {
      lines.push(`- **${titleCase(skill)}** — ${data.count} demonstration${data.count === 1 ? '' : 's'} (last: ${data.lastDemonstrated})`);
    }
    lines.push('');
  }

  // Timeline
  if (timeline.length) {
    lines.push('## Recent Shipments');
    lines.push('');
    for (const entry of timeline) {
      const skillTags = entry.skills.length
        ? ` [${entry.skills.map(titleCase).join(', ')}]`
        : '';
      const impactNote = entry.impact ? ` — ${entry.impact}` : '';
      lines.push(`- **${entry.date}** ${entry.title}${impactNote}${skillTags}`);
    }
    lines.push('');
  }

  if (!sortedSkills.length && !timeline.length) {
    lines.push('No career evidence captured yet. Use `captureShipment()` to start building your narrative.');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  captureShipment,
  generateSTARStory,
  getCareerTimeline,
  getSkillMatrix,
  suggestSkillFromDescription,
  formatCareerSummary,
};
