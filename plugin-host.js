/* plugin-host.js — [v1.0.5.5] 插件宿主运行时（时钟 / 关灯 / 设置 三个窗口共用）
 *
 * 安全模型（轻量 JS 沙箱）：
 * - 插件代码由主进程以文本下发，这里用 new Function('dc', code) 包裹执行；
 *   页面本身是 contextIsolation + 无 nodeIntegration，插件因此拿不到 require / Node / Electron。
 * - 插件只能通过下发的 dc 对象做事，能力范围由 manifest 的 hooks / permissions 决定：
 *     hooks       → 能挂到哪个窗口的哪个插槽
 *     permissions → storage（读写自己的数据）、net（发起 https 请求）、
 *                   ui.clock / ui.settings / ui.lightsOffBg（该窗口的界面编辑权）
 * - 每个插件单独 try/catch，出错只上报不拖垮宿主；错误信息会显示在设置界面里。
 * - 卸载时按记录回收节点、样式、CSS 变量与「插件改过的宿主元素」，保证反复开关不留残留。
 *
 * 界面编辑权（v1.0.5.5 新增）的边界：
 * - 可改样式 / 文本 / 属性 / 类名，可隐藏元素，可往元素里追加内容；
 *   但不能删除宿主元素、不能改宿主行为（拖动、双击退出、闹钟、保存等）。
 * - 保护元素（关灯的退出/锁定按钮、设置窗口的插件面板）连隐藏都会被拒绝 —— 保证任何插件
 *   出问题时用户都还能自救。
 * - 通过 dc.ui 做的一切改动都会被登记，插件卸载或改设置时逐个还原。
 */
(function () {
  const api = window.electronAPI;
  if (!api || !api.getPluginBundle) return;

  const hook = (document.body && document.body.dataset && document.body.dataset.pluginHook) || '';
  const LAYER_ID = 'plugin-layer';
  const mounted = [];

  // 每个窗口对应的「界面编辑权」；undefined = 该窗口不开放宿主元素编辑
  const WINDOW_UI_PERMISSION = {
    'clock.infoBar': 'ui.clock',
    'settings.theme': 'ui.settings',
    'lightsOff.background': null, // 关灯窗口只放开背景板背景，宿主元素不开放
  };
  // 覆盖层样式：时钟 / 设置窗口的 CSS 里没有 #plugin-layer，由这里补上；
  // 关灯窗口用的是 lights-off.css 里的规则，保持原样不覆盖。
  const LAYER_INLINE_STYLE = 'position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;pointer-events:none;';
  // 保护元素：连隐藏都不允许（选择器命中即拒绝）。原则是「出问题时用户还能自救」。
  const PROTECTED_SELECTORS = {
    'lightsOff.background': ['#controls', '#btn-exit', '#btn-lock', '#btn-settings'],
    'settings.theme': ['#plugin-list', '#plugin-status', '.nav-item[data-panel="plugins"]'],
    'clock.infoBar': [],
  };
  const windowUiPermission = () => WINDOW_UI_PERMISSION[hook] || null;
  const protectedList = () => PROTECTED_SELECTORS[hook] || [];
  function isProtected(sel) {
    const list = protectedList();
    if (!list.length) return false;
    const targets = document.querySelectorAll(sel);
    return Array.prototype.some.call(targets, el => list.some(p => { try { return el.matches(p); } catch (e) { return false; } }));
  }

  // ========== 主题探测（三个窗口通用：按实际计算出来的底色亮暗判断） ==========
  function luminance(color) {
    const m = String(color).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
  }
  function currentTheme() {
    const probe = document.getElementById('time-display') || document.body;
    const cs = getComputedStyle(probe);
    const fg = cs.color;
    let ref = luminance(cs.backgroundColor);
    if (ref === null) ref = luminance(getComputedStyle(document.body).backgroundColor);
    if (ref === null) {
      const lf = luminance(fg);
      ref = lf === null ? 0.5 : 1 - lf;
    }
    return { isDark: ref < 0.5, fg, bg: cs.backgroundColor, ref };
  }

  // ========== 插槽 ==========
  function ensureLayer() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      // 关灯窗口的层级/穿透样式来自 lights-off.css；时钟与设置窗口没有对应规则，这里内联补上
      if (hook !== 'lightsOff.background') layer.setAttribute('style', LAYER_INLINE_STYLE);
      document.body.appendChild(layer);
    }
    return layer;
  }
  // 插件在该窗口的自绘层（铺满、居中、默认不吃鼠标事件）
  function createStage(plugin) {
    const stage = document.createElement('div');
    stage.className = 'plugin-stage';
    stage.dataset.pluginId = plugin.id;
    ensureLayer().appendChild(stage);
    return stage;
  }
  function notifyHost() {
    window.dispatchEvent(new Event('dc-plugins-updated'));
  }

  function createSlot(plugin) {
    if (hook === 'clock.infoBar') {
      const bar = document.getElementById('info-bar');
      if (!bar) return null;
      const slot = document.createElement('span');
      slot.className = 'plugin-info-slot';
      slot.dataset.pluginId = plugin.id;
      bar.appendChild(slot);
      return slot;
    }
    if (hook === 'lightsOff.background') return createStage(plugin);
    if (hook === 'settings.theme') {
      const slot = document.createElement('div');
      slot.className = 'plugin-theme-slot';
      slot.dataset.pluginId = plugin.id;
      document.body.appendChild(slot);
      return slot;
    }
    return null;
  }

  // ========== 单个插件的 dc API ==========
  function makeApi(plugin, slot, record) {
    const has = p => (plugin.permissions || []).indexOf(p) >= 0;
    const needs = p => {
      if (!has(p)) throw new Error('permission-denied:' + p + '（请在 plugin.json 的 permissions 里声明）');
    };
    const mounts = [];
    const events = {};

    // ========== 改动登记：一切经 dc.ui 做的修改都留痕，卸载时逐个还原 ==========
    const edits = record.edits || (record.edits = []);
    const listeners = record.listeners || (record.listeners = []);
    let layerEl = null;

    function toKebab(prop) {
      return String(prop).replace(/^--/, '--').replace(/([A-Z])/g, m => '-' + m.toLowerCase());
    }
    function recStyle(el, prop, value) {
      edits.push({
        kind: 'style', el, prop,
        prev: el.style.getPropertyValue(prop),
        priority: el.style.getPropertyPriority(prop),
      });
      el.style.setProperty(prop, String(value));
    }
    function recClass(el, name, on) {
      edits.push({ kind: 'class', el, name, on: !!on });
      el.classList.toggle(name, !!on);
    }
    function recAttr(el, name, value) {
      edits.push({ kind: 'attr', el, name, prev: el.getAttribute(name) });
      if (value === null || value === undefined) el.removeAttribute(name);
      else el.setAttribute(name, String(value));
    }
    function recText(el, value) {
      const entry = { kind: 'text', el, prev: el.textContent, mine: null };
      el.textContent = value === undefined || value === null ? '' : String(value);
      entry.mine = el.textContent;
      edits.push(entry);
    }
    function recNodes(parent, nodes) {
      if (nodes.length) edits.push({ kind: 'nodes', parent, nodes });
    }
    function pick(sel) {
      try { return document.querySelector(String(sel)); } catch (e) { return null; }
    }
    // 该窗口的界面编辑权（时钟 / 设置窗口才有；关灯窗口只放开背景）
    function needsWindowUi() {
      const perm = windowUiPermission();
      if (!perm) throw new Error('ui-not-supported-in-this-window');
      needs(perm);
    }
    // 绑定交互：插件自绘的交互区不该触发宿主行为（关灯的「双击背景退出」最典型）
    function attach(el, type, cb) {
      const handler = event => {
        if (type === 'click' || type === 'mousedown' || type === 'dblclick') {
          try { event.stopPropagation(); } catch (e) {}
        }
        try { cb(event, el); } catch (e) { report(e); }
      };
      el.addEventListener(type, handler);
      listeners.push({ el, type, handler });
      // 时钟窗口整块是拖动区，可交互元素必须显式 no-drag，否则点不动
      if (!el.style.getPropertyValue('-webkit-app-region')) recStyle(el, '-webkit-app-region', 'no-drag');
    }
    function makeHandle(el, sel) {
      const handle = {
        // 只读用途：量尺寸 / 读计算样式（改请用下面的方法，否则不会被自动还原）
        node: () => el,
        style: (k, v) => { recStyle(el, toKebab(k), v); return handle; },
        cls: (add, remove) => {
          const addList = typeof add === 'string' ? add.split(/\s+/) : (add || []);
          const rmList = typeof remove === 'string' ? remove.split(/\s+/) : (remove || []);
          addList.filter(Boolean).forEach(n => recClass(el, n, true));
          rmList.filter(Boolean).forEach(n => recClass(el, n, false));
          return handle;
        },
        text: v => { recText(el, v); return handle; },
        attr: (k, v) => { recAttr(el, k, v); return handle; },
        hide: () => { if (isProtected(sel)) throw new Error('protected-element:' + sel); recStyle(el, 'display', 'none'); return handle; },
        show: () => {
          const last = edits.slice().reverse().find(e => e.kind === 'style' && e.el === el && e.prop === 'display');
          if (last && last.prev) el.style.setProperty('display', last.prev);
          else el.style.removeProperty('display');
          return handle;
        },
        push: html => { pushHtml(el, html); return handle; },
        on: (type, cb) => { attach(el, type, cb); return handle; },
      };
      return handle;
    }
    function pushHtml(el, html) {
      const holder = document.createElement('div');
      holder.innerHTML = sanitizeHtml(html, plugin.assetsBase);
      const nodes = Array.prototype.slice.call(holder.childNodes);
      nodes.forEach(n => el.appendChild(n));
      recNodes(el, nodes);
      return nodes.length > 0;
    }
    function patchEl(el, sel, ops) {
      const prot = isProtected(sel);
      if (ops.style) {
        Object.keys(ops.style).forEach(k => {
          const prop = toKebab(k);
          // 保护元素不允许被藏起来（style 里塞 display:none 也是藏）
          if (prot && /^(display|visibility|opacity)$/.test(prop)) throw new Error('protected-element:' + sel);
          recStyle(el, prop, ops.style[k]);
        });
      }
      if (ops.class) {
        const c = ops.class;
        if (typeof c === 'string' || Array.isArray(c)) makeHandle(el, sel).cls(c, null);
        else makeHandle(el, sel).cls(c.add, c.remove);
      }
      if (ops.attr) Object.keys(ops.attr).forEach(k => recAttr(el, k, ops.attr[k]));
    }

    // ===== 插件导航页：让宿主刷新 navItems/panels（那两个数组是加载时一次性抓取的） =====
    function refreshHostNav(attempt) {
      const n = attempt || 0;
      try {
        if (window.DCPlugins && typeof window.DCPlugins.refreshNav === 'function') {
          window.DCPlugins.refreshNav();
          return;
        }
      } catch (e) {}
      if (n < 5) setTimeout(() => refreshHostNav(n + 1), 200); // 桥接还没建好时重试几次
    }
    // 单插件最多 3 个导航页，全体插件合计最多 5 个（避免把内置导航挤没）
    const NAV_PAGE_MAX_PER_PLUGIN = 3;
    const NAV_PAGE_MAX_TOTAL = 5;
    function createNavPage(spec) {
      needsWindowUi();
      // 导航页只存在于设置窗口，别的窗口里调用直接说清楚
      if (hook !== 'settings.theme') throw new Error('ui-not-supported-in-this-window');
      const s = spec || {};
      const id = String(s.id || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id)) throw new Error('bad-nav-id');
      const label = String(s.label || plugin.name || id).slice(0, 24);
      const icon = String(s.icon || '🧩').slice(0, 4);
      const panelId = 'plugin.' + plugin.id + '.' + id;
      const mine = record.navPanels || (record.navPanels = []);
      if (mine.length >= NAV_PAGE_MAX_PER_PLUGIN) throw new Error('too-many-nav-pages');
      if (mine.indexOf(panelId) >= 0) return mine[panelId];
      if (document.querySelectorAll('.plugin-nav-item').length >= NAV_PAGE_MAX_TOTAL) throw new Error('too-many-nav-pages');

      const nav = document.getElementById('settings-nav');
      const content = document.getElementById('settings-content');
      if (!nav || !content) throw new Error('nav-host-missing');

      const btn = document.createElement('button');
      btn.className = 'nav-item plugin-nav-item';
      btn.dataset.panel = panelId;
      btn.dataset.pluginId = plugin.id;
      const iconEl = document.createElement('span');
      iconEl.className = 'nav-icon';
      iconEl.textContent = icon;
      const textEl = document.createElement('span');
      textEl.className = 'nav-text'; // 不带 data-lang：切换语言时宿主不会覆盖插件的标题
      textEl.textContent = label;
      btn.appendChild(iconEl);
      btn.appendChild(textEl);
      // 插在「插件」项之后、且排在已有的插件页之后 —— 否则连续建多个页面时顺序会反
      // （每个都插在同一个锚点后面 → 后建的跑到前面去）
      const existing = nav.querySelectorAll('.plugin-nav-item');
      const anchor = existing.length
        ? existing[existing.length - 1]
        : nav.querySelector('.nav-item[data-panel="plugins"]');
      if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', btn);
      else nav.appendChild(btn);

      const section = document.createElement('section');
      section.className = 'panel plugin-nav-panel';
      section.dataset.panel = panelId;
      section.dataset.pluginId = plugin.id;
      const title = document.createElement('h2');
      title.className = 'panel-title';
      title.textContent = label;
      const body = document.createElement('div');
      body.className = 'plugin-nav-body';
      section.appendChild(title);
      section.appendChild(body);
      content.appendChild(section);

      record.nodes.push(btn, section);
      mine.push(panelId);
      refreshHostNav();
      return body;
    }

    // ========== 关灯背景板：背景层（需 ui.lightsOffBg） ==========
    function bgLayer() {
      let layer = document.getElementById('plugin-bg-layer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'plugin-bg-layer';
        document.body.insertBefore(layer, document.body.firstChild);
        record.createdBgLayer = true;
      }
      return layer;
    }
    function applyBackground(spec) {
      needs('ui.lightsOffBg');
      const s = spec || {};
      const layer = bgLayer();
      record.bgTouched = true;
      const bg = [];
      if (s.gradient) bg.push(String(s.gradient));
      else if (s.image) {
        // 只接受插件自己的资源或 https，免得被当成任意本地文件的读取器
        const url = String(s.image);
        const okAsset = plugin.assetsBase && url.indexOf(plugin.assetsBase) === 0;
        if (!(okAsset || /^https:\/\//i.test(url))) throw new Error('bad-image-url');
        bg.push('url("' + url.replace(/"/g, '\\"') + '")');
      } else if (s.color) {
        bg.push(String(s.color));
      }
      if (bg.length) layer.style.background = bg.join(', ');
      if (s.size) layer.style.backgroundSize = String(s.size);
      if (s.position) layer.style.backgroundPosition = String(s.position);
      if (s.repeat) layer.style.backgroundRepeat = String(s.repeat);
      layer.style.opacity = s.opacity === undefined ? '' : String(s.opacity);
      layer.style.filter = s.blur ? 'blur(' + Number(s.blur) + 'px)' : '';
      return true;
    }
    function clearBackground() {
      needs('ui.lightsOffBg');
      const layer = document.getElementById('plugin-bg-layer');
      if (!layer) return true;
      layer.removeAttribute('style');
      record.bgTouched = false;
      return true;
    }

    const dc = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      hook,
      settings: Object.freeze(Object.assign({}, plugin.values || {})),
      // 宿主支持的插件 API 版本，由主进程下发（apiVersion 2 起才有界面编辑权）
      apiVersion: Number(plugin.hostApiVersion) || 1,
      theme: currentTheme,
      log: function () {
        try { console.log.apply(console, ['[plugin:' + plugin.id + ']'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
      },
      // 注册挂载逻辑：fn(slot) 可返回清理函数
      mount: fn => { if (typeof fn === 'function') mounts.push(fn); },
      on: (name, cb) => { (events[name] = events[name] || []).push(cb); },
      emit: (name, payload) => { (events[name] || []).forEach(cb => { try { cb(payload); } catch (e) { report(e); } }); },

      clock: {
        setInfoText: text => {
          if (hook !== 'clock.infoBar' || !slot) return;
          slot.textContent = text === undefined || text === null ? '' : String(text);
          notifyHost();
        },
        clearInfoText: () => { if (slot) { slot.textContent = ''; notifyHost(); } },
      },

      lightsOff: {
        root: () => (hook === 'lightsOff.background' ? slot : null),
        setText: text => {
          if (hook !== 'lightsOff.background' || !slot) return;
          slot.textContent = text === undefined || text === null ? '' : String(text);
        },
        // 插件自绘交互区（会挡住该区域的「双击退出」，请谨慎开启）
        setInteractive: on => { if (slot) slot.style.pointerEvents = on ? 'auto' : ''; },
        // [v1.0.5.5] 背景板背景支配权（需 ui.lightsOffBg）。
        // 宿主底色仍在 body 上，这一层盖在它上面；宿主推来的底色/昼夜切换照常送达，
        // 想让背景跟着昼夜走，就监听 onLightsOffBgUpdate 自己重设。
        setBackground: spec => applyBackground(spec),
        clearBackground: () => clearBackground(),
        bgLayer: () => document.getElementById('plugin-bg-layer'),
      },

      ui: {
        // 样式表：任意窗口都能用。等同于 manifest 里的 style.css（既有能力，不额外要权限）
        addStyle: (css) => {
          const el = document.createElement('style');
          el.dataset.pluginId = plugin.id;
          el.textContent = String(css || '');
          document.head.appendChild(el);
          record.styles.push(el);
        },
        // CSS 变量换肤：仍限设置窗口（保持既有语义）
        applyVars: (vars) => {
          if (hook !== 'settings.theme') return;
          Object.keys(vars || {}).forEach(k => {
            if (!/^--[a-zA-Z0-9-]{1,40}$/.test(k)) return;
            const prev = document.documentElement.style.getPropertyValue(k);
            record.vars.push({ key: k, prev });
            document.documentElement.style.setProperty(k, String(vars[k]));
          });
        },
        // ---- [v1.0.5.5] 宿主元素编辑（时钟 / 设置窗口需对应界面权限）----
        // 自绘层：铺满整个窗口、默认不吃鼠标事件；插件可自由往里画
        layer: () => {
          if (hook === 'lightsOff.background') return slot || null; // 关灯窗口沿用既有内容层
          needsWindowUi();
          if (!layerEl) {
            layerEl = createStage(plugin);
            record.nodes.push(layerEl);
          }
          return layerEl;
        },
        // [v1.0.5.5] 在设置窗口左侧导航新增一个属于插件的页面；返回该页的内容容器。
        // 卸载/重新加载插件时导航项与页面整块移除；若当时正停在该页，宿主会退回插件页。
        nav: spec => createNavPage(spec),
        get: sel => { needsWindowUi(); const el = pick(sel); return el ? makeHandle(el, sel) : null; },
        hide: sel => {
          needsWindowUi();
          if (isProtected(sel)) throw new Error('protected-element:' + sel);
          const el = pick(sel);
          if (!el) return false;
          recStyle(el, 'display', 'none');
          return true;
        },
        show: sel => { needsWindowUi(); const el = pick(sel); if (!el) return false; el.style.removeProperty('display'); return true; },
        setText: (sel, v) => { needsWindowUi(); const el = pick(sel); if (!el) return false; recText(el, v); return true; },
        patch: (sel, ops) => { needsWindowUi(); const el = pick(sel); if (!el || !ops) return false; patchEl(el, sel, ops); return true; },
        push: (sel, html) => { needsWindowUi(); const el = pick(sel); if (!el) return false; return pushHtml(el, html); },
        on: (sel, type, cb) => { needsWindowUi(); const el = pick(sel); if (!el) return false; attach(el, type, cb); return true; },
      },

      storage: {
        get: async (key) => { needs('storage'); const r = await api.pluginDataGet(plugin.id, key); return r && r.value; },
        set: async (key, value) => { needs('storage'); return api.pluginDataSet(plugin.id, key, value); },
        all: async () => { needs('storage'); const r = await api.pluginDataGet(plugin.id); return (r && r.value) || {}; },
      },

      // 只允许 https，超时 8 秒，需 net 权限
      fetchText: async (url, options) => {
        needs('net');
        const u = String(url || '');
        if (!/^https:\/\//i.test(u)) throw new Error('only-https');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), (options && options.timeout) || 8000);
        try {
          const res = await fetch(u, { signal: ctrl.signal, cache: 'no-store' });
          if (!res.ok) throw new Error('http-' + res.status);
          const text = await res.text();
          return text.slice(0, 200000);
        } finally { clearTimeout(timer); }
      },

      assets: {
        base: plugin.assetsBase || '',
        url: rel => (plugin.assetsBase || '') + '/' + String(rel || '').replace(/^\/+/, ''),
      },
    };

    record.mounts = mounts;
    return dc;
  }

  // 同一插件同一错误只上报一次（否则会形成「报错→广播→重载→再报错」的循环）
  const reportedErrors = {};
  function report(err) {
    const id = (current && current.id) || 'unknown';
    const msg = String((err && err.message) || err || 'error');
    const key = id + '|' + msg;
    if (reportedErrors[key]) return;
    reportedErrors[key] = true;
    try { api.reportPluginError(id, msg); } catch (e) {}
  }
  let current = null;

  function runPlugin(plugin) {
    const record = { id: plugin.id, nodes: [], styles: [], vars: [], cleanups: [], mounts: [], edits: [], listeners: [], navPanels: [], bgTouched: false, createdBgLayer: false };
    const slot = createSlot(plugin);
    if (slot) record.nodes.push(slot);
    // 插件自带的样式表：只注入到它声明了钩子的这个窗口
    if (plugin.style) {
      const st = document.createElement('style');
      st.dataset.pluginId = plugin.id;
      st.textContent = plugin.style;
      document.head.appendChild(st);
      record.styles.push(st);
    }
    const dc = makeApi(plugin, slot, record);
    current = record;
    try {
      // eslint-disable-next-line no-new-func
      new Function('dc', String(plugin.code || ''))(dc);
      (record.mounts || []).forEach(fn => {
        try {
          const cleanup = fn(slot, dc);
          if (typeof cleanup === 'function') record.cleanups.push(cleanup);
        } catch (e) { report(e); }
      });
    } catch (e) {
      report(e);
    }
    if (plugin.error) report(new Error(plugin.error));
    return record;
  }

  function teardown() {
    const closing = mounted.splice(0);
    closing.forEach(rec => {
      rec.cleanups.forEach(fn => { try { fn(); } catch (e) {} });
      // 反向还原插件对宿主元素做过的每一处改动（后写的先还原）
      (rec.edits || []).slice().reverse().forEach(e => {
        try {
          if (e.kind === 'style') {
            if (e.prev) e.el.style.setProperty(e.prop, e.prev, e.priority || '');
            else e.el.style.removeProperty(e.prop);
          } else if (e.kind === 'class') {
            e.el.classList.toggle(e.name, !e.on);
          } else if (e.kind === 'attr') {
            if (e.prev === null) e.el.removeAttribute(e.name);
            else e.el.setAttribute(e.name, e.prev);
          } else if (e.kind === 'text') {
            // 只在「还是插件写进去的那份文本」时还原，免得把宿主刚更新的内容写回旧值
            if (e.el.textContent === e.mine) e.el.textContent = e.prev;
          } else if (e.kind === 'nodes') {
            e.nodes.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
          }
        } catch (err) {}
      });
      (rec.listeners || []).forEach(l => { try { l.el.removeEventListener(l.type, l.handler); } catch (e) {} });
      rec.nodes.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
      rec.styles.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
      rec.vars.forEach(v => {
        try {
          if (v.prev) document.documentElement.style.setProperty(v.key, v.prev);
          else document.documentElement.style.removeProperty(v.key);
        } catch (e) {}
      });
    });
    // 背景层：只要本轮有插件动过就整体复位（变回透明 → 露出宿主底色）
    const bg = document.getElementById('plugin-bg-layer');
    if (bg && closing.some(rec => rec.bgTouched)) bg.removeAttribute('style');
    const layer = document.getElementById(LAYER_ID);
    if (layer && !layer.childElementCount) layer.remove();
    // 有插件带过导航页 → 让宿主的 navItems/panels 重新抓一遍 DOM
    // （正停在被移除的插件页时，宿主 refreshNavItems 会退回插件页）
    if (closing.some(rec => (rec.navPanels || []).length)) {
      try {
        if (window.DCPlugins && typeof window.DCPlugins.refreshNav === 'function') window.DCPlugins.refreshNav();
        else setTimeout(() => {
          try { window.DCPlugins && window.DCPlugins.refreshNav && window.DCPlugins.refreshNav(); } catch (e) {}
        }, 100);
      } catch (e) {}
    }
    notifyHost();
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      teardown();
      const bundle = await api.getPluginBundle();
      (bundle || [])
        .filter(p => (p.hooks || []).indexOf(hook) >= 0)
        .forEach(p => { mounted.push(runPlugin(p)); });
      notifyHost();
    } catch (e) {
      // 读取失败不打扰用户
    } finally {
      loading = false;
    }
  }

  api.onPluginsChanged && api.onPluginsChanged(() => { load(); });

  // ========== 设置页里的「插件自绘设置视图」：白名单清洗后再插入 ==========
  const ALLOWED_TAGS = ['A', 'B', 'BR', 'BUTTON', 'CODE', 'DETAILS', 'DIV', 'EM', 'H3', 'H4', 'HR', 'I', 'IMG', 'INPUT', 'LABEL', 'LI', 'OL', 'OPTION', 'P', 'PRE', 'SECTION', 'SELECT', 'SMALL', 'SPAN', 'STRONG', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'];
  const ALLOWED_ATTRS = ['class', 'id', 'title', 'type', 'value', 'checked', 'disabled', 'placeholder', 'min', 'max', 'step', 'rows', 'cols', 'name', 'href', 'src', 'alt', 'width', 'height', 'role', 'for', 'selected', 'data-key', 'data-role', 'data-plugin-field'];

  // 只丢掉危险的那条声明（url()/expression/@import），其余样式保留
  function safeStyleValue(value) {
    return String(value)
      .split(';')
      .map(d => d.trim())
      .filter(d => d && !/url\s*\(|expression\s*\(|javascript:|@import/i.test(d))
      .join(';');
  }

  function sanitizeHtml(html, assetsBase) {
    const doc = new DOMParser().parseFromString('<div id="__root">' + String(html || '') + '</div>', 'text/html');
    const root = doc.getElementById('__root');
    if (!root) return '';
    const walk = node => {
      Array.prototype.slice.call(node.childNodes).forEach(child => {
        if (child.nodeType === 3) return; // 文本
        if (child.nodeType !== 1) { child.remove(); return; }
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED' || tag === 'LINK' || tag === 'META' || tag === 'FORM') {
          child.remove();
          return;
        }
        if (ALLOWED_TAGS.indexOf(tag) < 0) {
          // 不在白名单：保留其子内容，去掉标签本身
          const frag = doc.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.replaceWith(frag);
          walk(node);
          return;
        }
        Array.prototype.slice.call(child.attributes).forEach(attr => {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          if (name.indexOf('on') === 0) { child.removeAttribute(attr.name); return; }
          // style 必须在白名单检查之前处理（它本身不在 ALLOWED_ATTRS 里）
          if (name === 'style') {
            const cleaned = safeStyleValue(value);
            if (cleaned) child.setAttribute('style', cleaned);
            else child.removeAttribute(attr.name);
            return;
          }
          if (ALLOWED_ATTRS.indexOf(name) < 0) { child.removeAttribute(attr.name); return; }
          if (name === 'href' && !/^https:\/\//i.test(value)) { child.removeAttribute(attr.name); return; }
          if (name === 'src') {
            const okAsset = assetsBase && value.indexOf(assetsBase) === 0;
            if (!(okAsset || /^https:\/\//i.test(value))) { child.removeAttribute(attr.name); return; }
          }
        });
        walk(child);
      });
    };
    walk(root);
    return root.innerHTML;
  }

  window.DCPluginHost = {
    hook,
    refresh: load,
    sanitizeHtml,
    // 供设置界面渲染插件自绘的「插件设置」区域
    renderSettingsView: (container, html, assetsBase) => {
      if (!container) return false;
      const safe = sanitizeHtml(html, assetsBase);
      if (!safe) return false;
      container.innerHTML = safe;
      return true;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
