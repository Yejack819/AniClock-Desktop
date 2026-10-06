// docs/tests/lan-mirror.test.js — [v1.0.5.7] 局域网镜像服务自测
//
// 不依赖 Electron / 不依赖网络环境，直接用 node 跑：
//   node docs/tests/lan-mirror.test.js
// 覆盖：访问码路由、只读约束（页面/快照仅 GET·HEAD）、404/405 兜底、目录穿越、
//       端口占用顺延、启停幂等、快照白名单（不外泄访问码与无关配置）、页面自包含；
//       [v1.0.5.7] 再加倒计时的写接口 —— 它不是「打开只读约束」，而是新增的一条
//       专用写路由（/api/countdowns），配置 / 闹钟 / 窗口位置依旧只读。
//       四道闸全部覆盖：Host 校验 · 一次性令牌 · Content-Type+Sec-Fetch-Site+Origin · 限流。

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const M = require(path.join(__dirname, '..', '..', 'lan-mirror.js'));

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; return true; }
  fail++;
  failures.push(name + (extra === undefined ? '' : '  →  ' + extra));
  return false;
}
function eq(name, actual, expected) {
  return ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}

// [v1.0.5.6] 访问码改成 6 位短码（原来是 32 位十六进制）：
// 短码能口头念、能手输，扫码失败也有退路；页面是只读的，短码的熵足够。
const TOKEN = 'k7m2p9';

function baseConfig(over) {
  return Object.assign({
    language: 'zh',
    color: '#123456',
    bgColor: 'rgba(0,0,0,0.35)',
    fontFamily: 'Arial',
    infoScale: 0.3,
    hourFormat: '24',
    ampmCorner: 'top-right',
    showSeconds: true,
    showDate: true,
    showWeekday: true,
    datePosition: 'below',
    autoColor: false,
    extraTimezones: [{ label: 'NYC', offset: -5 }, { label: 'LDN', offset: 0 }, { label: 'TOK', offset: 9 }],
    animType: 'flip',
    animFlipDir: 'up',
    animScaleDir: 'shrink',
    animDuration: 350,
    timeOffsetMs: 0,
    autoAdjustEnabled: false,
    autoAdjustIntervalSec: 3600,
    autoAdjustAmountMs: 0,
    autoAdjustBaseMs: 0,
    autoAdjustAnchor: 0,
    lanMirrorEnabled: true,
    lanMirrorPort: 8788,
    lanMirrorAuthMode: 'random',
    lanMirrorFixedCode: '',
    lanMirrorToken: TOKEN,
    __secret: 'do-not-leak',
    x: 111, y: 222, winW: 800, winH: 400,
  }, over || {});
}

// 借一个空闲端口：监听 0 拿系统分配的端口号后立刻释放
function freePort() {
  return new Promise(resolve => {
    const s = http.createServer(() => {});
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
function occupy(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((_req, res) => res.end('busy'));
    s.on('error', reject);
    s.listen(port, '0.0.0.0', () => resolve(s));
  });
}
function get(url, init) {
  return fetch(url, init);
}
// [v1.0.5.7] fetch（undici）不允许覆盖 Host 头，Host 校验测试用原生 http 发请求
function rawGet(port, reqPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: reqPath, method: 'GET', headers: headers || {} },
      res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // ====== 纯函数：随机短码 ======
  const t1 = M.randomToken(), t2 = M.randomToken();
  ok('randomToken: 6 位', t1.length === 6, t1);
  ok('randomToken: 只用无歧义字符（无 i l o 0 1）', /^[a-hj-km-np-z2-9]{6}$/.test(t1), t1);
  ok('randomToken: 不含易混字符', !/[ilo01]/.test(t1), t1);
  ok('randomToken: 两次不同', t1 !== t2);
  const set = new Set();
  for (let i = 0; i < 200; i++) set.add(M.randomToken());
  eq('randomToken: 200 次无碰撞', set.size, 200);
  // 31 个字符均出现（拒绝采样不应把某些字符饿死）：样本放大到 6000 个字符
  const seen = new Set();
  for (let i = 0; i < 1000; i++) M.randomToken().split('').forEach(ch => seen.add(ch));
  eq('randomToken: 字母表全覆盖', seen.size, 31);
  ok('randomToken: 生成的码都是合法访问码', M.isToken(t1) && M.isToken(t2));

  ok('isGeneratedCode: 随机码命中', M.isGeneratedCode(t1) === true);
  ok('isGeneratedCode: 旧 32 位码不算随机码', M.isGeneratedCode('a'.repeat(32)) === false);

  // ====== 纯函数：自定义码规整与校验 ======
  eq('sanitizeCode: 去空白转小写', M.sanitizeCode('  My Clock  '), 'my-clock');
  eq('sanitizeCode: 剔非法字符', M.sanitizeCode('ho!me@2026'), 'home2026');
  eq('sanitizeCode: 合并连续 - 并去首尾', M.sanitizeCode('---abc--'), 'abc');
  eq('sanitizeCode: 中文全部剔掉', M.sanitizeCode('客厅时钟'), '');
  eq('sanitizeCode: 截断到 32 位', M.sanitizeCode('x'.repeat(50)).length, 32);
  eq('sanitizeCode: 非字符串安全', M.sanitizeCode(null), '');
  eq('sanitizeCode: 下划线保留', M.sanitizeCode('home_2026'), 'home_2026');

  ok('isToken: 合法短码', M.isToken('k7m2p9') === true);
  ok('isToken: 太短（3 位）', M.isToken('abc') === false);
  ok('isToken: 4 位可接受', M.isToken('abcd') === true);
  ok('isToken: 32 位可接受（自定义上限）', M.isToken('a'.repeat(32)) === true);
  ok('isToken: 33 位超出上限', M.isToken('a'.repeat(33)) === false);
  ok('isToken: 大写不接受', M.isToken('MyClock') === false);
  ok('isToken: 与路由撞名的 api 不接受', M.isToken('api') === false);
  ok('isToken: 带斜杠不接受', M.isToken('a/b') === false);
  ok('isToken: 非字符串', M.isToken(null) === false);

  eq('normalizeAuthMode: 三种模式原样', M.AUTH_MODES.join(','), 'random,fixed,none');
  eq('normalizeAuthMode: 未知值落回 random', M.normalizeAuthMode('bogus'), 'random');
  eq('normalizeAuthMode: undefined 落回 random', M.normalizeAuthMode(undefined), 'random');

  eq('clampPort: 合法值原样', M.clampPort(9000), 9000);
  eq('clampPort: 非法回退默认', M.clampPort('abc'), M.DEFAULT_PORT);
  eq('clampPort: 低于下限抬起', M.clampPort(80), 1024);
  eq('clampPort: 高于上限压下', M.clampPort(70000), 65535);
  eq('clampPort: 小数取整', M.clampPort(9000.6), 9001);

  const addrs = M.listLanAddresses();
  ok('listLanAddresses: 返回数组', Array.isArray(addrs));
  ok('listLanAddresses: 无回环 / 链路本地', addrs.every(a => a.address !== '127.0.0.1' && a.address.indexOf('169.254.') !== 0));
  ok('listLanAddresses: 条目形状', addrs.every(a => typeof a.name === 'string' && typeof a.address === 'string'));

  // ====== 未启动状态 ======
  let cfg = baseConfig();
  const svc = M.createLanMirror({ getConfig: () => cfg });
  let st = svc.status();
  eq('status: 初始未运行', st.running, false);
  eq('status: 初始无端口', st.port, null);
  eq('status: 访问码取自配置', st.token, TOKEN);
  eq('status: 未运行时不给出地址', st.urls.length, 0);
  eq('status: 页面模板可读', st.pageAvailable, true);

  // ====== 启动 ======
  const port = await freePort();
  st = await svc.start(port);
  eq('start: 已运行', st.running, true);
  eq('start: 端口为请求值', st.port, port);
  const base = 'http://127.0.0.1:' + port;

  st = svc.status();
  eq('status: 地址条数与网卡一致', st.urls.length, st.addresses.length);
  ok('status: 地址格式正确', st.urls.every(u => u.url === 'http://' + u.ip + ':' + port + '/' + TOKEN + '/'));

  // ====== 手机端页面 ======
  let res = await get(base + '/' + TOKEN + '/');
  eq('页面: 200', res.status, 200);
  ok('页面: content-type html', /text\/html/.test(res.headers.get('content-type') || ''));
  eq('页面: no-store', /no-store/.test(res.headers.get('cache-control') || ''), true);
  eq('页面: nosniff', res.headers.get('x-content-type-options'), 'nosniff');
  eq('页面: 有 CSP', /default-src 'none'/.test(res.headers.get('content-security-policy') || ''), true);
  const html = await res.text();
  ok('页面: 含时钟容器', html.indexOf('id="digits"') >= 0);
  ok('页面: 含状态栏', html.indexOf('id="status"') >= 0);
  ok('页面: 零外部资源（无外链脚本）', !/<script[^>]+src=/i.test(html), '发现外链 script');
  ok('页面: 零外部资源（无外链样式）', !/<link[^>]+href=/i.test(html), '发现外链 link');
  ok('页面: 不内嵌访问码明文', html.indexOf(TOKEN) < 0);
  // 页面自愈：发出去的 HTML 里版本占位符必须已被替换成真实版本（mtime:size）
  const buildMatch = html.match(/var PAGE_BUILD = '([^']*)'/);
  ok('页面: 版本占位符已被替换', html.indexOf('__DC_PAGE_BUILD__') < 0 && !!buildMatch,
    String(buildMatch && buildMatch[1]));
  ok('页面: 内嵌版本形如 mtime:size', /^\d+(\.\d+)?:\d+$/.test((buildMatch && buildMatch[1]) || ''),
    String(buildMatch && buildMatch[1]));

  res = await get(base + '/' + TOKEN); // 不带结尾斜杠也应可用
  eq('页面: 无尾斜杠也能打开', res.status, 200);

  res = await get(base + '/' + TOKEN + '/', { method: 'HEAD' });
  eq('HEAD: 200', res.status, 200);
  eq('HEAD: 无正文', (await res.text()).length, 0);

  // ====== 页面文件改动必须立刻生效（内存缓存按 mtime 失效）======
  // 这条是真机上踩出来的：原来整份 HTML 缓存在内存里、永不失效 →
  // 改完页面不重启 app，手机端**永远**拿到旧版，被误判成「新功能有 bug」。
  {
    const PAGE_FILE = path.join(__dirname, '..', '..', 'lan-mirror-page.html');
    const orig = fs.readFileSync(PAGE_FILE, 'utf-8');
    const MARK = '<!-- cache-invalidation-probe -->';
    // 服务端会把版本占位符替换成「当前 mtime:size」再发出，所以期望值要按同一规则拼
    const served = (raw) => {
      const st = fs.statSync(PAGE_FILE);
      return raw.split('__DC_PAGE_BUILD__').join(st.mtimeMs + ':' + st.size);
    };
    try {
      fs.writeFileSync(PAGE_FILE, orig + '\n' + MARK + '\n', 'utf-8');
      const r1 = await get(base + '/' + TOKEN + '/');
      const h1 = await r1.text();
      ok('页面: 改动文件后无需重启即生效（不是内存里那份旧的）', h1.indexOf(MARK) >= 0);
      const r2 = await get(base + '/' + TOKEN + '/');
      eq('页面: 紧接着再取一次内容一致（确有缓存，不是每次重读）', await r2.text(), h1);
    } finally {
      fs.writeFileSync(PAGE_FILE, orig, 'utf-8'); // 必须还原，别污染源码
    }
    const h3 = await (await get(base + '/' + TOKEN + '/')).text();
    ok('页面: 还原后立刻回到原内容（缓存跟着再失效一次）',
      h3.indexOf(MARK) < 0 && h3 === served(orig), '长度=' + h3.length);
  }

  // ====== 快照接口 ======
  res = await get(base + '/' + TOKEN + '/api/state');
  eq('快照: 200', res.status, 200);
  ok('快照: JSON 类型', /application\/json/.test(res.headers.get('content-type') || ''));
  const raw = await res.text();
  const snap = JSON.parse(raw);
  ok('快照: 带服务端时间', Math.abs(snap.now - Date.now()) < 5000, snap.now);
  eq('快照: 标注只读', snap.readOnly, true);
  // 页面自愈：快照里的 build 必须与「此刻发出去的页面」内嵌版本一致（否则手机会无限重载）。
  // ⚠️ 不能拿前面的 buildMatch 比 —— 中间那段缓存用例改写过页面文件，mtime 已经变了。
  {
    const pageNow = await (await get(base + '/' + TOKEN + '/')).text();
    const bm = pageNow.match(/var PAGE_BUILD = '([^']*)'/);
    ok('快照: 带页面版本 build', /^\d+(\.\d+)?:\d+$/.test(String(snap.build || '')), String(snap.build));
    eq('快照: build 与页面内嵌版本一致', snap.build, bm && bm[1]);
  }
  eq('快照: color 透传', snap.cfg.color, '#123456');
  eq('快照: hourFormat 透传', snap.cfg.hourFormat, '24');
  eq('快照: 时区截断为 2 条', snap.cfg.extraTimezones.length, 2);
  eq('快照: 时区内容正确', snap.cfg.extraTimezones[0].label, 'NYC');
  ok('快照: 不含访问码', raw.indexOf(TOKEN) < 0);
  ok('快照: 不含无关配置（__secret）', raw.indexOf('do-not-leak') < 0);
  // [v1.0.5.7] 原断言 raw.indexOf('111') 会被 13 位时间戳偶然命中（偶发误报），
  // 改为结构化断言：cfg 里根本没有 x/y 这两个键
  ok('快照: 不含窗口坐标', snap.cfg.x === undefined && snap.cfg.y === undefined && raw.indexOf('"x"') < 0 && raw.indexOf('"y"') < 0);
  ok('快照: 白名单字段齐全',
    ['language', 'color', 'bgColor', 'fontFamily', 'infoScale', 'hourFormat', 'ampmCorner',
      'showSeconds', 'showDate', 'showWeekday', 'datePosition', 'autoColor', 'extraTimezones',
      'animType', 'animFlipDir', 'animScaleDir', 'animDuration', 'staggerDelay', 'staggerDirection',
      'timeOffsetMs', 'autoAdjustEnabled', 'autoAdjustIntervalSec', 'autoAdjustAmountMs',
      'autoAdjustBaseMs', 'autoAdjustAnchor'].every(k => Object.prototype.hasOwnProperty.call(snap.cfg, k)));

  // 非法动画家族被归一化
  cfg = baseConfig({ animType: 'bogus', hourFormat: 'weird', extraTimezones: 'nope' });
  const snap2 = await (await get(base + '/' + TOKEN + '/api/state')).json();
  eq('快照: 非法 animType 归一化', snap2.cfg.animType, 'flip');
  eq('快照: 非法 hourFormat 归一化', snap2.cfg.hourFormat, 'auto');
  eq('快照: 非法 extraTimezones 归一化为空', snap2.cfg.extraTimezones.length, 0);

  // 配置改了，快照立刻跟上（每次请求现读）
  cfg = baseConfig({ color: '#abcdef' });
  const snap3 = await (await get(base + '/' + TOKEN + '/api/state')).json();
  eq('快照: 改配置后实时生效', snap3.cfg.color, '#abcdef');

  res = await get(base + '/' + TOKEN + '/api');
  eq('快照: /api 别名可用', res.status, 200);

  // ====== 只读与兜底 ======
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    res = await get(base + '/' + TOKEN + '/api/state', { method, body: 'x' });
    eq('只读: ' + method + ' → 405', res.status, 405);
    if (method === 'POST') eq('只读: 405 带 Allow', res.headers.get('allow'), 'GET, HEAD');
  }

  res = await get(base + '/');
  eq('访问码: 根路径 404', res.status, 404);
  res = await get(base + '/b'.repeat(32) + '/');
  eq('访问码: 错误访问码 404', res.status, 404);
  res = await get(base + '/' + TOKEN + '/nope');
  eq('路径: 未知子路径 404', res.status, 404);
  res = await get(base + '/' + TOKEN + '/../lan-mirror.js');
  eq('路径: 目录穿越 404', res.status, 404);
  res = await get(base + '/' + TOKEN + '/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
  eq('路径: 编码目录穿越 404', res.status, 404);
  res = await get(base + '/' + TOKEN + '/..%5Cwin.ini');
  eq('路径: 反斜杠穿越 404', res.status, 404);

  // 没有访问码的配置：任何路径都打不开
  const noTok = baseConfig({ lanMirrorToken: '' });
  const svcNoTok = M.createLanMirror({ getConfig: () => noTok });
  const portNoTok = await freePort();
  await svcNoTok.start(portNoTok);
  res = await get('http://127.0.0.1:' + portNoTok + '/');
  eq('无访问码: 404', res.status, 404);
  res = await get('http://127.0.0.1:' + portNoTok + '/api/state');
  eq('无访问码: 快照也 404', res.status, 404);
  await svcNoTok.stop();

  // ====== 访问码轮换 ======
  const NEW_TOKEN = 'c'.repeat(32);
  cfg = baseConfig({ lanMirrorToken: NEW_TOKEN });
  res = await get(base + '/' + NEW_TOKEN + '/');
  eq('换码: 新码可用', res.status, 200);
  res = await get(base + '/' + TOKEN + '/');
  eq('换码: 旧码失效', res.status, 404);

  // ====== 端口占用顺延 ======
  cfg = baseConfig({ lanMirrorToken: TOKEN });
  const busyPort = await freePort();
  const blocker = await occupy(busyPort);
  const svcBusy = M.createLanMirror({ getConfig: () => baseConfig() });
  const stBusy = await svcBusy.start(busyPort);
  eq('端口占用: 服务仍在跑', stBusy.running, true);
  eq('端口占用: 顺延到下一个', stBusy.port, busyPort + 1);
  const busyHtml = await (await get('http://127.0.0.1:' + stBusy.port + '/' + TOKEN + '/')).text();
  ok('端口占用: 顺延后页面可访问', busyHtml.indexOf('id="digits"') >= 0);
  await svcBusy.stop();
  await new Promise(r => blocker.close(r));

  // ====== 启停幂等 ======
  const stAgain = await svc.start(port);
  eq('幂等: 重复 start 同端口', stAgain.port, port);
  eq('幂等: 仍只跑一个实例', stAgain.running, true);
  res = await get(base + '/' + TOKEN + '/');
  eq('幂等: 服务仍在响应', res.status, 200);

  const stStopped = await svc.stop();
  eq('stop: 已停止', stStopped.running, false);
  eq('stop: 端口清空', stStopped.port, null);
  let died = false;
  try { await get(base + '/' + TOKEN + '/'); } catch (e) { died = true; }
  ok('stop: 端口已释放（连接被拒）', died);
  const stStopped2 = await svc.stop();
  eq('stop: 重复调用安全', stStopped2.running, false);

  // ====== [v1.0.5.6] 访问方式三选一 ======
  // 服务侧只「读」配置：lanMirrorToken 由主进程（ensureLanToken）独占写入。
  // 因此这里分别模拟三种模式落盘后的样子，验证路由与状态。

  // -- 1) none：不需要访问码，页面就在根路径 --
  cfg = baseConfig({ lanMirrorAuthMode: 'none', lanMirrorFixedCode: '', lanMirrorToken: '' });
  const portNone = await freePort();
  const svcNone = M.createLanMirror({ getConfig: () => cfg });
  await svcNone.start(portNone);
  const baseNone = 'http://127.0.0.1:' + portNone;
  eq('无码: 根路径页面 200', (await get(baseNone + '/')).status, 200);
  eq('无码: /api/state 200', (await get(baseNone + '/api/state')).status, 200);
  eq('无码: /api 也能取快照', (await get(baseNone + '/api')).status, 200);
  const noneHtml = await (await get(baseNone + '/')).text();
  ok('无码: 页面内容正常', noneHtml.indexOf('id="digits"') >= 0);
  eq('无码: 未知路径 404', (await get(baseNone + '/foo')).status, 404);
  eq('无码: 旧的访问码路径 404', (await get(baseNone + '/' + TOKEN + '/')).status, 404);
  eq('无码: 目录穿越 404', (await get(baseNone + '/../lan-mirror.js')).status, 404);
  st = svcNone.status();
  eq('无码: status.authMode', st.authMode, 'none');
  eq('无码: status.token 为空', st.token, '');
  eq('无码: authFallback 关闭', st.authFallback, false);
  ok('无码: 地址为根路径', st.urls.every(u => u.url === 'http://' + u.ip + ':' + portNone + '/'));
  eq('无码: POST 仍 405', (await get(baseNone + '/', { method: 'POST', body: 'x' })).status, 405);
  await svcNone.stop();

  // -- 2) fixed：自定义码，走 /<code>/ --
  const FIXED = 'my-clock';
  cfg = baseConfig({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: FIXED, lanMirrorToken: FIXED });
  const portFixed = await freePort();
  const svcFixed = M.createLanMirror({ getConfig: () => cfg });
  await svcFixed.start(portFixed);
  const baseFixed = 'http://127.0.0.1:' + portFixed;
  eq('自定义: 该码页面 200', (await get(baseFixed + '/' + FIXED + '/')).status, 200);
  eq('自定义: 无尾斜杠也 200', (await get(baseFixed + '/' + FIXED)).status, 200);
  eq('自定义: 该码快照 200', (await get(baseFixed + '/' + FIXED + '/api/state')).status, 200);
  eq('自定义: 写错的码 404', (await get(baseFixed + '/myclock/')).status, 404);
  eq('自定义: 根路径 404', (await get(baseFixed + '/')).status, 404);
  eq('自定义: 旧随机码 404', (await get(baseFixed + '/' + TOKEN + '/')).status, 404);
  st = svcFixed.status();
  eq('自定义: status.authMode', st.authMode, 'fixed');
  eq('自定义: status.fixedCode 回显', st.fixedCode, FIXED);
  eq('自定义: authFallback 关闭', st.authFallback, false);
  ok('自定义: 地址用自定义码', st.urls.every(u => u.url === 'http://' + u.ip + ':' + portFixed + '/' + FIXED + '/'));
  await svcFixed.stop();

  // -- 3) fail-closed：码读不到/非法时什么都不服务（绝不退回「无码敞开」）--
  cfg = baseConfig({ lanMirrorAuthMode: 'random', lanMirrorToken: '' });
  const portFail = await freePort();
  const svcFail = M.createLanMirror({ getConfig: () => cfg });
  await svcFail.start(portFail);
  const baseFail = 'http://127.0.0.1:' + portFail;
  eq('fail-closed: 空码时根路径 404', (await get(baseFail + '/')).status, 404);
  eq('fail-closed: 空码时快照 404', (await get(baseFail + '/api/state')).status, 404);
  eq('fail-closed: 空码时无地址可给', svcFail.status().urls.length, 0);
  await svcFail.stop();

  // -- 4) 自定义码不合法：主进程会退回随机码，状态用 authFallback 标记 --
  cfg = baseConfig({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: 'api', lanMirrorToken: TOKEN });
  const portBad = await freePort();
  const svcBad = M.createLanMirror({ getConfig: () => cfg });
  await svcBad.start(portBad);
  st = svcBad.status();
  eq('非法自定义码: authFallback 打开', st.authFallback, true);
  eq('非法自定义码: 实际仍用随机码', st.token, TOKEN);
  eq('非法自定义码: 自定义码仍原样回显（供界面红字提示）', st.fixedCode, 'api');
  ok('非法自定义码: 地址按随机码给', st.urls.every(u => u.url.indexOf('/' + TOKEN + '/') > 0));
  eq('非法自定义码: 随机码可访问', (await get('http://127.0.0.1:' + portBad + '/' + TOKEN + '/')).status, 200);
  await svcBad.stop();

  // -- 5) 存量配置迁移：旧的 32 位码仍是合法路径段，但不再被认为是「随机码」--
  //    （主进程 ensureLanToken 会把它换成 6 位新码，这里只验证判定口径一致）
  ok('迁移: 旧 32 位码 isToken 仍为真', M.isToken('ed22e042532de2c0df41953d0adfedfb') === true);
  ok('迁移: 但 isGeneratedCode 为假 → 会被换成新短码', M.isGeneratedCode('ed22e042532de2c0df41953d0adfedfb') === false);

  // ====== resolveToken：主进程写入 lanMirrorToken 前走的就是它 ======
  // random：沿用已是新格式的短码
  let r = M.resolveToken({ lanMirrorAuthMode: 'random', lanMirrorToken: 'k7m2p9' });
  eq('resolveToken/random: 沿用现有短码', r.token, 'k7m2p9');
  eq('resolveToken/random: 不标 fallback', r.authFallback, false);
  // random：没有码就生成
  r = M.resolveToken({ lanMirrorAuthMode: 'random', lanMirrorToken: '' });
  ok('resolveToken/random: 无码时生成新短码', M.isGeneratedCode(r.token), r.token);
  // random：旧的 32 位码自动换成新短码
  r = M.resolveToken({ lanMirrorAuthMode: 'random', lanMirrorToken: 'a'.repeat(32) });
  ok('resolveToken/random: 旧 32 位码迁移为新短码', M.isGeneratedCode(r.token), r.token);
  // 缺省（老配置没有 authMode 字段）→ 当作 random
  r = M.resolveToken({ lanMirrorToken: 'k7m2p9' });
  eq('resolveToken: 缺省 authMode 视为 random', r.token, 'k7m2p9');
  // none：一定是空串，且不再需要生成码
  r = M.resolveToken({ lanMirrorAuthMode: 'none', lanMirrorToken: 'k7m2p9' });
  eq('resolveToken/none: 生效路径段为空', r.token, '');
  eq('resolveToken/none: 不标 fallback', r.authFallback, false);
  // fixed：合法自定义码直接用
  r = M.resolveToken({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: 'My Clock', lanMirrorToken: 'k7m2p9' });
  eq('resolveToken/fixed: 规整后生效', r.token, 'my-clock');
  eq('resolveToken/fixed: 不标 fallback', r.authFallback, false);
  // fixed + 不合法码 → 退回已有随机码，并标 fallback（绝不能变成无码）
  r = M.resolveToken({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: '客厅', lanMirrorToken: 'k7m2p9' });
  eq('resolveToken/fixed 非法: 退回现有随机码', r.token, 'k7m2p9');
  eq('resolveToken/fixed 非法: 标 fallback', r.authFallback, true);
  ok('resolveToken/fixed 非法: 绝不返回空串', r.token !== '');
  // fixed + 不合法码 + 没有随机码 → 生成一个，也不返回空串
  r = M.resolveToken({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: '', lanMirrorToken: '' });
  ok('resolveToken/fixed 非法且无存量码: 生成随机码', M.isGeneratedCode(r.token), r.token);
  eq('resolveToken/fixed 非法且无存量码: 标 fallback', r.authFallback, true);
  // fixed + 码太长 → 截断后合法
  r = M.resolveToken({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: 'x'.repeat(40), lanMirrorToken: '' });
  eq('resolveToken/fixed: 超长码截断到 32', r.token, 'x'.repeat(32));
  // fixed + 保留字 api → 非法，退回随机
  r = M.resolveToken({ lanMirrorAuthMode: 'fixed', lanMirrorFixedCode: 'api', lanMirrorToken: 'k7m2p9' });
  eq('resolveToken/fixed=api: 退回随机码', r.token, 'k7m2p9');
  eq('resolveToken/fixed=api: 标 fallback', r.authFallback, true);

  // -- 6) 手机页的接口路径拼装：无码模式下页面就在根路径，
  //    必须拼成 /api/state 而不是 //api/state（双斜杠会被浏览器当成协议相对 URL，
  //    主机名变成 api → 请求直接跑飞）。这是改造无码模式时踩到的真 bug，锁住它。
  const pageHtmlSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'lan-mirror-page.html'), 'utf-8');
  const tailMatch = pageHtmlSrc.match(/var API_TAIL = '([^']+)'/);
  const fnMatch = pageHtmlSrc.match(/function tokenPath\(\)\s*\{([\s\S]*?)\n  \}/);
  ok('手机页: 能取到 API_TAIL 与 tokenPath', !!tailMatch && !!fnMatch);
  if (tailMatch && fnMatch) {
    const pathOf = pathname => new Function('location',
      'var API_TAIL = ' + JSON.stringify(tailMatch[1]) + ';\n'
      + 'function tokenPath() {' + fnMatch[1] + '\n}\nreturn tokenPath();'
    )({ pathname });
    eq('手机页 tokenPath: 根路径 → /api/state', pathOf('/'), '/api/state');
    eq('手机页 tokenPath: 带码 → /<码>/api/state', pathOf('/k7m2p9/'), '/k7m2p9/api/state');
    eq('手机页 tokenPath: 带码无尾斜杠也正确', pathOf('/k7m2p9'), '/k7m2p9/api/state');
    ok('手机页 tokenPath: 任何情况都不产生双斜杠开头', !/^\/\//.test(pathOf('/')) && !/^\/\//.test(pathOf('/k7m2p9/')));
  }

  // -- 7) [v1.0.5.7] start 进行中到达的 stop 必须生效（start/stop 同一条串行链）--
  // 原来.stop 不进链：start 还挂在 listen 回调窗口里时到达的 stop 会「扑空」，
  // 随后回调把服务复活 —— 表现为「配置 enabled=false 但端口仍在服务」。
  cfg = baseConfig({ lanMirrorAuthMode: 'random', lanMirrorToken: TOKEN });
  const portRace = await freePort();
  const svcRace = M.createLanMirror({ getConfig: () => cfg });
  const pStart = svcRace.start(portRace); // 不等待：让 stop 落在 start 的回调窗口里
  const pStop = svcRace.stop();
  await pStart;
  await pStop;
  st = svcRace.status();
  eq('竞态: start 期间到达 stop → 最终不在服务', st.running, false);
  eq('竞态: 端口已释放', st.port, null);
  {
    let refused = false;
    try { await get('http://127.0.0.1:' + portRace + '/' + TOKEN + '/'); } catch (e) { refused = true; }
    ok('竞态: 端口已无 HTTP 服务（连接被拒）', refused);
  }
  // stop 之后再 start 依然可用（队列没有被卡死）
  const stRace2 = await svcRace.start(portRace);
  eq('竞态: stop→start 队列不卡死', stRace2.running, true);
  await svcRace.stop();

  // -- 8) [v1.0.5.7] Host 校验：只服务指向本机的请求（none 模式的 DNS rebinding 面）--
  cfg = baseConfig({ lanMirrorAuthMode: 'none', lanMirrorToken: '' });
  const portHost = await freePort();
  const svcHost = M.createLanMirror({ getConfig: () => cfg });
  await svcHost.start(portHost);
  eq('Host 校验: localhost 正常放行', (await get('http://localhost:' + portHost + '/api/state')).status, 200);
  eq('Host 校验: 127.0.0.1 正常放行', (await get('http://127.0.0.1:' + portHost + '/api/state')).status, 200);
  eq('Host 校验: 内网 IP 正常放行', (await get('http://127.0.0.1:' + portHost + '/')).status, 200);
  eq('Host 校验: 伪装域名（DNS rebinding）→ 403',
    await rawGet(portHost, '/api/state', { Host: 'evil.example.com' }), 403);
  // （缺 Host 的分支服务端同样 403，但 Node http 客户端总会自动补 Host，无法从这里模拟）
  eq('Host 校验: Host 带端口也放行（按主机名剥端口）',
    await rawGet(portHost, '/api/state', { Host: 'localhost:' + portHost }), 200);
  await svcHost.stop();

  // ================================================================
  // [v1.0.5.7] 倒计时写接口 —— 手机端唯一开放的写面
  // 服务的边界：只「转交」，不落盘、不生成数据。这里搭一个「像主进程一样」的内存宿主
  // （校验与状态迁移全部复用 countdown.js，和 main.js 的 applyCountdown* 同源），
  // 用来验证传输层与四道闸（Host / 令牌 / Content-Type+Sec-Fetch-Site+Origin / 限流）。
  // ================================================================
  const CD = require(path.join(__dirname, '..', '..', 'countdown.js'));

  function makeCdHost() {
    const items = [];
    function write(action, payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      if (action === 'create') {
        if (items.length >= CD.MAX_ITEMS) return { ok: false, error: 'too-many' };
        const v = CD.validateCreate(p, Date.now(), { defaultName: '倒计时' });
        if (!v.ok) return v;
        if (p.sound === undefined) v.value.sound = 'beep'; // 与主进程一致：补偏好默认音
        items.push(v.value);
        return { ok: true, value: CD.toPublic(v.value, Date.now()) };
      }
      const i = items.findIndex(c => c.id === String(p.id || ''));
      if (i < 0) return { ok: false, error: 'not-found' };
      const cur = items[i];
      if (action === 'delete') { items.splice(i, 1); return { ok: true, value: null }; }
      if (action === 'pause') items[i] = cur.state === 'paused' ? cur : CD.pauseCountdown(cur, Date.now());
      else if (action === 'resume') items[i] = cur.state === 'running' ? cur : CD.resumeCountdown(cur, Date.now());
      else if (action === 'restart') items[i] = CD.restartCountdown(cur, Date.now());
      else if (action === 'update') {
        const v = CD.validateUpdate(p);
        if (!v.ok) return v;
        let next = Object.assign({}, cur, v.value);
        if (v.value.durationMs !== undefined) {
          next = cur.state === 'paused'
            ? Object.assign({}, next, { remainingMs: v.value.durationMs, nextTrigger: null })
            : CD.retimeCountdown(next, v.value.durationMs, Date.now());
        }
        items[i] = next;
      } else return { ok: false, error: 'unknown-action' };
      return { ok: true, value: CD.toPublic(items[i], Date.now()) };
    }
    return { items, write };
  }
  async function takeNonce(b) {
    const r = await get(b + '/api/write-nonce');
    if (r.status !== 200) return '';
    const j = await r.json().catch(() => ({}));
    return String((j && j.nonce) || '');
  }
  function postJson(url, nonce, body, extraHeaders, method) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      nonce ? { 'X-DC-Nonce': nonce } : {},
      extraHeaders || {}
    );
    // body 传字符串就原样发（测坏 JSON 用），其余对象/数组走 JSON.stringify
    const payload = typeof body === 'string' ? body : JSON.stringify(body === undefined ? {} : body);
    return get(url, { method: method || 'POST', headers, body: payload });
  }
  // 限流是 5 次/秒，功能断言会连着发很多次写：撞到 429 就等一个窗口、换一枚新令牌重发。
  // 这样既真的跑到限流器，又不用为了测试去改生产参数。（令牌是一次性的 → 每次重试都要重领）
  async function writeRetry(b, method, path, body, extraHeaders) {
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await postJson(b + '/api' + path, await takeNonce(b), body === undefined ? {} : body, extraHeaders, method);
      if (r.status !== 429) return r;
      await new Promise(res => setTimeout(res, M.WRITE_RATE_WINDOW_MS + 60));
    }
    return r;
  }

  // -- 9.1) 不开写入口时：快照标记为不可写，所有写请求 403 --
  {
    const st9 = svc.status(); // 主 svc 没有 writeCountdown
    eq('写接口: 未注入 writeCountdown 时 countdownCanEdit=false', st9.countdownCanEdit, false);
    eq('写接口: 未注入时 writes 为 0', st9.writes, 0);
  }

  // -- 9.2) 打开写接口：快照 / 列表 / 令牌 --
  const host = makeCdHost();
  cfg = baseConfig({ lanMirrorAuthMode: 'random', lanMirrorToken: TOKEN });
  const portCd = await freePort();
  const svcCd = M.createLanMirror({
    getConfig: () => cfg,
    getCountdowns: () => ({ items: host.items.map(c => CD.toPublic(c, Date.now())), now: Date.now() }),
    writeCountdown: (action, payload) => host.write(action, payload),
    isCountdownId: v => CD.isValidId(v),
  });
  await svcCd.start(portCd);
  const bCd = 'http://127.0.0.1:' + portCd + '/' + TOKEN;

  let snapCd = await (await get(bCd + '/api/state')).json();
  eq('写接口: 快照 countdownCanEdit=true', snapCd.countdownCanEdit, true);
  eq('写接口: 快照带空倒计时列表', Array.isArray(snapCd.countdowns) && snapCd.countdowns.length, 0);
  eq('写接口: 快照仍标注 readOnly（配置/闹钟/窗口位置依旧不可写）', snapCd.readOnly, true);
  ok('写接口: status.countdownCanEdit=true', svcCd.status().countdownCanEdit === true);

  res = await get(bCd + '/api/countdowns');
  eq('写接口: 列表 GET 200', res.status, 200);
  let listJson = await res.json();
  eq('写接口: 列表形状', Array.isArray(listJson.items) && listJson.canEdit, true);
  eq('写接口: 列表 HEAD 200', (await get(bCd + '/api/countdowns', { method: 'HEAD' })).status, 200);

  const n1 = await takeNonce(bCd), n2 = await takeNonce(bCd);
  ok('令牌: 非空且每次不同', n1 && n2 && n1 !== n2, n1 + ' / ' + n2);
  ok('令牌: 足够长（≥ 16 字符）', n1.length >= 16, n1.length);

  // -- 9.3) 四道闸 --
  eq('闸: 不带令牌 → 403', (await postJson(bCd + '/api/countdowns', '', { durationMs: 60000 })).status, 403);
  eq('闸: 伪造令牌 → 403', (await postJson(bCd + '/api/countdowns', 'fake-nonce', { durationMs: 60000 })).status, 403);
  eq('闸: 同一令牌用第二次 → 403（一次性）',
    await (async () => {
      const nn = await takeNonce(bCd);
      const a = await postJson(bCd + '/api/countdowns', nn, { durationMs: 60000 });
      const bb = await postJson(bCd + '/api/countdowns', nn, { durationMs: 60000 });
      return a.status === 200 && bb.status === 403;
    })(), true);
  eq('闸: 缺 Content-Type → 415', (await get(bCd + '/api/countdowns', {
    method: 'POST', headers: { 'X-DC-Nonce': await takeNonce(bCd) }, body: '{}',
  })).status, 415);
  eq('闸: Content-Type 非 JSON → 415', (await postJson(bCd + '/api/countdowns', await takeNonce(bCd), { durationMs: 60000 }, { 'Content-Type': 'text/plain' })).status, 415);
  eq('闸: Sec-Fetch-Site=cross-site → 403', (await postJson(bCd + '/api/countdowns', await takeNonce(bCd), { durationMs: 60000 }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  eq('闸: Sec-Fetch-Site=same-origin → 放行', (await writeRetry(bCd, 'POST', '/countdowns', { durationMs: 60000 }, { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
  eq('闸: Origin 与 Host 不符 → 403', (await postJson(bCd + '/api/countdowns', await takeNonce(bCd), { durationMs: 60000 }, { Origin: 'http://evil.example.com' })).status, 403);
  eq('闸: Origin 与 Host 相符 → 放行', (await writeRetry(bCd, 'POST', '/countdowns', { durationMs: 60000 }, { Origin: 'http://127.0.0.1:' + portCd })).status, 200);
  eq('闸: 响应带 nosniff', (await writeRetry(bCd, 'POST', '/countdowns', { durationMs: 60000 })).headers.get('x-content-type-options'), 'nosniff');
  eq('闸: 请求体超限 → 413', (await writeRetry(bCd, 'POST', '/countdowns', { name: 'x'.repeat(M.MAX_BODY_BYTES + 64), durationMs: 60000 })).status, 413);
  eq('闸: 坏 JSON → 400', (await writeRetry(bCd, 'POST', '/countdowns', '{not json')).status, 400);
  eq('闸: JSON 数组不算对象 → 400', (await writeRetry(bCd, 'POST', '/countdowns', [1, 2, 3])).status, 400);
  ok('闸: 校验失败带 X-DC-Reason=nonce',
    (await postJson(bCd + '/api/countdowns', '', { durationMs: 60000 })).headers.get('x-dc-reason') === 'nonce');

  // 限流：同一 IP 在窗口内超过 WRITE_RATE_MAX 次 → 429（放最后，前面的成功写也会计入桶）
  {
    let got429 = false;
    for (let i = 0; i < M.WRITE_RATE_MAX + 4; i++) {
      const r = await postJson(bCd + '/api/countdowns', await takeNonce(bCd), { durationMs: 60000 });
      if (r.status === 429) { got429 = true; break; }
    }
    ok('闸: 写请求超频 → 429', got429);
  }
  await svcCd.stop(); // 换一个干净的服务实例，后面的功能断言不受限流影响

  // -- 9.4) 写动作与状态迁移 --
  const host2 = makeCdHost();
  const portCd2 = await freePort();
  const svcCd2 = M.createLanMirror({
    getConfig: () => cfg,
    getCountdowns: () => ({ items: host2.items.map(c => CD.toPublic(c, Date.now())), now: Date.now() }),
    writeCountdown: (action, payload) => host2.write(action, payload),
    isCountdownId: v => CD.isValidId(v),
  });
  await svcCd2.start(portCd2);
  const b2 = 'http://127.0.0.1:' + portCd2 + '/' + TOKEN;
  // 限流是 5 次/秒，功能断言会连着发很多次写：撞到 429 就等一个窗口重发，
  // 这样既真的跑到限流器，又不用为了测试去改生产参数。
  const w = async (method, path, body, headers) => {
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await postJson(b2 + '/api' + path, await takeNonce(b2), body === undefined ? {} : body, headers, method);
      if (r.status !== 429) return r;
      await new Promise(res => setTimeout(res, M.WRITE_RATE_WINDOW_MS + 60));
    }
    return r;
  };

  res = await w('POST', '/countdowns', { name: '泡面', durationMs: 180000 });
  eq('写: 新建 200', res.status, 200);
  let j = await res.json();
  ok('写: 新建回 ok=true', j.ok === true);
  eq('写: 新建回带最新列表（省一次往返）', Array.isArray(j.items) && j.items.length, 1);
  eq('写: 名称落库', j.items[0].name, '泡面');
  eq('写: 时长落库', j.items[0].durationMs, 180000);
  eq('写: 默认 running', j.items[0].state, 'running');
  ok('写: 带 endAt（手机端靠它本地倒扣）', typeof j.items[0].endAt === 'string' && j.items[0].endAt.length > 10);
  const id1 = j.items[0].id;
  ok('写: id 形状合法', CD.isValidId(id1), id1);

  eq('写: 无名称也能建（用默认名）', (await (await w('POST', '/countdowns', { durationMs: 60000 })).json()).items.length, 2);
  eq('写: 时长过短 → 400', (await w('POST', '/countdowns', { durationMs: 500 })).status, 400);
  eq('写: 时长过长 → 400', (await w('POST', '/countdowns', { durationMs: CD.MAX_DURATION_MS + 1 })).status, 400);
  eq('写: 时长非法 → 400', (await w('POST', '/countdowns', { durationMs: 'abc' })).status, 400);
  eq('写: 坏时长错误码可读', (await (await w('POST', '/countdowns', { durationMs: 500 })).json()).error, 'bad-duration');

  eq('写: 暂停 200', (await w('POST', '/countdowns/' + id1 + '/pause')).status, 200);
  j = await (await get(b2 + '/api/countdowns')).json();
  const paused = j.items.find(x => x.id === id1);
  eq('写: 暂停后 state=paused', paused.state, 'paused');
  eq('写: 暂停后 endAt 清空', paused.endAt, null);
  ok('写: 暂停后剩余量保留', paused.remainingMs > 0 && paused.remainingMs <= 180000, paused.remainingMs);
  eq('写: 继续 200', (await w('POST', '/countdowns/' + id1 + '/resume')).status, 200);
  j = await (await get(b2 + '/api/countdowns')).json();
  eq('写: 继续后 state=running', j.items.find(x => x.id === id1).state, 'running');
  eq('写: 重启 200', (await w('POST', '/countdowns/' + id1 + '/restart')).status, 200);
  eq('写: 重启后计时回到整时长', (await (await get(b2 + '/api/countdowns')).json()).items.find(x => x.id === id1).remainingMs > 179000, true);

  res = await w('PATCH', '/countdowns/' + id1, { name: '改过的名字', durationMs: 300000 });
  eq('写: 编辑 200', res.status, 200);
  j = await (await get(b2 + '/api/countdowns')).json();
  const edited = j.items.find(x => x.id === id1);
  eq('写: 编辑改到名称', edited.name, '改过的名字');
  eq('写: 编辑改到时长', edited.durationMs, 300000);
  eq('写: 编辑后按新时长重新计时', edited.remainingMs > 298000, true);
  // 路径上的 id 为权威，body 里夹带别的 id 一律忽略
  j = await (await (await w('PATCH', '/countdowns/' + id1, { id: 'cd_999999_zz', name: 'x' })).json());
  eq('写: body 里的 id 不生效（路径 id 权威）', j.items.find(x => x.id === id1).name, 'x');
  eq('写: 编辑空对象 → 400', (await w('PATCH', '/countdowns/' + id1, {})).status, 400);

  eq('写: 404——不存在的 id', (await w('POST', '/countdowns/cd_999999_zz/pause')).status, 404);
  eq('写: 404——错误码含义可读', (await (await w('PATCH', '/countdowns/cd_999999_zz', { name: 'q' })).json()).error, 'not-found');

  // -- 9.5) 方法 / 路径形状兜底 --
  // 未知动词在最外层就被拦下（Allow 报的是这张路由表整体支持的方法），
  // 而「动词合法但这条路不支持」才按路径给 Allow。
  const ALLOW_ALL = M.ALL_METHODS.join(', ');
  eq('写: PUT 列表 → 405', (await w('PUT', '/countdowns')).status, 405);
  eq('写: 405 带 Allow（未知动词）', (await w('PUT', '/countdowns')).headers.get('allow'), ALLOW_ALL);
  eq('写: GET 单项 → 405', (await get(b2 + '/api/countdowns/' + id1)).status, 405);
  eq('写: 405 带 Allow（单项只读写）', (await get(b2 + '/api/countdowns/' + id1)).headers.get('allow'), 'PATCH, DELETE');
  eq('写: OPTIONS → 405', (await w('OPTIONS', '/countdowns')).headers.get('allow'), ALLOW_ALL);
  eq('写: 未知动作 → 404', (await w('POST', '/countdowns/' + id1 + '/explode')).status, 404);
  eq('写: id 形状不对 → 404', (await w('POST', '/countdowns/not-an-id/pause')).status, 404);
  eq('写: id 太短 → 404', (await w('POST', '/countdowns/cd_1_a/pause')).status, 404);
  eq('写: 路径过深 → 404', (await w('POST', '/countdowns/' + id1 + '/pause/x')).status, 404);
  eq('写: 写请求也要过 Host 校验', await rawGet(portCd2, '/' + TOKEN + '/api/countdowns', { Host: 'evil.example.com' }), 403);

  // -- 9.6) 删除 + cancel 别名 --
  eq('写: cancel 是 delete 的别名（手机端按钮叫取消）', (await w('POST', '/countdowns/' + id1 + '/cancel')).status, 200);
  j = await (await get(b2 + '/api/countdowns')).json();
  ok('写: cancel 后条目消失', !j.items.some(x => x.id === id1));
  eq('写: 已消失再删 → 404', (await w('POST', '/countdowns/' + id1 + '/cancel')).status, 404);
  eq('写: DELETE 方法同样可用', (await w('DELETE', '/countdowns/' + j.items[0].id)).status, 200);
  eq('写: 清空后列表为空', (await (await get(b2 + '/api/countdowns')).json()).items.length, 0);
  eq('写: 清空后快照也空', (await (await get(b2 + '/api/state')).json()).countdowns.length, 0);

  // 列表上限：灌满后新建 → 409
  {
    for (let i = 0; i < CD.MAX_ITEMS; i++) host2.items.push(CD.makeCountdown({ name: 'x' + i, durationMs: 60000 }, Date.now()));
    const r = await w('POST', '/countdowns', { durationMs: 60000 });
    eq('写: 超过上限 → 409', r.status, 409);
    eq('写: 超限错误码可读', (await r.json()).error, 'too-many');
    host2.items.length = 0;
  }

  // -- 9.7) 白名单：快照里的倒计时字段一个不多 --
  {
    host2.items.push(CD.makeCountdown({ name: '白名单', durationMs: 60000, snoozeEnabled: true, snoozeCount: 3 }, Date.now()));
    const rawCd = await (await get(b2 + '/api/state')).text();
    const item = JSON.parse(rawCd).countdowns[0];
    eq('白名单: 字段恰好 6 个', Object.keys(item).sort().join(','),
      ['durationMs', 'endAt', 'id', 'name', 'remainingMs', 'state'].sort().join(','));
    ok('白名单: 不外泄贪睡设置', rawCd.indexOf('snooze') < 0);
    ok('白名单: 不外泄声音设置', rawCd.indexOf('sound') < 0);
    ok('白名单: 不外泄 nextTrigger 等内部字段', rawCd.indexOf('nextTrigger') < 0);
    eq('白名单: 名称截断到 40 字',
      (await (await (await w('POST', '/countdowns', { name: 'x'.repeat(80), durationMs: 60000 })).json())).items.pop().name.length, 40);
    host2.items.length = 0;
  }

  // -- 9.8) 无码模式同样能写（安全靠令牌 + Host + 限流，而不是靠访问码）--
  {
    const host3 = makeCdHost();
    const cfgNone = baseConfig({ lanMirrorAuthMode: 'none', lanMirrorToken: '', lanMirrorFixedCode: '' });
    const portN = await freePort();
    const svcN = M.createLanMirror({
      getConfig: () => cfgNone,
      getCountdowns: () => ({ items: host3.items.map(c => CD.toPublic(c, Date.now())) }),
      writeCountdown: (a, p) => host3.write(a, p),
      isCountdownId: v => CD.isValidId(v),
    });
    await svcN.start(portN);
    const bN = 'http://127.0.0.1:' + portN;
    const nn = await takeNonce(bN);
    eq('无码写: 令牌能领到', nn.length >= 16, true);
    eq('无码写: 不带令牌 403', (await postJson(bN + '/api/countdowns', '', { durationMs: 60000 })).status, 403);
    const rN = await postJson(bN + '/api/countdowns', nn, { name: '无码', durationMs: 60000 });
    eq('无码写: 带令牌 200', rN.status, 200);
    eq('无码写: 真的落库', (await (await get(bN + '/api/countdowns')).json()).items.length, 1);
    eq('无码写: 快照里能看到', (await (await get(bN + '/api/state')).json()).countdowns.length, 1);
    eq('无码写: Host 校验仍然生效（DNS rebinding 面）',
      await rawGet(portN, '/api/write-nonce', { Host: 'evil.example.com' }), 403);
    await svcN.stop();
  }

  // -- 9.9) 手机页的写通道自查：同源、带令牌头、不拼外部主机 --
  {
    const src = pageHtmlSrc;
    ok('手机页: 有 apiBase/apiPath 同源拼装', /function apiBase\(\)/.test(src) && /function apiPath\(/.test(src));
    ok('手机页: 写请求带 X-DC-Nonce', /'X-DC-Nonce'/.test(src));
    ok('手机页: 写前先领一次性令牌', /write-nonce/.test(src));
    ok('手机页: 写请求只用相对路径', !/(fetch|url)\s*\(\s*['"]https?:\/\//.test(src), '发现绝对地址');
    ok('手机页: 倒计时抽屉结构齐全',
      ['cd-fab', 'cd-scrim', 'cd-sheet', 'cd-list', 'cd-form', 'cd-chips'].every(id => src.indexOf('id="' + id + '"') >= 0));
    ok('手机页: 触控目标不小于 44px（关键可点元素）', /#cd-fab[\s\S]{0,400}min-height:\s*44px/.test(src));
  }

  // ====== 汇总 ======
  console.log('lan-mirror 自测：pass=' + pass + ' fail=' + fail);
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  ✗ ' + f));
  }
  process.exit(fail ? 1 : 0);
}

main().catch(err => {
  console.error('测试异常：', err);
  process.exit(1);
});
