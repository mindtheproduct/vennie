import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Radar, Plus, Trash2, RefreshCw, ExternalLink, Globe } from 'lucide-react';
import { cn } from '../lib/utils.js';

function getStaleness(lastChecked) {
  if (!lastChecked) return { label: 'never', color: 'var(--danger)', status: 'red' };
  const days = Math.ceil((Date.now() - new Date(lastChecked)) / 86400000);
  if (days <= 3) return { label: `${days}d ago`, color: 'var(--success)', status: 'green' };
  if (days <= 7) return { label: `${days}d ago`, color: 'var(--warning)', status: 'yellow' };
  return { label: `${days}d ago`, color: 'var(--danger)', status: 'red' };
}

const CATEGORY_STYLES = {
  direct: { bg: 'rgba(239, 68, 68, 0.1)', fg: '#FB7185' },
  indirect: { bg: 'rgba(251, 191, 36, 0.1)', fg: '#FBBF24' },
  emerging: { bg: 'rgba(96, 165, 250, 0.1)', fg: '#60A5FA' },
};

export default function RadarView({ appData }) {
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(() => {
    window.vennie.getRadar().then(data => {
      if (Array.isArray(data)) setCompetitors(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    await window.vennie.send(`/radar add ${newName.trim()} ${newUrl.trim()}`);
    setNewName('');
    setNewUrl('');
    setAdding(false);
    setTimeout(loadData, 1000);
  }

  async function handleRemove(name) {
    await window.vennie.send(`/radar remove ${name}`);
    setCompetitors(prev => prev.filter(c => c.name !== name));
  }

  async function handleCheck() {
    await window.vennie.send('/radar check');
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
        <div className="max-w-[860px] mx-auto px-8 py-8">
          <div className="shimmer h-8 w-56 rounded-lg mb-8" />
          <div className="shimmer h-12 rounded-xl mb-6" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="shimmer h-32 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[860px] mx-auto px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Competitive Radar</h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              {competitors.length} competitor{competitors.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
          {competitors.length > 0 && (
            <button
              onClick={handleCheck}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-subtle)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] text-sm font-medium transition-all"
            >
              <RefreshCw size={14} />
              Scan all
            </button>
          )}
        </motion.div>

        {/* Add form */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="surface-card p-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Competitor name"
              className="flex-1 bg-[var(--surface-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="URL (optional)"
              className="flex-1 bg-[var(--surface-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || adding}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-all"
            >
              <Plus size={14} />
              Track
            </button>
          </div>
        </motion.div>

        {/* Competitor grid */}
        {competitors.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {competitors.map((comp, i) => {
              const staleness = getStaleness(comp.lastChecked);
              const catStyle = CATEGORY_STYLES[comp.categories?.[0]] || CATEGORY_STYLES.direct;
              return (
                <motion.div
                  key={comp.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.04 }}
                  className="surface-card p-5 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: staleness.color }} />
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">{comp.name}</h3>
                    </div>
                    <button
                      onClick={() => handleRemove(comp.name)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-tertiary)] transition-all"
                    >
                      <Trash2 size={13} className="text-[var(--text-tertiary)]" />
                    </button>
                  </div>

                  {comp.categories?.length > 0 && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-block mb-2"
                      style={{ background: catStyle.bg, color: catStyle.fg }}
                    >
                      {comp.categories[0]}
                    </span>
                  )}

                  {comp.urls?.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {comp.urls.slice(0, 2).map((url, j) => (
                        <div key={j} className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] truncate">
                          <Globe size={10} />
                          <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-[var(--text-tertiary)]">
                    Checked: <span style={{ color: staleness.color }}>{staleness.label}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface-card p-8 text-center">
      <Radar size={32} className="text-[var(--text-tertiary)] mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No competitors tracked yet</h3>
      <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto">
        Add a competitor above, or say "track [name] at [url]" in chat.
      </p>
    </div>
  );
}
