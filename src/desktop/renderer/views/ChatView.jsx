import React, { useState, useEffect, useCallback, useRef } from 'react';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

// ── Spinner frames ─────────────────────────────────────────────────────────
const FRAMES = ['\u2727', '\u2729', '\u2726', '\u2728'];

export default function ChatView({ appData }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [spinFrame, setSpinFrame] = useState(0);
  const [suggestions, setSuggestions] = useState(appData?.welcomeData?.suggestions || []);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const streamingRef = useRef('');
  const e = React.createElement;

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Spinner animation
  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => setSpinFrame(f => (f + 1) % FRAMES.length), 200);
    return () => clearInterval(interval);
  }, [isThinking]);

  // Listen for agent events
  useEffect(() => {
    const unsub = window.vennie.onEvent((event) => {
      switch (event.type) {
        case 'text_delta':
          streamingRef.current += event.text;
          setStreaming(streamingRef.current);
          setIsThinking(false);
          break;
        case 'thinking_delta':
          setIsThinking(false);
          break;
        case 'tool_start': {
          const summaries = {
            Read: () => `Reading ${(event.input?.file_path || '').split('/').pop()}`,
            Write: () => `Writing ${(event.input?.file_path || '').split('/').pop()}`,
            Edit: () => `Editing ${(event.input?.file_path || '').split('/').pop()}`,
            Bash: () => `Running: ${(event.input?.command || '').slice(0, 50)}`,
            Glob: () => `Searching for ${event.input?.pattern}`,
            Grep: () => `Searching for "${(event.input?.pattern || '').slice(0, 30)}"`,
          };
          const summary = (summaries[event.name] || (() => event.name))();
          setMessages(prev => [...prev, { id: Date.now(), type: 'tool', text: summary }]);
          setIsThinking(true);
          break;
        }
        case 'tool_result':
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: event.success ? 'tool_done' : 'tool_error',
            text: `${event.name} ${event.success ? 'done' : 'failed'}`,
          }]);
          setIsThinking(false);
          break;
        case 'ask_user':
          setMessages(prev => [...prev, { id: Date.now(), type: 'question', text: event.question }]);
          setIsThinking(false);
          break;
        case 'suggestions':
          if (event.items?.length > 0) setSuggestions(event.items);
          break;
        case 'error':
          setMessages(prev => [...prev, { id: Date.now(), type: 'error', text: event.message }]);
          setIsThinking(false);
          break;
        case 'done':
          setIsThinking(false);
          if (streamingRef.current) {
            setMessages(prev => [...prev, {
              id: Date.now(),
              type: 'assistant',
              text: streamingRef.current,
            }]);
            streamingRef.current = '';
            setStreaming('');
          }
          break;
      }
    });
    return () => unsub();
  }, []);

  // Listen for skill triggers from App
  useEffect(() => {
    function handleSkill(ev) {
      handleSubmit(`/${ev.detail}`);
    }
    window.addEventListener('vennie:run-skill', handleSkill);
    return () => window.removeEventListener('vennie:run-skill', handleSkill);
  }, []);

  const handleSubmit = useCallback(async (value) => {
    const text = typeof value === 'string' ? value : input;
    const trimmed = text.trim();
    if (!trimmed) return;

    setInput('');
    setSuggestions([]);
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', text: trimmed }]);
    setIsThinking(true);
    streamingRef.current = '';

    try {
      const result = await window.vennie.send(trimmed);

      // Handle locally-resolved slash commands
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

      // Show intent hint
      if (result?.intent) {
        setMessages(prev => [...prev, { id: Date.now(), type: 'hint', text: result.intent }]);
      }
    } catch (err) {
      setIsThinking(false);
      setMessages(prev => [...prev, { id: Date.now(), type: 'error', text: err.message }]);
    }
  }, [input]);

  function handleKeyDown(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      handleSubmit(input);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return e('div', {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }
  },
    // Message area
    e('div', {
      ref: scrollRef,
      style: {
        flex: 1,
        overflow: 'auto',
        padding: '20px 24px',
      }
    },
      // Welcome state
      messages.length === 0 && e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 16,
        }
      },
        e('div', {
          style: { fontSize: 48, color: 'var(--cyan)', fontWeight: 700 }
        }, 'V'),
        e('div', {
          style: { color: 'var(--text-dim)', fontSize: 14, maxWidth: 400, textAlign: 'center' }
        }, 'Ask me anything about your work, or try a skill.'),
        suggestions.length > 0 && e('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }
        },
          ...suggestions.slice(0, 4).map((s, i) => {
              const label = typeof s === 'string' ? s : s.cmd || s.text || String(s);
              const hint = typeof s === 'object' && s.reason ? s.reason : null;
              return e('button', {
                key: i,
                onClick: () => handleSubmit(label),
                style: {
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }
              },
                e('div', { style: { fontWeight: 600, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 13 } }, label),
                hint && e('div', { style: { color: 'var(--text-dim)', fontSize: 11, marginTop: 2 } }, hint),
              );
            }
          ),
        ),
      ),

      // Messages
      ...messages.map(msg => renderMessage(msg, e)),

      // Streaming text
      streaming && e('div', {
        className: 'fade-in',
        style: { padding: '12px 0' }
      },
        e('div', {
          style: { display: 'flex', alignItems: 'flex-start', gap: 12 }
        },
          e('div', {
            style: { color: 'var(--cyan)', fontWeight: 700, fontSize: 13, paddingTop: 2, flexShrink: 0 }
          }, 'V'),
          e('div', {
            style: { flex: 1, minWidth: 0 }
          },
            e(MarkdownRenderer, { text: streaming })
          ),
        ),
      ),

      // Thinking indicator
      isThinking && e('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 0',
          color: 'var(--text-dim)',
          fontSize: 13,
        }
      },
        e('span', {
          style: { color: 'var(--cyan)', fontSize: 16 }
        }, FRAMES[spinFrame]),
        e('span', null, 'Thinking...'),
      ),
    ),

    // Input area
    e('div', {
      style: {
        borderTop: '1px solid var(--border)',
        padding: '12px 24px 16px',
        background: 'var(--bg-secondary)',
      }
    },
      e('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px',
        }
      },
        e('textarea', {
          ref: inputRef,
          value: input,
          onChange: (ev) => setInput(ev.target.value),
          onKeyDown: handleKeyDown,
          placeholder: 'Message Vennie... (type / for commands)',
          rows: 1,
          style: {
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
            resize: 'none',
            maxHeight: 120,
          }
        }),
        e('button', {
          onClick: () => handleSubmit(input),
          disabled: !input.trim() || isThinking,
          style: {
            background: input.trim() && !isThinking ? 'var(--cyan)' : 'var(--bg-hover)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: input.trim() && !isThinking ? 'var(--bg-primary)' : 'var(--text-dim)',
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: input.trim() && !isThinking ? 'pointer' : 'default',
            transition: 'all 0.15s',
          }
        }, '\u2191'),
      ),
      e('div', {
        style: { display: 'flex', gap: 16, marginTop: 8, paddingLeft: 4 }
      },
        e('span', {
          style: { color: 'var(--text-dim)', fontSize: 11 }
        }, 'Enter to send \u00B7 Shift+Enter for new line \u00B7 \u2318K for commands'),
      ),
    ),
  );
}

// ── Message renderer ───────────────────────────────────────────────────────

function renderMessage(msg, e) {
  const styles = {
    user: {
      wrapper: { justifyContent: 'flex-end', padding: '8px 0' },
      bubble: {
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 16px',
        maxWidth: '70%',
        color: 'var(--text-primary)',
      },
    },
    assistant: {
      wrapper: { padding: '12px 0' },
      inner: { display: 'flex', alignItems: 'flex-start', gap: 12 },
    },
    system: {
      wrapper: { padding: '6px 0' },
      text: { color: 'var(--text-dim)', fontSize: 13, fontFamily: 'var(--font-mono)' },
    },
    tool: {
      wrapper: { padding: '4px 0 4px 28px' },
      text: { color: 'var(--accent-blue)', fontSize: 12, fontFamily: 'var(--font-mono)' },
    },
    tool_done: {
      wrapper: { padding: '4px 0 4px 28px' },
      text: { color: 'var(--green)', fontSize: 12, fontFamily: 'var(--font-mono)' },
    },
    tool_error: {
      wrapper: { padding: '4px 0 4px 28px' },
      text: { color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)' },
    },
    error: {
      wrapper: { padding: '8px 0' },
      text: { color: 'var(--red)', fontWeight: 600 },
    },
    question: {
      wrapper: { padding: '8px 0' },
      text: { color: 'var(--purple)', fontStyle: 'italic' },
    },
    hint: {
      wrapper: { padding: '4px 0' },
      text: { color: 'var(--text-dim)', fontSize: 12 },
    },
  };

  const s = styles[msg.type] || styles.system;

  if (msg.type === 'user') {
    return e('div', { key: msg.id, style: { display: 'flex', ...s.wrapper } },
      e('div', { style: s.bubble }, msg.text)
    );
  }

  if (msg.type === 'assistant') {
    return e('div', { key: msg.id, className: 'fade-in', style: s.wrapper },
      e('div', { style: s.inner },
        e('div', {
          style: { color: 'var(--cyan)', fontWeight: 700, fontSize: 13, paddingTop: 2, flexShrink: 0 }
        }, 'V'),
        e('div', { style: { flex: 1, minWidth: 0 } },
          e(MarkdownRenderer, { text: msg.text })
        ),
      )
    );
  }

  if (msg.type === 'tool') {
    return e('div', { key: msg.id, style: s.wrapper },
      e('span', { style: s.text }, '\u26A1 ', msg.text)
    );
  }

  if (msg.type === 'tool_done' || msg.type === 'tool_error') {
    return e('div', { key: msg.id, style: s.wrapper },
      e('span', { style: s.text }, msg.type === 'tool_done' ? '\u2713 ' : '\u2717 ', msg.text)
    );
  }

  return e('div', { key: msg.id, style: s.wrapper },
    e('span', { style: s.text }, msg.text)
  );
}
