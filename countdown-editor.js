// countdown-editor.js — [v1.0.5.7] 倒计时编辑窗
// 时长解析/格式化复用 countdown.js（同一份实现，主进程不会和这里跑出两套口径）。
const LOCALE = {
  zh: {
    windowTitle: '倒计时', addCountdown: '添加倒计时', editCountdown: '编辑倒计时',
    cdName: '名称', cdDuration: '时长',
    cdPomodoro: '番茄 25 分',
    cdH: '时', cdM: '分', cdS: '秒',
    cdPreview: '将倒计时 {t}',
    cdDurationInvalid: '时长需在 1 秒 ~ 24 小时之间',
    cdSound: '声音', soundBeep: 'Beep', soundChime: 'Chime', soundAlarm: 'Alarm', soundNone: '无声音',
    cdSnooze: '稍后提醒', cdSnoozeTime: '提醒间隔',
    cdSnoozeCount: '重复次数', cdSnoozeUnlimited: '无限', cdSnoozeTimes: '次',
    cdNote: '到点后会响铃，单击时钟窗口即可关闭；关闭后这条倒计时自动消失。',
    cancelBtn: '取消', confirmBtn: '确认',
    defaultName: '倒计时',
    invalidDuration: '请输入有效的时长', saveFailed: '保存失败', saveTooMany: '倒计时数量已达上限（50 条）',
  },
  en: {
    windowTitle: 'Countdown', addCountdown: 'Add Countdown', editCountdown: 'Edit Countdown',
    cdName: 'Name', cdDuration: 'Duration',
    cdPomodoro: 'Pomodoro 25m',
    cdH: 'h', cdM: 'm', cdS: 's',
    cdPreview: 'Counts down {t}',
    cdDurationInvalid: 'Duration must be between 1 second and 24 hours',
    cdSound: 'Sound', soundBeep: 'Beep', soundChime: 'Chime', soundAlarm: 'Alarm', soundNone: 'None',
    cdSnooze: 'Snooze', cdSnoozeTime: 'Interval',
    cdSnoozeCount: 'Retries', cdSnoozeUnlimited: 'Unlimited', cdSnoozeTimes: 'times',
    cdNote: 'When it hits zero it rings — click the clock window to dismiss. The countdown is removed after it is dismissed.',
    cancelBtn: 'Cancel', confirmBtn: 'Confirm',
    defaultName: 'Countdown',
    invalidDuration: 'Please enter a valid duration', saveFailed: 'Save failed', saveTooMany: 'Countdown limit reached (50)',
  },
};

const $ = id => document.getElementById(id);
let editingId = null;
let currentLang = 'zh';
let saveLock = false;

function applyLanguage(lang) {
  currentLang = lang;
  const dict = LOCALE[lang] || LOCALE.zh;
  document.querySelectorAll('[data-lang]').forEach(el => {
    const key = el.dataset.lang;
    if (dict[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = dict[key];
      else el.textContent = dict[key];
    }
  });
  document.title = dict.windowTitle;
  const title = $('editor-title');
  if (title) title.textContent = editingId ? dict.editCountdown : dict.addCountdown;
}

function readDurationMs() {
  const h = Math.max(0, Math.min(23, parseInt($('cd-hour').value, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt($('cd-minute').value, 10) || 0));
  const s = Math.max(0, Math.min(59, parseInt($('cd-second').value, 10) || 0));
  return (h * 3600 + m * 60 + s) * 1000;
}

function setDurationMs(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  $('cd-hour').value = Math.min(23, Math.floor(total / 3600));
  $('cd-minute').value = Math.floor((total % 3600) / 60);
  $('cd-second').value = total % 60;
}

// 预览 + 校验提示 + 快捷片高亮（三件事都只依赖当前三个输入框）
function syncDurationUI() {
  const dict = LOCALE[currentLang] || LOCALE.zh;
  const ms = readDurationMs();
  const ok = clampDuration(ms) !== null;
  const el = $('cd-preview');
  el.textContent = ok
    ? dict.cdPreview.replace('{t}', formatDuration(ms))
    : dict.cdDurationInvalid;
  el.classList.toggle('warn', !ok);
  const mins = ms / 60000;
  document.querySelectorAll('#cd-chips button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.min) === mins);
  });
}

function getSnooze() {
  // 显式 isNaN：用户明确填 0 不能被 || 默认值静默改掉
  const h = parseInt($('cd-snooze-h').value, 10);
  const m = parseInt($('cd-snooze-m').value, 10);
  const s = parseInt($('cd-snooze-s').value, 10);
  return {
    snoozeHours: Math.max(0, Math.min(23, isNaN(h) ? 0 : h)),
    snoozeMinutes: Math.max(0, Math.min(59, isNaN(m) ? 5 : m)),
    snoozeSeconds: Math.max(0, Math.min(59, isNaN(s) ? 0 : s)),
  };
}

async function save() {
  if (saveLock) return;
  const dict = LOCALE[currentLang] || LOCALE.zh;
  const durationMs = readDurationMs();
  if (clampDuration(durationMs) === null) { alert(dict.invalidDuration); return; }
  saveLock = true;
  try {
    const snoozeEnabled = $('cd-snooze-enabled').checked;
    const unlimited = $('cd-snooze-unlimited').checked;
    const snooze = snoozeEnabled ? getSnooze() : { snoozeHours: 0, snoozeMinutes: 0, snoozeSeconds: 0 };
    const name = (normalizeName($('cd-name').value) || dict.defaultName);
    const payload = {
      name,
      durationMs,
      sound: $('cd-sound').value,
      snoozeEnabled,
      snoozeHours: snooze.snoozeHours,
      snoozeMinutes: snooze.snoozeMinutes,
      snoozeSeconds: snooze.snoozeSeconds,
      snoozeCount: unlimited ? 0 : Math.max(1, parseInt($('cd-snooze-count').value, 10) || 3),
    };
    if (editingId) payload.id = editingId;
    const res = editingId
      ? await window.electronAPI.countdownUpdate(payload)
      : await window.electronAPI.countdownCreate(payload);
    if (res && res.success) { window.close(); return; }
    const err = res && res.error;
    alert(err === 'too-many' ? dict.saveTooMany
      : err === 'bad-duration' ? dict.invalidDuration
        : (dict.saveFailed + (err ? ' (' + err + ')' : '')));
  } catch (e) {
    alert(dict.saveFailed + ': ' + e.message);
  } finally {
    saveLock = false;
  }
}

async function init() {
  // 语言 + 默认值（提示音取自偏好，时长取自 countdownDefaultMinutes）
  let defaultMin = 5;
  try {
    const config = await window.electronAPI.getConfig();
    currentLang = config.language || 'zh';
    if (SOUNDS.indexOf(config.countdownSound) >= 0) $('cd-sound').value = config.countdownSound;
    const dm = Number(config.countdownDefaultMinutes);
    if (Number.isFinite(dm) && dm > 0) defaultMin = Math.min(24 * 60, dm);
  } catch (e) { /* 用默认 zh */ }
  applyLanguage(currentLang);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');
  if (editId) {
    editingId = editId;
    try {
      const cd = await window.electronAPI.countdownGet(editId);
      if (cd) {
        $('cd-name').value = cd.name || '';
        setDurationMs(cd.durationMs);
        $('cd-sound').value = SOUNDS.indexOf(cd.sound) >= 0 ? cd.sound : 'beep';
        $('cd-snooze-enabled').checked = cd.snoozeEnabled !== false;
        if (cd.snoozeEnabled === false) $('cd-snooze-detail').classList.add('hidden');
        $('cd-snooze-h').value = cd.snoozeHours || 0;
        $('cd-snooze-m').value = cd.snoozeMinutes !== undefined ? cd.snoozeMinutes : 5;
        $('cd-snooze-s').value = cd.snoozeSeconds || 0;
        const isUnlimited = cd.snoozeCount === 0 || cd.snoozeCount === undefined;
        $('cd-snooze-unlimited').checked = isUnlimited;
        $('cd-snooze-count').value = (!isUnlimited && cd.snoozeCount) ? cd.snoozeCount : 3;
        if (!isUnlimited) $('cd-snooze-count-wrap').classList.remove('hidden');
      }
    } catch (e) { console.error('读取倒计时失败:', e); }
    applyLanguage(currentLang);
  } else {
    $('cd-name').value = (LOCALE[currentLang] || LOCALE.zh).defaultName;
    setDurationMs(defaultMin * 60000);
  }
  syncDurationUI();

  // 快捷片
  document.querySelectorAll('#cd-chips button').forEach(btn => {
    btn.addEventListener('click', () => {
      setDurationMs(Number(btn.dataset.min) * 60000);
      syncDurationUI();
    });
  });

  // 三个输入框：改完即校验 + 更新预览（input 事件让用户边输边看到反馈）
  ['cd-hour', 'cd-minute', 'cd-second'].forEach(id => {
    const el = $(id);
    const max = id === 'cd-hour' ? 23 : 59;
    el.addEventListener('input', syncDurationUI);
    el.addEventListener('change', () => {
      let v = parseInt(el.value, 10);
      if (isNaN(v) || v < 0) v = 0;
      el.value = Math.min(v, max);
      syncDurationUI();
    });
  });
  $('cd-name').addEventListener('input', () => {
    const v = $('cd-name').value;
    // 视觉上照常输入，保存时再统一归一（与主进程同一条 normalizeName）
    if (v.length > 40) $('cd-name').value = v.slice(0, 40);
  });

  // 稍后提醒
  $('cd-snooze-enabled').addEventListener('change', () => {
    $('cd-snooze-detail').classList.toggle('hidden', !$('cd-snooze-enabled').checked);
  });
  $('cd-snooze-unlimited').addEventListener('change', () => {
    $('cd-snooze-count-wrap').classList.toggle('hidden', $('cd-snooze-unlimited').checked);
  });
  $('cd-snooze-h').addEventListener('change', function () {
    let v = parseInt(this.value, 10); if (isNaN(v) || v < 0) v = 0;
    this.value = Math.min(v, 23);
  });
  $('cd-snooze-m').addEventListener('change', function () {
    let v = parseInt(this.value, 10); if (isNaN(v)) v = 5;
    this.value = Math.max(0, Math.min(v, 59));
  });
  $('cd-snooze-s').addEventListener('change', function () {
    let v = parseInt(this.value, 10); if (isNaN(v) || v < 0) v = 0;
    this.value = Math.min(v, 59);
  });
  $('cd-snooze-count').addEventListener('change', function () {
    let v = parseInt(this.value, 10); if (isNaN(v) || v < 1) v = 1;
    this.value = Math.min(v, 999);
  });

  $('btn-cancel').addEventListener('click', () => window.close());
  $('btn-confirm').addEventListener('click', save);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target !== $('btn-cancel')) save();
    if (e.key === 'Escape') window.close();
  });
}

init();
