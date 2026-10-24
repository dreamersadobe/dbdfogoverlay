const { app, BrowserWindow, globalShortcut, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let overlayWindow = null;
let tray = null;
let isClickThrough = true;  // Start in click-through mode (transparent to clicks)
let isVisible = true;
let overlayOpacity = 0.85;

// Load user config or use defaults
function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  let userConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.warn('Failed to load config.json, using defaults:', e.message);
  }
  return userConfig;
}

const userConfig = loadConfig();

// Settings
const CONFIG = {
  url: userConfig.url || 'https://dbdfog.ru',
  toggleVisibilityKey: 'Alt+F1',       // Show/Hide overlay
  toggleClickThroughKey: 'Alt+F2',     // Toggle click-through mode
  increaseOpacityKey: 'Alt+F3',        // Increase opacity
  decreaseOpacityKey: 'Alt+F4',        // Decrease opacity — NOTE: we override Alt+F4 behavior
  resetPositionKey: 'Alt+F5',          // Reset position and size
  minOpacity: 0.15,
  maxOpacity: 1.0,
  opacityStep: 0.1,
  defaultWidth: userConfig.width || 500,
  defaultHeight: userConfig.height || 700,
};

function createOverlayWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: CONFIG.defaultWidth,
    height: CONFIG.defaultHeight,
    x: screenWidth - CONFIG.defaultWidth - 20,
    y: 20,
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

  // Remove X-Frame-Options and CSP headers so dbdfog.ru loads in webview
  overlayWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    // Remove headers that block embedding
    delete responseHeaders['X-Frame-Options'];
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['content-security-policy'];
    callback({ responseHeaders });
  });

  // Set always on top with the highest level for game overlay
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Enable click-through by default
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.setOpacity(overlayOpacity);

  // Load our custom overlay HTML (which embeds dbdfog.ru in an iframe)
  overlayWindow.loadFile('overlay.html');

  // Prevent the window from being closed accidentally
  overlayWindow.on('close', (e) => {
    e.preventDefault();
    overlayWindow.hide();
    isVisible = false;
    updateTrayMenu();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function toggleVisibility() {
  if (!overlayWindow) return;

  if (isVisible) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  isVisible = !isVisible;
  updateTrayMenu();
}

function toggleClickThrough() {
  if (!overlayWindow) return;

  isClickThrough = !isClickThrough;

  if (isClickThrough) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.webContents.send('click-through-changed', true);
  } else {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.webContents.send('click-through-changed', false);
    overlayWindow.focus();
  }
  updateTrayMenu();
}

function changeOpacity(delta) {
  if (!overlayWindow) return;

  overlayOpacity = Math.min(CONFIG.maxOpacity, Math.max(CONFIG.minOpacity, overlayOpacity + delta));
  overlayWindow.setOpacity(overlayOpacity);
  overlayWindow.webContents.send('opacity-changed', Math.round(overlayOpacity * 100));
}

function resetPosition() {
  if (!overlayWindow) return;

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow.setBounds({
    x: screenWidth - CONFIG.defaultWidth - 20,
    y: 20,
    width: CONFIG.defaultWidth,
    height: CONFIG.defaultHeight,
  });
}

function registerShortcuts() {
  globalShortcut.register(CONFIG.toggleVisibilityKey, toggleVisibility);
  globalShortcut.register(CONFIG.toggleClickThroughKey, toggleClickThrough);
  globalShortcut.register(CONFIG.increaseOpacityKey, () => changeOpacity(CONFIG.opacityStep));
  // Use Ctrl+Alt+F4 instead to avoid conflicts with system Alt+F4
  globalShortcut.register('Ctrl+Alt+F4', () => changeOpacity(-CONFIG.opacityStep));
  globalShortcut.register(CONFIG.resetPositionKey, () => resetPosition());
}

function createTray() {
  // Create a simple tray icon
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
  tray.setToolTip('DBD Fog Overlay');
  updateTrayMenu();

  tray.on('click', () => {
    toggleVisibility();
  });
}

function createDefaultTrayIcon() {
  // Create a simple 16x16 icon programmatically
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Create a red/orange "fog" themed icon
      const dist = Math.sqrt((x - 8) ** 2 + (y - 8) ** 2);
      if (dist < 7) {
        canvas[idx] = 220;     // R
        canvas[idx + 1] = 80;  // G
        canvas[idx + 2] = 40;  // B
        canvas[idx + 3] = 255; // A
      } else {
        canvas[idx + 3] = 0; // Transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `📺 DBD Fog Overlay v${require('./package.json').version}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isVisible ? '👁️ Hide Overlay' : '👁️ Show Overlay',
      click: toggleVisibility,
      accelerator: CONFIG.toggleVisibilityKey,
    },
    {
      label: isClickThrough ? '🔓 Enable Mouse Input' : '🔒 Disable Mouse Input (Click-Through)',
      click: toggleClickThrough,
      accelerator: CONFIG.toggleClickThroughKey,
    },
    { type: 'separator' },
    {
      label: `Opacity: ${Math.round(overlayOpacity * 100)}%`,
      enabled: false,
    },
    {
      label: '➕ Increase Opacity',
      click: () => changeOpacity(CONFIG.opacityStep),
      accelerator: CONFIG.increaseOpacityKey,
    },
    {
      label: '➖ Decrease Opacity',
      click: () => changeOpacity(-CONFIG.opacityStep),
      accelerator: 'Ctrl+Alt+F4',
    },
    { type: 'separator' },
    {
      label: '📍 Reset Position',
      click: resetPosition,
      accelerator: CONFIG.resetPositionKey,
    },
    {
      label: '🔄 Reload Website',
      click: () => {
        if (overlayWindow) {
          overlayWindow.webContents.send('reload-webview');
        }
      },
    },
    { type: 'separator' },
    {
      label: '❌ Quit',
      click: () => {
        overlayWindow.removeAllListeners('close');
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// IPC handlers
ipcMain.on('drag-start', (event, { mouseX, mouseY }) => {
  // Handle window dragging from the title bar
  if (overlayWindow) {
    const [winX, winY] = overlayWindow.getPosition();
    overlayWindow.webContents.send('drag-offset', {
      offsetX: mouseX - winX,
      offsetY: mouseY - winY,
    });
  }
});

ipcMain.on('move-window', (event, { x, y }) => {
  if (overlayWindow) {
    overlayWindow.setPosition(Math.round(x), Math.round(y));
  }
});

ipcMain.on('request-state', () => {
  if (overlayWindow) {
    overlayWindow.webContents.send('initial-state', {
      isClickThrough,
      opacity: Math.round(overlayOpacity * 100),
      url: CONFIG.url,
    });
  }
});

// App lifecycle
app.whenReady().then(() => {
  createOverlayWindow();
  registerShortcuts();
  createTray();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Don't quit when windows are closed — keep running in tray
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlayWindow) {
      if (!isVisible) {
        overlayWindow.show();
        isVisible = true;
      }
      overlayWindow.focus();
    }
  });
}
