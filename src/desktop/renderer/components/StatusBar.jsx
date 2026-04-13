import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils.js';

export default function StatusBar({ appData }) {
  const [mcpCount, setMcpCount] = useState(0);
  const [vaultSize, setVaultSize] = useState(null);

  useEffect(() => {
    // Vault stats
    if (window.vennie?.getPulse) {
      window.vennie.getPulse().then(data => {
        if (data?.stats) {
          const total = Object.values(data.stats).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
          setVaultSize(total);
        }
      });
    }
    // MCP server count
    if (window.vennie?.getMcpStatus) {
      window.vennie.getMcpStatus().then(data => {
        if (data?.servers) setMcpCount(data.servers.length);
      });
    }
  }, []);

  const persona = appData?.persona || 'default';
  const model = (appData?.model || '').replace('claude-', '').replace(/-\d{8}$/, '');

  return (
    <div className="h-[24px] flex items-center px-3 gap-4 bg-[var(--surface-secondary)] text-[10px] font-mono text-[var(--text-tertiary)] select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Connection dot */}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
          <span>connected</span>
        </div>

        {mcpCount > 0 && (
          <span>{mcpCount} MCP{mcpCount !== 1 ? 's' : ''}</span>
        )}

        {vaultSize !== null && (
          <span>{vaultSize} items</span>
        )}
      </div>

      <div className="flex-1" />

      {/* Right */}
      <div className="flex items-center gap-3">
        {persona !== 'default' && persona && (
          <span className="text-[var(--accent)]">{persona}</span>
        )}
        {model && <span>{model}</span>}
        <span>v{appData?.version || '?'}</span>
      </div>
    </div>
  );
}
