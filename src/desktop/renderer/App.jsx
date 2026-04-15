import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ThreadSidebar from './components/ThreadSidebar.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ChatView from './views/ChatView.jsx';
import DashboardView from './views/DashboardView.jsx';
import VaultView from './views/VaultView.jsx';
import SkillsView from './views/SkillsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import ActivityView from './views/ActivityView.jsx';
import PeopleView from './views/PeopleView.jsx';
import FocusView from './views/FocusView.jsx';
import PersonasView from './views/PersonasView.jsx';
import DecisionsView from './views/DecisionsView.jsx';
import CareerView from './views/CareerView.jsx';
import RadarView from './views/RadarView.jsx';
import TimeMachineView from './views/TimeMachineView.jsx';
import DigestView from './views/DigestView.jsx';
import ShipToStoryView from './views/ShipToStoryView.jsx';
import MarketplaceView from './views/MarketplaceView.jsx';
import SplitPersonaView from './views/SplitPersonaView.jsx';
import VennieOrb from './components/VennieOrb.jsx';

const viewTransition = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -3 },
  transition: { duration: 0.12, ease: 'easeOut' },
};

const ALL_VIEWS = ['chat', 'dashboard', 'vault', 'skills', 'personas', 'settings', 'focus', 'split', 'activity', 'people', 'decisions', 'career', 'radar', 'ship', 'digest', 'marketplace', 'timemachine'];

export default function App() {
  const [view, setView] = useState('chat');
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);

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
      // Cmd+N — new chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }
      // Cmd+Shift+S — toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        setSidebarOpen(p => !p);
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

  // Listen for thread creation from ChatView
  useEffect(() => {
    function handleThreadCreated(ev) {
      if (ev.detail?.id) setActiveThreadId(ev.detail.id);
    }
    window.addEventListener('vennie:thread-created', handleThreadCreated);
    return () => window.removeEventListener('vennie:thread-created', handleThreadCreated);
  }, []);

  function handleNewChat() {
    setActiveThreadId(null);
    setView('chat');
    window.dispatchEvent(new CustomEvent('vennie:new-chat'));
  }

  function handleLoadThread(thread) {
    setActiveThreadId(thread.id);
    setView('chat');
    window.dispatchEvent(new CustomEvent('vennie:load-thread', { detail: thread }));
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--surface-primary)]">
        <VennieOrb size="lg" state="breathing" />
      </div>
    );
  }

  const views = {
    chat: <ChatView appData={appData} activeThreadId={activeThreadId} />,
    focus: <FocusView appData={appData} />,
    split: <SplitPersonaView appData={appData} />,
    dashboard: <DashboardView appData={appData} onNavigate={setView} />,
    activity: <ActivityView appData={appData} />,
    people: <PeopleView appData={appData} />,
    decisions: <DecisionsView appData={appData} />,
    career: <CareerView appData={appData} />,
    radar: <RadarView appData={appData} />,
    ship: <ShipToStoryView appData={appData} />,
    digest: <DigestView appData={appData} />,
    vault: <VaultView appData={appData} />,
    skills: <SkillsView appData={appData} onRunSkill={(name) => {
      setView('chat');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vennie:run-skill', { detail: name }));
      }, 100);
    }} />,
    marketplace: <MarketplaceView appData={appData} />,
    timemachine: <TimeMachineView appData={appData} />,
    personas: <PersonasView appData={appData} onNavigate={setView} />,
    settings: <SettingsView appData={appData} onNavigate={setView} />,
  };

  return (
    <div className="h-full flex flex-col bg-[var(--surface-primary)]">
      {/* Title bar drag region */}
      <div className="titlebar-drag h-[36px] shrink-0" style={{ paddingLeft: 80 }} />

      <div className="flex-1 flex overflow-hidden">
        <ThreadSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(p => !p)}
          activeView={view}
          onNavigate={setView}
          onNewChat={handleNewChat}
          onLoadThread={handleLoadThread}
          activeThreadId={activeThreadId}
        />
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
