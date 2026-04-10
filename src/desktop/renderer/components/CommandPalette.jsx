import React, { useState, useEffect, useRef } from 'react';

const VIEW_COMMANDS = [
  { name: 'Chat', type: 'view', value: 'chat', description: 'Open chat view' },
  { name: 'Dashboard', type: 'view', value: 'dashboard', description: 'Morning brief & overview' },
  { name: 'Vault', type: 'view', value: 'vault', description: 'Browse vault files' },
  { name: 'Skills', type: 'view', value: 'skills', description: 'Browse available skills' },
  { name: 'Settings', type: 'view', value: 'settings', description: 'Configure Vennie' },
];

export default function CommandPalette({ commands, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const e = React.createElement;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build combined command list
  const allItems = [
    ...VIEW_COMMANDS,
    ...commands.map(c => ({
      name: c.name,
      type: 'skill',
      value: c.name,
      description: c.description || '',
    })),
  ];

  // Filter by query
  const filtered = query.trim()
    ? allItems.filter(item => {
        const q = query.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      })
    : allItems;

  // Keyboard navigation
  function handleKey(ev) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setSelected(s => Math.min(s + 1, filtered.length - 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (ev.key === 'Enter' && filtered[selected]) {
      ev.preventDefault();
      onSelect(filtered[selected]);
    } else if (ev.key === 'Escape') {
      onClose();
    }
  }

  return e('div', {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: 120,
      zIndex: 100,
    }
  },
    e('div', {
      onClick: (ev) => ev.stopPropagation(),
      style: {
        width: 560,
        maxHeight: 420,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }
    },
      // Search input
      e('div', {
        style: { padding: '12px 16px', borderBottom: '1px solid var(--border)' }
      },
        e('input', {
          ref: inputRef,
          type: 'text',
          value: query,
          onChange: (ev) => { setQuery(ev.target.value); setSelected(0); },
          onKeyDown: handleKey,
          placeholder: 'Type a command or search...',
          style: {
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 15,
            fontFamily: 'var(--font-sans)',
          }
        }),
      ),

      // Results
      e('div', {
        style: { overflow: 'auto', padding: '4px 0' }
      },
        filtered.length === 0
          ? e('div', {
              style: { padding: '16px', color: 'var(--text-dim)', textAlign: 'center' }
            }, 'No matches')
          : filtered.slice(0, 20).map((item, i) =>
              e('div', {
                key: `${item.type}-${item.name}`,
                onClick: () => onSelect(item),
                style: {
                  padding: '8px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: i === selected ? 'var(--bg-hover)' : 'transparent',
                }
              },
                e('span', {
                  style: {
                    width: 20,
                    textAlign: 'center',
                    color: item.type === 'view' ? 'var(--cyan)' : 'var(--accent-blue)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }
                }, item.type === 'view' ? '\u25A0' : '/'),
                e('span', {
                  style: { color: 'var(--text-primary)', fontWeight: 500, minWidth: 100 }
                }, item.name),
                e('span', {
                  style: { color: 'var(--text-dim)', fontSize: 12 }
                }, item.description),
              )
            ),
      ),
    ),
  );
}
