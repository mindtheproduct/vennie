'use strict';

const fs = require('fs');
const path = require('path');
const { detectRedTeamOpportunity } = require('./red-team');
const { getCommitmentsForPerson } = require('./commitments');
const { shouldShowTrigger } = require('./feedback-signals');

// ── Proactive Trigger Detection ──────────────────────────────────────────
// Scans conversation context and vault state to detect situations where
// Vennie can proactively offer help. Pure local heuristics — no API calls.
//
// Returns max 2 triggers per response, prioritised by relevance.

// ── Trigger Patterns ────────────────────────────────────────────────────

const DECISION_PATTERNS = [
  /\bdecided to\b/i, /\bgoing with\b/i, /\bchose\b/i,
  /\bthe plan is\b/i, /\bwe agreed\b/i, /\bwe['']?ll go with\b/i,
  /\bdecision is\b/i, /\bfinal call\b/i, /\bbet on\b/i,
  /\bcommitting to\b/i,
];

const WIN_PATTERNS = [
  /\bshipped\b/i, /\blaunched\b/i, /\bcompleted\b/i,
  /\bhit the target\b/i, /\bexceeded\b/i, /\bpromoted\b/i,
  /\bgot the offer\b/i, /\bwon the deal\b/i, /\bclosed the deal\b/i,
  /\bhit our goal\b/i, /\bbeat the deadline\b/i, /\bsigned the contract\b/i,
];

const TASK_PATTERNS = [
  /\bneed to\b/i, /\bshould\b/i, /\bhave to\b/i,
  /\bdon['']?t forget\b/i, /\bremind me\b/i, /\btodo\b/i,
  /\baction item\b/i, /\bmake sure (?:to|we)\b/i, /\bfollow up on\b/i,
];

const MEETING_PATTERNS = [
  /\bmeeting with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\bcall with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\b1:1 with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\bsync with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\bchat with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\bone-on-one with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
];

// Capitalized phrases that aren't people names
const NAME_BLOCKLIST = new Set([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'New York', 'San Francisco', 'Los Angeles', 'United States', 'United Kingdom',
  'North America', 'South America', 'Product Manager', 'Vice President',
  'General Manager', 'Chief Executive', 'Chief Technology', 'Chief Product',
  'Human Resources', 'Customer Success', 'Open Source', 'Machine Learning',
  'Deep Learning', 'Action Items', 'Next Steps', 'Key Points',
  'Happy Monday', 'Good Morning', 'Good Afternoon', 'Good Evening',
  'Thank You', 'Well Done', 'Great Job', 'Google Docs', 'Google Sheets',
  'Pull Request', 'Code Review', 'Data Science', 'Project Manager',
  'Mind Product', 'Mind The', 'The Product',
  // Greeting + name false positives (e.g. "Hey Sean" → "Hey" is capitalized at sentence start)
  'Hey There', 'Hi There', 'Hello There',
]);

// Words that get capitalized at sentence start but aren't first names
const GREETING_PREFIXES = new Set([
  'hey', 'hi', 'hello', 'thanks', 'cheers', 'sure', 'yeah', 'yes', 'no',
  'ok', 'okay', 'great', 'good', 'nice', 'cool', 'awesome', 'perfect',
  'sounds', 'looks', 'seems', 'also', 'but', 'and', 'the', 'this', 'that',
  'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could',
  'would', 'should', 'will', 'just', 'let', 'well', 'so', 'oh', 'ah',
]);

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract capitalized multi-word names from text.
 * @param {string} text
 * @param {Set<string>} [excludeNames] - Names to exclude (e.g. the user's own name)
 */
function extractNames(text, excludeNames) {
  if (!text) return [];
  const nameRe = /\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20})\b/g;
  const names = new Set();
  let match;
  while ((match = nameRe.exec(text)) !== null) {
    const candidate = match[1];
    if (NAME_BLOCKLIST.has(candidate)) continue;
    // Filter out "Hey Sean" / "Hi Sarah" style false positives
    const firstWord = candidate.split(/\s+/)[0].toLowerCase();
    if (GREETING_PREFIXES.has(firstWord)) continue;
    // Filter out user's own name
    if (excludeNames && excludeNames.has(candidate.toLowerCase())) continue;
    names.add(candidate);
  }
  return [...names];
}

/**
 * Check if a person page exists in the vault.
 */
function personPageExists(name, vaultPath) {
  if (!vaultPath) return true; // can't check, assume exists
  const filename = name.replace(/\s+/g, '_') + '.md';
  const internal = path.join(vaultPath, '05-Areas', 'People', 'Internal', filename);
  const external = path.join(vaultPath, '05-Areas', 'People', 'External', filename);
  const flat = path.join(vaultPath, '05-Areas', 'People', filename);
  return fs.existsSync(internal) || fs.existsSync(external) || fs.existsSync(flat);
}

/**
 * Extract the first sentence containing a pattern match.
 */
function extractMatchingSentence(text, patterns) {
  const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 8);
  for (const sentence of sentences) {
    for (const pattern of patterns) {
      if (pattern.test(sentence)) {
        return sentence.length > 120 ? sentence.slice(0, 117) + '...' : sentence;
      }
    }
  }
  return null;
}

// ── Trigger priorities (lower = higher priority) ────────────────────────

const PRIORITY = {
  meeting_reference: 1,
  decision_detected: 2,
  commitment_followup: 3,
  win_detected: 4,
  person_detected: 5,
  task_detected: 6,
  stuck_circular: 7,
  red_team_opportunity: 8,
};

// ── Main Detection ──────────────────────────────────────────────────────

/**
 * Detect proactive triggers from conversation context.
 *
 * @param {string} userMessage - The user's latest message
 * @param {string} responseText - Vennie's full response text
 * @param {string} vaultPath - Path to the Dex vault (or null)
 * @param {object} [options]
 * @param {object} [options.tracker] - ConversationTracker instance
 * @param {string} [options.userName] - User's own name to exclude from person detection
 * @returns {{ type: string, name?: string, action: string, prompt: string, priority: number }[]}
 */
function detectProactiveTriggers(userMessage, responseText, vaultPath, options = {}) {
  const triggers = [];
  const combined = `${userMessage || ''}\n${responseText || ''}`;
  const { tracker, userName } = options;

  // Build exclusion set from user's name (full name + first name + last name)
  const excludeNames = new Set();
  if (userName) {
    excludeNames.add(userName.toLowerCase());
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) {
      excludeNames.add(parts[0].toLowerCase()); // first name alone
    }
  }

  // 1. Person mention without page
  const names = extractNames(combined, excludeNames);
  for (const name of names) {
    if (!personPageExists(name, vaultPath)) {
      triggers.push({
        type: 'person_detected',
        name,
        action: `${name} doesn't have a page yet — want me to create one?`,
        prompt: `Create a person page for ${name}`,
        priority: PRIORITY.person_detected,
      });
      break; // only surface one person per response
    }
  }

  // 2. Decision detected
  const decisionSentence = extractMatchingSentence(combined, DECISION_PATTERNS);
  if (decisionSentence) {
    triggers.push({
      type: 'decision_detected',
      action: 'Sounds like a decision was made — want me to log it?',
      prompt: `Log this decision: ${decisionSentence}`,
      priority: PRIORITY.decision_detected,
    });
  }

  // 3. Win/achievement detected — only scan USER message (AI response talks about "launched" etc. in analysis context)
  const winSentence = extractMatchingSentence(userMessage || '', WIN_PATTERNS);
  if (winSentence) {
    triggers.push({
      type: 'win_detected',
      action: 'That sounds like a win — want me to capture it as evidence?',
      prompt: `Capture this win: ${winSentence}`,
      priority: PRIORITY.win_detected,
    });
  }

  // 4. Task/commitment detected — only scan USER message to avoid false positives from AI suggestions
  const taskSentence = extractMatchingSentence(userMessage || '', TASK_PATTERNS);
  if (taskSentence) {
    triggers.push({
      type: 'task_detected',
      action: 'Spotted a potential task — want me to create it?',
      prompt: `Create a task: ${taskSentence}`,
      priority: PRIORITY.task_detected,
    });
  }

  // 5. Meeting reference with a name
  for (const pattern of MEETING_PATTERNS) {
    const match = combined.match(pattern);
    if (match) {
      const meetingName = match[1];
      triggers.push({
        type: 'meeting_reference',
        name: meetingName,
        action: `Meeting with ${meetingName} — want me to prep or capture notes?`,
        prompt: `Prepare for meeting with ${meetingName}`,
        priority: PRIORITY.meeting_reference,
      });
      break;
    }
  }

  // 6. Commitment follow-up — when a person with overdue commitments is mentioned
  if (vaultPath) {
    try {
      const mentionedNames = extractNames(combined, excludeNames);
      for (const name of mentionedNames) {
        const firstName = name.split(/\s+/)[0];
        const commitments = getCommitmentsForPerson(vaultPath, firstName);
        if (commitments.length > 0) {
          const c = commitments[0]; // most relevant
          const todayStr = new Date().toISOString().split('T')[0];
          const isOverdue = c.due && c.due < todayStr;
          if (isOverdue || commitments.length >= 2) {
            const daysSince = isOverdue
              ? Math.ceil((Date.now() - new Date(c.due + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000))
              : null;
            let action;
            if (c.owner === 'self') {
              action = isOverdue
                ? `You owe ${c.person || firstName} "${c.text.slice(0, 40)}" (${daysSince}d overdue) — want to tackle that now?`
                : `You have ${commitments.length} open commitments with ${firstName} — need a reminder?`;
            } else {
              action = isOverdue
                ? `${c.person || firstName} was supposed to "${c.text.slice(0, 40)}" — ${daysSince}d overdue. Worth a nudge?`
                : `${firstName} has ${commitments.length} open commitments to you. Following up?`;
            }
            triggers.push({
              type: 'commitment_followup',
              name: firstName,
              action,
              prompt: `/commitments`,
              priority: PRIORITY.commitment_followup,
            });
            break; // one commitment trigger per response
          }
        }
      }
    } catch {
      // Non-critical — never block for commitment lookup
    }
  }

  // 7. Stuck/circular — needs tracker
  if (tracker && tracker.isCircular()) {
    triggers.push({
      type: 'stuck_circular',
      action: 'We might be going in circles — want to try a structured approach?',
      prompt: 'Help me think through this systematically with a framework',
      priority: PRIORITY.stuck_circular,
    });
  }

  // 7. Red team opportunity — big decisions worth stress-testing
  try {
    const redTeam = detectRedTeamOpportunity(responseText || '');
    if (redTeam.shouldSuggest) {
      triggers.push({
        type: 'red_team_opportunity',
        action: "That's a big call — want to stress-test it with /red-team?",
        prompt: '/red-team',
        priority: PRIORITY.red_team_opportunity,
      });
    }
  } catch {
    // Red team detection failed — skip silently
  }

  // Sort by priority (lower number = more relevant), take max 2
  triggers.sort((a, b) => a.priority - b.priority);

  // Filter out triggers the user consistently ignores (feedback-driven suppression)
  const filtered = triggers.filter(t => {
    try {
      const decision = shouldShowTrigger(vaultPath, t.type);
      return decision.show;
    } catch {
      return true; // On error, show the trigger
    }
  });

  return filtered.slice(0, 2);
}

/**
 * Format a trigger as a user-facing nudge string.
 * @param {{ type: string, action: string }} trigger
 * @returns {string}
 */
function formatTriggerNudge(trigger) {
  return `\u{1F4A1} ${trigger.action}`;
}

module.exports = { detectProactiveTriggers, formatTriggerNudge };
