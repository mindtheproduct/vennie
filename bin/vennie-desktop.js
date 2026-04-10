#!/usr/bin/env node

'use strict';

// Desktop launcher — starts the Electron app.
// Usage: vennie-desktop, or vennie --desktop

const { execSync, spawn } = require('child_process');
const path = require('path');

const electronPath = (() => {
  try {
    return require('electron');
  } catch {
    console.error('Electron not installed. Run: npm install');
    process.exit(1);
  }
})();

const mainPath = path.join(__dirname, '..', 'src', 'desktop', 'main', 'index.js');

const child = spawn(electronPath, [mainPath], {
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('close', (code) => {
  process.exit(code || 0);
});
