// welcome.js
let currentPage = 1;
const totalPages = 3;
let langInitialized = false;

const $ = id => document.getElementById(id);
const pages = [null, $('page-1'), $('page-2'), $('page-3')];
const dots = document.querySelectorAll('.dot');

// Localization dict
const LOCALE = {
  zh: {
    welcomeTitle: '欢迎使用桌面大时钟',
    welcomeSubtitle: '选择你的语言 / Choose your language',
    trayTitle: '系统托盘操作说明',
    trayDesc1: '关闭此窗口后，你可以在系统托盘中找到',
    trayIconLabel: '大时钟图标',
    leftClick: '左键单击',
    rightClick: '右键单击',
    trayLeft: '显示 / 隐藏时钟窗口',
    trayRight: '打开设置 或 退出程序',
    thanksTitle: '感谢使用！',
    thanksSubtitle: '大时钟已准备就绪，点击"完成"开始使用',
    btnNext: '下一步',
    btnBack: '上一步',
    btnFinish: '完成',
  },
  en: {
    welcomeTitle: 'Welcome to Digital Clock',
    welcomeSubtitle: 'Choose your language',
    trayTitle: 'System Tray Guide',
    trayDesc1: 'After closing this window, find the',
    trayIconLabel: 'Digital Clock icon',
    leftClick: 'Left Click',
    rightClick: 'Right Click',
    trayLeft: 'Show / Hide the clock window',
    trayRight: 'Open settings or Quit',
    thanksTitle: 'Thank you!',
    thanksSubtitle: 'Your clock is ready. Click "Finish" to start.',
    btnNext: 'Next',
    btnBack: 'Back',
    btnFinish: 'Finish',
  },
};

function applyLanguage(lang) {
  const dict = LOCALE[lang] || LOCALE.zh;
  document.querySelectorAll('[data-lang]').forEach(el => {
    const key = el.dataset.lang;
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
}

function showPage(page) {
  pages.forEach((p, i) => {
    if (i === 0) return;
    p.classList.toggle('hidden', i !== page);
  });
  dots.forEach((d, i) => {
    d.classList.toggle('active', i + 1 === page);
  });
  currentPage = page;
}

function nextPage() {
  if (currentPage < totalPages) showPage(currentPage + 1);
}

function prevPage() {
  if (currentPage > 1) showPage(currentPage - 1);
}

// Initialize
(async function init() {
  // Load existing config for language
  let config = {};
  try { config = await window.electronAPI.getConfig(); } catch (e) {}
  const lang = config.language || 'zh';
  $('lang-select').value = lang;
  applyLanguage(lang);
  // If language was already saved, enable Next button
  if (config.language) {
    $('btn-next-1').disabled = false;
  }
  langInitialized = true;

  // Language change → auto-save (先加载完整 config，合并后保存)
  $('lang-select').addEventListener('change', async () => {
    const selected = $('lang-select').value;
    applyLanguage(selected);
    try {
      let cfg = await window.electronAPI.getConfig();
      cfg.language = selected;
      await window.electronAPI.saveConfig(cfg);
      await window.electronAPI.notifyClockUpdate({ language: selected });
    } catch (e) {}
    $('btn-next-1').disabled = false;
  });

  // Navigation
  $('btn-next-1').addEventListener('click', nextPage);
  $('btn-next-2').addEventListener('click', nextPage);
  $('btn-back-2').addEventListener('click', prevPage);
  $('btn-back-3').addEventListener('click', prevPage);

  // Finish
  $('btn-finish').addEventListener('click', async () => {
    await window.electronAPI.finishWelcome();
  });
})();
