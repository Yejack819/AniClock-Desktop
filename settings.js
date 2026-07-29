// settings.js — 设置窗口
const LOCALE = {
  zh: {
    settingsTitle: '时钟设置', settingsHeader: '时钟设置',
    secAppearance: '--- 外观 ---', secDate: '--- 日期 ---', secAnimation: '--- 动画 ---', secTime: '--- 时间 ---', secPosition: '--- 位置 ---', secSystem: '--- 系统 ---',
    textColor: '文本颜色', autoColor: '根据白天/黑夜自动切换黑白',
    bgColor: '背景颜色', alpha: '透明度',
    fontFamily: '字体', customFont: '自定义...',
    fontSize: '字号', infoScale: '日期/时区比例', animSpeed: '动画时间', animType: '动画效果',
    animSlideUp: '上滑翻转', animSlideDown: '下滑翻转', animFade: '淡入淡出',
    animShrink: '缩（旧变小）', animExpand: '放（旧变大）', animFlip3d: '3D旋转', animNone: '无动画',
    staggerDelay: '错峰延迟', staggerDir: '错峰方向', staggerLTR: '从左到右', staggerRTL: '从右到左',
    blurEnabled: '添加模糊', blurDuration: '模糊持续', blurStrength: '模糊强度',
    scaleInEnabled: '由小放大滑入', scaleInFactor: '初始大小',
    showSeconds: '显示秒',
    showDate: '显示日期', showWeekday: '显示星期', datePosition: '日期位置',
    dateAbove: '上方', dateBelow: '下方',
    secTZ: '--- 多时区 ---', tzAdd: '添加', tzRemove: 'X', tzHint: '最多添加 2 个时区',
    position: '窗口位置', posTL: '左上', posTR: '右上', posCenter: '居中',
    posBL: '左下', posBR: '右下', posCustom: '自定义', applyPos: '应用位置',
    layerMode: '图层模式', layerTop: '置顶', layerNormal: '桌面',
    autoStart: '开机自启动', language: '语言', langZh: '中文', langEn: 'English',
    autoStartFail: '设置开机自启动失败：', permissionDenied: '权限被拒绝',
    passthrough: '鼠标穿透（整个窗口）', passthroughWarn: '开启鼠标穿透后无法拖动窗口以更改其位置',
    secAlarm: '--- 闹钟 ---',
    alarmAdd: '+ 添加闹钟', alarmEdit: '编辑', alarmDelete: '删除',
    alarmRepeatNone: '仅一次', alarmRepeatDays: '重复', alarmDisabled: '已关闭',
    dayNames: ['日', '一', '二', '三', '四', '五', '六'],
    alarmSounds: { beep: 'Beep', chime: 'Chime', alarm: 'Alarm', none: '无声音' },
    confirmDelete: '确定要删除闹钟"{{name}}"吗？',
    snoozeLabel: '稍后',
    alarmAdvanced: '▶ 高级设置', alarmSoundDuration: '声音播放最长时间',
    alarmFlash: '闹钟响时闪烁',
    alarmAutoShow: '闹钟响时自动取消隐藏', alarmAutoPassthrough: '闹钟响时自动关闭鼠标穿透',
    alarmAutoTop: '闹钟响时自动置顶',
    secData: '--- 数据管理 ---',
    deleteDataDesc: '删除所有保存的数据（config.json 和 alarms.json），应用将恢复出厂状态。此操作不可撤销！',
    deleteDataBtn: '🗑️ 删除所有保存的数据',
    confirmDeleteData: '确定要删除所有保存的数据吗？\n\n此操作将删除所有配置和闹钟数据，且不可撤销！\n\n应用将自动重启以完成重置。',
    deleteDataSuccess: '数据已删除，应用即将重启...',
    // [v1.0.5] 倒计时 / 状态
    alarmRinging: '🔔 正在响铃',
    alarmRetrying: '⏰ 稍后提醒中',
    alarmAboutToRing: '即将响铃',
    countdownDays: '距提醒还有{d}天{h}小时{m}分钟',
    countdownHours: '距提醒还有{h}小时{m}分钟',
    countdownMins: '距提醒还有{m}分钟',
    // [v1.0.5] 设置界面
    secSettingsUI: '--- 设置界面 ---',
    settingsFontSize: '设置窗口字体大小',
    fontXs: '极小', fontSm: '小', fontMd: '中', fontLg: '大', fontXl: '极大',
  },
  en: {
    settingsTitle: 'Clock Settings', settingsHeader: 'Clock Settings',
    secAppearance: '--- Appearance ---', secDate: '--- Date ---', secAnimation: '--- Animation ---', secTime: '--- Time ---', secPosition: '--- Position ---', secSystem: '--- System ---',
    textColor: 'Text Color', autoColor: 'Auto-switch black/white (day/night)',
    bgColor: 'Background', alpha: 'Opacity',
    fontFamily: 'Font', customFont: 'Custom...',
    fontSize: 'Font Size', infoScale: 'Date/TZ size ratio', animSpeed: 'Anim Duration', animType: 'Animation',
    animSlideUp: 'Slide Up', animSlideDown: 'Slide Down', animFade: 'Fade',
    animShrink: 'Shrink', animExpand: 'Expand', animFlip3d: '3D Flip', animNone: 'None',
    staggerDelay: 'Stagger Delay', staggerDir: 'Stagger Direction', staggerLTR: 'Left to Right', staggerRTL: 'Right to Left',
    blurEnabled: 'Add Blur', blurDuration: 'Blur Duration', blurStrength: 'Blur Strength',
    scaleInEnabled: 'Scale-in', scaleInFactor: 'Start Size',
    showSeconds: 'Show Seconds',
    showDate: 'Show Date', showWeekday: 'Show Weekday', datePosition: 'Date Position',
    dateAbove: 'Above', dateBelow: 'Below',
    secTZ: '--- Time Zones ---', tzAdd: 'Add', tzRemove: 'X', tzHint: 'Max 2 time zones',
    position: 'Window Position', posTL: 'Top-Left', posTR: 'Top-Right', posCenter: 'Center',
    posBL: 'Bottom-Left', posBR: 'Bottom-Right', posCustom: 'Custom', applyPos: 'Apply',
    layerMode: 'Layer Mode', layerTop: 'Always on Top', layerNormal: 'Normal',
    autoStart: 'Auto Start on Boot', language: 'Language', langZh: 'Chinese', langEn: 'English',
    autoStartFail: 'Failed to set auto-start: ', permissionDenied: 'Permission denied',
    passthrough: 'Mouse passthrough (entire window)', passthroughWarn: 'When enabled, you cannot drag the window to move it.',
    secAlarm: '--- Alarm ---',
    alarmAdd: '+ Add Alarm', alarmEdit: 'Edit', alarmDelete: 'Delete',
    alarmRepeatNone: 'Once', alarmRepeatDays: 'Repeat', alarmDisabled: 'Disabled',
    dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    alarmSounds: { beep: 'Beep', chime: 'Chime', alarm: 'Alarm', none: 'None' },
    confirmDelete: 'Are you sure you want to delete "{{name}}"?',
    snoozeLabel: 'Snooze',
    alarmAdvanced: '▶ Advanced', alarmSoundDuration: 'Max sound duration',
    alarmFlash: 'Flash on alarm',
    alarmAutoShow: 'Auto-show window on alarm', alarmAutoPassthrough: 'Auto-disable passthrough on alarm',
    alarmAutoTop: 'Auto-force always-on-top on alarm',
    secData: '--- Data Management ---',
    deleteDataDesc: 'Delete all saved data (config.json and alarms.json). The app will reset to factory state. This action is IRREVERSIBLE!',
    deleteDataBtn: '🗑️ Delete All Saved Data',
    confirmDeleteData: 'Delete all saved data?\n\nThis will delete ALL configuration and alarm data. This action is IRREVERSIBLE!\n\nThe app will restart to complete the reset.',
    deleteDataSuccess: 'Data deleted. App is restarting...',
    // [v1.0.5] Countdown / status
    alarmRinging: '🔔 Ringing',
    alarmRetrying: '⏰ Snoozing',
    alarmAboutToRing: 'About to ring',
    countdownDays: 'Reminder in {d}d {h}h {m}m',
    countdownHours: 'Reminder in {h}h {m}m',
    countdownMins: 'Reminder in {m}m',
    // [v1.0.5] Settings UI
    secSettingsUI: '--- Settings UI ---',
    settingsFontSize: 'Settings Font Size',
    fontXs: 'XS', fontSm: 'S', fontMd: 'M', fontLg: 'L', fontXl: 'XL',
  },
};

const $ = id => document.getElementById(id);
const els = {
  text_color: $('text-color'), auto_color: $('auto-color'),
  bg_color: $('bg-color'), bg_alpha: $('bg-alpha'), bg_alpha_label: $('bg-alpha-label'),
  font_select: $('font-select'), font_custom: $('font-custom'),
  font_size: $('font-size'), font_size_label: $('font-size-label'),
  info_scale: $('info-scale'), info_scale_label: $('info-scale-label'),
  anim_speed: $('anim-speed'), anim_speed_label: $('anim-speed-label'),
  anim_type: $('anim-type'),
  stagger_delay: $('stagger-delay'), stagger_delay_label: $('stagger-delay-label'),
  stagger_dir: $('stagger-dir'),
  blur_controls: document.getElementById('blur-controls'),
  blur_enabled: $('blur-enabled'),
  blur_detail: document.getElementById('blur-detail'),
  blur_duration: $('blur-duration'), blur_duration_label: $('blur-duration-label'),
  blur_strength: $('blur-strength'), blur_strength_label: $('blur-strength-label'),
  scale_controls: document.getElementById('scale-controls'),
  scale_in_enabled: $('scale-in-enabled'),
  scale_detail: document.getElementById('scale-detail'),
  scale_factor: $('scale-factor'), scale_factor_label: $('scale-factor-label'),
  show_seconds: $('show-seconds'), show_date: $('show-date'), show_weekday: $('show-weekday'), date_position: $('date-position'),
  layer_mode: $('layer-mode'), auto_start: $('auto-start'), language_select: $('language-select'),
  pos_x: $('pos-x'), pos_y: $('pos-y'), apply_pos: $('apply-pos'),
  pos_buttons: document.querySelectorAll('.position-buttons button'),
  custom_pos: document.getElementById('custom-pos-controls'),
  tz_list: document.getElementById('tz-list'), tz_label: document.getElementById('tz-label-input'),
  tz_offset: document.getElementById('tz-offset-input'), tz_add_btn: document.getElementById('tz-add-btn'),
  tz_hint: document.getElementById('tz-hint'),
  passthrough_switch: document.getElementById('passthrough-switch'),
  settings_font_size: document.getElementById('settings-font-size'),
  alarm_list: document.getElementById('alarm-list'),
  alarm_add_btn: document.getElementById('alarm-add-btn'),
  alarm_advanced_toggle: document.getElementById('alarm-advanced-toggle'),
  alarm_advanced_content: document.getElementById('alarm-advanced-content'),
  alarm_sound_duration: document.getElementById('alarm-sound-duration'),
  alarm_sound_duration_label: document.getElementById('alarm-sound-duration-label'),
  alarm_flash: document.getElementById('alarm-flash'),
  alarm_auto_show: document.getElementById('alarm-auto-show'),
  alarm_auto_passthrough: document.getElementById('alarm-auto-passthrough'),
  alarm_auto_top: document.getElementById('alarm-auto-top'),
  delete_data_btn: document.getElementById('delete-data-btn'),
};

let config = {};
let currentLang = 'zh';
let alarmList = [];
let activeAlarmIds = { ringingId: null, retryIds: [] };

function syncAnimUI(){
  els.anim_speed.disabled=els.anim_type.value==="none";
  const canBlur=els.anim_type.value==="slide-up"||els.anim_type.value==="slide-down";
  els.blur_controls.classList.toggle('hidden',!canBlur);
  els.scale_controls.classList.toggle('hidden',!canBlur);
  if(canBlur && els.blur_enabled.checked){
    els.blur_detail.classList.remove('hidden');
    const maxV=parseInt(els.anim_speed.value,10);
    els.blur_duration.max=maxV;
    if(parseInt(els.blur_duration.value,10)>maxV){
      els.blur_duration.value=maxV;
      els.blur_duration_label.textContent=maxV;
      saveAndApply({blurDuration:maxV});
    }
  } else {
    els.blur_detail.classList.add('hidden');
  }
  if(canBlur && els.scale_in_enabled.checked){
    els.scale_detail.classList.remove('hidden');
  } else {
    els.scale_detail.classList.add('hidden');
  }
}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(x=>{const h=x.toString(16);return h.length===1?'0'+h:h;}).join('');}
function buildBgColor() {
  const h = els.bg_color.value;
  return 'rgba('+parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16)+','+parseFloat(els.bg_alpha.value)+')';
}

function applyLanguage(lang) {
  currentLang = lang;
  const dict = LOCALE[lang] || LOCALE.zh;
  document.querySelectorAll('[data-lang]').forEach(el => {
    const key = el.dataset.lang;
    if (dict[key]) el.textContent = dict[key];
  });
  document.title = dict.settingsTitle;
  renderAlarmList(); // re-render with new locale
}

function renderTZList() {
  const tzs = config.extraTimezones || [];
  els.tz_list.innerHTML = '';
  const dict = LOCALE[currentLang] || LOCALE.zh;
  tzs.forEach((tz, idx) => {
    const div = document.createElement('div');
    div.className = 'tz-item';
    const sign = tz.offset >= 0 ? '+' : '';
    div.innerHTML = '<span class="tz-label">'+tz.label+'</span><span class="tz-offset">UTC'+sign+tz.offset+'</span><button class="tz-del-btn" data-idx="'+idx+'">'+dict.tzRemove+'</button>';
    els.tz_list.appendChild(div);
  });
  els.tz_list.querySelectorAll('.tz-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      saveAndApply({ extraTimezones: (config.extraTimezones || []).filter((_, i) => i !== idx) });
      renderTZList();
    });
  });
  const count = tzs.length;
  els.tz_hint.style.display = count >= 2 ? '' : 'none';
  els.tz_add_btn.disabled = count >= 2;
}

function renderAlarmList() {
  const dict = LOCALE[currentLang] || LOCALE.zh;
  els.alarm_list.innerHTML = '';

  if (alarmList.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:16px;color:#666;font-size:13px;';
    empty.textContent = currentLang === 'zh' ? '暂无闹钟，点击下方按钮添加' : 'No alarms. Click below to add one.';
    els.alarm_list.appendChild(empty);
    return;
  }

  alarmList.forEach(alarm => {
    if (!alarm) return;
    const item = document.createElement('div');
    item.className = 'alarm-item';

    const time = String(alarm.hour).padStart(2, '0') + ':' + String(alarm.minute).padStart(2, '0');

    let meta = '';
    if (alarm.enabled === false) {
      meta = dict.alarmDisabled;
    } else if (alarm.repeat && alarm.weekdays && alarm.weekdays.length > 0) {
      const days = alarm.weekdays.map(d => dict.dayNames[d] || '').join(' ');
      const soundName = dict.alarmSounds[alarm.sound] || alarm.sound;
      const snoozeStr = buildSnoozeStr(alarm, dict);
      meta = dict.alarmRepeatDays + ': ' + days + ' · ' + soundName + (snoozeStr ? ' · ' + snoozeStr : '');
    } else {
      const soundName = dict.alarmSounds[alarm.sound] || alarm.sound;
      const snoozeStr = buildSnoozeStr(alarm, dict);
      meta = dict.alarmRepeatNone + ' · ' + soundName + (snoozeStr ? ' · ' + snoozeStr : '');
    }
    // [v1.0.5] 追加倒计时 / 状态
    meta += getAlarmStatusSuffix(alarm, new Date(), dict);

    const nameStr = alarm.name || '';

    const isActive = alarm.id === activeAlarmIds.ringingId || activeAlarmIds.retryIds.includes(alarm.id);
    const isEnabled = alarm.enabled !== false;

    item.innerHTML =
      '<div class="alarm-toggle-col">' +
        '<label class="toggle-switch">' +
          '<input type="checkbox" class="alarm-toggle-input" data-id="' + alarm.id + '"' + (isEnabled ? ' checked' : '') + '>' +
          '<span class="toggle-slider"></span>' +
        '</label>' +
      '</div>' +
      '<div class="alarm-time' + (isEnabled ? '' : ' disabled') + '">' + time + '</div>' +
      '<div class="alarm-info">' +
        '<div class="alarm-name">' + escapeHtml(nameStr) + '</div>' +
        '<div class="alarm-meta">' + escapeHtml(meta) + '</div>' +
      '</div>' +
      '<div class="alarm-actions">' +
        '<button class="alarm-edit-btn" data-id="' + alarm.id + '"' + (isActive ? ' disabled' : '') + '>' + dict.alarmEdit + '</button>' +
        '<button class="alarm-del-btn" data-id="' + alarm.id + '">' + dict.alarmDelete + '</button>' +
      '</div>';

    els.alarm_list.appendChild(item);
  });

  // Bind events
  els.alarm_list.querySelectorAll('.alarm-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.electronAPI.openAlarmEditor(btn.dataset.id);
    });
  });
  els.alarm_list.querySelectorAll('.alarm-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const alarm = alarmList.find(a => a.id === btn.dataset.id);
      if (!alarm) return;
      const confirmMsg = (dict.confirmDelete || '确定要删除吗？').replace('{{name}}', alarm.name || '');
      if (!confirm(confirmMsg)) return;
      await window.electronAPI.deleteAlarm(btn.dataset.id);
      // List will be refreshed via onAlarmsUpdated
    });
  });
  els.alarm_list.querySelectorAll('.alarm-toggle-input').forEach(input => {
    input.addEventListener('change', () => {
      window.electronAPI.toggleAlarm(input.dataset.id);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildSnoozeStr(alarm, dict) {
  if (alarm.snoozeEnabled === false) return '';
  const h = alarm.snoozeHours || 0;
  const m = alarm.snoozeMinutes !== undefined ? alarm.snoozeMinutes : 5;
  const s = alarm.snoozeSeconds || 0;
  const isDefault = h === 0 && m === 5 && s === 0;
  let parts = [];
  if (h > 0) parts.push(h + 'h');
  if (m > 0) parts.push(m + 'm');
  if (s > 0) parts.push(s + 's');
  const timeStr = isDefault ? '' : parts.join(' ');
  const countStr = alarm.snoozeCount > 0 ? (dict.snoozeLabel || 'Snooze') + ' x' + alarm.snoozeCount : (dict.snoozeLabel || 'Snooze');
  if (timeStr) return countStr + ' ' + timeStr;
  return countStr;
}

// [v1.0.5] 计算闹钟倒计时/状态字符串（含前导 " · "）
function getAlarmStatusSuffix(alarm, now, dict) {
  // 正在响铃
  if (alarm.id === activeAlarmIds.ringingId) {
    return ' · ' + dict.alarmRinging;
  }
  // 稍后提醒中
  if (activeAlarmIds.retryIds.includes(alarm.id)) {
    return ' · ' + dict.alarmRetrying;
  }
  // 未启用 → 不附加
  if (alarm.enabled === false) return '';
  // 没有 nextTrigger → 不附加
  if (!alarm.nextTrigger) return '';
  const t = new Date(alarm.nextTrigger);
  if (isNaN(t.getTime())) return '';
  const diffMs = t.getTime() - now.getTime();
  // 已过期（正常情况不会发生，防御性处理）
  if (diffMs <= 0) return ' · ' + dict.alarmAboutToRing;
  const diffMin = Math.floor(diffMs / 60000);
  // 不到 1 分钟
  if (diffMin < 1) return ' · ' + dict.alarmAboutToRing;
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays > 0) {
    const remainingHours = Math.floor((diffMs % 86400000) / 3600000);
    const remainingMins = Math.floor((diffMs % 3600000) / 60000);
    return ' · ' + dict.countdownDays.replace('{d}', diffDays).replace('{h}', remainingHours).replace('{m}', remainingMins);
  } else if (diffHours > 0) {
    const remainingMins = Math.floor((diffMs % 3600000) / 60000);
    return ' · ' + dict.countdownHours.replace('{h}', diffHours).replace('{m}', remainingMins);
  } else {
    return ' · ' + dict.countdownMins.replace('{m}', diffMin);
  }
}

function syncUIFromConfig() {
  els.auto_color.checked = !!config.autoColor;
  els.text_color.value = config.color || '#ffffff';
  const m = config.bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (m) { els.bg_color.value = rgbToHex(+m[1],+m[2],+m[3]); els.bg_alpha.value = parseFloat(m[4]); }
  else { els.bg_color.value = '#000000'; els.bg_alpha.value = 0; }
  els.bg_alpha_label.textContent = Math.round(els.bg_alpha.value * 100) + '%';
  els.text_color.disabled=els.auto_color.checked;els.bg_color.disabled=els.auto_color.checked;
  const opts = Array.from(els.font_select.options).map(o => o.value);
  if (opts.includes(config.fontFamily)) { els.font_select.value = config.fontFamily; els.font_custom.classList.add('hidden'); }
  else { els.font_select.value = 'custom'; els.font_custom.classList.remove('hidden'); els.font_custom.value = config.fontFamily; }
  els.font_size.value = config.fontSize; els.font_size_label.textContent = config.fontSize;
  els.info_scale.value = config.infoScale || 0.3; els.info_scale_label.textContent = (config.infoScale || 0.3).toFixed(2);
  els.anim_speed.value = config.animDuration || 350; els.anim_speed_label.textContent = config.animDuration || 350;
  els.anim_type.value = config.animType || 'slide-up';
  if (els.anim_type.value === 'scale') { config.animType = 'shrink'; els.anim_type.value = 'shrink'; }
  els.stagger_delay.value = config.staggerDelay || 0; els.stagger_delay_label.textContent = config.staggerDelay || 0;
  els.stagger_dir.value = config.staggerDirection || 'ltr';
  els.blur_enabled.checked = !!config.blurEnabled;
  els.blur_duration.value = config.blurDuration || 300; els.blur_duration_label.textContent = config.blurDuration || 300;
  els.blur_strength.value = config.blurStrength || 15; els.blur_strength_label.textContent = config.blurStrength || 15;
  els.scale_in_enabled.checked = !!config.scaleInEnabled;
  els.scale_factor.value = Math.round((config.scaleInFactor||0.3)*100);
  els.scale_factor_label.textContent = Math.round((config.scaleInFactor||0.3)*100);
  syncAnimUI();
  els.show_seconds.checked = config.showSeconds !== false;
  els.show_date.checked = config.showDate !== false;
  els.show_weekday.checked = config.showWeekday !== false;
  els.date_position.value = config.datePosition || 'below';
  els.layer_mode.value = config.layerMode || 'alwaysOnTop';
  els.auto_start.checked = !!config.autoStart;
  els.language_select.value = config.language || 'zh';
  els.settings_font_size.value = config.settingsFontSize || 'md';
  applySettingsFontSize(config.settingsFontSize || 'md');
  els.passthrough_switch.checked = !!config.passthrough;
  applyLanguage(config.language || 'zh');
  els.pos_buttons.forEach(b => b.classList.toggle('active', b.dataset.pos === config.positionPreset));
  if (config.positionPreset === 'custom') {
    els.custom_pos.classList.remove('hidden'); els.pos_x.value = config.x; els.pos_y.value = config.y;
  } else { els.custom_pos.classList.add('hidden'); }
  renderTZList();

  // Alarm advanced settings
  const sd = config.alarmSoundDuration !== undefined ? config.alarmSoundDuration : 120;
  els.alarm_sound_duration.value = sd;
  els.alarm_sound_duration_label.textContent = sd;
  els.alarm_flash.checked = config.alarmFlash !== false;
  els.alarm_auto_show.checked = config.alarmAutoShow !== false;
  els.alarm_auto_passthrough.checked = config.alarmAutoPassthrough !== false;
  els.alarm_auto_top.checked = config.alarmAutoTop !== false;
}

async function saveAndApply(nc) {
  const langChanged = nc.language && nc.language !== config.language;
  config = { ...config, ...nc };
  if (config.animType === 'scale') config.animType = 'shrink';
  try { await window.electronAPI.saveConfig(config); } catch (e) {}
  window.electronAPI.notifyClockUpdate(config);
  if (langChanged) applyLanguage(config.language);
}

// [v1.0.5] 设置界面字体大小
function applySettingsFontSize(size) {
  document.body.classList.remove('settings-xs', 'settings-sm', 'settings-md', 'settings-lg', 'settings-xl');
  document.body.classList.add('settings-' + (size || 'md'));
}

(async function init() {
  try { config = await window.electronAPI.getConfig(); } catch (e) { config = {}; }
  syncUIFromConfig();

  // Load alarms
  try { alarmList = await window.electronAPI.getAllAlarms() || []; } catch (e) { alarmList = []; }
  renderAlarmList();

  // Get active alarm IDs (for disabling edit buttons)
  try { activeAlarmIds = await window.electronAPI.getActiveAlarmIds() || { ringingId: null, retryIds: [] }; } catch (e) {}
  renderAlarmList();

  // Listen for alarm updates
  window.electronAPI.onAlarmsUpdated && window.electronAPI.onAlarmsUpdated((alarms) => {
    alarmList = alarms || [];
    renderAlarmList();
  });

  // Listen for active alarm IDs changes
  window.electronAPI.onActiveAlarmIdsChanged && window.electronAPI.onActiveAlarmIdsChanged((ids) => {
    activeAlarmIds = ids || { ringingId: null, retryIds: [] };
    renderAlarmList();
  });

  // 外观
  function syncColorUI(){els.text_color.disabled=els.auto_color.checked;els.bg_color.disabled=els.auto_color.checked;}
  els.auto_color.addEventListener('change', function(){syncColorUI();saveAndApply({autoColor:els.auto_color.checked});});
  els.text_color.addEventListener('input', () => saveAndApply({ color: els.text_color.value }));
  els.bg_color.addEventListener('input', () => saveAndApply({ bgColor: buildBgColor() }));
  els.bg_alpha.addEventListener('input', () => { els.bg_alpha_label.textContent = Math.round(els.bg_alpha.value*100)+'%'; saveAndApply({ bgColor: buildBgColor() }); });
  els.font_select.addEventListener('change', () => {
    if (els.font_select.value === 'custom') { els.font_custom.classList.remove('hidden'); els.font_custom.focus(); }
    else { els.font_custom.classList.add('hidden'); saveAndApply({ fontFamily: els.font_select.value }); }
  });
  els.font_custom.addEventListener('change', () => { const v = els.font_custom.value.trim(); if (v) saveAndApply({ fontFamily: v }); });
  els.font_size.addEventListener('input', () => { const v = parseInt(els.font_size.value,10); els.font_size_label.textContent = v; saveAndApply({ fontSize: v }); });
  els.info_scale.addEventListener('input', () => { const v = parseFloat(els.info_scale.value); els.info_scale_label.textContent = v.toFixed(2); saveAndApply({ infoScale: v }); });
  els.anim_speed.addEventListener('input', function() { var v = parseInt(els.anim_speed.value,10); els.anim_speed_label.textContent = v; saveAndApply({ animDuration: v }); syncAnimUI(); });
  els.anim_type.addEventListener('change', function() { saveAndApply({ animType: els.anim_type.value }); syncAnimUI(); });
  els.stagger_delay.addEventListener('input', function() { var v = parseInt(els.stagger_delay.value,10); els.stagger_delay_label.textContent = v; saveAndApply({ staggerDelay: v }); });
  els.stagger_dir.addEventListener('change', function() { saveAndApply({ staggerDirection: els.stagger_dir.value }); });
  els.blur_enabled.addEventListener('change', function() { saveAndApply({ blurEnabled: els.blur_enabled.checked }); syncAnimUI(); });
  els.blur_duration.addEventListener('input', function() { var v = parseInt(els.blur_duration.value,10); els.blur_duration_label.textContent = v; saveAndApply({ blurDuration: v }); });
  els.blur_strength.addEventListener('input', function() { var v = parseInt(els.blur_strength.value,10); els.blur_strength_label.textContent = v; saveAndApply({ blurStrength: v }); });
  els.scale_in_enabled.addEventListener('change', function() { saveAndApply({ scaleInEnabled: els.scale_in_enabled.checked }); syncAnimUI(); });
  els.scale_factor.addEventListener('input', function() { var v = parseInt(els.scale_factor.value,10); els.scale_factor_label.textContent = v; saveAndApply({ scaleInFactor: v/100 }); });

  els.show_seconds.addEventListener('change', () => saveAndApply({ showSeconds: els.show_seconds.checked }));

  // 日期
  els.show_date.addEventListener('change', () => saveAndApply({ showDate: els.show_date.checked }));
  els.show_weekday.addEventListener('change', () => saveAndApply({ showWeekday: els.show_weekday.checked }));
  els.date_position.addEventListener('change', () => saveAndApply({ datePosition: els.date_position.value }));

  // 多时区
  els.tz_add_btn.addEventListener('click', () => {
    const cur = config.extraTimezones || [];
    if (cur.length >= 2) return;
    const label = els.tz_label.value.trim();
    if (!label) return;
    const offset = parseInt(els.tz_offset.value, 10);
    saveAndApply({ extraTimezones: [...cur, { label, offset }] });
    renderTZList();
    els.tz_label.value = '';
    els.tz_offset.value = '0';
  });

  // 位置
  els.pos_buttons.forEach(btn => btn.addEventListener('click', async () => {
    const p = btn.dataset.pos; els.pos_buttons.forEach(b => b.classList.remove('active')); btn.classList.add('active');
    if (p === 'custom') { els.custom_pos.classList.remove('hidden'); saveAndApply({ positionPreset: 'custom' }); }
    else { els.custom_pos.classList.add('hidden'); await window.electronAPI.moveWindow({ preset: p }); saveAndApply({ positionPreset: p }); }
  }));
  els.apply_pos.addEventListener('click', async () => {
    const x = parseInt(els.pos_x.value,10)||0, y = parseInt(els.pos_y.value,10)||0;
    await window.electronAPI.moveWindow({x,y});
    els.pos_buttons.forEach(b => b.classList.toggle('active', b.dataset.pos === 'custom'));
    saveAndApply({x, y, positionPreset: 'custom'});
  });

  // 系统
  els.layer_mode.addEventListener('change', async () => { await window.electronAPI.setLayerMode(els.layer_mode.value); saveAndApply({ layerMode: els.layer_mode.value }); });
  els.auto_start.addEventListener('change', async () => {
    const en = els.auto_start.checked;
    const r = await window.electronAPI.setAutoStart(en);
    if (!r.success) { els.auto_start.checked = !en; const d=LOCALE[currentLang]||LOCALE.zh; alert(d.autoStartFail+(r.error||d.permissionDenied)); }
    saveAndApply({ autoStart: en });
  });
  els.language_select.addEventListener('change', () => saveAndApply({ language: els.language_select.value }));
  // [v1.0.5] 设置字体大小
  els.settings_font_size.addEventListener('change', () => {
    const v = els.settings_font_size.value;
    applySettingsFontSize(v);
    saveAndApply({ settingsFontSize: v });
  });
  els.passthrough_switch.addEventListener('change', () => {
    const en = els.passthrough_switch.checked;
    window.electronAPI.setPassthrough(en);
    saveAndApply({ passthrough: en });
  });

  // ====== 闹钟 ======
  els.alarm_add_btn.addEventListener('click', () => {
    window.electronAPI.openAlarmEditor(null);
  });

  // ====== 闹钟高级设置 ======
  // Collapse toggle
  els.alarm_advanced_toggle.addEventListener('click', () => {
    const isOpen = !els.alarm_advanced_content.classList.contains('hidden');
    els.alarm_advanced_content.classList.toggle('hidden');
    const label = (LOCALE[currentLang] || LOCALE.zh).alarmAdvanced || '▶ Advanced';
    const text = label.replace(/^[▶▼]\s*/, '');
    els.alarm_advanced_toggle.textContent = (isOpen ? '▶' : '▼') + ' ' + text;
  });

  els.alarm_sound_duration.addEventListener('input', () => {
    const v = parseInt(els.alarm_sound_duration.value, 10);
    els.alarm_sound_duration_label.textContent = v;
    saveAndApply({ alarmSoundDuration: v });
  });
  els.alarm_flash.addEventListener('change', () => {
    saveAndApply({ alarmFlash: els.alarm_flash.checked });
  });
  els.alarm_auto_show.addEventListener('change', () => {
    saveAndApply({ alarmAutoShow: els.alarm_auto_show.checked });
  });
  els.alarm_auto_passthrough.addEventListener('change', () => {
    saveAndApply({ alarmAutoPassthrough: els.alarm_auto_passthrough.checked });
  });
  els.alarm_auto_top.addEventListener('change', () => {
    saveAndApply({ alarmAutoTop: els.alarm_auto_top.checked });
  });

  // ====== [v1.0.5] 删除所有保存的数据 ======
  els.delete_data_btn.addEventListener('click', async () => {
    const dict = LOCALE[currentLang] || LOCALE.zh;
    if (!confirm(dict.confirmDeleteData)) return;
    els.delete_data_btn.disabled = true;
    els.delete_data_btn.textContent = dict.deleteDataSuccess;
    await window.electronAPI.deleteAllData();
    // 重启应用
    window.electronAPI.quitApp();
  });

  window.addEventListener('beforeunload', () => {
    window.electronAPI.saveConfig(config);
    if (typeof alarmRefreshTimer !== 'undefined') { clearInterval(alarmRefreshTimer); alarmRefreshTimer = null; }
  });

  // 时钟窗口被拖动时同步更新位置按钮状态 / 时区变化时同步列表
  window.electronAPI.onConfigUpdated((nc) => {
    if (nc.positionPreset === undefined && nc.x === undefined && nc.y === undefined && nc.extraTimezones === undefined) {
      // Check if any alarm advanced setting changed
      const alarmKeys = ['alarmSoundDuration','alarmFlash','alarmAutoShow','alarmAutoPassthrough','alarmAutoTop'];
      if (!alarmKeys.some(k => nc[k] !== undefined)) return;
    }
    Object.assign(config, nc);
    els.pos_buttons.forEach(b => b.classList.toggle('active', b.dataset.pos === config.positionPreset));
    if (config.positionPreset === 'custom') {
      els.custom_pos.classList.remove('hidden');
      els.pos_x.value = config.x; els.pos_y.value = config.y;
    } else {
      els.custom_pos.classList.add('hidden');
    }
    if (nc.extraTimezones !== undefined) renderTZList();
    // Sync alarm advanced settings
    if (nc.alarmSoundDuration !== undefined) {
      els.alarm_sound_duration.value = nc.alarmSoundDuration;
      els.alarm_sound_duration_label.textContent = nc.alarmSoundDuration;
    }
    if (nc.alarmFlash !== undefined) els.alarm_flash.checked = nc.alarmFlash;
    if (nc.alarmAutoShow !== undefined) els.alarm_auto_show.checked = nc.alarmAutoShow;
    if (nc.alarmAutoPassthrough !== undefined) els.alarm_auto_passthrough.checked = nc.alarmAutoPassthrough;
    if (nc.alarmAutoTop !== undefined) els.alarm_auto_top.checked = nc.alarmAutoTop;
  });

  // [v1.0.5] 每 30 秒刷新闹钟列表以更新倒计时
  let alarmRefreshTimer = setInterval(() => {
    if (alarmList.length > 0) renderAlarmList();
  }, 30000);
})();
