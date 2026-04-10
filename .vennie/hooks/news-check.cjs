#!/usr/bin/env node
/**
 * news-check.cjs — SessionStart hook
 *
 * Checks 00-Inbox/Signals/ for today's signal file.
 * - If signal exists: include headline in session start context
 * - If no signal cached: attempt async refresh via news_server (non-blocking)
 * - Max 1 signal per session start
 *
 * Output: JSON with optional signal context for Vennie to surface naturally.
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const SIGNALS_DIR = "00-Inbox/Signals";
const SYSTEM_DIR = process.env.SYSTEM_DIR || "System";
const REFRESH_LOCK_FILE = path.join(SYSTEM_DIR, ".news-refresh-lock");
const NEWS_SERVER_PORT = process.env.NEWS_SERVER_PORT || "3847";

// Minimum time between refresh attempts (1 hour in ms)
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

function main() {
  const today = formatDate(new Date());
  const signalFile = path.join(SIGNALS_DIR, `${today}.md`);

  // Check for today's signal
  if (fs.existsSync(signalFile)) {
    const signal = parseSignalFile(signalFile);
    if (signal) {
      output({
        signal_available: true,
        date: today,
        headline: signal.headline,
        summary: signal.summary,
        sources: signal.sources,
        context: buildSignalContext(signal),
      });
      return;
    }
  }

  // No signal for today — check if we should trigger a refresh
  if (shouldRefresh()) {
    triggerAsyncRefresh(today);
    output({
      signal_available: false,
      date: today,
      refresh_triggered: true,
      context:
        "News signals are refreshing in the background. They'll be available shortly.",
    });
    return;
  }

  // Check for yesterday's signal as fallback
  const yesterday = formatDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  const yesterdayFile = path.join(SIGNALS_DIR, `${yesterday}.md`);

  if (fs.existsSync(yesterdayFile)) {
    const signal = parseSignalFile(yesterdayFile);
    if (signal) {
      output({
        signal_available: true,
        date: yesterday,
        stale: true,
        headline: signal.headline,
        summary: signal.summary,
        context: `Yesterday's signal (${yesterday}): ${signal.headline}`,
      });
      return;
    }
  }

  output({ signal_available: false, date: today });
}

/**
 * Parse a signal markdown file to extract structured data.
 */
function parseSignalFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const signal = {
    headline: null,
    summary: null,
    sources: [],
    relevance: null,
    tags: [],
  };

  // Try frontmatter
  const frontmatter = parseFrontmatter(content);
  if (frontmatter.headline) signal.headline = frontmatter.headline;
  if (frontmatter.relevance) signal.relevance = frontmatter.relevance;
  if (frontmatter.tags)
    signal.tags = frontmatter.tags.split(",").map((t) => t.trim());

  const body = stripFrontmatter(content);

  // Extract headline from first heading
  if (!signal.headline) {
    const headlineMatch = body.match(/^#\s+(.+)$/m);
    if (headlineMatch) {
      signal.headline = headlineMatch[1].trim();
    }
  }

  // Extract summary — first paragraph after headline
  const paragraphs = body
    .split("\n\n")
    .filter((p) => p.trim() && !p.startsWith("#"));
  if (paragraphs.length > 0) {
    signal.summary = paragraphs[0].trim().slice(0, 300);
  }

  // Extract source links
  const linkMatches = body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
  for (const match of linkMatches) {
    signal.sources.push({ title: match[1], url: match[2] });
    if (signal.sources.length >= 3) break;
  }

  return signal.headline ? signal : null;
}

/**
 * Build a natural-language context string from a signal.
 */
function buildSignalContext(signal) {
  let context = `Today's industry signal: ${signal.headline}`;

  if (signal.summary) {
    context += `\n\n${signal.summary}`;
  }

  if (signal.relevance) {
    context += `\n\nRelevance: ${signal.relevance}`;
  }

  return context;
}

/**
 * Check if enough time has passed since the last refresh attempt.
 */
function shouldRefresh() {
  if (!fs.existsSync(REFRESH_LOCK_FILE)) return true;

  try {
    const stat = fs.statSync(REFRESH_LOCK_FILE);
    const elapsed = Date.now() - stat.mtimeMs;
    return elapsed > REFRESH_COOLDOWN_MS;
  } catch {
    return true;
  }
}

/**
 * Trigger an async news refresh via the news server.
 * Non-blocking — fires and forgets.
 */
function triggerAsyncRefresh(date) {
  // Write lock file to prevent repeated refresh attempts
  ensureDir(SYSTEM_DIR);
  try {
    fs.writeFileSync(REFRESH_LOCK_FILE, new Date().toISOString());
  } catch {
    // Non-critical
  }

  // Attempt to call the news server via HTTP (non-blocking)
  try {
    const http = require("http");
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: parseInt(NEWS_SERVER_PORT, 10),
        path: `/refresh?date=${date}`,
        method: "POST",
        timeout: 3000,
      },
      () => {
        // Response doesn't matter — fire and forget
      }
    );

    req.on("error", () => {
      // Server not running — that's fine, signals will refresh next time
    });

    req.end();
  } catch {
    // Non-blocking — if server isn't available, skip silently
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function output(data) {
  console.log(JSON.stringify(data));
}

main();
