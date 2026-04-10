#!/usr/bin/env bash
# session-start.sh — SessionStart hook
# Checks for pending decision reviews, news signals, and tool changelog updates.
# Outputs JSON with notifications for Vennie to surface naturally.
# Non-blocking — failures produce empty notifications, never errors.

set -euo pipefail

VENNIE_DIR="${VENNIE_DIR:-.vennie}"
SYSTEM_DIR="${SYSTEM_DIR:-System}"
DECISIONS_INDEX="${SYSTEM_DIR}/.decisions-index.json"
SIGNALS_DIR="00-Inbox/Signals"
CHANGELOG_CACHE="${SYSTEM_DIR}/.tool-changelog-cache.json"

notifications=()
today=$(date +%Y-%m-%d)

# ─────────────────────────────────────────────
# 1. Check for pending decision reviews
# ─────────────────────────────────────────────
if [ -f "$DECISIONS_INDEX" ]; then
  # Find decisions whose review_date has passed without an actual_outcome
  pending_reviews=$(node -e "
    const fs = require('fs');
    try {
      const index = JSON.parse(fs.readFileSync('${DECISIONS_INDEX}', 'utf8'));
      const today = '${today}';
      const pending = (index.decisions || []).filter(d =>
        d.review_date &&
        d.review_date <= today &&
        !d.actual_outcome
      );
      if (pending.length > 0) {
        const titles = pending.slice(0, 3).map(d => d.title).join(', ');
        const extra = pending.length > 3 ? ' and ' + (pending.length - 3) + ' more' : '';
        console.log(JSON.stringify({
          type: 'decision_review',
          priority: 'medium',
          message: 'You have ' + pending.length + ' decision(s) due for review: ' + titles + extra + '. Run /decision-review to reflect on outcomes.',
          count: pending.length
        }));
      }
    } catch(e) { /* silent */ }
  " 2>/dev/null || true)

  if [ -n "$pending_reviews" ]; then
    notifications+=("$pending_reviews")
  fi
fi

# ─────────────────────────────────────────────
# 2. Check for new news signals
# ─────────────────────────────────────────────
if [ -d "$SIGNALS_DIR" ]; then
  today_signal_file="${SIGNALS_DIR}/${today}.md"
  yesterday=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null || echo "")

  if [ -f "$today_signal_file" ]; then
    # Signal exists for today — include a heads-up
    headline=$(head -1 "$today_signal_file" | sed 's/^#* *//')
    if [ -n "$headline" ]; then
      notifications+=("{\"type\":\"news_signal\",\"priority\":\"low\",\"message\":\"Today's signal: ${headline}\"}")
    fi
  elif [ -n "$yesterday" ] && [ -f "${SIGNALS_DIR}/${yesterday}.md" ]; then
    # Yesterday's signal exists but today's doesn't — flag for refresh
    notifications+=("{\"type\":\"news_signal_stale\",\"priority\":\"low\",\"message\":\"News signals haven't refreshed today. They'll update automatically or you can trigger with /signals.\"}")
  fi
fi

# ─────────────────────────────────────────────
# 3. Check for tool changelog updates
# ─────────────────────────────────────────────
if [ -f "$CHANGELOG_CACHE" ]; then
  changelog_notification=$(node -e "
    const fs = require('fs');
    try {
      const cache = JSON.parse(fs.readFileSync('${CHANGELOG_CACHE}', 'utf8'));
      const today = '${today}';
      const unseen = (cache.entries || []).filter(e =>
        !e.seen && e.date && e.date >= (cache.last_checked || '1970-01-01')
      );
      if (unseen.length > 0) {
        const tools = [...new Set(unseen.map(e => e.tool))].slice(0, 3).join(', ');
        console.log(JSON.stringify({
          type: 'tool_update',
          priority: 'low',
          message: 'Tool updates available for: ' + tools + '. New capabilities may be relevant to your workflow.',
          count: unseen.length
        }));
      }
    } catch(e) { /* silent */ }
  " 2>/dev/null || true)

  if [ -n "$changelog_notification" ]; then
    notifications+=("$changelog_notification")
  fi
fi

# ─────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────
if [ ${#notifications[@]} -eq 0 ]; then
  echo '{"notifications":[]}'
else
  # Join notifications into JSON array
  joined=$(printf '%s,' "${notifications[@]}")
  joined="${joined%,}" # Remove trailing comma
  echo "{\"notifications\":[${joined}]}"
fi
