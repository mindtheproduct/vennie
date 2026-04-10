#!/usr/bin/env node
/**
 * evidence-capture.cjs — PostToolUse hook (after Write)
 *
 * When files are written to 06-Evidence/, this hook:
 * 1. Extracts: type (win/learning/feedback), date, skills demonstrated
 * 2. Updates evidence index (System/.evidence-index.json) for fast brag sheet generation
 * 3. Tracks career stats (total wins, by quarter, by skill)
 */

const fs = require("fs");
const path = require("path");

const SYSTEM_DIR = process.env.SYSTEM_DIR || "System";
const EVIDENCE_DIR = "06-Evidence";
const INDEX_FILE = path.join(SYSTEM_DIR, ".evidence-index.json");

// Recognized evidence types and their keywords
const TYPE_KEYWORDS = {
  win: [
    "win",
    "shipped",
    "launched",
    "achievement",
    "success",
    "delivered",
    "completed",
    "milestone",
    "exceeded",
  ],
  learning: [
    "learning",
    "lesson",
    "mistake",
    "retrospective",
    "insight",
    "discovered",
    "realized",
    "improved",
  ],
  feedback: [
    "feedback",
    "review",
    "recognition",
    "praise",
    "mentioned",
    "noted",
    "commended",
    "acknowledged",
  ],
};

function main() {
  const hookInput = parseHookInput();
  if (!hookInput) {
    output({ skip: true, reason: "no hook input" });
    return;
  }

  const { tool_name, file_path: filePath } = hookInput;

  if (tool_name !== "Write") {
    output({ skip: true, reason: "not a Write operation" });
    return;
  }

  if (!filePath) {
    output({ skip: true, reason: "no file path" });
    return;
  }

  const relativePath = path.relative(process.cwd(), filePath);
  if (!relativePath.startsWith(EVIDENCE_DIR)) {
    output({ skip: true, reason: "not in evidence directory" });
    return;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    output({ error: `Failed to read evidence file: ${err.message}` });
    return;
  }

  // Extract evidence metadata
  const evidence = extractEvidenceMetadata(content, relativePath);
  if (!evidence.title) {
    output({ skip: true, reason: "could not extract evidence metadata" });
    return;
  }

  // Update the index
  updateIndex(evidence);

  output({
    captured: true,
    evidence_id: evidence.id,
    type: evidence.type,
    title: evidence.title,
    skills: evidence.skills,
    quarter: evidence.quarter,
  });
}

/**
 * Extract evidence metadata from markdown content.
 */
function extractEvidenceMetadata(content, relativePath) {
  const evidence = {
    id: generateEvidenceId(relativePath),
    file: relativePath,
    title: null,
    type: "win", // default
    date: null,
    quarter: null,
    skills: [],
    impact: null,
    stakeholders: [],
    tags: [],
    last_indexed: new Date().toISOString(),
  };

  // Try frontmatter
  const frontmatter = parseFrontmatter(content);
  if (Object.keys(frontmatter).length > 0) {
    evidence.title = frontmatter.title || null;
    evidence.type = frontmatter.type || inferType(content);
    evidence.date = frontmatter.date || null;
    evidence.skills = frontmatter.skills
      ? frontmatter.skills.split(",").map((s) => s.trim())
      : [];
    evidence.tags = frontmatter.tags
      ? frontmatter.tags.split(",").map((t) => t.trim())
      : [];
    evidence.impact = frontmatter.impact || null;
  }

  const body = stripFrontmatter(content);

  // Extract title from heading
  if (!evidence.title) {
    const titleMatch = body.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      evidence.title = titleMatch[1].trim();
    } else {
      evidence.title = path
        .basename(relativePath, ".md")
        .replace(/^\d{4}-\d{2}-\d{2}\s*-?\s*/, "")
        .replace(/_/g, " ");
    }
  }

  // Extract date
  if (!evidence.date) {
    const dateMatch = relativePath.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      evidence.date = dateMatch[1];
    } else {
      evidence.date = new Date().toISOString().split("T")[0];
    }
  }

  // Compute quarter
  evidence.quarter = dateToQuarter(evidence.date);

  // Infer type from content if not set
  if (!frontmatter.type) {
    evidence.type = inferType(body);
  }

  // Extract skills from content
  if (evidence.skills.length === 0) {
    evidence.skills = extractSkills(body);
  }

  // Extract impact section
  if (!evidence.impact) {
    const impactSection = extractSection(body, "Impact|Results|Outcome");
    if (impactSection) {
      evidence.impact = impactSection.split("\n\n")[0].trim();
    }
  }

  // Extract stakeholders / people mentioned
  const peopleMatches = body.matchAll(
    /\[\[([A-Z][a-z]+_[A-Z][a-z]+)(?:\|[^\]]+)?\]\]/g
  );
  for (const match of peopleMatches) {
    const name = match[1].replace("_", " ");
    if (!evidence.stakeholders.includes(name)) {
      evidence.stakeholders.push(name);
    }
  }

  // Detect metrics / quantified results
  const metricsMatches = body.matchAll(
    /(\d+(?:\.\d+)?)\s*(%|x|hours?|days?|weeks?|users?|customers?|tickets?|reduction|increase|improvement)/gi
  );
  const metrics = [];
  for (const match of metricsMatches) {
    metrics.push(`${match[1]}${match[2]}`);
  }
  if (metrics.length > 0) {
    evidence.quantified = true;
    evidence.metrics = metrics.slice(0, 5);
  }

  return evidence;
}

/**
 * Infer evidence type from content keywords.
 */
function inferType(content) {
  const lower = content.toLowerCase();
  const scores = {};

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    scores[type] = keywords.reduce((sum, keyword) => {
      return sum + (lower.includes(keyword) ? 1 : 0);
    }, 0);
  }

  // Return highest scoring type, defaulting to "win"
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : "win";
}

/**
 * Extract skills from Career: tags and content patterns.
 */
function extractSkills(content) {
  const skills = new Set();

  // Explicit # Career: tags
  const careerTags = content.matchAll(/#\s*Career:\s*(.+?)(?:\s*$|\s*\|)/gm);
  for (const match of careerTags) {
    skills.add(match[1].trim());
  }

  // Skills section
  const skillsSection = extractSection(
    content,
    "Skills|Skills Demonstrated|Competencies"
  );
  if (skillsSection) {
    const items = skillsSection.matchAll(/[-*]\s+(.+)/g);
    for (const match of items) {
      skills.add(match[1].trim());
    }
  }

  // Frontmatter skills already handled upstream

  return Array.from(skills);
}

/**
 * Update the evidence index with new or updated evidence.
 */
function updateIndex(evidence) {
  let index = {
    entries: [],
    stats: {
      total: 0,
      by_type: {},
      by_quarter: {},
      by_skill: {},
    },
    last_updated: null,
  };

  if (fs.existsSync(INDEX_FILE)) {
    try {
      index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
      if (!Array.isArray(index.entries)) index.entries = [];
      if (!index.stats) index.stats = {};
    } catch {
      // Reset on corruption
    }
  }

  // Upsert entry
  const existingIdx = index.entries.findIndex(
    (e) => e.id === evidence.id || e.file === evidence.file
  );

  if (existingIdx >= 0) {
    index.entries[existingIdx] = evidence;
  } else {
    index.entries.push(evidence);
  }

  // Sort by date descending
  index.entries.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  // Recompute stats
  index.stats = computeStats(index.entries);
  index.last_updated = new Date().toISOString();

  ensureDir(SYSTEM_DIR);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Compute aggregate stats from evidence entries.
 */
function computeStats(entries) {
  const stats = {
    total: entries.length,
    by_type: {},
    by_quarter: {},
    by_skill: {},
    quantified_count: 0,
  };

  for (const entry of entries) {
    // By type
    stats.by_type[entry.type] = (stats.by_type[entry.type] || 0) + 1;

    // By quarter
    if (entry.quarter) {
      stats.by_quarter[entry.quarter] =
        (stats.by_quarter[entry.quarter] || 0) + 1;
    }

    // By skill
    for (const skill of entry.skills || []) {
      stats.by_skill[skill] = (stats.by_skill[skill] || 0) + 1;
    }

    // Quantified count
    if (entry.quantified) {
      stats.quantified_count++;
    }
  }

  return stats;
}

/**
 * Convert a date string to quarter format (e.g., "2026-Q1").
 */
function dateToQuarter(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length < 2) return null;
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

function extractSection(content, headingPattern) {
  const regex = new RegExp(
    `^##\\s+(?:${headingPattern})\\s*$\\n([\\s\\S]*?)(?=^##\\s|$(?!\\n))`,
    "mi"
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};
  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

function generateEvidenceId(filePath) {
  const basename = path.basename(filePath, ".md");
  return `ev-${basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseHookInput() {
  const envInput = process.env.CLAUDE_HOOK_INPUT;
  if (envInput) {
    try {
      return JSON.parse(envInput);
    } catch {
      return null;
    }
  }
  if (process.argv.length > 2) {
    try {
      return JSON.parse(process.argv[2]);
    } catch {
      return { file_path: process.argv[2], tool_name: process.argv[3] };
    }
  }
  return null;
}

function output(data) {
  console.log(JSON.stringify(data));
}

main();
