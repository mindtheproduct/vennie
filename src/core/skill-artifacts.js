'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Skill Artifact Chaining ────────────────────────────────────────────────
// Skills produce artifacts (intermediate outputs) that downstream skills
// auto-detect and use as context. Like a pipeline: meeting-prep -> process-meetings,
// daily-plan -> daily-review, etc.

const ARTIFACTS_DIR = '.vennie/artifacts';

// Valid artifact types
const ARTIFACT_TYPES = new Set([
  'prep_doc',
  'meeting_notes',
  'decision_log',
  'task_list',
  'review_summary',
  'brief',
  'analysis',
]);

// Upstream dependency map — which skills feed into which
const SKILL_CHAINS = {
  'process-meetings': ['meeting-prep'],
  'daily-review': ['daily-plan'],
  'week-review': ['week-plan', 'daily-review'],
  'meeting-prep': ['process-meetings'],
  'quarter-review': ['quarter-plan', 'week-review'],
  'career-coach': ['daily-review', 'week-review'],
  'premortem': ['product-brief', 'prd'],
  'office-hours': [],
  'user-interview-prep': ['product-brief'],
};

// How far back to look for upstream artifacts (in days)
const LOOKBACK_DAYS = {
  'daily-plan': 1,
  'daily-review': 1,
  'week-plan': 7,
  'week-review': 30,
  'quarter-plan': 30,
  'quarter-review': 90,
  'meeting-prep': 7,
  'process-meetings': 7,
  'career-coach': 30,
  'office-hours': 7,
  'premortem': 14,
  'user-interview-prep': 14,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureArtifactsDir(vaultPath) {
  const dir = path.join(vaultPath, ARTIFACTS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function daysAgo(dateStr, days) {
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Write a skill artifact to disk.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {object} artifact
 * @param {string} artifact.skill - Skill name (e.g. 'daily-plan')
 * @param {string} artifact.type - Artifact type (e.g. 'prep_doc', 'review_summary')
 * @param {string} artifact.content - The artifact content (full response text)
 * @param {object} [artifact.metadata] - Optional metadata
 * @returns {{ id: string, path: string } | null}
 */
function writeArtifact(vaultPath, artifact) {
  try {
    const dir = ensureArtifactsDir(vaultPath);
    const id = `${artifact.skill}-${todayStr()}-${shortId()}`;
    const filename = `${id}.json`;
    const filePath = path.join(dir, filename);

    const record = {
      id,
      skill: artifact.skill,
      type: artifact.type || 'analysis',
      content: artifact.content,
      metadata: artifact.metadata || {},
      created_at: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
    return { id, path: filePath };
  } catch {
    return null;
  }
}

/**
 * Find artifacts matching a query.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {object} [query]
 * @param {string} [query.skill] - Filter by skill name
 * @param {string} [query.type] - Filter by artifact type
 * @param {string} [query.since] - ISO date string — only artifacts after this date
 * @param {number} [query.limit] - Max results (default 5)
 * @returns {object[]} Matching artifacts sorted by recency (newest first)
 */
function findArtifacts(vaultPath, query = {}) {
  try {
    const dir = path.join(vaultPath, ARTIFACTS_DIR);
    if (!fs.existsSync(dir)) return [];

    const limit = query.limit || 5;
    const sinceDate = query.since || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    })();

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const artifacts = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const artifact = JSON.parse(content);

        // Apply filters
        if (query.skill && artifact.skill !== query.skill) continue;
        if (query.type && artifact.type !== query.type) continue;
        if (artifact.created_at < sinceDate) continue;

        artifacts.push(artifact);
      } catch {
        // Skip malformed artifact files
      }
    }

    // Sort by creation date descending (newest first)
    artifacts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return artifacts.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Get artifacts from upstream skills in the chain.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string} skillName - The currently-running skill
 * @returns {object[]} Upstream artifacts for context injection
 */
function getUpstreamArtifacts(vaultPath, skillName) {
  try {
    const upstreamSkills = SKILL_CHAINS[skillName];
    if (!upstreamSkills || upstreamSkills.length === 0) return [];

    const lookbackDays = LOOKBACK_DAYS[skillName] || 7;
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    const sinceStr = since.toISOString();

    const allArtifacts = [];
    for (const upstream of upstreamSkills) {
      const found = findArtifacts(vaultPath, {
        skill: upstream,
        since: sinceStr,
        limit: 3, // Max 3 per upstream skill
      });
      allArtifacts.push(...found);
    }

    // Sort combined results by date
    allArtifacts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return allArtifacts;
  } catch {
    return [];
  }
}

/**
 * Format artifacts into a prompt section for context injection.
 *
 * @param {object[]} artifacts - Array of artifact objects
 * @returns {string} Formatted prompt section, or empty string if no artifacts
 */
function formatArtifactsForPrompt(artifacts) {
  if (!artifacts || artifacts.length === 0) return '';

  const MAX_CONTENT_LENGTH = 2000;
  const sections = [];

  for (const artifact of artifacts) {
    const date = artifact.created_at.split('T')[0];
    const skillLabel = artifact.skill
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    let content = artifact.content || '';
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.slice(0, MAX_CONTENT_LENGTH) + '\n\n... (truncated)';
    }

    sections.push(`### ${skillLabel} (${date})\n\n${content}`);
  }

  return `## Context from Previous Skills\n\n${sections.join('\n\n---\n\n')}`;
}

/**
 * Remove artifacts older than N days.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {number} [daysToKeep=30] - Remove artifacts older than this
 * @returns {number} Number of artifacts removed
 */
function cleanupOldArtifacts(vaultPath, daysToKeep = 30) {
  try {
    const dir = path.join(vaultPath, ARTIFACTS_DIR);
    if (!fs.existsSync(dir)) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const cutoffStr = cutoff.toISOString();

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    let removed = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const artifact = JSON.parse(content);
        if (artifact.created_at < cutoffStr) {
          fs.unlinkSync(path.join(dir, file));
          removed++;
        }
      } catch {
        // Skip files we can't parse — don't delete unknowns
      }
    }

    return removed;
  } catch {
    return 0;
  }
}

/**
 * Infer the artifact type from a skill name.
 * Used when writing artifacts automatically after skill completion.
 *
 * @param {string} skillName
 * @returns {string} Artifact type
 */
function inferArtifactType(skillName) {
  const typeMap = {
    'meeting-prep': 'prep_doc',
    'process-meetings': 'meeting_notes',
    'daily-plan': 'brief',
    'daily-review': 'review_summary',
    'week-plan': 'brief',
    'week-review': 'review_summary',
    'quarter-plan': 'brief',
    'quarter-review': 'review_summary',
    'career-coach': 'analysis',
    'product-brief': 'brief',
    'project-health': 'analysis',
    'decision-log': 'decision_log',
    'triage': 'task_list',
    'office-hours': 'analysis',
    'premortem': 'analysis',
    'user-interview-prep': 'prep_doc',
  };
  return typeMap[skillName] || 'analysis';
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  writeArtifact,
  findArtifacts,
  getUpstreamArtifacts,
  formatArtifactsForPrompt,
  cleanupOldArtifacts,
  inferArtifactType,
  SKILL_CHAINS,
  ARTIFACT_TYPES,
};
