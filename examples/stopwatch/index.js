/* index.js — 秒表 · 关灯背景板 + 时钟日期条 + 设置导航页  (stopwatch v1.1.2)
 *
 * 钩子（一个插件声明三个，各自在不同窗口里跑）：
 *   lightsOff.background —— 关灯全屏窗口上的大卡片秒表（5 种样式）
 *   clock.infoBar        —— 时钟窗口日期栏里的紧凑秒表（3 种样式）
 *   settings.theme       —— 设置窗口左侧导航里的「秒表」页（实时状态 + 全部设置 + 常用操作）
 * 运行环境：宿主下发的 dc 对象（无 require / Node / Electron），页面是 file:// 安全上下文。
 *
 * ── 跨窗口共享同一块秒表 ───────────────────────────────────────────
 * 三个窗口是三个渲染进程，各跑一份插件，`dc.on/emit` 只在进程内，所以状态共享只能走 storage：
 * 统一 key「state」+ rev 版本号。
 *   · 状态变更（开始/暂停/重置/计次）→ rev++ 并写入
 *   · 运行中每 5s 保活写入（rev 不变，只为让下次挂载能接着走）
 *   · 每个窗口每 1s 读一次，只有 rev 变大才应用远端状态
 * 计时本身是「墙钟外推」的确定性计算，所以三个窗口的数字天然一致，不会互相打架。
 *
 * ── 计时内核 ────────────────────────────────────────────────────
 * performance.now() 单调时钟。暂停不清零、不受系统时间被改动的影响；每帧按公式重算 elapsed，
 * 掉帧 / 窗口被遮挡都不会累积误差。落盘时额外记一个墙钟时刻，恢复运行状态时按现实时间补齐。
 *
 * ── 三个窗口各自的坑 ─────────────────────────────────────────────
 * 关灯窗口：宿主退出判定（window 的 dblclick）只放行 #controls / #btn-lock，不排除插件层，
 *           所以卡片保持 pointer-events:none，只让一排按钮接收事件并自己 stopPropagation。
 * 时钟窗口：.clock 是 -webkit-app-region:drag，插槽要能点必须自己设 no-drag；窗口宽度由
 *           max(数字区, 信息栏) 决定，所以日期条上的数字必须是「定宽」的，宽度真的变了才
 *           自己派发 dc-plugins-updated 让宿主重算窗口尺寸。
 * 设置窗口：插件的设置值在宿主手里（dc.settings 是只读副本），写回只能走 setPluginSetting，
 *           而它每写一次就广播并重载插件 → 所以那页用「草稿 + 显式保存」，并且要记住用户
 *           停在哪一页（宿主 refreshNavItems 会在面板消失时把人踢回「插件」页）。
 */
dc.mount(function (slot, api) {
  const hook = api.hook;
  const IS_LO = hook === 'lightsOff.background';
  const IS_IB = hook === 'clock.infoBar';
  const IS_ST = hook === 'settings.theme'; // [v1.1.2] 只用来开专属导航页，不碰宿主界面
  if (!IS_LO && !IS_IB && !IS_ST) return;
  if (!slot && !IS_ST) return;             // 设置窗口那页不需要插槽
  const keyboardHere = IS_LO || IS_IB;     // 键盘只在关灯/时钟窗口生效，设置窗口要留给输入框

  /* ============================ 1. 读设置（宿主已按类型收敛，这里再兜一层） ============================ */
  const S = api.settings || {};
  const num = (v, min, max, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  const oneOf = (v, list, d) => (list.indexOf(String(v)) >= 0 ? String(v) : d);
  const hex = (v, d) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v)) ? String(v) : d);
  const bool = (v, d) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true');

  const STYLE_KEYS = ['classic', 'minimal', 'ring', 'laps', 'segment'];
  const INFO_STYLES = ['dot', 'plain', 'pill', 'none'];
  const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const cfg = {
    style: oneOf(S.style, STYLE_KEYS, 'classic'),
    position: oneOf(S.position, POSITIONS, 'center'),
    margin: num(S.margin, 0, 600, 48),
    scale: num(S.scale, 40, 400, 100),
    opacity: num(S.opacity, 5, 100, 92),
    card: oneOf(S.card, ['auto', 'dark', 'light', 'none'], 'auto'),
    accent: hex(S.accent, '#6C8CFF'),
    format: oneOf(S.format, ['mmss', 'hhmmss'], 'mmss'),
    blink: bool(S.blink, true),
    showHint: bool(S.showHint, true),
    showLaps: bool(S.showLaps, false),
    keyboard: bool(S.keyboard, true),
    mouse: bool(S.mouse, false),
    autoStart: bool(S.autoStart, false),
    persist: bool(S.persist, true),
    goalOn: bool(S.goalOn, false),
    goal: num(S.goal, 1, 600, 25),
    // [v1.1.0] 日期条
    infoStyle: oneOf(S.infoStyle, INFO_STYLES, 'dot'),
    infoSeconds: bool(S.infoSeconds, false),
    infoScale: num(S.infoScale, 60, 130, 80),
    infoClick: bool(S.infoClick, true),
    // [v1.1.1] 打开关灯时自动收起日期栏
    infoAutoHide: bool(S.infoAutoHide, true),
  };
  const showLapList = cfg.showLaps || cfg.style === 'laps';

  /* ============================ 2. 语言：跟随应用语言 ============================
   * [v1.0.5.7] 隔离后插件看不见宿主 DOM，无法再读 [data-lang] 节点：
   *   1) 宿主推送/查询的语言（dc.ui.getHostLang / dc.ui.onHostLangChanged）
   *   2) 宿主配置里的 language（dc.getConfig，异步取）
   *   3) iframe 自己的 <html lang> 兜底 */
  let cfgLang = '';
  let hostLang = '';

  function langNow() {
    if (hostLang === 'zh' || hostLang === 'en') return hostLang;
    if (cfgLang) return cfgLang;
    return /^en/i.test(String((document.documentElement && document.documentElement.lang) || '')) ? 'en' : 'zh';
  }
  const TEXT = {
    zh: {
      idle: '待开始', running: '计时中', paused: '已暂停',
      start: '开始', pause: '暂停', lap: '计次', reset: '重置',
      goal: '目标', remain: '剩', goalDone: '已达标',
      lapN: '第 {n} 圈',
      hint: '空格 开始/暂停 · L 计次 · R 重置',
      hintMouse: '点下方按钮操作',
      infoReady: '待开始', infoRunning: '计时中', infoPaused: '已暂停',
      infoTitle: '秒表：单击 开始/暂停 · 双击 计次 · 长按 重置',
      infoTitleOff: '秒表（未开启点击控制）',
      // [v1.1.2] 设置窗口导航页
      clearLaps: '清空计次',
      navTitle: '秒表',
      gLo: '关灯背景板',
      gDisp: '显示',
      gOp: '操作',
      gData: '数据与目标',
      gInfo: '日期条',
      applySave: '保存并应用',
      discard: '放弃修改',
      changedN: '有 {n} 项改动未保存',
      noChange: '没有未保存的改动',
      saved: '设置已保存',
      liveLabel: '当前',
      noManifest: '读不到插件清单，暂时无法在这里改设置 —— 请改用「插件」页里那张卡片。',
    },
    en: {
      idle: 'Ready', running: 'Running', paused: 'Paused',
      start: 'Start', pause: 'Pause', lap: 'Lap', reset: 'Reset',
      goal: 'Goal', remain: 'left', goalDone: 'Reached',
      lapN: 'Lap {n}',
      hint: 'Space start/pause · L lap · R reset',
      hintMouse: 'Use the buttons below',
      infoReady: 'Ready', infoRunning: 'Running', infoPaused: 'Paused',
      infoTitle: 'Stopwatch: click start/pause · double-click lap · hold to reset',
      infoTitleOff: 'Stopwatch (click control off)',
      // [v1.1.2] settings page
      clearLaps: 'Clear laps',
      navTitle: 'Stopwatch',
      gLo: 'Lights-off board',
      gDisp: 'Display',
      gOp: 'Operation',
      gData: 'Data & goal',
      gInfo: 'Info bar',
      applySave: 'Save & apply',
      discard: 'Discard',
      changedN: '{n} unsaved change(s)',
      noChange: 'Nothing to save',
      saved: 'Settings saved',
      liveLabel: 'Now',
      noManifest: 'Could not read the plugin manifest — use the card on the Plugins page instead.',
    },
  };
  let dict = TEXT[langNow()];
  dict.__lang = langNow();

  /* ============================ 3. 格式化 ============================ */
  const pad = (n, w) => String(n).padStart(w, '0');

  // 关灯卡片的主显示：mmss → M:SS（分钟不封顶）+ 百分秒；hhmmss → HH:MM:SS
  function splitTime(ms) {
    const total = Math.max(0, Math.floor(ms));
    if (cfg.format === 'hhmmss') {
      const s = Math.floor(total / 1000) % 60;
      const m = Math.floor(total / 60000) % 60;
      const h = Math.floor(total / 3600000);
      return { main: pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2), frac: '' };
    }
    const cs = Math.floor(total / 10) % 100;
    const s = Math.floor(total / 1000) % 60;
    return { main: pad(Math.floor(total / 60000), 2) + ':' + pad(s, 2), frac: '.' + pad(cs, 2) };
  }
  // 日期条的显示：默认不带百分秒（省宽度，避免把时钟窗口撑宽）
  function splitTimeInfo(ms) {
    const t = splitTime(ms);
    if (cfg.format === 'hhmmss') return { main: t.main, frac: '' };
    return { main: t.main, frac: cfg.infoSeconds ? t.frac : '' };
  }
  // 短时长（目标进度）：MM:SS，超过 1 小时自动带小时
  function fmtDur(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    return (h ? pad(h, 2) + ':' : '') + pad(m, 2) + ':' + pad(s, 2);
  }
  // 计次成绩要看到百分秒
  function fmtLap(ms) {
    const total = Math.max(0, Math.floor(ms));
    const cs = Math.floor(total / 10) % 100;
    const s = Math.floor(total / 1000) % 60;
    const m = Math.floor(total / 60000);
    return pad(m, 2) + ':' + pad(s, 2) + '.' + pad(cs, 2);
  }
  const goalMs = () => cfg.goal * 60000;

  /* ============================ 4. 计时内核（两个窗口各有一份，靠 storage 对齐） ============================ */
  const MAX_RESUME = 7 * 24 * 3600 * 1000; // 补齐上限，防墙钟跳变把计时撑爆
  const SYNC_KEY = 'state';                // [v1.1.0] 统一 key：所有窗口共享同一块秒表
  const LEGACY_KEY = 'state:' + (function () { // v1.0.0 的分屏 key，只用于一次性迁移
    try { return [screen.width, screen.height, screen.availLeft || 0, screen.availTop || 0].join('x'); }
    catch (e) { return 'default'; }
  })();

  let running = false;
  let base = 0;      // 已累计毫秒（不含当前这一段）
  let markAt = 0;    // 当前这一段的起点（performance.now()）
  let hasRun = false;
  let lapMarks = [];
  let goalHit = false;
  let localRev = 0;

  const nowMs = () => base + (running ? performance.now() - markAt : 0);

  // 两个钩子互斥，共用一个收尾钩子即可
  let teardownExtra = null;

  // 渲染器注册表：每个窗口注册一个 { static, frame }
  const viewers = [];
  function attach(v) {
    viewers.push(v);
    if (v.static) v.static();
    if (v.frame) v.frame(nowMs());
  }
  function notify() {
    const ms = nowMs();
    viewers.forEach(v => {
      try { if (v.static) v.static(); if (v.frame) v.frame(ms); } catch (e) {}
    });
    syncLoop();
  }

  /* ---- 主循环：只在运行时跑，暂停即停，省电 ---- */
  let raf = 0;
  let lastKeep = 0;
  function tick() {
    raf = 0;
    const ms = nowMs();
    viewers.forEach(v => { try { v.frame && v.frame(ms); } catch (e) {} });
    if (cfg.persist && running && Date.now() - lastKeep > 5000) {
      lastKeep = Date.now();
      save(false); // 保活写入：不递增 rev，另一个窗口不需要因此重载
    }
    if (running) raf = requestAnimationFrame(tick);
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(tick); }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function syncLoop() { running ? startLoop() : stopLoop(); }

  /* ---- 持久化 + 跨窗口同步 ---- */
  function save(bump) {
    if (!cfg.persist) return;
    if (bump) localRev += 1;
    const payload = { rev: localRev, running: running, base: Math.round(nowMs()), laps: lapMarks, wall: Date.now() };
    try { api.storage.set(SYNC_KEY, payload).catch(() => {}); } catch (e) {}
  }

  function applyRemote(st) {
    let b = num(st.base, 0, 1e12, 0);
    if (st.running) {
      const wall = num(st.wall, 0, 1e15, Date.now());
      b += Math.max(0, Math.min(MAX_RESUME, Date.now() - wall));
      running = true;
      markAt = performance.now();
    } else {
      running = false;
    }
    base = b;
    hasRun = b > 0 || st.running === true;
    lapMarks = Array.isArray(st.laps) ? st.laps.filter(v => Number.isFinite(v)).slice(-200) : [];
    localRev = num(st.rev, 0, 1e15, localRev);
    goalHit = cfg.goalOn && b >= goalMs();
    notify();
  }

  let syncBusy = false;
  const syncTimer = setInterval(async () => {
    if (!cfg.persist || syncBusy) return;
    syncBusy = true;
    try {
      const st = await api.storage.get(SYNC_KEY);
      if (st && typeof st === 'object' && num(st.rev, -1, 1e15, -1) > localRev) applyRemote(st);
    } catch (e) {
    } finally { syncBusy = false; }
  }, 1000);

  /* ---- 五个动作 ---- */
  function start() {
    if (running) return;
    markAt = performance.now();
    running = true;
    hasRun = true;
    goalHit = cfg.goalOn && nowMs() >= goalMs();
    notify();
    save(true);
  }
  function pause() {
    if (!running) return;
    base = nowMs();
    running = false;
    notify();
    save(true);
  }
  function toggle() { running ? pause() : start(); }
  function reset() {
    running = false;
    hasRun = false;
    base = 0;
    lapMarks = [];
    goalHit = false;
    notify();
    save(true);
  }
  function addLap() {
    if (!running && !hasRun) return;
    lapMarks.push(Math.round(nowMs()));
    if (lapMarks.length > 200) lapMarks = lapMarks.slice(-200);
    notify();
    save(true);
  }
  function clearLaps() {
    lapMarks = [];
    notify();
    save(true);
  }

  /* ============================ 5. 渲染器 A · 关灯背景板 ============================ */
  if (IS_LO) {
    const stage = slot;
    stage.classList.add('sw-stage', 'sw-enter', 'sw-style-' + cfg.style);

    const [vAlign, hAlign] = (pos => {
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
    stage.style.alignItems = vAlign;
    stage.style.justifyContent = hAlign;
    stage.style.padding = cfg.margin + 'px';
    stage.style.opacity = String(cfg.opacity / 100);
    stage.style.pointerEvents = 'none'; // 整层不吃事件 —— 「双击背景退出关灯」永远有效
    stage.style.zIndex = '0';

    const card = document.createElement('div');
    card.className = 'sw-card sw-card-' + cfg.style;
    card.style.fontSize = (16 * cfg.scale) / 100 + 'px';
    card.style.pointerEvents = 'none';
    stage.appendChild(card);

    setTimeout(() => stage.classList.remove('sw-enter'), 700);

    const RING_R = 44;
    const RING_C = 2 * Math.PI * RING_R;
    const ringWrap = document.createElement('div');
    ringWrap.className = 'sw-ringwrap';
    ringWrap.innerHTML =
      '<svg class="sw-svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="' + RING_R + '" fill="none" stroke="var(--sw-track)" stroke-width="6"/>' +
      '<circle class="sw-arc" cx="50" cy="50" r="' + RING_R + '" fill="none" stroke="var(--sw-accent)" stroke-width="6" ' +
      'stroke-linecap="round" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + RING_C.toFixed(2) + '" ' +
      'transform="rotate(-90 50 50)"/>' +
      '</svg>';
    card.appendChild(ringWrap);
    const ringArc = ringWrap.querySelector('.sw-arc');

    const body = document.createElement('div');
    body.className = 'sw-body';

    const status = document.createElement('div');
    status.className = 'sw-status';
    const dotEl = document.createElement('i');
    dotEl.className = 'sw-dot';
    const statusText = document.createElement('span');
    statusText.className = 'sw-status-text';
    status.appendChild(dotEl);
    status.appendChild(statusText);

    const timeEl = document.createElement('div');
    timeEl.className = 'sw-time';
    const tMain = document.createElement('span');
    tMain.className = 'sw-t-main';
    const tFrac = document.createElement('span');
    tFrac.className = 'sw-t-frac';
    timeEl.appendChild(tMain);
    timeEl.appendChild(tFrac);

    const metaEl = document.createElement('div');
    metaEl.className = 'sw-meta';

    body.appendChild(status);
    body.appendChild(timeEl);
    body.appendChild(metaEl);
    card.appendChild(body);

    const lapsEl = document.createElement('ul');
    lapsEl.className = 'sw-laps';
    card.appendChild(lapsEl);

    const btns = document.createElement('div');
    btns.className = 'sw-btns';
    const mkBtn = (cls, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw-btn ' + cls;
      b.textContent = label;
      btns.appendChild(b);
      return b;
    };
    const bToggle = mkBtn('sw-btn-main', '▶');
    const bLap = mkBtn('sw-btn-lap', dict.lap);
    const bReset = mkBtn('sw-btn-reset', dict.reset);
    card.appendChild(btns);

    const hintEl = document.createElement('div');
    hintEl.className = 'sw-hint';
    card.appendChild(hintEl);

    // 鼠标控制：只有按钮层接收指针事件，卡片其余区域保持穿透
    if (cfg.mouse) {
      card.classList.add('sw-has-btns');
      btns.style.pointerEvents = 'auto';
      const swallow = e => { e.stopPropagation(); };
      bToggle.addEventListener('click', e => { swallow(e); toggle(); });
      bLap.addEventListener('click', e => { swallow(e); addLap(); });
      bReset.addEventListener('click', e => { swallow(e); reset(); });
      btns.addEventListener('dblclick', swallow);
      btns.addEventListener('mousedown', swallow);
    }

    /* ---- 主题：深卡 / 浅卡随背景板实际亮暗自动切 ---- */
    let lastThemeAt = 0;
    function applyTheme(force) {
      const now = Date.now();
      if (!force && now - lastThemeAt < 1000) return;
      lastThemeAt = now;
      const bare = cfg.card === 'none';
      const dark = cfg.card === 'dark' ? true : cfg.card === 'light' ? false : api.theme().isDark;
      const fg = dark ? 'rgba(255,255,255,0.95)' : 'rgba(18,18,24,0.93)';
      const dim = dark ? 'rgba(255,255,255,0.48)' : 'rgba(18,18,24,0.46)';
      const track = dark ? 'rgba(255,255,255,0.15)' : 'rgba(18,18,24,0.13)';
      const bg = bare ? 'transparent' : dark ? 'rgba(20,21,28,0.62)' : 'rgba(255,255,255,0.66)';
      const bd = bare ? 'transparent' : dark ? 'rgba(255,255,255,0.14)' : 'rgba(18,18,24,0.10)';
      const shadow = bare ? 'none' : dark ? '0 0.6em 2.4em rgba(0,0,0,0.34)' : '0 0.6em 2.4em rgba(20,20,40,0.16)';
      card.style.setProperty('--sw-fg', fg);
      card.style.setProperty('--sw-dim', dim);
      card.style.setProperty('--sw-track', track);
      card.style.setProperty('--sw-bg', bg);
      card.style.setProperty('--sw-bd', bd);
      card.style.setProperty('--sw-shadow', shadow);
      card.style.setProperty('--sw-accent', cfg.accent);
      card.style.setProperty('--sw-text-shadow', bare && dark ? '0 0.06em 0.55em rgba(0,0,0,0.3)' : 'none');
      card.classList.toggle('sw-dark', dark);
      card.style.backdropFilter = bare ? 'none' : 'blur(18px) saturate(1.35)';
      card.style.webkitBackdropFilter = bare ? 'none' : 'blur(18px) saturate(1.35)';
    }
    applyTheme(true);

    /* ---- 渲染 ---- */
    let lastMain = '';
    let lastFrac = '';
    let lastMeta = '';
    let lastLapSig = '';

    function setMain(str) {
      if (str === lastMain) return;
      lastMain = str;
      tMain.textContent = '';
      const segs = str.split(':');
      for (let i = 0; i < segs.length; i++) {
        if (i) {
          const c = document.createElement('i');
          c.className = 'sw-colon';
          c.textContent = ':';
          tMain.appendChild(c);
        }
        const sp = document.createElement('span');
        sp.className = 'sw-dg';
        sp.textContent = segs[i];
        tMain.appendChild(sp);
      }
    }

    function syncMetaDynamic(ms) {
      let txt = '';
      if (cfg.goalOn) {
        const g = goalMs();
        txt = ms >= g
          ? dict.goalDone + ' · ' + fmtDur(g)
          : dict.goal + ' ' + fmtDur(g) + ' · ' + dict.remain + ' ' + fmtDur(g - ms);
      } else if (lapMarks.length) {
        txt = dict.lapN.replace('{n}', String(lapMarks.length));
      }
      if (txt !== lastMeta) {
        lastMeta = txt;
        metaEl.textContent = txt;
      }
    }

    function frameLO(ms) {
      const t = splitTime(ms);
      setMain(t.main);
      if (t.frac !== lastFrac) {
        lastFrac = t.frac;
        tFrac.textContent = t.frac;
      }
      if (cfg.style === 'ring') {
        ringArc.setAttribute('stroke-dashoffset', (RING_C * (1 - (ms % 60000) / 60000)).toFixed(2));
      }
      if (cfg.goalOn) {
        const hit = ms >= goalMs();
        if (hit !== goalHit) {
          goalHit = hit;
          if (hit) {
            card.classList.remove('sw-goal-pulse');
            void card.offsetWidth; // 强制重排，让动画能重新播放
            card.classList.add('sw-goal-pulse');
          }
        }
      }
      if (cfg.goalOn || lapMarks.length) syncMetaDynamic(ms);
    }

    // 状态类与静态文案：每次状态变化 / 远端同步都会走一遍（不做「变化才切」的优化，
    // 否则 init 或恢复出来的状态会被漏掉）
    function statLO() {
      const hit = cfg.goalOn && nowMs() >= goalMs();
      goalHit = hit;
      card.classList.toggle('sw-goal', hit);
      card.classList.toggle('sw-running', running);
      card.classList.toggle('sw-paused', !running && hasRun);
      card.classList.toggle('sw-idle', !running && !hasRun);
      card.classList.toggle('sw-blink', cfg.blink && running);
      statusText.textContent = running ? dict.running : hasRun ? dict.paused : dict.idle;
      bToggle.textContent = running ? '❚❚' : '▶';
      bToggle.title = running ? dict.pause : dict.start;
      bLap.textContent = dict.lap;
      bLap.title = dict.lap;
      bReset.textContent = dict.reset;
      bReset.title = dict.reset;
      bLap.disabled = !running && !hasRun;
      hintEl.textContent = cfg.keyboard ? dict.hint : dict.hintMouse;
      card.classList.toggle('sw-show-hint', cfg.showHint && (cfg.keyboard || cfg.mouse));
      card.classList.toggle('sw-show-laps', showLapList && lapMarks.length > 0);
      renderLaps();
    }

    function renderLaps() {
      if (!showLapList) return;
      const sig = lapMarks.join(',');
      if (sig === lastLapSig) return;
      lastLapSig = sig;
      lapsEl.textContent = '';
      const n = lapMarks.length;
      for (let i = n - 1; i >= Math.max(0, n - 4); i--) {
        const total = lapMarks[i];
        const seg = total - (i > 0 ? lapMarks[i - 1] : 0);
        const li = document.createElement('li');
        li.className = 'sw-lap';
        const a = document.createElement('span');
        a.className = 'sw-lap-n';
        a.textContent = dict.lapN.replace('{n}', String(i + 1));
        const b = document.createElement('span');
        b.className = 'sw-lap-seg';
        b.textContent = '+' + fmtLap(seg);
        const c = document.createElement('span');
        c.className = 'sw-lap-total';
        c.textContent = fmtLap(total);
        li.appendChild(a);
        li.appendChild(b);
        li.appendChild(c);
        lapsEl.appendChild(li);
      }
    }

    const themeTimer = setInterval(() => applyTheme(false), 1000);
    teardownExtra = function () {
      clearInterval(themeTimer);
      lastMain = '';
      lastFrac = '';
      lastMeta = '';
      lastLapSig = '';
    };
    attach({ static: statLO, frame: frameLO });
  }

  /* ============================ 6. 渲染器 B · 时钟日期条 ============================ */
  if (IS_IB) {
    const el = slot; // 宿主给的 span.plugin-info-slot

    if (cfg.infoStyle === 'none') {
      // 不显示：让宿主把插槽整个摘掉。宿主判定「信息栏要不要显示」看的就是这个
      // 元素在不在（renderer.js 里 hasPlugin = !!ib.querySelector('.plugin-info-slot')），
      // 只把自己 display:none 掉的话，信息栏会留下一条 padding 撑着窗口。
      // [v1.0.5.7] 隔离后 `slot` 是本沙箱 iframe 的 body —— 原来 el.remove() 删的是
      // 沙箱 body，宿主侧插槽仍然占位；改走宿主 API clock.removeInfoSlot()。
      if (typeof api.clock.removeInfoSlot === 'function') {
        try { api.clock.removeInfoSlot(); } catch (e) {}
      }
      teardownExtra = function () {};
    } else {
      el.classList.add('sw-i', 'sw-i-mode-' + cfg.infoStyle);
      // 插槽宽度必须显式钉住。宿主的 .plugin-info-slot 在 #info-bar 里作为 flex item 时，
      // width:auto 会被解析成「第一个子项的宽度」（实测 19.2px = 状态点宽），
      // 后面的时间数字会被整个裁掉 —— 而窗口宽度又是按信息栏宽度反推的，会跟着一起算错。
      // 这里连内联一起设，双保险（样式表里也有 .sw-i 的 min-width: max-content）。
      el.style.flex = '0 0 auto';
      el.style.minWidth = 'max-content';
      el.style.pointerEvents = cfg.infoClick ? 'auto' : 'none';
      // 字号走 CSS 变量（样式表里有 0.8em 兜底），这样即使内联被清掉也不会失控
      el.style.setProperty('--sw-i-scale', String(cfg.infoScale / 100));

      const dotEl = document.createElement('i');
      dotEl.className = 'sw-i-dot';
      const mainEl = document.createElement('span');
      mainEl.className = 'sw-i-main';
      const fracEl = document.createElement('span');
      fracEl.className = 'sw-i-frac';
      const lapEl = document.createElement('span');
      lapEl.className = 'sw-i-lap';

      el.appendChild(dotEl);
      el.appendChild(mainEl);
      el.appendChild(fracEl);
      el.appendChild(lapEl);

      /* ---- 三种手势：单击 开始/暂停 · 双击 计次 · 长按 重置 ----
       * 用 Pointer Events 自己判定（原来那套 click + 240ms 延迟撑不起第三档）：
       *   pointerdown 起一个 700ms 的长按计时器，到点直接重置并标记 longFired
       *   pointerup 时若「没长按、也没拖走」，再按 240ms 窗口判 单击 / 双击
       * setPointerCapture 保证指针移出元素后仍能收到 up，不会留下卡住的按下态。 */
      const LONG_MS = 700;
      const DBL_MS = 240;
      const MOVE_TOL = 6; // 按住时移动超过这么多像素就取消这次手势（防误触）

      let pressTimer = null;
      let dblTimer = null;
      let pressing = false;
      let longFired = false;
      let downX = 0;
      let downY = 0;

      function dropPress() {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        el.classList.remove('sw-i-pressing');
      }
      function flashReset() {
        el.classList.remove('sw-i-flash');
        void el.offsetWidth; // 强制重排，让动画能重新播放
        el.classList.add('sw-i-flash');
        setTimeout(() => el.classList.remove('sw-i-flash'), 640);
      }

      function onDown(e) {
        if (!cfg.infoClick) return;
        if (e.button !== undefined && e.button !== 0) return; // 只认左键
        e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        dropPress();
        pressing = true;
        longFired = false;
        downX = e.clientX;
        downY = e.clientY;
        el.classList.add('sw-i-pressing');
        pressTimer = setTimeout(() => {
          pressTimer = null;
          longFired = true;
          pressing = false; // 这次手势已被长按消费，抬手时不再判单击
          el.classList.remove('sw-i-pressing');
          flashReset();
          reset();
        }, LONG_MS);
      }

      function onMove(e) {
        if (!pressing) return;
        if (Math.abs(e.clientX - downX) > MOVE_TOL || Math.abs(e.clientY - downY) > MOVE_TOL) {
          pressing = false;
          dropPress();
        }
      }

      function onUp(e) {
        e.stopPropagation();
        try { el.releasePointerCapture(e.pointerId); } catch (err) {}
        const wasPressing = pressing;
        const wasLong = longFired;
        dropPress();
        pressing = false;
        longFired = false;
        if (!wasPressing || wasLong) return; // 长按已处理 / 拖动取消 → 不再判单击
        if (dblTimer) {
          clearTimeout(dblTimer);
          dblTimer = null;
          addLap();
          return;
        }
        dblTimer = setTimeout(() => {
          dblTimer = null;
          toggle();
        }, DBL_MS);
      }

      function onCancel() {
        pressing = false;
        longFired = false;
        dropPress();
      }

      function swallow(e) { e.stopPropagation(); }
      if (cfg.infoClick) {
        el.classList.add('sw-i-clickable');
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
        // 浏览器照样会派发 click / dblclick，一律吞掉：将来宿主若加全局处理器也不会被误触
        el.addEventListener('click', swallow);
        el.addEventListener('dblclick', swallow);
      }

      /* ---- 宽度通知 ----
       * 窗口宽度 = max(数字区, 信息栏)，所以信息栏一变宽，窗口就会被撑宽。
       * setInfoText() 每次都会让宿主重算窗口尺寸 —— 但我们不能高频调它（会疯狂 resize），
       * 所以这里自绘 DOM，只在「文本形状真的变了」时手动通知一次宿主。
       * [v1.0.5.7] 隔离后 window 事件发不到宿主文档，改走宿主 RPC ui.notifyHost()。 */
      let lastShape = '';
      let notifyTimer = null;
      function notifyHostResize() {
        if (notifyTimer) return;
        notifyTimer = setTimeout(() => {
          notifyTimer = null;
          if (typeof api.ui.notifyHost === 'function') {
            try { api.ui.notifyHost(); } catch (e) {}
          }
        }, 0);
      }
      function checkShape() {
        const shape = mainEl.textContent.length + '|' + fracEl.textContent.length + '|' + lapEl.textContent.length + '|' + cfg.infoStyle;
        if (shape === lastShape) return;
        lastShape = shape;
        notifyHostResize();
      }

      /* ---- [v1.1.1] 打开关灯时自动收起 ----
       * main.js 在进入关灯时会强制 show 时钟窗口（注释：「关灯时为了显示时钟曾强制 show」），
       * [v1.0.5.7] 隔离后插件没有 window.electronAPI：
       * 关灯状态改走 dc.onLightsOffStateChanged / dc.getConfig（宿主推送，白名单字段）。 */
      let lightsOffActive = false;
      const hideToken = (window.__swInfoToken = (window.__swInfoToken || 0) + 1);

      function applyAutoHide() {
        const hidden = !!cfg.infoAutoHide && lightsOffActive;
        if (el.classList.contains('sw-i-hidden') === hidden) return;
        el.classList.toggle('sw-i-hidden', hidden);
        notifyHostResize(); // 收起/展开都会改变信息栏宽度，得让宿主重算窗口尺寸
      }
      function onHostLightsOff(on) {
        if (window.__swInfoToken !== hideToken) return; // 旧实例，忽略
        const next = !!on;
        if (next === lightsOffActive) return;
        lightsOffActive = next;
        applyAutoHide();
      }
      if (cfg.infoAutoHide) {
        try {
          if (typeof api.onLightsOffStateChanged === 'function') api.onLightsOffStateChanged(onHostLightsOff);
          if (typeof api.getConfig === 'function') {
            Promise.resolve(api.getConfig())
              .then(c => { if (c && c.lightsOff) onHostLightsOff(true); })
              .catch(() => {});
          }
        } catch (e) {}
      }

      let lastMain = '';
      let lastFrac = '';
      let lastLap = '';
      function frameIB(ms) {
        const t = splitTimeInfo(ms);
        if (t.main !== lastMain) {
          lastMain = t.main;
          mainEl.textContent = t.main;
        }
        if (t.frac !== lastFrac) {
          lastFrac = t.frac;
          fracEl.textContent = t.frac;
        }
        const lap = lapMarks.length ? String(lapMarks.length) : '';
        if (lap !== lastLap) {
          lastLap = lap;
          lapEl.textContent = lap;
        }
        checkShape();
      }

      function statIB() {
        el.classList.toggle('sw-i-running', running);
        el.classList.toggle('sw-i-paused', !running && hasRun);
        el.classList.toggle('sw-i-idle', !running && !hasRun);
        el.title = (cfg.infoClick ? dict.infoTitle : dict.infoTitleOff) + ' · ' +
          (running ? dict.infoRunning : hasRun ? dict.infoPaused : dict.infoReady);
      }

      teardownExtra = function () {
        onCancel();
        if (dblTimer) { clearTimeout(dblTimer); dblTimer = null; }
        if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = null; }
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onCancel);
        el.removeEventListener('click', swallow);
        el.removeEventListener('dblclick', swallow);
      };
      attach({ static: statIB, frame: frameIB });
    }
  }

  /* ============================ 7. 渲染器 C · 设置窗口的专属导航页 [v1.1.2] ============================
   * 用 dc.ui.nav() 在设置窗口左侧导航里开一页（位置在「插件」项之后，与内置项同款样式）。
   * 两条宿主约束决定了这里的设计：
   *  1) 设置值在宿主手里（dc.settings 是 Object.freeze 的只读副本），写回只能走 preload 的
   *     setPluginSetting(id, key, value) —— 而它每写一次就 broadcastPlugins()，插件整体重载。
   *     所以这一页是「草稿 + 显式保存」：只在点保存时把「有改动的项」一次性提交。
   *  2) 插件重载后导航页整块重建，宿主的 refreshNavItems() 发现当前面板从 DOM 里消失就会
   *     把用户退回「插件」页 —— 所以记住「上次停在我的页」，重挂载时自动切回来，
   *     否则每改一项设置都要重新点一次导航。
   *
   * 页面里的设置项从宿主 plugin-list 拿：清单里本来就带 key/type/label/hint/min/max/
   * options/default，不用在插件里重抄一遍。控件直接复用宿主的 .setting-row / .toggle-switch /
   * .setting-note 结构，外观自动与内置设置一致。
   */
  if (IS_ST) {
    const PAGE_ID = 'panel';
    const PANEL_ID = 'plugin.' + api.id + '.' + PAGE_ID;

    // 记住用户停在哪一页。挂在 window 上：同一个渲染进程里，插件重载不会清掉它。
    // [v1.0.5.7] 隔离后点不到设置页导航，改用宿主推送的 navInfo（见下）。
    window.__swPanelId = PANEL_ID;

    // [v1.0.5.7] 隔离后本钩子跑两相：
    //   主题槽 iframe（!isPanel()）→ 只注册导航页，绝不在这里建 UI（否则会画进主题背景层）。
    //   导航页 iframe（isPanel()）→ 在 dc.ui.layer() 里建真正的设置页。
    const isPanel = (typeof api.isPanel === 'function') ? api.isPanel() : !!api.panelId;
    if (!isPanel) {
      try { api.ui.nav({ id: PAGE_ID, label: langNow() === 'en' ? 'Stopwatch' : dict.navTitle, icon: '⏱️' }); } catch (e) {}
    } else {
      // 本 iframe 就是该导航页的容器；mountSettingsPage 往这里建 UI
      const page = api.ui.layer();
      if (page) {
        page.classList.add('sw-set');
        mountSettingsPage(page);
        // 若用户上次就停在这一页，说明是被重载踢走的，请宿主切回来
        if (window.__swOnMyPage && typeof api.ui.activatePanel === 'function') {
          setTimeout(() => { try { api.ui.activatePanel(); } catch (e) {} }, 80);
        }
        if (window.__swJustSaved) {
          window.__swJustSaved = false;
          const tip = document.createElement('div');
          tip.className = 'sw-set-saved';
          tip.textContent = dict.saved;
          page.appendChild(tip);
          setTimeout(() => { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 2600);
        }
      }
    }
  }

  /* 设置项归属哪个分组（plugin.json 里没有 group 字段，这里按 key 划分；
     校验脚本会盯着它必须覆盖全部设置项） */
  const GROUP_OF = {
    style: 'lo', position: 'lo', margin: 'lo', scale: 'lo', opacity: 'lo', card: 'lo', accent: 'lo',
    format: 'disp', blink: 'disp', showHint: 'disp', showLaps: 'disp',
    keyboard: 'op', mouse: 'op', autoStart: 'op',
    persist: 'data', goalOn: 'data', goal: 'data',
    infoStyle: 'info', infoAutoHide: 'info', infoSeconds: 'info', infoScale: 'info', infoClick: 'info',
  };

  function mountSettingsPage(page) {
    let ui = null;
    let fields = [];
    let stored = {};
    const draft = {};
    const changed = {};

    const sameVal = (a, b) => {
      if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
      return String(a) === String(b);
    };

    /* ---------- 控件：结构照抄宿主内置设置行 ---------- */
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
        valEl.className = 'sw-set-val';
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

      // 初值：草稿优先（语言切换重建时不能把用户改到一半的值丢掉）
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
        if (sameVal(v, stored[key])) delete changed[key];
        else changed[key] = true;
        refreshBar();
      };
      input.addEventListener('input', commit);
      input.addEventListener('change', commit);
      return row;
    }

    function refreshBar() {
      if (!ui) return;
      const n = Object.keys(changed).length;
      ui.save.disabled = n === 0;
      ui.discard.disabled = n === 0;
      ui.save.textContent = dict.applySave;
      ui.discard.textContent = dict.discard;
      ui.note.textContent = n ? dict.changedN.replace('{n}', String(n)) : dict.noChange;
    }

    /* ---------- 整页渲染（可重入：语言切换时重来一遍，草稿保留） ---------- */
    function renderAll() {
      page.textContent = '';
      ui = {};

      // 状态卡
      const card = document.createElement('div');
      card.className = 'sw-set-status';
      const dot = document.createElement('i');
      dot.className = 'sw-set-dot';
      const state = document.createElement('span');
      state.className = 'sw-set-state';
      const time = document.createElement('span');
      time.className = 'sw-set-time';
      const laps = document.createElement('span');
      laps.className = 'sw-set-lap';
      card.appendChild(dot);
      card.appendChild(state);
      card.appendChild(time);
      card.appendChild(laps);
      page.appendChild(card);

      // 常用操作
      const actions = document.createElement('div');
      actions.className = 'sw-set-actions';
      const mk = (cls, text, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        b.addEventListener('click', fn);
        actions.appendChild(b);
        return b;
      };
      ui.toggle = mk('sw-set-primary', dict.start, () => toggle());
      ui.lap = mk('', dict.lap, () => addLap());
      ui.reset = mk('', dict.reset, () => reset());
      ui.clear = mk('', dict.clearLaps, () => clearLaps());
      page.appendChild(actions);
      ui.state = state;
      ui.time = time;
      ui.laps = laps;
      ui.card = card;

      // 设置项
      const holder = document.createElement('div');
      holder.className = 'sw-set-fields';
      if (!fields.length) {
        const empty = document.createElement('div');
        empty.className = 'plugin-empty';
        empty.textContent = dict.noManifest;
        holder.appendChild(empty);
      } else {
        const groups = [
          ['lo', dict.gLo], ['disp', dict.gDisp], ['op', dict.gOp], ['data', dict.gData], ['info', dict.gInfo],
        ];
        groups.forEach(g => {
          const list = fields.filter(f => (GROUP_OF[f.key] || 'lo') === g[0]);
          if (!list.length) return;
          const h = document.createElement('div');
          h.className = 'plugin-section-label';
          h.textContent = g[1];
          holder.appendChild(h);
          const wrap = document.createElement('div');
          wrap.className = 'sw-set-group';
          list.forEach(f => wrap.appendChild(buildRow(f)));
          holder.appendChild(wrap);
        });
      }
      page.appendChild(holder);

      // 保存条
      const bar = document.createElement('div');
      bar.className = 'sw-set-bar';
      ui.save = document.createElement('button');
      ui.save.type = 'button';
      ui.save.className = 'sw-set-save';
      ui.save.addEventListener('click', applyDraft);
      ui.discard = document.createElement('button');
      ui.discard.type = 'button';
      ui.discard.className = 'sw-set-discard';
      ui.discard.addEventListener('click', () => {
        Object.keys(changed).forEach(k => delete changed[k]);
        Object.keys(draft).forEach(k => { draft[k] = stored[k]; });
        renderAll();
      });
      ui.note = document.createElement('span');
      ui.note.className = 'sw-set-note';
      bar.appendChild(ui.save);
      bar.appendChild(ui.discard);
      bar.appendChild(ui.note);
      page.appendChild(bar);

      refreshBar();
      syncStatus();
      syncTime(nowMs());
    }

    /* ---------- 提交：只发有改动的项 ---------- */
    function applyDraft() {
      const keys = Object.keys(changed);
      if (!keys.length) return;
      // [v1.0.5.7] 走 dc.setSetting（宿主侧写死插件 id，插件无法改别人的设置）
      if (typeof api.setSetting !== 'function') return;
      // 同步一次性发出：宿主每写一项都会广播并重载插件，但调用已经排进 IPC 队列、值都会被写入。
      // 页面随后重建 —— 所以把「刚保存过」和「留在本页」记在 window 上，重建后提示 + 切回来。
      keys.forEach(k => {
        try { api.setSetting(k, draft[k]); } catch (e) {}
      });
      window.__swJustSaved = true;
      window.__swOnMyPage = true;
    }

    // [v1.0.5.7] 隔离后插件点不到设置页导航：定期问宿主要「我这一页是否处于激活态」，
    // 供下次重挂载时决定要不要自动切回来。
    if (typeof api.ui.navInfo === 'function') {
      const navPoll = setInterval(() => {
        Promise.resolve(api.ui.navInfo()).then(info => {
          if (info && typeof info.active === 'boolean') window.__swOnMyPage = info.active;
        }).catch(() => {});
      }, 1000);
      const prevCleanup = window.__swNavPoll;
      window.__swNavPoll = navPoll;
      if (prevCleanup) clearInterval(prevCleanup);
    }

    /* ---------- 状态卡跟随内核 ---------- */
    function syncStatus() {
      if (!ui || !ui.card) return;
      const c = ui.card;
      c.classList.toggle('sw-run', running);
      c.classList.toggle('sw-pause', !running && hasRun);
      c.classList.toggle('sw-off', !running && !hasRun);
      ui.state.textContent = running ? dict.infoRunning : hasRun ? dict.infoPaused : dict.infoReady;
      ui.toggle.textContent = running ? dict.pause : dict.start;
      ui.laps.textContent = lapMarks.length ? '×' + lapMarks.length : '';
      ui.lap.disabled = !running && !hasRun;
    }
    function syncTime(ms) {
      if (!ui || !ui.time) return;
      const t = splitTime(ms);
      const txt = t.main + t.frac;
      if (ui.time.textContent !== txt) ui.time.textContent = txt;
    }

    renderAll();

    // 语言切换后重画（文案跟着变，草稿不丢）
    window.__swRefreshSettingsPage = () => {
      if (!page || !page.parentNode) return;
      renderAll();
    };

    attach({
      static: syncStatus,
      frame: syncTime,
    });

    // 拉清单（宿主的插件列表里带完整的设置定义，不必在插件里重抄）
    // [v1.0.5.7] 走 dc.listPlugins
    if (typeof api.listPlugins === 'function') {
      Promise.resolve(api.listPlugins()).then(list => {
        const me = (list || []).filter(p => p && p.id === api.id)[0];
        if (!me || !Array.isArray(me.settings) || !me.settings.length) return;
        fields = me.settings;
        stored = me.values || {};
        renderAll();
      }).catch(() => {});
    }
  }

  /* ============================ 7. 键盘（两个窗口共用同一套键位） ============================
   * 宿主只占用了 ESC，这里用捕获阶段处理自己的几个键，互不干扰。 */
  function onKey(e) {
    if (!cfg.keyboard) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const code = e.code;
    if (code === 'Space') { e.preventDefault(); toggle(); }
    else if (code === 'KeyR') { e.preventDefault(); reset(); }
    else if (code === 'KeyL') { e.preventDefault(); addLap(); }
    else if (code === 'KeyC') { e.preventDefault(); clearLaps(); }
    else return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  if (cfg.keyboard && keyboardHere) window.addEventListener('keydown', onKey, true);

  /* ============================ 8. 语言联动 ============================ */
  function applyLangEverywhere() {
    // 设置页的文案是我自己写的，重画一遍（草稿保留）
    if (typeof window.__swRefreshSettingsPage === 'function') {
      try { window.__swRefreshSettingsPage(); } catch (e) {}
    }
    // 导航项与页面标题在宿主里，插件改不了 → 请宿主代改（[v1.0.5.7]）
    const label = langNow() === 'en' ? 'Stopwatch' : dict.navTitle;
    if (typeof api.ui.setNavLabel === 'function') { try { api.ui.setNavLabel(label); } catch (e) {} }
    notify();
  }

  function syncLang() {
    const next = langNow();
    if (next === dict.__lang) return;
    dict = TEXT[next];
    dict.__lang = next;
    applyLangEverywhere();
  }

  // [v1.0.5.7] 语言来源：宿主推送/查询 + 宿主配置（隔离后看不见宿主 [data-lang] 节点）
  let langObserver = null;
  try {
    if (typeof api.ui.getHostLang === 'function') {
      Promise.resolve(api.ui.getHostLang()).then(l => { if (l) { hostLang = l; syncLang(); } }).catch(() => {});
    }
    if (typeof api.ui.onHostLangChanged === 'function') {
      api.ui.onHostLangChanged(l => { if (l) { hostLang = l; syncLang(); } });
    }
  } catch (e) {}

  // 时钟窗口既没有 [data-lang] 节点、也不写 <html lang> → 从宿主配置里取一次并跟着更新
  // [v1.0.5.7] 隔离后走 dc.getConfig / dc.onConfigUpdated（宿主只回白名单字段）
  (function watchConfigLang() {
    const token = (window.__swLangToken = (window.__swLangToken || 0) + 1);
    function apply(raw) {
      if (window.__swLangToken !== token) return;
      const next = String(raw || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'zh';
      if (next === cfgLang) return;
      cfgLang = next;
      syncLang();
    }
    if (typeof api.getConfig === 'function') {
      Promise.resolve(api.getConfig()).then(c => { if (c && c.language) apply(c.language); }).catch(() => {});
    }
    if (typeof api.onConfigUpdated === 'function') {
      try { api.onConfigUpdated(c => { if (c && c.language) apply(c.language); }); } catch (e) {}
    }
  })();

  /* ============================ 9. 生命周期 ============================ */
  function onPageHide() { save(false); }
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onPageHide);

  (async function boot() {
    if (cfg.persist) {
      let st = null;
      try { st = await api.storage.get(SYNC_KEY); } catch (e) {}
      if (!st || typeof st !== 'object') {
        // v1.0.0 用的是带屏幕签名的 key，这里一次性迁移过来，免得用户刚计的时间白丢
        try { st = await api.storage.get(LEGACY_KEY); } catch (e) {}
      }
      if (st && typeof st === 'object') {
        applyRemote(st);
        if (!st.rev) save(true); // 迁移过来的旧数据没有 rev，补一次正式写入
      }
    }
    notify();
    if (running) startLoop();
    else if (IS_LO && cfg.autoStart && !hasRun) start(); // 自动开始只在关灯窗口触发
  })();

  /* ============================ 收尾 ============================ */
  return function cleanup() {
    stopLoop();
    clearInterval(syncTimer);
    if (cfg.keyboard && keyboardHere) window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onPageHide);
    if (langObserver) langObserver.disconnect();
    if (window.__swRefreshSettingsPage) window.__swRefreshSettingsPage = null;
    if (teardownExtra) { try { teardownExtra(); } catch (e) {} }
    save(false); // 最后一次落盘
  };
});
