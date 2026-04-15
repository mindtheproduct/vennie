'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floating', {
  capture: (type, content) => ipcRenderer.invoke('floating:capture', { type, content }),
  dismiss: () => ipcRenderer.invoke('floating:dismiss'),
});
