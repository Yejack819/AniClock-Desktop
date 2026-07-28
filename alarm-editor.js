// alarm-editor.js
const LOCALE = {
  zh: {
    windowTitle: '闹钟编辑', addAlarm: '添加闹钟', editAlarm: '编辑闹钟',
    alarmName: '闹钟名称', alarmTime: '提醒时间', timeSep: ':',
    alarmSound: '声音', soundBeep: 'Beep', soundChime: 'Chime', soundAlarm: 'Alarm', soundNone: '无声音',
    alarmRepeat: '是否重复', repeatOn: '重复于',
    dayMon: '一', dayTue: '二', dayWed: '三', dayThu: '四', dayFri: '五', daySat: '六', daySun: '日',
    alarmSnooze: '稍后提醒', snoozeH: '时', snoozeM: '分', snoozeS: '秒', alarmSnoozeTime: '提醒间隔',
    alarmSnoozeCount: '重复次数', snoozeUnlimited: '无限', snoozeTimes: '次',
    cancelBtn: '取消', confirmBtn: '确认',
    nameRequired: '请输入闹钟名称', invalidTime: '请输入有效的时间',
    noWeekday: '请至少选择一天', saveSuccess: '保存成功', saveFailed: '保存失败',
    nameConflict: '该名称已存在',
  },
  en: {
    windowTitle: 'Alarm', addAlarm: 'Add Alarm', editAlarm: 'Edit Alarm',
    alarmName: 'Alarm Name', alarmTime: 'Time', timeSep: ':',
    alarmSound: 'Sound', soundBeep: 'Beep', soundChime: 'Chime', soundAlarm: 'Alarm', soundNone: 'None',
    alarmRepeat: 'Repeat', repeatOn: 'Repeat on',
    dayMon: 'Mon', dayTue: 'Tue', dayWed: 'Wed', dayThu: 'Thu', dayFri: 'Fri', daySat: 'Sat', daySun: 'Sun',
    alarmSnooze: 'Snooze', snoozeH: 'h', snoozeM: 'm', snoozeS: 's', alarmSnoozeTime: 'Interval',
    alarmSnoozeCount: 'Retries', snoozeUnlimited: 'Unlimited', snoozeTimes: 'times',
    cancelBtn: 'Cancel', confirmBtn: 'Confirm',
    nameRequired: 'Please enter an alarm name', invalidTime: 'Please enter a valid time',
    noWeekday: 'Please select at least one day', saveSuccess: 'Saved', saveFailed: 'Save failed',
    nameConflict: 'This name already exists',
  },
};

const $ = id => document.getElementById(id);
let editingId = null;
let currentLang = 'zh';
let weekdayActive = new Set();

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
  document.querySelectorAll('.weekday-buttons button').forEach(btn => {
    const key = btn.dataset.lang;
    if (key && dict[key]) btn.textContent = dict[key];
  });
  const title = $('editor-title');
  if (title) title.textContent = editingId ? dict.editAlarm : dict.addAlarm;
}

function toggleWeekday(day) {
  const btn = document.querySelector(`.weekday-buttons button[data-day="${day}"]`);
  if (!btn) return;
  if (weekdayActive.has(day)) {
    weekdayActive.delete(day);
    btn.classList.remove('active');
  } else {
    weekdayActive.add(day);
    btn.classList.add('active');
  }
}

function getNextName(existingNames) {
  const used = new Set();
  const prefix = currentLang === 'zh' ? '闹钟提醒' : 'Alarm ';
  existingNames.forEach(n => {
    if (n.startsWith(prefix)) {
      const num = parseInt(n.slice(prefix.length), 10);
      if (!isNaN(num)) used.add(num);
    }
  });
  let n = 1;
  while (used.has(n)) n++;
  return prefix + n;
}

function validate() {
  const dict = LOCALE[currentLang] || LOCALE.zh;
  const name = $('alarm-name').value.trim();
  if (!name) { alert(dict.nameRequired); return false; }
  const h = parseInt($('alarm-hour').value, 10);
  const m = parseInt($('alarm-minute').value, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    alert(dict.invalidTime); return false;
  }
  const repeat = $('alarm-repeat').checked;
  if (repeat && weekdayActive.size === 0) {
    alert(dict.noWeekday); return false;
  }
  return true;
}

function getSnoozeMs() {
  const h = parseInt($('alarm-snooze-h').value, 10) || 0;
  const m = parseInt($('alarm-snooze-m').value, 10) || 5;
  const s = parseInt($('alarm-snooze-s').value, 10) || 0;
  return { snoozeHours: Math.max(0, Math.min(23, h)), snoozeMinutes: Math.max(0, Math.min(59, m)), snoozeSeconds: Math.max(0, Math.min(59, s)) };
}

async function save() {
  if (!validate()) return;
  const dict = LOCALE[currentLang] || LOCALE.zh;
  const snoozeEnabled = $('alarm-snooze-enabled').checked;
  const snoozeUnlimited = $('alarm-snooze-unlimited').checked;
  const snoozeCount = snoozeUnlimited ? 0 : Math.max(1, parseInt($('alarm-snooze-count').value, 10) || 3);
  const snooze = snoozeEnabled ? getSnoozeMs() : { snoozeHours: 0, snoozeMinutes: 0, snoozeSeconds: 0 };
  const data = {
    name: $('alarm-name').value.trim(),
    hour: parseInt($('alarm-hour').value, 10),
    minute: parseInt($('alarm-minute').value, 10),
    sound: $('alarm-sound').value,
    repeat: $('alarm-repeat').checked,
    weekdays: $('alarm-repeat').checked ? [...weekdayActive].map(Number).sort((a,b)=>a-b) : [],
    snoozeEnabled: snoozeEnabled,
    snoozeHours: snooze.snoozeHours,
    snoozeMinutes: snooze.snoozeMinutes,
    snoozeSeconds: snooze.snoozeSeconds,
    snoozeCount: snoozeCount,
  };
  if (editingId) data.id = editingId;
  try {
    const result = await window.electronAPI.saveAlarm(data);
    if (result && result.success) {
      window.close();
    } else {
      alert(result?.error || dict.saveFailed);
    }
  } catch (e) {
    alert(dict.saveFailed + ': ' + e.message);
  }
}

async function init() {
  // Load language
  try {
    const config = await window.electronAPI.getConfig();
    currentLang = config.language || 'zh';
    applyLanguage(currentLang);
  } catch (e) { /* use default zh */ }

  // Check if editing
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');
  if (editId) {
    editingId = editId;
    try {
      const alarm = await window.electronAPI.getAlarm(editId);
      if (alarm) {
        $('alarm-name').value = alarm.name;
        $('alarm-hour').value = alarm.hour;
        $('alarm-minute').value = alarm.minute;
        $('alarm-sound').value = alarm.sound || 'beep';
        $('alarm-repeat').checked = !!alarm.repeat;
        $('alarm-snooze-h').value = alarm.snoozeHours || 0;
        $('alarm-snooze-m').value = alarm.snoozeMinutes !== undefined ? alarm.snoozeMinutes : 5;
        $('alarm-snooze-s').value = alarm.snoozeSeconds || 0;
        $('alarm-snooze-enabled').checked = alarm.snoozeEnabled !== false;
        if (alarm.snoozeEnabled === false) $('snooze-detail').classList.add('hidden');
        const isUnlimited = alarm.snoozeCount === 0 || alarm.snoozeCount === undefined;
        $('alarm-snooze-unlimited').checked = isUnlimited;
        $('alarm-snooze-count').value = (!isUnlimited && alarm.snoozeCount) ? alarm.snoozeCount : 3;
        if (!isUnlimited) $('snooze-count-input-wrap').classList.remove('hidden');
        if (alarm.repeat && alarm.weekdays) {
          alarm.weekdays.forEach(d => {
            weekdayActive.add(d);
            const btn = document.querySelector(`.weekday-buttons button[data-day="${d}"]`);
            if (btn) btn.classList.add('active');
          });
          $('weekday-picker').classList.remove('hidden');
        }
        applyLanguage(currentLang);
      }
    } catch (e) { console.error('Failed to load alarm:', e); }
  } else {
    try {
      const alarms = await window.electronAPI.getAllAlarms();
      const names = (alarms || []).map(a => a.name);
      $('alarm-name').value = getNextName(names);
      // Set default time to current time (only for new alarms)
      const now = new Date();
      $('alarm-hour').value = now.getHours();
      $('alarm-minute').value = now.getMinutes();
    } catch (e) { /* ignore */ }
  }

  // Weekday toggle
  document.querySelectorAll('.weekday-buttons button').forEach(btn => {
    btn.addEventListener('click', () => toggleWeekday(parseInt(btn.dataset.day, 10)));
  });

  // Repeat toggle → show/hide weekday picker
  $('alarm-repeat').addEventListener('change', () => {
    $('weekday-picker').classList.toggle('hidden', !$('alarm-repeat').checked);
  });

  // Input validation
  $('alarm-hour').addEventListener('change', () => {
    let v = parseInt($('alarm-hour').value, 10);
    if (isNaN(v)) v = 8;
    $('alarm-hour').value = Math.max(0, Math.min(23, v));
  });
  $('alarm-minute').addEventListener('change', () => {
    let v = parseInt($('alarm-minute').value, 10);
    if (isNaN(v)) v = 0;
    $('alarm-minute').value = Math.max(0, Math.min(59, v));
  });
  // Snooze toggle → show/hide snooze detail
  $('alarm-snooze-enabled').addEventListener('change', () => {
    $('snooze-detail').classList.toggle('hidden', !$('alarm-snooze-enabled').checked);
  });

  // Snooze unlimited toggle → show/hide count input
  $('alarm-snooze-unlimited').addEventListener('change', () => {
    $('snooze-count-input-wrap').classList.toggle('hidden', $('alarm-snooze-unlimited').checked);
  });

  // Snooze validation
  $('alarm-snooze-h').addEventListener('change', function() {
    let v = parseInt(this.value, 10); if (isNaN(v)) v = 0;
    this.value = Math.max(0, Math.min(23, v));
  });
  $('alarm-snooze-m').addEventListener('change', function() {
    let v = parseInt(this.value, 10); if (isNaN(v)) v = 5;
    this.value = Math.max(0, Math.min(59, v));
  });
  $('alarm-snooze-s').addEventListener('change', function() {
    let v = parseInt(this.value, 10); if (isNaN(v)) v = 0;
    this.value = Math.max(0, Math.min(59, v));
  });
  $('alarm-snooze-count').addEventListener('change', function() {
    let v = parseInt(this.value, 10); if (isNaN(v) || v < 1) v = 1;
    this.value = Math.min(v, 999);
  });

  // Buttons
  $('btn-cancel').addEventListener('click', () => window.close());
  $('btn-confirm').addEventListener('click', save);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') window.close();
  });
}

init();
