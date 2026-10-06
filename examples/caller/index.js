/* index.js — 远程喊人提醒插件（ClassCaller → Digital Clock）
 *
 * 三个窗口各跑一份本文件（由 dc.hook 区分）：
 * - clock.infoBar   ：网络节点。连接 MQTT(手写 WSS 精简客户端) / 本机 WS，把状态写进 dc.storage
 *                     供其它窗口读取；同时负责日期栏 📢 提示与可选的时钟响铃。
 * - lightsOff.background ：只读节点。每秒读 storage，全屏卡片提醒 + 叮咚声 + 「知道了」。
 * - settings.theme  ：导航页。连接状态 / 当前在屏 / 来电记录 / 测试提醒。
 *
 * 跨窗口同步：storage 单 key + rev 版本号（只有内容真正变化才 rev++ 并写入）。
 * 卸载/改设置时清理：WS、定时器、Observer、音频上下文。
 */
(function () {
  'use strict';

  var PLUGIN_ID = 'com.yejack819.caller';
  var SHARED_KEY = 'shared';   // { rev, ts, conn, slots, pendingCount, className, history, lastEvent }
  var CMD_KEY = 'cmd';         // { ts, type: 'test' | 'clearHistory' }（导航页 → 网络节点）
  var TOPIC_ROOT = 'classcaller/v1';

  var DEFAULT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker-cn.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
    'wss://mqtt.eclipseprojects.io/mqtt',
  ];

  // ---------- 文案（跟随宿主中英文，判断顺序见 detectLang） ----------
  var T = {
    zh: {
      navTitle: '远程喊人',
      callYou: '找你', queueShort: '队', allClass: '全班同学', ok: '知道了',
      queueing: '另有 {n} 位老师排队中', remain: '剩余 {s} 秒', forever: '常驻提醒',
      status: '连接状态', chMqtt: '云端 MQTT', chLocal: '本机服务', disabled: '已停用',
      connecting: '连接中', online: '在线', offline: '离线',
      onScreen: '当前在屏', nobody: '当前无人被喊', pending: '排队',
      history: '来电记录', noHistory: '暂无记录', test: '测试提醒', clear: '清空记录',
      saved: '已发送，等 2 秒看效果', lastEvent: '最近事件', none: '无',
      howto: '班级码填 ClassCaller 设置页「云端中转」的云端 ID；本机模式填教室电脑 IP。收到消息后日期栏出现 📢，关灯时全屏提醒。'
    },
    en: {
      navTitle: 'Remote Call',
      callYou: 'wants you', queueShort: 'Q', allClass: 'Whole class', ok: 'Got it',
      queueing: '{n} more teacher(s) waiting', remain: '{s}s left', forever: 'Sticky',
      status: 'Connection', chMqtt: 'Cloud MQTT', chLocal: 'Local server', disabled: 'Disabled',
      connecting: 'Connecting', online: 'Online', offline: 'Offline',
      onScreen: 'On screen', nobody: 'Nobody is called', pending: 'Queue',
      history: 'Call history', noHistory: 'No records yet', test: 'Test alert', clear: 'Clear history',
      saved: 'Sent, wait 2s to see it', lastEvent: 'Last event', none: 'None',
      howto: 'Fill Cloud ID from ClassCaller settings; for local mode use the classroom PC IP. Incoming calls show 📢 in the info bar and a fullscreen alert in lights-off.'
    }
  };

  // ---------- 语言探测：① 宿主 [data-lang] 节点（中文必含汉字）② 宿主配置 ③ <html lang> ----------
  function detectLangSync() {
    var nodes = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || '').trim();
      if (!t) continue;
      if (/[\u4e00-\u9fff]/.test(t)) return 'zh';
      if (/[a-zA-Z]/.test(t)) return 'en';
    }
    var l = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return l.indexOf('en') === 0 ? 'en' : 'zh';
  }

  function makeLang(dc, onChange) {
    var lang = detectLangSync();
    var token = 0;
    function apply(v) { if (v !== lang) { lang = v; onChange && onChange(lang); } }
    // ② 时钟窗口：dc.getConfig().language + dc.onConfigUpdated（宿主该 API 无退订 → 令牌防旧实例）
    try {
      var api = dc;
      if (api && typeof api.getConfig === 'function') {
        var my = ++token;
        api.getConfig().then(function (hcfg) {
          if (my !== token || !hcfg) return;
          var l = (hcfg.language === 'en' || hcfg.language === 'zh') ? hcfg.language : null;
          if (l) apply(l);
        }).catch(function () {});
      }
    } catch (e) {}
    // 文案节点 / html lang 变化
    var mo = new MutationObserver(function () { apply(detectLangSync()); });
    try {
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
    } catch (e) {}
    return {
      get: function () { return lang; },
      t: function (key, n) {
        var d = T[lang] || T.zh;
        var s = String(d[key] !== undefined ? d[key] : (T.zh[key] || key));
        if (n !== undefined) s = s.replace('{n}', String(n)).replace('{s}', String(n));
        return s;
      },
      dispose: function () { token++; try { mo.disconnect(); } catch (e) {} }
    };
  }

  // ---------- 叮咚声（Web Audio，双音门铃；每次独立上下文，用完即关） ----------
  function dingdong(volume) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var t0 = ctx.currentTime + 0.02;
      var vol = Math.max(0, Math.min(1, (Number(volume) || 0) / 100));
      if (vol <= 0) { ctx.close(); return; }
      [[880, 0], [659, 0.22]].forEach(function (p) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t0 + p[1]);
        g.gain.exponentialRampToValueAtTime(vol * 0.6, t0 + p[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[1] + 0.55);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0 + p[1]); osc.stop(t0 + p[1] + 0.6);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1600);
    } catch (e) {}
  }

  // ---------- 手写 MQTT over WebSocket 精简客户端（QoS0 子集） ----------
  function utf8(s) { try { return unescape(encodeURIComponent(s)); } catch (e) { return s; } }
  function deutf8(b) {
    try { return decodeURIComponent(escape(String.fromCharCode.apply(null, b))); }
    catch (e) { return ''; }
  }
  function encLen(n) {
    var out = [];
    do { var d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0);
    return out;
  }
  function strField(s) {
    var b = [];
    var raw = utf8(s);
    for (var i = 0; i < raw.length; i++) b.push(raw.charCodeAt(i) & 255);
    // [v1.0.5.7] MQTT 字符串长度前缀是大端（big-endian）：高字节在前。
    // 原来写成 unshift(len&255, len>>8) 是小端，broker 会把长度读成 (低字节<<8|高字节)，
    // 短字符串（<256）长度字段直接变成 len*256 → CONNECT/SUBSCRIBE 被判非法包而断开。
    b.unshift((b.length >> 8) & 255, b.length & 255);
    return b;
  }

  function MqttLink(url, handlers) {
    var self = this;
    this.url = url;
    this.state = 'connecting'; // connecting | online | offline
    this.stopped = false;
    this.ws = null;
    this.pend = null;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.ackSeen = false;
    this.h = handlers || {};

    function setState(s) { if (self.state !== s) { self.state = s; self.h.onState && self.h.onState(url, s); } }

    function connect() {
      if (self.stopped) return;
      self.ackSeen = false;
      var ws;
      try { ws = new WebSocket(url, 'mqtt'); } catch (e) { setState('offline'); schedule(); return; }
      ws.binaryType = 'arraybuffer';
      self.ws = ws;
      setState('connecting');
      ws.onopen = function () { sendConnect(); };
      ws.onmessage = function (ev) {
        var buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : null;
        if (buf) onData(buf);
      };
      ws.onclose = function () { if (!self.stopped) { setState('offline'); schedule(); } };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }
    function schedule() {
      if (self.stopped) return;
      if (self.reconnectTimer) clearTimeout(self.reconnectTimer);
      self.reconnectTimer = setTimeout(connect, 8000 + Math.floor(Math.random() * 2000));
    }
    function raw(bytes) {
      if (self.ws && self.ws.readyState === 1) {
        try { self.ws.send(new Uint8Array(bytes)); } catch (e) {}
      }
    }
    function sendConnect() {
      var cid = 'cc-ck-' + Math.random().toString(16).slice(2, 10);
      var vh = strField('MQTT');               // protocol name
      vh.push(4, 0x02);                        // level 4, clean session
      vh.push(0, 30);                          // keepalive 30s
      var payload = strField(cid);
      var all = vh.concat(payload);
      raw([0x10].concat(encLen(all.length)).concat(all));
    }
    function subscribe(topic) {
      var body = [0, 1].concat(strField(topic)).concat([0]); // packetId=1, qos0
      raw([0x82].concat(encLen(body.length)).concat(body));
    }
    this.stop = function () {
      self.stopped = true;
      if (self.pingTimer) { clearInterval(self.pingTimer); self.pingTimer = null; }
      if (self.reconnectTimer) { clearTimeout(self.reconnectTimer); self.reconnectTimer = null; }
      try { self.ws && self.ws.close(); } catch (e) {}
      setState('offline');
    };
    function onData(buf) {
      self.pend = self.pend ? concat(self.pend, buf) : buf;
      for (;;) {
        if (self.pend.length < 2) return;
        var type = self.pend[0] >> 4;
        var len = 0, mul = 1, pos = 1, ok = false, b;
        for (; pos < self.pend.length; pos++) {
          b = self.pend[pos];
          len += (b & 127) * mul; mul *= 128;
          if (!(b & 128)) { ok = true; pos++; break; }
        }
        if (!ok || self.pend.length < pos + len) return;
        var body = self.pend.slice(pos, pos + len);
        self.pend = self.pend.slice(pos + len);
        if (type === 2) {                          // CONNACK
          var rc = body[1];
          if (rc === 0) {
            setState('online');
            subscribe(self.h.topic || '');
            if (self.pingTimer) clearInterval(self.pingTimer);
            self.pingTimer = setInterval(function () { raw([0xC0, 0x00]); }, 15000); // PINGREQ
          } else { setState('offline'); try { self.ws.close(); } catch (e) {} }
        } else if (type === 3) {                   // PUBLISH qos0
          if (body.length < 4) continue;
          var tl = (body[0] << 8) | body[1];
          if (2 + tl > body.length) continue;
          var payload = body.slice(2 + tl);
          var topic = deutf8(body.slice(2, 2 + tl));
          self.h.onMessage && self.h.onMessage(topic, deutf8(payload));
        }
        // 13 PINGRESP 忽略
      }
    }
    function concat(a, b) { var out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; }
    connect();
  }

  // ---------- 通用状态合并 ----------
  function slotExpired(slot) {
    var exp = Number(slot && slot.expiresAt) || 0;
    return exp > 0 && Date.now() > exp + 10000;
  }
  function teacherShort(slot) {
    var t = (slot && slot.teacher) || {};
    var s = String(t.name || t.subject || '').trim();
    if (!s) return '?';
    return s.length > 6 ? s.slice(0, 6) : s;
  }
  function namesText(slot, lang) {
    if (slot.allClass) return (T[lang] || T.zh).allClass;
    var names = Array.isArray(slot.names) ? slot.names : [];
    return names.join('、') || '?';
  }

  // =====================================================================
  // 窗口一：clock.infoBar —— 网络节点 + 日期栏提示
  // =====================================================================
  function mountClock(slot, dc) {
    var cfg = dc.settings;
    var lang = makeLang(dc, function () { refreshInfo(true); });
    var cleanups = [function () { lang.dispose(); }];

    // ---- 共享状态（写 storage，供关灯/设置窗口读） ----
    var state = {
      rev: 0, ts: 0,
      conn: { mqtt: 'disabled', local: 'disabled' },
      srcs: {},                 // src -> { slots: {callId: slot}, at }
      pendingCount: 0,
      className: '',
      history: [],
      lastEvent: null,          // { ts, callId, status }
      fake: {}                  // 测试提醒的临时槽
    };
    var writeTimer = null;
    function persist() {
      if (writeTimer) return;
      writeTimer = setTimeout(function () {
        writeTimer = null;
        var out = {
          rev: state.rev, ts: Date.now(),
          conn: state.conn,
          slots: mergedSlots().filter(function (s) { return !slotExpired(s); }),
          pendingCount: state.pendingCount,
          className: state.className,
          history: state.history,
          lastEvent: state.lastEvent
        };
        dc.storage.set(SHARED_KEY, out).catch(function () {});
      }, 200);
    }
    function mergedSlots() {
      var map = {};
      Object.keys(state.srcs).forEach(function (src) {
        var bag = state.srcs[src].slots;
        Object.keys(bag).forEach(function (id) {
          var cur = bag[id];
          if (slotExpired(cur)) return;
          if (!map[id] || (cur.__at || 0) >= (map[id].__at || 0)) map[id] = cur;
        });
      });
      Object.keys(state.fake).forEach(function (id) { map[id] = state.fake[id]; });
      return Object.keys(map).map(function (id) { return map[id]; });
    }
    function bump() { state.rev++; state.ts = Date.now(); persist(); }

    // ---- 广播消息入口 ----
    var lastEventKey = '';
    function applyBroadcast(msg, src) {
      if (!msg || typeof msg !== 'object') return;
      var now = Date.now();
      if (msg.type === 'slots') {
        var bag = state.srcs[src] || (state.srcs[src] = { slots: {}, at: 0 });
        (Array.isArray(msg.slots) ? msg.slots : []).forEach(function (s) {
          if (!s || !s.callId) return;
          s.__at = now; bag.slots[s.callId] = s;
        });
        state.pendingCount = Math.max(state.pendingCount, (Array.isArray(msg.pending) ? msg.pending : []).length);
        if (!state.className && msg.className) state.className = msg.className;
        bump(); refreshInfo();
      } else if (msg.type === 'callEvent') {
        var st = msg.status;
        if (st === 'confirmed' || st === 'expired') {
          Object.keys(state.srcs).forEach(function (k) { delete state.srcs[k].slots[msg.callId]; });
          delete state.fake[msg.callId];
          state.pendingCount = 0;
        }
        var key = msg.callId + '|' + st;
        if (st === 'shown' && key !== lastEventKey) {
          lastEventKey = key;
          state.lastEvent = { ts: now, callId: msg.callId, status: st };
          pulse();
          if (cfg.clockBeep && !lightsOffOn) dingdong(cfg.volume);
        }
        bump(); refreshInfo();
      } else if (msg.type === 'state') {
        if (msg.className) { state.className = msg.className; bump(); }
      } else if (msg.type === 'history') {
        var items = Array.isArray(msg.items) ? msg.items : [];
        if (items.length && (!state.history.length || (items[0].time || 0) >= (state.history[0].time || 0))) {
          state.history = items.slice(0, 20); bump();
        }
      }
    }

    // ---- 通道 ----
    function brokerList() {
      var raw = String(cfg.brokers || '').split(/\r?\n/).map(function (s) { return s.trim(); })
        .filter(function (u) { return /^wss?:\/\//i.test(u); });
      return (raw.length ? raw : DEFAULT_BROKERS).slice(0, 6);
    }
    function cloudId() { return String(cfg.cloudId || '').replace(/[^a-zA-Z0-9]/g, ''); }
    var links = [];
    function startChannels() {
      stopChannels();
      var mode = cfg.channel || 'mqtt';
      state.conn = { mqtt: 'disabled', local: 'disabled' };
      var id = cloudId();
      if ((mode === 'mqtt' || mode === 'both')) {
        if (!id) { state.conn.mqtt = 'offline'; }
        else {
          var topic = TOPIC_ROOT + '/' + id + '/state';
          brokerList().forEach(function (url) {
            var link = new MqttLink(url, {
              topic: topic,
              onState: function (u, s) {
                if (s === 'online') state.conn.mqtt = 'online';
                else if (state.conn.mqtt !== 'online') state.conn.mqtt = s === 'connecting' ? 'connecting' : state.conn.mqtt === 'online' ? 'online' : 'offline';
                // 任一通道在线即报在线
                if (s === 'online') state.conn.mqtt = 'online';
                else if (s !== 'online' && !links.some(function (l) { return l.kind === 'mqtt' && l.link.state === 'online'; })) state.conn.mqtt = (s === 'connecting' ? 'connecting' : 'offline');
                bump();
              },
              onMessage: function (t, text) {
                var m = null; try { m = JSON.parse(text); } catch (e) {}
                if (m) applyBroadcast(m, 'mqtt:' + url);
              }
            });
            link.kind = 'mqtt';
            links.push(link);
          });
        }
      }
      if (mode === 'local' || mode === 'both') {
        var url = String(cfg.localUrl || '').trim() || 'ws://127.0.0.1:9527/ws';
        var ws = null, retry = null;
        var localLink = {
          kind: 'local',
          get state() { return ws ? (ws.readyState === 1 ? 'online' : 'connecting') : 'offline'; },
          stop: function () { if (retry) clearTimeout(retry); try { ws && ws.close(); } catch (e) {} }
        };
        function connectLocal() {
          if (localLink.stopped) return;
          try { ws = new WebSocket(url); } catch (e) { state.conn.local = 'offline'; scheduleLocal(); return; }
          ws.onopen = function () { state.conn.local = 'online'; bump(); };
          ws.onclose = function () { if (!localLink.stopped) { state.conn.local = 'offline'; bump(); scheduleLocal(); } };
          ws.onerror = function () { try { ws.close(); } catch (e) {} };
          ws.onmessage = function (ev) {
            var m = null; try { m = JSON.parse(ev.data); } catch (e) {}
            if (m) applyBroadcast(m, 'local');
          };
        }
        function scheduleLocal() { if (!localLink.stopped) retry = setTimeout(connectLocal, 8000 + Math.floor(Math.random() * 2000)); }
        localLink.stopped = false;
        links.push(localLink);
        connectLocal();
      }
      bump();
    }
    function stopChannels() {
      links.forEach(function (l) { try { l.stop(); } catch (e) {} });
      links = [];
    }
    cleanups.push(stopChannels);

    // 关灯窗口被点名时「当前在屏」要尽快跟上：callEvent 已带 callId，但内容靠 slots 广播；
    // retained 快照在 MQTT 重连时自动补齐，本机通道重连时服务端也会主动推全量。

    // ---- 日期栏 ----
    var lastText = null;
    function infoText() {
      var mode = cfg.infoMode || 'names';
      if (mode === 'off') return '';
      var slots = mergedSlots();
      if (!slots.length) return '';
      var n = slots.length;
      var txt;
      if (mode === 'dot') txt = '●';
      else if (mode === 'count') txt = '📢 ' + n;
      else txt = '📢 ' + teacherShort(slots[0]) + (n > 1 ? '+' + (n - 1) : '');
      if (cfg.showQueue && state.pendingCount > 0) txt += '·' + lang.t('queueShort') + state.pendingCount;
      return txt;
    }
    function refreshInfo(force) {
      var txt = infoText();
      if (force || txt !== lastText) {
        lastText = txt;
        if (txt) dc.clock.setInfoText(txt); else dc.clock.clearInfoText();
      }
    }
    var pulseTimer = null;
    function pulse() {
      try {
        slot.classList.add('cc-pulse');
        if (pulseTimer) clearTimeout(pulseTimer);
        pulseTimer = setTimeout(function () { try { slot.classList.remove('cc-pulse'); } catch (e) {} }, 4200);
      } catch (e) {}
    }

    // ---- 时钟响铃需要知道关灯是否开着（宿主 API 无退订 → 令牌防旧实例） ----
    // [v1.0.5.7] 隔离后没有 window.electronAPI，一律用 dc
    var lightsOffOn = false, loToken = 0;
    try {
      var api = dc;
      if (api && typeof api.getConfig === 'function') {
        var myTok = ++loToken;
        api.getConfig().then(function (c) { if (myTok === loToken) lightsOffOn = !!(c && c.lightsOff); }).catch(function () {});
      }
      if (api && typeof api.onLightsOffStateChanged === 'function') {
        var myTok2 = ++loToken;
        api.onLightsOffStateChanged(function (on) { if (myTok2 === loToken) lightsOffOn = !!on; });
      }
    } catch (e) {}

    // ---- 导航页命令轮询（测试提醒 / 清空历史） ----
    var lastCmdTs = 0, cmdTimer = null;
    cmdTimer = setInterval(function () {
      dc.storage.get(CMD_KEY).then(function (c) {
        if (!c || !c.ts || c.ts <= lastCmdTs) return;
        lastCmdTs = c.ts;
        if (c.type === 'test') {
          var now = Date.now();
          var fake = {
            callId: 'test-' + now, side: 'left', key: 'test',
            teacher: { subject: '测试', name: '示例老师' },
            names: ['小明', '小红'], allClass: false,
            message: '这是一条测试提醒（15 秒后自动消失）',
            className: state.className || '示例班级',
            alertDuration: 15, startedAt: now, expiresAt: now + 15000, __at: now
          };
          state.fake[fake.callId] = fake;
          state.lastEvent = { ts: now, callId: fake.callId, status: 'shown' };
          lastEventKey = fake.callId + '|shown';
          pulse();
          if (!lightsOffOn && cfg.clockBeep) dingdong(cfg.volume);
          bump();
        } else if (c.type === 'clearHistory') {
          state.history = []; bump();
        }
      }).catch(function () {});
    }, 2000);
    cleanups.push(function () { if (cmdTimer) clearInterval(cmdTimer); });

    // 定期清理本地已过期的槽（callEvent 丢失时的兜底）
    var gcTimer = setInterval(function () {
      var dirty = false;
      Object.keys(state.fake).forEach(function (id) { if (slotExpired(state.fake[id])) { delete state.fake[id]; dirty = true; } });
      Object.keys(state.srcs).forEach(function (k) {
        var bag = state.srcs[k].slots;
        Object.keys(bag).forEach(function (id) { if (slotExpired(bag[id])) { delete bag[id]; dirty = true; } });
      });
      if (dirty) { bump(); refreshInfo(); }
    }, 5000);
    cleanups.push(function () { if (gcTimer) clearInterval(gcTimer); });

    startChannels();
    refreshInfo(true);
    return function cleanup() {
      cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
      if (pulseTimer) clearTimeout(pulseTimer);
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      try { if (dc.clock && dc.clock.clearInfoText) dc.clock.clearInfoText(); } catch (e) {}
    };
  }

  // =====================================================================
  // 窗口二：lightsOff.background —— 全屏提醒卡片
  // =====================================================================
  function mountLights(slot, dc) {
    var cfg = dc.settings;
    var lang = makeLang(dc, function () { render(); });
    var dismissed = {};        // callId -> 1（本窗口内手动关闭）
    var seenEventTs = 0;
    var lastRev = -1;
    var data = null;
    var busy = false;

    var wrap = document.createElement('div');
    wrap.className = 'cc-lw';
    slot.appendChild(wrap);

    function applyScale() { wrap.style.fontSize = (Number(cfg.alertScale) || 100) + '%'; }
    function applyTheme() {
      var th = dc.theme();
      wrap.classList.toggle('cc-light', !!(th && !th.isDark));
    }

    function liveSlots() {
      if (!data) return [];
      return (data.slots || []).filter(function (s) { return s && !dismissed[s.callId] && !slotExpired(s); });
    }

    function cardNode(s) {
      var card = document.createElement('div');
      card.className = 'cc-card cc-in';
      var head = document.createElement('div'); head.className = 'cc-head';
      var chip = document.createElement('span'); chip.className = 'cc-chip';
      chip.textContent = String((s.teacher && s.teacher.subject) || '·');
      var name = document.createElement('span'); name.className = 'cc-tname';
      name.textContent = teacherShort(s);
      head.appendChild(chip); head.appendChild(name);
      if (data.className || s.className) {
        var cls = document.createElement('span'); cls.className = 'cc-cls';
        cls.textContent = String(s.className || data.className || '');
        head.appendChild(cls);
      }
      var main = document.createElement('div'); main.className = 'cc-main';
      main.textContent = namesText(s, lang.get());
      card.appendChild(head); card.appendChild(main);
      if (s.message) {
        var msg = document.createElement('div'); msg.className = 'cc-msg';
        msg.textContent = String(s.message);
        card.appendChild(msg);
      }
      var foot = document.createElement('div'); foot.className = 'cc-foot';
      var exp = Number(s.expiresAt) || 0;
      if (exp > 0) {
        var rem = document.createElement('span'); rem.className = 'cc-remain';
        rem.dataset.exp = String(exp);
        foot.appendChild(rem);
      } else {
        var fv = document.createElement('span'); fv.className = 'cc-forever';
        fv.textContent = '⏳ ' + lang.t('forever');
        foot.appendChild(fv);
      }
      card.appendChild(foot);
      return card;
    }

    function render() {
      applyScale(); applyTheme();
      var slots = liveSlots();
      var pend = data ? (data.pendingCount || 0) : 0;
      wrap.textContent = '';
      if (!slots.length) { wrap.classList.remove('cc-has'); return; }
      wrap.classList.add('cc-has');
      slots.forEach(function (s) { wrap.appendChild(cardNode(s)); });
      if (pend > 0) {
        var q = document.createElement('div'); q.className = 'cc-queue';
        q.textContent = '⌛ ' + lang.t('queueing', pend);
        wrap.appendChild(q);
      }
      var acts = document.createElement('div');
      acts.className = 'cc-actions';
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'cc-btn';
      btn.textContent = '✓ ' + lang.t('ok');
      acts.appendChild(btn);
      wrap.appendChild(acts);
      // 可交互面积最小化：只有按钮行吃事件，且拦下会触发「双击退出关灯」的事件
      ['click', 'dblclick', 'mousedown'].forEach(function (t) {
        acts.addEventListener(t, function (e) { e.stopPropagation(); });
      });
      btn.addEventListener('click', function () {
        liveSlots().forEach(function (s) { dismissed[s.callId] = 1; });
        render();
      });
      updateRemains();
    }

    function updateRemains() {
      var nodes = wrap.querySelectorAll('.cc-remain');
      Array.prototype.forEach.call(nodes, function (el) {
        var exp = Number(el.dataset.exp) || 0;
        var left = Math.max(0, Math.round((exp - Date.now()) / 1000));
        el.textContent = '⏱ ' + lang.t('remain', left);
      });
    }

    var tick = setInterval(function () {
      updateRemains();
      // 过期兜底 + 主题跟随
      if (liveSlots().length !== wrap.querySelectorAll('.cc-card').length) render();
      applyTheme();
      if (busy) return;
      busy = true;
      dc.storage.get(SHARED_KEY).then(function (d) {
        busy = false;
        if (!d) return;
        data = d;
        if (d.rev !== lastRev) {
          lastRev = d.rev;
          var ev = d.lastEvent;
          if (ev && ev.status === 'shown' && ev.ts > seenEventTs) {
            seenEventTs = ev.ts;
            if (cfg.sound) dingdong(cfg.volume);
          }
          render();
        }
      }).catch(function () { busy = false; });
    }, 1000);

    render();
    return function cleanup() {
      clearInterval(tick);
      lang.dispose();
      wrap.textContent = '';
    };
  }

  // =====================================================================
  // 窗口三：settings.theme —— 导航页（状态 / 在屏 / 历史 / 测试）
  // =====================================================================
  function mountSettings(slot, dc) {
    // [v1.0.5.7] apiVersion 3 = iframe 沙箱（无 window.electronAPI）。
    // settings.theme 钩子会被挂载两次：
    //   ① 主题槽 iframe（无 panelId）：只负责向宿主注册导航页 ui.nav(spec)，随后可能再收到
    //      一条带 panelId 的启动（宿主为导航页新建独立 iframe）。
    //   ② 导航页 iframe（有 panelId）：真正把自己那块 UI 建在自己的 body 里。
    var isPanel = (typeof dc.isPanel === 'function') ? dc.isPanel() : (typeof dc.panelId === 'function' && !!dc.panelId());

    if (!isPanel) {
      // ① 注册导航页（宿主据此在设置左侧建导航项 + 在右侧建一个沙箱 iframe）
      // [v1.0.5.7] 导航标签跟随宿主语言（原来硬编码中文），切换语言时同步
      var lang0 = makeLang(dc, null);
      try {
        if (typeof dc.ui.nav === 'function') dc.ui.nav({ id: 'caller', label: lang0.t('navTitle'), icon: '📢' });
      } catch (e) {}
      try {
        if (typeof dc.ui.onHostLangChanged === 'function') {
          dc.ui.onHostLangChanged(function (l) {
            if (l !== 'zh' && l !== 'en') return;
            try { if (typeof dc.ui.setNavLabel === 'function') dc.ui.setNavLabel(T[l].navTitle); } catch (e) {}
          });
        }
      } catch (e) {}
      return;
    }

    // ② 导航页 iframe：page 就是本 iframe 自己的 body
    var lang = makeLang(dc, function () { paintTexts(); renderStatus(); renderHistory(); });
    var page = (typeof dc.root === 'function' && dc.root()) || slot;
    if (!page) { lang.dispose(); return; }
    page.classList.add('cc-page');

    // —— 结构（复用宿主类名保持一致观感） ——
    var secStatus = document.createElement('div'); secStatus.className = 'plugin-section-label'; page.appendChild(secStatus);
    var statusBox = document.createElement('div'); statusBox.className = 'cc-status'; page.appendChild(statusBox);
    var secOn = document.createElement('div'); secOn.className = 'plugin-section-label'; page.appendChild(secOn);
    var onBox = document.createElement('div'); onBox.className = 'cc-onscreen'; page.appendChild(onBox);
    var secHist = document.createElement('div'); secHist.className = 'plugin-section-label'; page.appendChild(secHist);
    var histBox = document.createElement('div'); histBox.className = 'cc-hist'; page.appendChild(histBox);
    var how = document.createElement('p'); how.className = 'setting-note cc-howto'; page.appendChild(how);
    var actions = document.createElement('div'); actions.className = 'cc-actions-row'; page.appendChild(actions);
    var btnTest = document.createElement('button'); btnTest.type = 'button'; btnTest.className = 'cc-btn';
    var btnClear = document.createElement('button'); btnClear.type = 'button'; btnClear.className = 'cc-btn cc-btn-ghost';
    actions.appendChild(btnTest); actions.appendChild(btnClear);

    var STATE_WORD = { online: 'online', connecting: 'connecting', offline: 'offline', disabled: 'disabled' };
    function dot(cls, label, stateName) {
      var row = document.createElement('div'); row.className = 'cc-row';
      var d = document.createElement('span'); d.className = 'cc-dot cc-dot-' + (STATE_WORD[stateName] || 'offline');
      var t = document.createElement('span'); t.textContent = label + '：' + lang.t(stateName === 'connecting' ? 'connecting' : stateName);
      row.appendChild(d); row.appendChild(t);
      return row;
    }

    function connName(mode) {
      if (mode === 'local') return lang.t('chLocal');
      if (mode === 'both') return lang.t('chMqtt') + ' + ' + lang.t('chLocal');
      if (mode === 'off') return lang.t('disabled');
      return lang.t('chMqtt');
    }
    function renderStatus() {
      statusBox.textContent = '';
      statusBox.appendChild(document.createTextNode(''));
    }
    function fmtTime(ts) {
      var d = new Date(Number(ts) || 0);
      if (!d.getTime()) return '';
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function renderHistory() {
      dc.storage.get(SHARED_KEY).then(function (data) {
        // 状态区
        statusBox.textContent = '';
        var conn = (data && data.conn) || { mqtt: 'disabled', local: 'disabled' };
        var mode = dc.settings.channel || 'mqtt';
        var head = document.createElement('div'); head.className = 'cc-row cc-mode';
        head.textContent = lang.t('status') + '：' + connName(mode);
        statusBox.appendChild(head);
        if (mode === 'mqtt' || mode === 'both') statusBox.appendChild(dot(null, lang.t('chMqtt'), conn.mqtt || 'disabled'));
        if (mode === 'local' || mode === 'both') statusBox.appendChild(dot(null, lang.t('chLocal'), conn.local || 'disabled'));
        // 在屏区
        onBox.textContent = '';
        var slots = (data && data.slots) || [];
        if (!slots.length) {
          var empty = document.createElement('span'); empty.className = 'plugin-empty';
          empty.textContent = lang.t('nobody');
          onBox.appendChild(empty);
        } else {
          slots.forEach(function (s) {
            var row = document.createElement('div'); row.className = 'cc-row cc-call';
            row.textContent = '📣 ' + teacherShort(s) + ' → ' + namesText(s, lang.get());
            onBox.appendChild(row);
          });
        }
        if (data && data.pendingCount > 0) {
          var q = document.createElement('div'); q.className = 'cc-row cc-call cc-queue-line';
          q.textContent = '⌛ ' + lang.t('pending') + ' × ' + data.pendingCount;
          onBox.appendChild(q);
        }
        // 历史区
        histBox.textContent = '';
        var items = (data && data.history) || [];
        if (!items.length) {
          var eh = document.createElement('span'); eh.className = 'plugin-empty';
          eh.textContent = lang.t('noHistory');
          histBox.appendChild(eh);
        } else {
          items.slice(0, 20).forEach(function (it) {
            var row = document.createElement('div'); row.className = 'cc-row cc-hist-row';
            var t = document.createElement('span'); t.className = 'cc-hist-time';
            t.textContent = fmtTime(it.time);
            var w = document.createElement('span'); w.className = 'cc-hist-what';
            var who = (it.teacher && (it.teacher.name || it.teacher.subject)) || '?';
            var ns = Array.isArray(it.names) ? it.names.join('、') : (it.allClass ? lang.t('allClass') : '');
            w.textContent = who + ' → ' + ns + (it.message ? '｜' + it.message : '');
            row.appendChild(t); row.appendChild(w);
            histBox.appendChild(row);
          });
        }
      }).catch(function () {});
    }

    function paintTexts() {
      secStatus.textContent = '🔗 ' + lang.t('status');
      secOn.textContent = '📣 ' + lang.t('onScreen');
      secHist.textContent = '🗂 ' + lang.t('history');
      btnTest.textContent = '🔔 ' + lang.t('test');
      btnClear.textContent = '🗑 ' + lang.t('clear');
      how.textContent = lang.t('howto');
    }

    btnTest.addEventListener('click', function () {
      dc.storage.set(CMD_KEY, { ts: Date.now(), type: 'test' }).then(function () {
        btnTest.textContent = '✓ ' + lang.t('saved');
        setTimeout(function () { btnTest.textContent = '🔔 ' + lang.t('test'); }, 2200);
      }).catch(function () {});
    });
    btnClear.addEventListener('click', function () {
      dc.storage.set(CMD_KEY, { ts: Date.now(), type: 'clearHistory' }).then(function () {
        setTimeout(renderHistory, 2600);
      }).catch(function () {});
    });

    var poll = setInterval(renderHistory, 2500);
    paintTexts(); renderHistory();

    return function cleanup() {
      clearInterval(poll);
      lang.dispose();
    };
  }

  // =====================================================================
  dc.mount(function (slot, dc) {
    if (dc.hook === 'clock.infoBar') return mountClock(slot, dc);
    if (dc.hook === 'lightsOff.background') return mountLights(slot, dc);
    if (dc.hook === 'settings.theme') return mountSettings(slot, dc);
  });
})();
