// lights-off.js — 关灯全屏窗口
const $ = id => document.getElementById(id);

function applyBgColor(color) {
  if (!color) return;
  document.body.style.background = color;
}

// 设置按钮 → 打开设置窗口
$('btn-settings').addEventListener('click', () => {
  window.electronAPI.openSettings();
});

// 退出按钮 → 关闭关灯（主进程会同步配置与状态）
$('btn-exit').addEventListener('click', async () => {
  await window.electronAPI.setLightsOff(false);
});

// 背景色联动：主进程在配置变化时推送新颜色
window.electronAPI.onLightsOffBgUpdate && window.electronAPI.onLightsOffBgUpdate(color => {
  applyBgColor(color);
});

// [v1.0.5] 按钮 + 鼠标光标自动隐藏：5 秒无操作隐藏，有操作显示，循环
const controls = $('controls');
const HIDE_DELAY = 5000; // 5 秒
let hideTimer = null;

function showControls() {
  controls.classList.remove('controls-hidden');
  document.body.classList.remove('no-cursor');
  resetHideTimer();
}

function resetHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    controls.classList.add('controls-hidden');
    document.body.classList.add('no-cursor');
  }, HIDE_DELAY);
}

window.addEventListener('mousemove', showControls);
window.addEventListener('mousedown', showControls);
window.addEventListener('wheel', showControls);
showControls(); // 初始显示

// 初始化：读取当前配置确定背景色
(async function init() {
  try {
    const cfg = await window.electronAPI.getConfig();
    if (!cfg) return;
    if (cfg.autoColor) {
      const h = new Date().getHours();
      applyBgColor(h >= 6 && h < 18 ? '#ffffff' : '#000000');
    } else if (cfg.bgColor) {
      // 主进程已存好纯色版本，这里解析 rgba → rgb
      const m = String(cfg.bgColor).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      applyBgColor(m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : cfg.bgColor);
    }
  } catch (e) {}
})();
