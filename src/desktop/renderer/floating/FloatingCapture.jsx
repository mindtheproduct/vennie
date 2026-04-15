import React, { useState, useRef, useEffect, useCallback } from 'react';

const TYPE_RULES = [
  { type: 'win', color: '#4ADE80', keywords: ['shipped', 'launched', 'completed', 'closed', 'landed', 'won', 'hit target', 'achieved', 'delivered'] },
  { type: 'decision', color: '#A78BFA', keywords: ['decided', 'going with', 'chose', 'choosing', 'picked', 'opted', 'committed to', 'agreed on'] },
  { type: 'idea', color: '#FACC15', keywords: ['what if', 'idea:', 'could we', 'maybe we', 'how about', 'experiment:', 'hypothesis'] },
  { type: 'task', color: '#60A5FA', keywords: ['todo:', 'task:', 'need to', 'remind me', 'follow up', 'action:'] },
];

function classifyInput(text) {
  const lower = text.toLowerCase();
  for (const rule of TYPE_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return { type: rule.type, color: rule.color };
    }
  }
  return { type: 'note', color: '#A1A1AA' };
}

export default function FloatingCapture() {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef(null);
  const classification = classifyInput(value);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitted(true);
    try {
      await window.floating.capture(classification.type, trimmed);
    } catch {}
    setTimeout(() => window.floating.dismiss(), 300);
  }, [value, classification.type]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      window.floating.dismiss();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (submitted) {
    return (
      <div className="floating-pill p-4 flex items-center justify-center gap-2" style={{ margin: '8px' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke={classification.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Captured</span>
      </div>
    );
  }

  return (
    <div className="floating-pill" style={{ margin: '8px', padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Type indicator */}
        <span
          className="type-badge"
          style={{
            background: `${classification.color}15`,
            color: classification.color,
            minWidth: '60px',
            justifyContent: 'center',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: classification.color,
            display: 'inline-block',
          }} />
          {classification.type}
        </span>

        {/* Input */}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture anything..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontFamily: 'inherit',
            caretColor: 'var(--accent)',
          }}
        />

        {/* Enter hint */}
        <span style={{
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          opacity: value.trim() ? 1 : 0.3,
          transition: 'opacity 0.2s',
          whiteSpace: 'nowrap',
        }}>
          <kbd style={{
            padding: '1px 5px',
            borderRadius: '4px',
            border: '1px solid var(--border-strong)',
            fontSize: '10px',
          }}>↵</kbd>
        </span>
      </div>
    </div>
  );
}
