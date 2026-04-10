#!/usr/bin/env node
/**
 * voice-learner.cjs — PostToolUse hook (after Write/Edit)
 *
 * Captures Vennie-generated drafts to enable voice learning.
 * When Vennie writes content to 07-Brand/ or generates any draft,
 * this hook snapshots the original. Later, when the user edits the file,
 * the diff between AI-generated and user-edited versions is captured
 * as a style delta for the voice training system.
 *
 * Flow:
 * 1. On Write/Edit to brand or draft paths → snapshot the AI output
 * 2. On subsequent edits by user (detected by comparing to snapshot) → compute delta
 * 3. Write delta to System/.voice-training-queue.json
 * 4. Voice server processes the queue during `/voice train`
 */

const fs = require("fs");
const path = require("path");

const SYSTEM_DIR = process.env.SYSTEM_DIR || "System";
const SNAPSHOTS_DIR = path.join(SYSTEM_DIR, ".voice-snapshots");
const QUEUE_FILE = path.join(SYSTEM_DIR, ".voice-training-queue.json");

// Paths that trigger voice learning
const VOICE_LEARN_PATTERNS = [
  /^07-Brand\//,
  /^00-Inbox\/Drafts\//,
  /\/drafts?\//i,
  /\/content\//i,
];

// Max snapshot age before cleanup (7 days in ms)
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function main() {
  // Read hook input from stdin or environment
  const hookInput = parseHookInput();
  if (!hookInput) {
    output({ skip: true, reason: "no hook input" });
    return;
  }

  const { tool_name, file_path: filePath, content } = hookInput;

  // Only process Write and Edit operations
  if (!tool_name || !["Write", "Edit"].includes(tool_name)) {
    output({ skip: true, reason: "not a write/edit operation" });
    return;
  }

  if (!filePath) {
    output({ skip: true, reason: "no file path" });
    return;
  }

  // Check if this file is in a voice-learnable path
  const relativePath = path.relative(process.cwd(), filePath);
  const isVoicePath = VOICE_LEARN_PATTERNS.some((pattern) =>
    pattern.test(relativePath)
  );

  if (!isVoicePath) {
    output({ skip: true, reason: "path not in voice-learn scope" });
    return;
  }

  ensureDir(SNAPSHOTS_DIR);

  const snapshotKey = toSnapshotKey(relativePath);
  const snapshotFile = path.join(SNAPSHOTS_DIR, `${snapshotKey}.json`);

  // Check if we already have a snapshot for this file
  if (fs.existsSync(snapshotFile)) {
    // A snapshot exists — this might be a user edit after our draft
    // Compare the current content with the snapshot to detect style deltas
    try {
      const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
      const currentContent = content || readFileContent(filePath);

      if (currentContent && currentContent !== snapshot.content) {
        // Content has changed — capture the delta
        const delta = computeStyleDelta(
          snapshot.content,
          currentContent,
          relativePath
        );
        if (delta) {
          appendToQueue(delta);
          // Remove the snapshot — delta captured
          fs.unlinkSync(snapshotFile);
          output({
            captured: true,
            type: "style_delta",
            file: relativePath,
          });
          return;
        }
      }
    } catch {
      // Snapshot corrupted — overwrite with new one
    }
  }

  // No existing snapshot or first write — create a new snapshot
  const fileContent = content || readFileContent(filePath);
  if (!fileContent) {
    output({ skip: true, reason: "no content to snapshot" });
    return;
  }

  const snapshot = {
    file: relativePath,
    content: fileContent,
    timestamp: new Date().toISOString(),
    tool: tool_name,
  };

  try {
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    output({ snapshot_created: true, file: relativePath });
  } catch (err) {
    output({ error: `Failed to create snapshot: ${err.message}` });
  }

  // Periodic cleanup of stale snapshots
  cleanupStaleSnapshots();
}

/**
 * Compute a style delta between AI-generated and user-edited content.
 * Captures patterns like: tone changes, structural edits, word replacements.
 */
function computeStyleDelta(original, edited, filePath) {
  const originalLines = original.split("\n");
  const editedLines = edited.split("\n");

  // Quick check: if content is identical or nearly identical, skip
  if (original.trim() === edited.trim()) return null;

  const delta = {
    file: filePath,
    timestamp: new Date().toISOString(),
    original_length: original.length,
    edited_length: edited.length,
    length_change: edited.length - original.length,
    line_count_change: editedLines.length - originalLines.length,
    samples: [],
  };

  // Find changed lines (simple diff — not a full diff algorithm)
  const maxLines = Math.max(originalLines.length, editedLines.length);
  let changedCount = 0;

  for (let i = 0; i < maxLines && delta.samples.length < 10; i++) {
    const origLine = originalLines[i] || "";
    const editLine = editedLines[i] || "";

    if (origLine.trim() !== editLine.trim()) {
      changedCount++;
      // Only capture meaningful changes (not just whitespace or empty lines)
      if (origLine.trim() || editLine.trim()) {
        delta.samples.push({
          line: i + 1,
          ai_wrote: origLine.trim(),
          user_changed_to: editLine.trim(),
        });
      }
    }
  }

  delta.total_lines_changed = changedCount;

  // Only capture if there are meaningful changes
  if (delta.samples.length === 0) return null;

  // Detect high-level patterns
  delta.patterns = detectPatterns(delta.samples);

  return delta;
}

/**
 * Detect recurring style patterns from edit samples.
 */
function detectPatterns(samples) {
  const patterns = [];

  let shorteningCount = 0;
  let lengtheningCount = 0;
  let toneChanges = 0;

  for (const sample of samples) {
    if (sample.ai_wrote.length > sample.user_changed_to.length) {
      shorteningCount++;
    } else if (sample.ai_wrote.length < sample.user_changed_to.length) {
      lengtheningCount++;
    }

    // Detect formality shifts
    const informalMarkers = ["!", "...", "lol", "haha", "tbh", "imo"];
    const formalMarkers = [
      "therefore",
      "consequently",
      "furthermore",
      "regarding",
    ];

    const aiInformal = informalMarkers.some((m) =>
      sample.ai_wrote.toLowerCase().includes(m)
    );
    const userInformal = informalMarkers.some((m) =>
      sample.user_changed_to.toLowerCase().includes(m)
    );
    const aiFormal = formalMarkers.some((m) =>
      sample.ai_wrote.toLowerCase().includes(m)
    );
    const userFormal = formalMarkers.some((m) =>
      sample.user_changed_to.toLowerCase().includes(m)
    );

    if (aiInformal !== userInformal || aiFormal !== userFormal) {
      toneChanges++;
    }
  }

  if (shorteningCount > samples.length * 0.6) {
    patterns.push("user_prefers_shorter");
  }
  if (lengtheningCount > samples.length * 0.6) {
    patterns.push("user_prefers_longer");
  }
  if (toneChanges > samples.length * 0.3) {
    patterns.push("tone_mismatch");
  }

  return patterns;
}

/**
 * Append a style delta to the voice training queue.
 */
function appendToQueue(delta) {
  let queue = { deltas: [], last_updated: null };

  if (fs.existsSync(QUEUE_FILE)) {
    try {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
      if (!Array.isArray(queue.deltas)) queue.deltas = [];
    } catch {
      queue = { deltas: [], last_updated: null };
    }
  }

  queue.deltas.push(delta);
  queue.last_updated = new Date().toISOString();

  // Cap queue size — keep last 50 deltas
  if (queue.deltas.length > 50) {
    queue.deltas = queue.deltas.slice(-50);
  }

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

/**
 * Clean up snapshots older than MAX_SNAPSHOT_AGE_MS.
 */
function cleanupStaleSnapshots() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return;

  try {
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(SNAPSHOTS_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_SNAPSHOT_AGE_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Non-critical — skip cleanup
  }
}

/**
 * Convert a file path to a safe snapshot key.
 */
function toSnapshotKey(filePath) {
  return filePath.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
}

/**
 * Read file content from disk.
 */
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Ensure a directory exists.
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Parse hook input from environment variable or stdin.
 * Claude Code hooks pass context via CLAUDE_HOOK_INPUT env var.
 */
function parseHookInput() {
  // Try environment variable first (Claude Code hook protocol)
  const envInput = process.env.CLAUDE_HOOK_INPUT;
  if (envInput) {
    try {
      return JSON.parse(envInput);
    } catch {
      return null;
    }
  }

  // Fall back to parsing from command-line arguments
  if (process.argv.length > 2) {
    try {
      return JSON.parse(process.argv[2]);
    } catch {
      return { file_path: process.argv[2], tool_name: process.argv[3] };
    }
  }

  return null;
}

/**
 * Output result as JSON to stdout.
 */
function output(data) {
  console.log(JSON.stringify(data));
}

main();
