'use strict';

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.config', 'vennie');
const VAULT_PATH_FILE = path.join(CONFIG_DIR, 'vault-path');
const ENV_FILE = path.join(CONFIG_DIR, 'env');
const DEFAULT_VAULT = path.join(os.homedir(), 'Vennie');

// Load env vars (API keys)
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function getVaultPath() {
  if (fs.existsSync(VAULT_PATH_FILE)) {
    const p = fs.readFileSync(VAULT_PATH_FILE, 'utf8').trim();
    if (p && fs.existsSync(p)) return p;
  }
  if (fs.existsSync(DEFAULT_VAULT)) return DEFAULT_VAULT;
  return null;
}

function getVersion() {
  try {
    return require(path.join(__dirname, '..', '..', '..', 'package.json')).version;
  } catch {
    return '1.0.0';
  }
}

// ── Window ─────────────────────────────────────────────────────────────────

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor: '#09090B',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for child_process in preload
    },
    show: false,
  });

  // Open DevTools in dev mode
  if (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools();
  }

  // Graceful show after ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the Vite dev server or built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  // Open links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────

function createTray() {
  // Simple 16x16 tray icon (will be replaced with proper icon)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Vennie');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Vennie', click: () => mainWindow ? mainWindow.show() : createWindow() },
    { type: 'separator' },
    { label: 'Quick Log...', click: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.webContents.send('quick-action', 'log');
      }
    }},
    { label: 'Morning Brief', click: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.webContents.send('navigate', 'dashboard');
      }
    }},
    { type: 'separator' },
    { label: 'Quit Vennie', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

// ── IPC Setup ──────────────────────────────────────────────────────────────

const { setupIPC } = require('./ipc.js');

// ── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const vaultPath = getVaultPath();
  const version = getVersion();

  try {
    await setupIPC(vaultPath, version);
  } catch (err) {
    console.error('IPC setup warning:', err.message);
    // Continue anyway — app can work without MCP servers
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running (dock icon stays)
  // On other platforms, quit when all windows close
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Shutdown MCP servers gracefully
  try {
    const { shutdownMCP } = require('./ipc.js');
    shutdownMCP();
  } catch {}
});
