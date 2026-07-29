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

  // ====== Alarm IPC ======
  getAllAlarms: () => ipcRenderer.invoke('get-all-alarms'),
  getAlarm: (id) => ipcRenderer.invoke('get-alarm', id),
  saveAlarm: (data) => ipcRenderer.invoke('save-alarm', data),
  deleteAlarm: (id) => ipcRenderer.invoke('delete-alarm', id),
  openAlarmEditor: (id) => ipcRenderer.invoke('open-alarm-editor', id),
  toggleAlarm: (id) => ipcRenderer.invoke('toggle-alarm', id),
  onAlarmStateUpdate: (callback) => {
    ipcRenderer.on('alarm-state-update', (_event, state) => callback(state));
  },
  onAlarmRinging: (callback) => {
    ipcRenderer.on('alarm-ringing', (_event, data) => callback(data));
  },
  onAlarmStop: (callback) => {
    ipcRenderer.on('alarm-stop', (_event, data) => callback(data));
  },
  onAlarmsUpdated: (callback) => {
    ipcRenderer.on('alarms-updated', (_event, alarms) => callback(alarms));
  },
  dismissAlarm: (id) => ipcRenderer.invoke('dismiss-alarm', id),
  getActiveAlarmIds: () => ipcRenderer.invoke('get-active-alarm-ids'),
  onActiveAlarmIdsChanged: (callback) => {
    ipcRenderer.on('active-alarm-ids-changed', (_event, ids) => callback(ids));
  },
  // [v1.0.5] 删除所有保存的数据
  deleteAllData: () => ipcRenderer.invoke('delete-all-data'),
  // [v1.0.5] 欢迎界面完成
  finishWelcome: () => ipcRenderer.invoke('finish-welcome'),
});
