// docs/tests/lan-mirror.test.js — [v1.0.5.6] 局域网只读镜像服务自测
//
// 不依赖 Electron / 不依赖网络环境，直接用 node 跑：
//   node docs/tests/lan-mirror.test.js
// 覆盖：访问码路由、只读约束（仅 GET/HEAD）、404/405 兜底、目录穿越、
//       端口占用顺延、启停幂等、快照白名单（不外泄访问码与无关配置）、页面自包含。

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

  res = await get(base + '/' + TOKEN); // 不带结尾斜杠也应可用
  eq('页面: 无尾斜杠也能打开', res.status, 200);

  res = await get(base + '/' + TOKEN + '/', { method: 'HEAD' });
  eq('HEAD: 200', res.status, 200);
  eq('HEAD: 无正文', (await res.text()).length, 0);

  // ====== 快照接口 ======
  res = await get(base + '/' + TOKEN + '/api/state');
  eq('快照: 200', res.status, 200);
  ok('快照: JSON 类型', /application\/json/.test(res.headers.get('content-type') || ''));
  const raw = await res.text();
  const snap = JSON.parse(raw);
  ok('快照: 带服务端时间', Math.abs(snap.now - Date.now()) < 5000, snap.now);
  eq('快照: 标注只读', snap.readOnly, true);
  eq('快照: color 透传', snap.cfg.color, '#123456');
  eq('快照: hourFormat 透传', snap.cfg.hourFormat, '24');
  eq('快照: 时区截断为 2 条', snap.cfg.extraTimezones.length, 2);
  eq('快照: 时区内容正确', snap.cfg.extraTimezones[0].label, 'NYC');
  ok('快照: 不含访问码', raw.indexOf(TOKEN) < 0);
  ok('快照: 不含无关配置（__secret）', raw.indexOf('do-not-leak') < 0);
  ok('快照: 不含窗口坐标', raw.indexOf('"x"') < 0 && raw.indexOf('111') < 0);
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
