import React, { useState, useEffect } from 'react';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

export default function DashboardView({ appData, onNavigate }) {
  const [brief, setBrief] = useState(appData?.morningBrief || null);
  const [pulse, setPulse] = useState(appData?.pulse || null);
  const [loading, setLoading] = useState(!brief);
  const e = React.createElement;

  useEffect(() => {
    if (!brief) {
      window.vennie.getBrief().then(data => {
        if (data && !data.error) setBrief(data);
        setLoading(false);
      });
    }
    if (!pulse) {
      window.vennie.getPulse().then(data => {
        if (data && !data.error) setPulse(data);
      });
    }
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return e('div', {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '32px 40px',
      maxWidth: 900,
    }
  },
    // Header
    e('div', { style: { marginBottom: 32 } },
      e('h1', {
        style: { fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }
      }, `${greeting}.`),
      e('p', {
        style: { color: 'var(--text-dim)', fontSize: 14 }
      }, new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })),
    ),

    // Quick actions
    e('div', {
      style: { display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }
    },
      quickAction(e, 'Start daily plan', '/daily-plan', 'var(--cyan)', () => {
        onNavigate('chat');
        setTimeout(() => window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: 'daily-plan' })), 100);
      }),
      quickAction(e, 'Product gym', '/gym', 'var(--accent-blue)', () => {
        onNavigate('chat');
        setTimeout(() => window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: 'gym' })), 100);
      }),
      quickAction(e, 'Quick log', '/log', 'var(--green)', () => {
        onNavigate('chat');
        setTimeout(() => document.querySelector('textarea')?.focus(), 100);
      }),
      quickAction(e, 'Browse vault', null, 'var(--yellow)', () => onNavigate('vault')),
    ),

    // Two-column layout
    e('div', {
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }
    },
      // Morning Brief
      e('div', {
        style: {
          gridColumn: '1 / -1',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
        }
      },
        e('h2', {
          style: { fontSize: 16, fontWeight: 600, color: 'var(--cyan)', marginBottom: 16 }
        }, 'Morning Brief'),
        loading
          ? e('p', { style: { color: 'var(--text-dim)' } }, 'Loading...')
          : brief?.display
            ? e(MarkdownRenderer, { text: brief.display })
            : e('p', { style: { color: 'var(--text-dim)' } }, 'No brief available. Use Vennie for a few days to build up vault data.'),
      ),

      // Vault Pulse
      e('div', {
        style: {
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
        }
      },
        e('h2', {
          style: { fontSize: 16, fontWeight: 600, color: 'var(--accent-blue)', marginBottom: 16 }
        }, 'Vault Pulse'),
        pulse ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          statRow(e, 'People', pulse.stats?.people ?? 0),
          statRow(e, 'Projects', pulse.stats?.projects ?? 0),
          statRow(e, 'Decisions', pulse.stats?.decisions ?? 0),
          statRow(e, 'Meetings', pulse.stats?.meetings ?? 0),
          statRow(e, 'Sessions', pulse.stats?.sessions ?? 0),
        ) : e('p', { style: { color: 'var(--text-dim)' } }, 'No vault data yet.'),
      ),

      // Session Info
      e('div', {
        style: {
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
        }
      },
        e('h2', {
          style: { fontSize: 16, fontWeight: 600, color: 'var(--green)', marginBottom: 16 }
        }, 'Session'),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          statRow(e, 'Model', (appData?.model || '').replace('claude-', '').replace(/-\d{8}$/, '')),
          statRow(e, 'Tools', appData?.toolCount ?? 0),
          statRow(e, 'Version', `v${appData?.version || '?'}`),
        ),
      ),
    ),
  );
}

function quickAction(e, label, cmd, color, onClick) {
  return e('button', {
    onClick,
    style: {
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 20px',
      color: 'var(--text-primary)',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      transition: 'all 0.15s',
      minWidth: 140,
    }
  },
    e('span', { style: { fontWeight: 600, fontSize: 14 } }, label),
    cmd && e('span', { style: { color, fontSize: 12, fontFamily: 'var(--font-mono)' } }, cmd),
  );
}

function statRow(e, label, value) {
  return e('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  },
    e('span', { style: { color: 'var(--text-dim)', fontSize: 13 } }, label),
    e('span', { style: { color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-mono)' } }, String(value)),
  );
}
