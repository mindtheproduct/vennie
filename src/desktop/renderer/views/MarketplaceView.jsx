import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, Check, Star, Sparkles, Zap, Users, Plug, Package } from 'lucide-react';
import { cn } from '../lib/utils.js';

const CATEGORIES = ['all', 'skills', 'personas', 'integrations'];

const MARKETPLACE_ITEMS = [
  // Personas
  { id: 'marty-cagan', name: 'Marty Cagan', category: 'personas', description: 'Direct, evidence-based PM coaching. Challenges feature factory thinking.', author: 'MTP', featured: true, emoji: '🎯' },
  { id: 'shreyas-doshi', name: 'Shreyas Doshi', category: 'personas', description: 'Strategic clarity and LNO framework. Focused on high-leverage work.', author: 'MTP', featured: true, emoji: '🧠' },
  { id: 'lenny-rachitsky', name: 'Lenny Rachitsky', category: 'personas', description: 'Data-driven growth, benchmarks, and practical PM advice.', author: 'MTP', emoji: '📊' },
  { id: 'julie-zhuo', name: 'Julie Zhuo', category: 'personas', description: 'Design leadership, building great teams, and craft-focused feedback.', author: 'MTP', emoji: '✨' },
  { id: 'gibson-biddle', name: 'Gibson Biddle', category: 'personas', description: 'Product strategy DHM framework. Delights, hard-to-copy, margin-enhancing.', author: 'MTP', emoji: '🎲' },
  // Skills
  { id: 'okr-writer', name: 'OKR Writer', category: 'skills', description: 'Generate well-structured OKRs from goals. Challenges weak key results.', author: 'MTP', featured: true, emoji: '🎯' },
  { id: 'sprint-retro', name: 'Sprint Retro', category: 'skills', description: 'Facilitated retrospective with action items and pattern detection.', author: 'Community', emoji: '🔄' },
  { id: 'user-interview', name: 'User Interview Guide', category: 'skills', description: 'Generate interview guides with unbiased questions and synthesis framework.', author: 'MTP', emoji: '🎙️' },
  { id: 'competitive-teardown', name: 'Competitive Teardown', category: 'skills', description: 'Structured competitor analysis with strengths, weaknesses, and opportunities.', author: 'Community', emoji: '🔍' },
  { id: 'pricing-strategy', name: 'Pricing Strategy', category: 'skills', description: 'Pricing model analysis, willingness-to-pay frameworks, and tier design.', author: 'Community', emoji: '💰' },
  { id: 'meeting-notes', name: 'Meeting Notes Pro', category: 'skills', description: 'Enhanced meeting note processing with automatic stakeholder updates.', author: 'Community', emoji: '📝' },
  { id: 'pitch-deck', name: 'Pitch Deck Builder', category: 'skills', description: 'Create compelling product pitches with storytelling structure.', author: 'MTP', emoji: '🎤' },
  // Integrations
  { id: 'linear', name: 'Linear', category: 'integrations', description: 'Sync issues, track sprint progress, auto-create tasks from Vennie.', author: 'MTP', featured: true, emoji: '⚡' },
  { id: 'jira', name: 'Jira', category: 'integrations', description: 'Import tickets, sync status, bi-directional task management.', author: 'MTP', emoji: '🔵' },
  { id: 'notion', name: 'Notion', category: 'integrations', description: 'Sync pages, import wikis, cross-reference with vault.', author: 'Community', emoji: '📓' },
  { id: 'amplitude', name: 'Amplitude', category: 'integrations', description: 'Pull metrics into context, enrich evidence with real data.', author: 'Community', emoji: '📈' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'integrations', description: 'Analytics integration for metric-backed decision making.', author: 'Community', emoji: '📉' },
];

const CATEGORY_ICONS = {
  skills: Zap,
  personas: Users,
  integrations: Plug,
};

export default function MarketplaceView({ appData }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [installed, setInstalled] = useState(new Set());
  const [installing, setInstalling] = useState(null);

  // Load installed items
  useEffect(() => {
    const loadInstalled = async () => {
      const installedSet = new Set();
      try {
        const skills = await window.vennie.listSkills();
        if (Array.isArray(skills)) {
          skills.forEach(s => installedSet.add(s.name?.toLowerCase()));
        }
      } catch {}
      try {
        const personas = await window.vennie.listPersonas();
        if (Array.isArray(personas)) {
          personas.forEach(p => installedSet.add(p.id?.toLowerCase()));
        }
      } catch {}
      setInstalled(installedSet);
    };
    loadInstalled();
  }, []);

  const filtered = useMemo(() => {
    let items = MARKETPLACE_ITEMS;
    if (category !== 'all') items = items.filter(i => i.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.category.includes(q)
      );
    }
    return items;
  }, [category, search]);

  const featured = filtered.filter(i => i.featured);
  const rest = filtered.filter(i => !i.featured);

  async function handleInstall(item) {
    setInstalling(item.id);
    // Simulate install — in real version, this would download from registry
    await new Promise(r => setTimeout(r, 1200));
    setInstalled(prev => new Set([...prev, item.id]));
    setInstalling(null);
  }

  function isInstalled(item) {
    return installed.has(item.id) || installed.has(item.name.toLowerCase());
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[920px] mx-auto px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Marketplace</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Skills, personas, and integrations for your workflow</p>
        </motion.div>

        {/* Search + tabs */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search marketplace..."
              className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div className="flex items-center gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                  category === cat
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Featured */}
        {featured.length > 0 && category === 'all' && !search && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
            <h2 className="text-[11px] font-semibold text-[var(--accent)] uppercase tracking-widest mb-3">Featured</h2>
            <div className="grid grid-cols-3 gap-3">
              {featured.map((item, i) => (
                <MarketplaceCard
                  key={item.id}
                  item={item}
                  installed={isInstalled(item)}
                  installing={installing === item.id}
                  onInstall={() => handleInstall(item)}
                  featured
                  delay={0.1 + i * 0.04}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Grid */}
        <div>
          {(search || category !== 'all') ? null : (
            <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">
              {category === 'all' ? 'All' : category}
            </h2>
          )}
          {filtered.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <Package size={32} className="text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-tertiary)]">No items match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {(search || category !== 'all' ? filtered : rest).map((item, i) => (
                <MarketplaceCard
                  key={item.id}
                  item={item}
                  installed={isInstalled(item)}
                  installing={installing === item.id}
                  onInstall={() => handleInstall(item)}
                  delay={0.15 + i * 0.03}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketplaceCard({ item, installed, installing, onInstall, featured, delay = 0 }) {
  const CatIcon = CATEGORY_ICONS[item.category] || Zap;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn('surface-card p-4 flex flex-col', featured && 'ring-1 ring-[var(--accent-subtle)]')}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl">{item.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{item.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <CatIcon size={10} className="text-[var(--text-tertiary)]" />
            <span className="text-[10px] text-[var(--text-tertiary)] capitalize">{item.category.slice(0, -1)}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">·</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{item.author}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 flex-1 mb-3">{item.description}</p>
      <button
        onClick={installed ? undefined : onInstall}
        disabled={installed || installing}
        className={cn(
          'w-full py-1.5 rounded-lg text-xs font-medium transition-all',
          installed
            ? 'bg-[var(--surface-tertiary)] text-[var(--success)] cursor-default'
            : installing
              ? 'bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]'
              : 'bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
        )}
      >
        {installed ? (
          <span className="flex items-center justify-center gap-1"><Check size={12} /> Installed</span>
        ) : installing ? (
          <span className="flex items-center justify-center gap-1"><Sparkles size={12} className="animate-pulse" /> Installing...</span>
        ) : (
          <span className="flex items-center justify-center gap-1"><Download size={12} /> Install</span>
        )}
      </button>
    </motion.div>
  );
}
