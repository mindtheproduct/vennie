import React from 'react';
import { X, FileText, User, Hash } from 'lucide-react';
import { cn } from '../lib/utils.js';

const CHIP_ICONS = {
  file: FileText,
  person: User,
  project: Hash,
};

const CHIP_COLORS = {
  file: 'text-[var(--cyan)]',
  person: 'text-[var(--accent)]',
  project: 'text-[var(--success)]',
};

export default function ContextChips({ chips, onRemove }) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {chips.map((chip, i) => {
        const Icon = CHIP_ICONS[chip.type] || FileText;
        const color = CHIP_COLORS[chip.type] || 'text-[var(--text-tertiary)]';
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md bg-[var(--surface-tertiary)] text-[11px] font-mono group"
          >
            <Icon size={10} className={cn('shrink-0', color)} />
            <span className="text-[var(--text-secondary)]">{chip.label}</span>
            <button
              onClick={() => onRemove(i)}
              className="w-4 h-4 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              <X size={9} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
