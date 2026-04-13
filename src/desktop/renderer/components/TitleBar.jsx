import React from 'react';
import { cn } from '../lib/utils.js';

export default function TitleBar({ view, appData }) {
  const model = (appData?.model || '')
    .replace('claude-', '')
    .replace('-20250514', '')
    .replace('-4-6', ' 4.6')
    .replace('-4-5-20251001', ' 4.5');

  const cost = appData?.cost?.cost || 0;

  return (
    <div
      className="titlebar-drag h-[36px] flex items-center px-4 bg-[var(--surface-primary)] select-none"
      style={{ paddingLeft: 80 }}
    >
      {/* Left — subtle view indicator */}
      <span className="text-[11px] text-[var(--text-tertiary)] font-medium tracking-wide uppercase">
        {view === 'chat' ? '' : view}
      </span>

      <div className="flex-1" />

      {/* Right — model + cost, quiet */}
      <div className="flex items-center gap-3 text-[11px] font-mono">
        {model && (
          <span className="text-[var(--text-tertiary)]">
            {model}
          </span>
        )}
        {cost > 0 && (
          <span className={cn(cost > 0.05 ? 'text-[var(--warning)]' : 'text-[var(--text-tertiary)]')}>
            ${cost.toFixed(3)}
          </span>
        )}
      </div>
    </div>
  );
}
