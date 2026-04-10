#!/usr/bin/env node
/**
 * decision-capture.cjs — PostToolUse hook (after Write)
 *
 * When files are written to 03-Decisions/, this hook:
 * 1. Extracts key metadata: title, date, options, decision, review_date
 * 2. Updates the decisions index (System/.decisions-index.json) for fast lookup
 * 3. Sets a reminder for review_date if present
 *
 * Decision files are expected to be markdown with YAML frontmatter or
 * structured headings (## Options, ## Decision, ## Review Date, etc.)
 */

const fs = require("fs");
const path = require("path");

const SYSTEM_DIR = process.env.SYSTEM_DIR || "System";
const DECISIONS_DIR = "03-Decisions";
const INDEX_FILE = path.join(SYSTEM_DIR, ".decisions-index.json");
const REMINDERS_FILE = path.join(SYSTEM_DIR, ".reminders.json");

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

  // Check if file is in decisions directory
  const relativePath = path.relative(process.cwd(), filePath);
  if (!relativePath.startsWith(DECISIONS_DIR)) {
    output({ skip: true, reason: "not in decisions directory" });
    return;
  }

  // Read the file content
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    output({ error: `Failed to read decision file: ${err.message}` });
    return;
  }

  // Extract decision metadata
  const decision = extractDecisionMetadata(content, relativePath);
  if (!decision.title) {
    output({ skip: true, reason: "could not extract decision metadata" });
    return;
  }

  // Update the index
  const indexUpdated = updateIndex(decision);

  // Set reminder if review_date exists
  let reminderSet = false;
  if (decision.review_date) {
    reminderSet = setReviewReminder(decision);
  }

  output({
    captured: true,
    decision_id: decision.id,
    title: decision.title,
    review_date: decision.review_date || null,
    index_updated: indexUpdated,
    reminder_set: reminderSet,
  });
}

/**
 * Extract decision metadata from markdown content.
 * Supports both YAML frontmatter and structured headings.
 */
function extractDecisionMetadata(content, relativePath) {
  const decision = {
    id: generateDecisionId(relativePath),
    file: relativePath,
    title: null,
    date: null,
    status: "decided",
    options: [],
    chosen_option: null,
    rationale: null,
    review_date: null,
    actual_outcome: null,
    stakeholders: [],
    tags: [],
    last_indexed: new Date().toISOString(),
  };

  // Try frontmatter first
  const frontmatter = parseFrontmatter(content);
  if (Object.keys(frontmatter).length > 0) {
    decision.title = frontmatter.title || null;
    decision.date = frontmatter.date || null;
    decision.status = frontmatter.status || "decided";
    decision.review_date = frontmatter.review_date || null;
    decision.tags = frontmatter.tags
      ? frontmatter.tags.split(",").map((t) => t.trim())
      : [];
    decision.stakeholders = frontmatter.stakeholders
      ? frontmatter.stakeholders.split(",").map((s) => s.trim())
      : [];
  }

  const body = stripFrontmatter(content);

  // Extract title from first heading if not in frontmatter
  if (!decision.title) {
    const titleMatch = body.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      decision.title = titleMatch[1].trim();
    } else {
      // Fall back to filename
      decision.title = path
        .basename(relativePath, ".md")
        .replace(/^\d{4}-\d{2}-\d{2}\s*-?\s*/, "")
        .replace(/_/g, " ");
    }
  }

  // Extract date from filename if not in frontmatter
  if (!decision.date) {
    const dateMatch = relativePath.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      decision.date = dateMatch[1];
    }
  }

  // Extract options section
  const optionsSection = extractSection(body, "Options");
  if (optionsSection) {
    const optionMatches = optionsSection.matchAll(
      /[-*]\s+\*?\*?(?:Option\s*\d*:?\s*)?(.+?)(?:\*?\*?\s*$)/gm
    );
    for (const match of optionMatches) {
      decision.options.push(match[1].trim());
    }
  }

  // Extract decision / chosen option
  const decisionSection = extractSection(body, "Decision");
  if (decisionSection) {
    // Take the first paragraph as the chosen option summary
    const firstPara = decisionSection.split("\n\n")[0];
    decision.chosen_option = firstPara.replace(/^[-*]\s+/, "").trim();
  }

  // Extract rationale
  const rationaleSection = extractSection(body, "Rationale|Reasoning|Why");
  if (rationaleSection) {
    decision.rationale = rationaleSection.split("\n\n")[0].trim();
  }

  // Extract review date from content if not in frontmatter
  if (!decision.review_date) {
    const reviewMatch = body.match(
      /(?:review[_ ]?date|revisit|review[_ ]?by)[:\s]+(\d{4}-\d{2}-\d{2})/i
    );
    if (reviewMatch) {
      decision.review_date = reviewMatch[1];
    }
  }

  // Extract actual outcome if present
  const outcomeSection = extractSection(
    body,
    "Actual[_ ]?Outcome|Result|Outcome"
  );
  if (outcomeSection) {
    decision.actual_outcome = outcomeSection.split("\n\n")[0].trim();
    decision.status = "reviewed";
  }

  return decision;
}

/**
 * Extract a section from markdown by heading name.
 */
function extractSection(content, headingPattern) {
  const regex = new RegExp(
    `^##\\s+(?:${headingPattern})\\s*$\\n([\\s\\S]*?)(?=^##\\s|$(?!\\n))`,
    "mi"
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Update the decisions index file.
 */
function updateIndex(decision) {
  let index = { decisions: [], last_updated: null };

  if (fs.existsSync(INDEX_FILE)) {
    try {
      index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
      if (!Array.isArray(index.decisions)) index.decisions = [];
    } catch {
      index = { decisions: [], last_updated: null };
    }
  }

  // Upsert: find existing by id or file path
  const existingIdx = index.decisions.findIndex(
    (d) => d.id === decision.id || d.file === decision.file
  );

  if (existingIdx >= 0) {
    // Merge — preserve actual_outcome if it was set previously and not in new content
    const existing = index.decisions[existingIdx];
    if (existing.actual_outcome && !decision.actual_outcome) {
      decision.actual_outcome = existing.actual_outcome;
    }
    index.decisions[existingIdx] = decision;
  } else {
    index.decisions.push(decision);
  }

  // Sort by date descending
  index.decisions.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  index.last_updated = new Date().toISOString();

  ensureDir(SYSTEM_DIR);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  return true;
}

/**
 * Set a review reminder for the decision.
 */
function setReviewReminder(decision) {
  let reminders = { items: [] };

  if (fs.existsSync(REMINDERS_FILE)) {
    try {
      reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, "utf8"));
      if (!Array.isArray(reminders.items)) reminders.items = [];
    } catch {
      reminders = { items: [] };
    }
  }

  // Check for existing reminder for this decision
  const existingIdx = reminders.items.findIndex(
    (r) => r.source_id === decision.id && r.type === "decision_review"
  );

  const reminder = {
    type: "decision_review",
    source_id: decision.id,
    title: `Review decision: ${decision.title}`,
    date: decision.review_date,
    file: decision.file,
    created: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    reminders.items[existingIdx] = reminder;
  } else {
    reminders.items.push(reminder);
  }

  ensureDir(SYSTEM_DIR);
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
  return true;
}

/**
 * Generate a stable decision ID from the file path.
 */
function generateDecisionId(filePath) {
  const basename = path.basename(filePath, ".md");
  return `dec-${basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
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
