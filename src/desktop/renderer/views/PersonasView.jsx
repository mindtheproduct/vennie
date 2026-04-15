import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search, Sparkles, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils.js';
import PersonaCard from '../components/PersonaCard.jsx';
import PersonaDetailPanel from '../components/PersonaDetailPanel.jsx';

const CATEGORIES = ['all', 'product', 'leadership', 'strategy', 'career', 'mindset', 'analytics'];

const CATEGORY_LABEL = {
  all: 'All',
  product: 'Product',
  leadership: 'Leadership',
  strategy: 'Strategy',
  career: 'Career',
  mindset: 'Mindset',
  analytics: 'Analytics',
};

export default function PersonasView({ appData, onNavigate }) {
  const [tab, setTab] = useState('installed');
  const [registry, setRegistry] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [activePersona, setActivePersona] = useState(null);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedPersona, setSelectedPersona] = useState(null);

  const loadData = useCallback(async () => {
    const [registryData, installedData, settings] = await Promise.all([
      window.vennie.getPersonaRegistry(),
      window.vennie.listPersonas(),
      window.vennie.getSettings(),
    ]);
    if (Array.isArray(registryData)) setRegistry(registryData);
    if (Array.isArray(installedData)) setInstalled(installedData);
    setActivePersona(settings?.persona || null);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Merge installed personas with registry data for richer cards
  const installedWithMeta = installed.map(p => {
    const regEntry = registry.find(r => r.id === p.id);
    return { ...p, ...(regEntry || {}), source: p.source, installed: true };
  });

  const browseItems = registry.filter(p => !p.installed);

  function applyFilters(items) {
    let result = items;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.bestFor || '').toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'all') {
      result = result.filter(p => p.category === categoryFilter);
    }
    return result;
  }

  async function handleInstall() {
    if (!selectedPersona) return;
    await window.vennie.installPersona(selectedPersona.id);
    await loadData();
    setSelectedPersona(prev => prev ? { ...prev, installed: true } : null);
  }

  async function handleUninstall() {
    if (!selectedPersona) return;
    await window.vennie.uninstallPersona(selectedPersona.id);
    await loadData();
    setSelectedPersona(null);
  }

  async function handleActivate() {
    if (!selectedPersona) return;
    await window.vennie.setPersona(selectedPersona.id);
    setActivePersona(selectedPersona.id);
  }

  async function handleDeactivate() {
    await window.vennie.setPersona('off');
    setActivePersona(null);
  }

  const isSelectedInstalled = selectedPersona
    ? installed.some(p => p.id === selectedPersona.id) || selectedPersona.installed
    : false;
  const isSelectedActive = selectedPersona?.id === activePersona;

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[760px] mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Personas</h1>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">
              {installed.length} installed · {browseItems.length} available
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] focus-within:bg-[var(--surface-tertiary)] transition-colors w-[200px]">
            <Search size={13} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
          {[
            { id: 'installed', label: 'Installed' },
            { id: 'browse', label: 'Browse' },
            { id: 'create', label: 'Create' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors relative',
                tab === t.id
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
            >
              {t.label}
              {tab === t.id && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--accent)] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'installed' && (
          <div>
            {/* Active persona quick-deactivate */}
            {activePersona && (
              <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                <Sparkles size={14} className="text-[var(--accent)] shrink-0" />
                <span className="text-sm text-[var(--accent)] font-medium flex-1">
                  {installed.find(p => p.id === activePersona)?.name || activePersona} is active
                </span>
                <button
                  onClick={handleDeactivate}
                  className="text-[11px] text-[var(--accent)] hover:text-[var(--text-primary)] font-medium transition-colors"
                >
                  Deactivate
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {applyFilters(installedWithMeta).map(p => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  isActive={p.id === activePersona}
                  isInstalled={true}
                  onClick={() => setSelectedPersona({ ...p, source: p.source, installed: true })}
                />
              ))}
            </div>

            {applyFilters(installedWithMeta).length === 0 && (
              <Empty message={filter ? 'No personas match your filter.' : 'No personas installed yet. Check the Browse tab.'} />
            )}
          </div>
        )}

        {tab === 'browse' && (
          <div>
            {/* Category pills */}
            <div className="flex items-center gap-1.5 mb-6 overflow-x-auto">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors',
                    categoryFilter === cat
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)]'
                  )}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {applyFilters(browseItems).map(p => (
                <PersonaCard
                  key={p.id}
                  persona={p}
                  isActive={false}
                  isInstalled={false}
                  onClick={() => setSelectedPersona(p)}
                />
              ))}
            </div>

            {applyFilters(browseItems).length === 0 && (
              <Empty message={filter || categoryFilter !== 'all' ? 'No personas match your filters.' : 'All marketplace personas are installed.'} />
            )}
          </div>
        )}

        {tab === 'create' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-[var(--surface-secondary)] flex items-center justify-center mb-4">
              <MessageSquare size={22} className="text-[var(--text-tertiary)]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Create a Custom Persona</h3>
            <p className="text-[13px] text-[var(--text-tertiary)] text-center max-w-[320px] mb-6 leading-relaxed">
              Describe who you want to spar with — a specific leader, a mindset, an archetype — and Vennie will build it.
            </p>
            <button
              onClick={() => {
                if (onNavigate) onNavigate('chat');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: 'persona create' }));
                }, 100);
              }}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
            >
              Create in Chat
            </button>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedPersona && (
          <PersonaDetailPanel
            persona={selectedPersona}
            isInstalled={isSelectedInstalled}
            isActive={isSelectedActive}
            onInstall={handleInstall}
            onUninstall={handleUninstall}
            onActivate={handleActivate}
            onDeactivate={handleDeactivate}
            onClose={() => setSelectedPersona(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Empty({ message }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-[var(--text-tertiary)]">{message}</p>
    </div>
  );
}
