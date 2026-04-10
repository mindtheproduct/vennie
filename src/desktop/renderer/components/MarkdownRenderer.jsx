import React from 'react';

// ── Lightweight Markdown → React renderer ──────────────────────────────────
// Handles: headers, bold, italic, code, code blocks, lists, links, blockquotes.
// No external dependencies.

export default function MarkdownRenderer({ text }) {
  if (!text) return null;
  const e = React.createElement;
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
          e('pre', {
            key: `code-${i}`,
            style: {
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              margin: '8px 0',
              overflowX: 'auto',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
            }
          },
            e('code', null, codeLines.join('\n'))
          )
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
      const sizes = { 1: 22, 2: 18, 3: 15, 4: 14 };
      elements.push(
        e(`h${level}`, {
          key: `h-${i}`,
          style: {
            fontSize: sizes[level],
            fontWeight: 600,
            color: level <= 2 ? 'var(--cyan)' : 'var(--text-primary)',
            margin: `${level <= 2 ? 16 : 12}px 0 8px`,
          }
        }, renderInline(headerMatch[2]))
      );
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      elements.push(
        e('div', {
          key: `bq-${i}`,
          style: {
            borderLeft: '3px solid var(--cyan-dim)',
            paddingLeft: 12,
            margin: '6px 0',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
          }
        }, renderInline(line.trimStart().slice(2)))
      );
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*]\s+/)) {
      const indent = line.match(/^(\s*)/)[1].length;
      elements.push(
        e('div', {
          key: `li-${i}`,
          style: {
            display: 'flex',
            gap: 8,
            paddingLeft: indent * 8 + 4,
            margin: '3px 0',
          }
        },
          e('span', { style: { color: 'var(--cyan)', flexShrink: 0 } }, '\u2022'),
          e('span', null, renderInline(line.replace(/^\s*[-*]\s+/, '')))
        )
      );
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (olMatch) {
      const indent = line.match(/^(\s*)/)[1].length;
      elements.push(
        e('div', {
          key: `ol-${i}`,
          style: {
            display: 'flex',
            gap: 8,
            paddingLeft: indent * 8 + 4,
            margin: '3px 0',
          }
        },
          e('span', { style: { color: 'var(--accent-blue)', flexShrink: 0, minWidth: 18, textAlign: 'right' } }, `${olMatch[1]}.`),
          e('span', null, renderInline(olMatch[2]))
        )
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(
        e('hr', {
          key: `hr-${i}`,
          style: { border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }
        })
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(e('div', { key: `br-${i}`, style: { height: 8 } }));
      continue;
    }

    // Regular paragraph
    elements.push(
      e('p', {
        key: `p-${i}`,
        style: { margin: '4px 0', lineHeight: 1.6 }
      }, renderInline(line))
    );
  }

  // Flush unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      e('pre', {
        key: 'code-end',
        style: {
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          margin: '8px 0',
          overflowX: 'auto',
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }
      },
        e('code', null, codeLines.join('\n'))
      )
    );
  }

  return e('div', null, ...elements);
}

// ── Inline formatting ──────────────────────────────────────────────────────

function renderInline(text) {
  if (!text) return text;

  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold + italic
    let match = remaining.match(/\*\*\*(.+?)\*\*\*/);
    if (match && match.index === 0) {
      parts.push(React.createElement('strong', { key: key++, style: { fontStyle: 'italic', color: 'var(--text-primary)' } }, match[1]));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold
    match = remaining.match(/\*\*(.+?)\*\*/);
    if (match && match.index === 0) {
      parts.push(React.createElement('strong', { key: key++, style: { color: 'var(--text-primary)' } }, match[1]));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic
    match = remaining.match(/\*(.+?)\*/);
    if (match && match.index === 0) {
      parts.push(React.createElement('em', { key: key++, style: { color: 'var(--text-secondary)' } }, match[1]));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code
    match = remaining.match(/`(.+?)`/);
    if (match && match.index === 0) {
      parts.push(React.createElement('code', {
        key: key++,
        style: {
          background: 'var(--bg-tertiary)',
          padding: '1px 6px',
          borderRadius: 3,
          fontSize: '0.9em',
          fontFamily: 'var(--font-mono)',
          color: 'var(--cyan)',
        }
      }, match[1]));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Find next special character
    const next = remaining.search(/\*|`/);
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
