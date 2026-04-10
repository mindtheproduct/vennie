'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const { agentLoop, buildSystemPrompt, DEFAULT_MODEL } = require('./agent.js');
const { getToolDefinitions, executeTool } = require('./tools.js');
const { loadSkill, listSkills } = require('./skills.js');
const { startMCPServers } = require('./mcp.js');
const {
  renderDelta, flushRender,
  renderToolStart, renderToolResult,
  renderWelcome, renderPrompt, renderInputClose,
  renderResponseStart, renderResponseEnd,
  renderError, renderSystem, renderCost,
  renderPersonaSwitch, renderHelp,
  startSpinner, stopSpinner,
  setBuddyPose, animateBuddy,
  fg, style, PAD,
} = require('./render.js');
const { createCompleter } = require('./completer.js');

// ── CLI Entry Point ─────────────────────────────────────────────────────────

const VERSION = (() => {
  try {
    return require(path.resolve(__dirname, '..', 'package.json')).version;
  } catch {
    return '0.1.0';
  }
})();

/**
 * Start the Vennie CLI REPL.
 */
async function startCLI(vaultPath) {
  // ── State ───────────────────────────────────────────────────────────────
  const messages = [];
  let activePersona = null;
  let skillContext = null;
  let sessionCost = 0;
  let sessionInputTokens = 0;
  let sessionOutputTokens = 0;

  // ── readline setup ──────────────────────────────────────────────────────
  const PROMPT = `${PAD}> `;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
  });

  // Graceful Ctrl+C
  let ctrlCCount = 0;
  rl.on('SIGINT', () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log(`\n\n${PAD}${fg.dimBlue}See you later. Go ship something great.${style.reset}\n`);
      shutdown();
      process.exit(0);
    }
    console.log(`\n\n${PAD}${fg.skyBlue}Leave already?${style.reset} ${fg.dimBlue}Press Ctrl+C again to confirm, or keep typing.${style.reset}\n`);
    renderPrompt(activePersona, rl);
  });

  rl.on('line', () => { ctrlCCount = 0; });

  // ── Load system prompt ──────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(vaultPath, activePersona);

  // ── Start MCP servers ─────────────────────────────────────────────────
  let mcpResult = { tools: [], callTool: null, shutdown: () => {} };
  try {
    mcpResult = await startMCPServers(vaultPath);
  } catch (err) {
    // Silent — MCP is optional
  }

  // ── Combine tools ─────────────────────────────────────────────────────
  const builtInTools = getToolDefinitions();
  const allTools = [...builtInTools, ...mcpResult.tools];

  // ── Tool execution wrapper ────────────────────────────────────────────
  const toolContext = {
    vaultPath,
    readline: rl,
    personaName: activePersona,
    mcpCallTool: mcpResult.callTool,
  };

  async function execTool(name, input) {
    return executeTool(name, input, toolContext);
  }

  // ── Welcome ─────────────────────────────────────────────────────────────
  const modelName = process.env.VENNIE_MODEL || DEFAULT_MODEL;
  await renderWelcome(VERSION, { model: modelName, vaultPath });

  renderSystem(`${allTools.length} tools ready · /help for commands`);
  console.log();

  // ── Slash command autocomplete ───────────────────────────────────────
  const builtInCommands = [
    { name: 'help', description: 'Show available commands and skills' },
    { name: 'status', description: 'Show session status' },
    { name: 'persona', description: 'Switch active persona' },
    { name: 'voice', description: 'Voice training and style' },
    { name: 'dance', description: 'Make vennie dance ♪' },
    { name: 'buddy', description: 'Buddy commands (pet, sleep, wake)' },
    { name: 'cost', description: 'Show session cost breakdown' },
    { name: 'clear', description: 'Clear conversation history' },
    { name: 'quit', description: 'Exit Vennie' },
  ];
  const skillCommands = listSkills(vaultPath).map(s => ({
    name: s.name,
    description: s.description,
  }));
  const allCommands = [...builtInCommands, ...skillCommands];
  const completer = createCompleter(rl, allCommands);
  completer.attach();

  // ── Shutdown ────────────────────────────────────────────────────────────
  function shutdown() {
    completer.detach();
    mcpResult.shutdown();
    rl.close();
  }

  // ── REPL ────────────────────────────────────────────────────────────────

  async function repl() {
    renderPrompt(activePersona, rl);

    rl.on('line', async (input) => {
      const trimmed = input.trim();
      ctrlCCount = 0;

      // Dismiss autocomplete and close the input box
      completer.hideMenu();
      renderInputClose();

      // Empty input — just re-prompt
      if (!trimmed) {
        renderPrompt(activePersona, rl);
        return;
      }

      // ── Slash commands ────────────────────────────────────────────────
      if (trimmed.startsWith('/')) {
        const handled = await handleSlashCommand(trimmed);
        if (handled) {
          renderPrompt(activePersona, rl);
          return;
        }
      }

      // ── Send to agent ─────────────────────────────────────────────────
      rl.pause();

      let userContent = trimmed;
      if (skillContext) {
        userContent = `${skillContext}\n\n---\n\nUser request: ${trimmed}`;
        skillContext = null;
      }

      messages.push({ role: 'user', content: userContent });

      const currentSystemPrompt = buildSystemPrompt(vaultPath, activePersona);

      setBuddyPose('think');
      startSpinner();

      try {
        const stream = agentLoop(messages, allTools, currentSystemPrompt, {
          executeTool: execTool,
          skillContext: null,
        });

        let firstText = true;

        for await (const event of stream) {
          switch (event.type) {
            case 'text_delta':
              if (firstText) {
                stopSpinner();
                renderResponseStart();
                firstText = false;
              }
              renderDelta(event.text);
              break;

            case 'tool_start':
              stopSpinner();
              if (firstText) {
                renderResponseStart();
                firstText = false;
              }
              renderToolStart(event.name, event.input);
              startSpinner();
              break;

            case 'tool_result':
              stopSpinner();
              renderToolResult(event.name, event.result, event.success);
              startSpinner();
              break;

            case 'usage':
              stopSpinner();
              sessionInputTokens += event.inputTokens;
              sessionOutputTokens += event.outputTokens;
              sessionCost += event.cost;
              // Cost tracked silently — visible via /cost
              break;

            case 'error':
              stopSpinner();
              renderError(event.message);
              break;

            case 'done':
              stopSpinner();
              flushRender();
              renderResponseEnd();
              setBuddyPose('happy');
              break;
          }
        }
      } catch (err) {
        stopSpinner();
        renderError(`Unexpected error: ${err.message}`);
      }

      rl.resume();
      renderPrompt(activePersona, rl);
    });
  }

  // ── Slash Command Handler ─────────────────────────────────────────────

  async function handleSlashCommand(input) {
    const parts = input.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case 'help':
        renderHelp(listSkills(vaultPath));
        return true;

      case 'status':
        printStatus();
        return true;

      case 'persona': {
        const name = args.trim();
        if (!name || name === 'off') {
          activePersona = null;
          toolContext.personaName = null;
          renderPersonaSwitch(null);
        } else {
          activePersona = name;
          toolContext.personaName = name;
          renderPersonaSwitch(name);
        }
        return true;
      }

      case 'voice':
        if (args.trim() === 'train') {
          const skill = loadSkill(vaultPath, 'voice');
          if (skill) {
            skillContext = skill.body;
            console.log(`\n${PAD}${fg.skyBlue}Voice training activated.${style.reset} ${fg.dimBlue}Paste a writing sample to begin.${style.reset}\n`);
          } else {
            renderSystem('Voice training skill not found.');
          }
        }
        return true;

      case 'news': {
        const skill = loadSkill(vaultPath, 'news');
        if (skill) {
          skillContext = skill.body;
          console.log(`\n${PAD}${fg.dimBlue}Loading today's signal…${style.reset}\n`);
          return false;
        }
        renderSystem('News skill not found.');
        return true;
      }

      case 'quit':
      case 'exit':
        console.log(`\n${PAD}${fg.dimBlue}See you later. Go ship something great.${style.reset}\n`);
        shutdown();
        process.exit(0);
        return true;

      case 'cost':
        printSessionCost();
        return true;

      case 'clear':
        messages.length = 0;
        console.log(`\n${PAD}${fg.dimBlue}Conversation cleared. Fresh start.${style.reset}\n`);
        return true;

      case 'dance':
        rl.pause();
        await animateBuddy('dance', {
          onFrame: () => {
            // Redraw buddy in place — move up 4 lines (buddy + label), redraw
            process.stdout.write(`\x1b[s`); // save cursor
          },
        });
        console.log(`\n${PAD}${fg.skyBlue}♪ vennie danced! ♪${style.reset}\n`);
        setBuddyPose('happy');
        rl.resume();
        return true;

      case 'buddy': {
        const sub = args.trim().toLowerCase();
        if (sub === 'pet') {
          rl.pause();
          await animateBuddy('pet');
          console.log(`\n${PAD}${fg.skyBlue}♥ vennie loved that! ♥${style.reset}\n`);
          rl.resume();
        } else if (sub === 'sleep') {
          setBuddyPose('sleep');
          console.log(`\n${PAD}${fg.dimBlue}vennie is napping... zzz${style.reset}\n`);
        } else if (sub === 'wake') {
          setBuddyPose('idle');
          console.log(`\n${PAD}${fg.skyBlue}vennie is awake!${style.reset}\n`);
        } else {
          console.log(`\n${PAD}${fg.dimBlue}Buddy commands: /buddy pet, /buddy sleep, /buddy wake, /dance${style.reset}\n`);
        }
        return true;
      }

      default: {
        const skill = loadSkill(vaultPath, cmd);
        if (skill) {
          skillContext = skill.body;
          console.log(`\n${PAD}${fg.accentBlue}/${cmd}${style.reset} ${fg.dimBlue}loaded — ${skill.description || 'skill activated'}${style.reset}\n`);
          if (args) {
            return false;
          }
          return false;
        }
        renderSystem(`Unknown command: /${cmd}. Type /help for available commands.`);
        return true;
      }
    }
  }

  // ── Status & Cost ────────────────────────────────────────────────────

  function printStatus() {
    const w = Math.min(process.stdout.columns || 80, 100);
    console.log();
    console.log(`${PAD}${fg.dimBlue}${'─'.repeat(w - 4)}${style.reset}`);
    console.log(`${PAD}${style.bold}${fg.skyBlue}Session Status${style.reset}`);
    console.log(`${PAD}${fg.dimBlue}${'─'.repeat(w - 4)}${style.reset}`);
    console.log();

    const rows = [
      ['Model', process.env.VENNIE_MODEL || DEFAULT_MODEL],
      ['Vault', vaultPath],
      ['Persona', activePersona || 'default'],
      ['Messages', `${messages.length}`],
      ['Tools', `${allTools.length} (${builtInTools.length} built-in + ${mcpResult.tools.length} MCP)`],
      ['Cost', `$${sessionCost.toFixed(4)}`],
    ];

    for (const [label, value] of rows) {
      console.log(`${PAD}  ${fg.dimBlue}${label.padEnd(12)}${style.reset}${value}`);
    }

    console.log();
  }

  function printSessionCost() {
    console.log();
    console.log(`${PAD}${fg.dimBlue}${'─'.repeat(40)}${style.reset}`);
    console.log(`${PAD}${style.bold}${fg.skyBlue}Session Cost${style.reset}`);
    console.log(`${PAD}${fg.dimBlue}${'─'.repeat(40)}${style.reset}`);
    console.log();
    console.log(`${PAD}  ${fg.dimBlue}Input tokens  ${style.reset}${sessionInputTokens.toLocaleString()}`);
    console.log(`${PAD}  ${fg.dimBlue}Output tokens ${style.reset}${sessionOutputTokens.toLocaleString()}`);
    console.log(`${PAD}  ${fg.dimBlue}Total cost    ${style.reset}$${sessionCost.toFixed(4)}`);
    console.log(`${PAD}  ${fg.dimBlue}Model         ${style.reset}${process.env.VENNIE_MODEL || DEFAULT_MODEL}`);
    console.log();
  }

  // ── Start ─────────────────────────────────────────────────────────────
  repl();
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = { startCLI };
