/* plugin-mount-probe.js — [v1.0.5.7] 真实应用里的「插件挂载」端到端验收（CDP 驱动）
 *
 * 为什么需要它：jsdom 不执行 iframe srcdoc 里的脚本、也不实现真正的跨源隔离，
 * 所以「沙箱 iframe 到底能不能跑起来」只有在真 Chromium 里验才算数。
 *
 * 验两件事：
 *   1) apiVersion:3 的插件 → 走沙箱隔离：主题槽里出现 sandbox iframe，且从宿主页看
 *      iframe.contentDocument === null（跨源铁证）。
 *   2) apiVersion:2 的插件 → 走旧版同页路径：在宿主页里建出真实 DOM（.legacy-marker），
 *      主题槽里**没有** iframe。
 * 这两条同时成立，才说明「版本门控」修对了（此前用宿主版本判定，把老插件也塞进沙箱 → 全挂）。
 *
 * 跑法：node docs/tests/plugin-mount-probe.js
 * 前置：应用不能已在运行；机器空闲内存偏低时可能起不来（本探针不做内存自跳过，失败会留日志）。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = 'E:/clock';
const UD = 'C:/Users/Administrator/AppData/Local/Temp/clock-plugin-mount-ud';
const PORT = 9321;
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/clock-plugin-mount';
const ELECTRON = path.join(APP, 'node_modules/electron/dist/electron.exe');

const V3_ID = 'com.yejack819.stopwatch';
const V2_ID = 'com.test.legacy';

const lines = [];
const log = s => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = expected === undefined ? !!actual : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++; else fail++;
  log((ok ? '[PASS] ' : '[FAIL] ') + name + ' = ' + JSON.stringify(actual) + (ok ? '' : '（期望 ' + JSON.stringify(expected) + '）'));
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- 准备隔离的 userData：装一个 v3 插件 + 一个 v2 插件 ----
fs.rmSync(UD, { recursive: true, force: true });
fs.mkdirSync(path.join(UD, 'plugins'), { recursive: true });
fs.writeFileSync(path.join(UD, 'config.json'), JSON.stringify({
  welcomeShown: true, lightsOff: false, layerMode: 'alwaysOnTop',
  positionPreset: 'top-right', settingsTab: 'plugins',
}));

// v3：直接拷仓库里的 stopwatch（apiVersion 3）
const v3src = path.join(APP, 'examples', 'stopwatch');
const v3dst = path.join(UD, 'plugins', V3_ID);
fs.mkdirSync(v3dst, { recursive: true });
for (const f of fs.readdirSync(v3src)) {
  const s = path.join(v3src, f);
  if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(v3dst, f));
}

// v2：合成一个最小的「旧版同页」插件，用来证明 legacy 路径没被破坏
const v2dst = path.join(UD, 'plugins', V2_ID);
fs.mkdirSync(v2dst, { recursive: true });
fs.writeFileSync(path.join(v2dst, 'plugin.json'), JSON.stringify({
  id: V2_ID, name: 'Legacy Probe', version: '1.0.0',
  apiVersion: 2, hooks: ['settings.theme'], permissions: ['ui.settings'],
}, null, 2));
fs.writeFileSync(path.join(v2dst, 'index.js'), [
  "dc.mount(function (slot, api) {",
  "  api.ui.nav({ id: 'legacy', label: 'Legacy', icon: 'L' });",
  "  var el = document.createElement('div');",
  "  el.className = 'legacy-marker';",
  "  el.textContent = 'legacy-ok';",
  "  (slot || document.body).appendChild(el);",
  "});",
].join('\n'));

fs.writeFileSync(path.join(UD, 'plugins.json'), JSON.stringify({
  enabled: { [V3_ID]: true, [V2_ID]: true },
  settings: { [V3_ID]: {}, [V2_ID]: {} },
  safeMode: false, strikes: 0,
}, null, 2));

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
  const consoleLines = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      try { consoleLines.push((msg.params.args || []).map(a => a.value).join(' ')); } catch (err) {}
    }
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
  return { ready, send, evaluate, close: () => ws.close(), consoleLines };
}

(async () => {
  try {
    await wait(6500);
    check('应用进程存活（未崩溃）', !exited, true);
    let list = await targets();
    log('[CDP] 目标数：' + list.length + ' → ' + list.map(t => t.type + ':' + (t.title || '')).join(' | '));
    const main = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
    check('找到渲染进程目标', !!main, true);
    if (!main) throw new Error('没有渲染目标：' + JSON.stringify(list.map(t => t.url)));
    const m = cdp(main.webSocketDebuggerUrl);
    await m.ready;
    await m.send('Runtime.enable');

    const opened = await m.evaluate('window.electronAPI.openSettings().then(r => JSON.stringify(r))');
    log('[CDP] openSettings 返回：' + opened);
    await wait(3500);

    list = await targets();
    const st = list.find(t => t.type === 'page' && /settings\.html/.test(t.url || ''));
    check('设置窗口已打开', !!st, true);
    if (!st) throw new Error('设置窗口没找到：' + JSON.stringify(list.map(t => t.url)));

    const s = cdp(st.webSocketDebuggerUrl);
    await s.ready;
    await s.send('Runtime.enable');
    await wait(2500);

    const probe = await s.evaluate(`(() => {
      const q = sel => document.querySelector(sel);
      const v3Theme = q('.plugin-theme-slot[data-plugin-id="${V3_ID}"]');
      const v2Theme = q('.plugin-theme-slot[data-plugin-id="${V2_ID}"]');
      const v3Frame = v3Theme ? v3Theme.querySelector('iframe') : null;
      const v2Frame = v2Theme ? v2Theme.querySelector('iframe') : null;
      // 跨源铁证：宿主页读沙箱 iframe 的 contentDocument 必须是 null
      let v3DocCrossOrigin = null;
      try { v3DocCrossOrigin = v3Frame ? (v3Frame.contentDocument === null) : null; } catch (e) { v3DocCrossOrigin = 'throw:' + e.name; }
      return {
        v3ThemeSlot: !!v3Theme,
        v3Frame: !!v3Frame,
        v3SandboxAttr: v3Frame ? v3Frame.getAttribute('sandbox') : null,
        v3DocCrossOrigin: v3DocCrossOrigin,
        v3NavItem: !!q('.plugin-nav-item[data-plugin-id="${V3_ID}"]'),
        v2ThemeSlot: !!v2Theme,
        v2Frame: !!v2Frame,
        v2LegacyMarker: !!q('.legacy-marker'),
        v2NavItem: !!q('.plugin-nav-item[data-plugin-id="${V2_ID}"]'),
        allNavItems: document.querySelectorAll('.plugin-nav-item').length,
      };
    })()`);
    log('[CDP] 插件挂载探测：' + JSON.stringify(probe));

    // ---- v3：必须走沙箱隔离 ----
    check('v3 插件主题槽存在', probe.v3ThemeSlot, true);
    check('v3 插件在主题槽里建出了 sandbox iframe', probe.v3Frame, true);
    check('v3 沙箱 iframe 只给 allow-scripts', probe.v3SandboxAttr, 'allow-scripts');
    check('v3 沙箱 iframe 从宿主页看是跨源（contentDocument === null）', probe.v3DocCrossOrigin, true);
    check('v3 插件注册了导航页（说明沙箱内代码真的跑起来了）', probe.v3NavItem, true);

    // ---- v2：必须走旧版同页路径（不被误塞进沙箱） ----
    check('v2 插件在宿主页建出真实 DOM（旧版同页路径生效）', probe.v2LegacyMarker, true);
    check('v2 插件主题槽里没有 sandbox iframe（未被误隔离）', probe.v2Frame, false);
    check('v2 插件注册了导航页', probe.v2NavItem, true);

    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    const data = shot.result && shot.result.data;
    if (data) {
      fs.writeFileSync(OUT + '-settings.png', Buffer.from(data, 'base64'));
      log('[SHOT] ' + OUT + '-settings.png');
    }

    const errs = (s.consoleLines || []).filter(l => /plugin|PLUGIN|Error|error/.test(l)).slice(0, 10);
    if (errs.length) log('[CONSOLE] ' + errs.join(' | '));

    m.close(); s.close();
  } catch (e) {
    log('[ERROR] ' + (e && e.message));
    fail++;
  } finally {
    try { child.kill(); } catch (e) {}
    await wait(2500);
    if (appOut.trim()) log('--- 应用输出 ---\n' + appOut.trim().slice(0, 2000));
    log('合计：' + pass + ' PASS / ' + fail + ' FAIL');
    fs.writeFileSync(OUT + '.log', lines.join('\n'));
    process.exit(0);
  }
})();
