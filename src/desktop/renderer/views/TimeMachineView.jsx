import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GitCommit, GitBranch, Clock, FileDiff, FileText, Plus, Minus, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils.js';

export default function TimeMachineView({ appData }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [diff, setDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    if (window.vennie.getGitLog) {
      window.vennie.getGitLog().then(data => {
        if (Array.isArray(data)) setCommits(data);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const selectCommit = useCallback(async (commit) => {
    setSelectedCommit(commit);
    setDiffLoading(true);
    setDiff(null);
    try {
      if (window.vennie.getGitDiff) {
        const result = await window.vennie.getGitDiff(commit.hash);
        setDiff(result);
      }
    } catch {}
    setDiffLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
        <div className="max-w-[860px] mx-auto px-8 py-8">
          <div className="shimmer h-8 w-48 rounded-lg mb-8" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="shimmer h-16 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--surface-primary)]">
      {/* Commit list */}
      <div className={cn('overflow-auto p-8', selectedCommit ? 'w-[380px] shrink-0 border-r border-[var(--border)]' : 'flex-1 max-w-[860px] mx-auto')}>
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Time Machine</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {commits.length} snapshot{commits.length !== 1 ? 's' : ''} of your vault
          </p>
        </motion.div>

        {/* Quick links */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['Goals 3 months ago', 'Priorities last week', 'People changes'].map(label => (
            <button
              key={label}
              className="px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all"
            >
              {label}
            </button>
          ))}
        </div>

        {commits.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />
            <div className="space-y-2">
              {commits.map((commit, i) => (
                <motion.button
                  key={commit.hash || i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => selectCommit(commit)}
                  className={cn(
                    'relative w-full text-left surface-card p-4 group cursor-pointer transition-all',
                    selectedCommit?.hash === commit.hash && 'ring-1 ring-[var(--accent)] bg-[var(--accent-muted)]'
                  )}
                >
                  <div
                    className="absolute -left-6 top-5 w-3 h-3 rounded-full border-2 border-[var(--surface-primary)]"
                    style={{ background: selectedCommit?.hash === commit.hash ? 'var(--accent)' : 'var(--text-tertiary)' }}
                  />
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{commit.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-[var(--text-tertiary)]">{commit.date}</span>
                        {commit.filesChanged > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]">
                            {commit.filesChanged} file{commit.filesChanged !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 mt-1 shrink-0" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Diff panel */}
      {selectedCommit && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 overflow-auto p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <GitCommit size={16} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">{selectedCommit.message}</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                {selectedCommit.date} · <code className="font-mono">{(selectedCommit.hash || '').slice(0, 7)}</code>
              </p>
            </div>
          </div>

          {diffLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="shimmer h-20 rounded-xl" />)}
            </div>
          ) : diff ? (
            <div className="space-y-4">
              {(diff.files || []).map((file, i) => (
                <div key={i} className="surface-card overflow-hidden">
                  <div className="px-4 py-2.5 bg-[var(--surface-tertiary)] flex items-center gap-2">
                    <FileText size={13} className="text-[var(--text-tertiary)]" />
                    <span className="text-xs font-mono text-[var(--text-secondary)]">{file.path}</span>
                    <div className="flex-1" />
                    {file.additions > 0 && (
                      <span className="text-[10px] text-[var(--success)] font-mono">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-[10px] text-[var(--danger)] font-mono">-{file.deletions}</span>
                    )}
                  </div>
                  <div className="p-3 font-mono text-xs leading-relaxed overflow-x-auto">
                    {(file.lines || []).map((line, j) => (
                      <div
                        key={j}
                        className={cn(
                          'px-2 py-0.5 rounded-sm',
                          line.type === 'add' && 'bg-[rgba(74,222,128,0.08)] text-[var(--success)]',
                          line.type === 'remove' && 'bg-[rgba(251,113,133,0.08)] text-[var(--danger)]',
                          line.type === 'context' && 'text-[var(--text-tertiary)]',
                        )}
                      >
                        <span className="select-none mr-2 text-[var(--text-tertiary)] opacity-50">
                          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                        </span>
                        {line.content}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No diff data available for this commit.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface-card p-8 text-center">
      <Clock size={32} className="text-[var(--text-tertiary)] mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No vault history yet</h3>
      <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto">
        Your vault snapshots will appear here as you use Vennie. The time machine uses git to track how your vault evolves.
      </p>
    </div>
  );
}
