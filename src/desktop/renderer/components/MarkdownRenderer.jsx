import React, { useState, useEffect, useRef, useId } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils.js';

// ── Mermaid lazy init ───────────────────────────────────────────────────
let mermaidReady = false;
let mermaidPromise = null;

function initMermaid() {
  if (mermaidReady) return Promise.resolve();
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = import('mermaid').then(mod => {
    mod.default.initialize({
      startOnLoad: false,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'neutral',
      securityLevel: 'loose',
      fontFamily: 'var(--font-sans)',
    });
    mermaidReady = true;
  }).catch(() => { mermaidReady = false; });
  return mermaidPromise;
}

// ── MermaidBlock component ──────────────────────────────────────────────
function MermaidBlock({ code }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);
  const uniqueId = useId().replace(/:/g, '-');

  useEffect(() => {
    let cancelled = false;
    initMermaid().then(async () => {
      if (cancelled) return;
      try {
        const mermaid = (await import('mermaid')).default;
        const { svg: rendered } = await mermaid.render(`mermaid${uniqueId}`, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    });
    return () => { cancelled = true; };
  }, [code, uniqueId]);

  if (error) {
    return (
      <CodeBlock lang="mermaid" code={code} />
    );
  }

  if (!svg) {
    return (
      <div className="my-3 p-6 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center">
        <div className="shimmer w-32 h-4 rounded" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 p-4 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border)] overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ── CodeBlock with copy + language label ─────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] overflow-hidden group/code">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[var(--surface-tertiary)] border-b border-[var(--border)]">
        <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors opacity-0 group-hover/code:opacity-100"
        >
          {copied ? <Check size={11} className="text-[var(--success)]" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code content */}
      <pre className="bg-[var(--surface-secondary)] px-4 py-3 overflow-x-auto text-[13px] font-mono leading-relaxed text-[var(--text-secondary)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Inline image rendering ──────────────────────────────────────────────
function InlineImage({ src, alt }) {
  const [error, setError] = useState(false);
  if (error) return <span className="text-[var(--text-tertiary)]">[image: {alt || src}]</span>;
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--border)] inline-block max-w-full">
      <img
        src={src}
        alt={alt || ''}
        onError={() => setError(true)}
        className="max-w-full max-h-[400px] object-contain bg-[var(--surface-secondary)]"
      />
      {alt && <div className="px-3 py-1.5 bg-[var(--surface-secondary)] text-[10px] text-[var(--text-tertiary)]">{alt}</div>}
    </div>
  );
}

// ── Quick action pill (for /skill references) ───────────────────────────
function ActionPill({ command }) {
  function handleClick() {
    window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: command.slice(1) }));
  }
  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-subtle)] text-[var(--accent)] text-[0.9em] font-medium hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer mx-0.5"
    >
      {command}
    </button>
  );
}

// ── Frontmatter parser ──────────────────────────────────────────────────
function parseFrontmatter(lines) {
  if (lines[0]?.trim() !== '---') return { meta: null, startLine: 0 };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx < 0) return { meta: null, startLine: 0 };

  const meta = {};
  for (let i = 1; i < endIdx; i++) {
    const m = lines[i].match(/^(\w[\w\s-]*):\s*(.+)/);
    if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return { meta: Object.keys(meta).length > 0 ? meta : null, startLine: endIdx + 1 };
}

// ── Frontmatter display ─────────────────────────────────────────────────
function FrontmatterBar({ meta }) {
  if (!meta) return null;
  const pills = Object.entries(meta).map(([k, v]) => ({ key: k, value: v }));
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-[var(--border)]">
      {pills.map(({ key, value }) => (
        <span key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--surface-tertiary)] text-[11px]">
          <span className="text-[var(--text-tertiary)] capitalize">{key}</span>
          <span className="text-[var(--text-secondary)]">{value}</span>
        </span>
      ))}
    </div>
  );
}

// ── Checkbox list item ──────────────────────────────────────────────────
function CheckboxItem({ checked, text, keyProp }) {
  return (
    <div key={keyProp} className="flex items-start gap-2.5 py-1" style={{ paddingLeft: 4 }}>
      <span className={cn(
        'inline-flex items-center justify-center w-[16px] h-[16px] rounded border shrink-0 mt-[2px] text-[10px]',
        checked
          ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
          : 'border-[var(--border-strong)] text-transparent'
      )}>
        {checked ? '✓' : ''}
      </span>
      <span className={checked ? 'text-[var(--text-tertiary)] line-through' : ''}>{renderInline(text)}</span>
    </div>
  );
}

// ── Main renderer ───────────────────────────────────────────────────────

export default function MarkdownRenderer({ text }) {
  if (!text) return null;
  const allLines = text.split('\n');

  // Parse frontmatter
  const { meta, startLine } = parseFrontmatter(allLines);
  const lines = allLines.slice(startLine);

  const elements = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';

  if (meta) {
    elements.push(<FrontmatterBar key="fm" meta={meta} />);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        const code = codeLines.join('\n');
        if (codeLang === 'mermaid') {
          elements.push(<MermaidBlock key={`mermaid-${i}`} code={code} />);
        } else {
          elements.push(<CodeBlock key={`code-${i}`} lang={codeLang} code={code} />);
        }
        codeLines = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Image: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      elements.push(<InlineImage key={`img-${i}`} alt={imgMatch[1]} src={imgMatch[2]} />);
      continue;
    }

    // Headers — h1 gets bottom border separator
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level}`;
      const classes = {
        1: 'text-xl font-semibold text-[var(--text-primary)] mt-7 mb-1 tracking-tight',
        2: 'text-base font-semibold text-[var(--text-primary)] mt-6 mb-1 tracking-tight',
        3: 'text-[14px] font-semibold text-[var(--text-primary)] mt-5 mb-1',
        4: 'text-[13px] font-medium text-[var(--text-secondary)] mt-4 mb-1 uppercase tracking-wide',
      };
      if (level === 1) {
        elements.push(
          <div key={`h-${i}`} className="mt-7 mb-4">
            <Tag className={classes[level].replace('mt-7 ', '')}>{renderInline(headerMatch[2])}</Tag>
            <div className="h-px bg-[var(--border)] mt-2" />
          </div>
        );
      } else if (level === 2) {
        elements.push(
          <div key={`h-${i}`} className="mt-6 mb-3">
            <Tag className={classes[level].replace('mt-6 ', '')}>{renderInline(headerMatch[2])}</Tag>
            <div className="h-px bg-[var(--border)] mt-1.5" />
          </div>
        );
      } else {
        elements.push(
          <Tag key={`h-${i}`} className={classes[level]}>
            {renderInline(headerMatch[2])}
          </Tag>
        );
      }
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      elements.push(
        <div key={`bq-${i}`} className="border-l-2 border-[var(--text-tertiary)]/30 pl-4 my-2.5 text-[var(--text-secondary)] italic">
          {renderInline(line.trimStart().slice(2))}
        </div>
      );
      continue;
    }

    // Pipe table row detection
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }
      if (tableLines.length >= 2) {
        elements.push(renderTable(tableLines, i));
        i = j - 1;
        continue;
      }
    }

    // Checkbox list item  - [ ] or - [x]
    const checkMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)/);
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === 'x';
      elements.push(<CheckboxItem key={`cb-${i}`} keyProp={`cb-${i}`} checked={checked} text={checkMatch[2]} />);
      continue;
    }

    // Unordered list — improved spacing
    if (line.match(/^\s*[-*]\s+/)) {
      const indent = line.match(/^(\s*)/)[1].length;
      elements.push(
        <div key={`li-${i}`} className="flex gap-2.5 py-[3px]" style={{ paddingLeft: indent * 8 + 4 }}>
          <span className="text-[var(--text-tertiary)] shrink-0 mt-[3px] text-[8px]">●</span>
          <span className="leading-relaxed">{renderInline(line.replace(/^\s*[-*]\s+/, ''))}</span>
        </div>
      );
      continue;
    }

    // Ordered list — improved spacing
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (olMatch) {
      const indent = line.match(/^(\s*)/)[1].length;
      elements.push(
        <div key={`ol-${i}`} className="flex gap-2.5 py-[3px]" style={{ paddingLeft: indent * 8 + 4 }}>
          <span className="text-[var(--text-tertiary)] shrink-0 min-w-[18px] text-right text-[13px] tabular-nums">{olMatch[1]}.</span>
          <span className="leading-relaxed">{renderInline(olMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<hr key={`hr-${i}`} className="border-t border-[var(--border)] my-5" />);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} className="h-3" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1.5 leading-[1.7]">{renderInline(line)}</p>
    );
  }

  // Flush unclosed code block (streaming)
  if (inCodeBlock && codeLines.length > 0) {
    elements.push(<CodeBlock key="code-end" lang={codeLang} code={codeLines.join('\n')} />);
  }

  return <div>{elements}</div>;
}

// ── Table rendering ─────────────────────────────────────────────────────

function renderTable(tableLines, keyBase) {
  const parseRow = (line) => line.split('|').slice(1, -1).map(cell => cell.trim());
  const headers = parseRow(tableLines[0]);
  const rows = tableLines.slice(2).map(parseRow);

  return (
    <div key={`table-${keyBase}`} className="my-3 overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-tertiary)]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-[var(--text-primary)] border-b border-[var(--border)]">
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-tertiary)]/40 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-[var(--text-secondary)]">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inline formatting ───────────────────────────────────────────────────

function renderInline(text) {
  if (!text) return text;

  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Slash command → clickable pill
    let match = remaining.match(/^`(\/[\w-]+)`/);
    if (match) {
      parts.push(<ActionPill key={key++} command={match[1]} />);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Standalone slash command (not in backticks)
    match = remaining.match(/^(\/[\w-]+)(?=[\s,.)!?]|$)/);
    if (match && parts.length === 0 || (match && remaining[0] === '/')) {
      // Only match if it looks like a skill command (starts after space or beginning)
      if (parts.length === 0 || (parts.length > 0 && typeof parts[parts.length - 1] === 'string' && parts[parts.length - 1].endsWith(' '))) {
        parts.push(<ActionPill key={key++} command={match[1]} />);
        remaining = remaining.slice(match[1].length);
        continue;
      }
    }

    // Link [text](url)
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      parts.push(
        <a key={key++} href={match[2]} className="text-[var(--accent)] hover:underline inline-flex items-center gap-0.5" target="_blank" rel="noopener">
          {match[1]}<ExternalLink size={10} className="opacity-40" />
        </a>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold + italic
    match = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (match) {
      parts.push(<strong key={key++} className="font-semibold italic text-[var(--text-primary)]">{match[1]}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold
    match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      parts.push(<strong key={key++} className="font-semibold text-[var(--text-primary)]">{match[1]}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic
    match = remaining.match(/^\*(.+?)\*/);
    if (match) {
      parts.push(<em key={key++} className="text-[var(--text-secondary)]">{match[1]}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code — check for vault file paths inside backticks
    match = remaining.match(/^`(.+?)`/);
    if (match) {
      const codeContent = match[1];
      // Detect vault file paths (e.g. 05-Areas/People/Sean_Ryan.md, System/profile.yaml)
      const isVaultPath = /^(?:\d{2}-\w|System\/|\.vennie\/)/.test(codeContent) && /\.\w{2,5}$/.test(codeContent);
      if (isVaultPath) {
        parts.push(
          <button
            key={key++}
            onClick={() => window.dispatchEvent(new CustomEvent('vennie:open-file', { detail: codeContent }))}
            className="inline-flex items-center gap-1 bg-[var(--surface-tertiary)] px-1.5 py-0.5 rounded text-[0.9em] font-mono text-[var(--accent)] hover:bg-[var(--accent-subtle)] cursor-pointer transition-colors"
            title={`Open ${codeContent}`}
          >
            {codeContent.split('/').pop()}
          </button>
        );
      } else {
        parts.push(
          <code key={key++} className="bg-[var(--surface-tertiary)] px-1.5 py-0.5 rounded text-[0.9em] font-mono text-[var(--text-primary)]">
            {codeContent}
          </code>
        );
      }
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Find next special character
    const next = remaining.search(/\*|`|\[|!\[|\//);
    if (next > 0) {
      parts.push(remaining.slice(0, next));
      remaining = remaining.slice(next);
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}
