'use strict';

const fs = require('fs');
const path = require('path');

// ── Stakeholder Simulation ────────────────────────────────────────────────
// Build system prompt overlays that let Claude roleplay as known stakeholders
// based on accumulated vault context: person pages, meeting notes, company
// pages, and observed communication patterns.

// ── Constants ─────────────────────────────────────────────────────────────

const PEOPLE_DIR = '05-Areas/People';
const INTERNAL_DIR = path.join(PEOPLE_DIR, 'Internal');
const EXTERNAL_DIR = path.join(PEOPLE_DIR, 'External');
const MEETINGS_DIR = '00-Inbox/Meetings';
const COMPANIES_DIR = '05-Areas/Companies';

// Minimum thresholds for simulation confidence
const HIGH_CONFIDENCE_MEETINGS = 8;
const MEDIUM_CONFIDENCE_MEETINGS = 3;
const HIGH_CONFIDENCE_PAGE_LENGTH = 1500; // characters
const MEDIUM_CONFIDENCE_PAGE_LENGTH = 400;

// ── Name Matching ─────────────────────────────────────────────────────────

/**
 * Normalise a name for fuzzy comparison — lowercase, strip underscores,
 * collapse whitespace.
 */
function normaliseName(name) {
  return name
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\.md$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check whether a query fuzzy-matches a filename.
 * Handles: "sarah" → "Sarah_Chen.md", "sarah chen" → "Sarah_Chen.md",
 * "Chen" → "Sarah_Chen.md".
 */
function nameMatches(query, filename) {
  const normQuery = normaliseName(query);
  const normFile = normaliseName(filename);

  // Exact match
  if (normFile === normQuery) return true;

  // Query is a substring of the filename
  if (normFile.includes(normQuery)) return true;

  // All query tokens appear in the filename
  const queryTokens = normQuery.split(' ').filter(Boolean);
  const fileTokens = normFile.split(' ').filter(Boolean);
  if (queryTokens.length > 0 && queryTokens.every(qt => fileTokens.some(ft => ft.includes(qt)))) {
    return true;
  }

  return false;
}

// ── File Utilities ────────────────────────────────────────────────────────

/**
 * List markdown files in a directory (non-recursive). Returns [] if dir
 * doesn't exist.
 */
function listMdFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Safely read a file, returning empty string on failure.
 */
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Search for a person page across Internal and External people dirs.
 * Returns { filePath, content, location } or null.
 */
function findPersonPage(vaultPath, personName) {
  const dirs = [
    { dir: path.join(vaultPath, INTERNAL_DIR), location: 'Internal' },
    { dir: path.join(vaultPath, EXTERNAL_DIR), location: 'External' },
    // Fallback: flat People dir (some vaults skip Internal/External split)
    { dir: path.join(vaultPath, PEOPLE_DIR), location: 'People' },
  ];

  for (const { dir, location } of dirs) {
    const files = listMdFiles(dir);
    for (const file of files) {
      if (nameMatches(personName, file)) {
        const filePath = path.join(dir, file);
        return {
          filePath,
          content: safeRead(filePath),
          location,
          filename: file,
        };
      }
    }
  }

  return null;
}

// ── Person Page Parsing ───────────────────────────────────────────────────

/**
 * Extract structured fields from a person page's markdown content.
 */
function parsePersonPage(content) {
  const result = {
    role: '',
    company: '',
    communicationStyle: '',
    priorities: [],
    concerns: [],
    relationshipNotes: '',
    rawSections: {},
  };

  if (!content) return result;

  // Extract YAML frontmatter fields
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const roleMatch = fm.match(/(?:role|title):\s*(.+)/i);
    if (roleMatch) result.role = roleMatch[1].trim().replace(/^['"]|['"]$/g, '');
    const compMatch = fm.match(/company:\s*(.+)/i);
    if (compMatch) result.company = compMatch[1].trim().replace(/^['"]|['"]$/g, '');
  }

  // Also try inline role/company if frontmatter didn't have them
  if (!result.role) {
    const inlineRole = content.match(/\*\*(?:Role|Title)\*\*[:\s]+(.+)/i) ||
                       content.match(/^(?:Role|Title)[:\s]+(.+)/im);
    if (inlineRole) result.role = inlineRole[1].trim();
  }
  if (!result.company) {
    const inlineCo = content.match(/\*\*Company\*\*[:\s]+(.+)/i) ||
                     content.match(/^Company[:\s]+(.+)/im);
    if (inlineCo) result.company = inlineCo[1].trim();
  }

  // Parse markdown sections
  const sectionRegex = /^##\s+(.+)/gm;
  let match;
  const sectionStarts = [];
  while ((match = sectionRegex.exec(content)) !== null) {
    sectionStarts.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i].index;
    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].index : content.length;
    const title = sectionStarts[i].title.toLowerCase();
    const body = content.slice(start, end).replace(/^##\s+.+\n/, '').trim();
    result.rawSections[sectionStarts[i].title] = body;

    if (title.includes('communication') || title.includes('style')) {
      result.communicationStyle = body;
    }
    if (title.includes('priorit') || title.includes('goal') || title.includes('focus')) {
      result.priorities = extractBullets(body);
    }
    if (title.includes('concern') || title.includes('objection') || title.includes('pushback')) {
      result.concerns = extractBullets(body);
    }
    if (title.includes('relationship') || title.includes('context') || title.includes('notes')) {
      result.relationshipNotes += (result.relationshipNotes ? '\n' : '') + body;
    }
  }

  return result;
}

/**
 * Extract bullet points from a markdown section body.
 */
function extractBullets(text) {
  return text
    .split('\n')
    .filter(line => /^\s*[-*]\s/.test(line))
    .map(line => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

// ── Meeting Extraction ────────────────────────────────────────────────────

/**
 * Search meeting files for mentions of a person. Returns an array of
 * { date, title, excerpts[] }.
 */
function findMeetingMentions(vaultPath, personName) {
  const meetingsDir = path.join(vaultPath, MEETINGS_DIR);
  const files = listMdFiles(meetingsDir);
  const mentions = [];
  const normQuery = normaliseName(personName);
  const queryTokens = normQuery.split(' ').filter(Boolean);

  for (const file of files) {
    const content = safeRead(path.join(meetingsDir, file));
    if (!content) continue;

    const contentLower = content.toLowerCase();
    // Check if any name token appears (first name, last name, or full name)
    const mentioned = queryTokens.some(token => contentLower.includes(token));
    if (!mentioned) continue;

    // Extract date from filename (YYYY-MM-DD prefix)
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';

    // Extract title from filename
    const title = file
      .replace(/^\d{4}-\d{2}-\d{2}\s*-?\s*/, '')
      .replace(/\.md$/, '')
      .trim() || file;

    // Pull relevant lines — lines mentioning the person plus surrounding context
    const lines = content.split('\n');
    const excerpts = [];
    for (let i = 0; i < lines.length; i++) {
      const lineLower = lines[i].toLowerCase();
      if (queryTokens.some(t => lineLower.includes(t))) {
        // Grab this line and up to 1 line after for context
        const snippet = lines.slice(i, Math.min(i + 2, lines.length)).join(' ').trim();
        if (snippet && snippet.length > 10) {
          excerpts.push(snippet);
        }
        if (excerpts.length >= 5) break; // cap excerpts per meeting
      }
    }

    mentions.push({ date, title, excerpts });
  }

  // Sort by date descending (most recent first)
  mentions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return mentions;
}

// ── Communication Style Inference ─────────────────────────────────────────

/**
 * Infer communication style from meeting excerpts when the person page
 * doesn't have an explicit style section.
 */
function inferCommunicationStyle(excerpts) {
  const all = excerpts.join(' ').toLowerCase();
  const traits = [];

  // Data-driven indicators
  if (/\b(data|metric|number|percent|benchmark|kpi|roi)\b/.test(all)) {
    traits.push('Data-driven — asks for metrics and evidence');
  }

  // Directness indicators
  if (/\b(need to|must|won't|can't|don't|no way|non-negotiable)\b/.test(all)) {
    traits.push('Direct — states positions clearly');
  }

  // Caution / risk indicators
  if (/\b(risk|concern|careful|worried|cautious|hesitant|timeline|deadline)\b/.test(all)) {
    traits.push('Risk-aware — raises concerns about timelines and risks');
  }

  // Supportive indicators
  if (/\b(great|love|excited|amazing|support|agree|let's do|sounds good)\b/.test(all)) {
    traits.push('Supportive — enthusiastic about ideas they believe in');
  }

  // Strategic indicators
  if (/\b(strategy|long.term|roadmap|vision|priority|quarter|annual)\b/.test(all)) {
    traits.push('Strategic thinker — focuses on long-term direction');
  }

  // Questioning style
  if (/\b(why|how|what if|have we considered|what about)\b/.test(all)) {
    traits.push('Inquisitive — probes with questions');
  }

  return traits.length > 0 ? traits : ['Not enough data to infer style — adapt as conversation progresses'];
}

/**
 * Extract notable statements, pushbacks, and positions from meeting excerpts.
 */
function extractNotableStatements(meetings) {
  const statements = [];

  for (const meeting of meetings.slice(0, 15)) { // cap to recent meetings
    for (const excerpt of meeting.excerpts) {
      // Pushback patterns
      if (/\b(pushed back|disagree|concern|won't work|too aggressive|not ready|blocked|risk)\b/i.test(excerpt)) {
        statements.push({
          date: meeting.date,
          type: 'pushback',
          text: truncate(excerpt, 200),
        });
      }
      // Support patterns
      else if (/\b(support|agree|love|great idea|let's do|on board|excited)\b/i.test(excerpt)) {
        statements.push({
          date: meeting.date,
          type: 'support',
          text: truncate(excerpt, 200),
        });
      }
      // Commitments / action items
      else if (/\b(will|action|follow.up|take.away|commit|promise|deliver)\b/i.test(excerpt)) {
        statements.push({
          date: meeting.date,
          type: 'commitment',
          text: truncate(excerpt, 200),
        });
      }
    }
  }

  return statements.slice(0, 15); // cap total notable statements
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// ── Company Context ───────────────────────────────────────────────────────

/**
 * Find a company page matching the given company name.
 */
function findCompanyContext(vaultPath, companyName) {
  if (!companyName) return '';
  const companiesDir = path.join(vaultPath, COMPANIES_DIR);
  const files = listMdFiles(companiesDir);

  for (const file of files) {
    if (nameMatches(companyName, file)) {
      const content = safeRead(path.join(companiesDir, file));
      // Extract just the first few sections for context
      const lines = content.split('\n').slice(0, 60);
      return lines.join('\n').trim();
    }
  }

  return '';
}

// ── Confidence Scoring ────────────────────────────────────────────────────

/**
 * Calculate simulation confidence based on available data richness.
 */
function assessConfidence(pageContent, meetingCount) {
  const pageLength = (pageContent || '').length;

  if (meetingCount >= HIGH_CONFIDENCE_MEETINGS && pageLength >= HIGH_CONFIDENCE_PAGE_LENGTH) {
    return 'high';
  }
  if (meetingCount >= MEDIUM_CONFIDENCE_MEETINGS || pageLength >= MEDIUM_CONFIDENCE_PAGE_LENGTH) {
    return 'medium';
  }
  return 'low';
}

// ── Prompt Building ───────────────────────────────────────────────────────

/**
 * Format the display name from a filename.
 */
function displayName(filename) {
  return filename
    .replace(/\.md$/, '')
    .replace(/_/g, ' ');
}

/**
 * Build the complete simulation session prompt.
 */
function buildSessionPrompt(person, meetings, companyContext, confidence) {
  const name = person.displayName;
  const role = person.parsed.role || 'Unknown role';
  const company = person.parsed.company || person.location;
  const meetingCount = meetings.length;
  const allExcerpts = meetings.flatMap(m => m.excerpts);

  // Communication style: prefer explicit, fall back to inferred
  let styleLines;
  if (person.parsed.communicationStyle) {
    styleLines = person.parsed.communicationStyle.split('\n').filter(Boolean).map(l => `- ${l.replace(/^[-*]\s*/, '')}`);
  } else {
    styleLines = inferCommunicationStyle(allExcerpts).map(t => `- ${t}`);
  }

  // Priorities
  let priorityLines = person.parsed.priorities.length > 0
    ? person.parsed.priorities.map(p => `- ${p}`)
    : ['- No explicit priorities recorded — infer from meeting context'];

  // Notable statements from meetings
  const notable = extractNotableStatements(meetings);
  let meetingHistoryLines = '';
  if (notable.length > 0) {
    meetingHistoryLines = notable.map(s => {
      const datePrefix = s.date ? `[${s.date}]` : '[undated]';
      const typeLabel = s.type === 'pushback' ? 'Pushed back' : s.type === 'support' ? 'Supportive' : 'Committed';
      return `- ${datePrefix} ${typeLabel}: ${s.text}`;
    }).join('\n');
  } else if (meetingCount > 0) {
    // Fall back to raw excerpts from recent meetings
    meetingHistoryLines = meetings.slice(0, 8).map(m => {
      const datePrefix = m.date ? `[${m.date}]` : '[undated]';
      const excerpt = m.excerpts[0] ? truncate(m.excerpts[0], 150) : m.title;
      return `- ${datePrefix} ${m.title}: ${excerpt}`;
    }).join('\n');
  }

  // Typical objections / concerns
  let objectionLines;
  if (person.parsed.concerns.length > 0) {
    objectionLines = person.parsed.concerns.map(c => `- ${c}`).join('\n');
  } else {
    // Infer from pushback patterns
    const pushbacks = notable.filter(s => s.type === 'pushback');
    if (pushbacks.length > 0) {
      objectionLines = pushbacks.slice(0, 5).map(p => `- ${p.text}`).join('\n');
    } else {
      objectionLines = '- No recorded objections — treat cautiously until patterns emerge';
    }
  }

  // Relationship notes
  const relNotes = person.parsed.relationshipNotes
    ? `\n**Relationship context:**\n${person.parsed.relationshipNotes}\n`
    : '';

  // Company context
  const companyBlock = companyContext
    ? `\n**Company context (${company}):**\n${truncate(companyContext, 600)}\n`
    : '';

  // Data provenance
  const contextNotes = meetingCount > 0
    ? `Based on ${meetingCount} meeting${meetingCount !== 1 ? 's' : ''} and person page context.`
    : 'Based on person page context only (no meeting notes found).';

  const confidenceNote = confidence === 'low'
    ? '\n> **Note:** Limited data available for this person. Simulation is approximate — lean on general archetype for their role.'
    : '';

  const prompt = `## Stakeholder Simulation: ${name} (${role})

You are now roleplaying as ${name}. Stay in character.
${confidenceNote}

**Who you are:**
- ${role} at ${company}
- Known priorities:
${priorityLines.join('\n')}
- Communication style:
${styleLines.join('\n')}
${relNotes}${companyBlock}
**What you've said in past meetings:**
${meetingHistoryLines || '- No meeting excerpts available'}

**Your typical objections:**
${objectionLines}

**Instructions:**
Stay in character as ${name}. Respond as they would based on everything above.
Push back where they would push back. Support what they would support.
Reference specific past interactions when relevant.
If the user asks you to break character or says "drop the act", step out and summarise what you observed.

*${contextNotes}*`;

  return prompt;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Build simulation context for a single stakeholder.
 *
 * @param {string} vaultPath - Absolute path to the vault root.
 * @param {string} personName - Name to search for (fuzzy matched).
 * @returns {{ found: boolean, personName: string, role: string, company: string, context: string, sessionPrompt: string }}
 */
function buildSimulationContext(vaultPath, personName) {
  const page = findPersonPage(vaultPath, personName);

  if (!page) {
    return {
      found: false,
      personName,
      role: '',
      company: '',
      context: `No person page found for "${personName}". Check 05-Areas/People/ for available stakeholders.`,
      sessionPrompt: '',
    };
  }

  const parsed = parsePersonPage(page.content);
  const dName = displayName(page.filename);
  const meetings = findMeetingMentions(vaultPath, dName);
  const companyCtx = findCompanyContext(vaultPath, parsed.company);
  const confidence = assessConfidence(page.content, meetings.length);

  const person = {
    displayName: dName,
    parsed,
    location: page.location,
  };

  const sessionPrompt = buildSessionPrompt(person, meetings, companyCtx, confidence);

  // Build a shorter context summary for embedding in other prompts
  const contextParts = [
    `**${dName}** — ${parsed.role || 'Unknown role'}`,
    parsed.company ? `Company: ${parsed.company}` : '',
    `Meetings found: ${meetings.length}`,
    `Confidence: ${confidence}`,
    parsed.communicationStyle ? `Style: ${truncate(parsed.communicationStyle, 200)}` : '',
    parsed.priorities.length > 0 ? `Priorities: ${parsed.priorities.join('; ')}` : '',
  ].filter(Boolean);

  return {
    found: true,
    personName: dName,
    role: parsed.role || '',
    company: parsed.company || page.location,
    context: contextParts.join('\n'),
    sessionPrompt,
  };
}

/**
 * List people with enough context for meaningful simulation.
 *
 * @param {string} vaultPath - Absolute path to the vault root.
 * @returns {Array<{ name: string, role: string, meetingCount: number, confidence: string }>}
 */
function listSimulatableStakeholders(vaultPath) {
  const dirs = [
    path.join(vaultPath, INTERNAL_DIR),
    path.join(vaultPath, EXTERNAL_DIR),
    path.join(vaultPath, PEOPLE_DIR),
  ];

  const seen = new Set();
  const results = [];

  for (const dir of dirs) {
    const files = listMdFiles(dir);
    for (const file of files) {
      // Skip if we already processed this filename (People/ fallback overlap)
      if (seen.has(file)) continue;
      seen.add(file);

      const filePath = path.join(dir, file);
      const content = safeRead(filePath);
      const parsed = parsePersonPage(content);
      const dName = displayName(file);
      const meetings = findMeetingMentions(vaultPath, dName);
      const confidence = assessConfidence(content, meetings.length);

      // Only include people with at least low-medium context
      if (confidence === 'low' && meetings.length === 0 && content.length < 200) {
        continue;
      }

      results.push({
        name: dName,
        role: parsed.role || '',
        meetingCount: meetings.length,
        confidence,
      });
    }
  }

  // Sort: high confidence first, then by meeting count
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => {
    const co = (confidenceOrder[a.confidence] || 3) - (confidenceOrder[b.confidence] || 3);
    if (co !== 0) return co;
    return b.meetingCount - a.meetingCount;
  });

  return results;
}

/**
 * Build combined simulation context for a group of stakeholders (e.g., exec
 * review, leadership team meeting).
 *
 * @param {string} vaultPath - Absolute path to the vault root.
 * @param {string[]} personNames - Array of names to simulate.
 * @returns {{ found: boolean, participants: Array, sessionPrompt: string }}
 */
function runGroupSimulation(vaultPath, personNames) {
  const participants = [];
  const individualPrompts = [];
  const missing = [];

  for (const name of personNames) {
    const sim = buildSimulationContext(vaultPath, name);
    if (sim.found) {
      participants.push({
        name: sim.personName,
        role: sim.role,
        company: sim.company,
      });
      individualPrompts.push(sim.sessionPrompt);
    } else {
      missing.push(name);
    }
  }

  if (participants.length === 0) {
    return {
      found: false,
      participants: [],
      sessionPrompt: `No person pages found for: ${personNames.join(', ')}. Check 05-Areas/People/ for available stakeholders.`,
    };
  }

  const roster = participants.map(p => `- **${p.name}** (${p.role || 'Unknown role'}${p.company ? `, ${p.company}` : ''})`).join('\n');
  const missingNote = missing.length > 0
    ? `\n> **Missing:** No data found for ${missing.join(', ')}. They will not be simulated.\n`
    : '';

  const groupPrompt = `## Group Stakeholder Simulation

You are simulating a meeting with the following participants:
${roster}
${missingNote}
**Instructions:**
- When the user presents something, respond AS EACH PERSON IN TURN.
- Label each response with the person's name in bold (e.g., **Sarah Chen:**).
- Each person should react according to their individual profile below.
- People may agree, disagree, or build on each other's points.
- Maintain distinct voices — don't homogenise responses.
- If the user addresses a specific person, only that person responds.
- To end the simulation, the user says "drop the act" or "break character".

---

${individualPrompts.join('\n\n---\n\n')}`;

  return {
    found: true,
    participants,
    sessionPrompt: groupPrompt,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  buildSimulationContext,
  listSimulatableStakeholders,
  runGroupSimulation,
};
