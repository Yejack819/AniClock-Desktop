const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== 配置路径 ==========
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function getAlarmsPath() {
  return path.join(app.getPath('userData'), 'alarms.json');
}

const DEFAULT_CONFIG = {
  color: '#000000', bgColor: 'rgba(255,255,255,0.2)', fontFamily: 'Arial',
  fontSize: 200, animType: 'slide-up', positionPreset: 'center', x: 0, y: 0,
  showSeconds: true, showDate: true, showWeekday: true, datePosition: 'below', autoColor: false,
  extraTimezones: [], animDuration: 350, staggerDelay: 0, staggerDirection: 'ltr',
  layerMode: 'alwaysOnTop', autoStart: false, language: 'zh',
  infoScale: 0.3, blurEnabled: false, blurDuration: 300, blurStrength: 15,
  scaleInEnabled: false, scaleInFactor: 0.3,
  alarmSoundDuration: 120, alarmFlash: true, alarmAutoShow: true, alarmAutoPassthrough: true, alarmAutoTop: true,
  welcomeShown: false,
  settingsFontSize: 'md',
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

// ========== Alarm Data Management ==========
const ALARMS_DEFAULTS = { alarms: [] };

function loadAlarms() {
  try {
    if (!fs.existsSync(getAlarmsPath())) {
      fs.writeFileSync(getAlarmsPath(), JSON.stringify(ALARMS_DEFAULTS, null, 2), 'utf-8');
      return { alarms: [] };
    }
    const raw = fs.readFileSync(getAlarmsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { alarms: parsed.alarms || [] };
  } catch (err) {
    console.error('闹钟文件损坏，重置:', err.message);
    fs.writeFileSync(getAlarmsPath(), JSON.stringify(ALARMS_DEFAULTS, null, 2), 'utf-8');
    return { alarms: [] };
  }
}

function saveAlarmsData(data) {
  try { fs.writeFileSync(getAlarmsPath(), JSON.stringify(data, null, 2), 'utf-8'); }
  catch (err) { console.error('保存闹钟失败:', err.message); }
}

// ========== Alarm Engine ==========
let alarms = []; // in-memory alarm array
let alarmCheckInterval = null;
let alarmEditorWindow = null;

// Ringing state
let ringingAlarm = null; // { id, triggeredAt: Date }
let ringingTimer = null; // ringing duration timeout
let retryTimers = new Map(); // alarmId -> setTimeout for retry
let retryRemaining = new Map(); // alarmId -> remaining retry count (undefined = unlimited)
let autoColorWasOn = false; // save autoColor state before alarm
let passthroughWasOn = false; // save passthrough state before alarm
let layerModeWasNormal = false; // whether window layer was 'normal' before alarm
let windowWasHidden = false; // whether window was hidden before alarm rang

// Track trigger windows for 7-min skip rule
let triggerWindows = new Map(); // alarmId -> { triggerTime: Date, dismissed: boolean }

// Clean up old trigger windows (past 8 min and not ringing/retrying)
function cleanupTriggerWindows() {
  const now = Date.now();
  triggerWindows.forEach((win, id) => {
    const age = now - win.triggerTime.getTime();
    if (age > 8 * 60 * 1000 && !retryTimers.has(id) && !(ringingAlarm && ringingAlarm.id === id)) {
      triggerWindows.delete(id);
    }
  });
}

// Calculate next trigger for an alarm config
function calcNextTrigger(alarm, now) {
  const today = new Date(now);
  today.setSeconds(0, 0);
  const target = new Date(today);
  target.setHours(alarm.hour, alarm.minute, 0, 0);

  if (alarm.repeat && alarm.weekdays && alarm.weekdays.length > 0) {
    // Repeat alarm: find next matching weekday
    for (let d = 0; d < 8; d++) {
      const check = new Date(target);
      check.setDate(target.getDate() + d);
      const dow = check.getDay(); // 0=Sun
      if (alarm.weekdays.includes(dow) && (d > 0 || check > now)) {
        return check.toISOString();
      }
    }
    // Should not reach here, but fallback: 7 days later
    const fallback = new Date(target);
    fallback.setDate(target.getDate() + 7);
    return fallback.toISOString();
  } else {
    // One-time alarm
    if (target > now) return target.toISOString();
    // Already past today → tomorrow
    target.setDate(target.getDate() + 1);
    return target.toISOString();
  }
}

// Recalculate nextTrigger for a single alarm
function recalcAlarmNextTrigger(alarm) {
  if (!alarm.enabled) { alarm.nextTrigger = null; return; }
  alarm.nextTrigger = calcNextTrigger(alarm, new Date());
}

// Initialize alarms: ensure nextTrigger is set and handle missed alarms
function initAlarms() {
  const now = new Date();
  alarms.forEach(a => {
    if (!a.nextTrigger || new Date(a.nextTrigger) <= now) {
      if (a.repeat && a.weekdays && a.weekdays.length > 0) {
        a.nextTrigger = calcNextTrigger(a, now);
      } else {
        // One-time: push to next day
        const t = new Date();
        t.setHours(a.hour, a.minute, 0, 0);
        if (t <= now) t.setDate(t.getDate() + 1);
        a.nextTrigger = t.toISOString();
      }
    }
  });
  saveAlarmsData({ alarms });
}

// Send alarm state update to the clock renderer
function broadcastAlarmState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const now = new Date();
  let inlineType = 'none';
  let inlineText = '';
  let inlineText2 = '';

  // 1. Check ringing alarm → "单击关闭闹钟" ↔ alarm name
  if (ringingAlarm) {
    inlineType = 'ringing';
    const alarm = alarms.find(a => a.id === ringingAlarm.id);
    inlineText = alarm ? alarm.name : '';
    const dict = loadConfig().language === 'zh' ? '单击关闭闹钟' : 'Click to dismiss';
    inlineText2 = dict;
  }
  // 2. Check retry-waiting alarms → "? hh:mm ?" ↔ alarm name
  else if (retryTimers.size > 0) {
    let earliest = null;
    let earliestTime = '';
    retryTimers.forEach((timer, id) => {
      const alarm = alarms.find(a => a.id === id);
      if (alarm && alarm.enabled) {
        const t = String(alarm.hour).padStart(2, '0') + ':' + String(alarm.minute).padStart(2, '0');
        if (!earliest || earliestTime > t) {
          earliest = alarm;
          earliestTime = t;
        }
      }
    });
    if (earliest) {
      inlineType = 'retry';
      inlineTime = String(earliest.hour).padStart(2, '0') + ':' + String(earliest.minute).padStart(2, '0');
      inlineText = '? ' + inlineTime + ' ?';
      inlineText2 = earliest.name;
    }
  }
  // 3. Check next future alarm → "! hh:mm !"
  else {
    const futureAlarms = alarms.filter(a => a.enabled && a.nextTrigger);
    if (futureAlarms.length > 0) {
      let nearest = null;
      let nearestTime = null;
      futureAlarms.forEach(a => {
        const t = new Date(a.nextTrigger);
        if (t > now && (!nearest || t < nearest)) {
          nearest = t;
          nearestTime = String(a.hour).padStart(2, '0') + ':' + String(a.minute).padStart(2, '0');
        }
      });
      if (nearest) {
        inlineType = 'scheduled';
        inlineTime = nearestTime;
        inlineText = '! ' + nearestTime + ' !';
      }
    }
  }

  mainWindow.webContents.send('alarm-state-update', {
    type: inlineType,
    text: inlineText,
    text2: inlineText2,
    ringing: ringingAlarm ? ringingAlarm.id : null,
  });
}

// Start alarm ringing
function startRinging(alarm) {
  const now = new Date();
  ringingAlarm = { id: alarm.id, triggeredAt: now };
  triggerWindows.set(alarm.id, { triggerTime: now, dismissed: false });

  const config = loadConfig();
  const alarmAutoShow = config.alarmAutoShow !== false;
  const alarmAutoPassthrough = config.alarmAutoPassthrough !== false;
  const alarmAutoTop = config.alarmAutoTop !== false;
  // autoColor is always forced off during alarm (no toggle)

  // Record original states (only for features that are enabled)
  autoColorWasOn = !!config.autoColor; // always record
  passthroughWasOn = alarmAutoPassthrough && !!config.passthrough;
  layerModeWasNormal = alarmAutoTop && config.layerMode !== 'alwaysOnTop';
  windowWasHidden = alarmAutoShow ? false : null; // null = don't restore

  // a. Force show window (if enabled)
  if (alarmAutoShow && mainWindow && !mainWindow.isDestroyed()) {
    windowWasHidden = !mainWindow.isVisible();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }

  // b. Disable passthrough (if enabled) - only runtime, don't save to config
  if (alarmAutoPassthrough && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(false, { forward: false });
  }

  // c. Force always-on-top (if enabled) - only runtime, don't save to config
  if (alarmAutoTop && mainWindow && !mainWindow.isDestroyed()) {
    layerModeWasNormal = config.layerMode !== 'alwaysOnTop';
    if (layerModeWasNormal) {
      mainWindow.setAlwaysOnTop(true);
    }
  }

  // Send alarm-ringing to renderer (does NOT change autoColor in renderer,
  // so the background stays as autoColor's day/night bg)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alarm-ringing', {
      id: alarm.id,
      name: alarm.name,
      sound: alarm.sound || 'beep',
      autoColorWasOn,
      alarmFlash: config.alarmFlash !== false,
    });
  }

  // Set ringing duration timeout (replaces the old 120s hardcoded timeout)
  if (ringingTimer) clearTimeout(ringingTimer);
  const ringDurMs = Math.max(1000, (config.alarmSoundDuration !== undefined ? config.alarmSoundDuration : 120) * 1000);
  ringingTimer = setTimeout(() => {
    ringingTimer = null;
    const alarmId = ringingAlarm ? ringingAlarm.id : null;
    if (alarmId) {
      stopRinging(false); // move to retry
    }
  }, ringDurMs);

  broadcastAlarmState();
  broadcastActiveAlarmIds();
}

// Stop ringing
function stopRinging(dismissed) {
  if (ringingTimer) { clearTimeout(ringingTimer); ringingTimer = null; }

  const alarmId = ringingAlarm ? ringingAlarm.id : null;
  ringingAlarm = null;

  // Notify renderer to stop
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alarm-stop', { id: alarmId });
  }

  if (dismissed && alarmId) {
    // Mark trigger window as dismissed
    if (triggerWindows.has(alarmId)) {
      triggerWindows.set(alarmId, { ...triggerWindows.get(alarmId), dismissed: true });
    }
    // User dismissed the alarm
    const alarm = alarms.find(a => a.id === alarmId);
    if (alarm) {
      if (alarm.repeat && alarm.weekdays && alarm.weekdays.length > 0) {
        recalcAlarmNextTrigger(alarm);
      } else {
        alarm.enabled = false;
        alarm.nextTrigger = null;
      }
      saveAlarmsData({ alarms });
    }
    // Cancel any retry timer for this alarm
    if (retryTimers.has(alarmId)) {
      clearTimeout(retryTimers.get(alarmId));
      retryTimers.delete(alarmId);
    }
    retryRemaining.delete(alarmId);

    // Restore autoColor and passthrough
    restoreAlarmState();

    // Notify settings window to refresh list
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('alarms-updated', alarms);
    }
  } else if (!dismissed && alarmId) {
    // 120s expired, move to retry using alarm's snooze time
    const alarm = alarms.find(a => a.id === alarmId);
    if (alarm && alarm.enabled && alarm.snoozeEnabled !== false) {
      // Track remaining retries
      const sc = alarm.snoozeCount || 0;
      if (sc > 0) {
        const remaining = retryRemaining.get(alarmId);
        if (remaining === undefined) {
          retryRemaining.set(alarmId, sc); // first retry, set initial count
        }
      }
      const snoozeMs = Math.max(1000, ((alarm.snoozeHours || 0) * 3600000) + ((alarm.snoozeMinutes !== undefined ? alarm.snoozeMinutes : 5) * 60000) + ((alarm.snoozeSeconds || 0) * 1000));
      const retryTimer = setTimeout(() => {
        retryTimers.delete(alarmId);
        // Check remaining retries
        if (sc > 0) {
          const rem = retryRemaining.get(alarmId) || 0;
          if (rem <= 0) {
            // No more retries, disable alarm
            const a = alarms.find(x => x.id === alarmId);
            if (a) { a.enabled = false; a.nextTrigger = null; saveAlarmsData({ alarms }); }
            retryRemaining.delete(alarmId);
            // Notify settings window
            if (settingsWindow && !settingsWindow.isDestroyed()) {
              settingsWindow.webContents.send('alarms-updated', alarms);
            }
            broadcastAlarmState();
            broadcastActiveAlarmIds();
            return;
          }
          retryRemaining.set(alarmId, rem - 1);
        }
        const a = alarms.find(x => x.id === alarmId);
        if (a && a.enabled) {
          startRinging(a);
        }
      }, snoozeMs);
      retryTimers.set(alarmId, retryTimer);
    }
    // Restore autoColor and passthrough during retry wait
    restoreAlarmState();
  }

  // Restore window hidden state (if it was hidden before alarm rang)
  if (windowWasHidden && mainWindow && !mainWindow.isDestroyed() && !ringingAlarm) {
    mainWindow.hide();
  }
  windowWasHidden = false;

  broadcastAlarmState();
  broadcastActiveAlarmIds();
}

function restoreAlarmState() {
  // Only restore if no other alarm is ringing
  if (!ringingAlarm) {
    // Restore passthrough at runtime level (don't touch config)
    if (passthroughWasOn && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    // Restore layer mode at runtime level (don't touch config)
    if (layerModeWasNormal && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
      layerModeWasNormal = false;
    }
  }
  autoColorWasOn = false;
  passthroughWasOn = false;
}

// Main alarm check (called every second)
function checkAlarms() {
  const now = new Date();
  const nowMs = now.getTime();

  alarms.forEach(a => {
    if (!a.enabled || !a.nextTrigger) return;
    const t = new Date(a.nextTrigger);
    if (t <= now && nowMs - t.getTime() < 2000) {
      // Only trigger if within the past 2 seconds (avoids double-triggering)
      // Check if this alarm should be auto-skipped due to 7-min window
      let skip = false;
      triggerWindows.forEach((win, triggeringAlarmId) => {
        if (triggeringAlarmId === a.id || win.dismissed) return;
        const windowEnd = win.triggerTime.getTime() + 7 * 60 * 1000;
        if (t.getTime() >= win.triggerTime.getTime() && t.getTime() <= windowEnd) {
          skip = true;
        }
      });
      // Also check ringing alarm (if not in triggerWindows for some reason)
      if (!skip && ringingAlarm && ringingAlarm.id !== a.id) {
        const ringTime = ringingAlarm.triggeredAt;
        const windowEnd = ringTime.getTime() + 7 * 60 * 1000;
        if (t.getTime() >= ringTime.getTime() && t.getTime() <= windowEnd) {
          skip = true;
        }
      }

      if (skip) {
        // Auto-dismiss
        if (a.repeat && a.weekdays && a.weekdays.length > 0) {
          recalcAlarmNextTrigger(a);
        } else {
          a.enabled = false;
          a.nextTrigger = null;
        }
        saveAlarmsData({ alarms });
      } else if (!ringingAlarm) {
        // No active ringing alarm → start ringing
        startRinging(a);
      }
      // If already ringing, this alarm will be picked up in next check
    }
  });

  broadcastAlarmState();
  cleanupTriggerWindows();
}

// ========== Window Management ==========
let mainWindow = null;
let settingsWindow = null;
let welcomeWindow = null;
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

  // 500ms 后允许拖拽保存
  setTimeout(() => { suppressMoveSave = false; }, 500);

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
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('config-updated', cfg);
      }
    }, 500);
  });
}

// ========== 系统托盘 ==========
let trayMenuWindow = null;

function isDayTime() {
  const h = new Date().getHours();
  return h >= 6 && h < 18;
}

function getTrayMenuColors() {
  const day = isDayTime();
  return {
    bg: day ? '#ffffff' : '#222222',
    fg: day ? '#222222' : '#eeeeee',
    hover: day ? '#e8e8e8' : '#3a3a4a',
    border: day ? '#dddddd' : '#444444',
  };
}

function showTrayMenu() {
  const c = getTrayMenuColors();
  const config = loadConfig();
  const lang = config.language || 'zh';
  const setLabel = lang === 'zh' ? '⚙️ 设置' : '⚙️ Settings';
  const quitLabel = lang === 'zh' ? '❌ 退出' : '❌ Quit';

  if (tray) tray.setToolTip(lang === 'zh' ? '大时钟' : 'Digital Clock');

  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.close();
    trayMenuWindow = null;
  }

  trayMenuWindow = new BrowserWindow({
    width: 170, height: 88,
    frame: false, alwaysOnTop: true, skipTaskbar: true,
    transparent: true, resizable: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '*{margin:0;padding:0;box-sizing:border-box;user-select:none;}' +
    'body{background:'+c.bg+';color:'+c.fg+';font-family:-apple-system,sans-serif;font-size:13px;border-radius:8px;border:1px solid '+c.border+';overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.25);}' +
    '.mi{padding:10px 16px;cursor:pointer;transition:background 0.1s;}' +
    '.mi:hover{background:'+c.hover+';}' +
    '.mi:first-child{border-radius:8px 8px 0 0;}' +
    '.mi:last-child{border-radius:0 0 8px 8px;}' +
    '.sep{height:1px;background:'+c.border+';margin:0;}' +
    '</style></head><body>' +
    '<div class="mi" id="btn-set">'+setLabel+'</div>' +
    '<div class="sep"></div>' +
    '<div class="mi" id="btn-quit">'+quitLabel+'</div>' +
    '<script>' +
    'document.getElementById("btn-set").onclick=()=>{window.electronAPI.openSettings();}' +
    ';document.getElementById("btn-quit").onclick=()=>{window.electronAPI.quitApp();}' +
    '</script></body></html>';

  trayMenuWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  trayMenuWindow.once('ready-to-show', () => {
    if (tray && tray.getBounds) {
      const tb = tray.getBounds();
      const wb = trayMenuWindow.getBounds();
      let x = Math.round(tb.x + tb.width / 2 - wb.width / 2 + 8);
      let y = Math.round(tb.y - wb.height - 4);
      const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
      x = Math.max(4, Math.min(x, sw - wb.width - 4));
      if (y < 4) y = Math.round(tb.y + tb.height + 4);
      trayMenuWindow.setPosition(x, y);
    }
    trayMenuWindow.show();
  });
  trayMenuWindow.on('blur', () => { if (trayMenuWindow) { trayMenuWindow.close(); trayMenuWindow = null; } });
}

function createTray() {
  // [v1.0.5] 加载 assets/tray.png (从 assets/icon.png 转换而来)
  const trayIconPath = path.join(__dirname, 'assets', 'tray.png');
  let img;
  if (fs.existsSync(trayIconPath)) {
    img = nativeImage.createFromPath(trayIconPath);
  } else {
    // 兜底：若文件不存在，回退到原白色圆圈
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    const cx = size / 2, cy = size / 2, r = 6.5;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
        const i = (y * size + x) * 4;
        buf[i]     = inside ? 255 : 0;
        buf[i + 1] = inside ? 255 : 0;
        buf[i + 2] = inside ? 255 : 0;
        buf[i + 3] = inside ? 255 : 0;
      }
    }
    img = nativeImage.createFromBuffer(buf, { width: size, height: size });
  }
  tray = new Tray(img);
  const lang = loadConfig().language || 'zh';
  tray.setToolTip(lang === 'zh' ? '大时钟' : 'Digital Clock');
  tray.setContextMenu(null);

  tray.on('right-click', () => showTrayMenu());
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
    width: 560, height: 680,
    resizable: true,
    frame: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
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

// ========== 闹钟编辑器窗口 ==========
function openAlarmEditorWindow(alarmId) {
  if (alarmEditorWindow && !alarmEditorWindow.isDestroyed()) {
    alarmEditorWindow.focus();
    return;
  }
  alarmEditorWindow = new BrowserWindow({
    width: 440, height: 520,
    resizable: false,
    frame: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: '闹钟编辑',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  const options = alarmId ? { search: '?id=' + encodeURIComponent(alarmId) } : undefined;
  alarmEditorWindow.loadFile('alarm-editor.html', options);
  alarmEditorWindow.on('closed', () => { alarmEditorWindow = null; });
}

// ========== 欢迎窗口 ==========
function openWelcomeWindow() {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.focus();
    return;
  }
  welcomeWindow = new BrowserWindow({
    width: 500,
    height: 480,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    title: '',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  welcomeWindow.loadFile('welcome.html');
  welcomeWindow.center();
  welcomeWindow.on('closed', () => {
    welcomeWindow = null;
    // 如果用户关闭欢迎窗口但未完成，仍然创建主窗口
    if (!mainWindow) {
      createWindow();
      createTray();
    }
  });
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
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [],
    });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('set-passthrough', (_event, enabled) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(enabled, { forward: enabled });
  }
  return { success: true };
});

ipcMain.handle('notify-clock-update', (_event, newConfig) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-updated', newConfig);
  }
  if (newConfig && newConfig.language && tray) {
    tray.setToolTip(newConfig.language === 'zh' ? '大时钟' : 'Digital Clock');
  }
  return { success: true };
});

ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('open-settings', () => { openSettingsWindow(); return { success: true }; });

// ====== Alarm IPC ======

ipcMain.handle('get-all-alarms', () => {
  return alarms;
});

ipcMain.handle('get-alarm', (_event, id) => {
  return alarms.find(a => a.id === id) || null;
});

ipcMain.handle('save-alarm', (_event, data) => {
  const now = new Date();
  const existing = data.id ? alarms.findIndex(a => a.id === data.id) : -1;

  if (existing >= 0) {
    // Update existing
    const alarm = alarms[existing];
    const nameChanged = alarm.name !== data.name;
    alarm.name = data.name;
    alarm.hour = data.hour;
    alarm.minute = data.minute;
    alarm.sound = data.sound || 'beep';
    alarm.repeat = !!data.repeat;
    alarm.weekdays = data.repeat ? (data.weekdays || []) : [];
    alarm.snoozeHours = data.snoozeHours || 0;
    alarm.snoozeMinutes = data.snoozeMinutes !== undefined ? data.snoozeMinutes : 5;
    alarm.snoozeSeconds = data.snoozeSeconds || 0;
    alarm.snoozeEnabled = data.snoozeEnabled !== false;
    alarm.snoozeCount = data.snoozeCount !== undefined ? data.snoozeCount : 0;
    // Recalculate nextTrigger
    recalcAlarmNextTrigger(alarm);
    alarms[existing] = alarm;
  } else {
    // Create new
    const id = 'alarm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const alarm = {
      id,
      name: data.name,
      hour: data.hour,
      minute: data.minute,
      sound: data.sound || 'beep',
      repeat: !!data.repeat,
      weekdays: data.repeat ? (data.weekdays || []) : [],
      snoozeHours: data.snoozeHours || 0,
      snoozeMinutes: data.snoozeMinutes !== undefined ? data.snoozeMinutes : 5,
      snoozeSeconds: data.snoozeSeconds || 0,
      snoozeEnabled: data.snoozeEnabled !== false,
      snoozeCount: data.snoozeCount !== undefined ? data.snoozeCount : 0,
      enabled: true,
      nextTrigger: null,
    };
    recalcAlarmNextTrigger(alarm);
    alarms.push(alarm);
  }

  saveAlarmsData({ alarms });
  broadcastAlarmState();

  // Notify settings window to refresh list
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('alarms-updated', alarms);
  }

  return { success: true };
});

ipcMain.handle('delete-alarm', (_event, id) => {
  const idx = alarms.findIndex(a => a.id === id);
  if (idx >= 0) {
    // Cancel any retry timer
    if (retryTimers.has(id)) {
      clearTimeout(retryTimers.get(id));
      retryTimers.delete(id);
    }
    retryRemaining.delete(id);
    alarms.splice(idx, 1);
    saveAlarmsData({ alarms });
    broadcastAlarmState();
    // Notify settings window
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('alarms-updated', alarms);
    }
  }
  return { success: true };
});

ipcMain.handle('toggle-alarm', (_event, id) => {
  const alarm = alarms.find(a => a.id === id);
  if (!alarm) return { success: false, error: 'not found' };

  alarm.enabled = !alarm.enabled;

  if (alarm.enabled) {
    // Re-enable: recalculate next trigger
    recalcAlarmNextTrigger(alarm);
    // If this alarm was in retry, cancel it
    if (retryTimers.has(id)) {
      clearTimeout(retryTimers.get(id));
      retryTimers.delete(id);
    }
    retryRemaining.delete(id);
  } else {
    // Disable: clear next trigger, cancel retry, dismiss if ringing
    alarm.nextTrigger = null;
    if (retryTimers.has(id)) {
      clearTimeout(retryTimers.get(id));
      retryTimers.delete(id);
    }
    retryRemaining.delete(id);
    // If currently ringing this alarm, dismiss it
    if (ringingAlarm && ringingAlarm.id === id) {
      stopRinging(true); // dismiss
    }
  }

  saveAlarmsData({ alarms });
  broadcastAlarmState();
  broadcastActiveAlarmIds();

  // Notify settings window
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('alarms-updated', alarms);
  }

  return { success: true };
});

ipcMain.handle('open-alarm-editor', (_event, id) => {
  openAlarmEditorWindow(id || null);
  return { success: true };
});

ipcMain.handle('dismiss-alarm', (_event, id) => {
  if (ringingAlarm && ringingAlarm.id === id) {
    stopRinging(true);
  }
  return { success: true };
});

// [v1.0.5] 删除所有保存的数据（config.json + alarms.json）
ipcMain.handle('delete-all-data', async () => {
  const deleted = [];
  try {
    if (fs.existsSync(getConfigPath())) {
      fs.unlinkSync(getConfigPath());
      deleted.push('config.json');
    }
  } catch (e) { console.error('删除 config.json 失败:', e.message); }
  try {
    if (fs.existsSync(getAlarmsPath())) {
      fs.unlinkSync(getAlarmsPath());
      deleted.push('alarms.json');
    }
  } catch (e) { console.error('删除 alarms.json 失败:', e.message); }
  return { success: true, deleted };
});

// [v1.0.5] 欢迎界面完成
ipcMain.handle('finish-welcome', () => {
  const cfg = loadConfig();
  cfg.welcomeShown = true;
  saveConfig(cfg);
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.close();
  }
  if (!mainWindow) {
    createWindow();
    createTray();
  }
  return { success: true };
});

ipcMain.handle('get-active-alarm-ids', () => {
  const ringingId = ringingAlarm ? ringingAlarm.id : null;
  const retryIds = [];
  retryTimers.forEach((_timer, id) => retryIds.push(id));
  return { ringingId, retryIds };
});

function broadcastActiveAlarmIds() {
  const ids = {
    ringingId: ringingAlarm ? ringingAlarm.id : null,
    retryIds: [],
  };
  retryTimers.forEach((_timer, id) => ids.retryIds.push(id));
  // Send to settings window if open
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('active-alarm-ids-changed', ids);
  }
  // Also send to clock renderer for its own needs
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('active-alarm-ids-changed', ids);
  }
}

// ========== 启动 ==========
app.whenReady().then(() => {
  const config = loadConfig();
  // 强制重写一次开机自启动
  try {
    app.setLoginItemSettings({
      openAtLogin: !!config.autoStart,
      path: process.execPath,
      args: [],
    });
  } catch (e) { console.error('开机自启动设置失败:', e.message); }

  // Load alarms
  alarms = loadAlarms().alarms;
  initAlarms();

  // [v1.0.5] 首次使用 → 欢迎界面；否则正常启动
  if (!config.welcomeShown) {
    openWelcomeWindow();
  } else {
    createWindow();
    createTray();
  }

  // Start alarm checking interval (every 1 second)
  alarmCheckInterval = setInterval(checkAlarms, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Save window position
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [x, y] = mainWindow.getPosition();
    const cfg = loadConfig();
    cfg.x = x; cfg.y = y;
    saveConfig(cfg);
  }
  // Clean up alarm timers
  if (alarmCheckInterval) { clearInterval(alarmCheckInterval); alarmCheckInterval = null; }
  if (ringingTimer) { clearTimeout(ringingTimer); ringingTimer = null; }
  retryTimers.forEach(t => clearTimeout(t));
  retryTimers.clear();
  retryRemaining.clear();
  // [v1.0.5 Fix] 退出前重新计算所有过期 nextTrigger，防止重启后误报"错过闹钟"
  const _now = new Date();
  alarms.forEach(a => {
    if (a.enabled && a.nextTrigger && new Date(a.nextTrigger) <= _now) {
      recalcAlarmNextTrigger(a);
    }
  });
  // Save alarms
  saveAlarmsData({ alarms });
  if (tray) { tray.destroy(); tray = null; }
});
