const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  // Send messages to main process
  onDragStart: (mouseX, mouseY) => ipcRenderer.send('drag-start', { mouseX, mouseY }),
  moveWindow: (x, y) => ipcRenderer.send('move-window', { x, y }),
  requestState: () => ipcRenderer.send('request-state'),

  // Receive messages from main process
  onClickThroughChanged: (callback) => ipcRenderer.on('click-through-changed', (_, value) => callback(value)),
  onOpacityChanged: (callback) => ipcRenderer.on('opacity-changed', (_, value) => callback(value)),
  onInitialState: (callback) => ipcRenderer.on('initial-state', (_, state) => callback(state)),
  onReloadWebview: (callback) => ipcRenderer.on('reload-webview', () => callback()),
  onDragOffset: (callback) => ipcRenderer.on('drag-offset', (_, offset) => callback(offset)),
});
