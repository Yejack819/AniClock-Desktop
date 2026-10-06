const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  moveWindow: (pos) => ipcRenderer.invoke('move-window', pos),
  setLayerMode: (mode) => ipcRenderer.invoke('set-layer-mode', mode),
  resizeWindow: (size) => ipcRenderer.invoke('resize-window', size),
  setAutoStart: (enabled, silent) => ipcRenderer.invoke('set-auto-start', enabled, silent),
  setPassthrough: (enabled) => ipcRenderer.invoke('set-passthrough', enabled),
  notifyClockUpdate: (config) => ipcRenderer.invoke('notify-clock-update', config),
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config-updated', (_event, config) => callback(config));
  },
  openSettings: () => ipcRenderer.invoke('open-settings'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // ====== [v1.0.5.5] 无边框窗口标题栏（设置窗口） ======
  windowControl: (action) => ipcRenderer.invoke('window-control', action),
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (_event, maximized) => callback(maximized));
  },

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

  // ====== [v1.0.5.7] 倒计时 ======
  // 与闹钟完全分开的一套 IPC（数据在 countdowns.json，引擎独立）。
  // 列表只推「变更」；剩余时间由各窗口本地倒扣，不用每秒收广播。
  countdownList: () => ipcRenderer.invoke('countdown-list'),
  countdownGet: (id) => ipcRenderer.invoke('countdown-get', id),
  countdownCreate: (payload) => ipcRenderer.invoke('countdown-create', payload),
  countdownUpdate: (payload) => ipcRenderer.invoke('countdown-update', payload),
  countdownDelete: (id) => ipcRenderer.invoke('countdown-delete', id),
  countdownPause: (id) => ipcRenderer.invoke('countdown-pause', id),
  countdownResume: (id) => ipcRenderer.invoke('countdown-resume', id),
  countdownRestart: (id) => ipcRenderer.invoke('countdown-restart', id),
  openCountdownEditor: (id) => ipcRenderer.invoke('countdown-open-editor', id),
  onCountdownState: (callback) => {
    ipcRenderer.on('countdown-state', (_event, state) => callback(state));
  },
  // [v1.0.5] 删除所有保存的数据
  deleteAllData: () => ipcRenderer.invoke('delete-all-data'),
  // [v1.0.5.3] 偏好设置导入 / 导出
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  // [v1.0.5.4] 关于界面
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // [v1.0.5] 欢迎界面完成
  finishWelcome: () => ipcRenderer.invoke('finish-welcome'),
  // [v1.0.5] 关灯
  setLightsOff: (enabled) => ipcRenderer.invoke('set-lights-off', enabled),
  restartLightsOff: () => ipcRenderer.invoke('restart-lights-off'),
  // [v1.0.6] 关灯锁定
  getLightsOffLock: () => ipcRenderer.invoke('get-lights-off-lock'),
  setLightsOffLock: (locked) => ipcRenderer.invoke('set-lights-off-lock', locked),
  onLightsOffStateChanged: (callback) => {
    ipcRenderer.on('lights-off-state-changed', (_event, enabled) => callback(enabled));
  },
  onLightsOffLockChanged: (callback) => {
    ipcRenderer.on('lights-off-lock-changed', (_event, locked) => callback(locked));
  },
  onLightsOffBgUpdate: (callback) => {
    ipcRenderer.on('lights-off-bg-update', (_event, color) => callback(color));
  },

  // ====== [v1.0.5.6] 局域网只读镜像 ======
  // 手机能看到的只是时间显示，没有任何写接口；开关/换码都在主进程完成
  lanMirrorStatus: () => ipcRenderer.invoke('lan-mirror-status'),
  setLanMirror: (patch) => ipcRenderer.invoke('lan-mirror-set', patch),
  newLanMirrorToken: () => ipcRenderer.invoke('lan-mirror-new-token'),
  openLanMirrorUrl: (url) => ipcRenderer.invoke('lan-mirror-open', url),

  // ====== [v1.0.5.5] 插件 ======
  // 渲染进程只拿到「要跑什么」和「能改什么」，文件读写、清单校验全在主进程
  getPluginBundle: () => ipcRenderer.invoke('plugin-bundle'),
  // [v1.0.5.7] 插件沙箱运行时代码（宿主自己的可信文件，供 sandbox iframe 使用）
  getPluginSandboxSource: () => ipcRenderer.invoke('plugin-sandbox-source'),
  getPluginList: () => ipcRenderer.invoke('plugin-list'),
  getPluginSettingsView: (id) => ipcRenderer.invoke('plugin-settings-view', id),
  importPlugin: (kind) => ipcRenderer.invoke('plugin-import', kind),
  commitPlugin: (stageId, force) => ipcRenderer.invoke('plugin-commit', stageId, force),
  cancelPluginImport: (stageId) => ipcRenderer.invoke('plugin-cancel', stageId),
  setPluginEnabled: (id, enabled) => ipcRenderer.invoke('plugin-set-enabled', id, enabled),
  removePlugin: (id) => ipcRenderer.invoke('plugin-remove', id),
  reloadPlugin: (id) => ipcRenderer.invoke('plugin-reload', id),
  setPluginSetting: (id, key, value) => ipcRenderer.invoke('plugin-set-setting', id, key, value),
  // [v1.0.5.7] 设置界面专用：可编辑「已禁用」插件的设置项（禁用插件不在 bundle 里，
  // 走上面那条会撞归属校验；这条只认设置窗口自己的 webContents）
  setPluginSettingUi: (id, key, value) => ipcRenderer.invoke('plugin-set-setting-ui', id, key, value),
  reportPluginError: (id, message) => ipcRenderer.invoke('plugin-error', id, message),
  pluginDataGet: (id, key) => ipcRenderer.invoke('plugin-data-get', id, key),
  pluginDataSet: (id, key, value) => ipcRenderer.invoke('plugin-data-set', id, key, value),
  openPluginFolder: () => ipcRenderer.invoke('plugin-open-folder'),
  // [v1.0.5.5] 安全模式：停用全部插件（托盘菜单与设置界面共用），改完需要重启才生效
  setPluginSafeMode: (on) => ipcRenderer.invoke('plugin-safe-mode', on),
  getPluginRuntimeState: () => ipcRenderer.invoke('plugin-runtime-state'),
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', () => callback());
  },
});
