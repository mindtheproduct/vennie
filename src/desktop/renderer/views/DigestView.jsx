import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, Copy, Check, ChevronDown, Sparkles, Loader2, Calendar } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

function getWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start: fmt(start), end: fmt(end), year: now.getFullYear(), label: `${fmt(start)}–${fmt(end)}, ${now.getFullYear()}` };
}

export default function DigestView({ appData }) {
  const [digest, setDigest] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pastDigests, setPastDigests] = useState([]);
  const [selectedPast, setSelectedPast] = useState(null);
  const [pastContent, setPastContent] = useState('');
  const streamRef = useRef('');
  const week = getWeekRange();

  // Load past digests
  useEffect(() => {
    window.vennie.search('weekly digest').then(results => {
      if (Array.isArray(results)) {
        setPastDigests(results.filter(r => r.file?.includes('Digest')).slice(0, 10));
      }
    }).catch(() => {});
  }, []);

  const generate = useCallback(() => {
    setGenerating(true);
    setDigest('');
    streamRef.current = '';

    const unsub = window.vennie.onEvent((event) => {
      if (event.type === 'text_delta') {
        streamRef.current += event.text;
        setDigest(streamRef.current);
      }
      if (event.type === 'done') {
        setGenerating(false);
        unsub();
      }
      if (event.type === 'error') {
        setGenerating(false);
        unsub();
      }
    });

    window.vennie.send('Generate my weekly digest for this week. Include: decisions made, wins captured, skills developed, goals progressed, key meetings. Format as a clean summary with sections.');
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(digest || pastContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    window.print();
  }

  async function loadPastDigest(result) {
    setSelectedPast(result);
    const data = await window.vennie.readFile(result.file);
    if (data?.content) setPastContent(data.content);
  }

  const displayContent = selectedPast ? pastContent : digest;
  const hasContent = displayContent.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-primary)]">
      <div className="flex-1 overflow-auto">
        <div className="max-w-[760px] mx-auto px-8 py-8">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Weekly Digest</h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-1 font-mono">{week.label}</p>
          </motion.div>

          {/* Past digests dropdown */}
          {pastDigests.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={13} className="text-[var(--text-tertiary)]" />
                <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest">Past Digests</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setSelectedPast(null); setPastContent(''); }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    !selectedPast ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  This week
                </button>
                {pastDigests.map((pd, i) => (
                  <button
                    key={i}
                    onClick={() => loadPastDigest(pd)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      selectedPast?.file === pd.file ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    )}
                  >
                    {pd.file?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || `Week ${i + 1}`}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Content area */}
          {!hasContent && !generating ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="surface-card p-8 text-center"
            >
              <Sparkles size={32} className="text-[var(--accent)] mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Generate This Week's Digest</h3>
              <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto mb-5">
                Vennie will summarize your decisions, wins, skills, goals, and meetings from this week.
              </p>
              <button
                onClick={generate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-all"
              >
                <Sparkles size={15} />
                Generate digest
              </button>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="surface-card p-6">
              {generating && !digest && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] mb-4">
                  <Loader2 size={14} className="animate-spin" />
                  Generating your weekly digest...
                </div>
              )}
              <div className="prose-sm">
                <MarkdownRenderer text={displayContent} />
              </div>
              {generating && (
                <div className="mt-2">
                  <div className="w-2 h-4 bg-[var(--accent)] rounded-sm animate-pulse inline-block" />
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Export bar */}
      <AnimatePresence>
        {hasContent && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="shrink-0 px-8 py-3 bg-[var(--surface-secondary)] border-t border-[var(--border)] flex items-center justify-between"
          >
            <span className="text-xs text-[var(--text-tertiary)]">
              {displayContent.split('\n').length} lines · {displayContent.length} chars
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-tertiary)] hover:bg-[var(--accent-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-tertiary)] hover:bg-[var(--accent-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all"
              >
                <Download size={13} />
                Print / PDF
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
