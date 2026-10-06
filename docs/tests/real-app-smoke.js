/* real-app-smoke.js — 真实应用冒烟（CDP 驱动）
 *
 * 跑法：node docs/tests/real-app-smoke.js
 * 说明：用隔离的 --user-data-dir 启动真实应用（绝不碰用户的 %APPDATA%\digital-clock），
 *       通过 --remote-debugging-port 连 CDP，调真实 preload 接口打开设置窗口，断言 + 截图。
 * 前置：应用不能已在运行（共用 userData 会互相干扰）；机器空闲内存需 >1.5GB。
 * 复用：改 APP / UD / PORT，断言段替换成目标应用要验的点即可（原模板见 skill electron-realapp-smoke）。
 */
/* 真机冒烟：用隔离的 userData 启动真实应用，通过 CDP 打开真实设置窗口并验收无边框标题栏
 * 关键前提：--user-data-dir 指向临时目录，绝不碰用户的 %APPDATA%\digital-clock
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = 'E:/clock';
const UD = 'C:/Users/Administrator/AppData/Local/Temp/clock-smoke-ud';
const PORT = 9315;
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/clock-smoke';
const ELECTRON = path.join(APP, 'node_modules/electron/dist/electron.exe');

const lines = [];
const log = s => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = expected === undefined ? !!actual : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else fail++;
  log((ok ? '[PASS] ' : '[FAIL] ') + name + ' = ' + JSON.stringify(actual) + (ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'));
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// 预置一份最小配置：跳过欢迎页，直接进主窗口 + 托盘
fs.rmSync(UD, { recursive: true, force: true });
fs.mkdirSync(UD, { recursive: true });
// positionPreset 固定角落：本机桌面环境里「盖住屏幕中心点」的窗口会被系统立刻关掉，
// 默认 'center' 会让应用被误判成「建窗即关」。
// settingsTab 显式指定『插件』页：后面要断言激活面板是 plugins（默认值是 'mode'）。
fs.writeFileSync(path.join(UD, 'config.json'), JSON.stringify({ welcomeShown: true, lightsOff: false, layerMode: 'alwaysOnTop', positionPreset: 'top-right', settingsTab: 'plugins' }));

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const child = spawn(ELECTRON, ['.', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + UD], {
  cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'],
});
let appOut = '';
child.stdout.on('data', d => { appOut += d.toString(); });
child.stderr.on('data', d => { appOut += d.toString(); });
let exited = false;
child.on('exit', code => { exited = true; log('[APP] 进程退出 code=' + code); });

async function targets() {
  const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
  return res.json();
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params) => new Promise(resolve => {
    const myId = ++id;
    pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
  });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.error) return { __cdpError: r.error };
    const res = r.result && r.result.result;
    if (res && res.subtype === 'error') return { __evalError: res.description };
    return res ? res.value : undefined;
  };
  return { ready, send, evaluate, close: () => ws.close() };
}

(async () => {
  try {
    await wait(6000);
    check('应用进程存活（未崩溃）', !exited, true);
    let list = await targets();
    log('[CDP] 目标数：' + list.length + ' → ' + list.map(t => t.type + ':' + (t.title || '')).join(' | '));
    const main = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
    check('找到渲染进程目标', !!main, true);
    const m = cdp(main.webSocketDebuggerUrl);
    await m.ready;

    // 通过真实的 preload 接口打开设置窗口（与用户点托盘菜单走的是同一条路）
    const opened = await m.evaluate('window.electronAPI.openSettings().then(r => JSON.stringify(r))');
    log('[CDP] openSettings 返回：' + opened);
    await wait(3000);

    list = await targets();
    const st = list.find(t => t.type === 'page' && t !== main && !t.url.startsWith('devtools') && /settings\.html/.test(t.url || ''));
    check('设置窗口已打开（URL 含 settings.html）', !!st, true);
    if (!st) { m.close(); throw new Error('设置窗口没找到：' + JSON.stringify(list.map(t => t.url))); }

    const s = cdp(st.webSocketDebuggerUrl);
    await s.ready;
    await wait(1500);

    // ---- 无边框标题栏验收 ----
    const bar = await s.evaluate(`(() => {
      const b = document.querySelector('.win-bar');
      const btns = ['win-min','win-max','win-close'].map(id => document.getElementById(id));
      const cs = b ? getComputedStyle(b) : null;
      return {
        exists: !!b,
        height: cs ? cs.height : null,
        appRegion: b ? b.style.getPropertyValue('-webkit-app-region') || cs.webkitAppRegion : null,
        buttons: btns.map(x => !!x),
        iconCount: document.querySelectorAll('.win-bar .win-icon, .win-bar i, .win-bar span[class^="win-icon"]').length,
        settingsWindowH: getComputedStyle(document.querySelector('.settings-window')).height,
        bodyMax: document.body.classList.contains('is-maximized'),
        winTitle: document.querySelector('.win-bar [data-lang="settingsHeader"]') ? document.querySelector('.win-bar [data-lang="settingsHeader"]').textContent : null,
        allDataLangTitle: document.querySelectorAll('[data-lang-title]').length,
      };
    })()`);
    log('[CDP] 标题栏探测：' + JSON.stringify(bar));
    check('自绘标题栏存在', bar.exists, true);
    check('标题栏高度为 40px', bar.height, '40px');
    check('三个按钮齐全（最小化/最大化/关闭）', bar.buttons, [true, true, true]);
    check('标题栏文案节点存在', !!bar.winTitle, true);
    check('title 属性本地化节点已接好', bar.allDataLangTitle >= 3, true);

    // ---- 最大化按钮走真实 IPC ----
    await s.evaluate("document.getElementById('win-max').click()");
    await wait(1200);
    const maxed = await s.evaluate("document.body.classList.contains('is-maximized')");
    check('点最大化 → is-maximized 生效', maxed, true);
    await s.evaluate("document.getElementById('win-max').click()");
    await wait(1200);
    const unmaxed = await s.evaluate("document.body.classList.contains('is-maximized')");
    check('再点一次 → 还原', unmaxed, false);

    // ---- 设置界面本体没被破坏 ----
    const ui = await s.evaluate(`(() => ({
      navItems: document.querySelectorAll('#settings-nav .nav-item').length,
      panels: document.querySelectorAll('.panel').length,
      activePanel: (document.querySelector('.panel.active') || {}).dataset ? document.querySelector('.panel.active').dataset.panel : null,
      pluginList: !!document.getElementById('plugin-list'),
    }))()`);
    log('[CDP] 设置界面探测：' + JSON.stringify(ui));
    check('左侧导航项齐全（12 项：v1.0.5.6 局域网 + v1.0.5.7 倒计时）', ui.navItems, 12);
    check('面板齐全（12 个）', ui.panels, 12);
    check('当前面板在插件页（settingsTab=plugins）', ui.activePanel, 'plugins');

    // ---- 截图 ----
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    const data = shot.result && shot.result.data;
    if (data) {
      fs.writeFileSync(OUT + '-settings.png', Buffer.from(data, 'base64'));
      log('[SHOT] ' + OUT + '-settings.png');
      check('设置窗口截图已保存', true, true);
    } else {
      check('设置窗口截图已保存', false, true);
    }

    m.close(); s.close();
  } catch (e) {
    log('[ERROR] ' + (e && e.message));
    fail++;
  } finally {
    try { child.kill(); } catch (e) {}
    await wait(2500);
    if (appOut.trim()) log('--- 应用输出 ---\n' + appOut.trim().slice(0, 1500));
    log('合计：' + pass + ' PASS / ' + fail + ' FAIL');
    fs.writeFileSync(OUT + '.log', lines.join('\n'));
    process.exit(0);
  }
})();
