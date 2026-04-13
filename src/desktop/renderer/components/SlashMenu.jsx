import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils.js';

export default function SlashMenu({ query, skills, onSelect, onClose, position }) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef(null);

  const filtered = (skills || []).filter(s =>
    !query || s.name.toLowerCase().includes(query.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  // Reset selection when filter changes
  useEffect(() => {
    setSelected(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selected];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(s => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[selected]) onSelect(filtered[selected]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selected, filtered, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute bottom-full mb-2 left-0 w-[320px] glass-panel rounded-xl overflow-hidden animate-scale-in z-50"
      style={position}
    >
      <div className="px-2 py-1.5 border-b border-[var(--border)]">
        <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest px-2">Skills</span>
      </div>
      <div ref={listRef} className="max-h-[280px] overflow-auto py-1 px-1.5">
        {filtered.map((skill, i) => (
          <button
            key={skill.name}
            onClick={() => onSelect(skill)}
            onMouseEnter={() => setSelected(i)}
            className={cn(
              'w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
              i === selected
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
            )}
          >
            <span className="text-[var(--accent)] font-mono text-xs opacity-60 shrink-0">/</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium font-mono">{skill.name}</div>
              {skill.description && (
                <div className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">{skill.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
