'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Context Bridge ─────────────────────────────────────────────────────────
// Exposes a safe, structured API to the renderer process.

contextBridge.exposeInMainWorld('vennie', {
  // ── App ─────────────────────────────────────────────────────────────────
  init: () => ipcRenderer.invoke('app:init'),

  // ── Agent ───────────────────────────────────────────────────────────────
  send: (message) => ipcRenderer.invoke('agent:send', { message }),
  abort: () => ipcRenderer.invoke('agent:abort'),
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

  // ── Session ─────────────────────────────────────────────────────────────
  saveSession: () => ipcRenderer.invoke('session:save'),
  clearSession: () => ipcRenderer.invoke('session:clear'),

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
