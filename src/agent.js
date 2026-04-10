'use strict';

const fs = require('fs');
const path = require('path');

// ── Agent Loop ──────────────────────────────────────────────────────────────
// The brain of Vennie. Implements the standard Claude tool_use loop:
//   1. Send messages to Claude
//   2. Stream the response (yielding text deltas for the renderer)
//   3. If Claude requests tool use, execute tools and loop
//   4. Repeat until Claude is done (no more tool_use blocks)
//
// Uses async generator pattern — the CLI consumes yielded events to render
// streaming text, tool calls, and results in real time.

// ── Model & Pricing ─────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Approximate pricing per 1M tokens (USD) for cost tracking
const MODEL_PRICING = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
};

const DEFAULT_MAX_TURNS = 25;

// ── System Prompt Builder ───────────────────────────────────────────────────

/**
 * Build the complete system prompt from CLAUDE.md + persona overlay + voice.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string|null} activePersona - Name of active persona, or null
 * @returns {string} Complete system prompt
 */
function buildSystemPrompt(vaultPath, activePersona) {
  const parts = [];

  // Core identity — CLAUDE.md (which is VENNIE.md copied into the vault)
  const claudeMd = path.join(vaultPath, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    parts.push(fs.readFileSync(claudeMd, 'utf8'));
  }

  // Voice profile — trained writing style
  const voiceYaml = path.join(vaultPath, 'System', 'voice.yaml');
  if (fs.existsSync(voiceYaml)) {
    const voice = fs.readFileSync(voiceYaml, 'utf8');
    parts.push(`\n---\n## Voice Profile\n\nAdopt this writing style in your responses:\n\n${voice}`);
  }

  // Persona overlay — additional behavioral instructions
  if (activePersona) {
    const slug = activePersona.toLowerCase().replace(/\s+/g, '-');
    const searchDirs = ['core', 'marketplace', 'custom', '.'];
    let personaContent = null;
    for (const dir of searchDirs) {
      const p = path.join(vaultPath, '.vennie', 'personas', dir, `${slug}.md`);
      if (fs.existsSync(p)) {
        personaContent = fs.readFileSync(p, 'utf8');
        break;
      }
    }
    if (personaContent) {
      parts.push(`\n---\n## Active Persona: ${activePersona}\n\n${personaContent}`);
    }
  }

  // User profile for context
  const profileYaml = path.join(vaultPath, 'System', 'profile.yaml');
  if (fs.existsSync(profileYaml)) {
    const profile = fs.readFileSync(profileYaml, 'utf8');
    parts.push(`\n---\n## User Profile\n\n${profile}`);
  }

  // Current date and time
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  parts.push(`\n---\nCurrent date and time: ${dateStr}, ${timeStr} (${tz})`);

  return parts.join('\n');
}

// ── Agent Loop ──────────────────────────────────────────────────────────────

/**
 * The core agent loop. Async generator that yields render events.
 *
 * @param {object[]} messages - Conversation messages array (mutated in place)
 * @param {object[]} tools - Tool definitions (built-in + MCP)
 * @param {string} systemPrompt - Complete system prompt
 * @param {object} options
 * @param {Function} options.executeTool - async (name, input) => result
 * @param {number} [options.maxTurns=25] - Max tool-use turns before stopping
 * @param {string} [options.model] - Model override
 * @param {string} [options.skillContext] - Extra context from an active skill
 *
 * @yields {{ type: string, ... }} Render events:
 *   - { type: 'text_delta', text: string }
 *   - { type: 'tool_start', name: string, input: object }
 *   - { type: 'tool_result', name: string, result: any, success: boolean }
 *   - { type: 'usage', inputTokens: number, outputTokens: number, cost: number }
 *   - { type: 'error', message: string }
 *   - { type: 'done' }
 */
async function* agentLoop(messages, tools, systemPrompt, options = {}) {
  const model = options.model || process.env.VENNIE_MODEL || DEFAULT_MODEL;
  const maxTurns = options.maxTurns || DEFAULT_MAX_TURNS;
  const executeTool = options.executeTool;
  const thinking = options.thinking || false;

  // Late-require Anthropic SDK
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  } catch (err) {
    yield { type: 'error', message: `Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk\n${err.message}` };
    yield { type: 'done' };
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    yield { type: 'error', message: 'ANTHROPIC_API_KEY not set. Export it in your shell profile or .env file.' };
    yield { type: 'done' };
    return;
  }

  const client = new Anthropic();

  // Inject skill context into system prompt if present
  let fullSystem = systemPrompt;
  if (options.skillContext) {
    fullSystem += `\n\n---\n## Active Skill\n\n${options.skillContext}`;
  }

  // Accumulate session cost
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  // Tool-use loop
  let turn = 0;

  while (turn < maxTurns) {
    turn++;

    // Build tool schemas for the API (strip internal metadata)
    const apiTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    try {
      // Stream the response
      const streamParams = {
        model,
        max_tokens: thinking ? 26384 : 16384,
        system: [
          {
            type: 'text',
            text: fullSystem,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: compactMessages(messages),
        tools: apiTools.length > 0 ? apiTools : undefined,
      };

      // Extended thinking: when enabled, add thinking config and remove temperature
      if (thinking) {
        streamParams.thinking = { type: 'enabled', budget_tokens: 10000 };
      }

      const stream = client.messages.stream(streamParams);

      // Collect the full response content as we stream
      const contentBlocks = [];
      let currentBlock = null;
      let inputTokens = 0;
      let outputTokens = 0;

      // Process stream events
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            currentBlock = { ...event.content_block };
            if (currentBlock.type === 'text') {
              currentBlock.text = '';
            } else if (currentBlock.type === 'tool_use') {
              currentBlock.input = '';
            } else if (currentBlock.type === 'thinking') {
              currentBlock.thinking = '';
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              currentBlock.text += event.delta.text;
              yield { type: 'text_delta', text: event.delta.text };
            } else if (event.delta.type === 'input_json_delta') {
              currentBlock.input += event.delta.partial_json;
            } else if (event.delta.type === 'thinking_delta') {
              currentBlock.thinking += event.delta.thinking;
              yield { type: 'thinking_delta', text: event.delta.thinking };
            }
            break;

          case 'content_block_stop':
            if (currentBlock) {
              if (currentBlock.type === 'tool_use') {
                // Parse the accumulated JSON input
                try {
                  currentBlock.input = JSON.parse(currentBlock.input || '{}');
                } catch {
                  currentBlock.input = {};
                }
              }
              contentBlocks.push(currentBlock);
              currentBlock = null;
            }
            break;

          case 'message_delta':
            // Stop reason is in the final message delta
            break;

          case 'message_start':
            if (event.message && event.message.usage) {
              inputTokens = event.message.usage.input_tokens || 0;
            }
            break;

          case 'message_stop':
            break;
        }
      }

      // Get final message for usage stats
      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage?.input_tokens || inputTokens;
      outputTokens = finalMessage.usage?.output_tokens || 0;
      const cacheCreation = finalMessage.usage?.cache_creation_input_tokens || 0;
      const cacheRead = finalMessage.usage?.cache_read_input_tokens || 0;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCacheCreationTokens += cacheCreation;
      totalCacheReadTokens += cacheRead;

      // Add assistant message to conversation
      messages.push({ role: 'assistant', content: contentBlocks });

      // Check for tool use
      const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');

      if (toolBlocks.length === 0) {
        // No tool use — we're done. Yield usage and finish.
        const cost = calculateCost(totalInputTokens, totalOutputTokens, model, totalCacheCreationTokens, totalCacheReadTokens);
        yield {
          type: 'usage',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheCreationTokens: totalCacheCreationTokens,
          cacheReadTokens: totalCacheReadTokens,
          cost,
        };
        yield { type: 'done' };
        return;
      }

      // Execute tool calls
      const toolResults = [];
      for (const block of toolBlocks) {
        yield { type: 'tool_start', name: block.name, input: block.input };

        let result;
        let success = true;
        try {
          result = await executeTool(block.name, block.input);
          if (result && result.error) success = false;
        } catch (err) {
          result = { error: err.message };
          success = false;
        }

        yield { type: 'tool_result', name: block.name, result, success };

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
          is_error: !success,
        });
      }

      // Add tool results as user message and loop
      messages.push({ role: 'user', content: toolResults });

    } catch (err) {
      // Handle API errors — check status, error type, and message string
      const status = err.status || err?.error?.status;
      const errStr = err.message || String(err);
      const errType = err?.error?.type || err?.error?.error?.type || '';

      // Try to parse JSON from the error message if it's a raw API response
      let parsedType = errType;
      if (!parsedType && errStr.includes('"type"')) {
        try {
          const parsed = JSON.parse(errStr);
          parsedType = parsed?.error?.type || parsed?.type || '';
        } catch {}
      }

      if (status === 429 || parsedType === 'rate_limit_error') {
        yield { type: 'error', message: 'Rate limited by Anthropic API. Wait a moment and try again.' };
      } else if (status === 401 || parsedType === 'authentication_error') {
        yield { type: 'error', message: 'Invalid ANTHROPIC_API_KEY. Check your key and try again.' };
      } else if (status === 529 || parsedType === 'overloaded_error' || errStr.includes('overloaded_error') || errStr.includes('Overloaded')) {
        yield { type: 'error', message: 'Anthropic API is overloaded. Try again in a few seconds.' };
      } else {
        // Show a clean message, not raw JSON
        const cleanMsg = errStr.startsWith('{') ? 'Unexpected API error. Try again.' : errStr;
        yield { type: 'error', message: `API error: ${cleanMsg}` };
      }
      yield { type: 'done' };
      return;
    }
  }

  // Exhausted max turns
  yield { type: 'error', message: `Reached maximum ${maxTurns} tool-use turns. Stopping to avoid runaway loops.` };
  const cost = calculateCost(totalInputTokens, totalOutputTokens, model, totalCacheCreationTokens, totalCacheReadTokens);
  yield {
    type: 'usage',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheCreationTokens: totalCacheCreationTokens,
    cacheReadTokens: totalCacheReadTokens,
    cost,
  };
  yield { type: 'done' };
}

// ── Context Compaction ──────────────────────────────────────────────────────
// Basic message compaction to keep within context limits.
// When messages get too long, summarize older turns.

/**
 * Compact messages to stay within reasonable token limits.
 * Rough heuristic: ~4 chars per token, aim for ~120k tokens of context.
 */
function compactMessages(messages) {
  const MAX_CHARS = 480000; // ~120k tokens

  // Estimate total size
  const totalChars = messages.reduce((sum, m) => {
    const content = typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content);
    return sum + content.length;
  }, 0);

  if (totalChars <= MAX_CHARS) return messages;

  // Keep first message (may contain important context) and recent messages
  // Drop middle messages, replacing with a summary marker
  const keepRecent = Math.min(20, messages.length);
  const keepFirst = 2;

  if (messages.length <= keepFirst + keepRecent) return messages;

  const first = messages.slice(0, keepFirst);
  const recent = messages.slice(-keepRecent);
  const droppedCount = messages.length - keepFirst - keepRecent;

  const summaryMessage = {
    role: 'user',
    content: `[System note: ${droppedCount} earlier messages were compacted to save context space. The conversation continues from the most recent messages below.]`,
  };

  return [...first, summaryMessage, ...recent];
}

// ── Cost Calculation ────────────────────────────────────────────────────────

function calculateCost(inputTokens, outputTokens, model, cacheCreationTokens = 0, cacheReadTokens = 0) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheWriteCost = (cacheCreationTokens / 1_000_000) * pricing.input * 1.25;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.input * 0.1;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  agentLoop,
  buildSystemPrompt,
  DEFAULT_MODEL,
};
