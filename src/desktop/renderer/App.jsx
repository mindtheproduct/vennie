import React, { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './views/ChatView.jsx';
import DashboardView from './views/DashboardView.jsx';
import VaultView from './views/VaultView.jsx';
import SkillsView from './views/SkillsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import CommandPalette from './components/CommandPalette.jsx';

export default function App() {
  const [view, setView] = useState('chat');
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Init app data from main process
  useEffect(() => {
    window.vennie.init().then((data) => {
      setAppData(data);
      setLoading(false);

      // If morning brief available and we're on chat, show dashboard first
      if (data.morningBrief) {
        setView('dashboard');
      }
    });

    // Listen for navigation from tray menu
    const unsubNav = window.vennie.onNavigate((v) => setView(v));
    return () => unsubNav();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      // Cmd+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
      // Cmd+1-5 — view switching
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const views = ['chat', 'dashboard', 'vault', 'skills', 'settings'];
        setView(views[parseInt(e.key) - 1] || 'chat');
      }
      // Escape — close palette
      if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [paletteOpen]);

  const handleCommand = useCallback((cmd) => {
    setPaletteOpen(false);
    if (cmd.type === 'view') {
      setView(cmd.value);
    } else if (cmd.type === 'skill') {
      setView('chat');
      // Trigger skill in chat — handled by ChatView
      window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: cmd.value }));
    }
  }, []);

  if (loading) {
    return React.createElement('div', {
      style: {
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
      }
    },
      React.createElement('div', {
        style: { color: 'var(--cyan)', fontSize: 32, fontWeight: 700 }
      }, 'V'),
      React.createElement('div', {
        style: { color: 'var(--text-dim)', fontSize: 13 }
      }, 'Loading...')
    );
  }

  const viewComponents = {
    chat: React.createElement(ChatView, { appData }),
    dashboard: React.createElement(DashboardView, { appData, onNavigate: setView }),
    vault: React.createElement(VaultView, { appData }),
    skills: React.createElement(SkillsView, { appData, onRunSkill: (name) => {
      setView('chat');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: name }));
      }, 100);
    }}),
    settings: React.createElement(SettingsView, { appData }),
  };

  return React.createElement('div', {
    style: { height: '100%', display: 'flex', flexDirection: 'column' }
  },
    React.createElement(TitleBar, {
      view,
      appData,
      onPaletteToggle: () => setPaletteOpen(p => !p),
    }),
    React.createElement('div', {
      style: { flex: 1, display: 'flex', overflow: 'hidden' }
    },
      React.createElement(Sidebar, { activeView: view, onNavigate: setView }),
      React.createElement('main', {
        style: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }
      },
        viewComponents[view] || viewComponents.chat
      ),
    ),
    paletteOpen && React.createElement(CommandPalette, {
      commands: appData?.commands || [],
      onSelect: handleCommand,
      onClose: () => setPaletteOpen(false),
    }),
  );
}
