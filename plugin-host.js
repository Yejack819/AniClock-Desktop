/* plugin-host.js — [v1.0.5.7] 插件宿主（时钟 / 关灯 / 设置 三个窗口共用）
 *
 * ====== 安全模型（真隔离，v1.0.5.7 起）======
 *
 * 插件代码**不再**在本页面执行。每个插件的每个自绘区（主自绘层、每个导航页）
 * 都被放进一个
 *     <iframe sandbox="allow-scripts">      ← 故意不含 allow-same-origin
 * 中运行（桥接层见 plugin-sandbox.js）。因为缺少 allow-same-origin，该 iframe 与本页跨源：
 *   - 插件无法访问 window.parent.document / window.electronAPI（跨源读属性抛 SecurityError）
 *   - 插件没有 require / process / Node
 *   - 插件无法构造对本页 DOM 的任何引用
 *
 * 插件唯一能做的事，是通过 postMessage 请求宿主代劳。宿主在本文件里：
 *   1. 用 event.source 反查「这是哪个 iframe / 哪个插件在说话」——**绝不相信消息里自称的 id**
 *   2. 按该插件 manifest 的 permissions 判权限
 *   3. 做受保护元素校验（关灯退出/锁定按钮、设置导航、插件面板不可被藏）
 *   4. 才落到真实 DOM / IPC
 *
 * 因此 manifest 的 hooks / permissions 从「文档约定」升级成**强制边界**。
 *
 * 界面编辑权的边界（不变）：可改样式/文本/属性/类名、可隐藏、可追加；
 * 不能删宿主元素、不能改宿主行为。受保护元素连隐藏都拒绝 —— 保证用户永远能自救。
 *
 * ⚠️ apiVersion 3 起插件走隔离通道；apiVersion < 3 的老插件仍按旧方式（同页面）
 *    执行，并在设置界面标注「未加固（旧版）」，提示作者升级。
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

  // ========== 主题探测 ==========
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

  // ========== 插槽 / 层 ==========
  function ensureLayer() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      if (hook !== 'lightsOff.background') layer.setAttribute('style', LAYER_INLINE_STYLE);
      document.body.appendChild(layer);
    }
    return layer;
  }
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

  // ========== 共享工具 ==========
  function toKebab(prop) { return String(prop).replace(/^--/, '--').replace(/([A-Z])/g, m => '-' + m.toLowerCase()); }
  function safeStyleSheet(css) {
    return String(css || '')
      .replace(/@import[^;]*;?/gi, '')
      .replace(/expression\s*\(/gi, '');
  }
  function resolveTarget(sel) {
    try { return document.querySelector(String(sel)); } catch (e) { return null; }
  }
  // 一个受保护元素只允许「非破坏性」操作；hide / display:none 一律拒绝
  function assertNotProtected(sel, op) {
    if (!isProtected(sel)) return;
    if (op === 'hide' || op === 'displayNone') throw new Error('protected-element:' + sel);
  }

  // ========== 沙箱桥（每个 iframe 一个 session；身份 = iframe.contentWindow） ==========
  const sandboxSessions = new Map(); // contentWindow -> session

  function registerDomListener(session, sel, type) {
    const key = sel + '|' + type;
    if (session.domListeners[key]) return key;
    const el = resolveTarget(sel);
    if (!el) return null;
    const handler = event => {
      // 插件自绘的交互区不该触发宿主行为（关灯的「双击背景退出」最典型）
      if (type === 'click' || type === 'mousedown' || type === 'dblclick') {
        try { event.stopPropagation(); } catch (e) {}
      }
      postTo(session.iframe, { __dc: 1, kind: 'emit', event: 'dom:' + sel + ':' + type, payload: null });
    };
    el.addEventListener(type, handler);
    session.domListeners[key] = { el, type, handler };
    session.listeners.push({ el, type, handler });
    return key;
  }

  function makeSession(plugin, iframe, record, opts) {
    const has = p => (plugin.permissions || []).indexOf(p) >= 0;
    function needs(p) {
      if (!has(p)) throw new Error('permission-denied:' + p + '（请在 plugin.json 的 permissions 里声明）');
    }
    function needsWindowUi() {
      const perm = windowUiPermission();
      if (!perm) throw new Error('ui-not-supported-in-this-window');
      needs(perm);
    }

    const edits = record.edits || (record.edits = []);
    const listeners = record.listeners || (record.listeners = []);
    const session = { iframe, domListeners: {}, listeners, edits, panel: (opts && opts.panel) || null };

    // ---- 登记：样式 / 类 / 属性 / 文本 ----
    function recStyle(el, prop, value) {
      edits.push({ kind: 'style', el, prop, prev: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
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
    function recNodes(parent, nodes) { if (nodes.length) edits.push({ kind: 'nodes', parent, nodes }); }

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
          if (prot && /^(display|visibility|opacity)$/.test(prop)) throw new Error('protected-element:' + sel);
          recStyle(el, prop, ops.style[k]);
        });
      }
      if (ops.class) {
        const c = ops.class;
        const addList = (typeof c === 'string' || Array.isArray(c)) ? (typeof c === 'string' ? c.split(/\s+/) : c) : (c.add || []);
        const rmList = (typeof c === 'string' || Array.isArray(c)) ? [] : (c.remove || []);
        addList.filter(Boolean).forEach(n => recClass(el, n, true));
        rmList.filter(Boolean).forEach(n => recClass(el, n, false));
      }
      if (ops.attr) Object.keys(ops.attr).forEach(k => recAttr(el, k, ops.attr[k]));
    }

    // ---- 背景板 ----
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

    // ---- 导航页 ----
    const NAV_PAGE_MAX_PER_PLUGIN = 3;
    const NAV_PAGE_MAX_TOTAL = 5;
    function refreshHostNav(attempt) {
      const n = attempt || 0;
      try {
        if (window.DCPlugins && typeof window.DCPlugins.refreshNav === 'function') { window.DCPlugins.refreshNav(); return; }
      } catch (e) {}
      if (n < 5) setTimeout(() => refreshHostNav(n + 1), 200);
    }
    function createNavPage(spec) {
      needsWindowUi();
      if (hook !== 'settings.theme') throw new Error('ui-not-supported-in-this-window');
      const s = spec || {};
      const id = String(s.id || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id)) throw new Error('bad-nav-id');
      const label = String(s.label || plugin.name || id).slice(0, 24);
      const icon = String(s.icon || '🧩').slice(0, 4);
      const panelId = 'plugin.' + plugin.id + '.' + id;
      const mine = record.navPanels || (record.navPanels = {});
      if (mine[panelId]) return mine[panelId];
      if (Object.keys(mine).length >= NAV_PAGE_MAX_PER_PLUGIN) throw new Error('too-many-nav-pages');
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
      textEl.className = 'nav-text';
      textEl.textContent = label;
      btn.appendChild(iconEl);
      btn.appendChild(textEl);
      const existing = nav.querySelectorAll('.plugin-nav-item');
      const anchor = existing.length ? existing[existing.length - 1] : nav.querySelector('.nav-item[data-panel="plugins"]');
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

      // [v1.0.5.7] 导航页也是隔离区：嵌一个 sandbox iframe，插件在自己 iframe 里自由建 UI。
      // opts.panel 让插件知道当前在哪个导航页（dc.panelId）。
      let handle = body;
      if (record.sandboxSource) {
        const frame = createSandboxFrame(plugin, record, record.sandboxSource, { panel: panelId });
        frame.style.cssText += 'width:100%;min-height:220px;';
        body.appendChild(frame);
        handle = body;
      }

      mine[panelId] = handle;
      refreshHostNav();
      return handle;
    }

    // ---- 方法分发（全部在此校验权限 / 保护元素） ----
    const methods = {
      log(args) {
        try { console.log.apply(console, ['[plugin:' + plugin.id + ']'].concat(args || [])); } catch (e) {}
        return null;
      },
      'clock.setInfoText'(args) {
        if (hook !== 'clock.infoBar' || !record.slot) return false;
        record.slot.textContent = args[0] === undefined || args[0] === null ? '' : String(args[0]);
        notifyHost();
        return true;
      },
      'lightsOff.setInteractive'(args) {
        if (hook !== 'lightsOff.background' || !record.slot) return false;
        record.slot.style.pointerEvents = args[0] ? 'auto' : '';
        return true;
      },
      'lightsOff.setBackground'(args) { return applyBackground(args[0]); },
      'lightsOff.clearBackground'() { return clearBackground(); },
      'ui.addStyle'(args) {
        const css = safeStyleSheet(String(args[0] || ''));
        if (!css) return false;
        const el = document.createElement('style');
        el.dataset.pluginId = plugin.id;
        el.textContent = css;
        document.head.appendChild(el);
        record.styles.push(el);
        return true;
      },
      'ui.applyVars'(args) {
        if (hook !== 'settings.theme') return false;
        const vars = args[0] || {};
        Object.keys(vars).forEach(k => {
          if (!/^--[a-zA-Z0-9-]{1,40}$/.test(k)) return;
          const prev = document.documentElement.style.getPropertyValue(k);
          record.vars.push({ key: k, prev });
          document.documentElement.style.setProperty(k, String(vars[k]));
        });
        return true;
      },
      'ui.nav'(args) { return !!createNavPage(args[0]); },
      // 插件导航页信息查询：让插件知道自己面板的标题/是否处于激活态（隔离后插件看不见设置页）
      'ui.navInfo'(args) {
        const panelId = session.panel;
        if (!panelId) return null;
        const btn = document.querySelector('.nav-item[data-panel="' + panelId + '"]');
        const textEl = btn ? btn.querySelector('.nav-text') : null;
        return {
          panelId,
          active: !!(btn && btn.classList.contains('active')),
          label: textEl ? textEl.textContent : null,
        };
      },
      // 插件设置导航项的标题（跟随语言切换）。带 panelId 的导航页 iframe 用自己那项；
      // 主题槽 iframe（无 panel）用它注册的**第一项**，否则 liquid-glass 这种在主题相里
      // 改文案的场景会静默失效。
      'ui.setNavLabel'(args) {
        const label = String(args[0] || '');
        const panelIds = Object.keys(record.navPanels || {});
        const ids = session.panel ? [session.panel] : panelIds.slice(0, 1);
        let ok = false;
        ids.forEach(pid => {
          const btn = document.querySelector('.nav-item[data-panel="' + pid + '"]');
          if (!btn) return;
          const textEl = btn.querySelector('.nav-text');
          if (textEl) { textEl.textContent = label; ok = true; }
        });
        return ok;
      },
      // 让插件能读宿主的界面语言（原来靠读宿主 [data-lang] 节点的文本）
      'ui.getHostLang'() {
        const probes = ['navPlugins', 'settingsTitle', 'hint'];
        for (let i = 0; i < probes.length; i++) {
          const el = document.querySelector('[data-lang="' + probes[i] + '"]');
          if (!el || !el.textContent) continue;
          return /[\u4e00-\u9fa5]/.test(el.textContent) ? 'zh' : 'en';
        }
        return /^zh/i.test(document.documentElement.lang || '') ? 'zh' : 'en';
      },
      // 订阅宿主语言变化
      'ui.onHostLangChanged'() { return true; },
      // 切到插件的导航页（原来自行 btn.click()）。兼容主题槽 iframe（无 panel → 用第一项）。
      'ui.activatePanel'() {
        const panelIds = Object.keys(record.navPanels || {});
        const panelId = session.panel || panelIds[0] || null;
        if (!panelId) return false;
        const btn = document.querySelector('.nav-item[data-panel="' + panelId + '"]');
        if (!btn) return false;
        try { btn.click(); } catch (e) { return false; }
        return true;
      },
      // 把一个由插件注入的元素对齐到某个宿主元素上（liquid-glass 的玻璃滑块用）。
      // 只回几何量，不回宿主节点；插件据此调自己的元素样式。
      'ui.alignTo'(args) {
        const target = String(args[0] || '');
        const scope = String(args[1] || '');
        const tEl = resolveTarget(target);
        if (!tEl) return null;
        const scopeEl = scope ? resolveTarget(scope) : null;
        const r = tEl.getBoundingClientRect();
        if (!r || r.width < 1 || r.height < 1) return { visible: false };
        const base = scopeEl ? scopeEl.getBoundingClientRect() : { left: 0, top: 0 };
        return {
          visible: tEl.offsetParent !== null,
          width: r.width, height: r.height,
          // 相对滚动容器左上角（含 scrollOffset），供 transform 定位
          offsetX: Math.round(r.left - base.left + (scopeEl ? scopeEl.scrollLeft : 0)),
          offsetY: Math.round(r.top - base.top + (scopeEl ? scopeEl.scrollTop : 0)),
        };
      },
      // 当前激活的导航项信息（滑块需要知道 active 是谁、何时变）
      'ui.navActive'() {
        const nav = document.getElementById('settings-nav');
        if (!nav) return null;
        const active = nav.querySelector('.nav-item.active');
        if (!active) return { any: false };
        const r = active.getBoundingClientRect();
        const nr = nav.getBoundingClientRect();
        return {
          any: true,
          visible: active.offsetParent !== null && r.width >= 1 && r.height >= 1,
          width: r.width, height: r.height,
          offsetX: Math.round(r.left - nr.left + nav.scrollLeft),
          offsetY: Math.round(r.top - nr.top + nav.scrollTop),
          scrollLeft: nav.scrollLeft, scrollTop: nav.scrollTop,
          panelId: active.dataset ? active.dataset.panel : null,
        };
      },
      // 订阅「宿主导航/布局发生变化」→ 插件重算滑块位置
      'ui.onHostLayoutChanged'() { return true; },
      'ui.setPluginSetting'(args) {
        // 插件改自己的设置：只能改自己的 id（宿主侧写死 plugin.id，插件无法指定）
        const key = String(args[0] || '');
        const value = args[1];
        return api.setPluginSetting(plugin.id, key, value);
      },
      'ui.getConfig'(args) {
        // 只回白名单字段，避免插件读取到无关配置
        return api.getConfig().then(cfg => pickPublicConfig(cfg));
      },
      'ui.listPlugins'() {
        // 插件可读的插件列表：只回公共元数据，不含其它插件的数据/设置值细节
        return api.getPluginList().then(list => (list || []).map(p => ({
          id: p.id, name: p.name, version: p.version,
          hooks: p.hooks || [], permissions: p.permissions || [],
          enabled: !!p.enabled,
          // 自己的设置定义才给完整 values
          values: p.id === plugin.id ? (p.values || {}) : undefined,
          settings: p.id === plugin.id ? (p.settings || []) : undefined,
        })));
      },
      dom(args) {
        const [op, p] = args;
        const sel = p && p.sel;
        if (op === 'listen') return registerDomListener(session, sel, p.type);
        needsWindowUi();
        const el = resolveTarget(sel);
        if (op === 'hide') {
          assertNotProtected(sel, 'hide');
          if (!el) return false;
          recStyle(el, 'display', 'none');
          return true;
        }
        if (op === 'show') {
          if (!el) return false;
          const last = edits.slice().reverse().find(e => e.kind === 'style' && e.el === el && e.prop === 'display');
          if (last && last.prev) el.style.setProperty('display', last.prev);
          else el.style.removeProperty('display');
          return true;
        }
        if (!el) return false;
        if (op === 'style') {
          if (isProtected(sel) && /^(display|visibility|opacity)$/.test(toKebab(p.k))) throw new Error('protected-element:' + sel);
          recStyle(el, toKebab(p.k), p.v);
          return true;
        }
        if (op === 'cls') {
          (p.add || []).filter(Boolean).forEach(n => recClass(el, n, true));
          (p.remove || []).filter(Boolean).forEach(n => recClass(el, n, false));
          return true;
        }
        if (op === 'text') { recText(el, p.v); return true; }
        if (op === 'attr') { recAttr(el, p.k, p.v); return true; }
        if (op === 'patch') { patchEl(el, sel, p.ops || {}); return true; }
        if (op === 'push') { return pushHtml(el, p.html); }
        return false;
      },
      'storage.get'(args) { needs('storage'); return api.pluginDataGet(plugin.id, args[0]).then(r => r && r.value); },
      'storage.set'(args) { needs('storage'); return api.pluginDataSet(plugin.id, args[0], args[1]); },
      'storage.all'() { needs('storage'); return api.pluginDataGet(plugin.id).then(r => (r && r.value) || {}); },
      'net.fetchText'(args) {
        needs('net');
        const u = String(args[0] || '');
        if (!/^https:\/\//i.test(u)) throw new Error('only-https');
        const options = args[1] || {};
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), options.timeout || 8000);
        return fetch(u, { signal: ctrl.signal, cache: 'no-store' })
          .then(res => { if (!res.ok) throw new Error('http-' + res.status); return res.text(); })
          .then(text => text.slice(0, 200000))
          .finally(() => clearTimeout(timer));
      },
    };

    return { session, methods };
  }

  // 只把「插件确实需要且不敏感」的配置字段给插件
  function pickPublicConfig(cfg) {
    const c = cfg || {};
    return {
      language: c.language,
      timeFormat: c.timeFormat,
      lightsOff: !!c.lightsOff,
      theme: c.theme,
    };
  }

  // ========== sandbox iframe 工厂 ==========
  const BRIDGE_OPEN = '<scr' + 'ipt>';
  const BRIDGE_CLOSE = '</scr' + 'ipt>';

  function postTo(iframe, msg) {
    try { iframe.contentWindow && iframe.contentWindow.postMessage(msg, '*'); } catch (e) {}
  }

  function createSandboxFrame(plugin, record, source, opts) {
    const iframe = document.createElement('iframe');
    // ⚠️ 关键安全属性：只给 allow-scripts，**绝不给 allow-same-origin**
    // 少了 allow-same-origin → iframe 与宿主跨源 → 插件拿不到 parent 的任何东西
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.cssText = 'border:0;width:100%;height:100%;background:transparent;display:block;';
    iframe.dataset.pluginId = plugin.id;
    if (opts && opts.panel) iframe.dataset.pluginPanel = opts.panel;

    // [v1.0.5.7] 插件样式必须注进**沙箱文档**：隔离后插件的可视元素都在 iframe 里，
    // 只往宿主 head 注 style 到不了 iframe（跨源文档不吃宿主 CSS）。
    // 宿主 head 那一份保留，给 apiVersion<3 的老插件与「宿主侧注入的节点」用。
    const pluginCss = safeStyleSheet(String(plugin.style || ''));
    iframe.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;' +
      'font-family:-apple-system,"Segoe UI",sans-serif;color:inherit;}' +
      'body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;}' +
      '</style>' +
      (pluginCss ? '<style data-plugin-css="' + plugin.id + '">' + pluginCss + '</style>' : '') +
      '</head><body>' + BRIDGE_OPEN + source + BRIDGE_CLOSE + '</body></html>';

    const { session, methods } = makeSession(plugin, iframe, record, opts);

    const onMessage = ev => {
      if (ev.source !== iframe.contentWindow) return; // 身份校验：只认这个 iframe
      const d = ev.data;
      if (!d || d.__dc !== 1) return;
      if (d.kind === 'hello') {
        postTo(iframe, {
          __dc: 1, kind: 'boot',
          id: plugin.id, name: plugin.name, version: plugin.version,
          hook, apiVersion: Number(plugin.apiVersion) || 3,
          panelId: (opts && opts.panel) || null,
          settings: plugin.values || {},
          theme: currentTheme(),
          code: String(plugin.code || ''),
        });
        return;
      }
      if (d.kind === 'call') {
        const reply = (value, error) => postTo(iframe, { __dc: 1, kind: 'reply', id: d.id, value, error: error ? String(error) : null });
        const fn = methods[d.method];
        if (!fn) { reply(null, 'unknown-method:' + d.method); return; }
        try {
          const out = fn(d.args || []);
          if (out && typeof out.then === 'function') out.then(v => reply(v, null)).catch(e => reply(null, (e && e.message) || e));
          else reply(out, null);
        } catch (e) { reply(null, (e && e.message) || e); }
        return;
      }
      if (d.kind === 'ready') { record.ready = true; return; }
      if (d.kind === 'error') { report(new Error(String(d.message || 'error')), record.id); return; }
    };

    window.addEventListener('message', onMessage);
    record.frames.push({ iframe, onMessage });
    sandboxSessions.set(iframe.contentWindow, session);
    return iframe;
  }

  // ========== 旧版（apiVersion < 3）：同页面执行 ==========
  function makeLegacyApi(plugin, slot, record) {
    const has = p => (plugin.permissions || []).indexOf(p) >= 0;
    const needs = p => { if (!has(p)) throw new Error('permission-denied:' + p); };
    const events = {};
    const edits = record.edits || (record.edits = []);
    const listeners = record.listeners || (record.listeners = []);
    let layerEl = null;
    const mounts = [];

    function recStyle(el, prop, value) {
      edits.push({ kind: 'style', el, prop, prev: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
      el.style.setProperty(prop, String(value));
    }
    function recClass(el, name, on) { edits.push({ kind: 'class', el, name, on: !!on }); el.classList.toggle(name, !!on); }
    function recAttr(el, name, value) {
      edits.push({ kind: 'attr', el, name, prev: el.getAttribute(name) });
      if (value === null || value === undefined) el.removeAttribute(name); else el.setAttribute(name, String(value));
    }
    function recText(el, value) {
      const entry = { kind: 'text', el, prev: el.textContent, mine: null };
      el.textContent = value === undefined || value === null ? '' : String(value);
      entry.mine = el.textContent; edits.push(entry);
    }
    function recNodes(parent, nodes) { if (nodes.length) edits.push({ kind: 'nodes', parent, nodes }); }
    function pick(sel) { try { return document.querySelector(String(sel)); } catch (e) { return null; } }
    function needsWindowUi() { const perm = windowUiPermission(); if (!perm) throw new Error('ui-not-supported-in-this-window'); needs(perm); }
    function attach(el, type, cb) {
      const handler = event => {
        if (type === 'click' || type === 'mousedown' || type === 'dblclick') { try { event.stopPropagation(); } catch (e) {} }
        try { cb(event, el); } catch (e) { report(e, record.id); }
      };
      el.addEventListener(type, handler);
      listeners.push({ el, type, handler });
      if (!el.style.getPropertyValue('-webkit-app-region')) recStyle(el, '-webkit-app-region', 'no-drag');
    }
    function pushHtml(el, html) {
      const holder = document.createElement('div');
      holder.innerHTML = sanitizeHtml(html, plugin.assetsBase);
      const nodes = Array.prototype.slice.call(holder.childNodes);
      nodes.forEach(n => el.appendChild(n));
      recNodes(el, nodes);
      return nodes.length > 0;
    }
    function makeHandle(el, sel) {
      const handle = {
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
          if (last && last.prev) el.style.setProperty('display', last.prev); else el.style.removeProperty('display');
          return handle;
        },
        push: html => { pushHtml(el, html); return handle; },
        on: (type, cb) => { attach(el, type, cb); return handle; },
      };
      return handle;
    }
    function patchEl(el, sel, ops) {
      const prot = isProtected(sel);
      if (ops.style) Object.keys(ops.style).forEach(k => {
        const prop = toKebab(k);
        if (prot && /^(display|visibility|opacity)$/.test(prop)) throw new Error('protected-element:' + sel);
        recStyle(el, prop, ops.style[k]);
      });
      if (ops.class) {
        const c = ops.class;
        if (typeof c === 'string' || Array.isArray(c)) makeHandle(el, sel).cls(c, null);
        else makeHandle(el, sel).cls(c.add, c.remove);
      }
      if (ops.attr) Object.keys(ops.attr).forEach(k => recAttr(el, k, ops.attr[k]));
    }
    const NAV_PAGE_MAX_PER_PLUGIN = 3, NAV_PAGE_MAX_TOTAL = 5;
    function refreshHostNav(attempt) {
      const n = attempt || 0;
      try { if (window.DCPlugins && typeof window.DCPlugins.refreshNav === 'function') { window.DCPlugins.refreshNav(); return; } } catch (e) {}
      if (n < 5) setTimeout(() => refreshHostNav(n + 1), 200);
    }
    function createNavPage(spec) {
      needsWindowUi();
      if (hook !== 'settings.theme') throw new Error('ui-not-supported-in-this-window');
      const s = spec || {};
      const id = String(s.id || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(id)) throw new Error('bad-nav-id');
      const label = String(s.label || plugin.name || id).slice(0, 24);
      const icon = String(s.icon || '🧩').slice(0, 4);
      const panelId = 'plugin.' + plugin.id + '.' + id;
      const mine = record.navPanels || (record.navPanels = {});
      if (mine[panelId]) return mine[panelId];
      if (Object.keys(mine).length >= NAV_PAGE_MAX_PER_PLUGIN) throw new Error('too-many-nav-pages');
      if (document.querySelectorAll('.plugin-nav-item').length >= NAV_PAGE_MAX_TOTAL) throw new Error('too-many-nav-pages');
      const nav = document.getElementById('settings-nav');
      const content = document.getElementById('settings-content');
      if (!nav || !content) throw new Error('nav-host-missing');
      const btn = document.createElement('button');
      btn.className = 'nav-item plugin-nav-item';
      btn.dataset.panel = panelId;
      btn.dataset.pluginId = plugin.id;
      const iconEl = document.createElement('span'); iconEl.className = 'nav-icon'; iconEl.textContent = icon;
      const textEl = document.createElement('span'); textEl.className = 'nav-text'; textEl.textContent = label;
      btn.appendChild(iconEl); btn.appendChild(textEl);
      const existing = nav.querySelectorAll('.plugin-nav-item');
      const anchor = existing.length ? existing[existing.length - 1] : nav.querySelector('.nav-item[data-panel="plugins"]');
      if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', btn); else nav.appendChild(btn);
      const section = document.createElement('section');
      section.className = 'panel plugin-nav-panel';
      section.dataset.panel = panelId;
      section.dataset.pluginId = plugin.id;
      const title = document.createElement('h2'); title.className = 'panel-title'; title.textContent = label;
      const body = document.createElement('div'); body.className = 'plugin-nav-body';
      section.appendChild(title); section.appendChild(body);
      content.appendChild(section);
      record.nodes.push(btn, section);
      mine[panelId] = body;
      refreshHostNav();
      return body;
    }
    function bgLayer() {
      let layer = document.getElementById('plugin-bg-layer');
      if (!layer) { layer = document.createElement('div'); layer.id = 'plugin-bg-layer'; document.body.insertBefore(layer, document.body.firstChild); record.createdBgLayer = true; }
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
        const url = String(s.image);
        const okAsset = plugin.assetsBase && url.indexOf(plugin.assetsBase) === 0;
        if (!(okAsset || /^https:\/\//i.test(url))) throw new Error('bad-image-url');
        bg.push('url("' + url.replace(/"/g, '\\"') + '")');
      } else if (s.color) bg.push(String(s.color));
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
      layer.removeAttribute('style'); record.bgTouched = false; return true;
    }

    return {
      id: plugin.id, name: plugin.name, version: plugin.version, hook,
      settings: Object.freeze(Object.assign({}, plugin.values || {})),
      // 插件看到的是「自己声明的版本」，不是宿主版本（否则老插件会误判能力可用性）
      apiVersion: Number(plugin.apiVersion) || 1,
      theme: currentTheme,
      log: function () { try { console.log.apply(console, ['[plugin:' + plugin.id + ']'].concat(Array.prototype.slice.call(arguments))); } catch (e) {} },
      mount: fn => { if (typeof fn === 'function') mounts.push(fn); },
      on: (name, cb) => { (events[name] = events[name] || []).push(cb); },
      emit: (name, payload) => { (events[name] || []).forEach(cb => { try { cb(payload); } catch (e) { report(e, record.id); } }); },
      clock: {
        setInfoText: text => { if (hook !== 'clock.infoBar' || !slot) return; slot.textContent = text === undefined || text === null ? '' : String(text); notifyHost(); },
        clearInfoText: () => { if (slot) { slot.textContent = ''; notifyHost(); } },
      },
      lightsOff: {
        root: () => (hook === 'lightsOff.background' ? slot : null),
        setText: text => { if (hook !== 'lightsOff.background' || !slot) return; slot.textContent = text === undefined || text === null ? '' : String(text); },
        setInteractive: on => { if (slot) slot.style.pointerEvents = on ? 'auto' : ''; },
        setBackground: spec => applyBackground(spec),
        clearBackground: () => clearBackground(),
        bgLayer: () => document.getElementById('plugin-bg-layer'),
      },
      ui: {
        addStyle: (css) => {
          const el = document.createElement('style');
          el.dataset.pluginId = plugin.id;
          el.textContent = safeStyleSheet(String(css || ''));
          document.head.appendChild(el);
          record.styles.push(el);
        },
        applyVars: (vars) => {
          if (hook !== 'settings.theme') return;
          Object.keys(vars || {}).forEach(k => {
            if (!/^--[a-zA-Z0-9-]{1,40}$/.test(k)) return;
            const prev = document.documentElement.style.getPropertyValue(k);
            record.vars.push({ key: k, prev });
            document.documentElement.style.setProperty(k, String(vars[k]));
          });
        },
        layer: () => {
          if (hook === 'lightsOff.background') return slot || null;
          needsWindowUi();
          if (!layerEl) { layerEl = createStage(plugin); record.nodes.push(layerEl); }
          return layerEl;
        },
        nav: spec => createNavPage(spec),
        get: sel => { needsWindowUi(); const el = pick(sel); return el ? makeHandle(el, sel) : null; },
        hide: sel => { needsWindowUi(); if (isProtected(sel)) throw new Error('protected-element:' + sel); const el = pick(sel); if (!el) return false; recStyle(el, 'display', 'none'); return true; },
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
      _mounts: mounts,
    };
  }

  // ========== 错误上报 ==========
  const reportedErrors = {};
  function report(err, pluginId) {
    const id = pluginId || 'unknown';
    const msg = String((err && err.message) || err || 'error');
    const key = id + '|' + msg;
    if (reportedErrors[key]) return;
    reportedErrors[key] = true;
    try { api.reportPluginError(id, msg); } catch (e) {}
  }

  // ========== 装载单个插件 ==========
  function runPlugin(plugin, sandboxSource) {
    const record = {
      id: plugin.id, nodes: [], styles: [], vars: [], cleanups: [], mounts: [], edits: [],
      listeners: [], navPanels: {}, frames: [], bgTouched: false, createdBgLayer: false,
      isolated: false, sandboxSource: sandboxSource || '',
    };
    const slot = createSlot(plugin);
    if (slot) record.nodes.push(slot);
    record.slot = slot;

    if (plugin.style) {
      const st = document.createElement('style');
      st.dataset.pluginId = plugin.id;
      st.textContent = safeStyleSheet(plugin.style);
      document.head.appendChild(st);
      record.styles.push(st);
    }

    // [v1.0.5.7] 是否隔离，由**插件自己声明的 apiVersion** 决定，而不是宿主版本。
    // 宿主版本恒为最新，若用它判定，会把声明 apiVersion:1/2 的老插件也塞进 sandbox ——
    // 那些按「同页面 DOM / window.electronAPI」写的老代码在跨源 iframe 里会整体失效。
    const pluginApi = Number(plugin.apiVersion) || 1;
    const useIsolation = pluginApi >= 3 && !!sandboxSource;
    if (useIsolation) {
      if (slot) {
        const iframe = createSandboxFrame(plugin, record, sandboxSource, {});
        // 关灯背景板/时钟信息栏：iframe 填满插槽
        slot.appendChild(iframe);
      }
      record.isolated = true;
    } else {
      record.isolated = false;
      const dc = makeLegacyApi(plugin, slot, record);
      const mounts = dc._mounts;
      try {
        // eslint-disable-next-line no-new-func
        new Function('dc', String(plugin.code || ''))(dc);
        mounts.forEach(fn => {
          try {
            const cleanup = fn(slot, dc);
            if (typeof cleanup === 'function') record.cleanups.push(cleanup);
          } catch (e) { report(e, record.id); }
        });
      } catch (e) { report(e, record.id); }
    }
    if (plugin.error) report(new Error(plugin.error), record.id);
    return record;
  }

  // ========== 卸载 ==========
  function teardown() {
    const closing = mounted.splice(0);
    closing.forEach(rec => {
      rec.cleanups.forEach(fn => { try { fn(); } catch (e) {} });
      (rec.edits || []).slice().reverse().forEach(e => {
        try {
          if (e.kind === 'style') {
            if (e.prev) e.el.style.setProperty(e.prop, e.prev, e.priority || ''); else e.el.style.removeProperty(e.prop);
          } else if (e.kind === 'class') { e.el.classList.toggle(e.name, !e.on); }
          else if (e.kind === 'attr') { if (e.prev === null) e.el.removeAttribute(e.name); else e.el.setAttribute(e.name, e.prev); }
          else if (e.kind === 'text') { if (e.el.textContent === e.mine) e.el.textContent = e.prev; }
          else if (e.kind === 'nodes') { e.nodes.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); }); }
        } catch (err) {}
      });
      (rec.listeners || []).forEach(l => { try { l.el.removeEventListener(l.type, l.handler); } catch (e) {} });
      (rec.frames || []).forEach(f => {
        try { window.removeEventListener('message', f.onMessage); } catch (e) {}
        try { sandboxSessions.delete(f.iframe.contentWindow); } catch (e) {}
      });
      rec.nodes.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
      rec.styles.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
      rec.vars.forEach(v => {
        try { if (v.prev) document.documentElement.style.setProperty(v.key, v.prev); else document.documentElement.style.removeProperty(v.key); } catch (e) {}
      });
    });
    const bg = document.getElementById('plugin-bg-layer');
    if (bg && closing.some(rec => rec.bgTouched)) bg.removeAttribute('style');
    const layer = document.getElementById(LAYER_ID);
    if (layer && !layer.childElementCount) layer.remove();
    if (closing.some(rec => Object.keys(rec.navPanels || {}).length)) {
      try {
        if (window.DCPlugins && typeof window.DCPlugins.refreshNav === 'function') window.DCPlugins.refreshNav();
        else setTimeout(() => { try { window.DCPlugins && window.DCPlugins.refreshNav && window.DCPlugins.refreshNav(); } catch (e) {} }, 100);
      } catch (e) {}
    }
    notifyHost();
  }

  // ========== 加载（带 pending 重跑，避免丢事件） ==========
  let loading = false;
  let pendingReload = false;
  let sandboxSourceCache = null;

  async function load() {
    if (loading) { pendingReload = true; return; }
    loading = true;
    try {
      teardown();
      Object.keys(reportedErrors).forEach(k => delete reportedErrors[k]);
      const [bundle, source] = await Promise.all([
        api.getPluginBundle(),
        sandboxSourceCache
          ? Promise.resolve(sandboxSourceCache)
          : (api.getPluginSandboxSource ? api.getPluginSandboxSource() : Promise.resolve('')),
      ]);
      sandboxSourceCache = source || '';
      (bundle || [])
        .filter(p => (p.hooks || []).indexOf(hook) >= 0)
        .forEach(p => { mounted.push(runPlugin(p, sandboxSourceCache)); });
      notifyHost();
    } catch (e) {
      // 读取失败不打扰用户
    } finally {
      loading = false;
      if (pendingReload) { pendingReload = false; load(); }
    }
  }

  api.onPluginsChanged && api.onPluginsChanged(() => { load(); });

  // ========== 宿主事件 → 广播到所有沙箱 iframe ==========
  // 插件不再能直连 window.electronAPI 的 on* 订阅，改由宿主统一转发（只转白名单事件）。
  function broadcastToFrames(eventName, payload) {
    mounted.forEach(rec => {
      (rec.frames || []).forEach(f => postTo(f.iframe, { __dc: 1, kind: 'emit', event: eventName, payload }));
    });
  }
  try {
    api.onConfigUpdated && api.onConfigUpdated(cfg => {
      broadcastToFrames('host:config', pickPublicConfig(cfg));
    });
    api.onLightsOffStateChanged && api.onLightsOffStateChanged(on => {
      broadcastToFrames('host:lightsOff', !!on);
    });
  } catch (e) { /* 事件桥接失败不影响宿主 */ }

  // 宿主界面语言变化 → 通知所有沙箱（插件原来靠 MutationObserver 盯宿主节点，隔离后改成推送）
  try {
    const langObserver = new MutationObserver(() => {
      const probes = ['navPlugins', 'settingsTitle', 'hint'];
      let lang = /^zh/i.test(document.documentElement.lang || '') ? 'zh' : 'en';
      for (let i = 0; i < probes.length; i++) {
        const el = document.querySelector('[data-lang="' + probes[i] + '"]');
        if (el && el.textContent) { lang = /[\u4e00-\u9fa5]/.test(el.textContent) ? 'zh' : 'en'; break; }
      }
      broadcastToFrames('host:lang', lang);
    });
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'], subtree: true, childList: true, characterData: true });
  } catch (e) { /* ignore */ }

  // 宿主导航/布局变化 → 通知沙箱重算（liquid-glass 的玻璃滑块原来靠 MutationObserver 盯 #settings-nav）
  let layoutBroadcastRaf = 0;
  function broadcastLayoutSoon() {
    if (layoutBroadcastRaf) return;
    layoutBroadcastRaf = requestAnimationFrame(() => {
      layoutBroadcastRaf = 0;
      broadcastToFrames('host:layout', null);
    });
  }
  try {
    const nav = document.getElementById('settings-nav');
    if (nav && typeof MutationObserver === 'function') {
      const navObs = new MutationObserver(broadcastLayoutSoon);
      navObs.observe(nav, { childList: true, subtree: true, attributeFilter: ['class'] });
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(broadcastLayoutSoon);
        ro.observe(nav);
      }
    }
    window.addEventListener('resize', broadcastLayoutSoon);
  } catch (e) { /* ignore */ }

  // ========== 设置页里的「插件自绘设置视图」 ==========
  const ALLOWED_TAGS = ['A', 'B', 'BR', 'BUTTON', 'CODE', 'DETAILS', 'DIV', 'EM', 'H3', 'H4', 'HR', 'I', 'IMG', 'INPUT', 'LABEL', 'LI', 'OL', 'OPTION', 'P', 'PRE', 'SECTION', 'SELECT', 'SMALL', 'SPAN', 'STRONG', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'];
  // ⚠️ 白名单**不含 id**：插件 HTML 不能伪造宿主元素 id（防钓鱼/干扰 querySelector）
  const ALLOWED_ATTRS = ['class', 'title', 'type', 'value', 'checked', 'disabled', 'placeholder', 'min', 'max', 'step', 'rows', 'cols', 'name', 'href', 'src', 'alt', 'width', 'height', 'role', 'for', 'selected', 'data-key', 'data-role', 'data-plugin-field'];

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
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1) { child.remove(); return; }
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED' || tag === 'LINK' || tag === 'META' || tag === 'FORM') { child.remove(); return; }
        if (ALLOWED_TAGS.indexOf(tag) < 0) {
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
          if (name === 'style') {
            const cleaned = safeStyleValue(value);
            if (cleaned) child.setAttribute('style', cleaned); else child.removeAttribute(attr.name);
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
