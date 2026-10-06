/* lan-mirror-page-browser.js — 真浏览器（Chrome headless + CDP）验收手机页
 *
 * 为什么需要它：jsdom 不做布局、不绘制、不跑真正的 CSS 级联与命中测试 →
 * 「元素在 DOM 里、class 也对，但真机上根本看不见 / 点不到」这类问题它一律验不出来。
 *
 * 本脚本用真引擎 + **真触摸事件**加载手机页（页面服务由 lan-mirror.js 的真实实现提供，
 * 含 CSP 与真实响应头），按用户规格逐步验收：
 *   ① 未激活（全部暂停 **或一条都没有 / 全部被关掉**）→ 3 秒没操作淡出，点一下回来
 *   ② 激活 + 未全屏 → 一直显示，不隐藏
 *   ③ 激活 + 已全屏 → 全屏里的时钟胶囊 3 秒没操作淡出，点一下回来
 * ⚠️「一条都没有」**不能**做成结构性隐藏（display:none）——那样怎么点都不出来（实测踩过）。
 *
 * 跑法：node docs/tests/lan-mirror-page-browser.js
 * 依赖：本机装了 Chrome 或 Edge（自动找）。零 npm 依赖（CDP 走 Node 自带 fetch/WebSocket）。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const { createLanMirror } = require(path.join(ROOT, 'lan-mirror.js'));

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('[PASS] ' + name); return true; }
  fail++;
  failures.push(name + (extra === undefined ? '' : '  →  ' + extra));
  console.log('[FAIL] ' + name + (extra === undefined ? '' : '  →  ' + extra));
  return false;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function findBrowser() {
  const cands = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ } }
  return null;
}

// 最小 CDP 客户端（Node 22 自带 WebSocket，零依赖）
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params) => new Promise(r => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error('页面内求值异常: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
    }
    return r && r.result && r.result.result ? r.result.result.value : undefined;
  };
  return { ws, ready, send, evaluate };
}

// 真触摸点一下（手机端的真实输入路径：touchstart/pointerdown → click）
async function touchTap(c, x, y) {
  await c.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  await wait(60);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// 真鼠标点一下（另一条输入路径，一起验）
async function mouseTap(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await wait(50);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

const INTROSPECT = `(() => {
  const probe = (id) => {
    const e = document.getElementById(id);
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const stack = (document.elementsFromPoint ? document.elementsFromPoint(cx, cy) : [])
      .map(x => x.id || (x.tagName + '.' + String(x.className || '')).slice(0, 40));
    return {
      cls: e.className,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      cx, cy,
      display: cs.display, opacity: cs.opacity, visibility: cs.visibility,
      zIndex: cs.zIndex, pointerEvents: cs.pointerEvents,
      painted: cs.display !== 'none' && Number(cs.opacity) > 0.05 && cs.visibility === 'visible',
      onTop: stack.length ? stack[0] : null, inStack: stack,
    };
  };
  return {
    fab: probe('cd-fab'),
    pill: probe('fs-pill'),
    fabText: document.getElementById('cd-fab-text').textContent,
    sheetOpen: document.getElementById('cd-sheet').classList.contains('show'),
    fsShow: document.getElementById('fs-view').classList.contains('show'),
    status: document.getElementById('status').textContent,
    dotOff: document.getElementById('dot').classList.contains('off'),
    viewport: { w: innerWidth, h: innerHeight },
  };
})()`;

(async () => {
  const browser = findBrowser();
  if (!browser) { console.log('找不到 Chrome/Edge，跳过真浏览器验收'); process.exit(0); }
  console.log('浏览器: ' + browser);

  // ---- 真 lan-mirror 服务（authMode=none，一条运行中的倒计时） ----
  let items = [{
    id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
    state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
  }];
  const cfg = { lanMirrorAuthMode: 'none', language: 'zh', showSeconds: true };
  const mirror = createLanMirror({
    getConfig: () => cfg,
    getCountdowns: () => ({ items, now: Date.now() }),
    writeCountdown: () => ({ ok: true, value: null }),
    isCountdownId: v => /^cd_[a-z0-9_]{3,40}$/.test(String(v || '')),
  });
  const port = await freePort();
  const st = await mirror.start(port);
  if (!st.running) { console.log('lan-mirror 起不来: ' + st.error); process.exit(1); }
  const pageUrl = 'http://127.0.0.1:' + st.port + '/';
  console.log('页面: ' + pageUrl);

  // ---- 起 Chrome headless（手机视口 + 触摸） ----
  const dbgPort = await freePort();
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-browser-'));
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--mute-audio',
    '--remote-debugging-port=' + dbgPort, '--user-data-dir=' + ud,
    '--window-size=390,844', 'about:blank',
  ], { stdio: 'ignore' });

  let c = null;
  const shot = async (name) => {
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(ROOT, 'docs', 'tests', '_lan-' + name + '.png');
    fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
    return p;
  };
  // 强制拉一次快照（页面自己每 15 秒一轮，验收等不起）
  const pull = () => c.evaluate("(function(){ document.dispatchEvent(new Event('visibilitychange')); return 1; })()");

  try {
    let list = null;
    for (let i = 0; i < 60 && !list; i++) {
      try { list = await (await fetch('http://127.0.0.1:' + dbgPort + '/json/list')).json(); }
      catch (e) { await wait(200); }
    }
    const target = (list || []).find(t => t.type === 'page' && t.url.indexOf('devtools') !== 0);
    if (!target) throw new Error('没拿到可调试目标');
    c = cdp(target.webSocketDebuggerUrl);
    await c.ready;

    const pageErrors = [];
    c.ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        pageErrors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') pageErrors.push(m.params.entry.text);
    });
    await c.send('Runtime.enable');
    await c.send('Log.enable');
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

    await c.send('Page.navigate', { url: pageUrl });
    let s = null;
    for (let i = 0; i < 40; i++) {
      await wait(150);
      s = await c.evaluate(INTROSPECT);
      if (s && s.fab.cls.indexOf('has') >= 0) break;
    }
    console.log('初始观测: ' + JSON.stringify(s, null, 1));
    ok('页面脚本在真引擎里跑完（无未捕获异常）', pageErrors.length === 0, pageErrors.join(' | '));
    ok('页面连上了服务（状态点不是红）', s.dotOff === false, 'dot off=' + s.dotOff);
    ok('真机视口是手机尺寸', s.viewport.w === 390 && s.viewport.h === 844, JSON.stringify(s.viewport));

    // ================= 阶段 1：激活 + 未全屏 → 一直显示 =================
    console.log('\n--- 阶段 1：激活中（有运行中的倒计时）+ 未全屏 → 常驻 ---');
    ok('胶囊是显示态（不带 hidden-fab）', s.fab.cls.indexOf('hidden-fab') < 0, s.fab.cls);
    ok('胶囊真的被画出来了（display/opacity/visibility）', s.fab.painted,
      'display=' + s.fab.display + ' opacity=' + s.fab.opacity + ' visibility=' + s.fab.visibility);
    ok('胶囊有真实尺寸且在视口内',
      s.fab.rect.w > 0 && s.fab.rect.h > 0 && s.fab.rect.y > 0 && s.fab.rect.y + s.fab.rect.h <= s.viewport.h,
      JSON.stringify(s.fab.rect));
    ok('★ 胶囊没被别的东西压住（命中栈里有它）', s.fab.inStack.indexOf('cd-fab') >= 0,
      '命中=' + s.fab.onTop + ' 栈=' + JSON.stringify(s.fab.inStack));
    await wait(3600); // 放 3.6 秒不碰
    s = await c.evaluate(INTROSPECT);
    ok('★ 激活中放 3.6 秒不碰 → 胶囊仍可见（不淡出）',
      s.fab.cls.indexOf('idle') < 0 && s.fab.painted, s.fab.cls + ' painted=' + s.fab.painted);
    console.log('截图: ' + await shot('1-active'));

    // ================= 阶段 2：单击胶囊 → 全屏 =================
    console.log('\n--- 阶段 2：真触摸单击胶囊 → 进全屏 ---');
    await touchTap(c, s.fab.cx, s.fab.cy);
    await wait(260);
    s = await c.evaluate(INTROSPECT);
    ok('★ 触摸单击胶囊 → 进全屏', s.fsShow === true, 'fsShow=' + s.fsShow + ' cls=' + s.fab.cls);
    ok('单击没有误触成长按（抽屉不该打开）', s.sheetOpen === false, 'sheetOpen=' + s.sheetOpen);
    ok('全屏里不再显示底部倒计时胶囊', s.fab.cls.indexOf('hidden-fab') >= 0, s.fab.cls);
    ok('全屏里的时钟胶囊可见', s.pill.painted, JSON.stringify({ d: s.pill.display, o: s.pill.opacity }));
    console.log('截图: ' + await shot('2-fullscreen'));

    // ============ 阶段 3：全屏中 → 3 秒淡出，点一下回来 ============
    console.log('\n--- 阶段 3：全屏中 → 3 秒淡出 / 点一下回来 ---');
    await wait(3600);
    s = await c.evaluate(INTROSPECT);
    ok('★ 全屏里 3 秒没操作 → 时钟胶囊淡出', s.pill.cls.indexOf('idle') >= 0, s.pill.cls);
    ok('时钟胶囊淡出后不再吃点击（pointer-events:none）', s.pill.pointerEvents === 'none', s.pill.pointerEvents);
    await touchTap(c, 195, 430); // 屏幕中间摸一下
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    ok('摸一下屏幕 → 时钟胶囊立刻回来', s.pill.cls.indexOf('idle') < 0 && s.pill.painted, s.pill.cls);
    await touchTap(c, s.pill.cx, s.pill.cy);
    await wait(260);
    s = await c.evaluate(INTROSPECT);
    ok('点时钟胶囊 → 退出全屏', s.fsShow === false, 'fsShow=' + s.fsShow);

    // ============ 阶段 4：未激活（全暂停）→ 3 秒淡出，点一下回来 ============
    console.log('\n--- 阶段 4：未激活（全暂停）→ 3 秒淡出 / 点一下回来 ---');
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'paused', endAt: null,
    }];
    await pull();
    await wait(300);
    s = await c.evaluate(INTROSPECT);
    ok('刚转全暂停时胶囊仍在显示（计时是重新开始的）',
      s.fab.cls.indexOf('hidden-fab') < 0 && s.fab.cls.indexOf('idle') < 0, s.fab.cls);
    await wait(3600);
    s = await c.evaluate(INTROSPECT);
    ok('★ 未激活（全暂停）3 秒没操作 → 淡出', s.fab.cls.indexOf('idle') >= 0, s.fab.cls);
    ok('淡出后真的看不见了（visibility 也收了）',
      s.fab.visibility === 'hidden' && Number(s.fab.opacity) < 0.05,
      'visibility=' + s.fab.visibility + ' opacity=' + s.fab.opacity);
    await touchTap(c, 195, 430);
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    ok('★ 点一下屏幕 → 胶囊立刻回来（不是永久隐藏）',
      s.fab.cls.indexOf('idle') < 0 && s.fab.painted, s.fab.cls + ' painted=' + s.fab.painted);
    console.log('截图: ' + await shot('4-paused-awake'));

    // ============ 阶段 5：激活（转回运行）→ 立刻现身并常驻 ============
    console.log('\n--- 阶段 5：由暂停转运行 → 立刻现身并常驻 ---');
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    await pull();
    await wait(300);
    s = await c.evaluate(INTROSPECT);
    ok('转回运行后胶囊是可见的', s.fab.cls.indexOf('idle') < 0 && s.fab.painted, s.fab.cls);
    await wait(3600);
    s = await c.evaluate(INTROSPECT);
    ok('运行中再放 3.6 秒 → 仍然可见（激活即常驻）',
      s.fab.cls.indexOf('idle') < 0 && s.fab.painted, s.fab.cls);

    // ============ 阶段 6：鼠标路径也要能进全屏 ============
    console.log('\n--- 阶段 6：鼠标单击胶囊也应进全屏 ---');
    // 用最新坐标点（读数每秒在走，重读一次最稳）；click 的派发是异步的，给一小段轮询窗口
    s = await c.evaluate(INTROSPECT);
    await mouseTap(c, s.fab.cx, s.fab.cy);
    for (let i = 0; i < 8 && !s.fsShow; i++) { await wait(80); s = await c.evaluate(INTROSPECT); }
    ok('鼠标单击 → 进全屏', s.fsShow === true, 'fsShow=' + s.fsShow + ' cls=' + s.fab.cls);
    ok('鼠标单击也没有误触成长按（抽屉不该打开）', s.sheetOpen === false, 'sheetOpen=' + s.sheetOpen);

    await touchTap(c, 195, 430); // 先唤一下全屏里的时钟胶囊，再点它退出
    await wait(200);
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.pill.cx, s.pill.cy);
    await wait(300);
    s = await c.evaluate(INTROSPECT);
    ok('退出全屏（准备下一阶段）', s.fsShow === false, 'fsShow=' + s.fsShow);

    // ====== 阶段 6.5：全部「关掉」（一条倒计时都没有）→ 空态胶囊走同一套逻辑 ======
    // 用户规格：全部关闭 / 一条都没有，与「全部暂停」是**同一套**逻辑（3 秒淡出、点一下回来）。
    console.log('\n--- 阶段 6.5：一条倒计时都没有（全部关掉）→ 空态胶囊 ---');
    items = [];
    await pull();
    await wait(320);
    s = await c.evaluate(INTROSPECT);
    ok('★★ 一条都没有时胶囊仍然出现（不是结构性隐藏）',
      s.fab.cls.indexOf('hidden-fab') < 0, s.fab.cls);
    ok('★ 空态胶囊真的被画出来了', s.fab.painted,
      'display=' + s.fab.display + ' opacity=' + s.fab.opacity + ' visibility=' + s.fab.visibility);
    ok('★ 空态胶囊没被别的东西压住（命中栈里有它）', s.fab.inStack.indexOf('cd-fab') >= 0,
      '命中=' + s.fab.onTop + ' 栈=' + JSON.stringify(s.fab.inStack));
    ok('空态胶囊文案是「新建」入口', /倒计时|Countdown/.test(s.fabText), s.fabText);
    console.log('截图: ' + await shot('5-empty-awake'));
    await wait(3600);
    s = await c.evaluate(INTROSPECT);
    ok('★ 空态放 3.6 秒不碰 → 自动淡出', s.fab.cls.indexOf('idle') >= 0, s.fab.cls);
    await touchTap(c, 195, 430);
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    ok('★ 点一下屏幕 → 空态胶囊立刻回来（与「全暂停」完全同一套逻辑）',
      s.fab.cls.indexOf('idle') < 0 && s.fab.painted, s.fab.cls + ' painted=' + s.fab.painted);

    // 恢复一条运行中的，别影响阶段 7
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    await pull();
    await wait(250);

    // ============ 阶段 7：页面版本自愈（宿主换了页面 → 手机端自动重载） ============
    // 根治的假 bug：宿主页面缓存不失效 / 手机拿着旧页面时，改了什么都不生效。
    console.log('\n--- 阶段 7：页面版本自愈 ---');
    await c.evaluate('window.__dcAlive = 1');
    const PAGE_FILE = path.join(ROOT, 'lan-mirror-page.html');
    const st0 = fs.statSync(PAGE_FILE);
    try {
      // 只动 mtime（内容一字不改）→ 宿主的版本号变化，等价于「页面被改过」
      fs.utimesSync(PAGE_FILE, st0.atime, new Date(st0.mtimeMs - 3000));
      await pull();
      let alive = 1;
      for (let i = 0; i < 50 && alive; i++) {
        await wait(120);
        try { alive = await c.evaluate('window.__dcAlive || 0'); } catch (e) { await wait(120); }
      }
      ok('★ 宿主页面版本变了 → 手机端自动重载（旧脚本不再继续跑）', !alive, 'alive=' + alive);
      // 重载后版本已对上 → 不该再重载（不循环）
      await c.evaluate('window.__dcAlive2 = 1');
      await pull();
      await wait(900);
      let alive2 = 1;
      try { alive2 = await c.evaluate('window.__dcAlive2 || 0'); } catch (e) { /* ignore */ }
      ok('重载后版本一致 → 不再重载（无循环）', alive2 === 1, 'alive2=' + alive2);
    } finally {
      try { fs.utimesSync(PAGE_FILE, st0.atime, st0.mtime); } catch (e) { /* ignore */ } // 还原 mtime（内容从未改）
    }

    ok('全程没有页面异常', pageErrors.length === 0, pageErrors.join(' | '));
  } catch (e) {
    fail++;
    failures.push('真浏览器探针异常: ' + ((e && e.stack) || e));
    console.log('[FAIL] 真浏览器探针异常: ' + ((e && e.stack) || e));
  } finally {
    try { if (c) c.ws.close(); } catch (e) { /* ignore */ }
    try { child.kill(); } catch (e) { /* ignore */ }
    try { await mirror.stop(); } catch (e) { /* ignore */ }
    await wait(300);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  console.log('\nlan-mirror-page(browser)：pass=' + pass + ' fail=' + fail);
  if (failures.length) { console.log('\n失败项：'); failures.forEach(f => console.log('  ✗ ' + f)); }
  process.exit(fail ? 1 : 0);
})();
