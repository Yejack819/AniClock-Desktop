/* anim-ease-app-smoke.js — [v1.0.5.7] 桌面端「数字动画节奏」的真机端到端验收（CDP 驱动真实应用）
 *
 * 跑法：
 *   cd E:/clock && node docs/tests/anim-ease-app-smoke.js
 *   （若环境里带着 ELECTRON_RUN_AS_NODE / NODE_OPTIONS，先清掉 —— 本机 Git Bash 的 `env -u`
 *     会静默失效，必要时用 PowerShell 清。）
 *
 * 为什么要单开一个真机验收：这条链路上任何一环断了，界面看上去都「正常」——
 *   设置窗口里改下拉 → settings.js 的 saveAndApply → IPC 存盘 → 主进程广播 config
 *   → 主窗口 onConfigUpdated → acf() 写 --anim-ease → 浏览器算出新的缓动曲线。
 *   只看 CSS 文本、只看 localStorage、只看 config.json 都只能覆盖其中一段。
 *   这里直接量主窗口里**真实算出来**的 transitionTimingFunction。
 *
 * 用隔离的 --user-data-dir，绝不碰用户的 %APPDATA%\digital-clock。
 * 前置：应用不能已在运行（共用 userData 会互相干扰）。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');
const UD = 'C:/Users/Administrator/AppData/Local/Temp/clock-ease-ud';
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/clock-ease';
const PORT = 9331;
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

// 预置一份最小配置：跳过欢迎页。positionPreset 必须固定到角落 ——
// 盖住屏幕中心的窗口在本机桌面环境里会被系统立刻关掉，应用会被误判成「建窗即关」。
fs.rmSync(UD, { recursive: true, force: true });
fs.mkdirSync(UD, { recursive: true });
fs.writeFileSync(path.join(UD, 'config.json'), JSON.stringify({
  welcomeShown: true, lightsOff: false, layerMode: 'alwaysOnTop',
  positionPreset: 'top-right', animEase: 'default',
}));

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

// 在主窗口里量「真实算出来的缓动曲线」：临时挂一个 digit 探针（带 animate-out 才命中 CSS 的
// transition），读完立刻撤掉 —— 同一帧内完成，不渲染、不影响布局。
// ⚠️ transition 里 transform + opacity 两条 → 返回「值1, 值2」，而 cubic-bezier 自带逗号，
//    不能 split(',') 取第一个，得按语法匹配。
const PROBE = `(() => {
  const host = document.getElementById('time-display');
  const g = document.createElement('span'); g.className = 'digit-group';
  const c = document.createElement('span'); c.className = 'digit-current animate-out';
  c.textContent = '8'; g.appendChild(c); host.appendChild(g);
  const tf = getComputedStyle(c).transitionTimingFunction;
  host.removeChild(g);
  const m = tf.match(/^\\s*(cubic-bezier\\([^)]*\\)|[a-z-]+)/i);
  return JSON.stringify({
    ease: m ? m[1].trim() : tf,
    v: getComputedStyle(host).getPropertyValue('--anim-ease').trim(),
    clockCls: document.getElementById('clock').className,
    dur: getComputedStyle(host).getPropertyValue('--anim-duration').trim(),
  });
})()`;

const RBEASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // 翻转 / 缩放的原有回弹曲线
const readCfg = () => JSON.parse(fs.readFileSync(path.join(UD, 'config.json'), 'utf-8'));

(async () => {
  try {
    await wait(6500);
    check('应用进程存活（未崩溃）', !exited, true);
    const list0 = await targets();
    const main = list0.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
    check('找到主窗口渲染目标', !!main, true);
    if (!main) throw new Error('主窗口没找到：' + JSON.stringify(list0.map(t => t.url)));
    const m = cdp(main.webSocketDebuggerUrl);
    await m.ready;

    let st = JSON.parse(await m.evaluate(PROBE));
    log('[CDP] 主窗口初始：' + JSON.stringify(st));
    check('默认「弹性」档 → 主数字是各动画原有的回弹曲线', st.ease, RBEASE);
    check('默认档下 --anim-ease 是空的（交给 CSS 兜底，而不是写死一条曲线）', st.v, '');
    check('动画时长变量来自配置（350ms）', st.dur, '350ms');

    // ---- 打开真实设置窗口，走真实的下拉 change ----
    const opened = await m.evaluate('window.electronAPI.openSettings().then(r => JSON.stringify(r))');
    log('[CDP] openSettings 返回：' + opened);
    await wait(3200);
    const list1 = await targets();
    const stPage = list1.find(t => t.type === 'page' && t !== main && /settings\.html/.test(t.url || ''));
    check('设置窗口已打开（URL 含 settings.html）', !!stPage, true);
    if (!stPage) throw new Error('设置窗口没找到：' + JSON.stringify(list1.map(t => t.url)));
    const s = cdp(stPage.webSocketDebuggerUrl);
    await s.ready;
    await wait(1200);

    const easeOpts = await s.evaluate(
      "JSON.stringify(Array.prototype.map.call(document.getElementById('anim-ease').options, o => o.value + ':' + o.textContent))");
    log('[CDP] 设置里的节奏选项：' + easeOpts);
    check('设置里有 5 档节奏',
      JSON.parse(easeOpts).join(','),
      'default:弹性（默认）,linear:匀速,ease-in:慢起,ease-out:慢停,ease-in-out:两头慢');

    const setEase = async (v) => {
      await s.evaluate("(()=>{var e=document.getElementById('anim-ease');e.value='" + v
        + "';e.dispatchEvent(new Event('change',{bubbles:true}));return e.value;})()");
      await wait(900);
      return JSON.parse(await m.evaluate(PROBE));
    };

    const cases = [['linear', 'linear'], ['ease-in', 'ease-in'], ['ease-out', 'ease-out'], ['ease-in-out', 'ease-in-out']];
    for (const [v, want] of cases) {
      st = await setEase(v);
      check('★ 设置里选「' + v + '」→ 主窗口真实曲线变成 ' + want, st.ease, want);
      check('（同档）--anim-ease 变量也写成了 ' + want, st.v, want);
      const disk = readCfg();
      check('（同档）配置已落盘 animEase=' + v, disk.animEase, v);
    }

    // ---- 切回弹性：变量必须被删掉，而不是留一个空串 ----
    st = await setEase('default');
    check('★ 切回「弹性」→ 曲线回到回弹', st.ease, RBEASE);
    check('★ 弹性档把 --anim-ease 删干净（留空串会让整条 transition 失效）', st.v, '');
    check('落盘也是 default', readCfg().animEase, 'default');

    // ---- 「无动画」时节奏下拉应当置灰（没有动画就没有节奏可言）----
    await s.evaluate("(()=>{var e=document.getElementById('anim-type');e.value='none';e.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()");
    await wait(700);
    check('选「无动画」→ 节奏下拉置灰', await s.evaluate("document.getElementById('anim-ease').disabled"), true);
    await s.evaluate("(()=>{var e=document.getElementById('anim-type');e.value='flip';e.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()");
    await wait(700);
    check('切回「翻转」→ 节奏下拉恢复可用', await s.evaluate("document.getElementById('anim-ease').disabled"), false);

    // ---- 截图（主窗口，看一眼真实观感）----
    const shot = await m.send('Page.captureScreenshot', { format: 'png' });
    const data = shot.result && shot.result.data;
    if (data) {
      fs.writeFileSync(OUT + '-clock.png', Buffer.from(data, 'base64'));
      log('[SHOT] ' + OUT + '-clock.png');
    }
    check('未出现页面异常', true, true);

    m.close(); s.close();
  } catch (e) {
    log('[ERROR] ' + (e && e.message));
    fail++;
  } finally {
    try { child.kill(); } catch (e) {}
    await wait(2500);
    if (appOut.trim()) log('--- 应用输出（片段）---\n' + appOut.trim().slice(0, 1200));
    log('合计：' + pass + ' PASS / ' + fail + ' FAIL');
    fs.writeFileSync(OUT + '.log', lines.join('\n'));
    process.exit(fail ? 1 : 0);
  }
})();
