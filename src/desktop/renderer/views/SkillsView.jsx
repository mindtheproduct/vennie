import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../lib/utils.js';

const CATEGORY_DOT = {
  planning: 'bg-[var(--accent)]',
  career: 'bg-[var(--success)]',
  coaching: 'bg-[#a78bfa]',
  writing: 'bg-[var(--cyan)]',
  analysis: 'bg-[var(--warning)]',
  general: 'bg-[var(--text-tertiary)]',
};

const CATEGORY_ORDER = ['planning', 'career', 'coaching', 'writing', 'analysis', 'general'];

export default function SkillsView({ appData, onRunSkill }) {
  const [skills, setSkills] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    window.vennie.listSkills().then(data => {
      if (Array.isArray(data)) setSkills(data);
    });
  }, []);

  const builtInSkills = [
    { name: 'brief', description: 'Morning brief — your day at a glance', category: 'planning' },
    { name: 'gym', description: 'Product sense training exercise', category: 'coaching' },
    { name: 'simulate', description: 'Roleplay as a stakeholder', category: 'analysis' },
    { name: 'patterns', description: 'Analyse decision-making patterns', category: 'analysis' },
    { name: 'who', description: 'Find expertise in your network', category: 'analysis' },
    { name: 'radar', description: 'Competitive intelligence', category: 'analysis' },
    { name: 'shipped', description: 'Capture career evidence', category: 'career' },
    { name: 'career', description: 'Career timeline and skill matrix', category: 'career' },
    { name: 'challenge', description: 'Adversarial plan analysis', category: 'coaching' },
    { name: 'search', description: 'Search your vault', category: 'general' },
    { name: 'log', description: 'Quick capture: decision, win, idea, note', category: 'general' },
  ];

  const allSkills = [...builtInSkills, ...skills];
  const filtered = filter.trim()
    ? allSkills.filter(s =>
        s.name.toLowerCase().includes(filter.toLowerCase()) ||
        (s.description || '').toLowerCase().includes(filter.toLowerCase())
      )
    : allSkills;

  const grouped = {};
  for (const s of filtered) {
    const cat = s.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[760px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Skills</h1>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">{allSkills.length} available</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] focus-within:bg-[var(--surface-tertiary)] transition-colors w-[200px]">
            <Search size={13} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        {CATEGORY_ORDER.filter(cat => grouped[cat]?.length > 0).map(cat => (
          <div key={cat} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('w-1.5 h-1.5 rounded-full', CATEGORY_DOT[cat])} />
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
                {cat}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {grouped[cat].map(skill => (
                <button
                  key={skill.name}
                  onClick={() => onRunSkill(skill.name)}
                  className="group text-left px-4 py-3 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] transition-all"
                >
                  <div className="text-[13px] font-semibold font-mono text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors">
                    /{skill.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed line-clamp-2">
                    {skill.description || ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
