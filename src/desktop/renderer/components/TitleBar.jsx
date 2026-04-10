import React from 'react';

const VIEW_TITLES = {
  chat: 'Chat',
  dashboard: 'Dashboard',
  vault: 'Vault',
  skills: 'Skills',
  settings: 'Settings',
};

export default function TitleBar({ view, appData, onPaletteToggle }) {
  const e = React.createElement;

  return e('div', { className: 'titlebar' },
    // Title
    e('div', {
      style: { flex: 1, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 8 }
    },
      e('span', {
        style: { color: 'var(--cyan)', fontWeight: 700, fontSize: 15 }
      }, 'V'),
      e('span', {
        style: { color: 'var(--text-dim)', fontSize: 12 }
      }, VIEW_TITLES[view] || 'Vennie'),
    ),

    // Search / Command Palette trigger
    e('button', {
      onClick: onPaletteToggle,
      style: {
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-dim)',
        padding: '4px 12px',
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 200,
      }
    },
      e('span', null, 'Search or run command...'),
      e('kbd', {
        style: {
          background: 'var(--bg-hover)',
          padding: '1px 6px',
          borderRadius: 3,
          fontSize: 11,
          color: 'var(--text-dim)',
          marginLeft: 'auto',
        }
      }, '\u2318K'),
    ),

    // Model + cost indicator
    e('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginLeft: 16,
        fontSize: 11,
        color: 'var(--text-dim)',
      }
    },
      e('span', null, (appData?.model || '').replace('claude-', '').replace(/-\d+$/, '')),
      appData?.cost?.cost > 0 &&
        e('span', null, `$${appData.cost.cost.toFixed(4)}`),
    ),
  );
}
