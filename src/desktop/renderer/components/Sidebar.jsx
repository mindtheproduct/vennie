import React from 'react';
import { MessageSquare, MessagesSquare, PenLine, LayoutDashboard, Activity, Users, FolderOpen, Zap, Sparkles, Settings, Scale, Award, Radar, Rocket, FileText, Clock, Columns2 } from 'lucide-react';
import { cn } from '../lib/utils.js';

const NAV_GROUPS = [
  // Primary — creation & conversation
  [
    { id: 'chat', icon: MessageSquare },
    { id: 'threads', icon: MessagesSquare },
    { id: 'focus', icon: PenLine },
    { id: 'split', icon: Columns2 },
  ],
  // Secondary — information
  [
    { id: 'dashboard', icon: LayoutDashboard },
    { id: 'activity', icon: Activity },
    { id: 'people', icon: Users },
  ],
  // Analysis
  [
    { id: 'decisions', icon: Scale },
    { id: 'career', icon: Award },
    { id: 'radar', icon: Radar },
  ],
  // Tools
  [
    { id: 'ship', icon: Rocket },
    { id: 'digest', icon: FileText },
    { id: 'vault', icon: FolderOpen },
    { id: 'skills', icon: Zap },
    { id: 'timemachine', icon: Clock },
  ],
];

export default function Sidebar({ activeView, onNavigate }) {
  return (
    <nav className="flex flex-col items-center w-[52px] shrink-0 py-2 bg-[var(--surface-primary)]">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-0.5">
          {gi > 0 && <div className="w-5 h-px bg-[var(--border)] my-1.5" />}
          {group.map(item => (
            <NavIcon
              key={item.id}
              item={item}
              active={activeView === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </div>
      ))}

      <div className="flex-1" />

      <NavIcon
        item={{ id: 'settings', icon: Settings }}
        active={activeView === 'settings'}
        onClick={() => onNavigate('settings')}
      />
    </nav>
  );
}

function NavIcon({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.id}
      className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150',
        active
          ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
      )}
    >
      <Icon size={17} strokeWidth={active ? 2 : 1.5} />
    </button>
  );
}
