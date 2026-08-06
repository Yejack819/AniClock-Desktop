// lights-off.js — 关灯全屏窗口
const $ = id => document.getElementById(id);

const LIGHTS_OFF_LOCALE = {
  zh: {
    settings: '⚙️ 设置', exit: '✖️ 退出',
    hint: '移动鼠标显示按钮 · 双击背景或按 ESC 退出',
    lockUnlocked: '🔓 未锁定', lockLocked: '🔒 已锁定',
    lockHintLocked: '已锁定 · 仅可按“退出”按钮退出',
    lockHintUnlocked: '已解锁 · 可双击背景或按 ESC 退出',
  },
  en: {
    settings: '⚙️ Settings', exit: '✖️ Exit',
    hint: 'Move mouse to show controls · Double-click background or press ESC to exit',
    lockUnlocked: '🔓 Unlocked', lockLocked: '🔒 Locked',
    lockHintLocked: 'Locked · exit via the Exit button only',
    lockHintUnlocked: 'Unlocked · double-click background or press ESC to exit',
  },
};

let currentLang = 'zh'; // 当前语言，用于锁定按钮文案
let locked = false; // [v1.0.6] 锁定后仅退出按钮可退出

const lockBtn = $('btn-lock');

function applyLanguage(lang) {
  currentLang = LIGHTS_OFF_LOCALE[lang] ? lang : 'zh';
  const dict = LIGHTS_OFF_LOCALE[currentLang];
  document.querySelectorAll('[data-lang]').forEach(element => {
    const key = element.dataset.lang;
    if (dict[key]) element.textContent = dict[key];
  });
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
  renderLockButton();
}

// [v1.0.6] 锁定按钮文案/状态
function renderLockButton() {
  if (!lockBtn) return;
  const dict = LIGHTS_OFF_LOCALE[currentLang] || LIGHTS_OFF_LOCALE.zh;
  lockBtn.textContent = locked ? dict.lockLocked : dict.lockUnlocked;
  lockBtn.title = locked ? dict.lockHintLocked : dict.lockHintUnlocked;
  lockBtn.classList.toggle('locked', locked);
}

// [v1.0.6] 仅更新本地锁定状态（供按钮点击与主进程广播同步共用）
function applyLockState(next) {
  locked = !!next;
  renderLockButton();
  const dict = LIGHTS_OFF_LOCALE[currentLang] || LIGHTS_OFF_LOCALE.zh;
  showHint(locked ? dict.lockHintLocked : dict.lockHintUnlocked);
}

function applyBgColor(color) {
  if (!color) return;
  document.body.style.background = color;
}

// 退出防重复：动画/连击只触发一次
let exiting = false;
async function exitLightsOff() {
  if (exiting) return;
  exiting = true;
  try {
    await window.electronAPI.setLightsOff(false);
  } catch (e) {}
}

// 设置按钮 → 打开设置窗口
$('btn-settings').addEventListener('click', () => {
  window.electronAPI.openSettings();
});

// 退出按钮 → 关闭关灯（主进程会同步配置与状态）
$('btn-exit').addEventListener('click', exitLightsOff);

// 按 ESC 退出关灯模式
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !locked) {
    event.preventDefault();
    exitLightsOff();
  }
});

// 双击背景退出（点击控制按钮不触发）
window.addEventListener('dblclick', event => {
  if (locked) return;
  if (event.target.closest && !event.target.closest('#controls') && !event.target.closest('#btn-lock')) {
    exitLightsOff();
  }
});

// 背景色联动：主进程在配置变化时推送新颜色
window.electronAPI.onLightsOffBgUpdate && window.electronAPI.onLightsOffBgUpdate(color => {
  applyBgColor(color);
});

// 语言联动：设置窗口保存语言后，主进程推送新语言
window.electronAPI.onConfigUpdated && window.electronAPI.onConfigUpdated(config => {
  if (config && config.language) applyLanguage(config.language);
});

// [v1.0.5] 按钮 + 鼠标光标自动隐藏：5 秒无操作隐藏，有操作显示，循环
const controls = $('controls');
const hint = $('hint');
const HIDE_DELAY = 5000; // 5 秒
let hideTimer = null;
let hintTimer = null;

// [v1.0.6] 提示条：设置文字并重新淡出（锁定/解锁时用于反馈）
function showHint(text) {
  if (!hint) return;
  if (text) hint.textContent = text;
  hint.classList.remove('hint-hidden');
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.add('hint-hidden'), 4000);
}

function showControls() {
  controls.classList.remove('controls-hidden');
  if (lockBtn) lockBtn.classList.remove('controls-hidden');
  document.body.classList.remove('no-cursor');
  resetHideTimer();
}

function resetHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    controls.classList.add('controls-hidden');
    if (lockBtn) lockBtn.classList.add('controls-hidden');
    document.body.classList.add('no-cursor');
  }, HIDE_DELAY);
}

window.addEventListener('mousemove', showControls);
window.addEventListener('mousedown', showControls);
window.addEventListener('wheel', showControls);
showControls(); // 初始显示

// [v1.0.6] 锁定按钮：点击切换锁定状态，并同步给主进程（广播到所有关灯窗口/时钟窗口）
if (lockBtn) {
  lockBtn.addEventListener('click', () => {
    const next = !locked;
    applyLockState(next);
    if (window.electronAPI.setLightsOffLock) {
      window.electronAPI.setLightsOffLock(next);
    }
  });
}

// [v1.0.6] 其他关灯窗口/时钟窗口锁定状态变化时同步
window.electronAPI.onLightsOffLockChanged && window.electronAPI.onLightsOffLockChanged(lock => {
  applyLockState(lock);
});

// 初始化：读取当前配置确定背景色
(async function init() {
  try {
    const cfg = await window.electronAPI.getConfig();
    if (!cfg) return;
    applyLanguage(cfg.language || 'zh');
    if (cfg.autoColor) {
      const h = new Date().getHours();
      applyBgColor(h >= 6 && h < 18 ? '#ffffff' : '#000000');
    } else if (cfg.bgColor) {
      // 主进程已存好纯色版本，这里解析 rgba → rgb
      const m = String(cfg.bgColor).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      applyBgColor(m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : cfg.bgColor);
    }
  } catch (e) {}
  // [v1.0.6] 读取主进程当前锁定状态（多显示器重建/重启场景）
  try {
    const lock = await window.electronAPI.getLightsOffLock();
    if (typeof lock === 'boolean') locked = lock;
  } catch (e) {}
  renderLockButton();
  showHint(); // 初始提示开始淡出计时
})();
