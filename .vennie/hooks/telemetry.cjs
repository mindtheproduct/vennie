#!/usr/bin/env node
/**
 * telemetry.cjs — PostToolUse hook
 *
 * After any skill execution completes, logs anonymous usage events
 * to System/.telemetry-queue.json if telemetry is enabled in profile.yaml.
 *
 * Events: skill_name, persona_active, timestamp, duration
 * Queue is flushed to API during session end (or after 10 events).
 *
 * NEVER logs content, decisions, or personal data.
 * Privacy is absolute — only structural metadata is captured.
 */

const fs = require("fs");
const path = require("path");

const SYSTEM_DIR = process.env.SYSTEM_DIR || "System";
const PROFILE_FILE = path.join(SYSTEM_DIR, "profile.yaml");
const ACTIVE_PERSONA_FILE = path.join(SYSTEM_DIR, ".active-persona");
const QUEUE_FILE = path.join(SYSTEM_DIR, ".telemetry-queue.json");
const FLUSH_THRESHOLD = 10;

function main() {
  // Check if telemetry is enabled
  if (!isTelemetryEnabled()) {
    output({ skip: true, reason: "telemetry disabled" });
    return;
  }

  const hookInput = parseHookInput();
  if (!hookInput) {
    output({ skip: true, reason: "no hook input" });
    return;
  }

  const { tool_name, skill_name, duration_ms } = hookInput;

  // Build telemetry event — metadata only, never content
  const event = {
    event_type: "tool_use",
    tool: tool_name || "unknown",
    skill: skill_name || null,
    persona: getActivePersona(),
    timestamp: new Date().toISOString(),
    duration_ms: duration_ms || null,
    session_id: getSessionId(),
  };

  // Append to queue
  const queue = appendToQueue(event);

  // Auto-flush if threshold reached
  let flushed = false;
  if (queue.events.length >= FLUSH_THRESHOLD) {
    flushed = flushQueue(queue);
  }

  output({
    logged: true,
    queue_size: queue.events.length,
    flushed,
  });
}

/**
 * Check if telemetry is enabled in profile.yaml.
 * Default: disabled (opt-in for Vennie, unlike Dex).
 */
function isTelemetryEnabled() {
  if (!fs.existsSync(PROFILE_FILE)) return false;

  try {
    const content = fs.readFileSync(PROFILE_FILE, "utf8");

    // Simple YAML parsing for telemetry.enabled
    const enabledMatch = content.match(
      /telemetry[\s\S]*?enabled:\s*(true|false)/
    );
    if (enabledMatch) {
      return enabledMatch[1] === "true";
    }

    // Also check top-level analytics.enabled (Dex-compatible)
    const analyticsMatch = content.match(
      /analytics[\s\S]*?enabled:\s*(true|false)/
    );
    if (analyticsMatch) {
      return analyticsMatch[1] === "true";
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get the currently active persona ID, if any.
 */
function getActivePersona() {
  try {
    if (fs.existsSync(ACTIVE_PERSONA_FILE)) {
      const persona = fs.readFileSync(ACTIVE_PERSONA_FILE, "utf8").trim();
      return persona && persona !== "none" ? persona : null;
    }
  } catch {
    // silent
  }
  return null;
}

/**
 * Get or generate a session ID for event grouping.
 * Session ID is ephemeral — stored in an env-like temp file,
 * regenerated each session start.
 */
function getSessionId() {
  const sessionFile = path.join(SYSTEM_DIR, ".current-session-id");
  try {
    if (fs.existsSync(sessionFile)) {
      return fs.readFileSync(sessionFile, "utf8").trim();
    }
  } catch {
    // silent
  }

  // Generate a new session ID
  const sessionId = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    ensureDir(SYSTEM_DIR);
    fs.writeFileSync(sessionFile, sessionId);
  } catch {
    // Non-critical
  }
  return sessionId;
}

/**
 * Append an event to the telemetry queue.
 */
function appendToQueue(event) {
  let queue = { events: [], created: new Date().toISOString() };

  if (fs.existsSync(QUEUE_FILE)) {
    try {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
      if (!Array.isArray(queue.events)) queue.events = [];
    } catch {
      queue = { events: [], created: new Date().toISOString() };
    }
  }

  queue.events.push(event);
  queue.last_event = new Date().toISOString();

  // Cap at 100 events to prevent unbounded growth
  if (queue.events.length > 100) {
    queue.events = queue.events.slice(-100);
  }

  ensureDir(SYSTEM_DIR);
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  return queue;
}

/**
 * Flush the telemetry queue to the API endpoint.
 * Returns true if flush succeeded, false otherwise.
 *
 * The actual API endpoint is configured in profile.yaml under
 * telemetry.endpoint. If not configured, events are just cleared.
 */
function flushQueue(queue) {
  const endpoint = getTelemetryEndpoint();

  if (!endpoint) {
    // No endpoint configured — just clear the queue
    clearQueue();
    return true;
  }

  // Prepare payload — strip any accidentally included content
  const sanitizedEvents = queue.events.map((event) => ({
    event_type: event.event_type,
    tool: event.tool,
    skill: event.skill,
    persona: event.persona,
    timestamp: event.timestamp,
    duration_ms: event.duration_ms,
    session_id: event.session_id,
  }));

  // Async flush — don't block the hook
  try {
    const payload = JSON.stringify({
      events: sanitizedEvents,
      flushed_at: new Date().toISOString(),
    });

    // Write to a flush file that the session-end hook picks up
    const flushFile = path.join(
      SYSTEM_DIR,
      `.telemetry-flush-${Date.now()}.json`
    );
    fs.writeFileSync(
      flushFile,
      JSON.stringify({ endpoint, payload }, null, 2)
    );

    clearQueue();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the telemetry API endpoint from profile.yaml.
 */
function getTelemetryEndpoint() {
  if (!fs.existsSync(PROFILE_FILE)) return null;

  try {
    const content = fs.readFileSync(PROFILE_FILE, "utf8");
    const endpointMatch = content.match(
      /telemetry[\s\S]*?endpoint:\s*["']?([^\s"']+)/
    );
    return endpointMatch ? endpointMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Clear the telemetry queue.
 */
function clearQueue() {
  try {
    fs.writeFileSync(
      QUEUE_FILE,
      JSON.stringify(
        {
          events: [],
          created: new Date().toISOString(),
          last_flush: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch {
    // Non-critical
  }
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
      return { tool_name: process.argv[2], skill_name: process.argv[3] };
    }
  }
  return null;
}

function output(data) {
  console.log(JSON.stringify(data));
}

main();
