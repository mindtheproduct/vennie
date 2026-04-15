import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Play, Square, Trash2, Star, User, Clock } from 'lucide-react';
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

export default function PersonaDetailPanel({ persona, isInstalled, isActive, onInstall, onUninstall, onActivate, onDeactivate, onClose }) {
  const [loading, setLoading] = useState(false);
  const dot = CATEGORY_DOT[persona.category] || CATEGORY_DOT.product;

  async function handleAction(action) {
    setLoading(true);
    try { await action(); } finally { setLoading(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: 'rgba(0, 0, 0, 0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="w-[420px] h-full bg-[var(--surface-primary)] border-l border-[var(--border)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('w-2 h-2 rounded-full', dot)} />
              <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-tertiary)]">
                {persona.category}
              </span>
              {persona.type === 'real-person' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--success)]/15 text-[var(--success)] font-medium uppercase tracking-wider">
                  Real Person
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{persona.name}</h2>
            {persona.author && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">by {persona.author}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-tertiary)] transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 px-6 pb-4">
          {persona.rating && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              <Star size={11} className="text-[var(--warning)] fill-[var(--warning)]" />
              {persona.rating}
            </span>
          )}
          {persona.downloads != null && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
              <Download size={11} />
              {persona.downloads.toLocaleString()}
            </span>
          )}
          {persona.version && (
            <span className="text-[11px] font-mono text-[var(--text-tertiary)]">v{persona.version}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          {/* Description */}
          <Section title="About">
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{persona.description}</p>
          </Section>

          {/* Style */}
          {persona.style && (
            <Section title="Style">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{persona.style}</p>
            </Section>
          )}

          {/* Best for */}
          {persona.bestFor && (
            <Section title="Best for">
              <div className="flex flex-wrap gap-1.5">
                {persona.bestFor.split(',').map((item, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                    {item.trim()}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Tags */}
          {persona.tags?.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {persona.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] font-mono">
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Action bar */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center gap-2">
          {!isInstalled && (
            <button
              onClick={() => handleAction(onInstall)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              {loading ? 'Installing...' : 'Install'}
            </button>
          )}
          {isInstalled && !isActive && (
            <>
              <button
                onClick={() => handleAction(onActivate)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                <Play size={14} />
                {loading ? 'Activating...' : 'Activate'}
              </button>
              {persona.source !== 'core' && (
                <button
                  onClick={() => handleAction(onUninstall)}
                  disabled={loading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--surface-secondary)] text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
          {isInstalled && isActive && (
            <button
              onClick={() => handleAction(onDeactivate)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--surface-secondary)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--surface-tertiary)] transition-colors disabled:opacity-50"
            >
              <Square size={14} />
              {loading ? 'Deactivating...' : 'Deactivate'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-2">{title}</h3>
      {children}
    </div>
  );
}
