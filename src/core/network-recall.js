'use strict';

const fs = require('fs');
const path = require('path');

// ── Network Recall ────────────────────────────────────────────────────────
// "Who in my network knows about X?" — searches person pages for expertise
// and context, and maps relationship connections via shared meetings.

// ── Constants ─────────────────────────────────────────────────────────────

const PEOPLE_INTERNAL = '05-Areas/People/Internal';
const PEOPLE_EXTERNAL = '05-Areas/People/External';
const MEETINGS_DIR = '00-Inbox/Meetings';

// Sections in person pages that signal expertise (weighted higher)
const EXPERTISE_SECTIONS = ['expertise', 'skills', 'role', 'specialties', 'background', 'areas of expertise'];
const CONTEXT_SECTIONS = ['notes', 'context', 'key context', 'meeting history', 'meetings'];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Safely check if a path exists.
 */
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

/**
 * Safely read a file, returning empty string on failure.
 */
function safeRead(filePath, maxBytes) {
  try {
    if (maxBytes) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(maxBytes);
      const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
      fs.closeSync(fd);
      return buf.toString('utf8', 0, bytesRead);
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * List .md files in a directory (non-recursive).
 */
function listMdFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Extract the display name from a filename like "Sarah_Chen.md".
 */
function nameFromFile(filePath) {
  return path.basename(filePath, '.md').replace(/_/g, ' ');
}

/**
 * Extract a frontmatter or header field value.
 */
function extractField(content, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'mi');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Get all person page file paths across internal and external dirs.
 */
function allPersonFiles(vaultPath) {
  return [
    ...listMdFiles(path.join(vaultPath, PEOPLE_INTERNAL)),
    ...listMdFiles(path.join(vaultPath, PEOPLE_EXTERNAL)),
  ];
}

/**
 * Tokenise a topic into searchable keywords.
 */
function topicKeywords(topic) {
  return topic
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Identify which section a line belongs to based on markdown headers.
 */
function classifySection(content) {
  const sections = [];
  let currentSection = 'general';
  const lines = content.split('\n');

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].toLowerCase().trim();
    }
    sections.push({ line, section: currentSection });
  }
  return sections;
}

// ── Scoring ───────────────────────────────────────────────────────────────

/**
 * Score how relevant a person page is to a topic.
 * Returns { score, evidence[] } where score is 0-1 normalised.
 */
function scorePerson(content, keywords) {
  const classified = classifySection(content);
  let score = 0;
  const evidence = [];
  const contentLower = content.toLowerCase();

  for (const kw of keywords) {
    if (!contentLower.includes(kw)) continue;

    for (const { line, section } of classified) {
      const lineLower = line.toLowerCase();
      if (!lineLower.includes(kw)) continue;

      // Weight by section type
      const isExpertise = EXPERTISE_SECTIONS.some(s => section.includes(s));
      const isContext = CONTEXT_SECTIONS.some(s => section.includes(s));

      if (isExpertise) {
        score += 3;
        evidence.push(line.trim().slice(0, 100));
      } else if (isContext) {
        score += 2;
        evidence.push(line.trim().slice(0, 100));
      } else {
        score += 1;
      }
    }
  }

  // Recency bonus: check for recent dates
  const dateMatches = content.match(/\d{4}-\d{2}-\d{2}/g) || [];
  const now = Date.now();
  for (const d of dateMatches) {
    const ts = new Date(d + 'T00:00:00').getTime();
    if (!isNaN(ts)) {
      const daysAgo = (now - ts) / (1000 * 60 * 60 * 24);
      if (daysAgo <= 14) { score += 2; break; }
      if (daysAgo <= 30) { score += 1; break; }
    }
  }

  // Deduplicate evidence
  const uniqueEvidence = [...new Set(evidence)].slice(0, 3);

  return { score, evidence: uniqueEvidence };
}

// ── Expertise Search ──────────────────────────────────────────────────────

/**
 * Search all person pages for people with knowledge/involvement in a topic.
 *
 * @param {string} vaultPath - Absolute path to the Dex vault
 * @param {string} topic - The topic/expertise to search for
 * @returns {Array<{ name: string, role: string, relevance: string, confidence: number }>}
 */
function findExpertise(vaultPath, topic) {
  if (!vaultPath || !topic) return [];

  const files = allPersonFiles(vaultPath);
  if (!files.length) return [];

  const keywords = topicKeywords(topic);
  if (!keywords.length) return [];

  // Phase 1: Quick filename check to prioritise reads
  const candidates = [];

  for (const file of files) {
    const basename = path.basename(file, '.md').toLowerCase();
    const filenameMatch = keywords.some(kw => basename.includes(kw));

    // Read content for all files but prioritise filename matches
    const content = safeRead(file, 8192);
    if (!content) continue;

    const { score, evidence } = scorePerson(content, keywords);
    if (score === 0 && !filenameMatch) continue;

    const finalScore = filenameMatch ? score + 5 : score;
    const name = nameFromFile(file);
    const role = extractField(content, 'Role') || extractField(content, 'role') || '';

    candidates.push({ name, role, score: finalScore, evidence });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Normalise confidence: top scorer = 0.95, scale down from there
  const maxScore = candidates.length ? candidates[0].score : 1;

  return candidates.slice(0, 10).map(c => ({
    name: c.name,
    role: c.role,
    relevance: c.evidence.join('. ') || `Mentioned in their person page`,
    confidence: Math.min(0.95, Math.round((c.score / Math.max(maxScore, 1)) * 100) / 100),
  }));
}

// ── Relationship Map ──────────────────────────────────────────────────────

/**
 * Map who a person is connected to via shared meetings.
 *
 * @param {string} vaultPath - Absolute path to the Dex vault
 * @param {string} personName - Name of the person to map
 * @returns {{ person: string, connections: Array<{ name: string, sharedMeetings: number, lastShared: string, topics: string[] }> }}
 */
function getRelationshipMap(vaultPath, personName) {
  const result = { person: personName, connections: [] };

  if (!vaultPath || !personName) return result;

  const meetDir = path.join(vaultPath, MEETINGS_DIR);
  if (!exists(meetDir)) return result;

  const meetingFiles = listMdFiles(meetDir);
  if (!meetingFiles.length) return result;

  // Build a set of name variants to match
  const nameLower = personName.toLowerCase();
  const firstName = personName.split(/\s+/)[0].toLowerCase();
  const nameVariants = [nameLower, firstName];
  // Also check for underscore variant (e.g., WikiLinks)
  nameVariants.push(personName.replace(/\s+/g, '_').toLowerCase());

  // Gather all known person names for cross-matching
  const allFiles = allPersonFiles(vaultPath);
  const knownPeople = allFiles.map(f => ({
    name: nameFromFile(f),
    nameLower: nameFromFile(f).toLowerCase(),
    firstName: nameFromFile(f).split(' ')[0].toLowerCase(),
    filePath: f,
  })).filter(p => p.nameLower !== nameLower);

  // Scan meetings for co-occurrences
  const connectionMap = new Map(); // personName -> { count, lastDate, topics }

  for (const file of meetingFiles) {
    const content = safeRead(file, 8192);
    const contentLower = content.toLowerCase();

    // Check if our target person is in this meeting
    const personFound = nameVariants.some(v => contentLower.includes(v));
    if (!personFound) continue;

    // Extract date from filename
    const dateMatch = path.basename(file).match(/^(\d{4}-\d{2}-\d{2})/);
    const meetingDate = dateMatch ? dateMatch[1] : '';

    // Extract topic from filename (after date)
    const topicMatch = path.basename(file, '.md').match(/\d{4}-\d{2}-\d{2}\s*[-–]\s*(.+)/);
    const meetingTopic = topicMatch ? topicMatch[1].trim() : '';

    // Check which other known people are also in this meeting
    for (const other of knownPeople) {
      const otherVariants = [other.nameLower, other.firstName, other.nameLower.replace(/\s+/g, '_')];
      const otherFound = otherVariants.some(v => v.length > 2 && contentLower.includes(v));
      if (!otherFound) continue;

      const key = other.name;
      if (!connectionMap.has(key)) {
        connectionMap.set(key, { count: 0, lastDate: '', topics: new Set() });
      }

      const conn = connectionMap.get(key);
      conn.count++;
      if (meetingDate > conn.lastDate) conn.lastDate = meetingDate;
      if (meetingTopic) conn.topics.add(meetingTopic.toLowerCase().slice(0, 40));
    }
  }

  // Convert to sorted array
  result.connections = [...connectionMap.entries()]
    .map(([name, data]) => ({
      name,
      sharedMeetings: data.count,
      lastShared: data.lastDate,
      topics: [...data.topics].slice(0, 5),
    }))
    .sort((a, b) => b.sharedMeetings - a.sharedMeetings)
    .slice(0, 15);

  return result;
}

// ── Display Formatting ────────────────────────────────────────────────────

/**
 * Format expertise search results or relationship map for display.
 *
 * @param {Array|Object} results - Output from findExpertise or getRelationshipMap
 * @param {string} query - Original search query or person name
 * @returns {string}
 */
function formatNetworkResponse(results, query) {
  if (!results) return 'No results found.';

  // Handle relationship map format
  if (results.person && Array.isArray(results.connections)) {
    return formatRelationshipMap(results);
  }

  // Handle expertise results (array)
  if (Array.isArray(results)) {
    return formatExpertiseResults(results, query);
  }

  return 'No results found.';
}

/**
 * Format expertise search results.
 */
function formatExpertiseResults(results, query) {
  if (!results.length) return `No one in your network has clear expertise on "${query}".`;

  const lines = [`**Network expertise: "${query}"**\n`];

  for (const r of results) {
    const confidence = Math.round(r.confidence * 100);
    const roleStr = r.role ? ` (${r.role})` : '';
    lines.push(`- **${r.name}**${roleStr} — ${confidence}% match`);
    if (r.relevance) lines.push(`  ${r.relevance}`);
  }

  return lines.join('\n');
}

/**
 * Format relationship map.
 */
function formatRelationshipMap(result) {
  if (!result.connections.length) {
    return `No shared meetings found for ${result.person}.`;
  }

  const lines = [`**${result.person}'s network** (by shared meetings)\n`];

  for (const c of result.connections) {
    const topicStr = c.topics.length ? ` — topics: ${c.topics.join(', ')}` : '';
    const lastStr = c.lastShared ? ` (last: ${c.lastShared})` : '';
    lines.push(`- **${c.name}**: ${c.sharedMeetings} shared meeting${c.sharedMeetings !== 1 ? 's' : ''}${lastStr}${topicStr}`);
  }

  return lines.join('\n');
}

// ── Module Exports ────────────────────────────────────────────────────────

module.exports = {
  findExpertise,
  getRelationshipMap,
  formatNetworkResponse,
};
