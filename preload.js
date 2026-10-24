const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  // Config & state methods
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  setHotkey: (hotkey) => ipcRenderer.invoke('set-hotkey', hotkey),
  resetPosition: () => ipcRenderer.invoke('reset-position'),
  deactivate: () => ipcRenderer.send('deactivate-overlay'),
  reloadWebview: () => ipcRenderer.send('reload-webview'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('set-autolaunch', enable),

  // Events from main process
  onOverlayStateChanged: (callback) => {
    ipcRenderer.on('overlay-state-changed', (_, state) => callback(state));
  },
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', (_, settings) => callback(settings));
  },
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', () => callback());
  },
  onReloadWebview: (callback) => {
    ipcRenderer.on('reload-webview', () => callback());
  },
});
