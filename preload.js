const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  moveWindow: (pos) => ipcRenderer.invoke('move-window', pos),
  setLayerMode: (mode) => ipcRenderer.invoke('set-layer-mode', mode),
  resizeWindow: (size) => ipcRenderer.invoke('resize-window', size),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  setPassthrough: (enabled) => ipcRenderer.invoke('set-passthrough', enabled),
  notifyClockUpdate: (config) => ipcRenderer.invoke('notify-clock-update', config),
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config-updated', (_event, config) => callback(config));
  },
  openSettings: () => ipcRenderer.invoke('open-settings'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
});
