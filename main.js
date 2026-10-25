const { app, BrowserWindow, globalShortcut, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let overlayWindow = null;
let tray = null;
let isActive = true; // Overlay interactive status (capturing mouse or not)

const DEFAULT_CONFIG = {
  hotkey: 'F2',
  hideMode: 'hide', // 'hide' (fully hidden) or 'clickthrough' (visible HUD, clicks pass through)
  opacity: 85,
  url: 'https://dbdfog.ru/survivor-builds',
  width: 1280,
  height: 720,
  x: null,
  y: null,
  showNotifications: true,
  autoLaunch: false,
};

function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  const userPath = getUserConfigPath();
  const localPath = path.join(__dirname, 'config.json');

  let loaded = {};
  if (fs.existsSync(userPath)) {
    try {
      loaded = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
    } catch (e) {
      console.warn('Failed to load user config.json:', e.message);
    }
  } else if (fs.existsSync(localPath)) {
    try {
      loaded = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    } catch (e) {
      console.warn('Failed to load local config.json:', e.message);
    }
  }

  return { ...DEFAULT_CONFIG, ...loaded };
}

let config = loadConfig();

function saveConfig(updates = {}) {
  config = { ...config, ...updates };
  const userPath = getUserConfigPath();
  try {
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.writeFileSync(userPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to write user config:', e.message);
  }

  try {
    const localPath = path.join(__dirname, 'config.json');
    fs.writeFileSync(localPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (_) {
    // Ignore if running from packaged read-only path
  }
}

function setAutoLaunch(enable) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      path: process.execPath,
    });
  } catch (e) {
    console.warn('Failed to set auto-launch:', e.message);
  }
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workAreaSize;

  const initialWidth = config.width || DEFAULT_CONFIG.width;
  const initialHeight = config.height || DEFAULT_CONFIG.height;
  const initialX = typeof config.x === 'number' ? config.x : Math.round((screenWidth - initialWidth) / 2);
  const initialY = typeof config.y === 'number' ? config.y : 20;

  overlayWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  // Remove X-Frame-Options and CSP headers so external sites load in iframe
  overlayWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['X-Frame-Options'];
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['content-security-policy'];
    callback({ responseHeaders });
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setOpacity((config.opacity || 85) / 100);

  // Initial state: active and capturing mouse immediately
  isActive = true;
  overlayWindow.setIgnoreMouseEvents(false);

  overlayWindow.loadFile('overlay.html');

  // Track window movements and resizes to persist position and dimensions
  let boundsTimer = null;
  const onBoundsChanged = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      const bounds = overlayWindow.getBounds();
      saveConfig({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    }, 400);
  };

  overlayWindow.on('moved', onBoundsChanged);
  overlayWindow.on('resized', onBoundsChanged);

  // Prevent closing when user clicks native close, just deactivate
  overlayWindow.on('close', (e) => {
    e.preventDefault();
    deactivateOverlay();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function activateOverlay() {
  if (!overlayWindow) return;

  isActive = true;
  overlayWindow.show();
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.focus();

  overlayWindow.webContents.send('overlay-state-changed', {
    isActive: true,
    hideMode: config.hideMode,
    hotkey: config.hotkey,
  });

  updateTrayMenu();
}

function simulateClickForGameFocus() {
  // After deactivating the overlay, simulate a mouse click so the game
  // window underneath regains focus without needing an extra manual click.
  // We use a short delay to ensure the overlay has released mouse events first.
  setTimeout(() => {
    try {
      const { execSync } = require('child_process');
      // Use PowerShell to simulate a mouse click at the current cursor position
      execSync(`powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class ClickHelper{[DllImport(\\"user32.dll\\")]public static extern void mouse_event(uint dwFlags,int dx,int dy,uint dwData,int dwExtraInfo);public static void Click(){mouse_event(0x0002,0,0,0,0);mouse_event(0x0004,0,0,0,0);}}'; [ClickHelper]::Click()"`, { windowsHide: true });
    } catch (_) {
      // Silently fail on non-Windows or if click simulation fails
    }
  }, 100);
}

function deactivateOverlay() {
  if (!overlayWindow) return;

  isActive = false;
  overlayWindow.webContents.send('overlay-state-changed', {
    isActive: false,
    hideMode: config.hideMode,
    hotkey: config.hotkey,
  });

  if (config.hideMode === 'clickthrough') {
    // HUD mode: remains visible, but all mouse clicks pass through into the game
    overlayWindow.show();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    // Hide mode: completely hidden from screen
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
  }

  // Simulate a click so the game regains input focus immediately
  simulateClickForGameFocus();

  updateTrayMenu();
}

function toggleOverlay() {
  if (isActive) {
    deactivateOverlay();
  } else {
    activateOverlay();
  }
}

function registerTriggerShortcut(hotkey) {
  globalShortcut.unregisterAll();

  if (!hotkey) return false;

  try {
    const registered = globalShortcut.register(hotkey, () => {
      toggleOverlay();
    });

    if (!registered) {
      console.warn(`Failed to register trigger hotkey: ${hotkey}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error during globalShortcut.register:', err);
    return false;
  }
}

function resetPosition() {
  if (!overlayWindow) return;

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const width = DEFAULT_CONFIG.width;
  const height = DEFAULT_CONFIG.height;
  const x = Math.round((screenWidth - width) / 2);
  const y = 20;

  overlayWindow.setBounds({ x, y, width, height });
  saveConfig({ x, y, width, height });

  if (overlayWindow.webContents) {
    overlayWindow.webContents.send('settings-updated', config);
  }

  return { x, y, width, height };
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createDefaultTrayIcon();
    }
  } catch {
    trayIcon = createDefaultTrayIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Game Overlay');
  updateTrayMenu();

  tray.on('click', () => {
    toggleOverlay();
  });
}

function createDefaultTrayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - 8) ** 2 + (y - 8) ** 2);
      if (dist < 7) {
        canvas[idx] = 100;     // R
        canvas[idx + 1] = 140; // G
        canvas[idx + 2] = 255; // B
        canvas[idx + 3] = 255; // A
      } else {
        canvas[idx + 3] = 0;   // Transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu() {
  if (!tray) return;

  const triggerLabel = isActive
    ? `👁️ Скрыть оверлей (${config.hotkey})`
    : `👁️ Открыть оверлей (${config.hotkey})`;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `🎮 Game Overlay v${app.getVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: triggerLabel,
      click: toggleOverlay,
      accelerator: config.hotkey,
    },
    {
      label: '⚙️ Настройки...',
      click: () => {
        activateOverlay();
        if (overlayWindow) {
          overlayWindow.webContents.send('open-settings');
        }
      },
    },
    {
      label: '🔄 Перезагрузить страницу',
      click: () => {
        if (overlayWindow) {
          overlayWindow.webContents.send('reload-webview');
        }
      },
    },
    {
      label: '📍 Сбросить размер и положение',
      click: resetPosition,
    },
    { type: 'separator' },
    {
      label: '❌ Выход',
      click: () => {
        if (overlayWindow) {
          overlayWindow.removeAllListeners('close');
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return {
    ...config,
    isActive,
  };
});

ipcMain.handle('save-settings', (event, updates) => {
  saveConfig(updates);

  if (updates.opacity !== undefined && overlayWindow) {
    overlayWindow.setOpacity(updates.opacity / 100);
  }

  if (updates.width !== undefined && updates.height !== undefined && overlayWindow) {
    const currentBounds = overlayWindow.getBounds();
    overlayWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: Number(updates.width),
      height: Number(updates.height),
    });
  }

  if (updates.autoLaunch !== undefined) {
    setAutoLaunch(updates.autoLaunch);
  }

  if (updates.hideMode !== undefined && !isActive && overlayWindow) {
    if (updates.hideMode === 'clickthrough') {
      overlayWindow.show();
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.hide();
    }
  }

  updateTrayMenu();
  return config;
});

ipcMain.handle('set-hotkey', (event, newHotkey) => {
  const previousHotkey = config.hotkey;
  const success = registerTriggerShortcut(newHotkey);

  if (success) {
    saveConfig({ hotkey: newHotkey });
    updateTrayMenu();
    return { success: true, hotkey: newHotkey };
  } else {
    // Re-register previous hotkey if new one failed
    if (previousHotkey) {
      registerTriggerShortcut(previousHotkey);
    }
    return {
      success: false,
      hotkey: previousHotkey,
      error: `Не удалось назначить горячую клавишу ${newHotkey}. Возможно, она уже используется Windows или другой программой.`,
    };
  }
});

ipcMain.handle('reset-position', () => {
  const bounds = resetPosition();
  return bounds;
});

ipcMain.handle('set-autolaunch', (event, enable) => {
  setAutoLaunch(enable);
  saveConfig({ autoLaunch: !!enable });
  return config.autoLaunch;
});

ipcMain.on('deactivate-overlay', () => {
  deactivateOverlay();
});

ipcMain.on('reload-webview', () => {
  if (overlayWindow) {
    overlayWindow.webContents.send('reload-webview');
  }
});

// App Lifecycle
app.whenReady().then(() => {
  createOverlayWindow();
  registerTriggerShortcut(config.hotkey);
  createTray();
  setAutoLaunch(config.autoLaunch);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

// Single instance prevention
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    activateOverlay();
  });
}
