import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { useTheme } from '../lib/ThemeProvider.jsx';

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Fast, capable, balanced', badge: 'Default' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable, higher cost', badge: null },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fastest, cheapest', badge: null },
];

export default function SettingsView({ appData }) {
  const [settings, setSettings] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    window.vennie.getSettings().then(setSettings);
    window.vennie.listPersonas().then(data => {
      if (Array.isArray(data)) setPersonas(data);
    });
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
    const result = await window.vennie.setPersona(id);
    setSettings(s => ({ ...s, persona: result.active }));
  }

  async function handleApiKeySave() {
    if (!apiKeyInput.trim()) return;
    await window.vennie.setApiKey(apiKeyInput.trim());
    setSettings(s => ({ ...s, apiKeySet: true }));
    setApiKeyInput('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="shimmer w-48 h-5 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[560px] mx-auto px-8 py-8">
        <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mb-8">Settings</h1>

        {/* Appearance */}
        <Section title="Appearance">
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
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)]'
                  )}
                >
                  <Icon size={18} />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* API Key */}
        <Section title="API Key">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-1.5 h-1.5 rounded-full', settings.apiKeySet ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')} />
            <span className="text-xs text-[var(--text-secondary)]">
              {settings.apiKeySet ? 'Configured' : 'Not set'}
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
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </Section>

        {/* Model */}
        <Section title="Model">
          <div className="space-y-1.5">
            {MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => handleModelChange(m.id)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left',
                  settings.model === m.id
                    ? 'bg-[var(--accent-subtle)]'
                    : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-semibold', settings.model === m.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>{m.label}</span>
                    {m.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] font-medium uppercase tracking-wider">{m.badge}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{m.description}</div>
                </div>
                {settings.model === m.id && <Check size={14} className="text-[var(--accent)] shrink-0" />}
              </button>
            ))}
          </div>
        </Section>

        {/* Extended Thinking */}
        <Section title="Extended Thinking">
          <button
            onClick={handleThinkingToggle}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)] transition-all"
          >
            <div
              className={cn(
                'w-9 h-[20px] rounded-full relative transition-colors',
                settings.thinking ? 'bg-[var(--accent)]' : 'bg-[var(--surface-tertiary)]'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white absolute top-[2px] transition-all shadow-sm',
                  settings.thinking ? 'left-[18px]' : 'left-[2px]'
                )}
              />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-[var(--text-primary)]">{settings.thinking ? 'On' : 'Off'}</div>
              <div className="text-[11px] text-[var(--text-tertiary)]">Deeper reasoning, higher cost</div>
            </div>
          </button>
        </Section>

        {/* Persona */}
        <Section title="Persona">
          <div className="space-y-1.5">
            <button
              onClick={() => handlePersonaChange('off')}
              className={cn(
                'w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-medium',
                !settings.persona
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
              )}
            >
              Default
            </button>
            {personas.map(p => (
              <button
                key={p.id}
                onClick={() => handlePersonaChange(p.id)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl transition-all',
                  settings.persona === p.id
                    ? 'bg-[var(--accent-subtle)]'
                    : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'
                )}
              >
                <div className={cn('text-sm font-medium', settings.persona === p.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>{p.name}</div>
                {p.bestFor && <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{p.bestFor}</div>}
              </button>
            ))}
          </div>
        </Section>

        {/* Session Cost */}
        <Section title="Session">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Input', value: (settings.cost?.input || 0).toLocaleString() },
              { label: 'Output', value: (settings.cost?.output || 0).toLocaleString() },
              { label: 'Cost', value: `$${(settings.cost?.cost || 0).toFixed(4)}`, accent: true },
            ].map(s => (
              <div key={s.label} className="bg-[var(--surface-secondary)] rounded-xl p-3">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest mb-1">{s.label}</div>
                <div className={cn('text-sm font-semibold font-mono', s.accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>{s.value}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Vault */}
        <Section title="Vault Path">
          <div className="px-4 py-3 bg-[var(--surface-secondary)] rounded-xl text-sm font-mono text-[var(--text-tertiary)] break-all">
            {settings.vaultPath || 'Not configured'}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  );
}
