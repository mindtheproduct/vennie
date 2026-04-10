import React, { useState, useEffect } from 'react';

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Fast, capable, cost-effective' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', description: 'Most capable, higher cost' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', description: 'Fastest, cheapest' },
];

export default function SettingsView({ appData }) {
  const [settings, setSettings] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const e = React.createElement;

  useEffect(() => {
    window.vennie.getSettings().then(setSettings);
    window.vennie.listPersonas().then(data => {
      if (Array.isArray(data)) setPersonas(data);
    });
  }, []);

  async function handleModelChange(modelId) {
    const result = await window.vennie.setModel(modelId);
    setSettings(s => ({ ...s, model: result.model }));
  }

  async function handleThinkingToggle() {
    const result = await window.vennie.toggleThinking();
    setSettings(s => ({ ...s, thinking: result.thinking }));
  }

  async function handlePersonaChange(id) {
    const result = await window.vennie.setPersona(id);
    setSettings(s => ({ ...s, persona: result.active }));
  }

  async function handleApiKeySave() {
    if (!apiKeyInput.trim()) return;
    await window.vennie.setApiKey(apiKeyInput.trim());
    setSettings(s => ({ ...s, apiKeySet: true }));
    setApiKeyInput('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) {
    return e('div', {
      style: { padding: 40, color: 'var(--text-dim)' }
    }, 'Loading settings...');
  }

  return e('div', {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '32px 40px',
      maxWidth: 700,
    }
  },
    e('h1', {
      style: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 32 }
    }, 'Settings'),

    // API Key
    section(e, 'API Key',
      e('div', null,
        e('div', {
          style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }
        },
          e('span', {
            style: {
              width: 8, height: 8, borderRadius: '50%',
              background: settings.apiKeySet ? 'var(--green)' : 'var(--red)',
            }
          }),
          e('span', {
            style: { color: 'var(--text-secondary)', fontSize: 13 }
          }, settings.apiKeySet ? 'API key configured' : 'No API key set'),
        ),
        e('div', {
          style: { display: 'flex', gap: 8 }
        },
          e('input', {
            type: 'password',
            value: apiKeyInput,
            onChange: (ev) => setApiKeyInput(ev.target.value),
            placeholder: 'sk-ant-...',
            style: {
              flex: 1,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }
          }),
          e('button', {
            onClick: handleApiKeySave,
            style: {
              background: 'var(--cyan)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--bg-primary)',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }
          }, saved ? '\u2713 Saved' : 'Save'),
        ),
      )
    ),

    // Model
    section(e, 'Model',
      e('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8 }
      },
        ...MODELS.map(m =>
          e('button', {
            key: m.id,
            onClick: () => handleModelChange(m.id),
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: settings.model === m.id ? 'var(--bg-active)' : 'var(--bg-tertiary)',
              border: settings.model === m.id ? '1px solid var(--cyan)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              textAlign: 'left',
            }
          },
            e('div', null,
              e('div', { style: { fontWeight: 600, fontSize: 14 } }, m.label),
              e('div', { style: { color: 'var(--text-dim)', fontSize: 12, marginTop: 2 } }, m.description),
            ),
            settings.model === m.id && e('span', {
              style: { color: 'var(--cyan)', fontSize: 16 }
            }, '\u2713'),
          )
        ),
      )
    ),

    // Extended Thinking
    section(e, 'Extended Thinking',
      e('button', {
        onClick: handleThinkingToggle,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          width: '100%',
        }
      },
        e('div', {
          style: {
            width: 36,
            height: 20,
            borderRadius: 10,
            background: settings.thinking ? 'var(--cyan)' : 'var(--border)',
            position: 'relative',
            transition: 'background 0.2s',
          }
        },
          e('div', {
            style: {
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'white',
              position: 'absolute',
              top: 2,
              left: settings.thinking ? 18 : 2,
              transition: 'left 0.2s',
            }
          }),
        ),
        e('div', null,
          e('div', { style: { fontWeight: 500 } }, settings.thinking ? 'Enabled' : 'Disabled'),
          e('div', { style: { color: 'var(--text-dim)', fontSize: 12 } }, 'Deeper reasoning, higher cost'),
        ),
      )
    ),

    // Persona
    section(e, 'Active Persona',
      e('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8 }
      },
        e('button', {
          onClick: () => handlePersonaChange('off'),
          style: {
            padding: '10px 16px',
            background: !settings.persona ? 'var(--bg-active)' : 'var(--bg-tertiary)',
            border: !settings.persona ? '1px solid var(--cyan)' : '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            textAlign: 'left',
            fontSize: 13,
          }
        }, 'Default Vennie (no persona)'),
        ...personas.map(p =>
          e('button', {
            key: p.id,
            onClick: () => handlePersonaChange(p.id),
            style: {
              padding: '10px 16px',
              background: settings.persona === p.id ? 'var(--bg-active)' : 'var(--bg-tertiary)',
              border: settings.persona === p.id ? '1px solid var(--cyan)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              textAlign: 'left',
            }
          },
            e('div', { style: { fontWeight: 500, fontSize: 13 } }, p.name),
            p.bestFor && e('div', { style: { color: 'var(--text-dim)', fontSize: 12, marginTop: 2 } }, p.bestFor),
          )
        ),
      )
    ),

    // Session cost
    section(e, 'Session Cost',
      e('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
        }
      },
        e('div', null,
          e('div', { style: { color: 'var(--text-dim)', fontSize: 11 } }, 'Input'),
          e('div', { style: { fontWeight: 600 } }, (settings.cost?.input || 0).toLocaleString()),
        ),
        e('div', null,
          e('div', { style: { color: 'var(--text-dim)', fontSize: 11 } }, 'Output'),
          e('div', { style: { fontWeight: 600 } }, (settings.cost?.output || 0).toLocaleString()),
        ),
        e('div', null,
          e('div', { style: { color: 'var(--text-dim)', fontSize: 11 } }, 'Cost'),
          e('div', { style: { fontWeight: 600, color: 'var(--cyan)' } }, `$${(settings.cost?.cost || 0).toFixed(4)}`),
        ),
      )
    ),

    // Vault info
    section(e, 'Vault',
      e('div', {
        style: {
          padding: '12px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-secondary)',
          wordBreak: 'break-all',
        }
      }, settings.vaultPath || 'Not configured'),
    ),
  );
}

function section(e, title, content) {
  return e('div', {
    style: { marginBottom: 28 }
  },
    e('h2', {
      style: {
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }
    }, title),
    content,
  );
}
