'use strict';

const fs = require('fs');
const path = require('path');
// render.js imported lazily below for error messages

// ── MCP Client Manager ─────────────────────────────────────────────────────
// Connects to Python MCP servers defined in .vennie/mcp/*.json.
// Uses @modelcontextprotocol/sdk for protocol handling over stdio transport.

/**
 * Start all MCP servers found in the vault's config directory.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @returns {{ tools: object[], callTool: Function, shutdown: Function }}
 */
async function startMCPServers(vaultPath) {
  const mcpDir = path.join(vaultPath, '.vennie', 'mcp');
  const servers = new Map(); // name → { client, transport, process, tools }
  const allTools = [];

  if (!fs.existsSync(mcpDir)) {
    return { tools: [], callTool: noopCallTool, shutdown: () => {} };
  }

  // Read all MCP config files
  const configFiles = fs.readdirSync(mcpDir).filter(f => f.endsWith('.json'));

  for (const file of configFiles) {
    const configPath = path.join(mcpDir, file);
    const serverName = path.basename(file, '.json');

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const server = await startOneServer(serverName, config, vaultPath);

      if (server) {
        servers.set(serverName, server);

        // Namespace tools: mcp__servername__toolname
        for (const tool of server.tools) {
          const namespacedTool = {
            name: `mcp__${serverName}__${tool.name}`,
            description: tool.description || '',
            input_schema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} },
            _server: serverName,
            _originalName: tool.name,
          };
          allTools.push(namespacedTool);
        }
      }
    } catch {
      // Silent — MCP servers are optional, don't clutter startup
    }
  }

  // Build the tool caller
  async function callTool(namespacedName, args) {
    // Parse mcp__servername__toolname
    const parts = namespacedName.split('__');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      return { error: `Invalid MCP tool name format: ${namespacedName}` };
    }

    const serverName = parts[1];
    const toolName = parts.slice(2).join('__'); // handle tool names with double underscores

    const server = servers.get(serverName);
    if (!server) {
      return { error: `MCP server "${serverName}" not connected` };
    }

    try {
      const result = await server.client.callTool({ name: toolName, arguments: args });
      return result;
    } catch (err) {
      return { error: `MCP tool call failed: ${err.message}` };
    }
  }

  // Graceful shutdown
  function shutdown() {
    for (const [name, server] of servers) {
      try {
        if (server.transport && typeof server.transport.close === 'function') {
          server.transport.close();
        }
      } catch {
        // Best effort
      }
    }
    servers.clear();
  }

  try {
    const { renderSystem } = require('../cli/render.js');
    if (servers.size > 0) {
      renderSystem(`${servers.size} MCP server${servers.size > 1 ? 's' : ''} connected (${allTools.length} tools)`);
    }
  } catch {
    // Desktop mode — no CLI render available, skip terminal output
  }

  return { tools: allTools, callTool, shutdown };
}

/**
 * Start a single MCP server from its config.
 * Supports two transport types:
 *  - stdio (default): spawns a local process
 *  - http: connects to a remote Streamable HTTP MCP endpoint
 */
async function startOneServer(name, config, vaultPath) {
  // Config may nest under "server" key or be flat
  const srv = config.server || config;

  // Late-require MCP SDK
  let Client;
  try {
    Client = require('@modelcontextprotocol/sdk/client/index.js').Client;
  } catch (err) {
    throw new Error(`@modelcontextprotocol/sdk not installed: ${err.message}`);
  }

  const transportType = srv.transport || 'stdio';

  // ── HTTP transport (remote MCP servers) ───────────────────────────────
  if (transportType === 'http') {
    const url = srv.url;
    if (!url) throw new Error(`HTTP MCP server "${name}" missing url`);

    // Resolve env var references in headers (e.g. "${MTP_API_KEY}")
    const rawHeaders = srv.headers || {};
    const headers = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      headers[k] = typeof v === 'string'
        ? v.replace(/\$\{(\w+)\}/g, (_, envVar) => process.env[envVar] || '')
        : v;
    }

    // Build a lightweight client that speaks JSON-RPC over HTTP
    const httpClient = {
      async callTool({ name: toolName, arguments: toolArgs }) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: toolName, arguments: toolArgs },
            id: Date.now(),
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
        return json.result;
      },
    };

    // Discover tools via tools/list
    const listRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1,
      }),
    });
    const listJson = await listRes.json();
    const tools = listJson.result?.tools || [];

    return { client: httpClient, transport: null, tools };
  }

  // ── Stdio transport (local process) ───────────────────────────────────
  let StdioClientTransport;
  try {
    StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport;
  } catch (err) {
    throw new Error(`@modelcontextprotocol/sdk not installed: ${err.message}`);
  }

  const command = srv.command;
  const args = (srv.args || []).map(a => a.replace(/\$\{workspaceFolder\}/g, vaultPath));
  const rawEnv = srv.env || {};
  const resolvedEnv = {};
  for (const [k, v] of Object.entries(rawEnv)) {
    resolvedEnv[k] = typeof v === 'string' ? v.replace(/\$\{workspaceFolder\}/g, vaultPath) : v;
  }
  const env = { ...process.env, ...resolvedEnv, VENNIE_VAULT: vaultPath };
  const cwd = srv.cwd ? path.resolve(vaultPath, srv.cwd) : vaultPath;

  const transport = new StdioClientTransport({
    command,
    args,
    env,
    cwd,
    stderr: 'pipe',
  });

  const client = new Client({
    name: `vennie-${name}`,
    version: '0.1.0',
  });

  await client.connect(transport);

  const toolsResult = await client.listTools();
  const tools = toolsResult.tools || [];

  return { client, transport, tools };
}

/**
 * No-op tool caller for when no MCP servers are configured.
 */
async function noopCallTool(name, _args) {
  return { error: `No MCP servers connected. Cannot call ${name}.` };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  startMCPServers,
};
