import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, FileText, Check, X, Loader2, ThumbsUp, ThumbsDown, Copy, Save, GitBranch, MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';
import ArtifactPanel from '../components/ArtifactPanel.jsx';
import SlashMenu from '../components/SlashMenu.jsx';
import ContextChips from '../components/ContextChips.jsx';

const DOTS = ['', '.', '..', '...'];

// ── Detect artifact-worthy content ───────────────────────────────────────
function detectArtifact(text) {
  if (!text) return null;
  // Large code blocks
  const codeMatch = text.match(/```(\w+)?\n([\s\S]{200,}?)```/);
  if (codeMatch) {
    return { type: 'code', title: codeMatch[1] || 'Code', content: codeMatch[2].trim() };
  }
  // Tables with 3+ rows
  const tableLines = text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
  if (tableLines.length >= 4) {
    return { type: 'table', title: 'Table', content: tableLines.join('\n') };
  }
  // Long structured content (plans, documents with headers)
  const headers = (text.match(/^#{1,3}\s+.+/gm) || []);
  if (headers.length >= 3 && text.length > 500) {
    return { type: 'document', title: headers[0].replace(/^#+\s+/, ''), content: text };
  }
  return null;
}

// ── Group consecutive tool messages ──────────────────────────────────────
function groupMessages(messages) {
  const groups = [];
  let toolGroup = null;

  for (const msg of messages) {
    if (msg.type === 'tool' || msg.type === 'tool_done' || msg.type === 'tool_error') {
      if (!toolGroup) {
        toolGroup = { type: 'tool_group', id: `tg-${msg.id}`, tools: [] };
      }
      toolGroup.tools.push(msg);
    } else {
      if (toolGroup) {
        groups.push(toolGroup);
        toolGroup = null;
      }
      groups.push(msg);
    }
  }
  if (toolGroup) groups.push(toolGroup);
  return groups;
}

export default function ChatView({ appData }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [dotFrame, setDotFrame] = useState(0);
  const [suggestions, setSuggestions] = useState(appData?.welcomeData?.suggestions || []);
  const [expandedTools, setExpandedTools] = useState(new Set());
  const [expandedThinking, setExpandedThinking] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [reactions, setReactions] = useState({}); // msgId -> 'up' | 'down'
  const [artifact, setArtifact] = useState(null);
  const [showSlash, setShowSlash] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [contextChips, setContextChips] = useState([]);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [skills, setSkills] = useState([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const streamingRef = useRef('');

  // Load skills for slash menu
  useEffect(() => {
    window.vennie?.listSkills?.().then(data => {
      const builtIn = [
        { name: 'brief', description: 'Morning brief' },
        { name: 'daily-plan', description: 'Plan your day' },
        { name: 'daily-review', description: 'End-of-day review' },
        { name: 'gym', description: 'Product sense training' },
        { name: 'log', description: 'Quick capture' },
        { name: 'search', description: 'Search vault' },
        { name: 'meeting-prep', description: 'Prep for a meeting' },
        { name: 'process-meetings', description: 'Process recent meetings' },
        { name: 'career-coach', description: 'Career coaching' },
        { name: 'project-health', description: 'Project health check' },
      ];
      setSkills([...builtIn, ...(Array.isArray(data) ? data : [])]);
    });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming, isThinking]);

  // Dot animation
  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => setDotFrame(f => (f + 1) % DOTS.length), 400);
    return () => clearInterval(interval);
  }, [isThinking]);

  // Agent events
  useEffect(() => {
    let thinkingText = '';
    let citations = [];

    const unsub = window.vennie.onEvent((event) => {
      switch (event.type) {
        case 'text_delta':
          if (thinkingText) {
            setMessages(prev => [...prev, { id: Date.now(), type: 'thinking', text: thinkingText }]);
            thinkingText = '';
          }
          streamingRef.current += event.text;
          setStreaming(streamingRef.current);
          setIsThinking(false);
          break;
        case 'thinking_delta':
          thinkingText += event.text;
          setIsThinking(false);
          break;
        case 'turn_progress':
          if (event.turn > 1) {
            setMessages(prev => [...prev, {
              id: Date.now(), type: 'progress',
              text: `Step ${event.turn}/${event.maxTurns}`,
              toolCount: event.toolCount,
            }]);
          }
          break;
        case 'tool_start': {
          const summaries = {
            Read: () => `Reading ${(event.input?.file_path || '').split('/').pop()}`,
            Write: () => `Writing ${(event.input?.file_path || '').split('/').pop()}`,
            Edit: () => `Editing ${(event.input?.file_path || '').split('/').pop()}`,
            Bash: () => `Running: ${(event.input?.command || '').slice(0, 50)}`,
            Glob: () => `Searching for ${event.input?.pattern}`,
            Grep: () => `Searching "${(event.input?.pattern || '').slice(0, 30)}"`,
          };
          const summary = (summaries[event.name] || (() => event.name))();
          setMessages(prev => [...prev, {
            id: Date.now(), type: 'tool', text: summary,
            name: event.name, tier: event.tier,
          }]);
          setIsThinking(true);
          break;
        }
        case 'tool_result': {
          const duration = event.duration ? `${event.duration}ms` : '';
          const detail = [event.name, duration].filter(Boolean).join(' · ');
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: event.success ? 'tool_done' : 'tool_error',
            text: detail,
            preview: event.preview || null,
          }]);
          setIsThinking(false);
          break;
        }
        case 'citations':
          citations = [...citations, ...event.sources];
          break;
        case 'checkpoint':
          setMessages(prev => [...prev, { id: Date.now(), type: 'checkpoint', text: event.message }]);
          break;
        case 'ask_user':
          setMessages(prev => [...prev, { id: Date.now(), type: 'question', text: event.question }]);
          setIsThinking(false);
          break;
        case 'suggestions':
          if (event.items?.length > 0) setSuggestions(event.items);
          break;
        case 'system':
          setMessages(prev => [...prev, { id: Date.now(), type: 'system', text: event.message }]);
          break;
        case 'error':
          setMessages(prev => [...prev, { id: Date.now(), type: 'error', text: event.message }]);
          setIsThinking(false);
          break;
        case 'done':
          setIsThinking(false);
          if (streamingRef.current) {
            const text = streamingRef.current;
            const msgs = [{ id: Date.now(), type: 'assistant', text }];
            if (citations.length > 0) {
              msgs.push({ id: Date.now() + 1, type: 'citations', sources: citations });
              citations = [];
            }
            setMessages(prev => [...prev, ...msgs]);

            // Check for artifact
            const art = detectArtifact(text);
            if (art) setArtifact(art);

            streamingRef.current = '';
            setStreaming('');
          }
          break;
      }
    });
    return () => unsub();
  }, []);

  // Skill trigger events
  useEffect(() => {
    function handleSkill(ev) { handleSubmit(`/${ev.detail}`); }
    window.addEventListener('vennie:run-skill', handleSkill);
    return () => window.removeEventListener('vennie:run-skill', handleSkill);
  }, []);

  // Thread loading
  useEffect(() => {
    function handleLoadThread(ev) {
      const thread = ev.detail;
      if (thread?.messages) {
        setMessages(thread.messages);
      }
    }
    window.addEventListener('vennie:load-thread', handleLoadThread);
    return () => window.removeEventListener('vennie:load-thread', handleLoadThread);
  }, []);

  const handleSubmit = useCallback(async (value) => {
    const text = typeof value === 'string' ? value : input;
    const trimmed = text.trim();
    if (!trimmed) return;

    setInput('');
    setShowSlash(false);
    setSlashQuery('');
    setSuggestions([]);
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', text: trimmed, chips: contextChips.length > 0 ? [...contextChips] : undefined }]);
    setContextChips([]);
    setIsThinking(true);
    streamingRef.current = '';

    // Build context from chips
    let contextPrefix = '';
    if (contextChips.length > 0) {
      contextPrefix = contextChips.map(c => {
        if (c.type === 'file') return `[Context: file ${c.value}]`;
        if (c.type === 'person') return `[Context: person ${c.label}]`;
        if (c.type === 'project') return `[Context: project ${c.label}]`;
        return '';
      }).filter(Boolean).join(' ') + '\n\n';
    }

    try {
      const result = await window.vennie.send(contextPrefix + trimmed);
      if (result?.handled && !result.fallThrough && result.type) {
        setIsThinking(false);
        if (result.text) {
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: result.type === 'error' ? 'error' : result.type === 'text' ? 'assistant' : 'system',
            text: result.text,
          }]);
        }
      }
      if (result?.intent) {
        setMessages(prev => [...prev, { id: Date.now(), type: 'hint', text: result.intent }]);
      }
    } catch (err) {
      setIsThinking(false);
      setMessages(prev => [...prev, { id: Date.now(), type: 'error', text: err.message }]);
    }
  }, [input, contextChips]);

  function handleKeyDown(ev) {
    // Slash menu navigation is handled by SlashMenu component
    if (showSlash) return;

    if (!input && suggestions.length > 0 && ev.key >= '1' && ev.key <= '3') {
      const idx = parseInt(ev.key) - 1;
      if (suggestions[idx]) {
        ev.preventDefault();
        const label = typeof suggestions[idx] === 'string' ? suggestions[idx] : suggestions[idx].cmd || suggestions[idx].text;
        handleSubmit(label);
        return;
      }
    }
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      handleSubmit(input);
    }
  }

  function handleInputChange(ev) {
    const val = ev.target.value;
    setInput(val);

    // Slash menu trigger
    if (val.startsWith('/')) {
      setShowSlash(true);
      setSlashQuery(val.slice(1));
    } else {
      setShowSlash(false);
      setSlashQuery('');
    }

    // @ mention for context chips
    // (handled separately if needed)

    // Auto-grow
    const el = ev.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function handleSlashSelect(skill) {
    setInput(`/${skill.name} `);
    setShowSlash(false);
    inputRef.current?.focus();
  }

  function handleReaction(msgId, type) {
    setReactions(prev => {
      const next = { ...prev };
      if (next[msgId] === type) {
        delete next[msgId];
      } else {
        next[msgId] = type;
      }
      return next;
    });
  }

  function handleBranch(msgId) {
    // Find messages up to this point
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      const branchMsgs = messages.slice(0, idx + 1);
      // Save current as thread, start new branch
      saveCurrentThread();
      setMessages([...branchMsgs, { id: Date.now(), type: 'system', text: 'Branched from previous conversation' }]);
    }
  }

  function saveCurrentThread() {
    if (messages.length < 2) return;
    const firstUser = messages.find(m => m.type === 'user');
    const thread = {
      id: `thread-${Date.now()}`,
      title: firstUser?.text?.slice(0, 60) || 'Untitled',
      preview: messages.filter(m => m.type === 'assistant').pop()?.text?.slice(0, 100) || '',
      timestamp: Date.now(),
      messageCount: messages.filter(m => m.type === 'user' || m.type === 'assistant').length,
      messages: messages,
    };
    try {
      const stored = JSON.parse(localStorage.getItem('vennie-threads') || '[]');
      stored.unshift(thread);
      localStorage.setItem('vennie-threads', JSON.stringify(stored.slice(0, 50)));
    } catch {}
  }

  async function handleCopyMessage(text) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  async function handleSaveToVault(text) {
    try {
      const title = text.slice(0, 40).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
      await window.vennie?.writeFile?.(`00-Inbox/Ideas/${title}_${Date.now()}.md`, text);
    } catch {}
  }

  const toggleTool = (id) => {
    setExpandedTools(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleThinking = (id) => {
    setExpandedThinking(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleGroup = (id) => {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Group tool messages
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex h-full bg-[var(--surface-primary)]">
      {/* Chat column */}
      <div className={cn('flex-1 flex flex-col h-full min-w-0', artifact && 'max-w-[55%]')}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div className="max-w-[680px] mx-auto px-6 py-5">
            {/* Welcome */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xl tracking-tight">V</span>
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-[var(--accent)] opacity-20 blur-xl animate-glow-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-[var(--text-tertiary)] text-sm">
                    Start typing, or press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] text-[11px] font-mono mx-0.5">&#8984;K</kbd>
                  </p>
                </div>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-2 max-w-[480px]">
                    {suggestions.slice(0, 4).map((s, i) => {
                      const label = typeof s === 'string' ? s : s.cmd || s.text || String(s);
                      const hint = typeof s === 'object' && s.reason ? s.reason : null;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSubmit(label)}
                          className="group px-4 py-2.5 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] transition-all text-left"
                        >
                          <div className="text-[13px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent)] font-mono transition-colors">{label}</div>
                          {hint && <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{hint}</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Grouped messages */}
            {grouped.map(item => {
              if (item.type === 'tool_group') {
                return (
                  <ToolGroup
                    key={item.id}
                    group={item}
                    expanded={expandedGroups.has(item.id)}
                    onToggle={() => toggleGroup(item.id)}
                    expandedTools={expandedTools}
                    toggleTool={toggleTool}
                  />
                );
              }
              return renderMessage(item, {
                expandedTools, expandedThinking, toggleTool, toggleThinking,
                reactions, onReaction: handleReaction,
                hoveredMsg, setHoveredMsg,
                onCopy: handleCopyMessage,
                onSave: handleSaveToVault,
                onBranch: handleBranch,
                onArtifact: setArtifact,
              });
            })}

            {/* Streaming */}
            {streaming && (
              <div className="py-3 animate-fade-in">
                <div className="flex items-start gap-3">
                  <BreathingAvatar />
                  <div className="flex-1 min-w-0 text-sm">
                    <MarkdownRenderer text={streaming} />
                  </div>
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            {isThinking && !streaming && (
              <div className="flex items-center gap-3 py-3">
                <BreathingAvatar />
                <div className="flex items-center gap-2">
                  <div className="shimmer w-16 h-3.5 rounded-md" />
                  <span className="text-[var(--text-tertiary)] text-xs font-mono">thinking{DOTS[dotFrame]}</span>
                </div>
              </div>
            )}

            {/* Post-response suggestions */}
            {!isThinking && !streaming && suggestions.length > 0 && messages.length > 0 && messages[messages.length - 1]?.type === 'assistant' && (
              <div className="flex flex-wrap gap-2 py-2 pl-9 animate-fade-in">
                {suggestions.slice(0, 3).map((s, i) => {
                  const label = typeof s === 'string' ? s : s.cmd || s.text || String(s);
                  return (
                    <button
                      key={i}
                      onClick={() => handleSubmit(label)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all"
                    >
                      <span className="text-[var(--accent)] opacity-50 font-mono mr-1.5">{i + 1}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="px-6 pb-4 pt-2 bg-[var(--surface-primary)]">
          <div className="max-w-[680px] mx-auto relative">
            {/* Slash menu */}
            {showSlash && (
              <SlashMenu
                query={slashQuery}
                skills={skills}
                onSelect={handleSlashSelect}
                onClose={() => { setShowSlash(false); setSlashQuery(''); }}
              />
            )}

            {/* Context chips */}
            <div className="input-floating">
              <ContextChips chips={contextChips} onRemove={(i) => setContextChips(prev => prev.filter((_, j) => j !== i))} />
              <div className="flex items-end gap-3 px-4 py-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Vennie..."
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] text-sm font-sans resize-none max-h-[160px] leading-relaxed placeholder:text-[var(--text-tertiary)]"
                />
                <button
                  onClick={() => handleSubmit(input)}
                  disabled={!input.trim() || isThinking}
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all',
                    input.trim() && !isThinking
                      ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm'
                      : 'bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]'
                  )}
                >
                  <ArrowUp size={14} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5 px-2">
              <span className="text-[10px] text-[var(--text-tertiary)] opacity-60">
                / for skills &middot; Enter to send &middot; Shift+Enter for new line
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Artifact panel */}
      {artifact && (
        <ArtifactPanel
          artifact={artifact}
          onClose={() => setArtifact(null)}
          onSave={async (a) => {
            const title = (a.title || 'artifact').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
            await window.vennie?.writeFile?.(`00-Inbox/Ideas/${title}.md`, a.content);
          }}
        />
      )}
    </div>
  );
}

// ── Breathing V avatar ──────────────────────────────────────────────────

function BreathingAvatar() {
  return (
    <div className="relative shrink-0 mt-0.5">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center">
        <span className="text-white font-bold text-[9px]">V</span>
      </div>
      <div className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-30 blur-md animate-glow-pulse" />
    </div>
  );
}

// ── Tool group (collapsed) ──────────────────────────────────────────────

function ToolGroup({ group, expanded, onToggle, expandedTools, toggleTool }) {
  const tools = group.tools;
  const doneCount = tools.filter(t => t.type === 'tool_done').length;
  const errorCount = tools.filter(t => t.type === 'tool_error').length;
  const pendingCount = tools.filter(t => t.type === 'tool').length;
  const total = doneCount + errorCount;

  return (
    <div className="py-1 pl-9 animate-fade-in">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>
          {total > 0 && <><Check size={10} className="inline text-[var(--success)] mr-1" />{total} completed</>}
          {errorCount > 0 && <span className="text-[var(--danger)] ml-1.5">{errorCount} failed</span>}
          {pendingCount > 0 && <span className="ml-1.5">{pendingCount} running</span>}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 ml-3 space-y-0.5">
          {tools.map(msg => {
            if (msg.type === 'tool') {
              return (
                <div key={msg.id} className="flex items-center gap-2 text-[var(--text-tertiary)]">
                  <Loader2 size={10} className="animate-spin opacity-40 text-[var(--accent)]" />
                  <span className="text-[10px] font-mono">{msg.text}</span>
                </div>
              );
            }
            const isError = msg.type === 'tool_error';
            return (
              <div key={msg.id} className="flex items-center gap-2 text-[10px] font-mono">
                {isError ? <X size={10} className="text-[var(--danger)]" /> : <Check size={10} className="text-[var(--success)]" />}
                <span className={isError ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}>{msg.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Message renderer ─────────────────────────────────────────────────────

function renderMessage(msg, ctx) {
  // User message
  if (msg.type === 'user') {
    return (
      <div key={msg.id} className="flex justify-end py-2 animate-fade-in">
        <div className="max-w-[80%]">
          {msg.chips?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1 justify-end">
              {msg.chips.map((c, i) => (
                <span key={i} className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded">
                  {c.label}
                </span>
              ))}
            </div>
          )}
          <div className="bg-[var(--accent-subtle)] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-[var(--text-primary)]">
            {msg.text}
          </div>
        </div>
      </div>
    );
  }

  // Assistant
  if (msg.type === 'assistant') {
    const reaction = ctx.reactions[msg.id];
    const isHovered = ctx.hoveredMsg === msg.id;
    const art = detectArtifact(msg.text);

    return (
      <div
        key={msg.id}
        className="py-3 animate-fade-in group/msg relative"
        onMouseEnter={() => ctx.setHoveredMsg(msg.id)}
        onMouseLeave={() => ctx.setHoveredMsg(null)}
      >
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white font-bold text-[9px]">V</span>
          </div>
          <div className="flex-1 min-w-0 text-sm">
            <MarkdownRenderer text={msg.text} />
          </div>
        </div>

        {/* Inline actions — visible on hover */}
        <div className={cn(
          'absolute right-0 top-2 flex items-center gap-0.5 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          {art && (
            <ActionBtn icon={MoreHorizontal} title="Open as artifact" onClick={() => ctx.onArtifact(art)} />
          )}
          <ActionBtn icon={Copy} title="Copy" onClick={() => ctx.onCopy(msg.text)} />
          <ActionBtn icon={Save} title="Save to vault" onClick={() => ctx.onSave(msg.text)} />
          <ActionBtn icon={GitBranch} title="Branch from here" onClick={() => ctx.onBranch(msg.id)} />
          <ActionBtn
            icon={ThumbsUp}
            title="Helpful"
            onClick={() => ctx.onReaction(msg.id, 'up')}
            active={reaction === 'up'}
            activeColor="text-[var(--success)]"
          />
          <ActionBtn
            icon={ThumbsDown}
            title="Not helpful"
            onClick={() => ctx.onReaction(msg.id, 'down')}
            active={reaction === 'down'}
            activeColor="text-[var(--danger)]"
          />
        </div>
      </div>
    );
  }

  // Thinking
  if (msg.type === 'thinking') {
    const isExpanded = ctx.expandedThinking.has(msg.id);
    return (
      <div key={msg.id} className="py-1 pl-9 animate-fade-in">
        <button
          onClick={() => ctx.toggleThinking(msg.id)}
          className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer"
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="font-mono">reasoning ({msg.text.length} chars)</span>
        </button>
        {isExpanded && (
          <div className="mt-1 ml-5 pl-3 border-l-2 border-[var(--border)] text-[11px] font-mono text-[var(--text-tertiary)] italic max-h-[200px] overflow-auto leading-relaxed">
            {msg.text}
          </div>
        )}
      </div>
    );
  }

  // Progress
  if (msg.type === 'progress') {
    return (
      <div key={msg.id} className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono whitespace-nowrap">
          {msg.text}{msg.toolCount > 1 ? ` (${msg.toolCount} tools)` : ''}
        </span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
    );
  }

  // Checkpoint
  if (msg.type === 'checkpoint') {
    return (
      <div key={msg.id} className="py-1 pl-9">
        <span className="text-[var(--accent)] text-[11px]">{'\u25CE'} </span>
        <span className="text-[var(--text-tertiary)] text-[11px]">{msg.text}</span>
      </div>
    );
  }

  // Citations
  if (msg.type === 'citations' && msg.sources?.length > 0) {
    return (
      <div key={msg.id} className="py-1 pl-9 flex flex-wrap gap-1.5 animate-fade-in">
        {msg.sources.map((src, i) => {
          let label = '';
          if (src.type === 'file') label = src.filename;
          else if (src.type === 'search') label = `"${src.pattern}"`;
          else if (src.type === 'glob') label = src.pattern;
          else label = src.type;
          return (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--surface-tertiary)] text-[10px] font-mono text-[var(--text-tertiary)]">
              <FileText size={9} className="opacity-40" />
              {label}
            </span>
          );
        })}
      </div>
    );
  }

  // Question
  if (msg.type === 'question') {
    return (
      <div key={msg.id} className="py-2 pl-9 animate-fade-in">
        <div className="px-4 py-3 rounded-xl bg-[var(--accent-muted)] text-sm text-[var(--text-primary)] italic">
          {msg.text}
        </div>
      </div>
    );
  }

  // Hint
  if (msg.type === 'hint') {
    return (
      <div key={msg.id} className="py-0.5 pl-9">
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{msg.text}</span>
      </div>
    );
  }

  // Error
  if (msg.type === 'error') {
    return (
      <div key={msg.id} className="py-2 animate-fade-in">
        <div className="px-4 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] text-sm text-[var(--danger)]">
          {msg.text}
        </div>
      </div>
    );
  }

  // System
  if (msg.type === 'system') {
    return (
      <div key={msg.id} className="py-1 text-center">
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{msg.text}</span>
      </div>
    );
  }

  return (
    <div key={msg.id} className="py-1 pl-9">
      <span className="text-sm text-[var(--text-secondary)]">{msg.text}</span>
    </div>
  );
}

// ── Tiny action button ──────────────────────────────────────────────────

function ActionBtn({ icon: Icon, title, onClick, active, activeColor }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-6 h-6 rounded-md flex items-center justify-center transition-all',
        active
          ? activeColor || 'text-[var(--accent)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
      )}
    >
      <Icon size={12} />
    </button>
  );
}
