import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Save, Sparkles, ChevronDown, Check, FileText, Bold, Italic, List, Heading } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

export default function FocusView({ appData }) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('write'); // write | preview | split
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiMenu, setAiMenu] = useState(null); // { text, start, end } when text is selected
  const [aiLoading, setAiLoading] = useState(false);
  const textareaRef = useRef(null);

  // Track selection for AI assist
  useEffect(() => {
    function handleSelectionChange() {
      if (!textareaRef.current) return;
      const el = textareaRef.current;
      if (document.activeElement !== el) {
        setAiMenu(null);
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== end) {
        const selectedText = content.slice(start, end);
        if (selectedText.trim().length > 3) {
          setAiMenu({ text: selectedText, start, end });
        }
      } else {
        setAiMenu(null);
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [content]);

  const handleAiAction = useCallback(async (action) => {
    if (!aiMenu || !window.vennie?.send) return;
    setAiLoading(true);

    const prompts = {
      expand: `Expand on this text, adding detail and nuance. Return only the expanded text, no preamble:\n\n${aiMenu.text}`,
      summarize: `Summarize this concisely. Return only the summary:\n\n${aiMenu.text}`,
      challenge: `Challenge the assumptions in this text. Return a brief devil's advocate perspective:\n\n${aiMenu.text}`,
      improve: `Improve the clarity and impact of this writing. Return only the improved text:\n\n${aiMenu.text}`,
      evidence: `Find evidence or supporting points for this claim from my vault. If none found, suggest what evidence would strengthen it:\n\n${aiMenu.text}`,
    };

    try {
      const result = await window.vennie.send(prompts[action]);
      if (result?.text) {
        // Replace selected text with AI output
        const before = content.slice(0, aiMenu.start);
        const after = content.slice(aiMenu.end);
        setContent(before + result.text + after);
      }
    } catch {}
    setAiLoading(false);
    setAiMenu(null);
  }, [aiMenu, content]);

  async function handleSave() {
    if (!content.trim() || !title.trim()) return;
    setSaving(true);
    try {
      const fileName = title.trim().replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
      await window.vennie?.writeFile?.(`00-Inbox/Ideas/${fileName}.md`, `# ${title}\n\n${content}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [content, title]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface-primary)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          {/* Mode switcher */}
          {['write', 'split', 'preview'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize',
                mode === m
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
            {content.split(/\s+/).filter(Boolean).length} words
          </span>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim() || !title.trim()}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              saved
                ? 'bg-[var(--success)] text-white'
                : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30'
            )}
          >
            {saved ? <Check size={12} /> : <Save size={12} />}
            {saved ? 'Saved' : 'Save to vault'}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Write pane */}
        {(mode === 'write' || mode === 'split') && (
          <div className={cn('flex flex-col overflow-hidden', mode === 'split' ? 'w-1/2 border-r border-[var(--border)]' : 'flex-1')}>
            <div className="max-w-[680px] w-full mx-auto px-8 py-6 flex-1 flex flex-col">
              {/* Title */}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                className="bg-transparent border-none outline-none text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] mb-4 tracking-tight"
              />

              {/* Content */}
              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start writing... Select text for AI assist."
                  className="w-full h-full bg-transparent border-none outline-none text-sm text-[var(--text-primary)] leading-relaxed resize-none placeholder:text-[var(--text-tertiary)] font-sans"
                />

                {/* AI assist popup */}
                {aiMenu && !aiLoading && (
                  <div className="absolute left-0 right-0 flex justify-center" style={{ top: -8 }}>
                    <div className="glass-panel rounded-xl px-1 py-1 flex gap-0.5 animate-scale-in">
                      {[
                        { id: 'expand', label: 'Expand' },
                        { id: 'improve', label: 'Improve' },
                        { id: 'challenge', label: 'Challenge' },
                        { id: 'summarize', label: 'Summarize' },
                        { id: 'evidence', label: 'Find evidence' },
                      ].map(a => (
                        <button
                          key={a.id}
                          onClick={() => handleAiAction(a.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-all"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-primary)]/60">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-secondary)]">
                      <Sparkles size={14} className="text-[var(--accent)] animate-pulse" />
                      <span className="text-sm text-[var(--text-secondary)]">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview pane */}
        {(mode === 'preview' || mode === 'split') && (
          <div className={cn('overflow-auto', mode === 'split' ? 'w-1/2' : 'flex-1')}>
            <div className="max-w-[680px] mx-auto px-8 py-6">
              {title && <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4 tracking-tight">{title}</h1>}
              {content ? (
                <div className="text-sm"><MarkdownRenderer text={content} /></div>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
