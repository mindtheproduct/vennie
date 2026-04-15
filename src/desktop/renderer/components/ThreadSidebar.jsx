import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PanelLeftClose, PanelLeft, SquarePen, Search, MessageSquare, Star, StarOff, Trash2, LayoutDashboard, FolderOpen, Zap, Sparkles, Settings, MoreHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../lib/utils.js';

const BOTTOM_NAV = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'vault', icon: FolderOpen, label: 'Vault' },
  { id: 'skills', icon: Zap, label: 'Skills' },
  { id: 'personas', icon: Sparkles, label: 'Personas' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

function groupByDate(threads) {
  const now = Date.now();
  const day = 86400000;
  const groups = { today: [], yesterday: [], week: [], month: [], older: [] };

  for (const t of threads) {
    const age = now - (t.timestamp || 0);
    if (age < day) groups.today.push(t);
    else if (age < 2 * day) groups.yesterday.push(t);
    else if (age < 7 * day) groups.week.push(t);
    else if (age < 30 * day) groups.month.push(t);
    else groups.older.push(t);
  }

  const result = [];
  if (groups.today.length) result.push({ label: 'Today', threads: groups.today });
  if (groups.yesterday.length) result.push({ label: 'Yesterday', threads: groups.yesterday });
  if (groups.week.length) result.push({ label: 'Last 7 days', threads: groups.week });
  if (groups.month.length) result.push({ label: 'Last 30 days', threads: groups.month });
  if (groups.older.length) result.push({ label: 'Older', threads: groups.older });
  return result;
}

export default function ThreadSidebar({ open, onToggle, activeView, onNavigate, onNewChat, onLoadThread, activeThreadId }) {
  const [threads, setThreads] = useState([]);
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState(null);

  // Load threads
  useEffect(() => {
    loadThreads();
    // Re-load when threads change (e.g. after a save)
    const handleUpdate = () => loadThreads();
    window.addEventListener('vennie:threads-updated', handleUpdate);
    return () => window.removeEventListener('vennie:threads-updated', handleUpdate);
  }, []);

  function loadThreads() {
    try {
      const stored = localStorage.getItem('vennie-threads');
      setThreads(stored ? JSON.parse(stored) : []);
    } catch { setThreads([]); }
  }

  function saveThreads(updated) {
    setThreads(updated);
    try { localStorage.setItem('vennie-threads', JSON.stringify(updated)); } catch {}
  }

  function togglePin(id) {
    saveThreads(threads.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t));
    setContextMenu(null);
  }

  function deleteThread(id) {
    saveThreads(threads.filter(t => t.id !== id));
    setContextMenu(null);
  }

  function handleOpen(thread) {
    onLoadThread?.(thread);
    if (activeView !== 'chat') onNavigate('chat');
  }

  const sorted = useMemo(() => {
    let list = threads;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.preview || '').toLowerCase().includes(q)
      );
    }
    // Pinned first, then by date
    const pinned = list.filter(t => t.pinned).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const unpinned = list.filter(t => !t.pinned).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return [...pinned, ...unpinned];
  }, [threads, search]);

  const grouped = useMemo(() => {
    const pinned = sorted.filter(t => t.pinned);
    const unpinned = sorted.filter(t => !t.pinned);
    const result = [];
    if (pinned.length) result.push({ label: 'Pinned', threads: pinned });
    result.push(...groupByDate(unpinned));
    return result;
  }, [sorted]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  if (!open) {
    return (
      <div className="flex flex-col items-center w-[52px] shrink-0 py-3 bg-[var(--surface-primary)]">
        <button
          onClick={onToggle}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
          title="Open sidebar"
        >
          <PanelLeft size={18} />
        </button>
        <button
          onClick={onNewChat}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors mt-1"
          title="New chat"
        >
          <SquarePen size={16} />
        </button>
        <div className="flex-1" />
        {BOTTOM_NAV.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 mb-0.5',
                activeView === item.id
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
              )}
            >
              <Icon size={16} strokeWidth={activeView === item.id ? 2 : 1.5} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[260px] shrink-0 bg-[var(--surface-secondary)] border-r border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-[52px] shrink-0" style={{ paddingTop: 6 }}>
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
          title="Close sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
        <button
          onClick={onNewChat}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
          title="New chat"
        >
          <SquarePen size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-tertiary)]">
          <Search size={13} className="text-[var(--text-tertiary)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {sorted.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-[12px] text-[var(--text-tertiary)]">
              {search ? 'No matches' : 'Your conversations will appear here'}
            </p>
          </div>
        ) : (
          grouped.map((group, gi) => (
            <div key={gi} className="mb-2">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {group.label}
              </div>
              {group.threads.map(thread => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  active={activeThreadId === thread.id}
                  onOpen={() => handleOpen(thread)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ id: thread.id, x: e.clientX, y: e.clientY });
                  }}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-[var(--border)] px-2 py-2">
        <div className="flex items-center justify-around">
          {BOTTOM_NAV.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={item.label}
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150',
                  activeView === item.id
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
                )}
              >
                <Icon size={16} strokeWidth={activeView === item.id ? 2 : 1.5} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-50 py-1 min-w-[140px] rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <ContextMenuItem
              icon={threads.find(t => t.id === contextMenu.id)?.pinned ? StarOff : Star}
              label={threads.find(t => t.id === contextMenu.id)?.pinned ? 'Unpin' : 'Pin'}
              onClick={() => togglePin(contextMenu.id)}
            />
            <ContextMenuItem
              icon={Trash2}
              label="Delete"
              danger
              onClick={() => deleteThread(contextMenu.id)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThreadItem({ thread, active, onOpen, onContextMenu }) {
  return (
    <button
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={cn(
        'group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-100',
        active
          ? 'bg-[var(--surface-tertiary)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]/60 hover:text-[var(--text-primary)]'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {thread.pinned && <Star size={10} className="text-[var(--warning)] fill-[var(--warning)] shrink-0" />}
          <span className="text-[13px] font-medium truncate leading-tight">
            {thread.title || 'Untitled'}
          </span>
        </div>
        {thread.preview && (
          <div className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5 leading-tight">{thread.preview}</div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-primary)]/50 transition-all"
      >
        <MoreHorizontal size={13} />
      </button>
    </button>
  );
}

function ContextMenuItem({ icon: Icon, label, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors',
        danger
          ? 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
