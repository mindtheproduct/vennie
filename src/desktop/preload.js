'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Context Bridge ─────────────────────────────────────────────────────────
// Exposes a safe, structured API to the renderer process.

contextBridge.exposeInMainWorld('vennie', {
  // ── App ─────────────────────────────────────────────────────────────────
  init: () => ipcRenderer.invoke('app:init'),

  // ── Agent ───────────────────────────────────────────────────────────────
  send: (message, attachments) => ipcRenderer.invoke('agent:send', { message, attachments }),
  abort: () => ipcRenderer.invoke('agent:abort'),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  readDroppedFiles: (filePaths) => ipcRenderer.invoke('files:read-drop', { filePaths }),
  onEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.removeListener('agent:event', handler);
  },

  // ── Vault ───────────────────────────────────────────────────────────────
  search: (query, topN) => ipcRenderer.invoke('vault:search', { query, topN }),
  reindex: () => ipcRenderer.invoke('vault:reindex'),
  readFile: (filePath) => ipcRenderer.invoke('vault:read', { filePath }),
  writeFile: (filePath, content) => ipcRenderer.invoke('vault:write', { filePath, content }),
  getTree: () => ipcRenderer.invoke('vault:tree'),
  getPulse: () => ipcRenderer.invoke('vault:pulse'),
  getBrief: () => ipcRenderer.invoke('vault:brief'),
  log: (type, content) => ipcRenderer.invoke('vault:log', { type, content }),

  // ── Skills ──────────────────────────────────────────────────────────────
  listSkills: () => ipcRenderer.invoke('skills:list'),

  // ── Personas ────────────────────────────────────────────────────────────
  listPersonas: () => ipcRenderer.invoke('persona:list'),
  setPersona: (id) => ipcRenderer.invoke('persona:set', { id }),
  getPersonaRegistry: () => ipcRenderer.invoke('persona:registry'),
  installPersona: (id) => ipcRenderer.invoke('persona:install', { id }),
  uninstallPersona: (id) => ipcRenderer.invoke('persona:uninstall', { id }),
  getPersonaDetail: (id) => ipcRenderer.invoke('persona:detail', { id }),

  // ── Settings ────────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setModel: (model) => ipcRenderer.invoke('settings:setModel', { model }),
  toggleThinking: () => ipcRenderer.invoke('settings:toggleThinking'),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', { key }),

  // ── Analysis ────────────────────────────────────────────────────────────
  getPatterns: () => ipcRenderer.invoke('analysis:patterns'),
  getStakeholders: () => ipcRenderer.invoke('analysis:stakeholders'),
  getNetwork: (topic) => ipcRenderer.invoke('analysis:network', { topic }),
  getRadar: () => ipcRenderer.invoke('analysis:radar'),
  getGym: () => ipcRenderer.invoke('analysis:gym'),
  getCareer: () => ipcRenderer.invoke('analysis:career'),

  // ── Git / Time Machine ─────────────────────────────────────────────────
  getGitLog: () => ipcRenderer.invoke('git:log'),
  getGitDiff: (hash) => ipcRenderer.invoke('git:diff', { hash }),

  // ── Voice (streaming) ────────────────────────────────────────────────
  voiceStart: (sampleRate) => ipcRenderer.invoke('voice:start', { sampleRate }),
  voiceChunk: (pcmBase64) => ipcRenderer.invoke('voice:chunk', { pcmBase64 }),
  voiceStop: () => ipcRenderer.invoke('voice:stop'),
  onVoiceResult: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('voice:result', handler);
    return () => ipcRenderer.removeListener('voice:result', handler);
  },

  // ── Notifications ──────────────────────────────────────────────────────
  getNotificationPrefs: () => ipcRenderer.invoke('notifications:getPrefs'),
  setNotificationPrefs: (prefs) => ipcRenderer.invoke('notifications:setPrefs', { prefs }),

  // ── Session ─────────────────────────────────────────────────────────────
  saveSession: () => ipcRenderer.invoke('session:save'),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  loadSession: (messages) => ipcRenderer.invoke('session:load', { messages }),

  // ── Navigation events from main ─────────────────────────────────────────
  onNavigate: (callback) => {
    const handler = (_event, view) => callback(view);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },
  onQuickAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('quick-action', handler);
    return () => ipcRenderer.removeListener('quick-action', handler);
  },
});
