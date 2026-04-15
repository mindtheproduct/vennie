import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Award, TrendingUp, Zap, Calendar, Star, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils.js';

const CATEGORY_COLORS = {
  ship: { bg: 'rgba(74, 222, 128, 0.1)', fg: '#4ADE80' },
  metric: { bg: 'rgba(96, 165, 250, 0.1)', fg: '#60A5FA' },
  feedback: { bg: 'rgba(167, 139, 250, 0.1)', fg: '#A78BFA' },
  career: { bg: 'rgba(251, 191, 36, 0.1)', fg: '#FBBF24' },
  deal: { bg: 'rgba(52, 211, 153, 0.1)', fg: '#34D399' },
  speaking: { bg: 'rgba(244, 114, 182, 0.1)', fg: '#F472B6' },
};

export default function CareerView({ appData }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.vennie.getCareer().then(result => {
      if (result && !result.error) setData(result);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
        <div className="max-w-[860px] mx-auto px-8 py-8">
          <div className="shimmer h-8 w-40 rounded-lg mb-8" />
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map(i => <div key={i} className="shimmer h-24 rounded-xl" />)}
          </div>
          <div className="shimmer h-48 rounded-xl mb-6" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="shimmer h-14 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const timeline = data?.timeline || [];
  const matrix = data?.matrix || {};
  const skills = Object.entries(matrix).sort((a, b) => (b[1].level || 0) - (a[1].level || 0));
  const totalEvidence = timeline.length;
  const skillCount = skills.length;
  const thisMonth = timeline.filter(e => {
    const d = new Date(e.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[860px] mx-auto px-8 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Career</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Your growth trajectory and evidence</p>
        </motion.div>

        {totalEvidence === 0 && skills.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Growth indicators */}
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="grid grid-cols-3 gap-4 mb-8"
            >
              <GrowthCard icon={Award} label="Total Evidence" value={totalEvidence} />
              <GrowthCard icon={Zap} label="Skills Tracked" value={skillCount} />
              <GrowthCard icon={Calendar} label="This Month" value={thisMonth} color={thisMonth > 0 ? 'var(--success)' : 'var(--text-tertiary)'} />
            </motion.div>

            {/* Skill matrix */}
            {skills.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
                <h2 className="text-[11px] font-semibold text-[var(--accent)] uppercase tracking-widest mb-3">Skill Matrix</h2>
                <div className="grid grid-cols-2 gap-3">
                  {skills.map(([name, info], i) => (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.03 }}
                      className={cn('surface-card p-4', info.level > 70 && 'ring-1 ring-[var(--accent-subtle)]')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{name}</span>
                        <span className="text-xs font-mono text-[var(--text-tertiary)]">{info.evidenceCount || 0} evidence</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-tertiary)] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${info.level || 0}%` }}
                          transition={{ duration: 0.6, delay: 0.2 + i * 0.03 }}
                          className="h-full rounded-full"
                          style={{ background: info.level > 70 ? 'var(--accent)' : info.level > 40 ? 'var(--cyan)' : 'var(--text-tertiary)' }}
                        />
                      </div>
                      {info.lastDemonstrated && (
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">Last: {info.lastDemonstrated}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <h2 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Evidence Timeline</h2>
                <div className="relative pl-6">
                  {/* Vertical line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />

                  <div className="space-y-3">
                    {timeline.map((item, i) => {
                      const cat = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.ship;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.04 }}
                          className="relative surface-card p-4"
                        >
                          {/* Dot on timeline */}
                          <div
                            className="absolute -left-6 top-5 w-3 h-3 rounded-full border-2 border-[var(--surface-primary)]"
                            style={{ background: cat.fg }}
                          />
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-[var(--text-tertiary)]">{item.date}</span>
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                  style={{ background: cat.bg, color: cat.fg }}
                                >
                                  {item.category}
                                </span>
                                {item.skills?.map(s => (
                                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-subtle)] text-[var(--accent)]">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GrowthCard({ icon: Icon, label, value, color }) {
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
      <Award size={32} className="text-[var(--text-tertiary)] mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No career evidence yet</h3>
      <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto">
        Use <code className="text-[var(--accent)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded">/shipped</code> to track what you build, or tell Vennie about your wins.
      </p>
    </div>
  );
}
