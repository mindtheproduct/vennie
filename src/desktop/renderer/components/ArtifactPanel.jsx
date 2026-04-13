import React, { useState } from 'react';
import { X, Copy, Save, Check, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from './MarkdownRenderer.jsx';

export default function ArtifactPanel({ artifact, onClose, onSave }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!artifact) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function handleSave() {
    if (onSave) {
      await onSave(artifact);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <div className={cn(
      'flex flex-col bg-[var(--surface-secondary)] border-l border-[var(--border)] transition-all duration-200',
      expanded ? 'w-[60%]' : 'w-[45%]'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {artifact.title || 'Artifact'}
          </span>
          {artifact.type && (
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] px-1.5 py-0.5 rounded bg-[var(--surface-tertiary)]">
              {artifact.type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
            title="Copy"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          {onSave && (
            <button
              onClick={handleSave}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
              title="Save to vault"
            >
              {saved ? <Check size={13} /> : <Save size={13} />}
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {artifact.type === 'code' ? (
          <pre className="text-[13px] font-mono text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
            <code>{artifact.content}</code>
          </pre>
        ) : artifact.type === 'table' ? (
          <div className="text-sm">
            <MarkdownRenderer text={artifact.content} />
          </div>
        ) : (
          <div className="text-sm leading-relaxed">
            <MarkdownRenderer text={artifact.content} />
          </div>
        )}
      </div>
    </div>
  );
}
