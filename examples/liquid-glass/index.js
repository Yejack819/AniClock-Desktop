/* ==================================================================
   liquid-glass —— 设置窗口液态玻璃主题 [v1.0.5.7]
   钩子：settings.theme      权限：ui.settings      apiVersion: 3（iframe 沙箱隔离）
   ------------------------------------------------------------------
   这个插件只做三件事，别的不碰：
   1) 把设置项算成 --lg-* 变量 + 在 <html> 上打几个 data-lg-* 属性（样式全在 style.css）；
   2) 在导航里养一块会滑动的玻璃滑块（宿主没有可复用的东西，只能自己画；
      隔离后用 dc.ui.push + dc.ui.navActive 让宿主代建 / 代查几何）；
   3) 用 dc.ui.nav 开一页配置面板（草稿 + 显式保存 + 重载后自动切回本页）。
   隔离后插件看不到宿主 DOM，所有对宿主的改动都走 dc.api（宿主侧代做 + 权限校验）。
   ================================================================== */

/* ---------- 文案（中英） ---------- */
const LG_L = {
  zh: {
    navLabel: '玻璃主题',
    pageTitle: '液态玻璃主题',
    intro: '极光背景 + 三层玻璃面板 + 药丸导航 + iOS 风格控件。改动会即时预览（只影响外观），点「保存」才写入设置。',
    groupLayout: '布局', groupGlass: '玻璃质感', groupColor: '配色', groupMotion: '背景与动效', groupAdv: '高级',
    save: '保存并应用', revert: '还原改动', reset: '恢复默认',
    dirty: n => '已改 ' + n + ' 项（未保存）',
    clean: '与已保存的设置一致',
    dirtyHint: '有未保存的改动 · 外观已按草稿预览，回「玻璃主题」页保存',
    saved: '已保存并生效', noChange: '没有需要保存的改动', resetDone: '已填入默认值，点保存后生效',
    metaFail: '读不到本插件的设置定义（getPluginList 没返回这一条），请在「插件」页确认插件状态。',
    previewCap: '实时预览（吃草稿值）',
    pvItem1: '模式', pvItem2: '外观', pvItem3: '时间',
    pvSwitch: '开关示例', pvBtn: '按钮示例',
    state: s => '当前：' + s,
    stateRefract: on => '折射' + (on ? '开' : '关'),
    advancedNote: '折射与颗粒都用 SVG 滤镜实现，会增加 GPU 开销；若窗口拖动变卡，先把折射关掉。'
  },
  en: {
    navLabel: 'Glass theme',
    pageTitle: 'Liquid Glass Theme',
    intro: 'Aurora background, three glass panels, pill navigation and iOS-style controls. Changes preview live; nothing is written until you hit Save.',
    groupLayout: 'Layout', groupGlass: 'Glass', groupColor: 'Color', groupMotion: 'Background & motion', groupAdv: 'Advanced',
    save: 'Save & apply', revert: 'Revert', reset: 'Reset to defaults',
    dirty: n => n + ' change' + (n > 1 ? 's' : '') + ' pending',
    clean: 'Matches saved settings',
    dirtyHint: 'Unsaved changes · shown as a draft preview — go back to “Glass theme” to save',
    saved: 'Saved and applied', noChange: 'Nothing to save', resetDone: 'Defaults filled in — hit Save to apply',
    metaFail: 'Could not read this plugin\'s setting definitions from getPluginList().',
    previewCap: 'Live preview (uses draft values)',
    pvItem1: 'Mode', pvItem2: 'Look', pvItem3: 'Time',
    pvSwitch: 'Toggle', pvBtn: 'Button',
    state: s => 'Now: ' + s,
    stateRefract: on => 'Refraction ' + (on ? 'on' : 'off'),
    advancedNote: 'Refraction and grain are SVG filters and cost GPU time. If dragging stutters, turn refraction off first.'
  }
};

/* 英文界面下用这份覆盖清单里的中文 label / hint / options（清单本身只有中文） */
const LG_EN_LABELS = {
  layout: 'Layout', radius: 'Corner radius', glider: 'Sliding pill indicator',
  blur: 'Glass blur', glassTint: 'Glass opacity', highlight: 'Specular highlight', glow: 'Accent glow',
  appearance: 'Color scheme', accent: 'Accent color',
  aurora: 'Aurora motion', auroraSpeed: 'Aurora period (s)', grain: 'Film grain',
  refraction: 'Liquid refraction', refractStrength: 'Refraction strength', hideScrollbars: 'Hide scrollbars'
};
const LG_EN_HINTS = {
  layout: 'Card list = single column of glass cards; grid = two columns (collapses on narrow windows)',
  radius: 'Base radius for panels and cards',
  glider: 'The active nav highlight is a sliding glass pill',
  blur: 'Higher = frostier. Lower it if the window feels heavy',
  glassTint: 'Higher = more opaque (whiter) glass',
  highlight: 'Brightness of the inner specular edge',
  glow: 'Colored halo around enabled toggles',
  appearance: 'Follow day/night = light glass from 07:00 to 19:00, dark otherwise',
  accent: 'Used by toggles, sliders, buttons and glow',
  aurora: 'Four colored blobs drift slowly; off keeps them still',
  auroraSpeed: 'Seconds per cycle — larger is slower',
  grain: 'A very faint noise layer to remove the plastic look',
  refraction: 'SVG displacement warps the backdrop like real glass. GPU heavy, off by default',
  refractStrength: 'Too high distorts card edges; 4–10 looks natural',
  hideScrollbars: 'Off shows a 7px glass scrollbar'
};
const LG_EN_OPTIONS = {
  layout: { grouped: 'Card list', grid: 'Two-column grid', plain: 'Classic single column' },
  appearance: { dark: 'Dark glass', light: 'Light glass', auto: 'Follow day/night' }
};

/* 分组：必须覆盖清单里的每一个 key（静态校验会卡这条） */
const LG_GROUPS = [
  { label: 'groupLayout', keys: ['layout', 'radius', 'glider'] },
  { label: 'groupGlass', keys: ['blur', 'glassTint', 'highlight', 'glow'] },
  { label: 'groupColor', keys: ['appearance', 'accent'] },
  { label: 'groupMotion', keys: ['aurora', 'auroraSpeed', 'grain'] },
  { label: 'groupAdv', keys: ['refraction', 'refractStrength', 'hideScrollbars'] }
];

const LG_LAYOUTS = ['grouped', 'grid', 'plain'];
const LG_SVG_NS = 'http://www.w3.org/2000/svg';

function lgClamp(v, lo, hi) {
  const n = Number(v);
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/* 语言探测顺序 [v1.0.5.7 隔离后重写]：
   隔离后插件看不见宿主 DOM，改为「宿主端缓存 + 向宿主要」：
   ① 宿主推送/查询的语言（dc.ui.getHostLang / onHostLangChanged）
   ② iframe 自身 <html lang> 兜底 */
let lgHostLang = '';
function lgDetectLang() {
  if (lgHostLang === 'zh' || lgHostLang === 'en') return lgHostLang;
  return /^zh/i.test(String((document.documentElement && document.documentElement.lang) || '')) ? 'zh' : 'en';
}
function lgPullHostLang(api) {
  if (!api || !api.ui) return;
  try {
    if (typeof api.ui.getHostLang === 'function') {
      Promise.resolve(api.ui.getHostLang()).then(function (l) {
        if (l === 'zh' || l === 'en') { lgHostLang = l; }
      }).catch(function () {});
    }
    if (typeof api.ui.onHostLangChanged === 'function') {
      api.ui.onHostLangChanged(function (l) { if (l === 'zh' || l === 'en') lgHostLang = l; });
    }
  } catch (e) {}
}

function lgEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function lgHexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return [108, 140, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

dc.mount(function (slot, api) {
  if (api.hook !== 'settings.theme') return null;

  // [v1.0.5.7] 隔离后不再有 window.electronAPI，一切经 api.*
  const S = api.settings || {};
  const PANEL_ID = 'plugin.' + api.id + '.panel';
  // 隔离后 settings.theme 会被挂载两次：
  //   ① 主题槽 iframe（无 panelId）：把主题层（变量/属性/极光颗粒 + 导航滑块）铺到宿主上；
  //      并向宿主注册导航页 ui.nav()，宿主随后会为它另建一个 sandbox iframe。
  //   ② 导航页 iframe（有 panelId）：把配置页 UI 建进**自己的 body**（api.ui.layer()）。
  const isPanel = (typeof api.isPanel === 'function') ? !!api.isPanel() : !!api.panelId;

  if (isPanel) return mountPanel(slot, api, S, PANEL_ID);
  return mountTheme(slot, api, S, PANEL_ID);
});

/* ================= 主题槽（settings.theme 第一相） ================= */
function mountTheme(slot, api, S, PANEL_ID) {
  let lang = lgDetectLang();
  const t = () => LG_L[lang] || LG_L.zh;

  // 每挂载一次就换一个令牌。卸载后仍在飞行中的异步续延必须靠它自杀。
  const myToken = (window.__lgToken = (window.__lgToken || 0) + 1);
  const alive = () => window.__lgToken === myToken;

  /* ================= 1. 变量与属性 ================= */
  let lastVarSig = '';
  function applyVars(cfg) {
    const rgb = lgHexToRgb(cfg.accent);
    const a = x => 'rgba(' + rgb.join(',') + ',' + x + ')';
    const vars = {
      '--lg-accent': /^#[0-9a-fA-F]{6}$/.test(String(cfg.accent)) ? cfg.accent : '#6C8CFF',
      '--lg-accent-soft': a(0.16),
      '--lg-accent-mid': a(0.34),
      '--lg-accent-line': a(0.55),
      '--lg-glow-a': a(lgClamp(cfg.glow, 0, 100) / 100),
      '--lg-blur': lgClamp(cfg.blur, 2, 60) + 'px',
      '--lg-tint': lgClamp(cfg.glassTint, 1, 40) / 100,
      '--lg-hi': lgClamp(cfg.highlight, 0, 100) / 100,
      '--lg-radius': lgClamp(cfg.radius, 6, 40) + 'px',
      '--lg-speed': lgClamp(cfg.auroraSpeed, 4, 240) + 's'
    };
    const sig = JSON.stringify(vars);
    if (sig === lastVarSig) return;
    lastVarSig = sig;
    api.ui.applyVars(vars);
  }

  function effTheme(cfg) {
    const mode = cfg.appearance;
    if (mode === 'dark' || mode === 'light') return mode;
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'light' : 'dark';
  }

  let lastAttrSig = '';
  function applyAttrs(cfg) {
    const attrs = {
      'data-lg': '1',
      'data-lg-layout': LG_LAYOUTS.indexOf(cfg.layout) >= 0 ? cfg.layout : 'grouped',
      'data-lg-theme': effTheme(cfg),
      'data-lg-aurora': cfg.aurora === false ? 'off' : 'on',
      'data-lg-grain': cfg.grain === false ? 'off' : 'on',
      'data-lg-glider': cfg.glider === false ? 'off' : 'on',
      'data-lg-refract': cfg.refraction === true ? 'on' : 'off',
      'data-lg-scroll': cfg.hideScrollbars === false ? 'show' : 'hide'
    };
    const sig = JSON.stringify(attrs);
    if (sig === lastAttrSig) return;
    lastAttrSig = sig;
    api.ui.patch('html', { attr: attrs });
  }

  /* ================= 2. 主题层（极光 / 颗粒 / SVG 滤镜） =================
     slot 是宿主给 settings.theme 钩子的 .plugin-theme-slot，随插件卸载整体移除 */
  let refractMap = null;
  function buildLayers() {
    slot.innerHTML = '';
    const aurora = lgEl('div', 'lg-aurora');
    for (let i = 1; i <= 4; i++) aurora.appendChild(lgEl('span', 'lg-blob lg-blob-' + i));
    const grain = lgEl('div', 'lg-grain');

    const svg = document.createElementNS(LG_SVG_NS, 'svg');
    svg.setAttribute('class', 'lg-svg');
    svg.setAttribute('aria-hidden', 'true');
    // 折射：fractalNoise → 模糊 → 位移（数值参考 web 上的 liquid glass 实现，缩到控件尺度）
    const filter = document.createElementNS(LG_SVG_NS, 'filter');
    filter.setAttribute('id', 'lg-refract');
    filter.setAttribute('x', '-12%');
    filter.setAttribute('y', '-12%');
    filter.setAttribute('width', '124%');
    filter.setAttribute('height', '124%');
    const turb = document.createElementNS(LG_SVG_NS, 'feTurbulence');
    turb.setAttribute('type', 'fractalNoise');
    turb.setAttribute('baseFrequency', '0.014 0.014');
    turb.setAttribute('numOctaves', '2');
    turb.setAttribute('seed', '7');
    turb.setAttribute('result', 'noise');
    const soft = document.createElementNS(LG_SVG_NS, 'feGaussianBlur');
    soft.setAttribute('in', 'noise');
    soft.setAttribute('stdDeviation', '3');
    soft.setAttribute('result', 'soft');
    const disp = document.createElementNS(LG_SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'soft');
    disp.setAttribute('scale', '8');
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');
    filter.appendChild(turb);
    filter.appendChild(soft);
    filter.appendChild(disp);
    refractMap = disp;

    // 颗粒：高频噪声 + 去色，靠 .lg-grain 的低透明度与混合模式压到几乎看不见
    const grainFilter = document.createElementNS(LG_SVG_NS, 'filter');
    grainFilter.setAttribute('id', 'lg-grain');
    const gt = document.createElementNS(LG_SVG_NS, 'feTurbulence');
    gt.setAttribute('type', 'fractalNoise');
    gt.setAttribute('baseFrequency', '0.85');
    gt.setAttribute('numOctaves', '3');
    gt.setAttribute('stitchTiles', 'stitch');
    const gm = document.createElementNS(LG_SVG_NS, 'feColorMatrix');
    gm.setAttribute('type', 'saturate');
    gm.setAttribute('values', '0');
    grainFilter.appendChild(gt);
    grainFilter.appendChild(gm);

    svg.appendChild(filter);
    svg.appendChild(grainFilter);
    slot.appendChild(aurora);
    slot.appendChild(grain);
    slot.appendChild(svg);
  }
  function setRefractScale(v) {
    if (refractMap) refractMap.setAttribute('scale', String(lgClamp(v, 1, 40)));
  }

  /* ================= 3. 导航滑块 ================= */
  let glider = null;
  let gliderRaf = 0;
  // [v1.0.5.7] 隔离后不再需要 MutationObserver 盯宿主 nav / lang，改订阅宿主推送

  function ensureGlider() {
    if (!alive()) return null;
    // [v1.0.5.7] 隔离后插件看不见宿主 nav：把滑块注入宿主 nav 的活由 dc.ui.push 代做，
    // 拿到的是宿主返回的元素句柄；位置则通过 dc.ui.navActive() 查询后设置。
    if (!glider) {
      try { api.ui.push('#settings-nav', '<div class="lg-glider no-anim" aria-hidden="true"></div>'); } catch (e) { return null; }
      glider = api.ui.get('#settings-nav .lg-glider');
    }
    return glider;
  }
  function placeGlider(instant) {
    if (!alive()) return;
    if (S.glider === false) { if (glider) glider.cls(null, 'is-on'); return; }
    // 问宿主要当前激活项的相对几何（插件侧看不到宿主节点）
    if (typeof api.ui.navActive !== 'function') return;
    Promise.resolve(api.ui.navActive()).then(function (info) {
      if (!alive() || !glider) return;
      if (!info || !info.any || !info.visible) { glider.cls(null, 'is-on'); return; }
      if (instant) glider.cls('no-anim', null);
      glider.style('width', info.width + 'px');
      glider.style('height', info.height + 'px');
      glider.style('transform', 'translate3d(' + info.offsetX + 'px,' + info.offsetY + 'px,0)');
      glider.cls('is-on', null);
      if (instant) setTimeout(function () { if (alive()) glider.cls(null, 'no-anim'); }, 20);
    }).catch(function () {});
  }
  function scheduleGlider() {
    if (!alive() || gliderRaf) return;
    gliderRaf = requestAnimationFrame(function () {
      gliderRaf = 0;
      if (!alive()) return;
      placeGlider(false);
    });
  }
  function watchNav() {
    // [v1.0.5.7] 改为订阅宿主推送的布局变化事件（原来自己 MutationObserver 盯宿主 nav）
    if (typeof api.ui.onHostLayoutChanged === 'function') {
      api.ui.onHostLayoutChanged(scheduleGlider);
    }
    window.addEventListener('resize', scheduleGlider);
  }

  function syncNavLabel() {
    // [v1.0.5.7] 导航项与面板标题在宿主里 → 请宿主代改
    if (typeof api.ui.setNavLabel === 'function') { try { api.ui.setNavLabel(t().navLabel); } catch (e) {} }
  }

  /* ================= 5. 语言 / 页面切换的联动 ================= */
  // [v1.0.5.7] 隔离后插件拿不到宿主 nav 点击：仅用 navActive() 判断自己是不是当前页，
  // 用来决定导航滑块的显隐（真正的草稿/脏标记在导航页 iframe 里）。
  function onPanelActive(active) {
    if (!alive()) return;
    window.__lgOnMyPage = !!active;
    scheduleGlider();
  }
  const navPoll = setInterval(function () {
    if (!alive()) return;
    if (typeof api.ui.navActive !== 'function') return;
    Promise.resolve(api.ui.navActive()).then(function (info) {
      if (!alive() || !info) return;
      onPanelActive(info.panelId === PANEL_ID);
    }).catch(function () {});
  }, 800);

  function onHostLang(l) {
    if (!alive() || (l !== 'zh' && l !== 'en')) return;
    lgHostLang = l;
    if (l === lang) return;
    lang = l;
    syncNavLabel();
    scheduleGlider();
  }
  try { if (typeof api.ui.onHostLangChanged === 'function') api.ui.onHostLangChanged(onHostLang); } catch (e) {}

  let autoTimer = null;

  /* ================= 6. 启动（主题相） ================= */
  async function boot() {
    applyVars(S);
    applyAttrs(S);
    buildLayers();
    setRefractScale(S.refractStrength);
    ensureGlider();
    watchNav();
    placeGlider(true);
    syncNavLabel();

    // 向宿主注册导航页（宿主会为它另建一个 sandbox iframe 跑 mountPanel）
    try { if (typeof api.ui.nav === 'function') api.ui.nav({ id: 'panel', label: t().navLabel, icon: '🫧' }); } catch (e) {}

    try {
      // [v1.0.5.7] 隔离后插件读不到宿主，改为走 RPC 查插件清单（panel 相也要用，写进 window 传递）
      if (typeof api.listPlugins === 'function') {
        const list = await api.listPlugins();
        if (!alive()) return;
        window.__lgMeta = (list || []).find(function (p) { return p.id === api.id; }) || null;
      }
    } catch (e) { window.__lgMeta = null; }
    if (!alive()) return;

    syncNavLabel();
    placeGlider(true);

    // 刚保存过 → 重建后由导航页 iframe 弹「已保存」（此处只清标记）
    window.__lgJustSaved = false;
    // 跟随昼夜：跨过 7:00 / 19:00 时自己换一次
    autoTimer = setInterval(function () {
      if (!alive()) return;
      if (S.appearance === 'auto') applyAttrs(S);
    }, 60000);
  }
  boot();

  return function cleanup() {
    window.removeEventListener('resize', scheduleGlider);
    // [v1.0.5.7] navObserver / navResizeObserver / langObserver / onDocClick 已移除
    // （改由宿主推送事件），清理时只剩 navPoll / resize / raf / autoTimer 需要收尾
    if (navPoll) clearInterval(navPoll);
    if (gliderRaf) cancelAnimationFrame(gliderRaf);
    if (autoTimer) clearInterval(autoTimer);
    if (toastEl && toastEl.__lgTimer) clearTimeout(toastEl.__lgTimer);
    glider = null;
    pageEl = null;
    refractMap = null;
  };
}

/* ================= 导航页（settings.theme 第二相） ================= */
// 隔离后这一相跑在**自己的 sandbox iframe** 里：page 就是本 iframe 的 body。
function mountPanel(slot, api, S, PANEL_ID) {
  let lang = lgDetectLang();
  const t = () => LG_L[lang] || LG_L.zh;
  const myToken = (window.__lgPanelToken = (window.__lgPanelToken || 0) + 1);
  const alive = () => window.__lgPanelToken === myToken;

  const page = (typeof api.ui.layer === 'function' && api.ui.layer()) || (typeof api.root === 'function' && api.root()) || slot;
  if (!page || !page.appendChild) return null;
  page.classList.add('lg-page');

  // [v1.0.5.7] 清单自己取：原来靠主题相 iframe 写 window.__lgMeta 传递 —— v3 下两个
  // iframe 是两个独立 window，恒为 null，配置页永远走 metaFail 分支。
  let meta = null;
  if (typeof api.listPlugins === 'function') {
    Promise.resolve(api.listPlugins()).then(function (list) {
      if (!alive()) return;
      meta = (list || []).find(function (p) { return p.id === api.id; }) || null;
      renderPage();
    }).catch(function () { if (alive()) renderPage(); });
  }
  let draft = Object.assign({}, S);
  const rowMap = {};
  let toastEl = null;

  /* ---- 文案（导航页只需这些） ---- */
  const LABELS = {
    zh: {
      navLabel: '液态玻璃', intro: '设置窗口的苹果液态玻璃主题：极光流光 + 三层玻璃面板。',
      metaFail: '未能读取设置项清单，请重新打开本页。',
      revert: '还原', reset: '恢复默认', save: '保存',
      dirty: function (n) { return '有 ' + n + ' 项未保存'; }, clean: '已同步',
      noChange: '没有改动', saved: '已保存', resetDone: '已恢复默认（记得保存）',
      dirtyHint: '改动尚未保存', previewCap: '预览', advancedNote: '折射强度建议 4–10；更高会明显变形。',
      stateRefract: function (on) { return on ? '折射开' : '折射关'; }
    },
    en: {
      navLabel: 'Liquid Glass', intro: 'Apple Liquid Glass theme for Settings: aurora flow + tri-layer glass panels.',
      metaFail: 'Could not read the setting list. Reopen this page.',
      revert: 'Revert', reset: 'Reset', save: 'Save',
      dirty: function (n) { return n + ' unsaved'; }, clean: 'Synced',
      noChange: 'No changes', saved: 'Saved', resetDone: 'Reset to defaults (remember to save)',
      dirtyHint: 'Unsaved changes', previewCap: 'Preview', advancedNote: 'Refraction works best at 4–10; higher distorts noticeably.',
      stateRefract: function (on) { return on ? 'Refraction on' : 'Refraction off'; }
    }
  };
  const TT = () => LABELS[lang] || LABELS.zh;

  let lastVarSig = '';
  function applyVars(cfg) {
    const rgb = lgHexToRgb(cfg.accent);
    const a = x => 'rgba(' + rgb.join(',') + ',' + x + ')';
    const vars = {
      '--lg-accent': /^#[0-9a-fA-F]{6}$/.test(String(cfg.accent)) ? cfg.accent : '#6C8CFF',
      '--lg-accent-soft': a(0.16), '--lg-accent-mid': a(0.34), '--lg-accent-line': a(0.55),
      '--lg-glow-a': a(lgClamp(cfg.glow, 0, 100) / 100),
      '--lg-blur': lgClamp(cfg.blur, 2, 60) + 'px',
      '--lg-tint': lgClamp(cfg.glassTint, 1, 40) / 100,
      '--lg-hi': lgClamp(cfg.highlight, 0, 100) / 100,
      '--lg-radius': lgClamp(cfg.radius, 6, 40) + 'px',
      '--lg-speed': lgClamp(cfg.auroraSpeed, 4, 240) + 's'
    };
    const sig = JSON.stringify(vars);
    if (sig === lastVarSig) return;
    lastVarSig = sig;
    api.ui.applyVars(vars);
  }
  function effTheme(cfg) {
    const mode = cfg.appearance;
    if (mode === 'dark' || mode === 'light') return mode;
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'light' : 'dark';
  }
  let lastAttrSig = '';
  function applyAttrs(cfg) {
    const attrs = {
      'data-lg': '1',
      'data-lg-layout': LG_LAYOUTS.indexOf(cfg.layout) >= 0 ? cfg.layout : 'grouped',
      'data-lg-theme': effTheme(cfg),
      'data-lg-aurora': cfg.aurora === false ? 'off' : 'on',
      'data-lg-grain': cfg.grain === false ? 'off' : 'on',
      'data-lg-glider': cfg.glider === false ? 'off' : 'on',
      'data-lg-refract': cfg.refraction === true ? 'on' : 'off',
      'data-lg-scroll': cfg.hideScrollbars === false ? 'show' : 'hide'
    };
    const sig = JSON.stringify(attrs);
    if (sig === lastAttrSig) return;
    lastAttrSig = sig;
    api.ui.patch('html', { attr: attrs });
  }

  function toast(msg) {
    if (!alive()) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = lgEl('div', 'lg-toast', null);
      toastEl.setAttribute('role', 'status');
      page.appendChild(toastEl);
    }
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    if (toastEl.__lgTimer) clearTimeout(toastEl.__lgTimer);
    toastEl.__lgTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2000);
  }

  function changedKeys() {
    return Object.keys(draft).filter(function (k) { return draft[k] !== S[k]; });
  }
  function renderPage() {
    if (!alive()) return;
    page.textContent = '';
    Object.keys(rowMap).forEach(function (k) { delete rowMap[k]; });
    page.appendChild(lgEl('div', 'lg-note', TT().intro));

    if (!meta || !meta.settings || !meta.settings.length) {
      page.appendChild(lgEl('div', 'lg-note', TT().metaFail));
    } else {
      const byKey = {};
      meta.settings.forEach(function (f) { byKey[f.key] = f; });
      LG_GROUPS.forEach(function (g) {
        const keys = g.keys.filter(function (k) { return byKey[k]; });
        if (!keys.length) return;
        page.appendChild(lgEl('div', 'lg-group-label', TT()[g.label]));
        const box = lgEl('div', 'lg-fields');
        keys.forEach(function (k) { box.appendChild(buildRow(byKey[k])); });
        page.appendChild(box);
      });
      page.appendChild(lgEl('div', 'lg-note', TT().advancedNote));
    }

    const bar = lgEl('div', 'lg-savebar');
    bar.appendChild(lgEl('div', 'lg-dirty'));
    const revertBtn = lgEl('button', 'lg-btn', TT().revert);
    const resetBtn = lgEl('button', 'lg-btn', TT().reset);
    const saveBtn = lgEl('button', 'lg-btn is-primary', TT().save);
    bar.appendChild(revertBtn); bar.appendChild(resetBtn); bar.appendChild(saveBtn);
    page.appendChild(bar);

    revertBtn.addEventListener('click', function () { draft = Object.assign({}, S); renderPage(); });
    resetBtn.addEventListener('click', function () {
      (meta && meta.settings ? meta.settings : []).forEach(function (f) { if (f.default !== undefined) draft[f.key] = f.default; });
      renderPage(); toast(TT().resetDone);
    });
    saveBtn.addEventListener('click', function () { doSave(); });
    syncDirty();
  }

  function buildRow(f) {
    const row = lgEl('div', 'setting-row');
    const value = draft[f.key] !== undefined ? draft[f.key] : f.default;
    const label = lgEl('label');
    let input = null;
    const labelOf = function (ff) { return ff.label || ff.key; };
    if (f.type === 'toggle') {
      label.appendChild(lgEl('span', null, labelOf(f)));
      row.appendChild(label);
      const sw = lgEl('label', 'toggle-switch');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = value === true;
      sw.appendChild(cb); sw.appendChild(lgEl('span', 'toggle-slider'));
      row.appendChild(sw); input = cb;
      cb.addEventListener('change', function () { setDraft(f.key, cb.checked); });
      if (f.hint) { row.classList.add('row-col', 'switch-with-note'); row.appendChild(lgEl('span', 'setting-note', f.hint)); }
    } else if (f.type === 'select') {
      label.textContent = labelOf(f); row.appendChild(label);
      const sel = document.createElement('select');
      (f.options || []).forEach(function (o) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label || o.value; sel.appendChild(op); });
      sel.value = value; row.appendChild(sel); input = sel;
      sel.addEventListener('change', function () { setDraft(f.key, sel.value); });
    } else if (f.type === 'color') {
      label.textContent = labelOf(f); row.appendChild(label);
      const col = document.createElement('input'); col.type = 'color';
      col.value = /^#[0-9a-fA-F]{6}$/.test(String(value)) ? value : '#6C8CFF';
      row.appendChild(col); input = col;
      col.addEventListener('input', function () { setDraft(f.key, col.value); });
    } else if (f.type === 'slider' || f.type === 'number') {
      const head = lgEl('span', null, labelOf(f));
      const val = lgEl('span', 'lg-val', String(value));
      label.appendChild(head); label.appendChild(document.createTextNode(' ')); label.appendChild(val);
      row.appendChild(label);
      const rng = document.createElement('input'); rng.type = 'range';
      rng.min = String(f.min !== undefined ? f.min : 0);
      rng.max = String(f.max !== undefined ? f.max : 100);
      rng.step = String(f.step || 1);
      rng.value = String(value);
      row.appendChild(rng); input = rng;
      rng.addEventListener('input', function () { val.textContent = rng.value; setDraft(f.key, Number(rng.value)); });
    }
    rowMap[f.key] = { row: row, input: input };
    return row;
  }

  function setDraft(key, value) {
    draft[key] = value;
    applyVars(draft);
    applyAttrs(draft);
    syncDirty();
  }
  function syncDirty() {
    if (!alive()) return;
    const n = changedKeys().length;
    const bar = page.querySelector('.lg-dirty');
    if (bar) { bar.textContent = n ? TT().dirty(n) : TT().clean; bar.classList.toggle('is-dirty', n > 0); }
    const saveBtn = page.querySelector('.lg-savebar .lg-btn.is-primary');
    if (saveBtn) saveBtn.disabled = n === 0;
  }
  async function doSave() {
    const changed = changedKeys();
    if (!changed.length) { toast(TT().noChange); return; }
    if (typeof api.setSetting !== 'function') return;
    // [v1.0.5.7] 不逐项 await：第一次 setSetting 就会触发插件整体重载，本 iframe
    // 随即被销毁，后面 await 的项永远存不上。一次把所有改动同步排进 IPC 队列
    //（与 stopwatch 同款做法），宿主会依次落盘。
    window.__lgJustSaved = true;
    window.__lgOnMyPage = true;
    for (let i = 0; i < changed.length; i++) {
      try { api.setSetting(changed[i], draft[changed[i]]); } catch (e) {}
    }
    // 宿主保存后会重载插件，主题相会重建
  }

  // 语言变化：宿主推送
  try { if (typeof api.ui.onHostLangChanged === 'function') api.ui.onHostLangChanged(function (l) {
    if (l !== 'zh' && l !== 'en') return;
    if (l === lang) return;
    lang = l;
    try { api.ui.setNavLabel(TT().navLabel); } catch (e) {}
    renderPage();
  }); } catch (e) {}

  // 自己是激活页时，主题相（另一个 iframe）里养着导航滑块，需要点一下让它重排
  try { if (typeof api.ui.activatePanel === 'function') api.ui.activatePanel(); } catch (e) {}

  renderPage();

  return function cleanup() {
    if (toastEl && toastEl.__lgTimer) clearTimeout(toastEl.__lgTimer);
    page.textContent = '';
  };
}
