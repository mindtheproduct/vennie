'use strict';

const { getUpstreamArtifacts, formatArtifactsForPrompt } = require('./skill-artifacts.js');
const { buildTieredContext } = require('./context-tiers.js');

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

const DEFAULT_MAX_TURNS = 12;

// ── Permission Tiers ────────────────────────────────────────────────────────
// Tools are categorised by risk level for the permission model.

const TOOL_TIERS = {
  // Auto-allow — read-only, no side effects
  auto: new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'AskUser']),
  // Confirm — writes to vault, creates/modifies files
  confirm: new Set(['Write', 'Edit']),
  // Approve — destructive or external side effects
  approve: new Set(['Bash']),
};

function getToolTier(name) {
  if (name.startsWith('mcp__')) return 'confirm'; // MCP tools default to confirm
  if (TOOL_TIERS.auto.has(name)) return 'auto';
  if (TOOL_TIERS.confirm.has(name)) return 'confirm';
  if (TOOL_TIERS.approve.has(name)) return 'approve';
  return 'confirm'; // Default unknown tools to confirm
}

// ── Citation Tracking ───────────────────────────────────────────────────────

function extractCitations(toolName, toolInput, toolResult) {
  if (!toolResult || toolResult.error) return null;

  if (toolName === 'Read' && toolInput.file_path) {
    const filename = toolInput.file_path.split('/').pop();
    const lines = toolInput.offset
      ? `lines ${toolInput.offset + 1}-${(toolInput.offset || 0) + (toolInput.limit || 0)}`
      : `${toolResult.total_lines || '?'} lines`;
    return { type: 'file', path: toolInput.file_path, filename, lines };
  }

  if (toolName === 'Grep' && toolResult.matches?.length > 0) {
    // Extract unique files from grep results
    const files = [...new Set(toolResult.matches.map(m => m.split(':')[0]))].slice(0, 5);
    return { type: 'search', pattern: toolInput.pattern, files, matchCount: toolResult.count };
  }

  if (toolName === 'Glob' && toolResult.files?.length > 0) {
    return { type: 'glob', pattern: toolInput.pattern, fileCount: toolResult.count };
  }

  return null;
}

// ── Result Preview ──────────────────────────────────────────────────────────

function getResultPreview(toolName, result, maxLines = 3) {
  if (!result || result.error) return null;

  if (toolName === 'Read' && result.content) {
    const lines = result.content.split('\n').slice(0, maxLines);
    return lines.join('\n') + (result.total_lines > maxLines ? '\n...' : '');
  }

  if (toolName === 'Grep' && result.matches) {
    return result.matches.slice(0, maxLines).join('\n') + (result.count > maxLines ? `\n... (${result.count} total)` : '');
  }

  if (toolName === 'Glob' && result.files) {
    return result.files.slice(0, maxLines).map(f => f.split('/').pop()).join('\n') + (result.count > maxLines ? `\n... (${result.count} files)` : '');
  }

  if (toolName === 'Bash' && result.output) {
    const lines = result.output.split('\n').slice(0, maxLines);
    return lines.join('\n') + (result.output.split('\n').length > maxLines ? '\n...' : '');
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    return result.success ? `✓ ${result.path?.split('/').pop() || 'done'}` : null;
  }

  return null;
}

// ── System Prompt Builder (Tiered) ──────────────────────────────────────────
// Uses context-tiers.js to build a minimal, relevant system prompt instead
// of dumping the full VENNIE.md + profile + everything into every turn.

/**
 * Build the complete system prompt using tiered context injection.
 * Only loads context relevant to the current turn to reduce token waste
 * and improve model attention.
 *
 * Maintains the same signature for backwards compatibility with all callers.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {string|null} activePersona - Name of active persona, or null
 * @param {object} [learningsContext] - Context for retrieving relevant learnings
 * @param {string[]} [learningsContext.personNames] - People mentioned
 * @param {string[]} [learningsContext.projectNames] - Projects referenced
 * @param {string} [learningsContext.skillName] - Active skill name
 * @param {string} [learningsContext.topic] - Conversation topic
 * @param {object} [extraOptions] - Additional options
 * @param {string} [extraOptions.calibrationInstruction] - Response length calibration instruction
 * @param {string} [extraOptions.preflightContext] - Pre-flight gathered context
 * @returns {string} Complete system prompt
 */
function buildSystemPrompt(vaultPath, activePersona, learningsContext, extraOptions) {
  const { systemPrompt } = buildTieredContext(vaultPath, {
    persona: activePersona || undefined,
    activeSkill: learningsContext?.skillName || undefined,
    userMessage: learningsContext?.topic || undefined,
    learningsContext: learningsContext || undefined,
    calibrationInstruction: extraOptions?.calibrationInstruction || undefined,
    preflightContext: extraOptions?.preflightContext || undefined,
    energyInstruction: extraOptions?.energyInstruction || undefined,
  });

  return systemPrompt;
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

  // Inject upstream artifact context when a skill is active
  if (options.activeSkill && options.vaultPath) {
    try {
      const upstream = getUpstreamArtifacts(options.vaultPath, options.activeSkill);
      const artifactCtx = formatArtifactsForPrompt(upstream);
      if (artifactCtx) {
        fullSystem += `\n\n---\n${artifactCtx}`;
      }
    } catch {
      // Artifact injection should never crash the agent
    }
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

      // Execute tool calls with rich event metadata
      const toolResults = [];
      const isParallel = toolBlocks.length > 1;
      const citations = [];

      // Emit turn progress
      yield {
        type: 'turn_progress',
        turn,
        maxTurns,
        toolCount: toolBlocks.length,
        isParallel,
      };

      for (let ti = 0; ti < toolBlocks.length; ti++) {
        const block = toolBlocks[ti];
        const tier = getToolTier(block.name);
        const startTime = Date.now();

        yield {
          type: 'tool_start',
          name: block.name,
          input: block.input,
          tier,
          index: ti,
          total: toolBlocks.length,
          isParallel,
        };

        // Permission check — yield a permission_request if not auto-tier
        // The caller can handle this or ignore it (backwards compatible)
        if (tier !== 'auto' && options.checkPermission) {
          const allowed = await options.checkPermission(block.name, block.input, tier);
          if (!allowed) {
            const result = { error: `Permission denied for ${block.name}` };
            yield { type: 'tool_result', name: block.name, result, success: false, tier, duration: 0 };
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
              is_error: true,
            });
            continue;
          }
        }

        let result;
        let success = true;
        try {
          result = await executeTool(block.name, block.input);
          if (result && result.error) success = false;
        } catch (err) {
          result = { error: err.message };
          success = false;
        }

        const duration = Date.now() - startTime;
        const preview = getResultPreview(block.name, result);
        const citation = extractCitations(block.name, block.input, result);
        if (citation) citations.push(citation);

        // Estimate result size in tokens (~4 chars per token)
        const resultStr = JSON.stringify(result);
        const resultTokens = Math.ceil(resultStr.length / 4);

        yield {
          type: 'tool_result',
          name: block.name,
          result,
          success,
          tier,
          duration,
          preview,
          resultTokens,
        };

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultStr,
          is_error: !success,
        });
      }

      // Emit citations if we collected any
      if (citations.length > 0) {
        yield { type: 'citations', sources: citations };
      }

      // Checkpoint summary every 5 turns
      if (turn % 5 === 0 && turn < maxTurns) {
        yield {
          type: 'checkpoint',
          turn,
          maxTurns,
          message: `Step ${turn}/${maxTurns} — ${toolBlocks.length} tool${toolBlocks.length > 1 ? 's' : ''} executed`,
        };
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
  MODEL_PRICING,
  TOOL_TIERS,
  getToolTier,
};
