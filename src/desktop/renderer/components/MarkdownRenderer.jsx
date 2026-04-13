import React from 'react';

// ── Lightweight Markdown → React renderer ──────────────────────────────────
// Handles: headers, bold, italic, code, code blocks, lists, links, blockquotes,
// tables, horizontal rules. No external dependencies.

export default function MarkdownRenderer({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-[var(--surface-tertiary)] border border-[var(--border)] rounded-lg px-4 py-3 my-2 overflow-x-auto text-[13px] font-mono leading-relaxed text-[var(--text-secondary)]">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
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

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level}`;
      const classes = {
        1: 'text-[22px] font-semibold text-[var(--accent)] mt-6 mb-3 tracking-tight',
        2: 'text-lg font-semibold text-[var(--accent)] mt-5 mb-2 tracking-tight',
        3: 'text-[15px] font-semibold text-[var(--text-primary)] mt-4 mb-2',
        4: 'text-sm font-semibold text-[var(--text-primary)] mt-3 mb-1',
      };
      elements.push(
        <Tag key={`h-${i}`} className={classes[level]}>
          {renderInline(headerMatch[2])}
        </Tag>
      );
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      elements.push(
        <div key={`bq-${i}`} className="border-l-[3px] border-[var(--accent)]/40 pl-3 my-2 text-[var(--text-secondary)] italic">
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

    // Unordered list
    if (line.match(/^\s*[-*]\s+/)) {
      const indent = line.match(/^(\s*)/)[1].length;
      elements.push(
        <div key={`li-${i}`} className="flex gap-2 my-0.5" style={{ paddingLeft: indent * 8 + 4 }}>
          <span className="text-[var(--accent)] shrink-0 mt-[2px]">&bull;</span>
          <span>{renderInline(line.replace(/^\s*[-*]\s+/, ''))}</span>
        </div>
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (olMatch) {
      const indent = line.match(/^(\s*)/)[1].length;
      elements.push(
        <div key={`ol-${i}`} className="flex gap-2 my-0.5" style={{ paddingLeft: indent * 8 + 4 }}>
          <span className="text-[var(--accent)] shrink-0 min-w-[18px] text-right text-sm">{olMatch[1]}.</span>
          <span>{renderInline(olMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<hr key={`hr-${i}`} className="border-t border-[var(--border)] my-4" />);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1 leading-relaxed">{renderInline(line)}</p>
    );
  }

  // Flush unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      <pre key="code-end" className="bg-[var(--surface-tertiary)] border border-[var(--border)] rounded-lg px-4 py-3 my-2 overflow-x-auto text-[13px] font-mono leading-relaxed text-[var(--text-secondary)]">
        <code>{codeLines.join('\n')}</code>
      </pre>
    );
  }

  return <div>{elements}</div>;
}

// ── Table rendering ──────────────────────────────────────────────────────

function renderTable(tableLines, keyBase) {
  const parseRow = (line) => line.split('|').slice(1, -1).map(cell => cell.trim());
  const headers = parseRow(tableLines[0]);
  // Skip separator row (index 1)
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

// ── Inline formatting ──────────────────────────────────────────────────────

function renderInline(text) {
  if (!text) return text;

  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Link [text](url)
    let match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      parts.push(
        <a key={key++} href={match[2]} className="text-[var(--accent)] hover:underline" target="_blank" rel="noopener">
          {match[1]}
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

    // Inline code
    match = remaining.match(/^`(.+?)`/);
    if (match) {
      parts.push(
        <code key={key++} className="bg-[var(--surface-tertiary)] px-1.5 py-0.5 rounded text-[0.9em] font-mono text-[var(--accent)]">
          {match[1]}
        </code>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Find next special character
    const next = remaining.search(/\*|`|\[/);
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
