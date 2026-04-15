import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Send, Loader2, Copy, Check, ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { cn } from '../lib/utils.js';
import MarkdownRenderer from '../components/MarkdownRenderer.jsx';

const PERSONA_COLORS = ['#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#60A5FA'];

export default function SplitPersonaView({ appData }) {
  const [personas, setPersonas] = useState([]);
  const [selected, setSelected] = useState([]);
  const [question, setQuestion] = useState('');
  const [responses, setResponses] = useState({}); // personaId -> { text, status }
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);
  const currentPersonaIdx = useRef(0);
  const streamRef = useRef('');
  const unsubRef = useRef(null);

  useEffect(() => {
    window.vennie.listPersonas().then(data => {
      if (Array.isArray(data)) setPersonas(data);
    });
  }, []);

  function togglePersona(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  const askAll = useCallback(async () => {
    if (!question.trim() || selected.length === 0 || generating) return;
    setGenerating(true);
    setResponses({});

    // Initialize all panels
    const initial = {};
    selected.forEach(id => { initial[id] = { text: '', status: 'waiting' }; });
    setResponses(initial);

    // Process personas sequentially
    for (let i = 0; i < selected.length; i++) {
      const personaId = selected[i];
      currentPersonaIdx.current = i;
      streamRef.current = '';

      // Update status to generating
      setResponses(prev => ({ ...prev, [personaId]: { text: '', status: 'generating' } }));

      // Set persona
      await window.vennie.setPersona(personaId);

      // Send question and collect response
      await new Promise((resolve) => {
        const unsub = window.vennie.onEvent((event) => {
          if (event.type === 'text_delta') {
            streamRef.current += event.text;
            setResponses(prev => ({
              ...prev,
              [personaId]: { text: streamRef.current, status: 'generating' },
            }));
          }
          if (event.type === 'done') {
            setResponses(prev => ({
              ...prev,
              [personaId]: { text: streamRef.current || event.responseText || '', status: 'done' },
            }));
            unsub();
            resolve();
          }
          if (event.type === 'error') {
            setResponses(prev => ({
              ...prev,
              [personaId]: { text: streamRef.current || event.message || 'Error generating response.', status: 'error' },
            }));
            unsub();
            resolve();
          }
        });
        unsubRef.current = unsub;
        window.vennie.send(question.trim());
      });
    }

    // Reset persona
    await window.vennie.setPersona('off');
    setGenerating(false);
  }, [question, selected, generating]);

  function handleCopy(personaId) {
    const text = responses[personaId]?.text;
    if (text) navigator.clipboard.writeText(text);
    setCopied(personaId);
    setTimeout(() => setCopied(null), 2000);
  }

  function getPersonaColor(id) {
    const idx = selected.indexOf(id);
    return PERSONA_COLORS[idx % PERSONA_COLORS.length];
  }

  function getPersonaName(id) {
    return personas.find(p => p.id === id)?.name || id;
  }

  const gridCols = selected.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2';
  const hasResponses = Object.values(responses).some(r => r.text);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-primary)]">
      {/* Top bar — question input */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight mb-1">Split View</h1>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">Ask a question, get perspectives from multiple personas simultaneously.</p>
        </motion.div>

        {/* Persona selector */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {personas.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">No personas installed. Visit the Marketplace to add some.</p>
          ) : (
            <>
              {personas.map(p => {
                const isSelected = selected.includes(p.id);
                const color = isSelected ? getPersonaColor(p.id) : 'var(--text-tertiary)';
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePersona(p.id)}
                    disabled={generating}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                      isSelected
                        ? 'text-white'
                        : 'bg-[var(--surface-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                      generating && 'opacity-50'
                    )}
                    style={isSelected ? { background: color } : {}}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: isSelected ? 'white' : color }} />
                    {p.name}
                  </button>
                );
              })}
              {selected.length > 0 && (
                <span className="text-[10px] text-[var(--text-tertiary)] ml-1">{selected.length}/4 selected</span>
              )}
            </>
          )}
        </div>

        {/* Question input */}
        <div className="input-floating flex items-center gap-2 px-4 py-2.5">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && askAll()}
            placeholder="Ask all personas..."
            disabled={generating}
            className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <button
            onClick={askAll}
            disabled={!question.trim() || selected.length === 0 || generating}
            className="p-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-30 hover:bg-[var(--accent-hover)] transition-all"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Response grid */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {!hasResponses && !generating ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Users size={32} className="text-[var(--text-tertiary)] mx-auto mb-3 opacity-30" />
              <p className="text-sm text-[var(--text-tertiary)]">
                {selected.length === 0 ? 'Select 2-4 personas above to get started.' : 'Type a question and press Enter.'}
              </p>
            </div>
          </div>
        ) : (
          <div className={cn('grid gap-4', gridCols)}>
            {selected.map(personaId => {
              const resp = responses[personaId] || { text: '', status: 'waiting' };
              const color = getPersonaColor(personaId);
              return (
                <motion.div
                  key={personaId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="surface-card flex flex-col overflow-hidden"
                >
                  {/* Panel header */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{getPersonaName(personaId)}</span>
                    <div className="flex-1" />
                    {resp.status === 'generating' && (
                      <Loader2 size={12} className="animate-spin text-[var(--text-tertiary)]" />
                    )}
                    {resp.status === 'waiting' && (
                      <span className="text-[10px] text-[var(--text-tertiary)]">waiting...</span>
                    )}
                  </div>

                  {/* Response content */}
                  <div className="flex-1 p-4 overflow-auto text-sm max-h-[400px]">
                    {resp.text ? (
                      <MarkdownRenderer text={resp.text} />
                    ) : resp.status === 'generating' ? (
                      <div className="space-y-2">
                        <div className="shimmer h-3 rounded w-3/4" />
                        <div className="shimmer h-3 rounded w-1/2" />
                        <div className="shimmer h-3 rounded w-2/3" />
                      </div>
                    ) : null}
                    {resp.status === 'generating' && resp.text && (
                      <div className="w-2 h-4 bg-[var(--accent)] rounded-sm animate-pulse inline-block mt-1" />
                    )}
                  </div>

                  {/* Panel footer */}
                  {resp.status === 'done' && (
                    <div className="flex items-center gap-1 px-3 py-2 border-t border-[var(--border)]">
                      <button
                        onClick={() => handleCopy(personaId)}
                        className="p-1 rounded hover:bg-[var(--surface-tertiary)] transition-colors"
                      >
                        {copied === personaId ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} className="text-[var(--text-tertiary)]" />}
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
