import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Scale, TrendingUp, AlertTriangle, Clock, ChevronRight, X, BarChart3, CalendarCheck } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

const STATUS_COLORS = {
  decided: 'var(--success)',
  considering: 'var(--warning)',
  revisiting: 'var(--cyan)',
  reversed: 'var(--danger)',
};

const CONFIDENCE_COLORS = {
  high: 'var(--success)',
  medium: 'var(--warning)',
  low: 'var(--danger)',
};

export default function DecisionsView({ appData }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDecision, setSelectedDecision] = useState(null);
  const [decisionContent, setDecisionContent] = useState('');

  useEffect(() => {
    window.vennie.getPatterns().then(result => {
      if (result && !result.error) setData(result);
      setLoading(false);
    });
  }, []);

  async function openDecision(decision) {
    setSelectedDecision(decision);
    if (decision.file) {
      const result = await window.vennie.readFile(decision.file);
      if (result?.content) setDecisionContent(result.content);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
        <div className="max-w-[860px] mx-auto px-8 py-8">
          <div className="shimmer h-8 w-48 rounded-lg mb-8" />
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map(i => <div key={i} className="shimmer h-24 rounded-xl" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="shimmer h-16 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const analysis = data?.analysis || {};
  const missing = data?.missing || [];
  const decisions = analysis.decisions || [];
  const totalDecisions = analysis.totalDecisions || decisions.length || 0;
  const avgConfidence = analysis.avgConfidence || 0;
  const accuracyRate = analysis.accuracyRate || 0;
  const patterns = analysis.patterns || [];
  const monthlyAccuracy = analysis.monthlyAccuracy || [];

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[860px] mx-auto px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Decisions</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Your decision-making patterns and history</p>
        </motion.div>

        {totalDecisions === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="grid grid-cols-3 gap-4 mb-8"
            >
              <StatCard icon={Scale} label="Total Decisions" value={totalDecisions} />
              <StatCard icon={TrendingUp} label="Avg Confidence" value={`${Math.round(avgConfidence * 100)}%`} color={avgConfidence > 0.6 ? 'var(--success)' : 'var(--warning)'} />
              <StatCard icon={BarChart3} label="Accuracy Rate" value={`${Math.round(accuracyRate * 100)}%`} color={accuracyRate > 0.6 ? 'var(--success)' : 'var(--warning)'} />
            </motion.div>

            {/* Missing context alert */}
            {missing.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="surface-card p-4 mb-6 flex items-start gap-3"
                style={{ borderLeft: '3px solid var(--warning)' }}
              >
                <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{missing.length} decision{missing.length > 1 ? 's' : ''} need review</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {missing.slice(0, 3).map(m => m.topic || m.file).join(', ')}
                    {missing.length > 3 ? ` and ${missing.length - 3} more` : ''}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Pattern insights */}
            {patterns.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
                <h2 className="text-[11px] font-semibold text-[var(--accent)] uppercase tracking-widest mb-3">Patterns</h2>
                <div className="grid grid-cols-2 gap-3">
                  {patterns.map((p, i) => (
                    <div key={i} className="surface-card p-4">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{p.label}</p>
                      <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-tertiary)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(p.value * 100, 100)}%`,
                            background: p.value > 0.6 ? 'var(--success)' : p.value > 0.4 ? 'var(--warning)' : 'var(--danger)',
                          }}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1.5">{p.description}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Accuracy trend */}
            {monthlyAccuracy.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
                <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Accuracy Trend</h2>
                <div className="surface-card p-5">
                  <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                    {monthlyAccuracy.map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-sm transition-all"
                          style={{
                            height: `${Math.max(m.accuracy * 80, 4)}px`,
                            background: m.accuracy > 0.6 ? 'var(--accent)' : 'var(--warning)',
                            opacity: 0.7 + (m.accuracy * 0.3),
                          }}
                        />
                        <span className="text-[9px] text-[var(--text-tertiary)]">{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Decision timeline */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Timeline</h2>
              <div className="space-y-2">
                {decisions.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => openDecision(d)}
                    className="w-full text-left surface-card p-4 flex items-center gap-4 group cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[d.status] || 'var(--text-tertiary)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{d.topic || d.file}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{d.date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.confidence && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                          background: `${CONFIDENCE_COLORS[d.confidence] || 'var(--text-tertiary)'}15`,
                          color: CONFIDENCE_COLORS[d.confidence] || 'var(--text-tertiary)',
                        }}>
                          {d.confidence}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                        background: `${STATUS_COLORS[d.status] || 'var(--text-tertiary)'}15`,
                        color: STATUS_COLORS[d.status] || 'var(--text-tertiary)',
                      }}>
                        {d.status}
                      </span>
                      <ChevronRight size={14} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Decision detail panel */}
      {selectedDecision && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSelectedDecision(null)} />
          <motion.div
            initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            className="w-[480px] bg-[var(--surface-primary)] border-l border-[var(--border)] overflow-auto p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{selectedDecision.topic || 'Decision'}</h2>
              <button onClick={() => setSelectedDecision(null)} className="p-1 rounded hover:bg-[var(--surface-tertiary)]">
                <X size={16} className="text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="text-sm">
              <MarkdownRenderer text={decisionContent} />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-[var(--text-tertiary)]" />
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest">{label}</span>
      </div>
      <span className="text-2xl font-bold font-mono" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface-card p-8 text-center">
      <Scale size={32} className="text-[var(--text-tertiary)] mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No decisions logged yet</h3>
      <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto">
        Use <code className="text-[var(--accent)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded">/log decision</code> to capture decisions, or just tell Vennie when you make one.
      </p>
    </div>
  );
}
