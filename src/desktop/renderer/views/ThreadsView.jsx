import React, { useState, useEffect, useMemo } from 'react';
import { Search, MessageSquare, Clock, Star, StarOff, Trash2, Plus } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function ThreadsView({ appData, onNavigate, onLoadThread }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, pinned

  useEffect(() => {
    loadThreads().then(data => {
      setThreads(data);
      setLoading(false);
    });
  }, []);

  async function loadThreads() {
    try {
      const data = await window.vennie?.listThreads?.();
      if (Array.isArray(data)) return data;

      // Fallback: check localStorage for saved threads
      const stored = localStorage.getItem('vennie-threads');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function saveThreads(updated) {
    setThreads(updated);
    try {
      localStorage.setItem('vennie-threads', JSON.stringify(updated));
    } catch {}
  }

  function togglePin(id) {
    const updated = threads.map(t =>
      t.id === id ? { ...t, pinned: !t.pinned } : t
    );
    saveThreads(updated);
  }

  function deleteThread(id) {
    saveThreads(threads.filter(t => t.id !== id));
  }

  function handleOpen(thread) {
    if (onLoadThread) {
      onLoadThread(thread);
    }
    onNavigate('chat');
  }

  function handleNew() {
    onNavigate('chat');
  }

  const filtered = useMemo(() => {
    let list = threads;
    if (filter === 'pinned') list = list.filter(t => t.pinned);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.preview || '').toLowerCase().includes(q)
      );
    }
    // Sort: pinned first, then by date
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }, [threads, filter, search]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-primary)]">
        <div className="shimmer w-48 h-5 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[640px] mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Threads</h1>
            <p className="text-xs text-[var(--text-tertiary)] font-mono mt-1">{threads.length} conversations</p>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus size={13} />
            New thread
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)]">
            <Search size={12} className="text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search threads..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'pinned'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
                  filter === f
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        {filtered.length === 0 ? (
          <EmptyThreads hasAny={threads.length > 0} onNew={handleNew} />
        ) : (
          <div className="space-y-1">
            {filtered.map(thread => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                onOpen={() => handleOpen(thread)}
                onTogglePin={() => togglePin(thread.id)}
                onDelete={() => deleteThread(thread.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadRow({ thread, onOpen, onTogglePin, onDelete }) {
  const date = thread.timestamp
    ? new Date(thread.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const msgCount = thread.messageCount || 0;

  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--surface-secondary)] transition-colors">
      <button onClick={onOpen} className="flex-1 flex items-start gap-3 min-w-0 text-left">
        <div className="w-8 h-8 rounded-lg bg-[var(--surface-tertiary)] flex items-center justify-center shrink-0 mt-0.5">
          <MessageSquare size={14} className="text-[var(--text-tertiary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
              {thread.title || 'Untitled thread'}
            </span>
            {thread.pinned && <Star size={11} className="text-[var(--warning)] fill-[var(--warning)] shrink-0" />}
          </div>
          {thread.preview && (
            <div className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">{thread.preview}</div>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--text-tertiary)] font-mono">
            {date && <span>{date}</span>}
            {msgCount > 0 && <span>{msgCount} messages</span>}
          </div>
        </div>
      </button>

      {/* Actions — visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePin}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--warning)] hover:bg-[var(--surface-tertiary)] transition-colors"
          title={thread.pinned ? 'Unpin' : 'Pin'}
        >
          {thread.pinned ? <StarOff size={13} /> : <Star size={13} />}
        </button>
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--surface-tertiary)] transition-colors"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function EmptyThreads({ hasAny, onNew }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-[var(--surface-secondary)] flex items-center justify-center">
        <MessageSquare size={20} className="text-[var(--text-tertiary)]" />
      </div>
      <div className="text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {hasAny ? 'No matches' : 'No saved threads'}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {hasAny ? 'Try a different search' : 'Name a conversation to save it here'}
        </p>
      </div>
      {!hasAny && (
        <button
          onClick={onNew}
          className="mt-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          Start a thread
        </button>
      )}
    </div>
  );
}
