import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, FileText, Check, X, Loader2, ThumbsUp, ThumbsDown, Copy, Save, GitBranch, Sparkles, Paperclip, File, Square, Brain, ChevronUp, Terminal, PenLine, Eye, Search, FolderSearch, Wrench, RefreshCw, Pencil, Clock } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';
import SidePanel from '../components/SidePanel.jsx';
import SlashMenu from '../components/SlashMenu.jsx';
import ContextChips from '../components/ContextChips.jsx';
import VoiceInput from '../components/VoiceInput.jsx';
import VennieOrb from '../components/VennieOrb.jsx';

// ── Detect artifact-worthy content ───────────────────────────────────────
function detectArtifact(text) {
  if (!text) return null;
  const codeMatch = text.match(/```(\w+)?\n([\s\S]{200,}?)```/);
  if (codeMatch) {
    return { type: 'code', title: codeMatch[1] || 'Code', content: codeMatch[2].trim() };
  }
  const tableLines = text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
  if (tableLines.length >= 4) {
    return { type: 'table', title: 'Table', content: tableLines.join('\n') };
  }
  const headers = (text.match(/^#{1,3}\s+.+/gm) || []);
  if (headers.length >= 3 && text.length > 500) {
    return { type: 'document', title: headers[0].replace(/^#+\s+/, ''), content: text };
  }
  return null;
}

// ── Detect file paths in text ────────────────────────────────────────────
function extractFilePaths(text) {
  if (!text) return [];
  const patterns = [
    /(?:^|\s)((?:[\w-]+\/)+[\w-]+\.(?:md|yaml|json|js|ts|py|txt))/gm,
    /`((?:[\w-]+\/)+[\w-]+\.(?:md|yaml|json|js|ts|py|txt))`/g,
  ];
  const paths = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      paths.add(match[1].trim());
    }
  }
  return [...paths];
}

// ── Tool icon + label mapping ───────────────────────────────────────────
const TOOL_META = {
  Read:  { icon: Eye,          label: 'Read' },
  Write: { icon: PenLine,      label: 'Write' },
  Edit:  { icon: PenLine,      label: 'Edit' },
  Bash:  { icon: Terminal,      label: 'Bash' },
  Glob:  { icon: FolderSearch,  label: 'Search' },
  Grep:  { icon: Search,        label: 'Search' },
};
function getToolMeta(name) {
  if (TOOL_META[name]) return TOOL_META[name];
  // MCP tools: mcp__server__tool_name → "server tool_name"
  if (name?.startsWith('mcp__')) {
    const parts = name.split('__').filter(Boolean);
    return { icon: Wrench, label: parts.slice(1).join(' ') };
  }
  return { icon: Wrench, label: name || 'Tool' };
}

export default function ChatView({ appData, activeThreadId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [suggestions, setSuggestions] = useState(appData?.welcomeData?.suggestions || []);
  const [expandedTools, setExpandedTools] = useState(new Set());
  const [expandedThinking, setExpandedThinking] = useState(new Set());
  const [expandedGroups] = useState(new Set()); // kept for compat
  const [reactions, setReactions] = useState({});
  const [showSlash, setShowSlash] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [contextChips, setContextChips] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [skills, setSkills] = useState([]);
  const [showModeMenu, setShowModeMenu] = useState(false);
  // Side panel state
  const [sidePanels, setSidePanels] = useState([]);
  const [activePanelId, setActivePanelId] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const [thinkingContext, setThinkingContext] = useState('');
  const [contextFlash, setContextFlash] = useState(null); // { sources: string[] }
  const [collapsedMsgs, setCollapsedMsgs] = useState(new Set());
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const streamingRef = useRef('');
  const threadIdRef = useRef(activeThreadId);

  // Sync thread ID with prop
  useEffect(() => { threadIdRef.current = activeThreadId; }, [activeThreadId]);

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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming, isThinking]);

  // Agent events
  useEffect(() => {
    let thinkingText = '';
    let citations = [];

    const unsub = window.vennie.onEvent((event) => {
      switch (event.type) {
        case 'context_loaded':
          setContextFlash({ sources: event.sources });
          setThinkingContext('Reading your vault...');
          // Auto-dismiss after 3s
          setTimeout(() => setContextFlash(null), 3000);
          break;
        case 'text_delta':
          if (thinkingText) {
            setMessages(prev => [...prev, { id: Date.now(), type: 'thinking', text: thinkingText }]);
            thinkingText = '';
          }
          streamingRef.current += event.text;
          setStreaming(streamingRef.current);
          setIsThinking(false);
          setThinkingContext('');
          setContextFlash(null);
          break;
        case 'thinking_delta':
          thinkingText += event.text;
          setThinkingContext('Reasoning...');
          setIsThinking(false);
          break;
        case 'turn_progress':
          if (event.turn > 1) {
            setMessages(prev => [...prev, { id: Date.now(), type: 'progress', text: `Step ${event.turn}/${event.maxTurns}`, toolCount: event.toolCount }]);
          }
          setThinkingContext('Working...');
          break;
        case 'tool_start': {
          const descriptions = {
            Read:  () => (event.input?.file_path || '').split('/').pop() || 'file',
            Write: () => (event.input?.file_path || '').split('/').pop() || 'file',
            Edit:  () => (event.input?.file_path || '').split('/').pop() || 'file',
            Bash:  () => (event.input?.command || '').slice(0, 80),
            Glob:  () => event.input?.pattern || 'files',
            Grep:  () => `"${(event.input?.pattern || '').slice(0, 40)}"`,
          };
          const desc = (descriptions[event.name] || (() => ''))();
          const toolId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          // Contextual thinking status
          const ctxMap = {
            Read: `Reading ${desc}`, Write: `Writing ${desc}`, Edit: `Editing ${desc}`,
            Bash: 'Running command...', Glob: 'Searching files...', Grep: `Searching for ${desc}`,
          };
          setThinkingContext(ctxMap[event.name] || `Using ${event.name}...`);
          setMessages(prev => [...prev, {
            id: toolId, type: 'tool', name: event.name, description: desc,
            status: 'running', duration: null, resultText: null, preview: null,
            filePath: event.input?.file_path || null,
          }]);
          setIsThinking(true);
          break;
        }
        case 'tool_result': {
          // Update the most recent running tool of this name
          setMessages(prev => {
            const idx = prev.findLastIndex(m => m.type === 'tool' && m.status === 'running');
            if (idx === -1) return prev;
            const updated = [...prev];
            const duration = event.duration ? (event.duration >= 1000 ? `${(event.duration / 1000).toFixed(1)}s` : `${event.duration}ms`) : '';

            // Build concise result text based on tool type + result
            let resultText = event.success ? 'Done' : 'Failed';
            try {
              const r = event.result;
              if (event.success && r) {
                if (event.name === 'Read' && r.total_lines) resultText = `${r.total_lines} lines`;
                else if (event.name === 'Grep' && r.count != null) resultText = r.count > 0 ? `${r.count} match${r.count !== 1 ? 'es' : ''}` : 'No matches';
                else if (event.name === 'Glob' && r.count != null) resultText = `${r.count} file${r.count !== 1 ? 's' : ''}`;
                else if (event.name === 'Bash' && r.output) {
                  const lastLine = r.output.trim().split('\n').pop()?.trim();
                  if (lastLine && lastLine.length <= 60) resultText = lastLine;
                }
              }
              if (!event.success && r?.error) {
                resultText = (r.error.length > 50 ? r.error.slice(0, 47) + '...' : r.error);
              }
            } catch {
              // result might not be serializable over IPC — fall back gracefully
            }

            updated[idx] = {
              ...updated[idx],
              status: event.success ? 'done' : 'error',
              duration,
              resultText,
              preview: event.preview || null,
            };
            return updated;
          });
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
            const art = detectArtifact(text);
            if (art) openSidePanel({ id: `art-${Date.now()}`, ...art });
            streamingRef.current = '';
            setStreaming('');
            // Save thread
            saveCurrentThread();
          }
          break;
      }
    });
    return () => unsub();
  }, []);

  // Inline file link clicks from MarkdownRenderer
  useEffect(() => {
    function handleOpenFile(ev) { openVaultFile(ev.detail); }
    window.addEventListener('vennie:open-file', handleOpenFile);
    return () => window.removeEventListener('vennie:open-file', handleOpenFile);
  }, []);

  // Skill trigger events
  useEffect(() => {
    function handleSkill(ev) { handleSubmit(`/${ev.detail}`); }
    window.addEventListener('vennie:run-skill', handleSkill);
    return () => window.removeEventListener('vennie:run-skill', handleSkill);
  }, []);

  // Thread loading — sync both UI and backend session
  useEffect(() => {
    function handleLoadThread(ev) {
      const thread = ev.detail;
      if (!thread?.messages) return;
      threadIdRef.current = thread.id || null;
      setMessages(thread.messages);
      setStreaming('');
      setIsThinking(false);
      setSidePanels([]);
      setActivePanelId(null);
      // Sync backend messagesRef with loaded thread's conversation
      window.vennie.loadSession(thread.messages);
    }
    window.addEventListener('vennie:load-thread', handleLoadThread);
    return () => window.removeEventListener('vennie:load-thread', handleLoadThread);
  }, []);

  // New chat — clear UI and backend session
  useEffect(() => {
    function handleNewChat() {
      threadIdRef.current = null;
      setMessages([]);
      setStreaming('');
      setIsThinking(false);
      setSuggestions(appData?.welcomeData?.suggestions || []);
      setSidePanels([]);
      setActivePanelId(null);
      inputRef.current?.focus();
      // Clear backend conversation history so it starts fresh
      window.vennie.clearSession();
    }
    window.addEventListener('vennie:new-chat', handleNewChat);
    return () => window.removeEventListener('vennie:new-chat', handleNewChat);
  }, [appData]);

  // ── Side panel management ──────────────────────────────────────────────

  function openSidePanel(panel) {
    setSidePanels(prev => {
      const exists = prev.find(p => p.id === panel.id);
      if (exists) { setActivePanelId(panel.id); return prev; }
      setActivePanelId(panel.id);
      return [...prev, panel];
    });
  }

  async function openVaultFile(filePath) {
    try {
      const result = await window.vennie?.readFile?.(filePath);
      if (result?.content) {
        const fileName = filePath.split('/').pop();
        openSidePanel({ id: `file-${filePath}`, title: fileName, filePath, type: 'document', content: result.content });
      }
    } catch {}
  }

  function closeSidePanel(id) {
    setSidePanels(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activePanelId === id && next.length > 0) setActivePanelId(next[next.length - 1].id);
      return next;
    });
    if (sidePanels.length <= 1) setActivePanelId(null);
  }

  function closeAllPanels() {
    setSidePanels([]);
    setActivePanelId(null);
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (value) => {
    const text = typeof value === 'string' ? value : input;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    setShowSlash(false);
    setSlashQuery('');
    setSuggestions([]);

    const msgData = {
      id: Date.now(), type: 'user', text: trimmed || '(attached files)',
      chips: contextChips.length > 0 ? [...contextChips] : undefined,
      attachments: currentAttachments.length > 0
        ? currentAttachments.map(a => ({ type: a.type, fileName: a.fileName, mediaType: a.mediaType }))
        : undefined,
      attachmentPreviews: currentAttachments.filter(a => a.type === 'image').map(a => `data:${a.mediaType};base64,${a.data}`),
    };
    setMessages(prev => {
      const next = [...prev, msgData];
      // Create thread immediately on first user message
      if (prev.length === 0 && !threadIdRef.current) {
        const newId = `thread-${Date.now()}`;
        threadIdRef.current = newId;
        window.dispatchEvent(new CustomEvent('vennie:thread-created', { detail: { id: newId } }));
        saveThread(newId, trimmed || '(attached files)', '', next);
      }
      return next;
    });
    setContextChips([]);
    setIsThinking(true);
    setThinkingContext('Gathering context...');
    setContextFlash(null);
    streamingRef.current = '';

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
      const result = await window.vennie.send(
        contextPrefix + (trimmed || 'Please review the attached files.'),
        currentAttachments.length > 0 ? currentAttachments : undefined
      );
      if (result?.handled && !result.fallThrough && result.type) {
        setIsThinking(false);
        if (result.text) {
          setMessages(prev => [...prev, { id: Date.now(), type: result.type === 'error' ? 'error' : result.type === 'text' ? 'assistant' : 'system', text: result.text }]);
        }
      }
      if (result?.intent) {
        setMessages(prev => [...prev, { id: Date.now(), type: 'hint', text: result.intent }]);
      }
    } catch (err) {
      setIsThinking(false);
      setMessages(prev => [...prev, { id: Date.now(), type: 'error', text: err.message }]);
    }
  }, [input, contextChips, attachments]);

  // ── File attachment handlers ──────────────────────────────────────────

  async function handlePickFiles() {
    const files = await window.vennie.pickFiles();
    if (files?.length > 0) setAttachments(prev => [...prev, ...files]);
  }

  function handleRemoveAttachment(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  async function handleDrop(ev) {
    ev.preventDefault();
    setIsDragOver(false);
    const filePaths = [...ev.dataTransfer.files].map(f => f.path).filter(Boolean);
    if (filePaths.length > 0) {
      const files = await window.vennie.readDroppedFiles(filePaths);
      if (files?.length > 0) setAttachments(prev => [...prev, ...files]);
    }
  }

  function handleDragOver(ev) { ev.preventDefault(); setIsDragOver(true); }
  function handleDragLeave() { setIsDragOver(false); }

  function handlePaste(ev) {
    const items = ev.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        ev.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          const mediaType = blob.type || 'image/png';
          const fileName = `clipboard-${Date.now()}.${mediaType.split('/')[1] || 'png'}`;
          setAttachments(prev => [...prev, { type: 'image', fileName, mediaType, data: base64, size: blob.size }]);
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
  }

  function handleKeyDown(ev) {
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
    if (val.startsWith('/')) { setShowSlash(true); setSlashQuery(val.slice(1)); }
    else { setShowSlash(false); setSlashQuery(''); }
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
      if (next[msgId] === type) delete next[msgId];
      else next[msgId] = type;
      return next;
    });
  }

  function handleBranch(msgId) {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      saveCurrentThread();
      setMessages([...messages.slice(0, idx + 1), { id: Date.now(), type: 'system', text: 'Branched from previous conversation' }]);
    }
  }

  function saveThread(id, title, preview, msgs) {
    const thread = {
      id,
      title: (title || 'Untitled').slice(0, 60),
      preview: (preview || '').slice(0, 100),
      timestamp: Date.now(),
      messageCount: msgs.filter(m => m.type === 'user' || m.type === 'assistant').length,
      messages: msgs,
    };
    try {
      const stored = JSON.parse(localStorage.getItem('vennie-threads') || '[]');
      const idx = stored.findIndex(t => t.id === thread.id);
      if (idx >= 0) stored[idx] = { ...stored[idx], ...thread };
      else stored.unshift(thread);
      localStorage.setItem('vennie-threads', JSON.stringify(stored.slice(0, 50)));
      window.dispatchEvent(new Event('vennie:threads-updated'));
    } catch {}
  }

  function saveCurrentThread() {
    if (messages.length < 2) return;
    const id = threadIdRef.current || `thread-${Date.now()}`;
    if (!threadIdRef.current) {
      threadIdRef.current = id;
      window.dispatchEvent(new CustomEvent('vennie:thread-created', { detail: { id } }));
    }
    const firstUser = messages.find(m => m.type === 'user');
    const lastAssistant = messages.filter(m => m.type === 'assistant').pop();
    saveThread(id, firstUser?.text, lastAssistant?.text, messages);
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

  // Edit a user message and resubmit from that point
  function handleEditMessage(msgId) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    setEditingMsg(msgId);
    setEditText(msg.text);
  }

  function handleEditSubmit(msgId) {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const edited = editText.trim();
    if (!edited) return;
    // Truncate conversation to this point and resubmit
    const truncated = messages.slice(0, idx);
    setMessages(truncated);
    setEditingMsg(null);
    setEditText('');
    // Submit the edited message
    setTimeout(() => handleSubmit(edited), 50);
  }

  function handleEditCancel() {
    setEditingMsg(null);
    setEditText('');
  }

  // Regenerate last assistant response
  function handleRegenerate() {
    // Find the last user message and resubmit
    const lastUserIdx = messages.findLastIndex(m => m.type === 'user');
    if (lastUserIdx < 0) return;
    const userMsg = messages[lastUserIdx];
    // Remove everything after (and including) the last assistant response
    const truncated = messages.slice(0, lastUserIdx + 1);
    setMessages(truncated);
    // Resubmit
    setTimeout(() => {
      streamingRef.current = '';
      setStreaming('');
      setIsThinking(true);
      window.vennie.send(userMsg.text);
    }, 50);
  }

  // Toggle collapse for long messages
  function toggleCollapse(msgId) {
    setCollapsedMsgs(prev => {
      const n = new Set(prev);
      n.has(msgId) ? n.delete(msgId) : n.add(msgId);
      return n;
    });
  }

  const toggleTool = (id) => setExpandedTools(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleThinking = (id) => setExpandedThinking(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = () => {}; // no-op, kept for compat
  const hasSidePanel = sidePanels.length > 0;

  const [activeModel, setActiveModel] = useState(appData?.model || 'claude-sonnet-4-6');
  const modelDisplay = activeModel.replace('claude-', '').replace(/-\d{8}$/, '').replace('-4-6', ' 4.6').replace('-4-5-20251001', ' 4.5');
  const personaDisplay = appData?.persona && appData.persona !== 'default' ? appData.persona : null;
  const [showModelMenu, setShowModelMenu] = useState(false);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex h-full bg-[var(--surface-primary)]">
      {/* Chat column */}
      <div className={cn('flex-1 flex flex-col h-full min-w-0')}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div className={cn('mx-auto px-6 py-5', hasSidePanel ? 'max-w-[600px]' : 'max-w-[720px]')}>
            {/* Update banner */}
            {appData?.updateAvailable && messages.length === 0 && (
              <div className="mb-4 mx-auto max-w-[480px] px-4 py-3 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20 flex items-center justify-between gap-3 animate-fade-in">
                <span className="text-[13px] text-[var(--text-secondary)]">
                  Vennie <span className="font-semibold text-[var(--accent)]">v{appData.updateAvailable.latest}</span> is available <span className="text-[var(--text-tertiary)]">(you're on v{appData.updateAvailable.current})</span>
                </span>
                <button
                  onClick={() => handleSubmit('/update')}
                  className="text-[12px] font-medium text-[var(--accent)] hover:text-[var(--text-primary)] px-3 py-1 rounded-lg bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 transition-all whitespace-nowrap"
                >
                  /update
                </button>
              </div>
            )}
            {/* Welcome */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[65vh] gap-6 animate-fade-in">
                <VennieOrb size="lg" state="breathing" />
                <div className="text-center mt-1">
                  <h2 className="text-[var(--text-primary)] text-[17px] font-semibold tracking-tight">
                    {appData?.welcomeData?.greeting || 'Hey'}
                  </h2>
                  <p className="text-[var(--text-tertiary)] text-[13px] mt-1.5">
                    What are we working on?
                  </p>
                </div>
                {suggestions.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 mt-2 w-full max-w-[480px]">
                    {suggestions.slice(0, 4).map((s, i) => {
                      const label = typeof s === 'string' ? s : s.cmd || s.text || String(s);
                      const hint = typeof s === 'object' && s.reason ? s.reason : null;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSubmit(label)}
                          className={cn(
                            'group px-4 py-3.5 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] transition-all text-left border border-[var(--border)] hover:border-[var(--accent)]/30',
                            suggestions.length === 3 && i === 2 && 'col-span-2 max-w-[240px] mx-auto'
                          )}
                        >
                          <div className="text-[13px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors">{label}</div>
                          {hint && <div className="text-[11px] text-[var(--text-tertiary)] mt-1 leading-snug">{hint}</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div className="space-y-0.5">
              {messages.map((item, idx) => renderMessage(item, {
                  expandedTools, expandedThinking, toggleTool, toggleThinking,
                  reactions, onReaction: handleReaction,
                  hoveredMsg, setHoveredMsg,
                  onCopy: handleCopyMessage, onSave: handleSaveToVault,
                  onBranch: handleBranch,
                  onOpenFile: openVaultFile,
                  onOpenArtifact: (art) => openSidePanel({ id: `art-${Date.now()}`, ...art }),
                  // New features
                  onEdit: handleEditMessage,
                  editingMsg, editText, setEditText,
                  onEditSubmit: handleEditSubmit, onEditCancel: handleEditCancel,
                  onRegenerate: handleRegenerate,
                  collapsedMsgs, toggleCollapse,
                  isLastAssistant: item.type === 'assistant' && idx === messages.findLastIndex(m => m.type === 'assistant'),
                  isThinking, streaming,
                })
              )}
            </div>

            {/* Streaming with cursor */}
            {streaming && (
              <div className="py-3 animate-fade-in">
                <div className="flex items-start gap-3">
                  <VennieOrb size="sm" />
                  <div className="flex-1 min-w-0 text-[15px] text-[var(--text-secondary)] leading-relaxed">
                    <MarkdownRenderer text={streaming} />
                    <span className="inline-block w-[2px] h-[18px] bg-[var(--accent)] rounded-full ml-0.5 animate-pulse align-text-bottom" />
                  </div>
                </div>
              </div>
            )}

            {/* Thinking indicator — contextual with phases */}
            {isThinking && !streaming && (
              <div className="flex items-center gap-3 py-3 animate-fade-in">
                <VennieOrb size="sm" state="thinking" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-[var(--text-tertiary)] font-mono">
                    {thinkingContext || 'thinking...'}
                  </span>
                  {contextFlash && (
                    <span className="text-[10px] text-[var(--text-tertiary)] opacity-70">
                      Using {contextFlash.sources.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up suggestions */}
            {!isThinking && !streaming && suggestions.length > 0 && messages.length > 0 && messages[messages.length - 1]?.type === 'assistant' && (
              <div className="flex flex-wrap gap-2 py-3 pl-9 animate-fade-in">
                {suggestions.slice(0, 3).map((s, i) => {
                  const label = typeof s === 'string' ? s : s.cmd || s.text || String(s);
                  // Split on " — " to separate command from description
                  const [cmd, desc] = label.includes(' — ') ? label.split(' — ', 2) : [label, null];
                  return (
                    <button
                      key={i}
                      onClick={() => handleSubmit(cmd.trim())}
                      className="group/sug flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-secondary)] text-left hover:bg-[var(--surface-tertiary)] transition-all border border-[var(--border)] hover:border-[var(--border-strong)]"
                    >
                      <div>
                        <div className="text-[12px] font-medium text-[var(--text-secondary)] group-hover/sug:text-[var(--text-primary)] transition-colors">{cmd.trim()}</div>
                        {desc && <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{desc.trim()}</div>}
                      </div>
                      <ArrowUp size={11} className="text-[var(--text-tertiary)] opacity-0 group-hover/sug:opacity-100 transition-opacity shrink-0 rotate-45" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div
          className={cn('px-6 pb-5 pt-2', isDragOver && 'bg-[var(--accent-subtle)]')}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className={cn('mx-auto relative', hasSidePanel ? 'max-w-[600px]' : 'max-w-[720px]')}>
            {showSlash && (
              <SlashMenu query={slashQuery} skills={skills} onSelect={handleSlashSelect} onClose={() => { setShowSlash(false); setSlashQuery(''); }} />
            )}

            {/* Drag overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-subtle)]/80 pointer-events-none">
                <span className="text-sm font-medium text-[var(--accent)]">Drop files to attach</span>
              </div>
            )}

            <div className="input-floating rounded-2xl">
              <ContextChips chips={contextChips} onRemove={(i) => setContextChips(prev => prev.filter((_, j) => j !== i))} />

              {/* Attachment previews */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                  {attachments.map((att, i) => (
                    <div key={i} className="relative group">
                      {att.type === 'image' ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-[var(--surface-tertiary)] border border-[var(--border)]">
                          <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.fileName} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface-tertiary)] border border-[var(--border)]">
                          <File size={12} className="text-[var(--text-tertiary)]" />
                          <span className="text-[11px] text-[var(--text-secondary)] max-w-[120px] truncate">{att.fileName}</span>
                        </div>
                      )}
                      <button
                        onClick={() => handleRemoveAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--surface-primary)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      >
                        <X size={8} className="text-[var(--text-tertiary)]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 px-4 py-3">
                <button
                  onClick={handlePickFiles}
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
                  title="Attach files"
                >
                  <Paperclip size={16} />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={attachments.length > 0 ? 'Add a message about these files...' : 'Message Vennie...'}
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] text-[15px] font-sans resize-none max-h-[160px] leading-relaxed placeholder:text-[var(--text-tertiary)]"
                />
                <VoiceInput onTranscript={(text) => setInput(prev => prev + text)} disabled={isThinking} />
                {isThinking ? (
                  <button
                    onClick={() => window.vennie?.abort?.()}
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-[var(--surface-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] transition-all"
                    title="Stop"
                  >
                    <Square size={12} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubmit(input)}
                    disabled={!input.trim() && attachments.length === 0}
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all',
                      (input.trim() || attachments.length > 0)
                        ? 'bg-white text-black hover:bg-white/90 shadow-sm'
                        : 'bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]'
                    )}
                  >
                    <ArrowUp size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Bottom mode bar */}
            <div className="flex items-center justify-between mt-1.5 px-1">
              <div className="flex items-center gap-1.5">
                {/* Model switcher */}
                <div className="relative">
                  <button
                    onClick={() => setShowModelMenu(prev => !prev)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] transition-colors"
                  >
                    {modelDisplay}
                    <ChevronDown size={10} />
                  </button>
                  {showModelMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                      <div className="absolute bottom-full left-0 mb-1 z-50 py-1 min-w-[160px] rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] shadow-lg">
                        {[
                          { id: 'claude-sonnet-4-6', label: 'sonnet 4.6', desc: 'Fast & capable' },
                          { id: 'claude-opus-4-6', label: 'opus 4.6', desc: 'Most intelligent' },
                          { id: 'claude-haiku-4-5-20251001', label: 'haiku 4.5', desc: 'Fastest' },
                        ].map(m => (
                          <button
                            key={m.id}
                            onClick={async () => {
                              const res = await window.vennie?.setModel?.(m.id);
                              if (res?.model) setActiveModel(res.model);
                              else setActiveModel(m.id);
                              setShowModelMenu(false);
                            }}
                            className={cn(
                              'w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors',
                              activeModel === m.id
                                ? 'text-[var(--text-primary)] bg-[var(--surface-tertiary)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]'
                            )}
                          >
                            <div>
                              <div className="text-[12px] font-mono">{m.label}</div>
                              <div className="text-[10px] text-[var(--text-tertiary)]">{m.desc}</div>
                            </div>
                            {activeModel === m.id && <Check size={12} className="text-[var(--text-tertiary)]" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {personaDisplay && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-subtle)] text-[10px] font-medium text-[var(--accent)]">
                    <Sparkles size={9} />
                    {personaDisplay}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[var(--text-tertiary)] opacity-50">
                <kbd className="font-mono">/</kbd> skills
                <span className="mx-1.5 opacity-40">·</span>
                <kbd className="font-mono">Enter</kbd> send
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {hasSidePanel && (
        <SidePanel
          panels={sidePanels}
          activePanel={activePanelId}
          onSetActive={setActivePanelId}
          onClose={closeAllPanels}
          onClosePanel={closeSidePanel}
          onSave={async (p) => {
            const title = (p.title || 'artifact').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
            await window.vennie?.writeFile?.(`00-Inbox/Ideas/${title}.md`, p.content);
          }}
        />
      )}
    </div>
  );
}

// VennieOrb is imported from ../components/VennieOrb.jsx

// ── Tool row (Claude Code style) ────────────────────────────────────────
function ToolRow({ msg }) {
  const meta = getToolMeta(msg.name);
  const Icon = meta.icon;
  const isRunning = msg.status === 'running';
  const isError = msg.status === 'error';
  const isDone = msg.status === 'done';
  const isFileOp = isDone && msg.filePath && (msg.name === 'Write' || msg.name === 'Edit');

  return (
    <div className="pl-9 animate-fade-in group/tool">
      <div className="flex items-center gap-3 py-1.5">
        {/* Status icon */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isRunning ? (
            <Loader2 size={13} className="animate-spin text-[var(--text-tertiary)]" />
          ) : isError ? (
            <X size={13} className="text-[var(--danger)]" />
          ) : (
            <Icon size={13} className="text-[var(--text-tertiary)]" />
          )}
        </div>

        {/* Tool name + description */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn(
            'text-[13px] font-medium shrink-0',
            isError ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'
          )}>
            {meta.label}
          </span>
          {msg.description && (
            <span className="text-[13px] text-[var(--text-tertiary)] truncate font-mono">
              {msg.description}
            </span>
          )}
        </div>

        {/* Right-aligned result */}
        <div className="shrink-0 ml-auto">
          {isRunning && (
            <span className="text-[12px] text-[var(--text-tertiary)] font-mono opacity-50">running</span>
          )}
          {isDone && !isFileOp && (
            <span className="text-[12px] text-[var(--success)] font-medium">
              {msg.resultText || 'Done'}
            </span>
          )}
          {isError && (
            <span className="text-[12px] text-[var(--danger)] font-medium">
              {msg.resultText || 'Failed'}
            </span>
          )}
        </div>

        {/* Duration (subtle, on hover) */}
        {msg.duration && (
          <span className="text-[10px] text-[var(--text-tertiary)] opacity-0 group-hover/tool:opacity-60 transition-opacity font-mono shrink-0">
            {msg.duration}
          </span>
        )}
      </div>

      {/* File card for Write/Edit completions */}
      {isFileOp && (
        <div className="ml-7 mt-0.5 mb-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] hover:border-[var(--accent)]/20 hover:bg-[var(--accent-subtle)] transition-all cursor-default">
            <FileText size={12} className="text-[var(--accent)] shrink-0" />
            <span className="text-[12px] font-mono text-[var(--text-secondary)] truncate max-w-[300px]">
              {msg.filePath.split('/').pop()}
            </span>
            <span className="text-[10px] text-[var(--success)] font-medium shrink-0">
              {msg.name === 'Write' ? 'Created' : 'Edited'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timestamp formatter ──────────────────────────────────────────────────
function formatTimestamp(id) {
  const ts = typeof id === 'number' ? id : parseInt(id);
  if (!ts || isNaN(ts)) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Collapsible content ─────────────────────────────────────────────────
const COLLAPSE_LINE_THRESHOLD = 30;

function CollapsibleContent({ text, msgId, collapsed, onToggle }) {
  const lineCount = text.split('\n').length;
  const shouldCollapse = lineCount > COLLAPSE_LINE_THRESHOLD;

  if (!shouldCollapse) {
    return <MarkdownRenderer text={text} />;
  }

  if (collapsed) {
    const truncated = text.split('\n').slice(0, COLLAPSE_LINE_THRESHOLD).join('\n');
    return (
      <>
        <div className="relative">
          <MarkdownRenderer text={truncated} />
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[var(--surface-primary)] to-transparent pointer-events-none" />
        </div>
        <button
          onClick={() => onToggle(msgId)}
          className="flex items-center gap-1 mt-1 text-[11px] text-[var(--accent)] hover:underline"
        >
          <ChevronDown size={12} />
          Show {lineCount - COLLAPSE_LINE_THRESHOLD} more lines
        </button>
      </>
    );
  }

  return (
    <>
      <MarkdownRenderer text={text} />
      <button
        onClick={() => onToggle(msgId)}
        className="flex items-center gap-1 mt-2 text-[11px] text-[var(--accent)] hover:underline"
      >
        <ChevronUp size={12} />
        Collapse
      </button>
    </>
  );
}

// ── Message renderer ─────────────────────────────────────────────────────
function renderMessage(msg, ctx) {
  // User message
  if (msg.type === 'user') {
    const isEditing = ctx.editingMsg === msg.id;
    return (
      <div key={msg.id} className="flex justify-end py-2.5 animate-fade-in group/user">
        <div className="max-w-[85%]">
          {/* Timestamp on hover */}
          <div className="flex justify-end mb-0.5">
            <span className="text-[9px] text-[var(--text-tertiary)] opacity-0 group-hover/user:opacity-60 transition-opacity font-mono">
              {formatTimestamp(msg.id)}
            </span>
          </div>
          {msg.chips?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1 justify-end">
              {msg.chips.map((c, i) => (
                <span key={i} className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded">{c.label}</span>
              ))}
            </div>
          )}
          {msg.attachmentPreviews?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 justify-end">
              {msg.attachmentPreviews.map((src, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-[var(--border)] shadow-sm">
                  <img src={src} alt="attachment" className="max-w-[240px] max-h-[180px] object-contain bg-[var(--surface-tertiary)]" />
                </div>
              ))}
            </div>
          )}
          {msg.attachments?.filter(a => a.type === 'document').length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
              {msg.attachments.filter(a => a.type === 'document').map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)]">
                  <File size={10} className="text-[var(--text-tertiary)]" />
                  {a.fileName}
                </span>
              ))}
            </div>
          )}
          {isEditing ? (
            <div className="bg-[var(--surface-secondary)] rounded-2xl rounded-br-sm px-4 py-2.5 border border-[var(--accent)]">
              <textarea
                value={ctx.editText}
                onChange={e => ctx.setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ctx.onEditSubmit(msg.id); } if (e.key === 'Escape') ctx.onEditCancel(); }}
                className="w-full bg-transparent text-[15px] text-[var(--text-primary)] leading-relaxed outline-none resize-none"
                rows={Math.min(ctx.editText.split('\n').length + 1, 8)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={ctx.onEditCancel} className="px-2.5 py-1 rounded-lg text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)]">Cancel</button>
                <button onClick={() => ctx.onEditSubmit(msg.id)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">Resend</button>
              </div>
            </div>
          ) : (
            <div className="relative group/bubble">
              <div className="bg-[var(--surface-secondary)] rounded-2xl rounded-br-sm px-4 py-2.5 text-[15px] text-[var(--text-primary)] leading-relaxed">
                {msg.text}
              </div>
              {/* Edit button on hover */}
              {!ctx.isThinking && !ctx.streaming && (
                <button
                  onClick={() => ctx.onEdit(msg.id)}
                  className="absolute -left-7 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)] opacity-0 group-hover/bubble:opacity-100 transition-all"
                  title="Edit message"
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant
  if (msg.type === 'assistant') {
    const reaction = ctx.reactions[msg.id];
    const isHovered = ctx.hoveredMsg === msg.id;
    const art = detectArtifact(msg.text);
    const filePaths = extractFilePaths(msg.text);
    const isCollapsed = ctx.collapsedMsgs?.has?.(msg.id) ?? false;

    return (
      <div
        key={msg.id}
        className="py-3 animate-fade-in group/msg relative"
        onMouseEnter={() => ctx.setHoveredMsg(msg.id)}
        onMouseLeave={() => ctx.setHoveredMsg(null)}
      >
        {/* Timestamp on hover */}
        <div className="pl-9 mb-0.5">
          <span className="text-[9px] text-[var(--text-tertiary)] opacity-0 group-hover/msg:opacity-60 transition-opacity font-mono">
            {formatTimestamp(msg.id)}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <VennieOrb size="sm" />
          <div className="flex-1 min-w-0 text-[15px] text-[var(--text-secondary)] leading-relaxed">
            <CollapsibleContent
              text={msg.text}
              msgId={msg.id}
              collapsed={isCollapsed}
              onToggle={ctx.toggleCollapse}
            />

            {filePaths.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {filePaths.slice(0, 5).map((fp, i) => (
                  <button
                    key={i}
                    onClick={() => ctx.onOpenFile(fp)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-subtle)] text-[11px] font-mono text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-all border border-transparent hover:border-[var(--accent)]/15"
                  >
                    <FileText size={10} />
                    {fp.split('/').pop()}
                  </button>
                ))}
              </div>
            )}

            {/* Regenerate button on last assistant message */}
            {ctx.isLastAssistant && !ctx.isThinking && !ctx.streaming && (
              <button
                onClick={() => ctx.onRegenerate(msg.id)}
                className="flex items-center gap-1.5 mt-3 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
              >
                <RefreshCw size={11} />
                Regenerate
              </button>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div className={cn(
          'absolute right-0 top-2 flex items-center gap-0.5 p-1 rounded-lg bg-[var(--surface-primary)] border border-[var(--border)] shadow-sm transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}>
          <ActionBtn icon={Copy} title="Copy" onClick={() => ctx.onCopy(msg.text)} />
          <ActionBtn icon={Save} title="Save to vault" onClick={() => ctx.onSave(msg.text)} />
          <ActionBtn icon={GitBranch} title="Branch" onClick={() => ctx.onBranch(msg.id)} />
          <ActionBtn icon={ThumbsUp} title="Helpful" onClick={() => ctx.onReaction(msg.id, 'up')} active={reaction === 'up'} activeColor="text-[var(--success)]" />
          <ActionBtn icon={ThumbsDown} title="Not helpful" onClick={() => ctx.onReaction(msg.id, 'down')} active={reaction === 'down'} activeColor="text-[var(--danger)]" />
        </div>
      </div>
    );
  }

  // Thinking
  if (msg.type === 'thinking') {
    const isExpanded = ctx.expandedThinking.has(msg.id);
    return (
      <div key={msg.id} className="py-1 pl-9 animate-fade-in">
        <button onClick={() => ctx.toggleThinking(msg.id)} className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="font-mono">reasoning</span>
        </button>
        {isExpanded && (
          <div className="mt-1 ml-5 pl-3 border-l-2 border-[var(--border)] text-[11px] font-mono text-[var(--text-tertiary)] italic max-h-[200px] overflow-auto leading-relaxed">{msg.text}</div>
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
      <div key={msg.id} className="py-1.5 pl-9 flex flex-wrap gap-1.5 animate-fade-in">
        {msg.sources.map((src, i) => {
          let label = '';
          let filePath = null;
          if (src.type === 'file') { label = src.filename; filePath = src.path || src.filename; }
          else if (src.type === 'search') label = `"${src.pattern}"`;
          else if (src.type === 'glob') label = src.pattern;
          else label = src.type;
          return (
            <button
              key={i}
              onClick={() => filePath && ctx.onOpenFile(filePath)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-all',
                filePath
                  ? 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] cursor-pointer'
                  : 'bg-[var(--surface-tertiary)] text-[var(--text-tertiary)]'
              )}
            >
              <FileText size={9} className="opacity-40" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  // Question
  if (msg.type === 'question') {
    return (
      <div key={msg.id} className="py-2 pl-9 animate-fade-in">
        <div className="px-4 py-3 rounded-xl bg-[var(--accent-muted)] text-[15px] text-[var(--text-primary)] italic">{msg.text}</div>
      </div>
    );
  }

  // Hint
  if (msg.type === 'hint') return <div key={msg.id} className="py-0.5 pl-9"><span className="text-[10px] text-[var(--text-tertiary)] font-mono">{msg.text}</span></div>;

  // Error
  if (msg.type === 'error') {
    return (
      <div key={msg.id} className="py-2 animate-fade-in">
        <div className="px-4 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] text-[13px] text-[var(--danger)]">{msg.text}</div>
      </div>
    );
  }

  // Tool (inline row)
  if (msg.type === 'tool') {
    return <ToolRow key={msg.id} msg={msg} />;
  }

  // System
  if (msg.type === 'system') {
    return <div key={msg.id} className="py-1 text-center"><span className="text-[10px] text-[var(--text-tertiary)] font-mono">{msg.text}</span></div>;
  }

  return <div key={msg.id} className="py-1 pl-9"><span className="text-[13px] text-[var(--text-secondary)]">{msg.text}</span></div>;
}

// ── Action button ──────────────────────────────────────────────────────
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
