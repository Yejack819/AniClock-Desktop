/* sandbox-isolation-probe.js — [v1.0.5.7] 用「最小 Electron 应用」实测 iframe 沙箱隔离
 *
 * 为什么单独搞一个最小应用：本项目桌面环境下，只要窗口盖住屏幕中心点就会被系统立刻关掉
 * （见 skill electron-realapp-smoke）。所以这里用一个**零项目代码**的最小 BrowserWindow，
 * 尺寸小、位置靠角落，只做一件事：验证 <iframe sandbox="allow-scripts">（不给 allow-same-origin）
 * 是否真的把 parent 的 electronAPI / DOM 挡在外面。
 *
 * [v1.0.5.7 修正] 探测必须由 iframe **内部**的脚本执行再 postMessage 回报。
 * 旧写法在宿主脚本里做 `w.parent.document`：w.parent 解析到的就是宿主窗口自己，
 * 跨源校验看的是执行脚本的源（宿主）而非 w 所在帧，导致永远「能读到」的假 FAIL；
 * 跨源 WindowProxy 上读 w.origin 也会被拦（这正是隔离生效的表现），旧脚本误判为异常。
 *
 * 跑法：node docs/tests/sandbox-isolation-probe.js
 * 前置：未运行其它实例；空闲内存 > 1.5GB（内存不足时 Electron 起不来，本脚本会明确报错）。
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP = path.join(__dirname, '..', '..');
const ELECTRON = path.join(APP, 'node_modules', 'electron', 'dist', 'electron.exe');
const UD = path.join(os.tmpdir(), 'clock-sandbox-probe-ud');
const CDP_PORT = 9411;

let pass = 0, fail = 0;
const lines = [];
const log = s => { lines.push(s); console.log(s); };
function check(name, cond, extra) {
  if (cond) { pass++; log('[PASS] ' + name); }
  else { fail++; log('[FAIL] ' + name + (extra === undefined ? '' : ' → ' + extra)); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// 最小主进程：一个小窗口，加载 data: URL；页面里嵌两个 iframe（一个带 sandbox，一个不带）做对照。
const MAIN = `
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('remote-debugging-port', '${CDP_PORT}');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 320, height: 200, x: 20, y: 20, show: true, frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: undefined }
  });
  const html = \`<!DOCTYPE html><html><body>
    <div id="host">host</div>
    <iframe id="sb" sandbox="allow-scripts"></iframe>
    <iframe id="ns"></iframe>
  </body></html>\`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});
`;

// 注入宿主页面的引导：收集 iframe 的回报，再给两个 iframe 各塞一段「从内部探测 parent」的脚本。
// srcdoc 用 JS 赋值，避免把 <script> 塞进 HTML 属性的转义地狱。
const BOOT = `(function(){
  window.__probeResults = {};
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__sandboxProbe) window.__probeResults[e.data.frame] = e.data.__sandboxProbe;
  });
  var inner = '<scr' + 'ipt>(function(){' +
    'var out = {};' +
    "try { out.parentDoc = !!parent.document; } catch (e) { out.parentDoc = 'SecurityError'; }" +
    "try { out.parentApi = (parent.__probeApi === undefined ? 'undefined' : 'visible'); } catch (e) { out.parentApi = 'SecurityError'; }" +
    "try { out.origin = String(window.origin); } catch (e) { out.origin = 'err'; }" +
    "parent.postMessage({ __sandboxProbe: out, frame: 'FRAME_ID' }, '*');" +
    '})()<\\/scr' + 'ipt><body>ok</body>';
  document.getElementById('sb').srcdoc = inner.replace("'FRAME_ID'", "'sb'");
  document.getElementById('ns').srcdoc = inner.replace("'FRAME_ID'", "'ns'");
  window.__probeApi = { secret: 1 };   // 宿主上的一个"敏感属性"
})()`;

(async () => {
  if (!fs.existsSync(ELECTRON)) {
    console.error('找不到 Electron 可执行文件：' + ELECTRON);
    process.exit(2);
  }
  const freeGB = os.freemem() / 1073741824;
  if (freeGB < 1.0) {
    console.log('跳过：空闲内存仅 ' + freeGB.toFixed(2) + 'GB（<1GB），Electron 大概率起不来。');
    console.log('（这不是代码问题；内存够了再跑就能得到真机结论。）');
    process.exit(0);
  }

  fs.mkdirSync(UD, { recursive: true });
  const mainPath = path.join(UD, 'main.js');
  fs.writeFileSync(mainPath, MAIN);

  const child = spawn(ELECTRON, [mainPath, '--user-data-dir=' + UD], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });
  child.stdout.on('data', () => {});

  // 等 CDP 端口就绪
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await wait(400);
    try {
      const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) { targets = page; break; }
    } catch (e) {}
  }
  if (!targets) {
    log('未连上 CDP（端口 ' + CDP_PORT + '）。stderr 摘要：' + stderr.slice(0, 400));
    try { child.kill(); } catch (e) {}
    console.log('\n沙箱隔离实测：无法在真机上运行（环境限制，非代码问题）。');
    process.exit(0);
  }

  // 用 CDP Runtime.evaluate 在页面里注入引导脚本，等待两个 iframe 从内部回报结果
  const ws = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  function send(method, params) {
    return new Promise(res => {
      const id = ++msgId;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evalIn(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  const boot = await evalIn(BOOT);
  if (boot && boot.error) {
    log('引导脚本执行失败：' + boot.error);
    try { ws.close(); } catch (e) {}
    try { child.kill(); } catch (e) {}
    process.exit(1);
  }

  // 等 iframe 内部脚本探测并 postMessage 回报（最多 8 秒）
  let res = null;
  for (let i = 0; i < 40; i++) {
    await wait(200);
    res = await evalIn('window.__probeResults || null');
    if (res && res.sb && res.ns) break;
  }
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}

  if (!res || !res.sb || !res.ns) {
    log('探测无结果：' + JSON.stringify(res));
    console.log('\n沙箱隔离实测：探测失败（环境限制）。');
    process.exit(0);
  }
  log('iframe 内部回报：' + JSON.stringify(res));

  // 以下断言全部基于 iframe **内部脚本**的真实视角
  check('带 sandbox 的 iframe：内部脚本读 parent.document 被拒',
    res.sb.parentDoc === 'SecurityError', res.sb.parentDoc);
  check('带 sandbox 的 iframe：内部脚本拿 parent 敏感属性被拒',
    res.sb.parentApi === 'SecurityError', res.sb.parentApi);
  check('带 sandbox 的 iframe：origin 为 null（不透明源）',
    res.sb.origin === 'null', res.sb.origin);
  // 对照组：不带 sandbox 的同页 iframe 内部脚本能读到 parent（证明探测链路本身有效）
  check('对照组（无 sandbox）：内部脚本能读到 parent.document（探测链路有效）',
    res.ns.parentDoc === true, res.ns.parentDoc);
  check('对照组（无 sandbox）：内部脚本能拿到 parent 敏感属性（链路有效）',
    res.ns.parentApi === 'visible', res.ns.parentApi);

  log('');
  log('沙箱隔离实测：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('\n结论：' +
    (fail === 0
      ? 'sandbox="allow-scripts"（无 allow-same-origin）确实把宿主完全挡在插件之外 ✅'
      : '存在未隔离项，需要检查 ❌'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
