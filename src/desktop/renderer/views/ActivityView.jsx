import React, { useState, useEffect } from 'react';
import { Clock, FileText, Users, MessageSquare, CheckCircle2, FolderKanban, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils.js';

const EVENT_ICONS = {
  meeting: MessageSquare,
  task: CheckCircle2,
  person: Users,
  project: FolderKanban,
  file: FileText,
  skill: Zap,
  system: Clock,
};

const EVENT_COLORS = {
  meeting: 'text-[var(--accent)]',
  task: 'text-[var(--success)]',
  person: 'text-[var(--cyan)]',
  project: 'text-[var(--warning)]',
  file: 'text-[var(--text-tertiary)]',
  skill: 'text-[var(--accent)]',
  system: 'text-[var(--text-tertiary)]',
};

export default function ActivityView({ appData }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState(null);

  useEffect(() => {
    // Load activity from vault — session logs, recent file changes, etc.
    loadActivity().then(data => {
      setEvents(data);
      setLoading(false);
      // Auto-expand today
      if (data.length > 0) setExpandedDay(data[0].date);
    });
  }, []);

  async function loadActivity() {
    try {
      // Pull from multiple sources
      const [recentFiles, pulse] = await Promise.all([
        window.vennie?.getRecentFiles?.() || [],
        window.vennie?.getPulse?.() || {},
      ]);

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Build timeline from recent files
      const fileEvents = (Array.isArray(recentFiles) ? recentFiles : []).map(f => ({
        id: f.path,
        type: f.path.includes('Meeting') ? 'meeting' :
              f.path.includes('People') ? 'person' :
              f.path.includes('Tasks') ? 'task' :
              f.path.includes('Project') ? 'project' : 'file',
        title: f.name?.replace('.md', '') || f.path.split('/').pop().replace('.md', ''),
        detail: f.path.replace(appData?.vaultPath + '/', ''),
        time: f.modified || today,
        date: (f.modified || today).split('T')[0],
      }));

      // Group by date
      const grouped = {};
      for (const ev of fileEvents) {
        const d = ev.date || today;
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(ev);
      }

      // If empty, show placeholder for today
      if (Object.keys(grouped).length === 0) {
        grouped[today] = [];
      }

      return Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, items]) => ({
          date,
          label: date === today ? 'Today' : date === yesterday ? 'Yesterday' : formatDate(date),
          events: items,
        }));
    } catch {
      return [];
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--surface-primary)]">
        <div className="shimmer w-48 h-5 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-primary)]">
      <div className="max-w-[640px] mx-auto px-8 py-8">
        <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mb-1">Activity</h1>
        <p className="text-xs text-[var(--text-tertiary)] font-mono mb-8">Everything Vennie touched</p>

        {events.length === 0 || (events.length === 1 && events[0].events.length === 0) ? (
          <EmptyActivity />
        ) : (
          <div className="space-y-1">
            {events.map(day => (
              <DayGroup
                key={day.date}
                day={day}
                expanded={expandedDay === day.date}
                onToggle={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayGroup({ day, expanded, onToggle }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full py-2 text-left group"
      >
        {expanded
          ? <ChevronDown size={12} className="text-[var(--text-tertiary)]" />
          : <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
        }
        <span className="text-sm font-semibold text-[var(--text-primary)]">{day.label}</span>
        <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{day.events.length} events</span>
        <div className="flex-1 h-px bg-[var(--border)] ml-2" />
      </button>

      {expanded && (
        <div className="ml-3 pl-4 border-l border-[var(--border)] space-y-0.5 pb-4">
          {day.events.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-2">No activity recorded.</p>
          ) : (
            day.events.map((ev, i) => <EventRow key={ev.id || i} event={ev} />)
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }) {
  const Icon = EVENT_ICONS[event.type] || FileText;
  const color = EVENT_COLORS[event.type] || 'text-[var(--text-tertiary)]';

  return (
    <div className="flex items-start gap-3 py-1.5 group">
      {/* Timeline dot */}
      <div className="relative">
        <div className={cn('w-5 h-5 rounded-md flex items-center justify-center bg-[var(--surface-secondary)]', color)}>
          <Icon size={11} />
        </div>
        {/* Connector — handled by parent border-l */}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--text-primary)]">{event.title}</div>
        {event.detail && (
          <div className="text-[10px] text-[var(--text-tertiary)] font-mono truncate mt-0.5">{event.detail}</div>
        )}
      </div>

      {event.time && event.time.includes('T') && (
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0">
          {event.time.split('T')[1]?.slice(0, 5)}
        </span>
      )}
    </div>
  );
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-[var(--surface-secondary)] flex items-center justify-center">
        <Clock size={20} className="text-[var(--text-tertiary)]" />
      </div>
      <div className="text-center">
        <p className="text-sm text-[var(--text-secondary)]">No activity yet</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">Process a meeting or run a skill to see it here</p>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
