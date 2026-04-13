import React, { useState, useEffect } from 'react';
import { Calendar, Users, FolderKanban, MessageSquare, Zap, BookOpen, FileText } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

export default function DashboardView({ appData, onNavigate }) {
  const [brief, setBrief] = useState(appData?.morningBrief || null);
  const [pulse, setPulse] = useState(appData?.pulse || null);
  const [loading, setLoading] = useState(!brief);

  useEffect(() => {
    if (!brief) {
      window.vennie.getBrief().then(data => {
        if (data && !data.error) setBrief(data);
        setLoading(false);
      });
    }
    if (!pulse) {
      window.vennie.getPulse().then(data => {
        if (data && !data.error) setPulse(data);
      });
    }
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  function runSkill(name) {
    onNavigate('chat');
    setTimeout(() => window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: name })), 100);
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[760px] mx-auto px-8 py-8">
        {/* Header — bold, simple */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">{greeting}.</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1 font-mono">{dateStr}</p>
        </div>

        {/* Quick Actions — ghost buttons */}
        <div className="flex gap-2 mb-8">
          {[
            { label: 'Plan my day', skill: 'daily-plan', icon: Calendar },
            { label: 'Product gym', skill: 'gym', icon: Zap },
            { label: 'Quick log', skill: 'log', icon: FileText },
            { label: 'Vault', action: () => onNavigate('vault'), icon: FolderKanban },
          ].map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                onClick={() => action.skill ? runSkill(action.skill) : action.action?.()}
                className="group flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] transition-all text-sm"
              >
                <Icon size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
                <span className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] font-medium transition-colors">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* Brief — surface card, no visible border */}
        <div className="surface-card p-6 mb-5">
          <h2 className="text-[11px] font-semibold text-[var(--accent)] uppercase tracking-widest mb-4">Morning Brief</h2>
          {loading ? (
            <div className="space-y-3">
              <div className="shimmer h-4 rounded-md w-3/4" />
              <div className="shimmer h-4 rounded-md w-1/2" />
              <div className="shimmer h-4 rounded-md w-2/3" />
            </div>
          ) : brief?.display ? (
            <div className="text-sm"><MarkdownRenderer text={brief.display} /></div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No brief yet. Use Vennie for a few days to build context.</p>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Vault Pulse */}
          <div className="surface-card p-5">
            <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-4">Vault</h2>
            {pulse ? (
              <div className="space-y-3">
                <StatRow icon={Users} label="People" value={pulse.stats?.people ?? 0} />
                <StatRow icon={FolderKanban} label="Projects" value={pulse.stats?.projects ?? 0} />
                <StatRow icon={BookOpen} label="Decisions" value={pulse.stats?.decisions ?? 0} />
                <StatRow icon={Calendar} label="Meetings" value={pulse.stats?.meetings ?? 0} />
                <StatRow icon={MessageSquare} label="Sessions" value={pulse.stats?.sessions ?? 0} />
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">No vault data yet.</p>
            )}
          </div>

          {/* Session */}
          <div className="surface-card p-5">
            <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-4">Session</h2>
            <div className="space-y-3">
              <StatRow label="Model" value={(appData?.model || '').replace('claude-', '').replace(/-\d{8}$/, '')} />
              <StatRow label="Tools" value={appData?.toolCount ?? 0} />
              <StatRow label="Version" value={`v${appData?.version || '?'}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={13} className="text-[var(--text-tertiary)]" />}
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      </div>
      <span className="text-sm font-semibold font-mono text-[var(--text-primary)]">{String(value)}</span>
    </div>
  );
}
