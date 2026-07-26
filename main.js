const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// 配置路径：存在用户数据目录（可写，不受 asar 影响）
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

const DEFAULT_CONFIG = {
  color: '#000000', bgColor: 'rgba(255,255,255,0.2)', fontFamily: 'Arial',
  fontSize: 200, animType: 'slide-up', positionPreset: 'center', x: 0, y: 0,
  showSeconds: true, showDate: true, datePosition: 'below', autoColor: false,
  extraTimezones: [], animDuration: 350, staggerDelay: 0, staggerDirection: 'ltr',
  layerMode: 'alwaysOnTop', autoStart: false, language: 'zh',
};

function loadConfig() {
  try {
    if (!fs.existsSync(getConfigPath())) {
      fs.writeFileSync(getConfigPath(), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    console.error('配置文件损坏，回退默认配置:', err.message);
    fs.writeFileSync(getConfigPath(), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(data) {
  try { fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf-8'); }
  catch (err) { console.error('保存配置失败:', err.message); }
}

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let suppressMoveSave = false;

function createWindow() {
  const config = loadConfig();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  let winX, winY;
  if (config.positionPreset === 'top-left') { winX = 0; winY = 0; }
  else if (config.positionPreset === 'top-right') { winX = screenW - 800; winY = 0; }
  else if (config.positionPreset === 'bottom-left') { winX = 0; winY = screenH - 400; }
  else if (config.positionPreset === 'bottom-right') { winX = screenW - 800; winY = screenH - 400; }
  else if (config.positionPreset === 'custom') {
    winX = config.x || 0; winY = config.y || 0;
    // 确保窗口至少部分可见（更换显示器等场景）
    winX = Math.max(0, Math.min(winX, screenW - 100));
    winY = Math.max(0, Math.min(winY, screenH - 100));
  }
  else { winX = Math.round((screenW - 800) / 2); winY = Math.round((screenH - 400) / 2); }

  suppressMoveSave = true;
  mainWindow = new BrowserWindow({
    width: 800, height: 400, x: winX, y: winY,
    transparent: true, frame: false,
    alwaysOnTop: config.layerMode === 'alwaysOnTop',
    resizable: true, skipTaskbar: true, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });

  // 500ms 后允许拖拽保存（避免初始定位被记录为 custom）
  setTimeout(() => { suppressMoveSave = false; }, 500);

  // 用户拖拽窗口时自动保存位置（500ms 防抖）
  let moveSaveTimer = null;
  mainWindow.on('move', () => {
    if (suppressMoveSave) return;
    if (moveSaveTimer) clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const [x, y] = mainWindow.getPosition();
      const cfg = loadConfig();
      cfg.x = x; cfg.y = y; cfg.positionPreset = 'custom';
      saveConfig(cfg);
      // 同步通知设置窗口（如果打开）
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('config-updated', cfg);
      }
    }, 500);
  });
}

// ========== 系统托盘 ==========
function createTray() {
  // 创建 16x16 托盘图标（BGRA 格式）
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
      const i = (y * size + x) * 4;
      buf[i]     = inside ? 255 : 0;   // B
      buf[i + 1] = inside ? 255 : 0;   // G
      buf[i + 2] = inside ? 255 : 0;   // R
      buf[i + 3] = inside ? 255 : 0;   // A
    }
  }
  const img = nativeImage.createFromBuffer(buf, { width: size, height: size });

  tray = new Tray(img);
  tray.setToolTip('大时钟');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚙️ 设置',
      click: () => openSettingsWindow(),
    },
    { type: 'separator' },
    {
      label: '❌ 退出',
      click: () => { app.quit(); },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // 左键单击切换时钟窗口显示/隐藏
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) { mainWindow.hide(); }
      else { mainWindow.show(); mainWindow.focus(); }
    }
  });
}

// ========== 设置窗口 ==========
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520, height: 620,
    resizable: true,
    frame: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: '大时钟设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ========== IPC 处理 ==========

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (_event, data) => {
  saveConfig(data);
  return { success: true };
});

ipcMain.handle('move-window', (_event, args) => {
  if (!mainWindow) return { success: false };
  const w = mainWindow.getSize()[0];
  const h = mainWindow.getSize()[1];
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  let x, y;
  if (args.preset) {
    switch (args.preset) {
      case 'center': x = Math.round((screenW - w) / 2); y = Math.round((screenH - h) / 2); break;
      case 'top-left': x = 0; y = 0; break;
      case 'top-right': x = screenW - w; y = 0; break;
      case 'bottom-left': x = 0; y = screenH - h; break;
      case 'bottom-right': x = screenW - w; y = screenH - h; break;
      default: x = args.x || 0; y = args.y || 0;
    }
  } else { x = args.x; y = args.y; }
  suppressMoveSave = true;
  mainWindow.setPosition(x, y);
  setTimeout(() => { suppressMoveSave = false; }, 300);
  return { success: true };
});

ipcMain.handle('set-layer-mode', (_event, mode) => {
  if (!mainWindow) return { success: false };
  mainWindow.setAlwaysOnTop(mode === 'alwaysOnTop');
  return { success: true };
});

ipcMain.handle('resize-window', (_event, { width, height }) => {
  if (!mainWindow) return { success: false };
  const padding = 60;
  const nw = Math.max(200, Math.ceil(width + padding));
  const nh = Math.max(100, Math.ceil(height + padding));
  suppressMoveSave = true;
  mainWindow.setSize(nw, nh);
  setTimeout(() => { suppressMoveSave = false; }, 300);
  return { success: true };
});

ipcMain.handle('set-auto-start', (_event, enabled) => {
  try {
    // 显式指定 path：打包后是 .exe，开发模式是 electron.exe
    // 显式传空 args，避免 electron 启动时无参数而 fallback 到默认欢迎页
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [],
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

// 鼠标穿透
ipcMain.handle('set-passthrough', (_event, enabled) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(enabled, { forward: enabled });
  }
  return { success: true };
});

// 设置窗口通知时钟窗口更新
ipcMain.handle('notify-clock-update', (_event, newConfig) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-updated', newConfig);
  }
  return { success: true };
});

ipcMain.handle('quit-app', () => app.quit());

// ========== 启动 ==========
app.whenReady().then(() => {
  const config = loadConfig();
  // 强制重写一次开机自启动注册项：
  // 1. 用绝对 path 避免 electron.exe 启动时找不到 app
  // 2. 清空 args 避免启动参数错误导致出现默认欢迎页
  // 兼容老版本（可能在开发模式打开过"开机自启动"，注册表残留 electron.exe 路径）
  try {
    app.setLoginItemSettings({
      openAtLogin: !!config.autoStart,
      path: process.execPath,
      args: [],
    });
  } catch (e) { console.error('开机自启动设置失败:', e.message); }

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前保存窗口位置并清理托盘
app.on('before-quit', () => {
  // 保存当前窗口位置
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [x, y] = mainWindow.getPosition();
    const cfg = loadConfig();
    cfg.x = x; cfg.y = y;
    saveConfig(cfg);
  }
  if (tray) { tray.destroy(); tray = null; }
});
