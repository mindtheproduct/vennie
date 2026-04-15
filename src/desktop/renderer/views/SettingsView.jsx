import React, { useState, useEffect, useMemo } from 'react';
import {
  Sun, Moon, Monitor, Check, Sparkles, ArrowRight, Bell, BellOff,
  Cpu, Palette, Plug, Users, CreditCard, FolderOpen, Search, Download,
  Zap, Package, Star, ChevronRight, Loader2, X, Store,
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { useTheme } from '../lib/ThemeProvider.jsx';

// ── Settings sections ──────────────────────────────────────────────────

const SECTIONS = [
  { id: 'general', label: 'General', icon: Palette },
  { id: 'model', label: 'Model', icon: Cpu },
  { id: 'personas', label: 'Personas', icon: Users },
  { id: 'marketplace', label: 'Marketplace', icon: Store },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'usage', label: 'Usage & Keys', icon: CreditCard },
];

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Fast, capable, balanced', badge: 'Default' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable, higher cost' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fastest, cheapest' },
];

const MARKETPLACE_ITEMS = [
  { id: 'marty-cagan', name: 'Marty Cagan', category: 'personas', description: 'Direct, evidence-based PM coaching. Challenges feature factory thinking.', author: 'MTP', featured: true, emoji: '🎯' },
  { id: 'shreyas-doshi', name: 'Shreyas Doshi', category: 'personas', description: 'Strategic clarity and LNO framework. Focused on high-leverage work.', author: 'MTP', featured: true, emoji: '🧠' },
  { id: 'lenny-rachitsky', name: 'Lenny Rachitsky', category: 'personas', description: 'Data-driven growth, benchmarks, and practical PM advice.', author: 'MTP', emoji: '📊' },
  { id: 'julie-zhuo', name: 'Julie Zhuo', category: 'personas', description: 'Design leadership, building great teams, and craft-focused feedback.', author: 'MTP', emoji: '✨' },
  { id: 'gibson-biddle', name: 'Gibson Biddle', category: 'personas', description: 'Product strategy DHM framework.', author: 'MTP', emoji: '🎲' },
  { id: 'okr-writer', name: 'OKR Writer', category: 'skills', description: 'Generate well-structured OKRs from goals. Challenges weak key results.', author: 'MTP', featured: true, emoji: '🎯' },
  { id: 'sprint-retro', name: 'Sprint Retro', category: 'skills', description: 'Facilitated retrospective with action items and pattern detection.', author: 'Community', emoji: '🔄' },
  { id: 'user-interview', name: 'User Interview Guide', category: 'skills', description: 'Generate interview guides with unbiased questions.', author: 'MTP', emoji: '🎙️' },
  { id: 'competitive-teardown', name: 'Competitive Teardown', category: 'skills', description: 'Structured competitor analysis with opportunities.', author: 'Community', emoji: '🔍' },
  { id: 'pricing-strategy', name: 'Pricing Strategy', category: 'skills', description: 'Pricing model analysis and tier design.', author: 'Community', emoji: '💰' },
  { id: 'meeting-notes', name: 'Meeting Notes Pro', category: 'skills', description: 'Enhanced meeting processing with auto stakeholder updates.', author: 'Community', emoji: '📝' },
  { id: 'pitch-deck', name: 'Pitch Deck Builder', category: 'skills', description: 'Compelling product pitches with storytelling structure.', author: 'MTP', emoji: '🎤' },
  { id: 'linear', name: 'Linear', category: 'integrations', description: 'Sync issues, track sprint progress, auto-create tasks.', author: 'MTP', featured: true, emoji: '⚡' },
  { id: 'jira', name: 'Jira', category: 'integrations', description: 'Import tickets, sync status, bi-directional tasks.', author: 'MTP', emoji: '🔵' },
  { id: 'notion', name: 'Notion', category: 'integrations', description: 'Sync pages, import wikis, cross-reference vault.', author: 'Community', emoji: '📓' },
  { id: 'amplitude', name: 'Amplitude', category: 'integrations', description: 'Pull metrics into context, enrich evidence.', author: 'Community', emoji: '📈' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'integrations', description: 'Analytics integration for metric-backed decisions.', author: 'Community', emoji: '📉' },
];

const NOTIF_CATEGORIES = [
  { key: 'decisions', label: 'Decision reviews', description: 'Remind to revisit recent decisions' },
  { key: 'tasks', label: 'Stale tasks', description: 'Tasks untouched for 7+ days' },
  { key: 'meetings', label: 'Meeting follow-ups', description: 'Unresolved action items' },
  { key: 'career', label: 'Career nudges', description: 'Friday evidence capture reminders' },
  { key: 'radar', label: 'Competitive radar', description: 'Stale competitor intel alerts' },
];

// ── Main component ─────────────────────────────────────────────────────

export default function SettingsView({ appData, onNavigate }) {
  const [section, setSection] = useState('general');
  const [settings, setSettings] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketCat, setMarketCat] = useState('all');
  const [installed, setInstalled] = useState(new Set());
  const [installing, setInstalling] = useState(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    window.vennie.getSettings().then(setSettings);
    window.vennie.listPersonas().then(data => { if (Array.isArray(data)) setPersonas(data); });
    window.vennie.getNotificationPrefs().then(setNotifPrefs).catch(() => {});
    // Load installed marketplace items
    (async () => {
      const s = new Set();
      try { const sk = await window.vennie.listSkills(); if (Array.isArray(sk)) sk.forEach(x => s.add(x.name?.toLowerCase())); } catch {}
      try { const ps = await window.vennie.listPersonas(); if (Array.isArray(ps)) ps.forEach(x => s.add(x.id?.toLowerCase())); } catch {}
      setInstalled(s);
    })();
  }, []);

  async function handleModelChange(modelId) {
    const result = await window.vennie.setModel(modelId);
    setSettings(s => ({ ...s, model: result.model }));
  }

  async function handleThinkingToggle() {
    const result = await window.vennie.toggleThinking();
    setSettings(s => ({ ...s, thinking: result.thinking }));
  }

  async function handlePersonaChange(id) {
    await window.vennie.setPersona(id);
    setSettings(s => ({ ...s, persona: id === 'off' ? null : id }));
  }

  async function handleApiKeySave() {
    if (!apiKeyInput.trim()) return;
    await window.vennie.setApiKey(apiKeyInput.trim());
    setSettings(s => ({ ...s, apiKeySet: true }));
    setApiKeyInput('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleNotifToggle(key, value) {
    const update = key === 'enabled'
      ? { enabled: value }
      : { categories: { [key]: value } };
    const result = await window.vennie.setNotificationPrefs(update);
    setNotifPrefs(result);
  }

  async function handleQuietHours(field, value) {
    const result = await window.vennie.setNotificationPrefs({ quiet_hours: { [field]: parseInt(value) || 0 } });
    setNotifPrefs(result);
  }

  async function handleInstall(item) {
    setInstalling(item.id);
    await new Promise(r => setTimeout(r, 1200));
    setInstalled(prev => new Set([...prev, item.id]));
    setInstalling(null);
  }

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-primary)]">
        <div className="shimmer w-48 h-5 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--surface-primary)]">
      {/* Settings sidebar */}
      <div className="w-[200px] shrink-0 border-r border-[var(--border)] py-6 px-3 overflow-auto">
        <h1 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest px-3 mb-4">Settings</h1>
        <nav className="space-y-0.5">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left',
                  section === s.id
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                <Icon size={15} strokeWidth={section === s.id ? 2 : 1.5} />
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[600px] px-8 py-8">

          {/* ── General ──────────────────────────────── */}
          {section === 'general' && (
            <>
              <SectionHeader title="General" description="Appearance and vault configuration" />

              <Field label="Theme">
                <div className="flex gap-2">
                  {[
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Monitor },
                  ].map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        className={cn(
                          'flex-1 flex flex-col items-center gap-2 py-4 rounded-xl transition-all',
                          theme === opt.id
                            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] ring-1 ring-[var(--accent)]/20'
                            : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)]'
                        )}
                      >
                        <Icon size={18} />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Vault path">
                <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-secondary)] rounded-xl">
                  <FolderOpen size={15} className="text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-sm font-mono text-[var(--text-secondary)] break-all">
                    {settings.vaultPath || 'Not configured'}
                  </span>
                </div>
              </Field>
            </>
          )}

          {/* ── Model ────────────────────────────────── */}
          {section === 'model' && (
            <>
              <SectionHeader title="Model" description="Choose the AI model and reasoning mode" />

              <Field label="Active model">
                <div className="space-y-1.5">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleModelChange(m.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left',
                        settings.model === m.id
                          ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/20'
                          : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-semibold', settings.model === m.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>{m.label}</span>
                          {m.badge && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] font-medium uppercase tracking-wider">{m.badge}</span>}
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{m.description}</div>
                      </div>
                      {settings.model === m.id && <Check size={14} className="text-[var(--accent)] shrink-0" />}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Extended thinking">
                <button
                  onClick={handleThinkingToggle}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)] transition-all"
                >
                  <Toggle on={settings.thinking} />
                  <div className="text-left">
                    <div className="text-sm font-medium text-[var(--text-primary)]">{settings.thinking ? 'On' : 'Off'}</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">Deeper reasoning, uses more tokens</div>
                  </div>
                </button>
              </Field>
            </>
          )}

          {/* ── Personas ─────────────────────────────── */}
          {section === 'personas' && (
            <>
              <SectionHeader title="Personas" description="Switch between different AI personalities" />

              <Field label="Active persona">
                <div className="space-y-1.5">
                  <button
                    onClick={() => handlePersonaChange('off')}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left',
                      !settings.persona
                        ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/20'
                        : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--surface-tertiary)] flex items-center justify-center text-[var(--text-tertiary)]">
                      <Sparkles size={14} />
                    </div>
                    <div className="flex-1">
                      <div className={cn('text-sm font-semibold', !settings.persona ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>Default</div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">Standard Vennie assistant</div>
                    </div>
                    {!settings.persona && <Check size={14} className="text-[var(--accent)]" />}
                  </button>

                  {personas.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePersonaChange(p.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left',
                        settings.persona === p.id
                          ? 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]/20'
                          : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center text-[var(--accent)] text-sm font-bold">
                        {p.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-sm font-semibold', settings.persona === p.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>{p.name}</div>
                        {p.bestFor && <div className="text-[11px] text-[var(--text-tertiary)] truncate">{p.bestFor}</div>}
                      </div>
                      {settings.persona === p.id && <Check size={14} className="text-[var(--accent)]" />}
                      {p.source && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] uppercase tracking-wider">{p.source}</span>
                      )}
                    </button>
                  ))}
                </div>

                {personas.length === 0 && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-3">No personas installed. Browse the Marketplace to add some.</p>
                )}
              </Field>
            </>
          )}

          {/* ── Marketplace ──────────────────────────── */}
          {section === 'marketplace' && (
            <MarketplaceSection
              search={marketSearch}
              setSearch={setMarketSearch}
              category={marketCat}
              setCategory={setMarketCat}
              installed={installed}
              installing={installing}
              onInstall={handleInstall}
            />
          )}

          {/* ── Notifications ────────────────────────── */}
          {section === 'notifications' && (
            <>
              <SectionHeader title="Notifications" description="Control when Vennie nudges you" />

              <Field label="Global toggle">
                <button
                  onClick={() => handleNotifToggle('enabled', !notifPrefs?.enabled)}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)] transition-all"
                >
                  <Toggle on={notifPrefs?.enabled} />
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium text-[var(--text-primary)]">{notifPrefs?.enabled ? 'Enabled' : 'Disabled'}</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">All desktop notifications</div>
                  </div>
                  {notifPrefs?.enabled ? <Bell size={14} className="text-[var(--accent)]" /> : <BellOff size={14} className="text-[var(--text-tertiary)]" />}
                </button>
              </Field>

              {notifPrefs?.enabled && (
                <>
                  <Field label="Categories">
                    <div className="space-y-1">
                      {NOTIF_CATEGORIES.map(cat => (
                        <button
                          key={cat.key}
                          onClick={() => handleNotifToggle(cat.key, !notifPrefs?.categories?.[cat.key])}
                          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)] transition-all"
                        >
                          <Toggle on={notifPrefs?.categories?.[cat.key]} small />
                          <div className="text-left">
                            <div className="text-[13px] font-medium text-[var(--text-primary)]">{cat.label}</div>
                            <div className="text-[10px] text-[var(--text-tertiary)]">{cat.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Quiet hours">
                    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-secondary)] rounded-xl">
                      <span className="text-[13px] text-[var(--text-secondary)]">From</span>
                      <input
                        type="number"
                        min={0} max={23}
                        value={notifPrefs?.quiet_hours?.start ?? 22}
                        onChange={e => handleQuietHours('start', e.target.value)}
                        className="w-14 px-2 py-1 rounded-lg bg-[var(--surface-tertiary)] text-sm text-center text-[var(--text-primary)] outline-none font-mono"
                      />
                      <span className="text-[13px] text-[var(--text-tertiary)]">:00</span>
                      <span className="text-[13px] text-[var(--text-secondary)] ml-2">to</span>
                      <input
                        type="number"
                        min={0} max={23}
                        value={notifPrefs?.quiet_hours?.end ?? 8}
                        onChange={e => handleQuietHours('end', e.target.value)}
                        className="w-14 px-2 py-1 rounded-lg bg-[var(--surface-tertiary)] text-sm text-center text-[var(--text-primary)] outline-none font-mono"
                      />
                      <span className="text-[13px] text-[var(--text-tertiary)]">:00</span>
                    </div>
                  </Field>
                </>
              )}
            </>
          )}

          {/* ── Usage & Keys ─────────────────────────── */}
          {section === 'usage' && (
            <>
              <SectionHeader title="Usage & Keys" description="API configuration and session metrics" />

              <Field label="API key">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn('w-1.5 h-1.5 rounded-full', settings.apiKeySet ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')} />
                  <span className="text-xs text-[var(--text-secondary)]">
                    {settings.apiKeySet ? 'Configured' : 'Not set — Vennie needs an Anthropic API key'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-ant-..."
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-secondary)] text-sm font-mono text-[var(--text-primary)] outline-none focus:bg-[var(--surface-tertiary)] transition-colors placeholder:text-[var(--text-tertiary)]"
                  />
                  <button
                    onClick={handleApiKeySave}
                    disabled={!apiKeyInput.trim()}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                  >
                    {saved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </Field>

              <Field label="Session cost">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Input tokens', value: (settings.cost?.input || 0).toLocaleString() },
                    { label: 'Output tokens', value: (settings.cost?.output || 0).toLocaleString() },
                    { label: 'Total cost', value: `$${(settings.cost?.cost || 0).toFixed(4)}`, accent: true },
                  ].map(s => (
                    <div key={s.label} className="bg-[var(--surface-secondary)] rounded-xl p-3">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest mb-1">{s.label}</div>
                      <div className={cn('text-sm font-semibold font-mono', s.accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </Field>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Marketplace sub-section ────────────────────────────────────────────

const MARKET_CATS = ['all', 'skills', 'personas', 'integrations'];
const CAT_ICONS = { skills: Zap, personas: Users, integrations: Plug };

function MarketplaceSection({ search, setSearch, category, setCategory, installed, installing, onInstall }) {
  const filtered = useMemo(() => {
    let items = MARKETPLACE_ITEMS;
    if (category !== 'all') items = items.filter(i => i.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return items;
  }, [category, search]);

  const isInstalled = (item) => installed.has(item.id) || installed.has(item.name.toLowerCase());

  return (
    <>
      <SectionHeader title="Marketplace" description="Browse and install skills, personas, and integrations" />

      {/* Search + filter */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-0.5">
          {MARKET_CATS.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                category === cat
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Package size={28} className="text-[var(--text-tertiary)] mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-tertiary)]">No items match your search.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(item => {
            const CatIcon = CAT_ICONS[item.category] || Zap;
            const done = isInstalled(item);
            const busy = installing === item.id;
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all',
                  'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]',
                  item.featured && 'ring-1 ring-[var(--accent-subtle)]'
                )}
              >
                <span className="text-lg shrink-0">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{item.name}</span>
                    <CatIcon size={10} className="text-[var(--text-tertiary)]" />
                    <span className="text-[10px] text-[var(--text-tertiary)] capitalize">{item.category.slice(0, -1)}</span>
                    {item.featured && <Star size={9} className="text-[var(--accent)]" />}
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">{item.description}</p>
                </div>
                <button
                  onClick={done ? undefined : () => onInstall(item)}
                  disabled={done || busy}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    done
                      ? 'text-[var(--success)] cursor-default'
                      : busy
                        ? 'text-[var(--text-tertiary)]'
                        : 'bg-[var(--accent-subtle)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
                  )}
                >
                  {done ? (
                    <span className="flex items-center gap-1"><Check size={12} /> Installed</span>
                  ) : busy ? (
                    <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Installing</span>
                  ) : (
                    <span className="flex items-center gap-1"><Download size={12} /> Install</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Shared components ──────────────────────────────────────────────────

function SectionHeader({ title, description }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{title}</h2>
      {description && <p className="text-sm text-[var(--text-tertiary)] mt-0.5">{description}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-6">
      <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest block mb-2.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, small }) {
  const w = small ? 'w-7' : 'w-9';
  const h = small ? 'h-[16px]' : 'h-[20px]';
  const dot = small ? 'w-3 h-3' : 'w-4 h-4';
  const offPos = small ? 'left-[2px]' : 'left-[2px]';
  const onPos = small ? 'left-[12px]' : 'left-[18px]';
  return (
    <div className={cn(w, h, 'rounded-full relative transition-colors shrink-0', on ? 'bg-[var(--accent)]' : 'bg-[var(--surface-tertiary)]')}>
      <div className={cn(dot, 'rounded-full bg-white absolute top-[2px] transition-all shadow-sm', on ? onPos : offPos)} />
    </div>
  );
}
