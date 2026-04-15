import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Copy, Check, RefreshCw, Save, Share2, Users, Award, Loader2, X } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

const TABS = [
  { id: 'linkedin', label: 'LinkedIn Post', icon: Share2 },
  { id: 'update', label: 'Team Update', icon: Users },
  { id: 'evidence', label: 'Evidence', icon: Award },
];

const SKILL_SUGGESTIONS = [
  'Strategy', 'Execution', 'Leadership', 'Discovery', 'Analytics',
  'Communication', 'Stakeholder Mgmt', 'Technical', 'Design', 'Growth',
];

export default function ShipToStoryView({ appData }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const [stakeholders, setStakeholders] = useState('');
  const [skills, setSkills] = useState([]);
  const [activeTab, setActiveTab] = useState('linkedin');
  const [outputs, setOutputs] = useState({ linkedin: '', update: '', evidence: '' });
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);
  const [saved, setSaved] = useState(false);
  const streamRef = useRef('');

  function toggleSkill(skill) {
    setSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  }

  const generate = useCallback(() => {
    if (!title.trim()) return;
    setGenerating(true);
    setOutputs({ linkedin: '', update: '', evidence: '' });
    streamRef.current = '';

    const prompt = [
      `I shipped: "${title.trim()}"`,
      description && `Description: ${description}`,
      impact && `Impact/metrics: ${impact}`,
      stakeholders && `Stakeholders: ${stakeholders}`,
      skills.length > 0 && `Skills demonstrated: ${skills.join(', ')}`,
      '',
      'Generate three things, clearly separated with headers:',
      '## LinkedIn Post',
      'A LinkedIn post in my voice. Concise, personal, no hashtag spam. Focus on the insight, not just the announcement.',
      '## Team Update',
      'A Slack/email update for my manager or team. Professional, metric-focused, clear next steps.',
      '## Career Evidence',
      'A structured career evidence entry with: What Happened, Evidence/Metrics, Context, Skills Demonstrated.',
    ].filter(Boolean).join('\n');

    const unsub = window.vennie.onEvent((event) => {
      if (event.type === 'text_delta') {
        streamRef.current += event.text;
        parseOutputs(streamRef.current);
      }
      if (event.type === 'done') {
        setGenerating(false);
        parseOutputs(streamRef.current);
        unsub();
      }
      if (event.type === 'error') {
        setGenerating(false);
        unsub();
      }
    });

    window.vennie.send(prompt);
  }, [title, description, impact, stakeholders, skills]);

  function parseOutputs(text) {
    const sections = {};
    const linkedinMatch = text.match(/## LinkedIn Post\s*\n([\s\S]*?)(?=## Team Update|## Career Evidence|$)/);
    const updateMatch = text.match(/## Team Update\s*\n([\s\S]*?)(?=## Career Evidence|$)/);
    const evidenceMatch = text.match(/## Career Evidence\s*\n([\s\S]*?)$/);

    sections.linkedin = linkedinMatch?.[1]?.trim() || '';
    sections.update = updateMatch?.[1]?.trim() || '';
    sections.evidence = evidenceMatch?.[1]?.trim() || '';
    setOutputs(sections);
  }

  function handleCopy(tab) {
    navigator.clipboard.writeText(outputs[tab]);
    setCopied(tab);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSave() {
    const date = new Date().toISOString().slice(0, 10);
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = `06-Evidence/Wins/${date}-${slug}.md`;
    const content = [
      '---',
      `date: ${date}`,
      `category: ship`,
      `impact: medium`,
      skills.length > 0 ? `skills: [${skills.join(', ')}]` : null,
      stakeholders ? `stakeholders: [${stakeholders}]` : null,
      '---',
      '',
      outputs.evidence,
    ].filter(v => v !== null).join('\n');

    await window.vennie.writeFile(filename, content);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const hasOutput = outputs.linkedin || outputs.update || outputs.evidence;
  const currentOutput = outputs[activeTab] || '';

  return (
    <div className="flex-1 flex overflow-hidden bg-[var(--surface-primary)]">
      {/* Left panel — Input */}
      <div className="w-[380px] shrink-0 border-r border-[var(--border)] overflow-auto p-6">
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight mb-1">Ship to Story</h1>
          <p className="text-sm text-[var(--text-tertiary)] mb-6">One ship, three outputs.</p>
        </motion.div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1.5">What did you ship?</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. New onboarding flow"
              className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What it does and why it matters..."
              rows={3}
              className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1.5">Impact / Metrics</label>
            <input
              value={impact}
              onChange={e => setImpact(e.target.value)}
              placeholder="e.g. Completion rate 67% → 89%"
              className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1.5">Stakeholders</label>
            <input
              value={stakeholders}
              onChange={e => setStakeholders(e.target.value)}
              placeholder="Jane Smith, Marcus Lee"
              className="w-full bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1.5">Skills</label>
            <div className="flex flex-wrap gap-1.5">
              {SKILL_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSkill(s)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                    skills.includes(s)
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generate}
            disabled={!title.trim() || generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-all mt-2"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Right panel — Outputs */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-6 pb-3">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const hasContent = !!outputs[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeTab === tab.id
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                  !hasContent && 'opacity-40'
                )}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          {!hasOutput && !generating ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Rocket size={32} className="text-[var(--text-tertiary)] mx-auto mb-3 opacity-30" />
                <p className="text-sm text-[var(--text-tertiary)]">Fill in what you shipped and hit Generate.</p>
              </div>
            </div>
          ) : (
            <div className="surface-card p-5">
              {currentOutput ? (
                <div className="text-sm">
                  <MarkdownRenderer text={currentOutput} />
                </div>
              ) : generating ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                  <Loader2 size={14} className="animate-spin" />
                  Generating {activeTab}...
                </div>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">No content for this section yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        {currentOutput && (
          <div className="shrink-0 px-6 py-3 bg-[var(--surface-secondary)] border-t border-[var(--border)] flex items-center justify-end gap-2">
            <button
              onClick={() => handleCopy(activeTab)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-tertiary)] hover:bg-[var(--accent-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all"
            >
              {copied === activeTab ? <Check size={13} /> : <Copy size={13} />}
              {copied === activeTab ? 'Copied' : 'Copy'}
            </button>
            {activeTab === 'evidence' && (
              <button
                onClick={handleSave}
                disabled={saved}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-all"
              >
                {saved ? <Check size={13} /> : <Save size={13} />}
                {saved ? 'Saved' : 'Save to vault'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
