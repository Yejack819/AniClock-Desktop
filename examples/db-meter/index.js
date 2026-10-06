/* index.js — 分贝仪  (db-meter v1.1.0)
 *
 * 两个钩子，一套渲染器：
 *   lightsOff.background —— 关灯背景板上的实时仪表（9 种样式、九宫格定位、昼夜自动配色）
 *   settings.theme       —— 设置窗口左侧导航里的「分贝仪」页（实时预览 + 一键校准 + 全部设置）
 *
 * 运行环境：宿主下发的 dc 对象（没有 require / Node / Electron），页面是 file:// 安全上下文，
 * 所以 navigator.mediaDevices / AudioContext 可以直接用。
 *
 * 原理：getUserMedia（关掉 AGC / 降噪 / 回声消除，否则电平会被自动增益拉平）
 *   → MediaStreamSource → AnalyserNode.getFloatTimeDomainData
 *   → RMS → dBFS = 20*log10(rms) → 显示值 = dBFS + 校准偏移（默认 94）
 *
 * 两条宿主约束决定了设置页的设计（与 examples/stopwatch 一致）：
 *   1) dc.settings 是 Object.freeze 的只读副本，写回只能走 electronAPI.setPluginSetting，
 *      而它每写一项就广播 + 重新运行插件 —— 所以设置页是「草稿 + 显式保存」。
 *   2) 重载后导航页整块重建，宿主会把用户退回「插件」页 —— 所以把「停在本页」记在 window 上，
 *      重挂载后自动切回来。
 */

/* ============================ 0. 文案（中英跟随宿主语言） ============================ */
const TEXT = {
  zh: {
    unit: 'dB', peak: '峰值', paused: '已暂停', calibrating: '校准中…',
    noMic: '浏览器不支持麦克风', denied: '麦克风被拒绝', micErr: '麦克风不可用',
    mode: { quiet: '自习', loud: '早读' },
    word: {
      quiet: { good: '安静', warn: '一般', bad: '吵闹' },
      loud: { good: '洪亮', warn: '一般', bad: '太静' },
    },
    // —— 设置页 ——
    navTitle: '分贝仪',
    pvIdle: '离开本页时自动释放麦克风',
    pvStarting: '正在申请麦克风…',
    pvReady: '麦克风就绪',
    pvBg: '预览底色',
    pvBgAuto: '跟随',
    pvBgDark: '深',
    pvBgLight: '浅',
    pvCap: '预览上限 150%',
    calTitle: '一键校准',
    calDesc: '把读数对齐到真实环境：先采样 1.6 秒环境底噪，再让「安静时的读数」等于下面的校准目标值。',
    calEnv: '当前环境',
    calBtn: '把当前环境设为 {v} dB',
    calSampling: '采样中…',
    calDone: '已按当前环境校准，记得点保存',
    calAutoOff: '已关闭自动校准，改用这个固定偏移',
    gLook: '外观与定位',
    gJudge: '判读阈值',
    gCal: '校准',
    gAdvLook: '颜色与尺寸',
    gAdvRead: '读数与显示',
    gAdvPerf: '范围与性能',
    advShow: '▶ 高级设置',
    advHide: '▼ 高级设置',
    save: '保存',
    discard: '放弃',
    noChange: '没有改动',
    changedN: '已改 {n} 项',
    saved: '已保存',
    loadingFields: '正在读取设置定义…',
    noFields: '读不到设置定义，请在插件卡片里点一次「重新加载」',
    applyHint: '改动只在点「保存」后写入',
  },
  en: {
    unit: 'dB', peak: 'Peak', paused: 'Paused', calibrating: 'Calibrating…',
    noMic: 'Microphone unsupported', denied: 'Microphone denied', micErr: 'Microphone unavailable',
    mode: { quiet: 'Study', loud: 'Reading' },
    word: {
      quiet: { good: 'Quiet', warn: 'Fair', bad: 'Noisy' },
      loud: { good: 'Loud', warn: 'Fair', bad: 'Too quiet' },
    },
    navTitle: 'Sound Meter',
    pvIdle: 'Microphone is released when you leave this page',
    pvStarting: 'Requesting microphone…',
    pvReady: 'Microphone ready',
    pvBg: 'Preview background',
    pvBgAuto: 'Auto',
    pvBgDark: 'Dark',
    pvBgLight: 'Light',
    pvCap: 'preview caps at 150%',
    calTitle: 'One-tap calibration',
    calDesc: 'Align the reading with reality: the plugin samples the ambient floor for 1.6 s, then maps it to the target below.',
    calEnv: 'Ambient',
    calBtn: 'Set ambient to {v} dB',
    calSampling: 'Sampling…',
    calDone: 'Calibrated to the current room — remember to save',
    calAutoOff: 'Auto-calibrate turned off; this offset is now used',
    gLook: 'Look & layout',
    gJudge: 'Thresholds',
    gCal: 'Calibration',
    gAdvLook: 'Colours & size',
    gAdvRead: 'Reading & display',
    gAdvPerf: 'Range & performance',
    advShow: '▶ Advanced',
    advHide: '▼ Advanced',
    save: 'Save',
    discard: 'Discard',
    noChange: 'No changes',
    changedN: '{n} changed',
    saved: 'Saved',
    loadingFields: 'Loading setting definitions…',
    noFields: 'Setting definitions unavailable — reload the plugin from its card',
    applyHint: 'written on Save only',
  },
};

/* ---- 语言探测 ----
 * [v1.0.5.7] 隔离后插件看不见宿主 DOM，无法再读宿主 [data-lang] 节点。
 * 改为同步缓存宿主语言：挂载时用 dc.ui.getHostLang() 取一次，之后由 dc.ui.onHostLangChanged 推送。 */
let __dbmHostLang = null;
function langNow() {
  if (__dbmHostLang === 'zh' || __dbmHostLang === 'en') return __dbmHostLang;
  // iframe 自身的 lang（宿主注入 srcdoc 时未设 → 兜底 zh）
  return /^en/i.test(String((document.documentElement && document.documentElement.lang) || '')) ? 'en' : 'zh';
}

/* ============================ 1. 设置读取 ============================ */
const STYLE_KEYS = ['classic', 'minimal', 'ring', 'bar', 'pill', 'text', 'gauge', 'pulse', 'wave'];
const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
const SET_CARD = ['auto', 'dark', 'light', 'none'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexA = (hexColor, a) => {
  const m = String(hexColor).replace('#', '');
  if (m.length < 6) return 'rgba(0,0,0,' + a + ')';
  return 'rgba(' + parseInt(m.slice(0, 2), 16) + ',' + parseInt(m.slice(2, 4), 16) + ',' + parseInt(m.slice(4, 6), 16) + ',' + a + ')';
};

// 宿主已按类型收敛过一遍，这里再兜一层，任何脏值都不会带进渲染
function readCfg(S) {
  const num = (v, min, max, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, min, max) : d;
  };
  const oneOf = (v, list, d) => (list.indexOf(String(v)) >= 0 ? String(v) : d);
  const hex = (v, d) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : d);
  const bool = v => v === true || v === 'true';

  const cfg = {
    style: oneOf(S.style, STYLE_KEYS, 'classic'),
    position: oneOf(S.position, POSITIONS, 'center'),
    margin: num(S.margin, 0, 600, 48),
    scale: num(S.scale, 40, 400, 100),
    opacity: num(S.opacity, 5, 100, 92),
    card: oneOf(S.card, SET_CARD, 'auto'),
    mode: oneOf(S.mode, ['quiet', 'loud'], 'quiet'),
    low: num(S.low, 10, 130, 55),
    high: num(S.high, 10, 140, 70),
    good: hex(S.goodColor, '#5dcaa5'),
    warn: hex(S.warnColor, '#ef9f27'),
    bad: hex(S.badColor, '#e24b4a'),
    autoCal: bool(S.autoCal),
    calTarget: num(S.calTarget, 20, 80, 40),
    calibration: num(S.calibration, 40, 140, 94),
    smooth: num(S.smooth, 0, 95, 70) / 100,
    showMode: bool(S.showMode),
    showWord: bool(S.showWord),
    showPeak: bool(S.showPeak),
    fps: num(S.fps, 4, 30, 12),
    rangeMin: num(S.rangeMin, 0, 90, 30),
    rangeMax: num(S.rangeMax, 40, 140, 90),
    clickPause: bool(S.clickPause),
  };
  if (cfg.rangeMax - cfg.rangeMin < 10) cfg.rangeMax = cfg.rangeMin + 10;
  return cfg;
}

/* ============================ 2. 仪表渲染器（关灯背景板与设置预览共用） ============================
 * createMeter(cfg, dict, log)：
 *   cfg 传的是**同一个对象**（调用方用 Object.assign 原地更新，这里就能实时看到草稿值）；
 *   换语言 → setDict() + build()；换样式 → build(styleKey)。
 * 返回 { card, build, update, setScale, setTheme, setDict, setAnalyser }。
 */
function createMeter(cfg, dict, log) {
  const card = document.createElement('div');
  const waveBuf = new Uint8Array(1024);
  let ui = {};
  let styleKey = '';
  let analyser = null;
  let lastLevel = '';
  let bumpTimer = null;

  const dead = c => !!(c.err || c.paused);
  const colorOf = lv => (lv === 'good' ? cfg.good : lv === 'warn' ? cfg.warn : cfg.bad);
  const frac = v => clamp((v - cfg.rangeMin) / (cfg.rangeMax - cfg.rangeMin), 0, 1);

  function setNum(text, color) {
    if (!ui.num) return;
    ui.num.textContent = String(text);
    ui.num.style.color = color || '';
    ui.num.classList.toggle('dbm-dim', !color);
  }
  function label(c) {
    if (c.calibrating) return dict.calibrating;
    const parts = [];
    if (cfg.showMode) parts.push(dict.mode[cfg.mode]);
    if (cfg.showWord) parts.push(dict.word[cfg.mode][c.level]);
    if (cfg.showPeak) parts.push(dict.peak + ' ' + Math.round(c.peak));
    return parts.join(' · ');
  }
  function pillLabel(c) {
    if (c.calibrating) return dict.calibrating;
    return cfg.showWord ? dict.word[cfg.mode][c.level] : dict.mode[cfg.mode];
  }

  const buildWrappers = {};
  const updates = {};

  /* --- 经典：大数字 + 状态灯 + 模式标签 --- */
  buildWrappers.classic = () => {
    card.innerHTML =
      '<div class="dbm-row dbm-baseline"><span class="dbm-num" style="font-size:2.3em"></span>' +
      '<span class="dbm-unit">' + dict.unit + '</span></div>' +
      '<div class="dbm-row"><span class="dbm-dot"></span><span class="dbm-lab"></span></div>';
    ui = { num: card.querySelector('.dbm-num'), dot: card.querySelector('.dbm-dot'), lab: card.querySelector('.dbm-lab') };
  };
  updates.classic = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.dot.style.background = 'var(--dbm-dim)';
      ui.dot.style.boxShadow = 'none';
      ui.lab.textContent = c.err || dict.paused;
      return;
    }
    const col = colorOf(c.level);
    setNum(Math.round(c.db), col);
    ui.dot.style.background = col;
    ui.dot.style.boxShadow = '0 0 0.6em ' + col;
    ui.lab.textContent = label(c);
  };

  /* --- 极简：只有数字 --- */
  buildWrappers.minimal = () => {
    card.innerHTML =
      '<div class="dbm-row dbm-baseline" style="gap:.3em">' +
      '<span class="dbm-num" style="font-size:2.6em"></span>' +
      '<span class="dbm-unit" style="font-size:.82em">' + dict.unit + '</span></div>' +
      '<div class="dbm-lab"></div>';
    ui = { num: card.querySelector('.dbm-num'), lab: card.querySelector('.dbm-lab') };
  };
  updates.minimal = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.lab.textContent = c.err || '';
      return;
    }
    setNum(Math.round(c.db), colorOf(c.level));
    ui.lab.textContent = cfg.showPeak ? dict.peak + ' ' + Math.round(c.peak) : '';
  };

  /* --- 圆环：环形进度 + 数字 --- */
  const RING_R = 22;
  const RING_C = 2 * Math.PI * RING_R;
  buildWrappers.ring = () => {
    card.innerHTML =
      '<svg class="dbm-svg" viewBox="0 0 52 52" style="width:3.4em;height:3.4em">' +
      '<circle cx="26" cy="26" r="' + RING_R + '" fill="none" stroke="var(--dbm-track)" stroke-width="5"/>' +
      '<circle class="dbm-arc" cx="26" cy="26" r="' + RING_R + '" fill="none" stroke="var(--dbm-dim)" stroke-width="5" ' +
      'stroke-linecap="round" stroke-dasharray="' + RING_C.toFixed(1) + '" stroke-dashoffset="' + RING_C.toFixed(1) + '" ' +
      'transform="rotate(-90 26 26)"/></svg>' +
      '<div class="dbm-col" style="gap:.22em">' +
      '<div class="dbm-row dbm-baseline" style="gap:.25em">' +
      '<span class="dbm-num" style="font-size:1.55em"></span><span class="dbm-unit"></span></div>' +
      '<div class="dbm-lab"></div></div>';
    ui = {
      num: card.querySelector('.dbm-num'),
      unit: card.querySelector('.dbm-unit'),
      arc: card.querySelector('.dbm-arc'),
      lab: card.querySelector('.dbm-lab'),
    };
    ui.unit.textContent = dict.unit;
  };
  updates.ring = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.arc.setAttribute('stroke-dashoffset', RING_C.toFixed(1));
      ui.arc.setAttribute('stroke', 'var(--dbm-dim)');
      ui.lab.textContent = c.err || dict.paused;
      return;
    }
    const col = colorOf(c.level);
    setNum(Math.round(c.db), col);
    ui.arc.setAttribute('stroke', col);
    ui.arc.setAttribute('stroke-dashoffset', (RING_C * (1 - frac(c.db))).toFixed(1));
    ui.lab.textContent = label(c);
  };

  /* --- 光条：数字 + 底部进度条 + 峰值刻度 --- */
  buildWrappers.bar = () => {
    card.innerHTML =
      '<div class="dbm-row dbm-baseline" style="gap:.3em">' +
      '<span class="dbm-num" style="font-size:1.9em"></span><span class="dbm-unit"></span></div>' +
      '<div class="dbm-track"><i></i><span class="dbm-peak-mark"></span></div>';
    ui = {
      num: card.querySelector('.dbm-num'),
      unit: card.querySelector('.dbm-unit'),
      fill: card.querySelector('.dbm-track > i'),
      mark: card.querySelector('.dbm-peak-mark'),
    };
    ui.unit.textContent = dict.unit;
  };
  updates.bar = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.fill.style.width = '0%';
      ui.fill.style.background = 'var(--dbm-dim)';
      ui.mark.style.opacity = '0';
      return;
    }
    const col = colorOf(c.level);
    setNum(Math.round(c.db), col);
    ui.fill.style.background = col;
    ui.fill.style.boxShadow = '0 0 0.7em ' + hexA(col, 0.6);
    ui.fill.style.width = (frac(c.db) * 100).toFixed(1) + '%';
    ui.mark.style.opacity = cfg.showPeak ? '0.6' : '0';
    ui.mark.style.left = 'calc(' + (frac(c.peak) * 100).toFixed(1) + '% - 0.06em)';
  };

  /* --- 胶囊：状态色胶囊包裹数字 --- */
  buildWrappers.pill = () => {
    card.innerHTML =
      '<div class="dbm-pill"><span class="dbm-num" style="font-size:1.9em"></span>' +
      '<span class="dbm-pill-lab"></span></div>';
    ui = {
      pill: card.querySelector('.dbm-pill'),
      num: card.querySelector('.dbm-num'),
      lab: card.querySelector('.dbm-pill-lab'),
    };
  };
  updates.pill = c => {
    if (dead(c)) {
      setNum('--', '#ffffff');
      ui.pill.style.background = 'rgba(128,128,128,0.45)';
      ui.pill.style.boxShadow = 'none';
      ui.lab.textContent = c.err || dict.paused;
      return;
    }
    const col = colorOf(c.level);
    setNum(Math.round(c.db), '#ffffff');
    ui.pill.style.background = col;
    ui.pill.style.boxShadow = '0 0.5em 1.6em ' + hexA(col, 0.42);
    ui.lab.textContent = pillLabel(c);
  };

  /* --- 状态词：大字状态 + 小数字 --- */
  buildWrappers.text = () => {
    card.innerHTML = '<div class="dbm-word"></div><div class="dbm-lab"></div>';
    ui = { word: card.querySelector('.dbm-word'), lab: card.querySelector('.dbm-lab') };
  };
  updates.text = c => {
    if (dead(c)) {
      ui.word.textContent = c.err || dict.paused;
      ui.word.style.color = 'var(--dbm-dim)';
      ui.lab.textContent = c.err ? '' : '-- ' + dict.unit;
      return;
    }
    ui.word.textContent = dict.word[cfg.mode][c.level];
    ui.word.style.color = colorOf(c.level);
    const parts = [Math.round(c.db) + ' ' + dict.unit];
    if (cfg.showMode) parts.push(dict.mode[cfg.mode]);
    if (cfg.showPeak) parts.push(dict.peak + ' ' + Math.round(c.peak));
    ui.lab.textContent = parts.join(' · ');
  };

  /* --- 弧形表：半圆仪表 --- */
  const GAUGE_LEN = Math.PI * 26;
  buildWrappers.gauge = () => {
    card.innerHTML =
      '<svg class="dbm-svg" viewBox="0 0 80 50" style="width:5.2em;height:3.25em">' +
      '<path d="M 14 44 A 26 26 0 0 1 66 44" fill="none" stroke="var(--dbm-track)" stroke-width="6" stroke-linecap="round"/>' +
      '<path class="dbm-arc" d="M 14 44 A 26 26 0 0 1 66 44" fill="none" stroke="var(--dbm-dim)" stroke-width="6" ' +
      'stroke-linecap="round" stroke-dasharray="' + GAUGE_LEN.toFixed(1) + '" stroke-dashoffset="' + GAUGE_LEN.toFixed(1) + '"/></svg>' +
      '<div class="dbm-col" style="gap:.2em">' +
      '<div class="dbm-row dbm-baseline" style="gap:.25em">' +
      '<span class="dbm-num" style="font-size:1.6em"></span><span class="dbm-unit"></span></div>' +
      '<div class="dbm-lab"></div></div>';
    ui = {
      num: card.querySelector('.dbm-num'),
      unit: card.querySelector('.dbm-unit'),
      arc: card.querySelector('.dbm-arc'),
      lab: card.querySelector('.dbm-lab'),
    };
    ui.unit.textContent = dict.unit;
  };
  updates.gauge = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.arc.setAttribute('stroke-dashoffset', GAUGE_LEN.toFixed(1));
      ui.arc.setAttribute('stroke', 'var(--dbm-dim)');
      ui.lab.textContent = c.err || dict.paused;
      return;
    }
    const col = colorOf(c.level);
    setNum(Math.round(c.db), col);
    ui.arc.setAttribute('stroke', col);
    ui.arc.setAttribute('stroke-dashoffset', (GAUGE_LEN * (1 - frac(c.db))).toFixed(1));
    ui.lab.textContent = label(c);
  };

  /* --- 呼吸灯：状态灯随音量呼吸 + 数字 --- */
  buildWrappers.pulse = () => {
    card.innerHTML =
      '<span class="dbm-dot dbm-breathe"></span>' +
      '<div class="dbm-row dbm-baseline" style="gap:.3em">' +
      '<span class="dbm-num" style="font-size:1.8em"></span><span class="dbm-unit"></span></div>';
    ui = { num: card.querySelector('.dbm-num'), unit: card.querySelector('.dbm-unit'), dot: card.querySelector('.dbm-dot') };
    ui.unit.textContent = dict.unit;
  };
  updates.pulse = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.dot.style.background = 'var(--dbm-dim)';
      ui.dot.style.animation = 'none';
      return;
    }
    const col = colorOf(c.level);
    setNum(Math.round(c.db), col);
    ui.dot.style.background = col;
    ui.dot.style.boxShadow = '0 0 1em ' + col;
    const speed = c.level === 'good' ? 2.2 : c.level === 'warn' ? 1.3 : 0.72;
    ui.dot.style.animation = 'dbm-breathe ' + speed + 's ease-in-out infinite';
  };

  /* --- 波形：实时声波 --- */
  buildWrappers.wave = () => {
    card.innerHTML =
      '<canvas class="dbm-wave"></canvas>' +
      '<div class="dbm-row dbm-baseline" style="gap:.3em">' +
      '<span class="dbm-num" style="font-size:1.4em"></span><span class="dbm-unit"></span>' +
      '<span class="dbm-lab" style="margin-left:.6em"></span></div>';
    const cv = card.querySelector('.dbm-wave');
    ui = {
      num: card.querySelector('.dbm-num'),
      unit: card.querySelector('.dbm-unit'),
      lab: card.querySelector('.dbm-lab'),
      cv: cv,
      ctx2d: cv.getContext('2d'),
    };
    ui.unit.textContent = dict.unit;
  };
  updates.wave = c => {
    if (dead(c)) {
      setNum('--', null);
      ui.lab.textContent = c.err || dict.paused;
    } else {
      setNum(Math.round(c.db), colorOf(c.level));
      ui.lab.textContent = cfg.showWord ? dict.word[cfg.mode][c.level] : '';
    }
    drawWave(c);
  };

  function drawWave(c) {
    const cv = ui.cv;
    const g = ui.ctx2d;
    if (!cv || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(cv.clientWidth * dpr));
    const h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    g.clearRect(0, 0, w, h);
    const col = dead(c) ? 'rgba(128,128,128,0.5)' : colorOf(c.level);
    g.strokeStyle = 'rgba(128,128,128,0.28)';
    g.lineWidth = Math.max(1, dpr * 0.5);
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    if (!analyser || dead(c)) return;
    // 时域波形（2048 点抽稀到画布宽度）；乘视觉增益让安静环境也看得出起伏，声大时 tanh 平滑饱和
    analyser.getByteTimeDomainData(waveBuf);
    const n = waveBuf.length;
    const gain = 12;
    g.strokeStyle = col;
    g.lineWidth = Math.max(1.5, dpr * 1.2);
    g.lineJoin = 'round';
    g.beginPath();
    const step = n / w;
    for (let x = 0; x < w; x++) {
      const v = Math.tanh(((waveBuf[Math.floor(x * step)] - 128) / 128) * gain);
      const y = h / 2 - v * (h / 2 - dpr);
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }

  function bump() {
    card.classList.remove('dbm-bump');
    void card.offsetWidth; // 强制回流，让动画能重播
    card.classList.add('dbm-bump');
    if (bumpTimer) clearTimeout(bumpTimer);
    bumpTimer = setTimeout(() => card.classList.remove('dbm-bump'), 360);
  }

  function build(key) {
    styleKey = STYLE_KEYS.indexOf(key) >= 0 ? key : 'classic';
    const stacked = styleKey === 'minimal' || styleKey === 'bar' || styleKey === 'text' || styleKey === 'wave';
    card.className = 'dbm-card dbm-card-' + styleKey + (stacked ? ' dbm-stack' : '');
    (buildWrappers[styleKey] || buildWrappers.classic)();
  }

  function setScale(basePx) {
    card.style.fontSize = Math.round(basePx * 100) / 100 + 'px';
  }

  // dark=true 深色玻璃；bare=true 无卡片（纯文字，用阴影提对比）
  function setTheme(dark, bare) {
    card.style.setProperty('--dbm-fg', dark ? 'rgba(255,255,255,0.95)' : 'rgba(18,18,24,0.93)');
    card.style.setProperty('--dbm-dim', dark ? 'rgba(255,255,255,0.48)' : 'rgba(18,18,24,0.46)');
    card.style.setProperty('--dbm-track', dark ? 'rgba(255,255,255,0.15)' : 'rgba(18,18,24,0.13)');
    card.style.setProperty('--dbm-bg', bare ? 'transparent' : dark ? 'rgba(20,21,28,0.62)' : 'rgba(255,255,255,0.66)');
    card.style.setProperty('--dbm-bd', bare ? 'transparent' : dark ? 'rgba(255,255,255,0.14)' : 'rgba(18,18,24,0.10)');
    card.style.setProperty('--dbm-shadow', bare ? 'none' : dark ? '0 0.6em 2.4em rgba(0,0,0,0.34)' : '0 0.6em 2.4em rgba(20,20,40,0.16)');
    card.style.backdropFilter = bare ? 'none' : 'blur(18px) saturate(1.35)';
    card.style.webkitBackdropFilter = bare ? 'none' : 'blur(18px) saturate(1.35)';
    card.style.textShadow = bare ? '0 0.06em 0.55em rgba(0,0,0,0.22)' : 'none';
  }

  function update(state) {
    // 档位变化时轻微弹一下（背景板与预览共用这套动效）
    if (state.level && state.level !== lastLevel) {
      const first = !lastLevel;
      lastLevel = state.level;
      if (!first) bump();
    }
    try {
      (updates[styleKey] || updates.classic)(state);
    } catch (e) {
      if (typeof log === 'function') log('draw error: ' + (e && e.message));
    }
  }

  return {
    card: card,
    build: build,
    update: update,
    setScale: setScale,
    setTheme: setTheme,
    setAnalyser: a => { analyser = a; },
    setDict: d => { dict = d; },
  };
}

/* ============================ 3. 关灯背景板 ============================ */
dc.mount(function (slot, api) {
  if (api.hook !== 'lightsOff.background' || !slot) return;

  let dict = TEXT[langNow()];
  const cfg = readCfg(api.settings || {});
  const meter = createMeter(cfg, dict, api.log);

  /* ---- 舞台：铺满一层，九宫格定位 ---- */
  const stage = slot;
  stage.classList.add('dbm-stage', 'dbm-enter', 'dbm-style-' + cfg.style);

  const align = (pos => {
    if (pos === 'center') return ['center', 'center'];
    const parts = pos.split('-');
    const v = parts[0] === 'top' ? 'flex-start' : parts[0] === 'bottom' ? 'flex-end' : 'center';
    const h = parts[1] === 'left' ? 'flex-start' : parts[1] === 'right' ? 'flex-end' : 'center';
    return [v, h];
  })(cfg.position);

  stage.style.position = 'absolute';
  stage.style.left = '0';
  stage.style.top = '0';
  stage.style.right = '0';
  stage.style.bottom = '0';
  stage.style.display = 'flex';
  stage.style.alignItems = align[0];
  stage.style.justifyContent = align[1];
  stage.style.padding = cfg.margin + 'px';
  stage.style.opacity = String(cfg.opacity / 100);
  stage.style.pointerEvents = 'none'; // 整层不吃事件，保证「双击背景退出关灯」永远有效
  stage.style.zIndex = '0';

  meter.setScale((16 * cfg.scale) / 100);
  meter.build(cfg.style);
  meter.card.style.pointerEvents = cfg.clickPause ? 'auto' : 'none';
  if (cfg.clickPause) meter.card.style.cursor = 'pointer';
  stage.appendChild(meter.card);

  // 入场动画结束后摘掉标记类，把 animation 让给「分档换色」的轻微弹跳
  setTimeout(() => stage.classList.remove('dbm-enter'), 760);

  /* ---- 主题：深浅卡片随背景板实际亮暗自动切 ---- */
  function applyTheme() {
    const bare = cfg.card === 'none';
    const dark = cfg.card === 'dark' ? true : cfg.card === 'light' ? false : api.theme().isDark;
    meter.setTheme(dark, bare);
  }
  applyTheme();

  /* ---- 运行时状态 ---- */
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let samples = null;
  let rafId = 0;
  let disposed = false;
  let paused = false;
  let errText = '';
  let level = 'good';
  let smoothDb = null;
  let peakDb = 0;
  let offsetNow = cfg.calibration;
  let calibrating = cfg.autoCal;
  let calSamples = [];
  let calUntil = 0;
  let lastSampleAt = 0;
  let lastThemeAt = 0;

  // 自习：越静越好；早读：越响亮越好。带 1.5dB 迟滞，读数在阈值附近抖动时不会来回跳档。
  const HYS = 1.5;
  function levelOf(v, cur) {
    if (cfg.mode === 'loud') {
      if (cur === 'good') return v > cfg.high - HYS ? 'good' : v > cfg.low ? 'warn' : 'bad';
      return v > cfg.high + HYS ? 'good' : v > cfg.low - HYS ? 'warn' : 'bad';
    }
    if (cur === 'good') return v < cfg.low + HYS ? 'good' : v < cfg.high ? 'warn' : 'bad';
    return v < cfg.low - HYS ? 'good' : v < cfg.high + HYS ? 'warn' : 'bad';
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    if (disposed) return;
    const now = performance.now();
    if (now - lastSampleAt < 1000 / cfg.fps) return;
    const dt = lastSampleAt ? (now - lastSampleAt) / 1000 : 1 / cfg.fps;
    lastSampleAt = now;
    // 每秒复查一次主题：昼夜切换 / 用户改背景色时卡片跟着变
    if (now - lastThemeAt > 1000) { lastThemeAt = now; applyTheme(); }
    if (paused || errText || !analyser) return;
    sample(dt);
  }

  function sample(dt) {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const dbfs = 20 * Math.log10(rms > 1e-7 ? rms : 1e-7);

    if (calibrating) {
      calSamples.push(dbfs);
      if (performance.now() >= calUntil && calSamples.length > 4) {
        let s = 0;
        for (let i = 0; i < calSamples.length; i++) s += calSamples[i];
        offsetNow = clamp(cfg.calTarget - s / calSamples.length, 40, 140);
        calibrating = false;
        smoothDb = null;
        peakDb = 0;
      }
    }

    const db = clamp(dbfs + offsetNow, 0, 199);
    smoothDb = smoothDb === null ? db : smoothDb + (db - smoothDb) * (1 - cfg.smooth);
    peakDb = Math.max(smoothDb, peakDb - 12 * dt); // 跟涨，12 dB/s 回落

    level = levelOf(smoothDb, level);
    draw();
  }

  function draw() {
    meter.update({
      db: smoothDb === null ? 0 : smoothDb,
      peak: peakDb,
      level: level,
      paused: paused,
      err: errText,
      calibrating: calibrating,
    });
  }

  /* ---- 麦克风 ---- */
  function stopAudio() {
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch (e) {}
    stream = null;
    audioCtx = null;
    analyser = null;
    samples = null;
    meter.setAnalyser(null);
  }

  async function startAudio() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(dict.noMic);
      // 三个处理必须关掉：自动增益会把电平拉平，分贝就失真了
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (disposed) { stopAudio(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      samples = new Float32Array(analyser.fftSize);
      src.connect(analyser); // 不接 destination：不发声、不回授
      meter.setAnalyser(analyser);
      if (cfg.autoCal) {
        calibrating = true;
        calSamples = [];
        calUntil = performance.now() + 1600;
      }
      api.log('麦克风就绪 · ' + (stream.getAudioTracks()[0] || {}).label);
    } catch (e) {
      errText = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? dict.denied : dict.micErr;
      api.log('麦克风不可用: ' + (e && (e.name || e.message)));
    }
    draw();
  }

  if (cfg.clickPause) {
    meter.card.addEventListener('click', () => {
      paused = !paused;
      if (paused) { peakDb = 0; smoothDb = null; }
      draw();
    });
  }

  /* ---- 语言跟随 ---- */
  // [v1.0.5.7] 隔离后改为「向宿主要初值 + 订阅推送」，不再自己盯宿主 DOM
  let langObserver = null;
  function onHostLangChanged(lang) {
    if (lang !== 'zh' && lang !== 'en') return;
    __dbmHostLang = lang;
    const next = TEXT[langNow()];
    if (next === dict) return;
    dict = next;
    meter.setDict(dict);
    meter.build(cfg.style);
    draw();
  }
  try {
    if (typeof api.ui.getHostLang === 'function') {
      Promise.resolve(api.ui.getHostLang()).then(onHostLangChanged).catch(() => {});
    }
    if (typeof api.ui.onHostLangChanged === 'function') api.ui.onHostLangChanged(onHostLangChanged);
  } catch (e) {}

  window.addEventListener('resize', () => { if (cfg.style === 'wave') draw(); });

  startAudio();
  tick();

  return function cleanup() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (langObserver) langObserver.disconnect();
    stopAudio();
    api.log('背景板已卸载');
  };
});

/* ============================ 4. 设置窗口 · 导航页 ============================
 * 左侧导航里开一页「分贝仪」：实时预览（只在停在本页时占用麦克风）+ 一键校准 + 全部设置（草稿保存）。
 */
dc.mount(function (slot, api) {
  if (api.hook !== 'settings.theme') return;

  const PAGE_ID = 'panel';
  const PANEL_ID = 'plugin.' + api.id + '.' + PAGE_ID;

  /* ---- 「停在本页」的记忆：重载后自动切回来（挂在 window 上，插件重载不会清掉） ----
   * [v1.0.5.7] 隔离后插件点不到设置页导航，改为宿主在激活变化时推送（见下方 navInfo 轮询）。 */
  window.__dbmPanelId = PANEL_ID;

  let dict = TEXT[langNow()];
  // [v1.0.5.7] 隔离后本钩子跑两相：
  //   主题槽 iframe（!isPanel()）→ 只注册导航页；绝不能在这里建 UI（会画进主题背景层）。
  //   导航页 iframe（isPanel()）→ 在 dc.ui.layer()（本 iframe 的 body）里建真正的设置页。
  const isPanel = (typeof api.isPanel === 'function') ? api.isPanel() : !!api.panelId;
  if (!isPanel) {
    try { api.ui.nav({ id: PAGE_ID, label: dict.navTitle, icon: '🔊' }); } catch (e) {}
    return;
  }
  const page = api.ui.layer();
  if (!page || !page.appendChild) return;
  page.classList.add('dbm-set');

  /* ---- 草稿 / 已存值 ---- */
  const stored = Object.assign({}, api.settings || {});
  const draft = Object.assign({}, stored);
  const changed = {};
  const cfg = readCfg(draft); // 同一对象原地更新 → 渲染器实时看到草稿
  const meter = createMeter(cfg, dict, api.log);

  let fields = [];
  let ui = {};
  let previewBg = 'auto'; // 只影响预览底色，不持久化
  let active = false;
  let disposed = false;
  const inputs = {}; // key → { input, valEl, type, sync }

  /* ---- 音频：只在停在本页时开着 ---- */
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let samples = null;
  let rafId = 0;
  let smoothDb = null;
  let peakDb = 0;
  let lastSampleAt = 0;
  let st = { db: 0, peak: 0, level: 'good', paused: false, err: '', calibrating: false };
  let envDbfs = null; // 一键校准时采样到的平均 dBFS
  let calibrating = false;
  let calSamples = [];
  let calUntil = 0;

  const syncCfg = () => Object.assign(cfg, readCfg(draft));
  const levelOf = v => (cfg.mode === 'loud'
    ? (v > cfg.high ? 'good' : v > cfg.low ? 'warn' : 'bad')
    : (v < cfg.low ? 'good' : v < cfg.high ? 'warn' : 'bad'));
  const fmt = (tpl, v) => String(tpl).replace('{v}', String(v)).replace('{n}', String(v));

  /* ================= 预览 ================= */
  function applyPreviewTheme() {
    const bare = draft.card === 'none';
    const forced = previewBg === 'dark' ? true : previewBg === 'light' ? false : null;
    const dark = draft.card === 'dark' ? true : draft.card === 'light' ? false : (forced === null ? api.theme().isDark : forced);
    meter.setTheme(dark, bare);
    if (ui.stage) ui.stage.classList.toggle('is-light', !bare && ((forced !== null ? !forced : !dark)));
  }

  function applyPreviewScale() {
    // 预览区高度有限：>150% 不再放大（滑条上仍显示真实数值），避免卡片被裁掉
    meter.setScale((16 * clamp(draft.scale, 40, 150)) / 100);
    if (ui.pvCap) ui.pvCap.textContent = Number(draft.scale) > 150 ? dict.pvCap : '';
  }

  function statusText() {
    if (st.err) return st.err;
    if (calibrating) return dict.calSampling;
    if (!active) return dict.pvIdle;
    if (!analyser) return dict.pvStarting;
    return dict.pvReady;
  }

  function renderReadout() {
    if (!ui.num) return;
    if (st.err || !active || !analyser) {
      ui.num.textContent = '--';
      ui.num.style.color = '';
      ui.dot.className = 'dbm-set-dot' + (st.err ? ' err' : '');
    } else {
      ui.num.textContent = String(Math.round(st.db));
      ui.num.style.color = st.level === 'good' ? cfg.good : st.level === 'warn' ? cfg.warn : cfg.bad;
      ui.dot.className = 'dbm-set-dot on';
    }
    if (ui.state) ui.state.textContent = statusText();
    const parts = [];
    if (analyser && active && !st.err) {
      if (cfg.showMode) parts.push(dict.mode[cfg.mode]);
      if (cfg.showWord) parts.push(dict.word[cfg.mode][st.level]);
      if (cfg.showPeak) parts.push(dict.peak + ' ' + Math.round(st.peak));
    }
    if (ui.sub) ui.sub.textContent = parts.join(' · ');
    if (ui.env) {
      ui.env.textContent = dict.calEnv + ' ' + (envDbfs === null ? '--' : Math.round(envDbfs + cfg.calibration) + ' ' + dict.unit);
    }
    if (ui.calBtn && !calibrating) {
      ui.calBtn.textContent = fmt(dict.calBtn, Math.round(cfg.calTarget));
      ui.calBtn.disabled = !analyser;
    }
  }

  function samplePreview(dt) {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    const dbfs = 20 * Math.log10(rms > 1e-7 ? rms : 1e-7);
    envDbfs = dbfs;

    if (calibrating) {
      calSamples.push(dbfs);
      if (performance.now() >= calUntil && calSamples.length > 4) {
        let s = 0;
        for (let i = 0; i < calSamples.length; i++) s += calSamples[i];
        finishCalibration(s / calSamples.length);
      } else {
        renderReadout();
        return;
      }
    }

    // 预览用的是**草稿**里的校准偏移与阈值 → 拖动滑条能立刻看到数字变化
    const db = clamp(dbfs + cfg.calibration, 0, 199);
    smoothDb = smoothDb === null ? db : smoothDb + (db - smoothDb) * (1 - cfg.smooth);
    peakDb = Math.max(smoothDb, peakDb - 12 * dt);
    st = Object.assign(st, { db: smoothDb, peak: peakDb, level: levelOf(smoothDb), err: '', calibrating: false });
    meter.update(st);
    renderReadout();
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    if (disposed) return;
    const now = performance.now();
    if (now - lastSampleAt < 1000 / clamp(cfg.fps, 4, 30)) return;
    const dt = lastSampleAt ? (now - lastSampleAt) / 1000 : 0.1;
    lastSampleAt = now;
    if (!active || !analyser || st.err) return;
    samplePreview(dt);
  }

  function stopAudio() {
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch (e) {}
    stream = null;
    audioCtx = null;
    analyser = null;
    samples = null;
    meter.setAnalyser(null);
  }

  async function startAudio() {
    if (stream || disposed) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(dict.noMic);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (disposed || !active) { stopAudio(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      samples = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      meter.setAnalyser(analyser);
      st.err = '';
    } catch (e) {
      st.err = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? dict.denied : dict.micErr;
    }
    renderReadout();
  }

  // 只有「本页处于激活状态」才录音：切到别的设置页立刻释放麦克风
  // [v1.0.5.7] 隔离后查不到宿主 DOM（document 是本 iframe 的），改走宿主代查的
  // navInfo() —— 原来 document.querySelector('.panel[data-panel=…]') 恒为 null，
  // 预览永远不启动。
  const activeTimer = setInterval(() => {
    if (disposed) return;
    Promise.resolve(api.ui.navInfo()).then(info => {
      if (disposed) return;
      const nowActive = !!(info && info.active);
      if (nowActive === active) return;
      active = nowActive;
      smoothDb = null;
      peakDb = 0;
      if (active) startAudio();
      else stopAudio();
      renderReadout();
    }).catch(() => {});
  }, 400);

  /* ================= 一键校准 ================= */
  function startCalibration() {
    if (!analyser) { renderReadout(); return; }
    calibrating = true;
    calSamples = [];
    calUntil = performance.now() + 1600;
    if (ui.calBtn) { ui.calBtn.disabled = true; ui.calBtn.textContent = dict.calSampling; }
    if (ui.state) ui.state.textContent = dict.calSampling;
  }

  function finishCalibration(avgDbfs) {
    calibrating = false;
    const target = clamp(Number(draft.calTarget) || 40, 20, 80);
    const next = Math.round(clamp(target - avgDbfs, 40, 140));
    draft.calibration = next;
    // 自动校准会在每次进入关灯时覆盖这个值 → 一键校准后自动关掉它，否则用户会以为没生效
    const killedAuto = draft.autoCal === true;
    if (killedAuto) {
      draft.autoCal = false;
      markChanged('autoCal');
    }
    markChanged('calibration');
    syncCfg();
    renderAllValues();
    toast(dict.calDone + (killedAuto ? ' · ' + dict.calAutoOff : ''));
  }

  /* ================= 设置项（草稿） ================= */
  const GROUP_OF = {
    // 常用
    style: 'look', position: 'look', scale: 'look', card: 'look',
    mode: 'judge', low: 'judge', high: 'judge',
    autoCal: 'cal', calTarget: 'cal', calibration: 'cal',
    // 高级
    margin: 'adv-look', opacity: 'adv-look', goodColor: 'adv-look', warnColor: 'adv-look', badColor: 'adv-look',
    smooth: 'adv-read', showMode: 'adv-read', showWord: 'adv-read', showPeak: 'adv-read',
    fps: 'adv-perf', rangeMin: 'adv-perf', rangeMax: 'adv-perf', clickPause: 'adv-perf',
  };

  const sameVal = (a, b) => {
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return String(a) === String(b);
  };

  function markChanged(key) {
    if (sameVal(draft[key], stored[key])) delete changed[key];
    else changed[key] = true;
    refreshBar();
  }

  function onFieldInput(key) {
    syncCfg();
    if (key === 'style') meter.build(draft.style);
    if (key === 'card' || key === 'scale' || key === 'opacity') { applyPreviewTheme(); applyPreviewScale(); }
    renderReadout();
    meter.update(st);
  }

  function buildRow(field) {
    const key = field.key;
    const type = field.type || 'text';
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.textContent = field.label || key;
    label.appendChild(title);
    let valEl = null;
    let input = null;

    if (type === 'toggle') {
      if (field.hint) row.classList.add('row-col', 'switch-with-note');
      const wrap = document.createElement('label');
      wrap.className = 'toggle-switch';
      input = document.createElement('input');
      input.type = 'checkbox';
      const slider = document.createElement('span');
      slider.className = 'toggle-slider';
      wrap.appendChild(input);
      wrap.appendChild(slider);
      row.appendChild(label);
      row.appendChild(wrap);
    } else if (type === 'select') {
      input = document.createElement('select');
      (field.options || []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = String(o.label);
        input.appendChild(opt);
      });
      row.appendChild(label);
      row.appendChild(input);
    } else if (type === 'slider' || type === 'number') {
      valEl = document.createElement('span');
      valEl.className = 'dbm-set-val';
      label.appendChild(document.createTextNode(' '));
      label.appendChild(valEl);
      input = document.createElement('input');
      input.type = type === 'slider' ? 'range' : 'number';
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      row.appendChild(label);
      row.appendChild(input);
    } else if (type === 'color') {
      input = document.createElement('input');
      input.type = 'color';
      row.appendChild(label);
      row.appendChild(input);
    } else if (type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      row.appendChild(label);
      row.appendChild(input);
    } else {
      input = document.createElement('input');
      input.type = 'text';
      row.appendChild(label);
      row.appendChild(input);
    }

    if (field.hint) {
      const note = document.createElement('span');
      note.className = 'setting-note';
      note.textContent = field.hint;
      row.appendChild(note);
    }

    // 初值：草稿优先（语言切换重建时不能把改到一半的值丢掉）
    const init = draft[key] !== undefined ? draft[key] : (stored[key] !== undefined ? stored[key] : field.default);
    draft[key] = init;
    if (type === 'toggle') input.checked = !!init;
    else input.value = init === undefined || init === null ? '' : String(init);
    if (valEl) valEl.textContent = String(init);

    const read = () => {
      if (type === 'toggle') return input.checked;
      if (type === 'slider' || type === 'number') {
        const n = Number(input.value);
        return Number.isFinite(n) ? n : (field.default !== undefined ? field.default : 0);
      }
      return input.value;
    };
    const commit = () => {
      const v = read();
      draft[key] = v;
      if (valEl) valEl.textContent = String(v);
      markChanged(key);
      onFieldInput(key);
    };
    input.addEventListener('input', commit);
    input.addEventListener('change', commit);

    inputs[key] = {
      input: input,
      valEl: valEl,
      type: type,
      sync: () => {
        const v = draft[key];
        if (type === 'toggle') input.checked = !!v;
        else input.value = v === undefined || v === null ? '' : String(v);
        if (valEl) valEl.textContent = String(v);
      },
    };
    return row;
  }

  function groupLabel(id) {
    return id === 'look' ? dict.gLook
      : id === 'judge' ? dict.gJudge
        : id === 'cal' ? dict.gCal
          : id === 'adv-look' ? dict.gAdvLook
            : id === 'adv-read' ? dict.gAdvRead
              : dict.gAdvPerf;
  }

  function appendGroup(host, ids, list) {
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'plugin-section-label';
    h.textContent = groupLabel(ids);
    host.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'dbm-set-group';
    list.forEach(f => wrap.appendChild(buildRow(f)));
    host.appendChild(wrap);
  }

  /* ================= 整页渲染（可重入：语言切换 / 设置定义到达后重画，草稿保留） ================= */
  function renderAll() {
    page.textContent = '';
    ui = {};
    Object.keys(inputs).forEach(k => delete inputs[k]);

    /* --- 预览卡 --- */
    const pv = document.createElement('div');
    pv.className = 'dbm-set-preview';

    const head = document.createElement('div');
    head.className = 'dbm-set-head';
    const dot = document.createElement('i');
    dot.className = 'dbm-set-dot';
    const state = document.createElement('span');
    state.className = 'dbm-set-state';
    const readout = document.createElement('div');
    readout.className = 'dbm-set-readout';
    const num = document.createElement('span');
    num.className = 'dbm-set-num';
    const unit = document.createElement('span');
    unit.className = 'dbm-set-unit';
    unit.textContent = dict.unit;
    const sub = document.createElement('span');
    sub.className = 'dbm-set-sub';
    readout.appendChild(num);
    readout.appendChild(unit);
    readout.appendChild(sub);
    head.appendChild(dot);
    head.appendChild(state);
    head.appendChild(readout);

    const segWrap = document.createElement('span');
    segWrap.className = 'dbm-set-seglabel';
    segWrap.textContent = dict.pvBg;
    const seg = document.createElement('div');
    seg.className = 'dbm-set-seg';
    [['auto', dict.pvBgAuto], ['dark', dict.pvBgDark], ['light', dict.pvBgLight]].forEach(pair => {
      const val = pair[0];
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.bg = val;
      b.textContent = pair[1];
      b.classList.toggle('on', previewBg === val);
      b.addEventListener('click', () => {
        previewBg = val;
        Array.prototype.forEach.call(seg.querySelectorAll('button'), x => x.classList.toggle('on', x.dataset.bg === val));
        applyPreviewTheme();
      });
      seg.appendChild(b);
    });
    head.appendChild(segWrap);
    head.appendChild(seg);

    const stage = document.createElement('div');
    stage.className = 'dbm-set-stage';
    stage.appendChild(meter.card);
    const cap = document.createElement('div');
    cap.className = 'dbm-set-cap';
    stage.appendChild(cap);

    pv.appendChild(head);
    pv.appendChild(stage);
    page.appendChild(pv);

    /* --- 一键校准 --- */
    const cal = document.createElement('div');
    cal.className = 'dbm-set-cal';
    const calInfo = document.createElement('div');
    calInfo.className = 'dbm-set-cal-info';
    const calTitle = document.createElement('b');
    calTitle.textContent = dict.calTitle;
    const calEnv = document.createElement('span');
    calEnv.className = 'dbm-set-cal-env';
    const calDesc = document.createElement('small');
    calDesc.textContent = dict.calDesc;
    calInfo.appendChild(calTitle);
    calInfo.appendChild(calEnv);
    calInfo.appendChild(calDesc);
    const calBtn = document.createElement('button');
    calBtn.type = 'button';
    calBtn.className = 'dbm-set-calbtn';
    calBtn.addEventListener('click', startCalibration);
    cal.appendChild(calInfo);
    cal.appendChild(calBtn);
    page.appendChild(cal);

    /* --- 常用设置 --- */
    const common = document.createElement('div');
    common.className = 'dbm-set-fields';
    if (!fields.length) {
      const empty = document.createElement('div');
      empty.className = 'plugin-empty';
      empty.textContent = dict.loadingFields;
      common.appendChild(empty);
    } else {
      ['look', 'judge', 'cal'].forEach(g => appendGroup(common, g, fields.filter(f => (GROUP_OF[f.key] || 'look') === g)));
    }
    page.appendChild(common);

    /* --- 高级（折叠） --- */
    if (fields.length) {
      const advWrap = document.createElement('div');
      advWrap.className = 'dbm-set-adv';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'dbm-set-adv-toggle';
      let open = false;
      const body = document.createElement('div');
      body.className = 'dbm-set-fields hidden';
      toggle.textContent = dict.advShow;
      toggle.addEventListener('click', () => {
        open = !open;
        toggle.textContent = open ? dict.advHide : dict.advShow;
        body.classList.toggle('hidden', !open);
      });
      ['adv-look', 'adv-read', 'adv-perf'].forEach(g => appendGroup(body, g, fields.filter(f => GROUP_OF[f.key] === g)));
      advWrap.appendChild(toggle);
      advWrap.appendChild(body);
      page.appendChild(advWrap);
    }

    /* --- 保存条 --- */
    const bar = document.createElement('div');
    bar.className = 'dbm-set-bar';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'dbm-set-save';
    save.textContent = dict.save;
    save.addEventListener('click', applyDraft);
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'dbm-set-discard';
    discard.textContent = dict.discard;
    discard.addEventListener('click', () => {
      Object.keys(changed).forEach(k => delete changed[k]);
      Object.keys(draft).forEach(k => { draft[k] = stored[k]; });
      Object.keys(inputs).forEach(k => inputs[k].sync());
      syncCfg();
      meter.build(draft.style);
      applyPreviewTheme();
      applyPreviewScale();
      renderReadout();
      refreshBar();
    });
    const note = document.createElement('span');
    note.className = 'dbm-set-note';
    bar.appendChild(save);
    bar.appendChild(discard);
    bar.appendChild(note);
    page.appendChild(bar);

    ui = { stage: stage, dot: dot, state: state, num: num, sub: sub, env: calEnv, calBtn: calBtn, save: save, discard: discard, note: note, pvCap: cap };

    // 重建后预览要重新接上（card 是同一个元素，只是被搬进了新的 stage）
    meter.setDict(dict);
    meter.build(draft.style);
    applyPreviewTheme();
    applyPreviewScale();
    renderReadout();
    refreshBar();
  }

  function renderAllValues() {
    Object.keys(inputs).forEach(k => inputs[k].sync());
    renderReadout();
  }

  function refreshBar() {
    if (!ui.save) return;
    const n = Object.keys(changed).length;
    ui.save.disabled = n === 0;
    ui.discard.disabled = n === 0;
    ui.note.textContent = n ? fmt(dict.changedN, n) + ' · ' + dict.applyHint : dict.noChange;
  }

  function applyDraft() {
    const keys = Object.keys(changed);
    if (!keys.length) return;
    // [v1.0.5.7] 隔离后没有 window.electronAPI：改自己的设置走 dc.setSetting（宿主侧写死插件 id）
    if (typeof api.setSetting !== 'function') return;
    // 一次性发出：宿主每写一项都会广播并重载插件，但调用已经排进 IPC 队列、值都会被写入。
    // 页面随后重建 —— 所以把「刚保存过」「留在本页」记在 window 上，重建后提示 + 切回来。
    keys.forEach(k => { try { api.setSetting(k, draft[k]); } catch (e) {} });
    window.__dbmJustSaved = true;
    window.__dbmOnMyPage = true;
  }

  function toast(text) {
    const tip = document.createElement('div');
    tip.className = 'dbm-set-saved';
    tip.textContent = text;
    document.body.appendChild(tip);
    setTimeout(() => { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 3000);
  }

  /* ================= 启动 ================= */
  renderAll();
  tick();

  // 上次就停在本页 → 说明是被重载踢走的，自动切回来（[v1.0.5.7] 请宿主代切）
  if (window.__dbmOnMyPage && typeof api.ui.activatePanel === 'function') {
    setTimeout(() => { try { api.ui.activatePanel(); } catch (e) {} }, 80);
  }
  if (window.__dbmJustSaved) {
    window.__dbmJustSaved = false;
    setTimeout(() => toast(dict.saved), 200);
  }

  // 设置项定义来自宿主的插件列表（清单里本来就带 type/label/hint/min/max/options），不必重抄
  // [v1.0.5.7] 走 dc.listPlugins（隔离后没有 window.electronAPI）
  if (typeof api.listPlugins === 'function') {
    Promise.resolve(api.listPlugins()).then(list => {
      const me = (list || []).filter(p => p && p.id === api.id)[0];
      if (disposed || !me || !Array.isArray(me.settings) || !me.settings.length) return;
      fields = me.settings;
      // 宿主返回的是已存值；草稿里动过的项保持用户的选择
      Object.keys(me.values || {}).forEach(k => {
        if (changed[k]) return;
        stored[k] = me.values[k];
        draft[k] = me.values[k];
      });
      syncCfg();
      renderAll();
    }).catch(() => {});
  }

  // 语言跟随 [v1.0.5.7]：隔离后读不到宿主节点，改为向宿主要语言 + 订阅推送
  let langObserver = null;
  let onLang = null;
  try {
    onLang = function (lang) {
      if (lang !== 'zh' && lang !== 'en') return;
      __dbmHostLang = lang;
      const next = TEXT[langNow()];
      if (next === dict) return;
      dict = next;
      // 导航项与面板标题在宿主里，插件改不了 → 请宿主代改
      if (typeof api.ui.setNavLabel === 'function') api.ui.setNavLabel(dict.navTitle);
      renderAll();
    };
    if (typeof api.ui.getHostLang === 'function') {
      Promise.resolve(api.ui.getHostLang()).then(onLang).catch(() => {});
    }
    if (typeof api.ui.onHostLangChanged === 'function') api.ui.onHostLangChanged(onLang);
  } catch (e) {}

  return function cleanup() {
    disposed = true;
    clearInterval(activeTimer);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (langObserver) langObserver.disconnect();
    stopAudio();
  };
});
