import React, { useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { MessageSquare, PenLine, LayoutDashboard, Activity, Users, FolderOpen, Zap, Sparkles, Settings, Search, Scale, Award, Radar, Rocket, FileText, Store, Clock, Columns2 } from 'lucide-react';
import { cn } from '../lib/utils.js';

const VIEW_COMMANDS = [
  { name: 'Chat', type: 'view', value: 'chat', icon: MessageSquare },
  { name: 'Dashboard', type: 'view', value: 'dashboard', icon: LayoutDashboard },
  { name: 'Focus', type: 'view', value: 'focus', icon: PenLine },
  { name: 'Split Persona', type: 'view', value: 'split', icon: Columns2 },
  { name: 'Activity', type: 'view', value: 'activity', icon: Activity },
  { name: 'People', type: 'view', value: 'people', icon: Users },
  { name: 'Decisions', type: 'view', value: 'decisions', icon: Scale },
  { name: 'Career', type: 'view', value: 'career', icon: Award },
  { name: 'Radar', type: 'view', value: 'radar', icon: Radar },
  { name: 'Ship to Story', type: 'view', value: 'ship', icon: Rocket },
  { name: 'Digest', type: 'view', value: 'digest', icon: FileText },
  { name: 'Vault', type: 'view', value: 'vault', icon: FolderOpen },
  { name: 'Skills', type: 'view', value: 'skills', icon: Zap },
  { name: 'Marketplace', type: 'view', value: 'marketplace', icon: Store },
  { name: 'Time Machine', type: 'view', value: 'timemachine', icon: Clock },
  { name: 'Personas', type: 'view', value: 'personas', icon: Sparkles },
  { name: 'Settings', type: 'view', value: 'settings', icon: Settings },
];

export default function CommandPalette({ commands, onSelect, onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const skillItems = (commands || []).map(c => ({
    name: c.name,
    type: 'skill',
    value: c.name,
    description: c.description || '',
  }));

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-fade-in"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div className="glass-panel rounded-2xl w-[520px] max-h-[440px] overflow-hidden animate-scale-in flex flex-col">
        <Command className="flex flex-col h-full" loop>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
            <Search size={15} className="text-[var(--text-tertiary)] shrink-0" />
            <Command.Input
              placeholder="Search commands..."
              className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
              autoFocus
            />
          </div>

          <Command.List className="flex-1 overflow-auto py-2 px-2 max-h-[340px]">
            <Command.Empty className="py-8 text-center text-[var(--text-tertiary)] text-sm">
              Nothing found.
            </Command.Empty>

            <Command.Group heading="Views" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest">
              {VIEW_COMMANDS.map(cmd => {
                const Icon = cmd.icon;
                return (
                  <Command.Item
                    key={cmd.value}
                    value={cmd.name}
                    onSelect={() => onSelect(cmd)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-[var(--text-secondary)] data-[selected=true]:bg-[var(--accent-subtle)] data-[selected=true]:text-[var(--accent)] transition-colors"
                  >
                    <Icon size={15} className="shrink-0 opacity-50" />
                    <span className="flex-1 text-sm font-medium">{cmd.name}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {skillItems.length > 0 && (
              <Command.Group heading="Skills" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest mt-1">
                {skillItems.map(skill => (
                  <Command.Item
                    key={skill.name}
                    value={`/${skill.name} ${skill.description}`}
                    onSelect={() => onSelect(skill)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-[var(--text-secondary)] data-[selected=true]:bg-[var(--accent-subtle)] data-[selected=true]:text-[var(--accent)] transition-colors"
                  >
                    <span className="shrink-0 text-[var(--accent)] font-mono text-xs w-4 text-center opacity-60">/</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{skill.name}</div>
                      {skill.description && (
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">{skill.description}</div>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] font-mono">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
