import React from 'react';

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}', shortcut: '\u23181' },
  { id: 'dashboard', label: 'Dashboard', icon: '\u{1F3E0}', shortcut: '\u23182' },
  { id: 'vault', label: 'Vault', icon: '\u{1F4C1}', shortcut: '\u23183' },
  { id: 'skills', label: 'Skills', icon: '\u26A1', shortcut: '\u23184' },
  { id: 'settings', label: 'Settings', icon: '\u2699\uFE0F', shortcut: '\u23185' },
];

export default function Sidebar({ activeView, onNavigate }) {
  const e = React.createElement;

  return e('nav', {
    style: {
      width: 56,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 0',
      gap: 4,
    }
  },
    ...NAV_ITEMS.map(item =>
      e('button', {
        key: item.id,
        onClick: () => onNavigate(item.id),
        title: `${item.label} (${item.shortcut})`,
        style: {
          width: 40,
          height: 40,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: activeView === item.id ? 'var(--bg-active)' : 'transparent',
          color: activeView === item.id ? 'var(--cyan)' : 'var(--text-dim)',
          cursor: 'pointer',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s',
        }
      }, item.icon)
    ),
  );
}
