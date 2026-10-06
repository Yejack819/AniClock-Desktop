/* plugin-sandbox.js — [v1.0.5.7] 插件隔离沙箱运行时
 *
 * 这个文件是**插件代码的运行环境**，它自己被注入到一个
 *   <iframe sandbox="allow-scripts">   ← 注意：没有 allow-same-origin
 * 里执行。因为少了 allow-same-origin，这个 iframe 与宿主页面是**跨源**的：
 *   - 插件拿不到 window.parent.document
 *   - 插件拿不到 window.parent.electronAPI（跨源访问属性会抛 SecurityError）
 *   - 插件没有 require / process / Node
 * 插件唯一的对外通道，是本文件通过 postMessage 建立的 RPC。
 *
 * ⚠️ 本文件内的代码属于「不可信侧」，不能依赖它做安全校验 ——
 *    所有权限判定、DOM 校验、ID 归属都在宿主侧（plugin-host.js）做。
 *    这里只负责把插件调用翻译成消息，把结果翻译回插件。
 */
(function () {
  'use strict';

  var boot = null;          // 宿主下发的启动参数
  var dc = null;            // 交给插件的 dc 对象
  var seq = 0;
  var pending = {};         // id -> { resolve, reject }
  var events = {};          // 插件自己的事件总线（dc.on / dc.emit）
  var cleanups = [];        // [v1.0.5.7] mount 回调返回的清理函数（dispose 时执行）

  // ---- 与宿主通信 ----
  var TIMEOUT_MS = 15000; // [v1.0.5.7] RPC 超时：宿主方法丢失/卡死时别让插件永远挂着
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var timer = setTimeout(function () {
        delete pending[id];
        // 超时按「无结果」收场（resolve undefined + 上报日志），不 reject：
        // 插件里大量 fire-and-forget 调用没有 catch，reject 会变成未处理拒绝刷屏
        try { fire('log', 'rpc-timeout:' + method); } catch (e) {}
        resolve(undefined);
      }, TIMEOUT_MS);
      pending[id] = {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); },
      };
      parent.postMessage({ __dc: 1, kind: 'call', id: id, method: method, args: args || [] }, '*');
    });
  }
  function fire(method, args) {
    // 不需要回执的消息（日志等）
    parent.postMessage({ __dc: 1, kind: 'call', id: 0, method: method, args: args || [] }, '*');
  }

  window.addEventListener('message', function (ev) {
    // 只接受来自宿主的消息。跨源下 ev.origin 是 'null'，无法用 origin 判定，
    // 因此改用 ev.source === parent（iframe 只能被父窗口 postMessage 到）。
    if (ev.source !== parent) return;
    var d = ev.data;
    if (!d || d.__dc !== 1) return;

    if (d.kind === 'boot') { boot = d; start(); return; }
    if (d.kind === 'reply') {
      var p = pending[d.id];
      if (!p) return;
      delete pending[d.id];
      if (d.error) p.reject(new Error(String(d.error)));
      else p.resolve(d.value);
      return;
    }
    if (d.kind === 'emit') {
      // 宿主主动推来的事件（配置变化、关灯状态、背景色等）
      var bag = events[d.event] || [];
      bag.forEach(function (cb) { try { cb(d.payload); } catch (e) { reportErr(e); } });
      return;
    }
    if (d.kind === 'dispose') {
      // [v1.0.5.7] 宿主要卸载本插件：先执行 mount 回调返回的清理函数（落盘 / 释放
      // 麦克风等），全部完成（或失败）后回执 'disposed'，宿主再移除 iframe。
      var fns = cleanups;
      cleanups = [];
      var ack = function () {
        try { parent.postMessage({ __dc: 1, kind: 'disposed' }, '*'); } catch (e) {}
      };
      if (!fns.length) { ack(); return; }
      var left = fns.length;
      var one = function () { left--; if (left <= 0) ack(); };
      fns.forEach(function (fn) {
        try {
          var r = fn();
          if (r && typeof r.then === 'function') r.then(one, one);
          else one();
        } catch (e) { one(); }
      });
      return;
    }
  });

  function reportErr(e) {
    try {
      parent.postMessage({
        __dc: 1, kind: 'error',
        message: String((e && e.message) || e || 'error'),
      }, '*');
    } catch (_) {}
  }

  // ---- 构建交给插件的 dc 对象 ----
  function buildDc() {
    var frozen = Object.freeze(Object.assign({}, boot.settings || {}));

    function domCall(op, payload) {
      return call('dom', [op, payload]);
    }

    // ---- 沙箱侧本地 DOM 写入（只作用于插件自己的 iframe 文档，不需要宿主介入）----
    // 宿主侧的 domCall 负责改宿主界面；这里再补一份，让插件自绘区（iframe 内）也能生效。
    function applyLocalPatch(sel, ops) {
      var s = String(sel || '').trim().toLowerCase();
      var el = (s === 'html' || s === 'body' || s === '') ? document.documentElement : document.querySelector(sel);
      if (s === 'body') el = document.body;
      if (!el) return;
      if (ops.attr && typeof ops.attr === 'object') {
        Object.keys(ops.attr).forEach(function (k) {
          var v = ops.attr[k];
          if (v === null || v === undefined) el.removeAttribute(k);
          else el.setAttribute(k, String(v));
        });
      }
      if (ops.style && typeof ops.style === 'object') {
        Object.keys(ops.style).forEach(function (k) { el.style.setProperty(k, String(ops.style[k])); });
      }
      if (typeof ops.text === 'string') el.textContent = ops.text;
    }
    function insertLocalHtml(html) {
      if (!html) return;
      var holder = document.createElement('div');
      holder.innerHTML = html; // 沙箱内文档，无宿主权限可言
      var frag = document.createDocumentFragment();
      while (holder.firstChild) frag.appendChild(holder.firstChild);
      (document.body || document.documentElement).appendChild(frag);
    }

    function makeHandle(sel) {
      // 句柄：所有操作都转成 host 侧 DOM 指令（宿主会做受保护元素校验）
      var h = {
        node: null, // 隔离后插件拿不到真实 DOM 节点，恒为 null
        style: function (k, v) { domCall('style', { sel: sel, k: k, v: v }); return h; },
        cls: function (add, remove) {
          var addList = typeof add === 'string' ? add.split(/\s+/) : (add || []);
          var rmList = typeof remove === 'string' ? remove.split(/\s+/) : (remove || []);
          domCall('cls', { sel: sel, add: addList.filter(Boolean), remove: rmList.filter(Boolean) });
          return h;
        },
        text: function (v) { domCall('text', { sel: sel, v: v }); return h; },
        attr: function (k, v) { domCall('attr', { sel: sel, k: k, v: v }); return h; },
        hide: function () { return domCall('hide', { sel: sel }); },
        show: function () { return domCall('show', { sel: sel }); },
        push: function (html) { return domCall('push', { sel: sel, html: html }); },
        on: function (type, cb) {
          // 交互事件由宿主捕获后转发（宿主做 stopPropagation，避免触发宿主行为）
          var key = 'dom:' + sel + ':' + type;
          if (!events[key]) {
            events[key] = [];
            // 每个 (sel,type) 只在宿主注册一次转发。
            // [v1.0.5.7] 走 dom 指令通道：宿主方法表里没有叫 'listen' 的方法，
            // 直接 call('listen') 只会换来 unknown-method 被吞掉，事件永远注册不上。
            domCall('listen', { sel: sel, type: type }).then(function (token) {
              events['__tok:' + key] = token;
            }).catch(function () {});
          }
          events[key].push(cb);
          return h;
        },
      };
      return h;
    }

    dc = {
      id: boot.id,
      name: boot.name,
      version: boot.version,
      hook: boot.hook,
      apiVersion: boot.apiVersion,
      settings: frozen,
      theme: function () { return boot.theme || { isDark: true, fg: '#fff', bg: '#000', ref: 0 }; },
      log: function () { fire('log', Array.prototype.slice.call(arguments)); },

      mount: function (fn) { if (typeof fn === 'function') mounts.push(fn); },
      on: function (name, cb) { (events[name] = events[name] || []).push(cb); },
      emit: function (name, payload) {
        (events[name] || []).forEach(function (cb) { try { cb(payload); } catch (e) { reportErr(e); } });
      },

      // ---- 自绘区（插件真正拥有的地方：iframe 内的 body）----
      panelId: boot.panelId || null,
      // 判定「我是不是跑在某个导航页 iframe 里」。用函数而不是布尔属性：
      // 插件里两种写法都能用（dc.isPanel() / dc.panelId），函数形式更不容易误用。
      isPanel: function () { return !!boot.panelId; },
      root: function () { return document.body; },
      // 兼容旧名：把 slot 语义映射到沙箱内的 body（宿主已在外面留了位置）
      slot: function () { return document.body; },

      clock: {
        setInfoText: function (t) { return call('clock.setInfoText', [t]); },
        clearInfoText: function () { return call('clock.setInfoText', ['']); },
        // [v1.0.5.7] 主动摘掉自己的信息栏插槽（infoStyle=none 一类）；
        // 原来插件自己 document.body.remove() 删的是沙箱 body，宿主侧插槽仍然占位
        removeInfoSlot: function () { return call('clock.removeInfoSlot', []); },
      },

      lightsOff: {
        root: function () { return boot.hook === 'lightsOff.background' ? document.body : null; },
        setText: function (t) {
          if (boot.hook !== 'lightsOff.background') return;
          document.body.textContent = t === undefined || t === null ? '' : String(t);
        },
        setInteractive: function (on) { return call('lightsOff.setInteractive', [!!on]); },
        setBackground: function (spec) { return call('lightsOff.setBackground', [spec]); },
        clearBackground: function () { return call('lightsOff.clearBackground', []); },
        bgLayer: function () { return null; }, // 隔离后不可见
      },

      ui: {
        addStyle: function (css) {
          // 宿主侧注入（改宿主界面）＋ 本沙箱侧注入（改插件自己的 iframe 文档）双写：
          // 隔离后插件元素在 iframe 里，只注宿主 head 的话插件自己的界面拿不到样式。
          var s = String(css || '');
          try {
            var el = document.createElement('style');
            el.textContent = s;
            document.head.appendChild(el);
          } catch (e) {}
          return call('ui.addStyle', [s]);
        },
        applyVars: function (vars) {
          // 宿主 <html> 上设变量（改宿主界面）＋ 沙箱 <html> 上设同名变量（插件自绘区用它）
          try {
            var v = vars || {};
            Object.keys(v).forEach(function (k) {
              if (/^--[a-zA-Z0-9-]{1,40}$/.test(k)) document.documentElement.style.setProperty(k, String(v[k]));
            });
          } catch (e) {}
          return call('ui.applyVars', [vars]);
        },
        // 自绘层 → 就是本 iframe 的 body
        layer: function () { return document.body; },
        nav: function (spec) { return call('ui.nav', [spec]); },
        // [v1.0.5.7] 隔离后插件看不见设置页，以下三个方法由宿主代查
        navInfo: function () { return call('ui.navInfo', []); },
        setNavLabel: function (label) { return call('ui.setNavLabel', [label]); },
        activatePanel: function () { return call('ui.activatePanel', []); },
        // [v1.0.5.7] 宿主几何：让插件把注入的元素对齐到宿主元素上（看不见宿主也能定位）
        alignTo: function (target, scope) { return call('ui.alignTo', [target, scope || '']); },
        navActive: function () { return call('ui.navActive', []); },
        onHostLayoutChanged: function (cb) {
          if (!events['host:layout']) {
            events['host:layout'] = [];
            call('ui.onHostLayoutChanged', []).catch(function () {});
          }
          events['host:layout'].push(cb);
        },
        getHostLang: function () { return call('ui.getHostLang', []); },
        // [v1.0.5.7] 请求宿主重算信息栏可见性/窗口尺寸（替代跨 iframe 的
        // window.dispatchEvent('dc-plugins-updated') —— 那在沙箱里发不到宿主）
        notifyHost: function () { return call('ui.notifyHost', []); },
        onHostLangChanged: function (cb) {
          if (!events['host:lang']) {
            events['host:lang'] = [];
            call('ui.onHostLangChanged', []).catch(function () {});
          }
          events['host:lang'].push(cb);
        },
        get: function (sel) { return makeHandle(String(sel)); },
        hide: function (sel) { return domCall('hide', { sel: sel }); },
        show: function (sel) { return domCall('show', { sel: sel }); },
        setText: function (sel, v) { return domCall('text', { sel: sel, v: v }); },
        patch: function (sel, ops) {
          // 双写：宿主侧（改宿主 html/元素）＋ 沙箱侧（插件自绘区也吃同一套属性选择器，
          // 例：liquid-glass 的 html[data-lg] 前缀规则必须在本 iframe 的 <html> 上也能命中）
          try { applyLocalPatch(String(sel), ops || {}); } catch (e) {}
          return domCall('patch', { sel: sel, ops: ops });
        },
        push: function (sel, html) {
          // 插件往 body / 自己的容器里塞 html —— 隔离后宿主侧那份进不了 iframe，
          // 沙箱侧自己来一份，保证插件自绘区看得见（宿主侧仍然照常注入）。
          try {
            var s = String(sel || '').trim().toLowerCase();
            if (s === 'body' || s === 'html') insertLocalHtml(String(html || ''));
          } catch (e) {}
          return domCall('push', { sel: sel, html: html });
        },
        on: function (sel, type, cb) {
          var key = 'dom:' + sel + ':' + type;
          if (!events[key]) {
            events[key] = [];
            // [v1.0.5.7] 与 ui.get().on 同一修复：listen 是 dom 指令，不是宿主方法
            domCall('listen', { sel: sel, type: type }).catch(function () {});
          }
          events[key].push(cb);
          return true;
        },
      },

      storage: {
        get: function (key) { return call('storage.get', [key]); },
        set: function (key, value) { return call('storage.set', [key, value]); },
        all: function () { return call('storage.all', []); },
      },

      // ---- 宿主能力（v1.0.5.7 起，替代原先直连 window.electronAPI 的越权用法）----
      // 插件改自己的设置项：宿主侧写死插件 id，插件无法指定别人的
      setSetting: function (key, value) { return call('ui.setPluginSetting', [key, value]); },
      // 读公共配置（宿主只回白名单字段：language / timeFormat / lightsOff / theme）
      getConfig: function () { return call('ui.getConfig', []); },
      // 读插件列表（公共元数据；只有自己那条带完整 settings/values）
      listPlugins: function () { return call('ui.listPlugins', []); },
      // 订阅宿主事件（配置变化 / 关灯状态）
      onConfigUpdated: function (cb) { (events['host:config'] = events['host:config'] || []).push(cb); },
      onLightsOffStateChanged: function (cb) { (events['host:lightsOff'] = events['host:lightsOff'] || []).push(cb); },

      fetchText: function (url, options) { return call('net.fetchText', [url, options]); },

      // 隔离后没有本地资源目录可直读；统一走宿主代理（仅 https）
      assets: {
        base: '',
        url: function (rel) { return String(rel || ''); },
      },
    };

    return dc;
  }

  var mounts = [];
  function start() {
    try {
      var d = buildDc();
      // 用 Function 而不是 eval：让插件代码拿不到本文件的闭包变量
      // eslint-disable-next-line no-new-func
      new Function('dc', String(boot.code || ''))(d);
      mounts.forEach(function (fn) {
        try {
          // [v1.0.5.7] 记录清理函数：宿主 dispose 时执行（原来被静默丢弃，
          // 落盘 / 释放麦克风的语义在隔离路径整个丢失）
          var c = fn(document.body, d);
          if (typeof c === 'function') cleanups.push(c);
        } catch (e) { reportErr(e); }
      });
      parent.postMessage({ __dc: 1, kind: 'ready' }, '*');
    } catch (e) {
      reportErr(e);
      parent.postMessage({ __dc: 1, kind: 'ready', failed: true }, '*');
    }
  }

  // 等宿主下发 boot（宿主会带 code / settings / hook 等）
  parent.postMessage({ __dc: 1, kind: 'hello' }, '*');
})();
