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
function eq(name, actual, expected) {
  return ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
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
// ⚠️ 中间不留 sleep：这 60ms 会叠加在 CDP 往返之上。机器一慢（内存吃紧时实测往返 >250ms），
//    一次「单击」的总时长就超过 520ms 的长按阈值 → 被判成长按、把抽屉打开。
//    真机触摸事件是本地派的、延迟极低，不会这样；纯属测试环境噪声。
async function touchTap(c, x, y) {
  await c.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// 真鼠标点一下（另一条输入路径，一起验）
async function mouseTap(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await wait(50);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

// 真触摸「按住不放」ms 毫秒（验长按手势；touchTap 只有 60ms，够不上 520ms 的长按阈值）
async function touchHold(c, x, y, ms) {
  await c.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  await wait(ms);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// 只按下、不抬起（浏览器压根不会生成 click）→ 用来证明「按下即触发」
async function touchDown(c, x, y) {
  await c.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
}
async function touchUp(c) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// 真触摸双击（两次 tap 间隔 ~150ms，落在页面 320ms 的判定窗口内）
async function touchDouble(c, x, y) {
  await touchTap(c, x, y);
  await wait(90);
  await touchTap(c, x, y);
}

// 点顶部胶囊 → 进全屏。这一下是「手势 → 形变 → 切界面」的整条链路：
//   ① 胶囊被藏起来（display:none / rect 全 0）时按 (0,0) 会打空；
//   ② 合成触摸下偶尔掉一下（落点被布局变动带走）。
// 所以带守卫 + 重试；「始终开不出来」依然会被外层断言抓出来，不会掩盖真问题。
// ⚠️ 等待要算：形变 0.8s → 切界面淡入 0.22s ≈ 1.06s（空等已归 0）。
//    所以轮询 `.show`，别写死一个偏小的数。
async function enterFs(c) {
  for (let i = 0; i < 4; i++) {
    let s = await c.evaluate(INTROSPECT);
    if (s.fsShow) return true;
    // ⚠️ 慢环境自愈：CDP 往返被拉长时，一次「单击」会被判成长按、把抽屉顶开（实测踩到）。
    //    真机不会这样 → 这里先关掉抽屉、等 450ms 的吞 click 窗口过期，再重试。
    if (s.sheetOpen) { await touchTap(c, 30, 80); await wait(520); continue; }
    if (s.fab.cls.indexOf('hidden-fab') >= 0 || s.fab.rect.w < 40) return false; // 点不到，别打空
    await touchTap(c, s.fab.cx, s.fab.cy);
    // 进全屏总时长 ~1.06s：留 3s 上限，轮询到界面真的切过去
    for (let k = 0; k < 30; k++) {
      await wait(100);
      const t = await c.evaluate(INTROSPECT);
      // 再等 #fs-view 自己那 .22s 淡入跑完 —— 否则子元素还量不到 painted
      if (t.fsShow) { await wait(300); return true; }
      if (t.sheetOpen) break; // 被判成长按了 → 交给下一轮自愈
    }
  }
  return (await c.evaluate(INTROSPECT)).fsShow === true;
}

// 真触摸「按住拖动」（验自绘滑块：色相条靠 pointermove 跟着走）
async function touchDrag(c, x0, y0, x1, y1, steps) {
  await c.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: x0, y: y0, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  const n = steps || 8;
  for (let i = 1; i <= n; i++) {
    await c.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
    });
    await wait(28);
  }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const INTROSPECT = `(() => {
  const ls = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  // chips 的真触摸落点（要真点，所以必须拿到真实坐标）
  const chipRect = (sel) => Array.prototype.map.call(document.querySelectorAll(sel + ' button'), b => {
    const r = b.getBoundingClientRect();
    return {
      v: b.getAttribute('data-v'), active: b.classList.contains('active'), t: b.textContent,
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width),
    };
  });
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
    clock: probe('clock'),
    fsTime: probe('fs-time'),
    fsActs: probe('fs-acts'),
    fsToggle: probe('fs-toggle'),
    fsCancel: probe('fs-cancel'),
    fsText: document.getElementById('fs-time').getAttribute('data-t'),
    fsCls: document.getElementById('fs-time').className,
    clockCls: document.getElementById('clock').className,
    fsToggleTxt: document.getElementById('fs-toggle').textContent.trim(),
    fsCancelTxt: document.getElementById('fs-cancel').textContent.trim(),
    // 按钮改成纯 CSS 图形后：状态看 data-act / .armed，语义看 aria-label
    fsToggleAct: document.getElementById('fs-toggle').getAttribute('data-act'),
    fsToggleLabel: document.getElementById('fs-toggle').getAttribute('aria-label'),
    fsCancelLabel: document.getElementById('fs-cancel').getAttribute('aria-label'),
    fsCancelArmed: document.getElementById('fs-cancel').classList.contains('armed'),
    // 四个图形里「真的被画出来」的那几个（display 由 data-act / .armed 决定）
    icoVisible: (function () {
      var vis = function (sel) {
        var e = document.querySelector(sel);
        if (!e) return false;
        var cs = getComputedStyle(e), r = e.getBoundingClientRect();
        return cs.display !== 'none' && r.width > 0 && r.height > 0;
      };
      return {
        pause: vis('#fs-toggle .ico-pause'), play: vis('#fs-toggle .ico-play'),
        x: vis('#fs-cancel .ico-x'), q: vis('#fs-cancel .ico-q'),
      };
    })(),
    // 「?」的三个构件是否都真被画出来（钩 / 竖干 / 点）
    icoQParts: (function () {
      var dot = document.querySelector('#fs-cancel .ico-q .ico-q-dot');
      var hook = document.querySelector('#fs-cancel .ico-q');
      if (!dot || !hook) return { dot: false, hook: false };
      var r = dot.getBoundingClientRect();
      return { dot: r.width > 0 && r.height > 0, hook: getComputedStyle(hook).display !== 'none' };
    })(),
    icoPointer: (function () {
      var e = document.querySelector('#fs-toggle .ico-pause');
      return e ? getComputedStyle(e).pointerEvents : null;
    })(),
    uiSheetOpen: document.getElementById('ui-sheet').classList.contains('show'),
    uiSheet: probe('ui-sheet'),
    uiTitle: document.getElementById('ui-title').textContent,
    uiScaleVal: document.getElementById('ui-scale-val').textContent,
    uiPlus: probe('ui-plus'),
    uiReset: probe('ui-reset'),
    uiClose: probe('ui-close'),
    // —— [v1.0.5.7] 全屏倒计时专属：模糊数字 + 水位条配色 ——
    uiFsBlockHidden: document.getElementById('ui-fs-block').hidden,
    // —— [v1.0.5.7] 本轮新增：形变层 / 掠屏 / 独立字体与动画 ——
    uiClockBlockHidden: document.getElementById('ui-clock-block').hidden,
    uiDurVal: document.getElementById('ui-dur-val').textContent,
    uiDurPlus: probe('ui-dur-plus'),
    uiFontOk: probe('ui-font-ok'),
    uiFontInput: probe('ui-font-input'),
    uiDirHidden: document.getElementById('ui-dir-chips').hidden,
    fontChips: chipRect('#ui-font-chips'),
    animChips: chipRect('#ui-anim-chips'),
    dirChips: chipRect('#ui-dir-chips'),
    clockFontLS: ls('dc.clockFont'), animTypeLS: ls('dc.animType'),
    animDirLS: ls('dc.animDir'), animDurLS: ls('dc.animDur'),
    bodyFont: getComputedStyle(document.body).fontFamily,
    animDurVar: getComputedStyle(document.getElementById('time-display')).getPropertyValue('--anim-duration').trim(),
    fsDurVar: getComputedStyle(document.getElementById('fs-time')).getPropertyValue('--anim-duration').trim(),
    // —— [v1.0.5.7] 数字动画「节奏」（缓动曲线）——
    easeChips: chipRect('#ui-ease-chips'),
    animEaseLS: ls('dc.animEase'),
    clockEaseVar: getComputedStyle(document.getElementById('time-display')).getPropertyValue('--anim-ease').trim(),
    fsEaseVar: getComputedStyle(document.getElementById('fs-time')).getPropertyValue('--anim-ease').trim(),
    // ★ 量「真实算出来的曲线」而不是变量字符串：临时挂一个数字位探针（带 animate-out，
    //   这样 CSS 的 transition 才命中），getComputedStyle 读完立刻撤掉 —— 同一帧内完成，
    //   不会真的渲染出来，也不影响布局。
    //   ⚠️ transition 里 transform + opacity 两条 → 返回的是「值1, 值2」，而 cubic-bezier
    //   本身带逗号，不能用 split(',') 取第一个，得按语法匹配。
    digitEase: (function () {
      var host = document.getElementById('time-display');
      if (!host) return null;
      var g = document.createElement('span'); g.className = 'digit-group';
      var c = document.createElement('span'); c.className = 'digit-current animate-out';
      c.textContent = '8'; g.appendChild(c); host.appendChild(g);
      var tf = getComputedStyle(c).transitionTimingFunction;
      host.removeChild(g);
      var m = tf.match(/^\\s*(cubic-bezier\\([^)]*\\)|[a-z-]+)/i);
      return m ? m[1].trim() : tf;
    })(),
    morph: probe('fs-morph'),
    morphFill: probe('fs-morph-fill'),
    fsFill: probe('fs-fill'),
    sweep: probe('fs-sweep'),
    sweepBg: getComputedStyle(document.getElementById('fs-sweep')).backgroundImage,
    // 到点提醒条：它是 top 处的整条横幅（z-index 60）——胶囊也在顶部，两者必须错开，
    // 否则「提醒中」那 90 秒里点胶囊会打在横幅上（实测踩到过）。
    alert: probe('cd-alert'),
    alertStop: probe('cd-alert-stop'),
    fsViewCls: document.getElementById('fs-view').className,
    uiBlur: probe('ui-blur'),
    uiBlurChecked: document.getElementById('ui-blur').getAttribute('aria-checked'),
    uiHue: probe('ui-hue'),
    uiHueTrack: probe('ui-hue-track'),
    uiHueKnob: probe('ui-hue-knob'),
    uiAccentReset: probe('ui-accent-reset'),
    fsAccentA: document.getElementById('fs-view').style.getPropertyValue('--fs-a'),
    fsFillBg: getComputedStyle(document.getElementById('fs-fill')).backgroundImage,
    morphFillBg: getComputedStyle(document.getElementById('fs-morph-fill')).backgroundImage,
    // 胶囊「按剩余比例上色」：伪元素的 computed 背景 + 是否点亮 + 断点百分比
    fabBeforeBg: getComputedStyle(document.getElementById('cd-fab'), '::before').backgroundImage,
    fabBeforeOp: getComputedStyle(document.getElementById('cd-fab'), '::before').opacity,
    fabPct: document.getElementById('cd-fab').style.getPropertyValue('--fab-pct'),
    // ⚠️ 只查「有没有渐变、含不含 transparent」是不够的：断点落在 0% 时色块宽度为 0，
    //    渐变字符串里**照样**有 rgba(0,0,0,0) → 颜色整个看不见却全绿（真机踩过）。
    //    这里额外取「伪元素实际解析出的断点位置」和它读到的 --fab-pct，才是真判定。
    fabBeforePct: getComputedStyle(document.getElementById('cd-fab'), '::before').getPropertyValue('--fab-pct').trim(),
    // ⚠️ 本文件是模板字符串：正则里写 \( \) \. 会被吃掉反斜杠（\( 变成 ( 直接改变正则含义）。
    //    所以这里只用 [0-9.] 这类字符类 + split，不碰转义。
    fabStops: (function () {
      var g = getComputedStyle(document.getElementById('cd-fab'), '::before').backgroundImage;
      var out = [];
      g.split(',').forEach(function (seg) {
        var m = /([0-9.]+)%/.exec(seg); // 颜色段里没有紧跟 % 的数字 → 不会误伤
        if (m) out.push(parseFloat(m[1]));
      });
      return out;
    })(),
    fsBlurLS: (function () { try { return localStorage.getItem('dc.fsBlur'); } catch (e) { return null; } })(),
    fsHueLS: (function () { try { return localStorage.getItem('dc.fsHue'); } catch (e) { return null; } })(),
    hintTxt: document.getElementById('hint').textContent,
    fsScaleLS: (function () { try { return localStorage.getItem('dc.fsScale'); } catch (e) { return null; } })(),
    clockScaleLS: (function () { try { return localStorage.getItem('dc.clockScale'); } catch (e) { return null; } })(),
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
  const writes = []; // 记录手机端发来的写请求（action + payload）
  const mirror = createLanMirror({
    getConfig: () => cfg,
    getCountdowns: () => ({ items, now: Date.now() }),
    // 写入口：按动作真的改 items —— 这样页面拿到的回包（items）是「写完之后」的状态，
    // 与真宿主一致（真宿主由 applyCountdown* 写入后现算列表）
    writeCountdown: (action, payload) => {
      writes.push({ action, payload });
      const id = payload && payload.id;
      const at = items.findIndex(it => it.id === id);
      if (at < 0) return { ok: false, error: 'not-found' };
      if (action === 'pause') items[at] = Object.assign({}, items[at], { state: 'paused', endAt: null, remainingMs: 300000 });
      else if (action === 'resume') items[at] = Object.assign({}, items[at], { state: 'running', endAt: new Date(Date.now() + 300000).toISOString() });
      else if (action === 'delete') items = items.filter(it => it.id !== id);
      return { ok: true, value: null };
    },
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
    // ★ 有倒计时在跑 → 胶囊「一部分有色 + 一部分无色玻璃」（和全屏水位条同一套语言）
    ok('★ 有倒计时在跑 → 点亮 .fab-live', s.fab.cls.indexOf('fab-live') >= 0, s.fab.cls);
    ok('★ 是「一部分有色 + 一部分留白」的**渐变**（不是整块变淡）',
      /gradient/.test(s.fabBeforeBg) && /rgba\(0, 0, 0, 0\)/.test(s.fabBeforeBg), s.fabBeforeBg);
    ok('★ 伪元素已点亮（opacity 到 1）', parseFloat(s.fabBeforeOp) > 0.9, 'op=' + s.fabBeforeOp);
    // ★★ 两个真·渲染判定，专治「渐变字符串里啥都有、但断点落在 0% → 色块宽度 0 → 看不见颜色」的假绿。
    //    这正是 inherits:false 的坑（伪元素靠继承取值，false → 只拿得到 initial-value 0%）。
    ok('★★ 伪元素真的读到了 --fab-pct（> 0，不是 0% 空块）——inherits 必须 true',
      parseFloat(s.fabBeforePct) > 5, 'beforePct=' + s.fabBeforePct + ' elPct=' + s.fabPct);
    ok('★★ 色块的断点真的落在那个位置（有宽度，不是 0%）',
      s.fabStops.length >= 2 && s.fabStops[0] > 5, 'stops=' + JSON.stringify(s.fabStops) + ' bg=' + s.fabBeforeBg);
    ok('★★ 伪元素渲染值 ≈ 元素上写的值（差 > 5 就说明伪元素读不到，颜色会整个没）',
      parseFloat(s.fabBeforePct) > 0 && Math.abs(parseFloat(s.fabBeforePct) - parseFloat(s.fabPct)) <= 4,
      'beforePct=' + s.fabBeforePct + ' elPct=' + s.fabPct);
    ok('★ 初始剩余 ≈50% → 有色块断点也 ≈50%', Math.abs(parseFloat(s.fabPct) - 50) <= 3, 'pct=' + s.fabPct);
    // ★ 有色块宽度**跟着剩余比例走**（不是固定一半）—— 把剩余改成 25% 看它是否跟着缩
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 150000,
      state: 'running', endAt: new Date(Date.now() + 150000).toISOString(),
    }];
    await pull();
    await wait(2400); // 断点是 1s 线性过渡（每秒还会被 tick 重设一次）→ 留足时间再量
    s = await c.evaluate(INTROSPECT);
    ok('★ 剩余缩到 25% → 有色块也跟着缩到 ~25%（证明是按比例，不是固定一半）',
      Math.abs(parseFloat(s.fabPct) - 25) <= 3, 'pct=' + s.fabPct);
    ok('★ 剩余缩到 25% → 伪元素渲染的色块也真跟着缩（≈元素值、明显小于一半）',
      parseFloat(s.fabBeforePct) < 40
      && Math.abs(parseFloat(s.fabBeforePct) - parseFloat(s.fabPct)) <= 5,
      'beforePct=' + s.fabBeforePct + ' elPct=' + s.fabPct + ' stops=' + JSON.stringify(s.fabStops));
    // 还原成 50%（后面几个阶段沿用）
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    await pull();
    await wait(200);
    console.log('截图: ' + await shot('1-active'));

    // ================= 阶段 2：单击胶囊 → 全屏 =================
    console.log('\n--- 阶段 2：真触摸单击胶囊 → 进全屏 ---');
    // ⚠️ 进全屏：① 形变 0.8s（玻璃从胶囊长满整屏）→ ② 形变层收起 + 立即切界面
    //    （#fs-view 淡入 0.22s 盖过时钟）—— 空等已归 0，中间不再停一拍。
    //    点到「全屏就位」一共 ≈1.06s，不能按老版本的 260ms 去查。
    // ⚠️ 两处加固（都是慢环境噪声，真机不会这样）：
    //    ① 这次触摸可能被 CDP 往返拖成「长按」→ 关掉误开的抽屉、等 520ms 后重试；
    //    ② 「形变中途」不写死 500ms（evaluate 本身有开销，会踩过那一拍）→ 轮询抓一次即可。
    let mid = null;
    for (let i = 0; i < 3; i++) {
      await touchTap(c, s.fab.cx, s.fab.cy);
      for (let k = 0; k < 14; k++) {
        s = await c.evaluate(INTROSPECT);
        if (s.sheetOpen || s.fsShow) break;
        if (s.morph.visibility === 'visible') { mid = s; break; }
        await wait(40);
      }
      if (mid || s.fsShow) break;
      await touchTap(c, 30, 80); await wait(520); // 关掉误开的抽屉，等吞 click 窗口过期
    }
    ok('★ 形变中途：形变层在放、界面还没切（底下是时钟）',
      !!mid, JSON.stringify({ vis: s.morph.visibility, fsShow: s.fsShow, cls: s.fsViewCls }));
    for (let k = 0; k < 30 && !s.fsShow; k++) { await wait(100); s = await c.evaluate(INTROSPECT); }
    await wait(300); // 再等 .22s 淡入跑完 → 下面那些 painted 断言才成立
    s = await c.evaluate(INTROSPECT);
    ok('★ 触摸单击胶囊 → 进全屏', s.fsShow === true, 'fsShow=' + s.fsShow + ' cls=' + s.fab.cls);
    ok('单击没有误触成长按（抽屉不该打开）', s.sheetOpen === false, 'sheetOpen=' + s.sheetOpen);
    ok('全屏里不再显示底部倒计时胶囊', s.fab.cls.indexOf('hidden-fab') >= 0, s.fab.cls);
    ok('全屏里的时钟胶囊可见', s.pill.painted, JSON.stringify({ d: s.pill.display, o: s.pill.opacity }));
    ok('形变层已收干净（到位即隐 → hidden）', s.morph.visibility === 'hidden', s.morph.visibility);
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
    ok('★ 未激活（全暂停）→ 胶囊不再点亮「半边淡色」',
      s.fab.cls.indexOf('fab-live') < 0, s.fab.cls);
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
    // 用最新坐标点（读数每秒在走，重读一次最稳）；click 的派发是异步的，给一小段轮询窗口。
    // ⚠️ 合成鼠标事件偶尔会「按了没出 click」（headless 里见过一次）→ 允许重试，
    //    但必须把失败时的内部状态一起打出来，别让偶发直接变成一片连锁失败。
    let mouseOk = false;
    for (let i = 0; i < 3 && !mouseOk; i++) {
      s = await c.evaluate(INTROSPECT);
      await mouseTap(c, s.fab.cx, s.fab.cy);
      for (let k = 0; k < 8 && !mouseOk; k++) {
        await wait(80);
        s = await c.evaluate(INTROSPECT);
        mouseOk = s.fsShow === true;
      }
    }
    ok('鼠标单击 → 进全屏', mouseOk,
      'fsShow=' + s.fsShow + ' cls=' + s.fab.cls + ' stack=' + JSON.stringify(s.fab.inStack));
    ok('鼠标单击也没有误触成长按（抽屉不该打开）', s.sheetOpen === false, 'sheetOpen=' + s.sheetOpen);

    // ⚠️ 退出全屏只能「确认全屏开着」再点时钟胶囊：全屏关着的时候 #fs-pill 的盒子和
    //    底部胶囊**完全重合**（就是刻意做的同位置），盲点它会顺手把全屏又打开。
    if (s.fsShow) {
      await touchTap(c, 195, 430); // 先唤一下全屏里的时钟胶囊，再点它退出
      await wait(200);
      s = await c.evaluate(INTROSPECT);
      await touchTap(c, s.pill.cx, s.pill.cy);
      await wait(360);
      s = await c.evaluate(INTROSPECT);
    }
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

    // ====== 阶段 8：全屏底部布局（左下大数字 / 右下两个大按钮）+ 长按数字调字号 ======
    // 这一阶段的重点全是 jsdom 验不出来的东西：真实排版位置、真实命中测试、
    // 真实字号（放大到底会不会越界）、以及 520ms 的真触摸长按。
    console.log('\n--- 阶段 8：全屏布局 + 长按数字调字号 ---');
    await touchTap(c, 195, 430); // 先摸一下屏幕，确保胶囊是「醒着」的（淡出态点不到）
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.fab.cx, s.fab.cy);
    // 进全屏 ≈1.06s（形变 0.8s + 切界面淡入 0.22s）→ 轮询到界面真的切过去
    for (let k = 0; k < 30 && !s.fsShow; k++) { await wait(100); s = await c.evaluate(INTROSPECT); }
    await wait(300); // 再等 #fs-view 的 .22s 淡入跑完，量到的才是「真的画出来」的版式
    s = await c.evaluate(INTROSPECT);
    ok('（准备）进全屏', s.fsShow === true, 'fsShow=' + s.fsShow);
    const VW = s.viewport.w, VH = s.viewport.h;

    ok('★ 大数字真的被画出来了（有尺寸）',
      s.fsTime.painted && s.fsTime.rect.w > 0 && s.fsTime.rect.h > 0,
      JSON.stringify({ painted: s.fsTime.painted, rect: s.fsTime.rect }));
    ok('★ 大数字在左下角（左贴边 + 贴底）',
      s.fsTime.rect.x <= 24 && (s.fsTime.rect.y + s.fsTime.rect.h) >= VH - 130,
      JSON.stringify({ rect: s.fsTime.rect, VH }));
    ok('★ 大数字不越界（整块都在视口内）',
      s.fsTime.rect.x >= 0 && s.fsTime.rect.x + s.fsTime.rect.w <= VW,
      JSON.stringify({ rect: s.fsTime.rect, VW }));
    ok('★ 大数字没被压住（命中栈里有它 → 长按点得到）',
      s.fsTime.inStack.indexOf('fs-time') >= 0, '命中=' + s.fsTime.onTop);

    ok('右下角两个大按钮都画出来了',
      s.fsToggle.painted && s.fsCancel.painted,
      JSON.stringify({ toggle: s.fsToggle.painted, cancel: s.fsCancel.painted }));
    ok('★ 两个按钮贴右下角、且不越界',
      s.fsCancel.rect.x + s.fsCancel.rect.w <= VW
      && s.fsCancel.rect.x + s.fsCancel.rect.w >= VW - 40
      && (s.fsCancel.rect.y + s.fsCancel.rect.h) >= VH - 130,
      JSON.stringify({ cancel: s.fsCancel.rect, VW, VH }));
    ok('★ 两个按钮都没被压住（各自命中栈里有它）',
      s.fsToggle.inStack.indexOf('fs-toggle') >= 0 && s.fsCancel.inStack.indexOf('fs-cancel') >= 0,
      'toggle=' + s.fsToggle.onTop + ' cancel=' + s.fsCancel.onTop);
    ok('★ 大数字与按钮不重叠（数字右缘在按钮左缘左边）',
      s.fsTime.rect.x + s.fsTime.rect.w <= s.fsToggle.rect.x + 1,
      JSON.stringify({ timeRight: s.fsTime.rect.x + s.fsTime.rect.w, btnLeft: s.fsToggle.rect.x }));
    // 按钮不再有文字：图形由 data-act / .armed 决定（CSS 画），语义走 aria-label
    eq('两个按钮里都没有文字（改成纯 CSS 画的图形）', s.fsToggleTxt + '/' + s.fsCancelTxt, '/');
    eq('左按钮是「暂停」态 + 语义 label', s.fsToggleAct + '/' + s.fsToggleLabel, 'pause/暂停');
    ok('★ 运行中真的画出「两条竖条」（暂停图形），三角是收起的',
      s.icoVisible.pause === true && s.icoVisible.play === false, JSON.stringify(s.icoVisible));
    ok('★ 右按钮画出的是 ✕（还没进确认态）',
      s.icoVisible.x === true && s.icoVisible.q === false, JSON.stringify(s.icoVisible));

    const fam = cl => ((String(cl).match(/anim-[a-z0-9-]+/) || [''])[0] + ' '
      + (String(cl).match(/dir-[a-z]+/) || [''])[0]).trim();
    eq('★ 大数字的动画族与桌面时钟完全一致', fam(s.fsCls), fam(s.clockCls),
      'fs="' + s.fsCls + '" clock="' + s.clockCls + '"');
    console.log('截图: ' + await shot('8-fs-layout'));

    // —— 真触摸双击大数字 → 面板（单击不该开；长按已废弃）——
    await touchTap(c, s.fsTime.cx, s.fsTime.cy);
    await wait(430); // 超过 320ms 的判定窗口 → 这一下作废
    s = await c.evaluate(INTROSPECT);
    ok('单击大数字 → 面板不出现（手势已改成双击）', s.uiSheetOpen === false, 'uiSheetOpen=' + s.uiSheetOpen);

    await touchDouble(c, s.fsTime.cx, s.fsTime.cy);
    await wait(320);
    s = await c.evaluate(INTROSPECT);
    ok('★ 双击大数字 → 弹出面板', s.uiSheetOpen === true, 'uiSheetOpen=' + s.uiSheetOpen);
    eq('面板倍率起点 100%', s.uiScaleVal, '100%');
    ok('★ 面板弹出时底边被抬起（大数字仍在面板上方 → 边调边看得见）',
      (s.fsTime.rect.y + s.fsTime.rect.h) <= s.uiSheet.rect.y + 2,
      JSON.stringify({ timeBottom: s.fsTime.rect.y + s.fsTime.rect.h, sheetTop: s.uiSheet.rect.y }));

    // —— 【新】全屏专属两项：模糊数字 + 水位条配色 ——
    ok('★ 双击大数字进来的面板：出现「全屏专属」那一块', s.uiFsBlockHidden === false);
    ok('★ 模糊数字开关 + 色相滑块都真的被画出来了',
      s.uiBlur.painted && s.uiHue.painted && s.uiHueTrack.rect.w > 0,
      JSON.stringify({ blur: s.uiBlur.painted, hue: s.uiHue.painted, track: s.uiHueTrack.rect }));
    eq('模糊数字默认是关的（本机偏好还没写过）', s.fsBlurLS, null);
    eq('开关初始 aria-checked=false', s.uiBlurChecked, 'false');
    const bg0 = s.fsFillBg;
    ok('★ 水位条默认就是原来的橙（--fs-a 走色相 24）',
      /hsl\(24,/.test(s.fsAccentA) && /gradient/.test(bg0), s.fsAccentA + ' | ' + bg0);
    ok('★ 色相圆点初始在左端（24/359 ≈ 6.7%）',
      s.uiHueKnob.rect.x > s.uiHueTrack.rect.x - 6
      && s.uiHueKnob.rect.x < s.uiHueTrack.rect.x + s.uiHueTrack.rect.w * 0.35,
      JSON.stringify({ knob: s.uiHueKnob.rect, track: s.uiHueTrack.rect }));

    // 真触摸把色相条拖到 ~90% → 颜色必须真的跟着变（不是假滑块）
    const hueY = s.uiHueTrack.cy;
    await touchDrag(c, s.uiHueTrack.cx, hueY,
      Math.round(s.uiHueTrack.rect.x + s.uiHueTrack.rect.w * 0.9), hueY);
    await wait(240);
    s = await c.evaluate(INTROSPECT);
    ok('★ 拖动色相条 → 水位条颜色真的变了', s.fsFillBg !== bg0, 'now=' + s.fsFillBg);
    ok('★ 色相按落点算出来（≈ 323）', /hsl\(3[0-4]\d,/.test(s.fsAccentA),
      s.fsAccentA + '  LS=' + s.fsHueLS);
    eq('拖完落盘到本机偏好 dc.fsHue', s.fsHueLS, '323');
    ok('★ 圆点跟着跑到右端（位置按色相画）',
      s.uiHueKnob.rect.x > s.uiHueTrack.rect.x + s.uiHueTrack.rect.w * 0.72,
      JSON.stringify({ knob: s.uiHueKnob.rect, track: s.uiHueTrack.rect }));
    console.log('截图: ' + await shot('8c-fs-accent'));

    await touchTap(c, s.uiAccentReset.cx, s.uiAccentReset.cy);
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    eq('★ 点「默认」→ 色相回到 24（原来那个橙）', s.fsHueLS, '24');
    eq('水位条渐变跟着回到初始色', s.fsFillBg, bg0);

    // 打开模糊数字（真正的效果在关掉面板后再验）
    await touchTap(c, s.uiBlur.cx, s.uiBlur.cy);
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    eq('点模糊开关 → 翻成 aria-checked=true', s.uiBlurChecked, 'true');
    eq('本机偏好落盘 dc.fsBlur=1', s.fsBlurLS, '1');

    // —— 「放大」真的把数字变大，且仍然不越界 ——
    const h0 = s.fsTime.rect.h;
    await touchTap(c, s.uiPlus.cx, s.uiPlus.cy);
    await wait(260);
    s = await c.evaluate(INTROSPECT);
    eq('★ 点「放大」→ 倍率 110%', s.uiScaleVal, '110%');
    ok('★ 大数字真的变大了（不是假按钮）', s.fsTime.rect.h > h0, h0 + ' -> ' + s.fsTime.rect.h);
    ok('★ 放大后仍不越界、也不压到按钮',
      s.fsTime.rect.x + s.fsTime.rect.w <= Math.min(s.fsToggle.rect.x + 1, VW),
      JSON.stringify({ timeRight: s.fsTime.rect.x + s.fsTime.rect.w, btnLeft: s.fsToggle.rect.x, VW }));
    eq('全屏倍率写进本机偏好 dc.fsScale', s.fsScaleLS, '110');
    eq('★ 全屏字号与主界面时钟字号互不影响（没写 dc.clockScale）', s.clockScaleLS, null);
    console.log('截图: ' + await shot('8-fs-scale-110'));

    await touchTap(c, s.uiReset.cx, s.uiReset.cy);
    await wait(200);
    s = await c.evaluate(INTROSPECT);
    eq('「恢复默认」把倍率复位到 100%', s.uiScaleVal, '100%');
    // ⚠️ 「恢复默认」会把这一档的**本机偏好整组清掉** —— 包括上面刚打开的「模糊数字」
    //    （还有水位条色相）。所以这里必须重新打开一次，否则下面那段
    //    「静止 5 秒 → 秒数变 --」永远不可能成立（曾经就是被这一步悄悄关掉的，
    //    表现成「模糊功能坏了」，其实是测试自己关的）。
    await touchTap(c, s.uiBlur.cx, s.uiBlur.cy);
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    eq('（准备）恢复默认后重新打开模糊数字', s.uiBlurChecked, 'true');
    eq('（准备）重新打开后倍率仍是 100%', s.uiScaleVal, '100%');
    await touchTap(c, s.uiClose.cx, s.uiClose.cy);
    await wait(240);
    s = await c.evaluate(INTROSPECT);
    ok('关掉面板 → 全屏还在（接着看大字）', s.fsShow === true && s.uiSheetOpen === false,
      'fsShow=' + s.fsShow + ' sheet=' + s.uiSheetOpen);

    // —— 【新】模糊数字的真实效果：静止 5 秒 → 秒那两位变 --；一有操作立刻复原 ——
    // （开关在上面已经打开；这里完全不动，等它自己模糊）
    // 先锁住前提：每秒的本地倒扣必须还在跑（它同时驱动全屏大字刷新与「5 秒静止」判定）。
    // 若这里就开始不动，模糊永远不会发生 —— 那才是真 bug，别让它在下面伪装成「模糊没生效」。
    const tk1 = (await c.evaluate(INTROSPECT)).fsText;
    await wait(1300);
    const tk2 = (await c.evaluate(INTROSPECT)).fsText;
    ok('页面每秒倒扣仍在跑（全屏大字在跳）', tk1 !== tk2, tk1 + ' -> ' + tk2);
    let bl = false;
    for (let i = 0; i < 14 && !bl; i++) {
      await wait(500);
      s = await c.evaluate(INTROSPECT);
      bl = /--$/.test(s.fsText || '');
    }
    eq('★ 静止 5 秒多 → 秒数变成 --（模糊数字已开）', bl, true,
      'data-t=' + s.fsText + ' blurLS=' + s.fsBlurLS + ' fsScaleLS=' + s.fsScaleLS);
    ok('模糊的只是秒那两位，时与分照旧', /^\d\d:--$/.test(s.fsText || ''), s.fsText);
    ok('大数字仍画得出来（只是秒换成 --）', s.fsTime.painted && s.fsTime.rect.w > 0,
      JSON.stringify(s.fsTime.rect));
    console.log('截图: ' + await shot('8d-fs-blur'));

    await touchTap(c, 195, 430); // 屏幕上任意一下操作
    let bk = false;
    for (let i = 0; i < 8 && !bk; i++) {
      await wait(400);
      s = await c.evaluate(INTROSPECT);
      bk = /\d\d$/.test(s.fsText || '');
    }
    eq('★ 有任何操作 → 秒数立刻恢复显示', bk, true, 'data-t=' + s.fsText);

    // —— 暂停 / 取消 两个按钮在真链路里真的写进去了 ——
    writes.length = 0;
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.fsToggle.cx, s.fsToggle.cy);
    await wait(400);
    s = await c.evaluate(INTROSPECT);
    ok('★ 点「暂停」→ 真的发到宿主（action=pause）',
      writes.some(w => w.action === 'pause'), JSON.stringify(writes));
    eq('★ 暂停成功后按钮翻成「继续」态（data-act=resume）', s.fsToggleAct, 'resume');
    ok('★ 图形跟着换成三角（两条竖条收起）',
      s.icoVisible.play === true && s.icoVisible.pause === false, JSON.stringify(s.icoVisible));

    writes.length = 0;
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.fsCancel.cx, s.fsCancel.cy);
    await wait(260);
    s = await c.evaluate(INTROSPECT);
    ok('「取消」第一下 → 只进确认态（变红 + 语义变「确认取消」）',
      s.fsCancelArmed === true && s.fsCancelLabel === '确认取消',
      JSON.stringify({ armed: s.fsCancelArmed, label: s.fsCancelLabel }));
    ok('★ 确认态真的换了图形（✕ 收起、「?」出现）',
      s.icoVisible.q === true && s.icoVisible.x === false, JSON.stringify(s.icoVisible));
    ok('★ 「?」真的被画出来了：钩 + 底下那一点都有尺寸',
      s.icoQParts.hook === true && s.icoQParts.dot === true, JSON.stringify(s.icoQParts));
    console.log('截图: ' + await shot('8e-fs-armed-question'));
    eq('第一下没有写出任何东西', writes.length, 0);
    await touchTap(c, s.fsCancel.cx, s.fsCancel.cy);
    await wait(420);
    s = await c.evaluate(INTROSPECT);
    ok('★ 第二下 → 真的发给宿主删除（action=delete）',
      writes.some(w => w.action === 'delete'), JSON.stringify(writes));
    ok('★ 删掉当前这条 → 自动退出全屏', s.fsShow === false, 'fsShow=' + s.fsShow);

    // 还原一条运行中的，别影响后面
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    await pull();
    await wait(300);

    // ====== 阶段 8.5：冷路径 —— 胶囊已淡出时，第一次按下按钮就必须生效 ======
    // 用户实测报的 bug：「必须先点一下（把时钟胶囊点出来），按钮才有反应」。
    // 真机上这一下 pointerdown 会顺带唤醒全屏里的时钟胶囊（visibility + transform 变化
    // → 合成层重建），整下 click 跟着被丢掉 —— 所以按钮改成「按下即触发」：
    // **不发 touchEnd、浏览器根本不会生成 click，也必须立刻生效**。
    console.log('\n--- 阶段 8.5：冷路径（时钟胶囊已淡出 → 第一次按下按钮就生效）---');
    await touchTap(c, 195, 430);
    await wait(220);
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.fab.cx, s.fab.cy);
    // 进全屏 ≈1.06s → 轮询到界面真的切过去，再多等 .22s 淡入
    for (let k = 0; k < 30 && !s.fsShow; k++) { await wait(100); s = await c.evaluate(INTROSPECT); }
    await wait(300);
    s = await c.evaluate(INTROSPECT);
    ok('（准备）重新进全屏', s.fsShow === true, 'fsShow=' + s.fsShow);

    await wait(3900); // 全屏里什么都不碰 → 时钟胶囊自己淡出
    s = await c.evaluate(INTROSPECT);
    ok('（准备）时钟胶囊已淡出（pill 带 idle）', s.pill.cls.indexOf('idle') >= 0, s.pill.cls);
    ok('（准备）胶囊淡出期间按钮不受影响：仍可见、可点、命中栈里有它',
      s.fsToggle.painted && s.fsToggle.pointerEvents === 'auto'
      && s.fsToggle.inStack.indexOf('fs-toggle') >= 0,
      'painted=' + s.fsToggle.painted + ' pe=' + s.fsToggle.pointerEvents
      + ' onTop=' + s.fsToggle.onTop + ' 栈=' + JSON.stringify(s.fsToggle.inStack));
    eq('图标是纯装饰：不吃指针事件（落点永远落在按钮上）', s.icoPointer, 'none');

    // ★★ 关键：只按下、不抬手指（不发 touchEnd → 浏览器压根不会生成 click）
    writes.length = 0;
    await touchDown(c, s.fsToggle.cx, s.fsToggle.cy);
    await wait(340);
    s = await c.evaluate(INTROSPECT);
    const wroteOnDown = writes.length;
    await touchUp(c);
    await wait(300);
    ok('★★ 冷路径：只按下（还没抬手指）就已经写入宿主 —— 不等 click、也不用先点屏幕',
      wroteOnDown === 1, JSON.stringify(writes));
    eq('★★ 而且动作是对的（按下「暂停」→ action=pause）',
      (writes[0] || {}).action, 'pause');
    eq('抬手指后没有重复写入（紧随的 click 被吞掉）', writes.length, 1);
    eq('按钮状态真的翻过去了（data-act=resume）', s.fsToggleAct, 'resume');
    ok('★ 图形跟着换：三角出现、两条竖条收起',
      s.icoVisible.play === true && s.icoVisible.pause === false, JSON.stringify(s.icoVisible));
    console.log('截图: ' + await shot('8b-fs-cold-tap'));

    // 还原成运行中（再按一下），然后退出全屏
    writes.length = 0;
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.fsToggle.cx, s.fsToggle.cy);
    await wait(420);
    eq('再按一下 → 继续（action=resume）', (writes[0] || {}).action, 'resume');
    s = await c.evaluate(INTROSPECT);
    ok('图形换回两条竖条', s.icoVisible.pause === true && s.icoVisible.play === false,
      JSON.stringify(s.icoVisible));
    await touchTap(c, 195, 430);
    await wait(200);
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.pill.cx, s.pill.cy);
    await wait(320);
    s = await c.evaluate(INTROSPECT);
    ok('退出全屏（准备下一阶段）', s.fsShow === false, 'fsShow=' + s.fsShow);

    // ====== 阶段 9：真触摸双击主界面时钟 → 显示设置面板（长按已改成双击） ======
    // 用户要求：长按「时钟数字 / 全屏倒计时数字」两处手势改成双击；
    // **胶囊的长按手势暂时不变**（长按胶囊仍 = 开抽屉）。
    console.log('\n--- 阶段 9：真触摸双击时钟 → 显示设置面板 ---');
    s = await c.evaluate(INTROSPECT);
    const clockCx = s.clock.cx, clockCy = s.clock.cy;
    ok('（准备）时钟有真实尺寸且在视口里',
      s.clock.rect.w > 0 && s.clock.rect.h > 0, JSON.stringify(s.clock.rect));
    ok('★ 一次性提示改成「双击」的说法了', /双击/.test(s.hintTxt), s.hintTxt);

    await touchTap(c, clockCx, clockCy);
    await wait(450); // 超过判定窗口 → 这一下作废
    s = await c.evaluate(INTROSPECT);
    ok('单击时钟 → 面板不出现（双击才开）', s.uiSheetOpen === false, 'uiSheetOpen=' + s.uiSheetOpen);

    await touchDouble(c, clockCx, clockCy);
    await wait(420);
    s = await c.evaluate(INTROSPECT);
    ok('★ 真触摸双击时钟 → 手机端显示面板打开（不被紧随的 click 自己点掉）',
      s.uiSheetOpen === true, 'uiSheetOpen=' + s.uiSheetOpen);
    eq('面板标题是「手机端显示」', s.uiTitle, '手机端显示');
    ok('★ 双击时钟进来的面板里**没有**「全屏专属」那一块（它只给全屏倒计时）',
      s.uiFsBlockHidden === true, 'hidden=' + s.uiFsBlockHidden);
    ok('面板真的被画出来且没被压住',
      s.uiSheet.painted && s.uiSheet.inStack.indexOf('ui-sheet') >= 0,
      JSON.stringify({ painted: s.uiSheet.painted, onTop: s.uiSheet.onTop }));
    console.log('截图: ' + await shot('9-clock-panel'));
    await touchTap(c, s.uiClose.cx, s.uiClose.cy);
    await wait(320);
    s = await c.evaluate(INTROSPECT);
    ok('关掉面板', s.uiSheetOpen === false, 'uiSheetOpen=' + s.uiSheetOpen);

    // 用户明确说「胶囊的长按手势暂时不变」→ 顺手把它锁住：长按胶囊仍然是开抽屉
    // ⚠️ 长按前必须确认胶囊**真的有尺寸**：它可能在 3 秒无操作后淡出（那是 .idle，仍有布局盒），
    //    也可能被上一阶段的收尾留在 hidden-fab（display:none → rect 全 0，按 (0,0) 打空）。
    //    所以先摸一下屏幕把它唤回来，并把「唤不回来」这件事本身报出来（附内部状态，便于定位）。
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, 195, 430);
    await wait(300);
    s = await c.evaluate(INTROSPECT);
    ok('（准备）胶囊已现身且有真实尺寸（长按点得到）',
      s.fab.cls.indexOf('hidden-fab') < 0 && s.fab.rect.w > 40 && s.fab.rect.h > 20,
      JSON.stringify({ cls: s.fab.cls, rect: s.fab.rect, stack: s.fab.inStack }));
    await touchHold(c, s.fab.cx, s.fab.cy, 640);
    await wait(340);
    s = await c.evaluate(INTROSPECT);
    ok('★ 胶囊的长按手势保持不变（长按 → 开抽屉，而不是进全屏）',
      s.sheetOpen === true && s.fsShow === false,
      'sheetOpen=' + s.sheetOpen + ' fsShow=' + s.fsShow);
    // ⚠️ 点遮罩收起抽屉时，落点必须**避开胶囊**（顶部居中 14~58px）与抽屉本体（底部最高 88vh）。
    //    以前用 (195,30) —— 那正好是胶囊的位置：抽屉要是已经关了，这一下就变成「点胶囊进全屏」，
    //    把后面整片阶段 10 拖进「胶囊 hidden-fab / 全屏已开着」的错位状态（踩过）。
    await touchTap(c, 30, 80); // 左上角：既不是胶囊、也在抽屉上方
    await wait(400);
    s = await c.evaluate(INTROSPECT);
    ok('（准备）抽屉已收起', s.sheetOpen === false, 'sheetOpen=' + s.sheetOpen);
    ok('（准备）收抽屉那一下没有误进全屏', s.fsShow === false, 'fsShow=' + s.fsShow);

    // ====== 阶段 10：胶囊位置 / 进出全屏形变 / 到点掠屏 / 独立字体与动画 ======
    console.log('\n--- 阶段 10：形变动画 + 掠屏 + 独立字体与动画 ---');

    // ① 未全屏时，倒计时胶囊与全屏里的时钟胶囊**同位置**（顶部居中）
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 300000,
      state: 'running', endAt: new Date(Date.now() + 300000).toISOString(),
    }];
    await pull(); await wait(420);
    // ⚠️ 胶囊可能在 3 秒无操作后淡出，也可能被上一阶段留在 hidden-fab（display:none → rect 全 0）。
    //    先摸一下屏幕把它唤回来并断言「有真实尺寸」——否则下面按 (0,0) 打空，一整片用例连锁失败。
    await touchTap(c, 195, 430);
    await wait(300);
    s = await c.evaluate(INTROSPECT);
    ok('（准备）胶囊现身且有真实尺寸',
      s.fab.cls.indexOf('hidden-fab') < 0 && s.fab.rect.w > 40 && s.fab.rect.h > 20,
      JSON.stringify({ cls: s.fab.cls, rect: s.fab.rect, stack: s.fab.inStack }));
    ok('★ 未全屏时胶囊也在顶部（不再吸底）',
      s.fab.rect.y >= 0 && s.fab.rect.y <= 40 && s.fab.rect.y + s.fab.rect.h < 100,
      JSON.stringify(s.fab.rect));
    ok('★ 两颗胶囊水平中心一致（形变首尾才接得上）',
      Math.abs(s.fab.cx - s.pill.cx) <= 2, s.fab.cx + ' vs ' + s.pill.cx);
    ok('★ 两颗胶囊顶部一致（与全屏时钟胶囊同位置）',
      Math.abs(s.fab.rect.y - s.pill.rect.y) <= 2, s.fab.rect.y + ' vs ' + s.pill.rect.y);

    // ② 点胶囊进全屏：① 形变 0.8s → ② 形变层收起 + 立即切界面（空等已归 0）
    const fabRect0 = s.fab.rect;
    await touchTap(c, s.fab.cx, s.fab.cy);
    await wait(90);
    const m1 = await c.evaluate(INTROSPECT);
    await wait(200);
    const m2 = await c.evaluate(INTROSPECT);
    ok('★ 进全屏途中形变层可见（真的在放动画）',
      m1.morph.visibility === 'visible', 'visibility=' + m1.morph.visibility);
    ok('★ 形变层在长大（两次采样宽度递增，且还没到整屏）',
      m2.morph.rect.w > m1.morph.rect.w && m2.morph.rect.w <= m2.viewport.w,
      JSON.stringify({ w1: m1.morph.rect.w, w2: m2.morph.rect.w, vw: m2.viewport.w }));
    ok('形变起点就是胶囊本身（宽度量级对得上）',
      Math.abs(m1.morph.rect.w - fabRect0.w) < 100,
      JSON.stringify({ morph: m1.morph.rect.w, fab: fabRect0.w }));
    // ★ 形变放完之后**不再空等**（用户把空等从 0.8s / 0.3s 一路调回 0）—— 0.6s 处形变还在放，
    //    界面当然没切（#fs-view 还没 .show，底下是原样的时钟）。
    await wait(310); // 累计 ≈600ms
    const m3 = await c.evaluate(INTROSPECT);
    ok('★ 0.6s：形变还在放、界面还没切（底下是时钟）',
      m3.morph.visibility === 'visible' && m3.fsShow === false,
      JSON.stringify({ vis: m3.morph.visibility, show: m3.fsShow, cls: m3.fsViewCls }));
    console.log('截图: ' + await shot('10a-fs-morph'));
    // ★ 形变放完（840ms）→ 形变层「到位即隐」、**同一拍**切界面（空等已归 0）。
    //   所以「铺满」只存在于一瞬 → 别等它；轮询「形变层 hidden」那一刻采样。
    //   （不写死毫秒：每次 evaluate 自身有 ~50ms 开销，之前撞过。）
    for (let k = 0; k < 25; k++) {
      s = await c.evaluate(INTROSPECT);
      if (s.morph.visibility === 'hidden') break;
      await wait(30);
    }
    ok('★ 形变层里的水位条与真背景**同源**（同一条渐变、同一色相 —— 到位那一刻画面一致）',
      s.morphFillBg === s.fsFillBg,
      JSON.stringify({ morph: s.morphFillBg, fs: s.fsFillBg }));
    ok('★ 形变层是「按比例的水位条」而不是纯色块（形变中途已长到接近真背景的宽度）',
      m3.morphFill.rect.w > m3.fsFill.rect.w * 0.6,
      JSON.stringify({ morphFill: m3.morphFill.rect.w, fsFill: m3.fsFill.rect.w }));
    ok('形变层不吃事件（纯装饰）', s.morph.pointerEvents === 'none', s.morph.pointerEvents);
    // ★ 收层与切界面是同一拍（空等为 0）
    ok('★ 形变放完即收层 + 立即切界面（#fs-view 这时已 .show，中间没有空等）',
      s.morph.visibility === 'hidden' && s.fsShow === true,
      JSON.stringify({ vis: s.morph.visibility, show: s.fsShow, cls: s.fsViewCls }));
    await wait(300); // 等 .22s 淡入跑完
    s = await c.evaluate(INTROSPECT);
    ok('形变层已收干净', s.morph.visibility === 'hidden', s.morph.visibility);

    // ③ 出全屏：反向缩回胶囊（这一拍仍是短的一下 —— 回时钟要干脆）
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.pill.cx, s.pill.cy);
    await wait(90);
    const b1 = await c.evaluate(INTROSPECT);
    await wait(460);
    s = await c.evaluate(INTROSPECT);
    ok('★ 出全屏时形变层可见（从整屏开始收缩）',
      b1.morph.visibility === 'visible', 'visibility=' + b1.morph.visibility);
    ok('出全屏后形变层收起、回到时钟',
      s.morph.visibility === 'hidden' && s.fsShow === false,
      JSON.stringify({ vis: s.morph.visibility, show: s.fsShow }));

    // ④ 到点掠屏（剩余归零 + 仍在运行）
    items = [{
      id: 'cd_000001_a1', name: '泡面', durationMs: 600000, remainingMs: 0,
      state: 'running', endAt: new Date(Date.now() - 5000).toISOString(),
    }];
    await pull(); await wait(420);
    await touchTap(c, 195, 430); // 唤醒胶囊（淡出态点不到）
    await wait(300);
    // ⚠️ 提醒条是「上滑入场」的（transform 过渡）：cls 一带上 .show 就断言会量到中间态
    //    （实测 y=35，还没滑到 66）→ 假失败。等它**滑到位**再验。
    for (let k = 0; k < 20; k++) {
      s = await c.evaluate(INTROSPECT);
      if (s.alert.rect.y >= 60) break;
      await wait(60);
    }
    // 到点提醒条也在顶部（z-index 60，左右 12px 的整条横幅）→ 必须让开胶囊，
    // 否则这一下会打在横幅上、openFs 压根不被调用（实测踩到过）。
    ok('★ 到点时提醒条确实弹着（下面那条断言才有意义）',
      s.alert.cls.indexOf('show') >= 0, s.alert.cls);
    ok('★ 提醒条没有压住顶部胶囊（提醒中照样点得进全屏看掠屏）',
      s.fab.inStack.indexOf('cd-alert') < 0,
      JSON.stringify({ fabStack: s.fab.inStack, alert: s.alert.rect, fab: s.fab.rect }));
    await enterFs(c);
    s = await c.evaluate(INTROSPECT);
    ok('（准备）进入全屏', s.fsShow === true,
      'fsShow=' + s.fsShow + ' fab=' + JSON.stringify(s.fab) + ' alert=' + JSON.stringify(s.alert));
    ok('★ 到点 → 全屏挂上 .rung', /rung/.test(s.fsViewCls), s.fsViewCls);
    ok('★ 掠屏色块真的被画出来（有宽度、可见）',
      s.sweep.rect.w > 40 && s.sweep.painted, JSON.stringify({ w: s.sweep.rect.w, p: s.sweep.painted }));
    ok('掠屏默认是红色（浅—深—浅三档）', /220,\s*38,\s*38/.test(s.sweepBg), s.sweepBg);
    const xs = [];
    for (let i = 0; i < 4; i++) { xs.push((await c.evaluate(INTROSPECT)).sweep.rect.x); await wait(230); }
    const inc = xs.slice(1).filter((v, i) => v > xs[i]).length;
    ok('★ 色块在向右移动（单向递增，不是左右来回）', inc >= 2, JSON.stringify(xs));
    console.log('截图: ' + await shot('10b-fs-rung'));

    s = await c.evaluate(INTROSPECT);
    await touchDown(c, s.fsToggle.cx, s.fsToggle.cy); // 按下即触发
    await touchUp(c);
    await wait(560);
    s = await c.evaluate(INTROSPECT);
    ok('★ 暂停后不再是「到点」→ 掠屏停（.rung 摘掉）', !/rung/.test(s.fsViewCls), s.fsViewCls);

    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.pill.cx, s.pill.cy); // 退出全屏
    await wait(600);

    // ⑤ 手机端独立字体 + 独立动画（双击时钟的面板）
    // 同 ⑦：双击链路先重试到「面板真的开了」再往下走，避免一整片面板用例连锁假失败。
    let panelOk5 = false;
    for (let i = 0; i < 4 && !panelOk5; i++) {
      s = await c.evaluate(INTROSPECT);
      await touchDouble(c, s.clock.cx, s.clock.cy);
      await wait(620);
      s = await c.evaluate(INTROSPECT);
      panelOk5 = s.uiSheetOpen === true && s.uiClockBlockHidden === false && s.uiFsBlockHidden === true;
    }
    ok('（准备）双击时钟 → 面板打开且出现「字体 / 动画」块', panelOk5,
      JSON.stringify({ open: s.uiSheetOpen, cb: s.uiClockBlockHidden, fb: s.uiFsBlockHidden }));
    eq('字体给 7 个选项', s.fontChips.length, 7);
    ok('默认选中「跟随电脑」', s.fontChips[0] && s.fontChips[0].active === true, JSON.stringify(s.fontChips[0]));

    const f2 = s.fontChips[2];
    if (!f2) throw new Error('字体 chips 不足（面板没打开或没渲染）: ' + JSON.stringify(s.fontChips));
    await touchTap(c, f2.x, f2.y);
    await wait(280);
    s = await c.evaluate(INTROSPECT);
    eq('点「无衬线」→ 落盘 dc.clockFont=sans', s.clockFontLS, 'sans');
    ok('★ 页面字体真的换了（真实 computed font-family）', /PingFang SC/.test(s.bodyFont), s.bodyFont);

    const aScale = s.animChips.find(x => x.v === 'scale');
    if (!aScale) throw new Error('动画 chips 里没有「缩放」（面板没打开或没渲染）: ' + JSON.stringify(s.animChips));
    await touchTap(c, aScale.x, aScale.y);
    await wait(280);
    s = await c.evaluate(INTROSPECT);
    eq('点「缩放」→ 落盘 dc.animType=scale', s.animTypeLS, 'scale');
    ok('★ 时钟 class 换成 anim-scale（与电脑端独立）', /anim-scale/.test(s.clockCls), s.clockCls);
    ok('★ 方向行出现（缩小 / 放大）',
      s.uiDirHidden === false && s.dirChips.length === 2, JSON.stringify(s.dirChips));
    const g = s.dirChips.find(x => x.v === 'grow');
    if (!g) throw new Error('方向 chips 里没有「放大」（方向行没出现？）: ' + JSON.stringify(s.dirChips));
    await touchTap(c, g.x, g.y);
    await wait(280);
    s = await c.evaluate(INTROSPECT);
    ok('★ 点「放大」→ class 带 anim-scale dir-grow',
      /anim-scale/.test(s.clockCls) && /dir-grow/.test(s.clockCls), s.clockCls);
    eq('落盘 dc.animDir=grow', s.animDirLS, 'grow');

    const dur0 = s.uiDurVal;
    // ⚠️ [v1.0.5.7] 面板里多了「节奏」一行之后内容更高，时长那行会被 .cd-body 滚出可视区 →
    //    整下会打在面板外面（既可能假失败、也可能因为没点到而「看起来没事」）。点之前先把它
    //    滚进视口，并断言落点真的压在按钮上 —— 避免以后又靠打空来伪装。
    for (let i = 0; i < 6 && s.uiDurPlus.inStack.indexOf('ui-dur-plus') < 0; i++) {
      await c.evaluate("(()=>{var b=document.getElementById('ui-dur-plus');"
        + "if(b&&b.scrollIntoView)b.scrollIntoView({block:'center'});return 1;})()");
      await wait(220);
      s = await c.evaluate(INTROSPECT);
    }
    ok('（准备）时长「+」已滚进可视区（落点真的落在它身上）',
      s.uiDurPlus.inStack.indexOf('ui-dur-plus') >= 0,
      JSON.stringify({ stack: s.uiDurPlus.inStack, rect: s.uiDurPlus.rect }));
    await touchTap(c, s.uiDurPlus.cx, s.uiDurPlus.cy);
    await wait(280);
    s = await c.evaluate(INTROSPECT);
    ok('★ 点 + → 时长变长并落盘', s.uiDurVal !== dur0 && s.animDurLS !== null,
      s.uiDurVal + '（原 ' + dur0 + '）');
    eq('★ 本机时长真的写进计时元素（覆盖电脑的 350ms）', s.animDurVar, s.uiDurVal,
      'animDurVar=' + s.animDurVar);

    // ★ [v1.0.5.7] 数字动画「节奏」：量**真实算出来的缓动曲线**，而不是只看 --anim-ease 字符串。
    //    变量写错（非法值 / 写成空串）会让整条 transition 声明失效、曲线悄悄退回 ease ——
    //    那种假绿只有读 computed 才抓得到。
    const RB = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // 翻转 / 缩放的原有回弹曲线
    eq('★ 没设过节奏 → 主数字用各动画原有的回弹曲线', s.digitEase, RB, s.digitEase);
    eq('节奏 chips 共 6 档（含「跟随电脑」）', s.easeChips.length, 6);
    eq('默认高亮「跟随电脑」', (s.easeChips.find(x => x.active) || {}).v, 'auto');
    eq('没设过时本机没有节奏键', s.animEaseLS, null);

    // 逐个真点：先把落点滚进可视区（面板内容比视口高），再按真实坐标点下去
    const tapEase = async (v) => {
      await c.evaluate("(()=>{var b=document.querySelector('#ui-ease-chips button[data-v=\""
        + v + "\"]');if(b&&b.scrollIntoView)b.scrollIntoView({block:'center'});return 1;})()");
      await wait(240);
      s = await c.evaluate(INTROSPECT);
      const ch = s.easeChips.find(x => x.v === v);
      if (!ch) throw new Error('节奏 chips 里没有「' + v + '」：' + JSON.stringify(s.easeChips));
      await touchTap(c, ch.x, ch.y);
      await wait(280);
      s = await c.evaluate(INTROSPECT);
    };

    await tapEase('linear');
    eq('点「匀速」→ 落盘 dc.animEase=linear', s.animEaseLS, 'linear');
    eq('★ 真实曲线变成 linear（不是只有变量变了）', s.digitEase, 'linear', s.digitEase);
    console.log('截图: ' + await shot('10d-clock-ease'));

    // ⚠️ transition-timing-function 的 computed 值是「按书写形式保留」的：关键字就是关键字，
    //    不会展开成 cubic-bezier（只有真的写 cubic-bezier 才原样返回）。所以这里断言关键字本身。
    await tapEase('ease-in');
    eq('点「慢起」→ 曲线是 ease-in（起点慢、后段快）', s.digitEase, 'ease-in', s.digitEase);

    await tapEase('ease-out');
    eq('点「慢停」→ 曲线是 ease-out（起点快、收尾慢）', s.digitEase, 'ease-out', s.digitEase);

    await tapEase('ease-in-out');
    eq('点「两头慢」→ 曲线是 ease-in-out（两头慢、中间快）', s.digitEase, 'ease-in-out', s.digitEase);

    await tapEase('default');
    eq('点「弹性」→ 落盘 default', s.animEaseLS, 'default');
    eq('★ 弹性档把 --anim-ease 删干净（不是留一个空串）', s.clockEaseVar, '', s.clockEaseVar);
    eq('★ 弹性档的曲线回到各动画原有的回弹曲线', s.digitEase, RB, s.digitEase);

    await tapEase('auto');
    eq('点「跟随电脑」→ 本机值回到 auto', s.animEaseLS, 'auto');
    eq('跟随电脑（宿主 default）→ 仍是回弹曲线', s.digitEase, RB, s.digitEase);

    console.log('截图: ' + await shot('10c-clock-font-anim'));

    // ⑥ 全屏大字也用手机本机那套动画
    await touchTap(c, s.uiClose.cx, s.uiClose.cy);
    await wait(340);
    await touchTap(c, 195, 430); // 唤醒胶囊（关面板后它可能已经淡出，淡出态点不到）
    await wait(300);
    await enterFs(c);
    s = await c.evaluate(INTROSPECT);
    ok('（准备）再次进入全屏', s.fsShow === true, 'fsShow=' + s.fsShow);
    ok('★ 全屏大字的动画也换成手机本机那套（anim-scale dir-grow）',
      /anim-scale/.test(s.fsCls) && /dir-grow/.test(s.fsCls), s.fsCls);
    eq('全屏大字的时长也跟着本机', s.fsDurVar, s.uiDurVal, 'fsDurVar=' + s.fsDurVar);
    // 此刻本机节奏是「跟随电脑」而宿主是默认档 → 全屏大字同样不该有 --anim-ease
    eq('★ 全屏大字的节奏也跟随同一份设置', s.fsEaseVar, '', 'fsEaseVar=' + s.fsEaseVar);

    // ⑦ 「恢复默认」把本机偏好清干净
    s = await c.evaluate(INTROSPECT);
    await touchTap(c, s.pill.cx, s.pill.cy);
    await wait(600); // 等回时钟的收尾动画放完（这一拍是短的 0.32s）
    // ⚠️ 「双击 → 面板」这条链路必须先确认面板真的开了，再去点面板里的按钮：
    //    否则一旦这一下没跟上（合成 click 被吞/落点被布局变动带走），
    //    后面所有「面板按钮」断言会一起失败，看不出根因。
    let panelOk = false;
    for (let i = 0; i < 4 && !panelOk; i++) {
      s = await c.evaluate(INTROSPECT);
      await touchDouble(c, s.clock.cx, s.clock.cy);
      await wait(620);
      s = await c.evaluate(INTROSPECT);
      panelOk = s.uiSheetOpen === true && s.uiClockBlockHidden === false;
    }
    ok('（准备）双击时钟 → 面板再次打开', panelOk,
      JSON.stringify({ open: s.uiSheetOpen, cb: s.uiClockBlockHidden }));
    // ⚠️ 「时钟」版面板内容很高（字体 / 动画 / 方向 / 时长四行 chips）→ .cd-body 会滚动，
    //    最底下的「恢复默认」被滚到可视区之外（实测落点 y≈969 > 视口 844，整下打在面板外面 →
    //    什么都没发生，字体/动画键全留着）。真机上用户也是先滑一下再点 —— 这里照做，
    //    并断言「落点真的压在按钮上」，免得以后又靠打空来伪装成「重置没生效」。
    for (let i = 0; i < 6 && s.uiReset.inStack.indexOf('ui-reset') < 0; i++) {
      await c.evaluate("(()=>{var b=document.getElementById('ui-reset');"
        + "if(b&&b.scrollIntoView)b.scrollIntoView({block:'center'});return 1;})()");
      await wait(220);
      s = await c.evaluate(INTROSPECT);
    }
    ok('（准备）「恢复默认」已滚进可视区（落点真的落在它身上）',
      s.uiReset.inStack.indexOf('ui-reset') >= 0,
      JSON.stringify({ stack: s.uiReset.inStack, rect: s.uiReset.rect }));
    await touchTap(c, s.uiReset.cx, s.uiReset.cy);
    await wait(340);
    s = await c.evaluate(INTROSPECT);
    eq('「恢复默认」清掉字体键', s.clockFontLS, null);
    eq('也清掉动画家族键', s.animTypeLS, null);
    eq('也清掉节奏键', s.animEaseLS, null);
    ok('时钟回到电脑那套（anim-flip dir-up）',
      /anim-flip/.test(s.clockCls) && /dir-up/.test(s.clockCls), s.clockCls);
    await touchTap(c, s.uiClose.cx, s.uiClose.cy);
    await wait(340);

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
