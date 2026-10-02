// lan-mirror.js — [v1.0.5.6] 局域网只读镜像服务
//
// 作用：在本机开一个只读的 http 服务，让同一局域网（同一 Wi-Fi）里的手机用浏览器
//       打开就能看到这个时钟。**只读**：没有任何写接口，手机端无法改设置、闹钟或窗口。
//
// 设计约束：
//   · 只用 Node 内置模块（http / os / crypto），不给项目新增任何依赖；
//   · 监听 0.0.0.0（局域网可访问），端口被占用时自动顺延；
//   · 访问码走 URL 路径（/<code>/），三种模式见 AUTH_MODES：
//       random = 6 位无歧义短码（好念好手输）；fixed = 用户自定义；none = 直接开根路径；
//   · 页面与快照接口都只认 GET / HEAD，其余动词一律 405；
//   · 页面自包含（内联样式与脚本、零外部资源），断网也打得开；
//   · 快照只暴露「显示所需」的白名单字段，配置里的其它键（含访问码本身）不外泄。
//
// 手机端时间算法与 renderer.js 同源：用服务端时间对齐本机时钟，再叠加手动校准
// 与「定时自动校准」的阶梯累积量，因此手机上的时间和桌面显示一致。

'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PORT = 8788;
const MIN_PORT = 1024;
const MAX_PORT = 65535;
const PORT_TRIES = 20;              // 占用后最多顺延 20 个端口
// 访问码规则 ---------------------------------------------------------------
// 随机码只有 6 位：随机码的作用是「别人猜不到」，而不是「密码学强度」——
// 这个服务是只读的，快照只给外观配置与当前时间，不含任何敏感信息。
// 32 位十六进制（128 bit）对家用/办公 Wi-Fi 是纯负担：手机上根本没法手输，
// 一旦扫码失败就没有退路。6 位短码可以口头念、可以手打，够用且好用。
//
// 字母表刻意剔除了易混字符 i / l / o / 0 / 1（念「零」还是「欧」说不清），
// 剩 31 个字符 → 6 位约 29.7 bit 熵（约 8.9 亿种），暴力枚举一个只读页面毫无意义。
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GENERATED_CODE_LEN = 6;
// 自定义访问码：只允许 URL 路径里安全的字符，避免编码/大小写带来的手输歧义
const CODE_MIN = 4;
const CODE_MAX = 32;
const CODE_RE = new RegExp('^[a-z0-9_-]{' + CODE_MIN + ',' + CODE_MAX + '}$');
// 会和路由撞名的码（/<code>/api/state 是快照接口）不许用
const RESERVED_CODES = ['api'];
// random = 随机短码；fixed = 用户自定义；none = 不需要访问码（直接开根路径）
const AUTH_MODES = ['random', 'fixed', 'none'];
const PAGE_FILE = path.join(__dirname, 'lan-mirror-page.html');
const STOP_TIMEOUT_MS = 800;

const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// ========== 纯工具 ==========

// 生成随机短码。31 不整除 256，所以用拒绝采样（丢弃 >= 248 的字节）而不是取模，
// 避免低位字符被多算一次造成分布偏斜。
function randomToken() {
  let out = '';
  while (out.length < GENERATED_CODE_LEN) {
    const buf = crypto.randomBytes(GENERATED_CODE_LEN * 2);
    for (let i = 0; i < buf.length && out.length < GENERATED_CODE_LEN; i++) {
      const b = buf[i];
      if (b >= 248) continue; // 248 = 8 × 31：超出部分丢弃，保证均匀
      out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

// 是否「系统生成的」随机短码（用于判断存量配置里的旧码要不要换成新格式）
function isGeneratedCode(value) {
  if (typeof value !== 'string' || value.length !== GENERATED_CODE_LEN) return false;
  for (let i = 0; i < value.length; i++) {
    if (CODE_ALPHABET.indexOf(value.charAt(i)) < 0) return false;
  }
  return true;
}

// 把用户输入规整成一个候选访问码：去空白、转小写、空白转 -、剔掉不合法字符、
// 合并连续 -、去掉首尾的 - 和 _、截到 32 位。返回规整后的结果（可能为空/不合法，
// 交给 isToken 判断），界面上直接回显这个值，用户能看到实际会被用什么码。
function sanitizeCode(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+/, '')
    .replace(/[-_]+$/, '')
    .slice(0, CODE_MAX);
}

// 一个字符串能不能当访问码用（长度/字符集合法，且不和路由撞名）
function isToken(value) {
  if (typeof value !== 'string') return false;
  if (!CODE_RE.test(value)) return false;
  return RESERVED_CODES.indexOf(value) < 0;
}

function normalizeAuthMode(value) {
  return AUTH_MODES.indexOf(value) >= 0 ? value : 'random';
}

// 由「访问方式 + 自定义码 + 现有随机码」算出**实际生效**的路径段。
// 纯函数（只依赖入参 + randomToken），放在这里是为了能用 Node 直接单测 ——
// 这段规则一旦写错，表现是「访问码静默失效」或「本该有码却变成了无码敞开」，
// 都是最难靠肉眼发现的问题。主进程写入 lanMirrorToken 前必须走这个函数。
//
// 返回值：{ token, authFallback }
//   none   → token = ''（服务在根路径上提供页面）
//   fixed  → 规整后的自定义码；不合法则**退回随机码**（fail-safe：绝不因为填错就变无码）
//   random → 现在这个随机码；如果它是旧格式（32 位十六进制）就换一个新的 6 位短码
function resolveToken(cfg) {
  const c = cfg || {};
  const mode = normalizeAuthMode(c.lanMirrorAuthMode);
  if (mode === 'none') return { token: '', authFallback: false };
  const current = isGeneratedCode(c.lanMirrorToken) ? c.lanMirrorToken : '';
  if (mode === 'fixed') {
    const code = sanitizeCode(c.lanMirrorFixedCode);
    if (isToken(code)) return { token: code, authFallback: false };
    // 填了但不合法：先把已有随机码用起来，实在没有才生成新的
    return { token: current || randomToken(), authFallback: true };
  }
  return { token: current || randomToken(), authFallback: false };
}

function clampPort(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_PORT;
  return Math.max(MIN_PORT, Math.min(MAX_PORT, n));
}

// 枚举可供手机访问的内网 IPv4：跳过回环、虚拟/自分配地址（169.254.* 链路本地），
// 常见家用/办公网段排在前面，方便设置界面把最可能可用的地址摆在第一位。
function listLanAddresses() {
  const out = [];
  let ifaces = {};
  try { ifaces = os.networkInterfaces() || {}; } catch (e) { return out; }
  Object.keys(ifaces).forEach(name => {
    (ifaces[name] || []).forEach(info => {
      if (!info) return;
      const family = info.family;
      if (family !== 'IPv4' && family !== 4) return;
      if (info.internal) return;
      const address = String(info.address || '');
      if (!address || address.indexOf('169.254.') === 0) return;
      if (out.some(x => x.address === address)) return;
      out.push({ name, address });
    });
  });
  const rank = ip => (ip.indexOf('192.168.') === 0 ? 0
    : ip.indexOf('10.') === 0 ? 1
      : ip.indexOf('172.') === 0 ? 2 : 3);
  out.sort((a, b) => (rank(a.address) - rank(b.address)) || a.address.localeCompare(b.address));
  return out;
}

// ========== 服务 ==========

// options.getConfig: () => 当前应用配置（每次请求现读，改设置后手机端立刻跟上）
function createLanMirror(options) {
  const opts = options || {};
  const getConfig = typeof opts.getConfig === 'function' ? opts.getConfig : () => ({});

  let pageCache = null;
  const state = {
    running: false,
    port: null,
    server: null,
    error: null,
    requests: 0,
    lastRequestAt: 0,
  };

  function readCfg() {
    try { return getConfig() || {}; } catch (e) { return {}; }
  }

  // 服务只「读」配置，从不生成访问码：lanMirrorToken 由主进程独占写入（见 main.js
  // ensureLanToken）。读到空/非法就 fail-closed —— 什么都不服务，绝不因为读不到码
  // 就退回「无码敞开」。
  function currentAuth() {
    const cfg = readCfg();
    const mode = normalizeAuthMode(cfg.lanMirrorAuthMode);
    if (mode === 'none') return { mode, code: '', valid: true };
    const code = isToken(cfg.lanMirrorToken) ? cfg.lanMirrorToken : '';
    return { mode, code, valid: !!code };
  }

  function pageHtml() {
    if (pageCache === null) {
      try { pageCache = fs.readFileSync(PAGE_FILE, 'utf-8'); } catch (e) { pageCache = ''; }
    }
    return pageCache;
  }

  // 快照：只放手机端「显示」需要的字段。白名单之外的一律不带，
  // 避免把访问码、闹钟、窗口位置等无关信息暴露给同网设备。
  function snapshot() {
    let c = {};
    try { c = getConfig() || {}; } catch (e) { c = {}; }
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const tz = Array.isArray(c.extraTimezones) ? c.extraTimezones.slice(0, 2) : [];
    return {
      now: Date.now(),
      readOnly: true,
      cfg: {
        language: c.language === 'en' ? 'en' : 'zh',
        color: typeof c.color === 'string' ? c.color : '#ffffff',
        bgColor: typeof c.bgColor === 'string' ? c.bgColor : 'rgba(0,0,0,0)',
        fontFamily: typeof c.fontFamily === 'string' ? c.fontFamily : 'Arial',
        infoScale: num(c.infoScale, 0.3),
        hourFormat: c.hourFormat === '12' ? '12' : c.hourFormat === '24' ? '24' : 'auto',
        ampmCorner: typeof c.ampmCorner === 'string' ? c.ampmCorner : 'top-right',
        showSeconds: c.showSeconds !== false,
        showDate: c.showDate !== false,
        showWeekday: c.showWeekday !== false,
        datePosition: c.datePosition === 'above' ? 'above' : 'below',
        autoColor: c.autoColor === true,
        extraTimezones: tz.map(t => ({
          label: String((t && t.label) || ''),
          offset: num(t && t.offset, 0),
        })),
        animType: ['flip', 'scale', 'fade', 'flip-3d', 'none'].indexOf(c.animType) >= 0 ? c.animType : 'flip',
        animFlipDir: c.animFlipDir === 'down' ? 'down' : 'up',
        animScaleDir: c.animScaleDir === 'grow' ? 'grow' : 'shrink',
        animDuration: Math.max(0, Math.min(3000, num(c.animDuration, 350))),
        staggerDelay: Math.max(0, Math.min(3000, num(c.staggerDelay, 0))),
        staggerDirection: c.staggerDirection === 'rtl' ? 'rtl' : 'ltr',
        timeOffsetMs: num(c.timeOffsetMs, 0),
        autoAdjustEnabled: c.autoAdjustEnabled === true,
        autoAdjustIntervalSec: Math.max(5, num(c.autoAdjustIntervalSec, 3600)),
        autoAdjustAmountMs: num(c.autoAdjustAmountMs, 0),
        autoAdjustBaseMs: num(c.autoAdjustBaseMs, 0),
        autoAdjustAnchor: num(c.autoAdjustAnchor, 0),
      },
    };
  }

  function send(req, res, code, type, body, extraHeaders) {
    const headers = {
      'Content-Type': type,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': CSP,
      ...(extraHeaders || {}),
    };
    if (String(req.method || '').toUpperCase() === 'HEAD') {
      res.writeHead(code, headers);
      return res.end();
    }
    res.writeHead(code, { ...headers, 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function notFound(req, res) {
    // 访问码不对 / 路径不存在：一律同样的 404，不区分原因（避免被用来猜路径）
    send(req, res, 404, 'text/plain; charset=utf-8', 'Not Found\n');
  }

  function handler(req, res) {
    state.requests += 1;
    state.lastRequestAt = Date.now();

    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      send(req, res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
      return;
    }

    let pathname = '/';
    try {
      pathname = new URL(String(req.url || '/'), 'http://localhost').pathname;
      pathname = decodeURIComponent(pathname);
    } catch (e) {
      notFound(req, res);
      return;
    }
    if (pathname.indexOf('\\') >= 0) { notFound(req, res); return; }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.some(p => p === '.' || p === '..')) { notFound(req, res); return; }

    // 访问码模式三种走法：
    //   none   → 根路径本身就是页面 /api/state 就是快照
    //   random / fixed → 第一段必须等于访问码，去掉它之后再按同样的规则看剩余路径
    const auth = currentAuth();
    let rest;
    if (auth.mode === 'none') {
      rest = parts;
    } else {
      if (!auth.valid || parts.length === 0 || parts[0] !== auth.code) { notFound(req, res); return; }
      rest = parts.slice(1);
    }

    // []              → 手机端页面
    // ['api']         → 配置快照
    // ['api','state'] → 配置快照
    if (rest.length === 0) {
      const html = pageHtml();
      if (!html) { send(req, res, 500, 'text/plain; charset=utf-8', 'Page Missing\n'); return; }
      send(req, res, 200, 'text/html; charset=utf-8', html);
      return;
    }
    if (rest[0] === 'api' && (rest.length === 1 || (rest.length === 2 && rest[1] === 'state'))) {
      send(req, res, 200, 'application/json; charset=utf-8', JSON.stringify(snapshot()));
      return;
    }
    notFound(req, res);
  }

  function status() {
    const auth = currentAuth();
    const cfg = readCfg();
    const addresses = listLanAddresses();
    // 无码模式地址就是根路径；有码模式必须码合法（fail-closed 时宁可不给地址）
    const base = auth.mode === 'none' ? '/' : (auth.code ? '/' + auth.code + '/' : '');
    const urls = (state.running && state.port && base)
      ? addresses.map(a => ({
        name: a.name,
        ip: a.address,
        url: 'http://' + a.address + ':' + state.port + base,
      }))
      : [];
    return {
      running: state.running,
      port: state.port,
      defaultPort: DEFAULT_PORT,
      token: auth.code,
      authMode: auth.mode,
      // 自定义模式下回显规整后的码（界面用它做输入框回显）；随机/无码模式为空
      fixedCode: sanitizeCode(cfg.lanMirrorFixedCode),
      // 自定义码填了但不合法 → 主进程会退回随机码，界面要明确提示，别让用户以为生效了
      authFallback: auth.mode === 'fixed' && !isToken(sanitizeCode(cfg.lanMirrorFixedCode)),
      error: state.error,
      requests: state.requests,
      lastRequestAt: state.lastRequestAt,
      addresses,
      urls,
      pageAvailable: !!pageHtml(),
    };
  }

  let starting = null; // 串行化 start：连点开关或快速改端口时不会起两个监听

  function tryListen(port, attempt) {
    return new Promise(resolve => {
      const server = http.createServer(handler);
      server.on('error', err => {
        try { server.close(); } catch (e) { /* ignore */ }
        const code = err && err.code;
        if (code === 'EADDRINUSE' && attempt < PORT_TRIES && port < MAX_PORT) {
          resolve(tryListen(port + 1, attempt + 1));
          return;
        }
        state.running = false;
        state.server = null;
        state.port = null;
        state.error = code === 'EADDRINUSE' ? 'port-in-use'
          : code === 'EACCES' ? 'port-denied'
            : (err && err.message) || 'listen-failed';
        resolve(status());
      });
      server.listen(port, '0.0.0.0', () => {
        state.server = server;
        state.running = true;
        state.port = port;
        state.error = null;
        resolve(status());
      });
    });
  }

  function stop() {
    return new Promise(resolve => {
      const server = state.server;
      state.running = false;
      state.server = null;
      state.port = null;
      if (!server) { resolve(status()); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(status()); };
      try { if (typeof server.closeAllConnections === 'function') server.closeAllConnections(); } catch (e) { /* ignore */ }
      try { server.close(finish); } catch (e) { finish(); }
      setTimeout(finish, STOP_TIMEOUT_MS); // 兜底：极端情况下 close 回调不来
    });
  }

  function start(port) {
    const want = clampPort(port);
    const run = () => {
      if (state.running && state.port === want) return Promise.resolve(status());
      return stop().then(() => tryListen(want, 0));
    };
    // 串行化：连点开关或快速改端口时，后一次一定排在前一次之后，不会同时起两个监听
    const prev = starting || Promise.resolve();
    const p = prev.catch(() => {}).then(run);
    starting = p;
    p.catch(() => {}).then(() => { if (starting === p) starting = null; });
    return p;
  }

  function shutdown() {
    return stop();
  }

  return {
    start,
    stop,
    shutdown,
    status,
    snapshot,
    pageHtml,
    listLanAddresses,
  };
}

module.exports = {
  createLanMirror,
  randomToken,
  isGeneratedCode,
  sanitizeCode,
  isToken,
  resolveToken,
  clampPort,
  listLanAddresses,
  normalizeAuthMode,
  AUTH_MODES,
  CODE_MIN,
  CODE_MAX,
  GENERATED_CODE_LEN,
  DEFAULT_PORT,
  CSP,
};
