import React, { useState, useEffect } from 'react';
import { X, Copy, Save, Check, FileText, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from './MarkdownRenderer.jsx';

export default function SidePanel({ panels, activePanel, onSetActive, onClose, onClosePanel, onSave }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!panels || panels.length === 0) return null;

  const panel = panels.find(p => p.id === activePanel) || panels[0];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(panel.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function handleSave() {
    if (onSave && panel) {
      await onSave(panel);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <div className="flex flex-col w-[45%] bg-[var(--surface-primary)] border-l border-[var(--border)]">
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--border)] bg-[var(--surface-secondary)] overflow-x-auto">
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => onSetActive(p.id)}
            className={cn(
              'group flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-r border-[var(--border)] whitespace-nowrap transition-colors min-w-0 max-w-[180px]',
              p.id === panel.id
                ? 'bg-[var(--surface-primary)] text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
            )}
          >
            <FileText size={11} className="shrink-0 opacity-50" />
            <span className="truncate">{p.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClosePanel(p.id); }}
              className="shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-tertiary)] transition-all"
            >
              <X size={9} />
            </button>
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 px-2 shrink-0">
          <button
            onClick={handleCopy}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
            title="Copy"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {onSave && (
            <button
              onClick={handleSave}
              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
              title="Save to vault"
            >
              {saved ? <Check size={12} /> : <Save size={12} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
            title="Close all"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Panel header — file path */}
      {panel.filePath && (
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-secondary)]/50">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] truncate block">
            {panel.filePath}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {panel.type === 'code' ? (
          <pre className="text-[13px] font-mono text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
            <code>{panel.content}</code>
          </pre>
        ) : (
          <div className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <MarkdownRenderer text={panel.content} />
          </div>
        )}
      </div>
    </div>
  );
}
