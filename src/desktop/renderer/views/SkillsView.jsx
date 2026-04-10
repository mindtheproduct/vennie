import React, { useState, useEffect } from 'react';

const CATEGORY_COLORS = {
  planning: 'var(--cyan)',
  career: 'var(--green)',
  coaching: 'var(--purple)',
  writing: 'var(--accent-blue)',
  analysis: 'var(--yellow)',
  general: 'var(--text-dim)',
};

const CATEGORY_ORDER = ['planning', 'career', 'coaching', 'writing', 'analysis', 'general'];

export default function SkillsView({ appData, onRunSkill }) {
  const [skills, setSkills] = useState([]);
  const [filter, setFilter] = useState('');
  const e = React.createElement;

  useEffect(() => {
    window.vennie.listSkills().then(data => {
      if (Array.isArray(data)) setSkills(data);
    });
  }, []);

  // Also include built-in commands as skills
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
    ? allSkills.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()) || (s.description || '').toLowerCase().includes(filter.toLowerCase()))
    : allSkills;

  // Group by category
  const grouped = {};
  for (const s of filtered) {
    const cat = s.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  return e('div', {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '32px 40px',
      maxWidth: 900,
    }
  },
    e('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }
    },
      e('h1', {
        style: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }
      }, 'Skills'),
      e('input', {
        type: 'text',
        value: filter,
        onChange: (ev) => setFilter(ev.target.value),
        placeholder: 'Filter skills...',
        style: {
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 14px',
          color: 'var(--text-primary)',
          fontSize: 13,
          outline: 'none',
          width: 200,
          fontFamily: 'var(--font-sans)',
        }
      }),
    ),

    e('p', {
      style: { color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }
    }, `${allSkills.length} skills available. Click to run in chat.`),

    ...CATEGORY_ORDER
      .filter(cat => grouped[cat]?.length > 0)
      .map(cat =>
        e('div', { key: cat, style: { marginBottom: 28 } },
          e('h2', {
            style: {
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: CATEGORY_COLORS[cat] || 'var(--text-dim)',
              marginBottom: 12,
            }
          }, cat),
          e('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
            }
          },
            ...grouped[cat].map(skill =>
              e('button', {
                key: skill.name,
                onClick: () => onRunSkill(skill.name),
                style: {
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s',
                }
              },
                e('span', {
                  style: {
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: 14,
                    fontFamily: 'var(--font-mono)',
                  }
                }, `/${skill.name}`),
                e('span', {
                  style: { color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.4 }
                }, skill.description || ''),
              )
            ),
          ),
        )
      ),
  );
}
