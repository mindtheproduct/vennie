import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ChatView from './views/ChatView.jsx';
import DashboardView from './views/DashboardView.jsx';
import VaultView from './views/VaultView.jsx';
import SkillsView from './views/SkillsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import ActivityView from './views/ActivityView.jsx';
import PeopleView from './views/PeopleView.jsx';
import FocusView from './views/FocusView.jsx';
import ThreadsView from './views/ThreadsView.jsx';

const viewTransition = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -3 },
  transition: { duration: 0.12, ease: 'easeOut' },
};

const ALL_VIEWS = ['chat', 'threads', 'focus', 'dashboard', 'activity', 'people', 'vault', 'skills', 'settings'];

export default function App() {
  const [view, setView] = useState('chat');
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    window.vennie.init().then((data) => {
      setAppData(data);
      setLoading(false);
      if (data.morningBrief) setView('dashboard');
    });
    const unsubNav = window.vennie.onNavigate((v) => setView(v));
    return () => unsubNav();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < ALL_VIEWS.length) {
          e.preventDefault();
          setView(ALL_VIEWS[idx]);
        }
      }
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
      window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: cmd.value }));
    }
  }, []);

  function handleLoadThread(thread) {
    // Thread loading — ChatView will pick this up
    window.dispatchEvent(new CustomEvent('vennie:load-thread', { detail: thread }));
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--surface-primary)]">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center">
            <span className="text-white font-bold text-lg">V</span>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-[var(--accent)] opacity-20 blur-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const views = {
    chat: <ChatView appData={appData} />,
    threads: <ThreadsView appData={appData} onNavigate={setView} onLoadThread={handleLoadThread} />,
    focus: <FocusView appData={appData} />,
    dashboard: <DashboardView appData={appData} onNavigate={setView} />,
    activity: <ActivityView appData={appData} />,
    people: <PeopleView appData={appData} />,
    vault: <VaultView appData={appData} />,
    skills: <SkillsView appData={appData} onRunSkill={(name) => {
      setView('chat');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: name }));
      }, 100);
    }} />,
    settings: <SettingsView appData={appData} />,
  };

  return (
    <div className="h-full flex flex-col bg-[var(--surface-primary)]">
      <TitleBar view={view} appData={appData} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={view} onNavigate={setView} />
        <main className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              className="flex-1 flex flex-col overflow-hidden"
              {...viewTransition}
            >
              {views[view] || views.chat}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <StatusBar appData={appData} />

      {/* Command Palette */}
      <AnimatePresence>
        {paletteOpen && (
          <CommandPalette
            commands={appData?.commands || []}
            onSelect={handleCommand}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
