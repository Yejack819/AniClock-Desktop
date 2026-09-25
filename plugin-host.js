/* plugin-host.js — [v1.0.5.5] 插件宿主运行时（时钟 / 关灯 / 设置 三个窗口共用）
 *
 * 安全模型（轻量 JS 沙箱）：
 * - 插件代码由主进程以文本下发，这里用 new Function('dc', code) 包裹执行；
 *   页面本身是 contextIsolation + 无 nodeIntegration，插件因此拿不到 require / Node / Electron。
 * - 插件只能通过下发的 dc 对象做事，能力范围由 manifest 的 hooks / permissions 决定：
 *     hooks       → 能挂到哪个窗口的哪个插槽
 *     permissions → storage（读写自己的数据）、net（发起 https 请求）
 * - 每个插件单独 try/catch，出错只上报不拖垮宿主；错误信息会显示在设置界面里。
 * - 卸载时按记录回收节点、样式与 CSS 变量，保证反复开关不留残留。
 */
(function () {
  const api = window.electronAPI;
  if (!api || !api.getPluginBundle) return;

  const hook = (document.body && document.body.dataset && document.body.dataset.pluginHook) || '';
  const LAYER_ID = 'plugin-layer';
  const mounted = [];

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
      document.body.appendChild(layer);
    }
    return layer;
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
    if (hook === 'lightsOff.background') {
      const slot = document.createElement('div');
      slot.className = 'plugin-stage';
      slot.dataset.pluginId = plugin.id;
      ensureLayer().appendChild(slot);
      return slot;
    }
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

    const dc = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      hook,
      settings: Object.freeze(Object.assign({}, plugin.values || {})),
      apiVersion: 1,
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
      },

      ui: {
        applyVars: (vars) => {
          if (hook !== 'settings.theme') return;
          Object.keys(vars || {}).forEach(k => {
            if (!/^--[a-zA-Z0-9-]{1,40}$/.test(k)) return;
            const prev = document.documentElement.style.getPropertyValue(k);
            record.vars.push({ key: k, prev });
            document.documentElement.style.setProperty(k, String(vars[k]));
          });
        },
        addStyle: (css) => {
          if (hook !== 'settings.theme') return;
          const el = document.createElement('style');
          el.dataset.pluginId = plugin.id;
          el.textContent = String(css || '');
          document.head.appendChild(el);
          record.styles.push(el);
        },
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
    const record = { id: plugin.id, nodes: [], styles: [], vars: [], cleanups: [], mounts: [] };
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
    mounted.splice(0).forEach(rec => {
      rec.cleanups.forEach(fn => { try { fn(); } catch (e) {} });
      rec.nodes.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
      rec.styles.forEach(n => { if (n && n.parentNode) n.parentNode.removeChild(n); });
      rec.vars.forEach(v => {
        try {
          if (v.prev) document.documentElement.style.setProperty(v.key, v.prev);
          else document.documentElement.style.removeProperty(v.key);
        } catch (e) {}
      });
    });
    const layer = document.getElementById(LAYER_ID);
    if (layer && !layer.childElementCount) layer.remove();
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
