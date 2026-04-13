import React, { useState, useEffect, useMemo } from 'react';
import { Search, Users, ArrowUpRight, Building2, Calendar } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

export default function PeopleView({ appData }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, internal, external
  const [selected, setSelected] = useState(null);
  const [selectedContent, setSelectedContent] = useState('');

  useEffect(() => {
    loadPeople().then(data => {
      setPeople(data);
      setLoading(false);
    });
  }, []);

  async function loadPeople() {
    try {
      const data = await window.vennie?.listPeople?.();
      if (Array.isArray(data)) return data;

      // Fallback: scan vault tree for People folder
      const tree = await window.vennie?.getTree?.();
      if (!Array.isArray(tree)) return [];

      const peopleDir = findNode(tree, 'People');
      if (!peopleDir?.children) return [];

      const result = [];
      for (const subDir of peopleDir.children) {
        if (subDir.isDir && subDir.children) {
          const type = subDir.name.toLowerCase(); // internal or external
          for (const file of subDir.children) {
            if (file.name.endsWith('.md')) {
              result.push({
                name: file.name.replace('.md', '').replace(/_/g, ' '),
                path: file.path,
                type: type === 'internal' ? 'internal' : 'external',
                initial: file.name[0]?.toUpperCase() || '?',
              });
            }
          }
        }
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  async function selectPerson(person) {
    setSelected(person);
    try {
      const result = await window.vennie.readFile(person.path);
      setSelectedContent(result?.content || '');
    } catch {
      setSelectedContent('Could not load person page.');
    }
  }

  const filtered = useMemo(() => {
    let list = people;
    if (filter !== 'all') list = list.filter(p => p.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [people, filter, search]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-primary)]">
        <div className="shimmer w-48 h-5 rounded-md" />
      </div>
    );
  }

  // If someone is selected, show split view
  if (selected) {
    return (
      <div className="flex-1 flex h-full overflow-hidden bg-[var(--surface-primary)]">
        {/* List */}
        <div className="w-[260px] shrink-0 flex flex-col bg-[var(--surface-secondary)]">
          <div className="p-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-tertiary)]">
              <Search size={12} className="text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.map(p => (
              <button
                key={p.path}
                onClick={() => selectPerson(p)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                  selected?.path === p.path
                    ? 'bg-[var(--accent-subtle)]'
                    : 'hover:bg-[var(--surface-tertiary)]'
                )}
              >
                <PersonAvatar name={p.name} type={p.type} size="sm" />
                <div className="min-w-0">
                  <div className={cn('text-sm font-medium truncate', selected?.path === p.path ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] capitalize">{p.type}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="flex items-center gap-4 mb-6">
            <PersonAvatar name={selected.name} type={selected.type} size="lg" />
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">{selected.name}</h2>
              <span className="text-xs text-[var(--text-tertiary)] capitalize font-mono">{selected.type}</span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Back to grid
            </button>
          </div>
          <div className="text-sm">
            <MarkdownRenderer text={selectedContent} />
          </div>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[800px] mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">People</h1>
            <p className="text-xs text-[var(--text-tertiary)] font-mono mt-1">{people.length} in your network</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <div className="flex gap-1 mr-3">
              {['all', 'internal', 'external'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize',
                    filter === f
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] w-[180px]">
              <Search size={12} className="text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyPeople hasAny={people.length > 0} />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filtered.map(p => (
              <button
                key={p.path}
                onClick={() => selectPerson(p)}
                className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] transition-all text-center"
              >
                <PersonAvatar name={p.name} type={p.type} size="md" />
                <div className="min-w-0 w-full">
                  <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate transition-colors">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] capitalize mt-0.5">{p.type}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonAvatar({ name, type, size = 'md' }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const isInternal = type === 'internal';

  const sizes = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };

  return (
    <div className={cn(
      'rounded-xl flex items-center justify-center font-semibold shrink-0',
      sizes[size],
      isInternal
        ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
        : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'
    )}>
      {initials}
    </div>
  );
}

function EmptyPeople({ hasAny }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-[var(--surface-secondary)] flex items-center justify-center">
        <Users size={20} className="text-[var(--text-tertiary)]" />
      </div>
      <div className="text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {hasAny ? 'No matches' : 'No people yet'}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {hasAny ? 'Try a different search' : 'Process a meeting to start building your network'}
        </p>
      </div>
    </div>
  );
}

function findNode(tree, name) {
  for (const node of tree) {
    if (node.name === name) return node;
    if (node.children) {
      const found = findNode(node.children, name);
      if (found) return found;
    }
  }
  return null;
}
