import React from 'react';
import { User, Users, Sparkles, Star } from 'lucide-react';
import { cn } from '../lib/utils.js';

const CATEGORY_DOT = {
  product: 'bg-[var(--accent)]',
  career: 'bg-[var(--success)]',
  leadership: 'bg-[#a78bfa]',
  strategy: 'bg-[var(--cyan)]',
  mindset: 'bg-[var(--warning)]',
  analytics: 'bg-[var(--danger)]',
  brand: 'bg-[var(--text-tertiary)]',
  custom: 'bg-[var(--text-tertiary)]',
};

const TYPE_BADGE = {
  core: { label: 'Core', className: 'bg-[var(--accent-subtle)] text-[var(--accent)]' },
  'real-person': { label: 'Real Person', className: 'bg-[var(--success)]/15 text-[var(--success)]' },
  archetype: { label: 'Community', className: 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]' },
};

export default function PersonaCard({ persona, isActive, isInstalled, onClick }) {
  const badge = TYPE_BADGE[persona.type || persona.source || 'archetype'];
  const dot = CATEGORY_DOT[persona.category] || CATEGORY_DOT.product;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left px-4 py-3.5 rounded-xl transition-all relative',
        isActive
          ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/30'
          : 'bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)]'
      )}
    >
      {/* Category + Name */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
        <span className={cn(
          'text-[13px] font-semibold truncate',
          isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)] group-hover:text-[var(--accent)]'
        )}>
          {persona.name}
        </span>
      </div>

      {/* Description */}
      <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed line-clamp-2 mb-2.5">
        {persona.description || persona.bestFor || ''}
      </p>

      {/* Footer: badge + rating */}
      <div className="flex items-center justify-between">
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider', badge.className)}>
          {badge.label}
        </span>
        <div className="flex items-center gap-1.5">
          {persona.rating && (
            <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)]">
              <Star size={9} className="text-[var(--warning)] fill-[var(--warning)]" />
              {persona.rating}
            </span>
          )}
          {isInstalled && !isActive && (
            <span className="text-[9px] text-[var(--success)] font-medium">Installed</span>
          )}
          {isActive && (
            <span className="text-[9px] text-[var(--accent)] font-medium">Active</span>
          )}
        </div>
      </div>
    </button>
  );
}

export { CATEGORY_DOT };
