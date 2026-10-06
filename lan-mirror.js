// lan-mirror.js — [v1.0.5.6] 局域网镜像服务（v1.0.5.7 起支持倒计时写入）
//
// 作用：在本机开一个 http 服务，让同一局域网（同一 Wi-Fi）里的手机用浏览器打开就能看到这块时钟。
//
// 读写边界（v1.0.5.7）：
//   · 读：页面 + 快照，只认 GET / HEAD；
//   · 写：**只有倒计时**。刻意不提供任何修改配置 / 闹钟 / 窗口位置的接口 ——
//     手机端能做的事被压到最小：加一个倒计时、改它、暂停/继续/重来、删掉。
//   · 客户端本身**不落盘、不生成数据**：写请求通过 options.writeCountdown 转给主进程，
//     由主进程的 applyCountdown* 单一写入口校验并写入（与本地 IPC 同一套规则）。
//
// 设计约束：
//   · 只用 Node 内置模块（http / os / crypto），不给项目新增任何依赖；
//   · 监听 0.0.0.0（局域网可访问），端口被占用时自动顺延；
//   · 访问码走 URL 路径（/<code>/），三种模式见 AUTH_MODES：
//       random = 6 位无歧义短码（好念好手输）；fixed = 用户自定义；none = 直接开根路径；
//   · 页面自包含（内联样式与脚本、零外部资源），断网也打得开；
//   · 快照只暴露「显示所需」的白名单字段，配置里的其它键（含访问码本身）不外泄。
//
// 写接口的四道闸（按「最高安全强度」设计，因为无码模式下网页敞在同网段）：
//   ① Host 校验（DNS rebinding → 403，与读接口同一套）；
//   ② 一次性写令牌 nonce：GET /api/write-nonce 取，写请求必须带 X-DC-Nonce。
//      跨源页面**读不到**响应（无 CORS 头 → opaque response），所以拿不到令牌 ——
//      这是无码模式下的核心防线；
//   ③ Content-Type 必须是 application/json（挡简单表单 / <img> / <form> 这类无预检请求）；
//      Sec-Fetch-Site 若存在必须是 same-origin；Origin 若存在必须与本机来源一致（纵深防御）；
//   ④ 字段白名单 + 严格校验 + 请求体 ≤4KB + 每 IP 每秒 5 次写入限流。
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
// 页面里等待被替换的版本占位符（与 lan-mirror-page.html 的 PAGE_BUILD 必须逐字一致）
const PAGE_BUILD_TOKEN = '__DC_PAGE_BUILD__';
const STOP_TIMEOUT_MS = 800;

// ====== 写接口的硬限制（v1.0.5.7）======
const MAX_BODY_BYTES = 4 * 1024;          // 写请求体上限：倒计时 payload 只有几百字节
const WRITE_RATE_WINDOW_MS = 1000;
const WRITE_RATE_MAX = 5;                 // 每 IP 每秒最多 5 次写
const NONCE_TTL_MS = 5 * 60 * 1000;       // 写令牌有效期
const NONCE_MAX = 256;                    // 令牌表上限（正常远达不到，纯兜底）
const READ_METHODS = ['GET', 'HEAD'];
const WRITE_METHODS = ['POST', 'PATCH', 'DELETE'];
const ALL_METHODS = READ_METHODS.concat(WRITE_METHODS);
// 倒计时的动作（放在 /api/countdowns/<id>/<action>）
const COUNTDOWN_ACTIONS = ['pause', 'resume', 'restart', 'cancel'];
const COUNTDOWN_PATH = 'countdowns';

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
// options.getCountdowns: () => ({ items, now })  倒计时列表（只读，主进程现算）
// options.writeCountdown: (action, payload) => ({ ok, error, value })  倒计时写入口
//   —— 服务模块自己不落盘：校验与写入都在主进程（单一写入口），这里只做转发 + 门禁。
function createLanMirror(options) {
  const opts = options || {};
  const getConfig = typeof opts.getConfig === 'function' ? opts.getConfig : () => ({});
  const getCountdowns = typeof opts.getCountdowns === 'function' ? opts.getCountdowns : () => ({ items: [] });
  const writeCountdown = typeof opts.writeCountdown === 'function' ? opts.writeCountdown : null;
  // id 形状判定交给主进程（countdown.js 是唯一实现，避免两边正则漂移）；
  // 没传时退回一个宽松的形状检查（真正的权威判定仍在主进程的记录查找）
  const isCountdownId = typeof opts.isCountdownId === 'function'
    ? opts.isCountdownId
    : (v) => /^cd_[a-z0-9_]{3,40}$/.test(String(v || ''));

  let pageCache = null;
  let pageCacheKey = ''; // [v1.0.5.7] 页面缓存的失效键（mtime+size）
  const state = {
    running: false,
    port: null,
    server: null,
    error: null,
    requests: 0,
    lastRequestAt: 0,
    writes: 0,        // 累计成功的写请求（仅用于状态展示/排错）
    lastWriteAt: 0,
  };

  // 一次性写令牌：跨源页面读不到响应 → 拿不到令牌 → 发不出合法的写请求
  const nonces = new Map(); // nonce -> expiresAt
  // 每 IP 令牌桶（窗口内计数），防止误点/脚本狂刷
  const rateBuckets = new Map(); // ip -> { count, resetAt }

  function pruneNonces(now) {
    nonces.forEach((exp, key) => { if (exp <= now) nonces.delete(key); });
  }
  function issueNonce(now) {
    pruneNonces(now);
    if (nonces.size >= NONCE_MAX) nonces.clear(); // 兜底：正常流量永远到不了
    const n = crypto.randomBytes(18).toString('base64url');
    nonces.set(n, now + NONCE_TTL_MS);
    return n;
  }
  // 一次性：校验通过即焚（用过就作废，重放无效）
  function consumeNonce(value, now) {
    const key = typeof value === 'string' ? value : '';
    if (!key) return false;
    const exp = nonces.get(key);
    if (exp === undefined) return false;
    nonces.delete(key);
    return exp > now;
  }
  function rateLimited(ip, now) {
    let b = rateBuckets.get(ip);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + WRITE_RATE_WINDOW_MS };
      rateBuckets.set(ip, b);
      // 顺手清理过期桶，避免长时间运行后无界增长
      if (rateBuckets.size > 128) {
        rateBuckets.forEach((v, k) => { if (now >= v.resetAt) rateBuckets.delete(k); });
      }
    }
    b.count += 1;
    return b.count > WRITE_RATE_MAX;
  }

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

  // 页面文件的版本标识（mtime+size）。既当缓存失效键，也当「页面自愈」的版本号：
  // 发出去的 HTML 里填一份、/api/state 里带一份，页面自己比对，不一致就自动重载。
  // ⚠️ 必须独立于 pageHtml()：即使从没人打开过页面（pageCacheKey 还是空），快照里的值也要准。
  function pageVersionKey() {
    try {
      const st = fs.statSync(PAGE_FILE);
      return st.mtimeMs + ':' + st.size;
    } catch (e) {
      return pageCacheKey || ''; // 读不到就沿用它，别给页面一个空值把它逼进重载循环
    }
  }

  function pageHtml() {
    // [v1.0.5.7] 页面文件按 mtime+size 失效。
    // 原来把整份 HTML 缓存在内存里且**永不失效** —— 改完页面不重启 app，手机端就永远
    // 拿到旧版（实测踩过：改了胶囊显隐逻辑，真机上一直没生效，被误判成「功能有 bug」）。
    // 页面文件只在「有人打开这个页面」时才读，按 mtime 判定足够便宜。
    // 读不到 stat（文件被删/权限）时沿用上次成功的副本，读不到就返回空串（路由会 500）。
    const key = pageVersionKey();
    if (pageCache === null || key !== pageCacheKey) {
      let raw;
      try { raw = fs.readFileSync(PAGE_FILE, 'utf-8'); }
      catch (e) { return pageCache === null ? '' : pageCache; }
      // 把页面内嵌的版本占位符替换成本次发出的真实版本（见页面里的 PAGE_BUILD）
      pageCache = key ? raw.split(PAGE_BUILD_TOKEN).join(key) : raw;
      pageCacheKey = key;
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
      // [v1.0.5.7] 手机页版本自愈：页面拿它跟自己内嵌的 PAGE_BUILD 比，不一致就自动重载
      // （页面文件改了却没重启 app / 手机拿的是旧页面时，这条能自己纠正）
      build: pageVersionKey(),
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
        // [v1.0.5.7] 数字动画节奏（'default' = 各动画各自的原有曲线）
        animEase: ['default', 'linear', 'ease-in', 'ease-out', 'ease-in-out'].indexOf(c.animEase) >= 0 ? c.animEase : 'default',
        staggerDelay: Math.max(0, Math.min(3000, num(c.staggerDelay, 0))),
        staggerDirection: c.staggerDirection === 'rtl' ? 'rtl' : 'ltr',
        timeOffsetMs: num(c.timeOffsetMs, 0),
        autoAdjustEnabled: c.autoAdjustEnabled === true,
        autoAdjustIntervalSec: Math.max(5, num(c.autoAdjustIntervalSec, 3600)),
        autoAdjustAmountMs: num(c.autoAdjustAmountMs, 0),
        autoAdjustBaseMs: num(c.autoAdjustBaseMs, 0),
        autoAdjustAnchor: num(c.autoAdjustAnchor, 0),
        // 手机端「新建倒计时」的默认时长（沿用桌面偏好；不敏感，可外发）
        countdownDefaultMinutes: Math.max(1, Math.min(1440, num(c.countdownDefaultMinutes, 5))),
      },
      // [v1.0.5.7] 倒计时：手机端能看，也能加/改/控制 —— 写接口只开放这一块，
      // 配置 / 闹钟 / 窗口位置永远改不了（所以 readOnly 仍然为 true）
      countdownCanEdit: !!writeCountdown,
      countdowns: countdownList(),
    };
  }

  // 倒计时列表：字段来自主进程的 toPublic 白名单（id/name/durationMs/remainingMs/state/endAt），
  // 这里再兜一层形状，避免主进程回调异常时把坏数据塞给手机端
  function countdownList() {
    let raw = null;
    try { raw = getCountdowns(); } catch (e) { raw = null; }
    const items = raw && Array.isArray(raw.items) ? raw.items : [];
    return items.map(it => {
      if (!it || typeof it !== 'object') return null;
      const state = it.state === 'paused' ? 'paused' : 'running';
      return {
        id: String(it.id || ''),
        name: String(it.name || '').slice(0, 40),
        durationMs: Math.max(0, Number(it.durationMs) || 0),
        remainingMs: Math.max(0, Number(it.remainingMs) || 0),
        state: state,
        endAt: state === 'paused' ? null : (typeof it.endAt === 'string' ? it.endAt : null),
      };
    }).filter(x => x && x.id);
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
      res.writeHead(code, { ...headers, 'Content-Length': Buffer.byteLength(body) });
      return res.end();
    }
    res.writeHead(code, { ...headers, 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function notFound(req, res) {
    // 访问码不对 / 路径不存在：一律同样的 404，不区分原因（避免被用来猜路径）
    send(req, res, 404, 'text/plain; charset=utf-8', 'Not Found\n');
  }

  function sendJson(req, res, code, obj) {
    send(req, res, code, 'application/json; charset=utf-8', JSON.stringify(obj));
  }

  function methodNotAllowed(req, res, allowed) {
    send(req, res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed\n', { Allow: allowed.join(', ') });
  }

  function clientIp(req) {
    try { return String((req.socket && req.socket.remoteAddress) || 'unknown'); } catch (e) { return 'unknown'; }
  }

  // 读请求体（带上限）。超限回 413 并掐断连接（不陪攻击者把带宽耗完）。
  function readBody(req, res, cb) {
    let size = 0, done = false;
    const chunks = [];
    const finish = (err, text) => {
      if (done) return;
      done = true;
      cb(err, text);
    };
    req.on('data', c => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        send(req, res, 413, 'text/plain; charset=utf-8', 'Payload Too Large\n', { Connection: 'close' });
        res.on('finish', () => { try { req.destroy(); } catch (e) { /* ignore */ } });
        finish('too-large');
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => finish(null, Buffer.concat(chunks).toString('utf-8')));
    req.on('error', () => finish('read-error'));
  }

  // 写请求的门禁。返回 null = 放行；否则返回要发回去的错误。
  // 说明：nonce 是核心防线（跨源页面读不到它的响应，所以伪造不出合法写请求）；
  // Sec-Fetch-Site / Origin 是纵深防御 —— 老浏览器可能不发这两个头，此时由 nonce 兜底，
  // 所以这里「存在才校验」，而不是「缺失即拒绝」，免得个别机型整个功能用不了。
  function writeGate(req) {
    const ctype = String((req.headers && req.headers['content-type']) || '').toLowerCase();
    if (ctype.indexOf('application/json') !== 0) {
      return { code: 415, msg: 'Unsupported Media Type' };
    }
    const sfs = req.headers && req.headers['sec-fetch-site'];
    if (sfs !== undefined && sfs !== '' && String(sfs).toLowerCase() !== 'same-origin') {
      return { code: 403, msg: 'Forbidden' };
    }
    const origin = String((req.headers && req.headers.origin) || '');
    if (origin) {
      const host = String((req.headers && req.headers.host) || '');
      if (!host || origin.replace(/\/+$/, '').toLowerCase() !== ('http://' + host).toLowerCase()) {
        return { code: 403, msg: 'Forbidden' };
      }
    }
    if (!consumeNonce(String((req.headers && req.headers['x-dc-nonce']) || ''), Date.now())) {
      return { code: 403, msg: 'Forbidden', headers: { 'X-DC-Reason': 'nonce' } };
    }
    return null;
  }

  // [v1.0.5.7] Host 校验：只服务「指向本机地址」的请求。none 模式没有访问码，
  // 不校验 Host 的话，DNS rebinding（把攻击者域名解析到本机 IP）可以让任意网页
  // 以同源身份读到 /api/state 快照。手机正常访问时的 Host 就是本机内网 IP / localhost。
  let hostAllowCache = { at: 0, set: null };
  function allowedHosts() {
    const now = Date.now();
    if (!hostAllowCache.set || now - hostAllowCache.at > 30000) {
      const set = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      try { set.add(String(os.hostname() || '').toLowerCase()); } catch (e) {}
      try {
        const ifaces = os.networkInterfaces() || {};
        Object.keys(ifaces).forEach(name => (ifaces[name] || []).forEach(info => {
          if (info && info.address) set.add(String(info.address).toLowerCase());
        }));
      } catch (e) {}
      hostAllowCache = { at: now, set };
    }
    return hostAllowCache.set;
  }
  function hostAllowed(req) {
    const raw = String((req.headers && req.headers.host) || '');
    if (!raw) return false;
    let host = raw.toLowerCase();
    const bracket = host.match(/^(\[[^\]]+\])(:\d+)?$/); // [::1]:8788
    if (bracket) host = bracket[1];
    else {
      const i = host.lastIndexOf(':');
      if (i >= 0 && host.indexOf(']') < 0) host = host.slice(0, i); // 1.2.3.4:8788
    }
    return allowedHosts().has(host);
  }

  function handler(req, res) {
    state.requests += 1;
    state.lastRequestAt = Date.now();

    if (!hostAllowed(req)) {
      send(req, res, 403, 'text/plain; charset=utf-8', 'Forbidden\n');
      return;
    }

    const method = String(req.method || 'GET').toUpperCase();
    if (ALL_METHODS.indexOf(method) < 0) {
      methodNotAllowed(req, res, ALL_METHODS);
      return;
    }
    const isRead = READ_METHODS.indexOf(method) >= 0;

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

    // []              → 手机端页面（只读）
    // ['api']         → 配置快照（只读）
    // ['api','state'] → 配置快照（只读）
    if (rest.length === 0) {
      if (!isRead) { methodNotAllowed(req, res, READ_METHODS); return; }
      const html = pageHtml();
      if (!html) { send(req, res, 500, 'text/plain; charset=utf-8', 'Page Missing\n'); return; }
      send(req, res, 200, 'text/html; charset=utf-8', html);
      return;
    }
    if (rest[0] === 'api' && (rest.length === 1 || (rest.length === 2 && rest[1] === 'state'))) {
      if (!isRead) { methodNotAllowed(req, res, READ_METHODS); return; }
      sendJson(req, res, 200, snapshot());
      return;
    }
    // ['api','write-nonce'] → 领一次性写令牌（本身只读动词，且跨源读不到响应）
    if (rest[0] === 'api' && rest.length === 2 && rest[1] === 'write-nonce') {
      if (!isRead) { methodNotAllowed(req, res, READ_METHODS); return; }
      sendJson(req, res, 200, { nonce: issueNonce(Date.now()), ttlMs: NONCE_TTL_MS });
      return;
    }
    // 倒计时：唯一开放的写入口
    if (rest[0] === 'api' && rest[1] === COUNTDOWN_PATH) {
      handleCountdownRoute(req, res, method, isRead, rest);
      return;
    }
    notFound(req, res);
  }

  // /api/countdowns            GET 列表 | POST 新建
  // /api/countdowns/<id>       PATCH 修改 | DELETE 删除
  // /api/countdowns/<id>/<act> POST 控制（pause / resume / restart / cancel）
  function handleCountdownRoute(req, res, method, isRead, rest) {
    if (rest.length > 4) { notFound(req, res); return; }
    const id = rest[2] || '';
    const action = rest[3] || '';
    // id / action 形状不对 → 一律 404（不提示哪里错，避免被用来探路）。
    // 这里是形状判断，真正的权威判定在主进程（记录不存在 → not-found）。
    if (rest.length >= 3 && !isCountdownId(id)) { notFound(req, res); return; }
    if (rest.length === 4 && COUNTDOWN_ACTIONS.indexOf(action) < 0) { notFound(req, res); return; }

    // ---- 只读：列表 ----
    if (rest.length === 2) {
      if (isRead) {
        sendJson(req, res, 200, { items: countdownList(), canEdit: !!writeCountdown });
        return;
      }
      if (method !== 'POST') { methodNotAllowed(req, res, ['GET', 'HEAD', 'POST']); return; }
      if (!guardWrite(req, res)) return;
      readBody(req, res, (err, text) => {
        if (err) return; // 413/400 已在回调里发过
        const parsed = parseJsonObject(text);
        if (!parsed) { sendJson(req, res, 400, { ok: false, error: 'bad-json' }); return; }
        writeResult(req, res, forwardWrite('create', parsed));
      });
      return;
    }

    // ---- 以下都是写 ----
    if (isRead) { methodNotAllowed(req, res, rest.length === 3 ? ['PATCH', 'DELETE'] : ['POST']); return; }
    if (!guardWrite(req, res)) return;

    if (rest.length === 3) {
      if (method === 'DELETE') { writeResult(req, res, forwardWrite('delete', { id })); return; }
      if (method !== 'PATCH') { methodNotAllowed(req, res, ['PATCH', 'DELETE']); return; }
      readBody(req, res, (err, text) => {
        if (err) return;
        const parsed = parseJsonObject(text);
        if (!parsed) { sendJson(req, res, 400, { ok: false, error: 'bad-json' }); return; }
        parsed.id = id; // 路径上的 id 为权威，忽略 body 里可能夹带的 id
        writeResult(req, res, forwardWrite('update', parsed));
      });
      return;
    }

    if (method !== 'POST') { methodNotAllowed(req, res, ['POST']); return; }
    // cancel = 删除（语义等价，手机端按钮叫「取消」）
    const act = action === 'cancel' ? 'delete' : action;
    writeResult(req, res, forwardWrite(act, { id }));
  }

  // 写请求的公共门禁（令牌 + 限流）。已发响应则返回 false。
  function guardWrite(req, res) {
    if (!writeCountdown) {
      send(req, res, 403, 'text/plain; charset=utf-8', 'Forbidden\n');
      return false;
    }
    const gate = writeGate(req);
    if (gate) {
      send(req, res, gate.code, 'text/plain; charset=utf-8', gate.msg + '\n', gate.headers);
      return false;
    }
    if (rateLimited(clientIp(req), Date.now())) {
      send(req, res, 429, 'text/plain; charset=utf-8', 'Too Many Requests\n', { 'Retry-After': '1' });
      return false;
    }
    return true;
  }

  function parseJsonObject(text) {
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  }

  function forwardWrite(action, payload) {
    try { return writeCountdown(action, payload) || { ok: false, error: 'failed' }; }
    catch (e) { return { ok: false, error: (e && e.message) || 'failed' }; }
  }

  function writeResult(req, res, r) {
    if (r && r.ok) {
      state.writes += 1;
      state.lastWriteAt = Date.now();
      // 顺手把最新列表带回去：手机端不用再多打一次往返
      sendJson(req, res, 200, { ok: true, value: r.value === undefined ? null : r.value, items: countdownList() });
      return;
    }
    const err = (r && r.error) || 'failed';
    const code = err === 'not-found' ? 404 : err === 'too-many' ? 409 : 400;
    sendJson(req, res, code, { ok: false, error: err });
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
      // [v1.0.5.7] 手机端可写倒计时（设置界面据此提示"手机可以加倒计时"）
      countdownCanEdit: !!writeCountdown,
      writes: state.writes,
      lastWriteAt: state.lastWriteAt,
      addresses,
      urls,
      pageAvailable: !!pageHtml(),
    };
  }

  let starting = null; // 串行化 start/stop：连点开关或快速改端口时不会起两个监听

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

  // stop 的裸实现（不走队列）：只给 start 的串行链内部用
  function stopNow() {
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

  // [v1.0.5.7] start / stop / shutdown 全部排进同一条串行链。
  // 原来 stop 不进链：start 还在 listen 回调窗口里时到达的 stop 会「扑空」
  // （state.server 还没赋值，等于什么都没停），随后回调把服务复活 ——
  // 实测复现为「配置 enabled=false 但端口仍在服务」。
  function enqueue(op) {
    const prev = starting || Promise.resolve();
    const p = prev.catch(() => {}).then(op);
    starting = p;
    p.catch(() => {}).then(() => { if (starting === p) starting = null; });
    return p;
  }

  function stop() {
    return enqueue(() => stopNow());
  }

  function start(port) {
    const want = clampPort(port);
    return enqueue(() => {
      if (state.running && state.port === want) return status();
      return stopNow().then(() => tryListen(want, 0));
    });
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
  // [v1.0.5.7] 写接口的硬限制（单测要断言这些数字）
  MAX_BODY_BYTES,
  WRITE_RATE_MAX,
  WRITE_RATE_WINDOW_MS,
  NONCE_TTL_MS,
  READ_METHODS,
  WRITE_METHODS,
  ALL_METHODS,
  COUNTDOWN_ACTIONS,
};
