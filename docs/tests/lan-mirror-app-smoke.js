/* lan-mirror-app-smoke.js — 局域网镜像的真机端到端验收（CDP 驱动真实应用）
 *
 * 跑法：node docs/tests/lan-mirror-app-smoke.js
 * 验的是真实链路：主进程起服务 → preload/IPC 开关 → 真实 http 端口 → 手机端页面与快照接口。
 * 用隔离的 --user-data-dir，绝不碰用户的 %APPDATA%\digital-clock。
 * 前置：应用不能已在运行；机器空闲内存需 >1.5GB。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const APP = 'E:/clock';
const UD = 'C:/Users/Administrator/AppData/Local/Temp/clock-lan-ud';
const OUT = 'C:/Users/Administrator/AppData/Local/Temp/clock-lan-smoke';
const PORT = 9326;
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

function freePort() {
  return new Promise(resolve => {
    const s = net.createServer(() => {});
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

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
  let child = null;
  let mirroredPort = 0;
  let token = '';
  let appOutAll = '';
  try {
    mirroredPort = await freePort();
    log('[SETUP] 用空闲端口 ' + mirroredPort + ' 做镜像服务');

    fs.rmSync(UD, { recursive: true, force: true });
    fs.mkdirSync(UD, { recursive: true });
    fs.writeFileSync(path.join(UD, 'config.json'), JSON.stringify({
      welcomeShown: true, lightsOff: false, layerMode: 'alwaysOnTop', settingsTab: 'lan',
      language: 'zh', animType: 'flip', showSeconds: true, bgColor: 'rgba(0,0,0,0.35)',
      lanMirrorEnabled: false, lanMirrorPort: mirroredPort, lanMirrorToken: '',
      lanMirrorAuthMode: 'random', lanMirrorFixedCode: '',
      // 固定放到屏幕角落：本机桌面环境里「盖住屏幕中心点」的窗口会被系统立刻关掉，
      // 默认 positionPreset='center' 会让窗口正好压住中心 → 应用被误判成「建窗即关」。
      // 放到角落既避开这个环境坑，也更接近用户真实用法（时钟默认挂在角落）。
      positionPreset: 'top-right',
    }));

    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;

    child = spawn(ELECTRON, ['.', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + UD], {
      cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let appOut = '';
    let exited = false;
    child.stdout.on('data', d => { appOut += d.toString(); appOutAll = appOut; });
    child.stderr.on('data', d => { appOut += d.toString(); appOutAll = appOut; });
    child.on('exit', code => { exited = true; log('[APP] 进程退出 code=' + code); });

    await wait(6000);
    check('应用进程存活（未崩溃）', !exited, true);

    let list = await targets();
    const main = list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
    check('找到渲染进程目标', !!main, true);
    const m = cdp(main.webSocketDebuggerUrl);
    await m.ready;

    // 关闭时默认没开共享：状态应为未运行
    const stOff = await m.evaluate('window.electronAPI.lanMirrorStatus().then(s => JSON.stringify(s))');
    const off = JSON.parse(stOff);
    check('默认未开启共享', off.running, false);
    check('默认端口来自配置', off.port, null);

    // 打开设置窗口（走真实 preload，与点托盘菜单同一条 IPC）
    await m.evaluate('window.electronAPI.openSettings().then(r => JSON.stringify(r))');
    await wait(3000);
    list = await targets();
    const st = list.find(t => t.type === 'page' && /settings\.html/.test(t.url || ''));
    check('设置窗口已打开', !!st, true);
    if (!st) throw new Error('设置窗口没找到');
    const s = cdp(st.webSocketDebuggerUrl);
    await s.ready;
    await wait(1500);

    // ---- 面板结构 ----
    const panel = await s.evaluate(`(() => ({
      navItem: !!document.querySelector('#settings-nav .nav-item[data-panel="lan"]'),
      panel: !!document.querySelector('.panel[data-panel="lan"]'),
      activePanel: (document.querySelector('.panel.active') || {}).dataset.panel,
      hasToggle: !!document.getElementById('lan-enabled'),
      hasPort: !!document.getElementById('lan-port'),
      statusText: (document.getElementById('lan-status-text') || {}).textContent,
      statusClass: (document.getElementById('lan-status') || {}).className,
      bodyHidden: document.getElementById('lan-body').classList.contains('hidden'),
      qrVisible: !document.getElementById('lan-qr').classList.contains('hidden'),
      navCount: document.querySelectorAll('#settings-nav .nav-item').length,
      panelCount: document.querySelectorAll('.panel').length,
    }))()`);
    log('[CDP] 面板探测：' + JSON.stringify(panel));
    check('导航里有「局域网」', panel.navItem, true);
    check('面板存在', panel.panel, true);
    check('导航项 12 个 / 面板 12 个', [panel.navCount, panel.panelCount], [12, 12]);
    check('未开启时进入「局域网」面板', panel.activePanel, 'lan');
    check('未开启时状态条为关闭态', panel.statusClass.indexOf('off') >= 0, true);
    check('未开启时不显示二维码', panel.qrVisible, false);

    // ---- 开启共享（走真实界面：填端口 → 点开关）----
    await s.evaluate(`(() => {
      const p = document.getElementById('lan-port');
      p.value = '${mirroredPort}';
      p.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await wait(400);
    await s.evaluate('document.getElementById("lan-enabled").click()');
    await wait(1200);

    const stOn = await s.evaluate('window.electronAPI.lanMirrorStatus().then(s => JSON.stringify(s))');
    const on = JSON.parse(stOn);
    log('[CDP] 开启后状态：' + stOn);
    check('开启后服务运行中', on.running, true);
    check('端口为请求值', on.port, mirroredPort);
    check('访问码为 6 位短码（无歧义字母表）', /^[a-hj-km-np-z2-9]{6}$/.test(on.token || ''), true);
    check('页面模板就位', on.pageAvailable, true);
    check('地址列表与网卡数一致', on.urls.length, on.addresses.length);
    check('地址格式正确', on.urls.every(u => u.url === 'http://' + u.ip + ':' + mirroredPort + '/' + on.token + '/'), true);
    token = on.token;

    const panelOn = await s.evaluate(`(() => ({
      bodyHidden: document.getElementById('lan-body').classList.contains('hidden'),
      qrVisible: !document.getElementById('lan-qr').classList.contains('hidden'),
      qrPx: (() => { const c = document.getElementById('lan-qr'); if (!c.width) return 0;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 128) n++; return n; })(),
      addrRows: document.querySelectorAll('#lan-address-list .lan-addr').length,
      statusText: document.getElementById('lan-status-text').textContent,
      statusClass: document.getElementById('lan-status').className,
      urlShown: (document.querySelector('.lan-addr-url') || {}).textContent || '',
      toggleChecked: document.getElementById('lan-enabled').checked,
      portEnabled: !document.getElementById('lan-port').disabled,
    }))()`);
    log('[CDP] 开启后界面：' + JSON.stringify(panelOn));
    check('开关已勾选', panelOn.toggleChecked, true);
    check('端口输入框可用', panelOn.portEnabled, true);
    check('开启后展示地址区', panelOn.bodyHidden, false);
    check('二维码已绘制（不透明深色像素 > 50）', panelOn.qrPx > 50, true);
    check('地址行数与状态一致', panelOn.addrRows, on.urls.length);
    check('状态条为运行态', panelOn.statusClass.indexOf('off') < 0 && panelOn.statusClass.indexOf('error') < 0, true);
    check('状态文案含端口', panelOn.statusText.indexOf(String(mirroredPort)) >= 0, true);
    check('界面展示的地址带访问码', panelOn.urlShown.indexOf(token) >= 0, true);

    // ---- 从外部（相当于手机）访问真实端口 ----
    // urls 里只有内网地址（不含回环）；本机无网卡时退回 127.0.0.1 验证服务本体
    const phoneBase = on.urls.length ? on.urls[0].url.replace(/\/$/, '') : 'http://127.0.0.1:' + mirroredPort + '/' + token;
    log('[NET] 从外部访问：' + phoneBase + '/');

    let pageRes = await fetch(phoneBase + '/');
    check('手机端页面 200', pageRes.status, 200);
    const html = await pageRes.text();
    check('页面含时钟容器', html.indexOf('id="digits"') >= 0, true);
    check('页面不含访问码明文', html.indexOf(token) < 0, true);
    check('页面零外链脚本', !/<script[^>]+src=/i.test(html), true);

    const stateRes = await fetch(phoneBase + '/api/state');
    check('快照接口 200', stateRes.status, 200);
    const snapText = await stateRes.text();
    const snap = JSON.parse(snapText);
    check('快照带服务端时间', Math.abs(snap.now - Date.now()) < 10000, true);
    check('快照标注只读', snap.readOnly, true);
    check('快照透传当前配置（animType）', snap.cfg.animType, 'flip');
    check('快照不含访问码', snapText.indexOf(token) < 0, true);

    // 只读约束与兜底
    const postRes = await fetch(phoneBase + '/api/state', { method: 'POST', body: 'x' });
    check('POST 被拒（405）', postRes.status, 405);
    const badRes = await fetch('http://127.0.0.1:' + mirroredPort + '/deadbeef/');
    check('错误访问码 404', badRes.status, 404);

    // ---- [v1.0.5.7] 倒计时：手机端加/改/控 —— 真实端口 + 真实主进程 ----
    // 这一段就是「手机」视角：外部 fetch 打真实 http 端口，最终落到主进程的
    // applyCountdown* 单一写入口（和桌面 IPC 同一条路），再回查桌面端是否看到。
    const cdWrite = async (method, sub, body, nonceOverride) => {
      const nonce = nonceOverride === undefined
        ? (await (await fetch(phoneBase + '/api/write-nonce')).json()).nonce
        : nonceOverride;
      const headers = { 'Content-Type': 'application/json' };
      if (nonce) headers['X-DC-Nonce'] = nonce;
      return fetch(phoneBase + '/api' + sub, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
    };

    const nonceRes = await fetch(phoneBase + '/api/write-nonce');
    check('倒计时: 令牌接口 200', nonceRes.status, 200);
    const nonceVal = (await nonceRes.json()).nonce;
    check('倒计时: 令牌足够长（≥16）', typeof nonceVal === 'string' && nonceVal.length >= 16, true);

    const cdList0 = await (await fetch(phoneBase + '/api/countdowns')).json();
    check('倒计时: 初始列表为空', cdList0.items.length, 0);
    check('倒计时: 列表标记可编辑', cdList0.canEdit, true);

    check('倒计时: 不带令牌写 → 403', (await cdWrite('POST', '/countdowns', { durationMs: 120000 }, '')).status, 403);
    check('倒计时: 伪造令牌写 → 403', (await cdWrite('POST', '/countdowns', { durationMs: 120000 }, 'nope')).status, 403);

    const createdRes = await cdWrite('POST', '/countdowns', { name: '手机建的', durationMs: 120000 });
    check('倒计时: 手机端新建 200', createdRes.status, 200);
    const created = await createdRes.json();
    check('倒计时: 新建 ok', created.ok, true);
    check('倒计时: 回包带最新列表（省一次往返）', created.items.length, 1);
    const cdId = created.items[0].id;
    check('倒计时: id 形状合法', /^cd_\d{6,20}_[a-z0-9]{1,12}$/.test(cdId || ''), true);
    check('倒计时: 服务端带 endAt（手机端靠它本地倒扣）', typeof created.items[0].endAt === 'string', true);

    const ipcList = JSON.parse(await m.evaluate('window.electronAPI.countdownList().then(r => JSON.stringify(r))'));
    check('倒计时: 桌面端（真实 IPC）立刻看得到', ipcList.items.some(x => x.id === cdId), true);
    check('倒计时: 名称一致', (ipcList.items.find(x => x.id === cdId) || {}).name, '手机建的');
    check('倒计时: 剩余量接近 120 秒', ipcList.items.find(x => x.id === cdId).remainingMs > 110000, true);

    const snapCd = await (await fetch(phoneBase + '/api/state')).json();
    check('倒计时: 快照里能读到', snapCd.countdowns.length, 1);
    check('倒计时: 快照标记可编辑', snapCd.countdownCanEdit, true);
    check('倒计时: 快照仍标注 readOnly（配置/闹钟/窗口位置依旧不可写）', snapCd.readOnly, true);

    const patched = await (await cdWrite('PATCH', '/countdowns/' + cdId, { name: '改过的', durationMs: 300000 })).json();
    check('倒计时: 手机端改名成功', patched.items[0].name, '改过的');
    check('倒计时: 手机端改时长成功', patched.items[0].durationMs, 300000);

    check('倒计时: 暂停 200', (await cdWrite('POST', '/countdowns/' + cdId + '/pause')).status, 200);
    check('倒计时: 暂停后 state=paused',
      (await (await fetch(phoneBase + '/api/countdowns')).json()).items[0].state, 'paused');
    check('倒计时: 继续 200', (await cdWrite('POST', '/countdowns/' + cdId + '/resume')).status, 200);
    check('倒计时: 继续后 state=running',
      (await (await fetch(phoneBase + '/api/countdowns')).json()).items[0].state, 'running');
    check('倒计时: 重启后回到整时长',
      (await (await (await cdWrite('POST', '/countdowns/' + cdId + '/restart')).json()).items)[0].remainingMs > 290000, true);

    // 设置界面「倒计时」面板与手机端是同一份数据
    await s.evaluate('document.querySelector(\'#settings-nav .nav-item[data-panel="countdown"]\').click()');
    await wait(1200);
    const cdPanel = await s.evaluate(`(() => ({
      active: (document.querySelector('.panel.active') || {}).dataset.panel,
      rows: document.querySelectorAll('#countdown-list .cd-item, #countdown-list .alarm-item').length,
      text: (document.getElementById('countdown-list') || {}).textContent || '',
    }))()`);
    log('[CDP] 倒计时面板：' + JSON.stringify(cdPanel));
    check('倒计时: 设置面板可切到 countdown', cdPanel.active, 'countdown');
    check('倒计时: 设置面板列出手机建的条目', cdPanel.text.indexOf('改过的') >= 0, true);

    check('倒计时: 取消（cancel 别名）200', (await cdWrite('POST', '/countdowns/' + cdId + '/cancel')).status, 200);
    check('倒计时: 取消后列表清空',
      (await (await fetch(phoneBase + '/api/countdowns')).json()).items.length, 0);
    check('倒计时: 已消失再取消 → 404', (await cdWrite('POST', '/countdowns/' + cdId + '/cancel')).status, 404);
    const ipcAfter = JSON.parse(await m.evaluate('window.electronAPI.countdownList().then(r => JSON.stringify(r))'));
    check('倒计时: 桌面端也同步清空', ipcAfter.items.length, 0);
    check('倒计时: 桌面端快照不带贪睡/声音等内部字段',
      JSON.stringify(ipcAfter.items).indexOf('snooze') < 0, true);

    // ---- 到点契约：手机端完全是「本地倒扣 + 判到点」——它没有宿主的响铃事件可听 ----
    // 所以宿主必须在到点后仍把 endAt 停在过去、remainingMs 归零、state 保持 running；
    // 三者任一被改（比如把 nextTrigger 推到未来），手机端就永远不响
    {
      const soonCreated = await (await cdWrite('POST', '/countdowns', { name: '马上到点', durationMs: 1000 })).json();
      const soonId = soonCreated.items[soonCreated.items.length - 1].id;
      await new Promise(r => setTimeout(r, 1600));
      const due = ((await (await fetch(phoneBase + '/api/countdowns')).json()).items || [])
        .find(x => x.id === soonId) || {};
      check('到点: endAt 停在过去（手机端据此判到点）',
        typeof due.endAt === 'string' && Date.parse(due.endAt) <= Date.now(), true);
      check('到点: 剩余量已归零', due.remainingMs, 0);
      check('到点: 状态仍是 running（手机端只认 running + 归零）', due.state, 'running');
      check('到点: 取消 200（宿主同时静音）',
        (await cdWrite('POST', '/countdowns/' + soonId + '/cancel')).status, 200);
      check('到点: 清理干净', (await (await fetch(phoneBase + '/api/countdowns')).json()).items.length, 0);
    }

    // 收尾：把设置界面切回「局域网」面板，后面的换码/模式用例还在这个面板上做
    await s.evaluate('document.querySelector(\'#settings-nav .nav-item[data-panel="lan"]\').click()');
    await wait(900);

    // ---- 截图 ----
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    const data = shot.result && shot.result.data;
    if (data) {
      fs.writeFileSync(OUT + '-lan-panel.png', Buffer.from(data, 'base64'));
      log('[SHOT] ' + OUT + '-lan-panel.png');
      check('面板截图已保存', true, true);
    } else {
      check('面板截图已保存', false, true);
    }

    // ---- 更换访问码：旧链接立刻失效 ----
    const stNew = await s.evaluate('window.electronAPI.newLanMirrorToken().then(s => JSON.stringify(s))');
    const rotated = JSON.parse(stNew);
    check('换码后访问码已变化', rotated.token !== token, true);
    check('换码后仍是 6 位短码', /^[a-hj-km-np-z2-9]{6}$/.test(rotated.token || ''), true);
    const oldRes = await fetch('http://127.0.0.1:' + mirroredPort + '/' + token + '/');
    check('旧访问码已失效（404）', oldRes.status, 404);
    const newRes = await fetch('http://127.0.0.1:' + mirroredPort + '/' + rotated.token + '/');
    check('新访问码可用（200）', newRes.status, 200);

    // 重新进入面板时应自动拉到最新状态（换码后界面上的地址必须跟着变）
    await s.evaluate('document.querySelector(\'#settings-nav .nav-item[data-panel="mode"]\').click()');
    await wait(600);
    await s.evaluate('document.querySelector(\'#settings-nav .nav-item[data-panel="lan"]\').click()');
    await wait(1200);
    const afterRotate = await s.evaluate(`(() => ({
      urlShown: (document.querySelector('.lan-addr-url') || {}).textContent || '',
      addrRows: document.querySelectorAll('#lan-address-list .lan-addr').length,
    }))()`);
    log('[CDP] 换码后重进面板：' + JSON.stringify(Object.assign({ rotatedToken: rotated.token }, afterRotate)));
    check('重进面板后展示新访问码', afterRotate.urlShown.indexOf(rotated.token) >= 0, true);
    check('重进面板后不残留旧访问码', afterRotate.urlShown.indexOf(token) < 0, true);

    // ---- 回归守卫：设置窗口是「整份回写配置」的（saveAndApply），
    // 它的快照里不可能有主进程刚生成的访问码 —— 回写必须由主进程保住这个字段，
    // 否则用户刚扫的二维码会被静默作废。
    const clobbered = await s.evaluate(`(() => window.electronAPI.getConfig()
      .then(c => window.electronAPI.saveConfig(Object.assign({}, c, { lanMirrorToken: '', lanMirrorPort: ${mirroredPort} })))
      .then(() => window.electronAPI.lanMirrorStatus())
      .then(st => JSON.stringify(st)))()`);
    const afterClobber = JSON.parse(clobbered);
    check('整份回写配置不会重置访问码', afterClobber.token === rotated.token, true);
    check('整份回写后服务仍在跑', afterClobber.running, true);

    // ---- 回归守卫：访问方式与自定义码同样是「主进程独占写入」的键，
    // 整份回写不能把它们改掉（否则设置窗口一关就把面板上的选择冲掉）。
    const clobber2 = await s.evaluate(`(() => window.electronAPI.getConfig()
      .then(c => window.electronAPI.saveConfig(Object.assign({}, c, {
        lanMirrorAuthMode: 'none', lanMirrorFixedCode: 'hacked', lanMirrorEnabled: false,
      })))
      .then(() => window.electronAPI.lanMirrorStatus())
      .then(st => JSON.stringify(st)))()`);
    const afterClobber2 = JSON.parse(clobber2);
    check('整份回写不会改访问方式', afterClobber2.authMode === 'random', true);
    check('整份回写不会改自定义码', afterClobber2.fixedCode === '', true);
    check('整份回写不会关掉共享', afterClobber2.running, true);

    // ---- [v1.0.5.6] 访问方式三选一：真实界面切换 + 真实网络验证 ----
    const switchMode = async (mode, code) => {
      await s.evaluate(`(() => {
        const sel = document.getElementById('lan-auth-mode');
        sel.value = '${mode}';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await wait(500);
      if (code !== undefined) {
        await s.evaluate(`(() => {
          const el = document.getElementById('lan-code');
          el.value = ${JSON.stringify(code)};
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
        await wait(500);
      }
      return JSON.parse(await s.evaluate('window.electronAPI.lanMirrorStatus().then(st => JSON.stringify(st))'));
    };
    const modeUi = () => s.evaluate(`(() => ({
      codeRowHidden: document.getElementById('lan-code-row').classList.contains('hidden'),
      tokenBtnHidden: document.getElementById('lan-token-btn').classList.contains('hidden'),
      codeLineHidden: document.getElementById('lan-code-line').classList.contains('hidden'),
      codeInput: (document.getElementById('lan-code') || {}).value,
      urlShown: (document.querySelector('.lan-addr-url') || {}).textContent,
      note: (document.getElementById('lan-auth-note') || {}).textContent,
      warn: (document.getElementById('lan-auth-warn') || {}).textContent,
      qrVisible: !document.getElementById('lan-qr').classList.contains('hidden'),
    }))()`);

    // 自定义访问码
    const fixedSt = await switchMode('fixed');
    const fixedUi = await modeUi();
    log('[CDP] 自定义模式：' + JSON.stringify({ token: fixedSt.token, ui: fixedUi }));
    check('自定义：状态切换到 fixed', fixedSt.authMode, 'fixed');
    check('自定义：默认给了 my-clock', fixedSt.token, 'my-clock');
    check('自定义：地址用自定义码', fixedSt.urls[0].url.indexOf('/my-clock/') > 0, true);
    check('自定义：输入行出现', fixedUi.codeRowHidden, false);
    check('自定义：换码按钮隐藏', fixedUi.tokenBtnHidden, true);
    check('自定义：访问码行隐藏', fixedUi.codeLineHidden, true);
    const fixedRes = await fetch('http://127.0.0.1:' + mirroredPort + '/my-clock/');
    check('自定义：/my-clock/ 可访问（200）', fixedRes.status, 200);
    const oldShort = await fetch('http://127.0.0.1:' + mirroredPort + '/' + rotated.token + '/');
    check('自定义：上一个随机短码失效（404）', oldShort.status, 404);
    const rootInFixed = await fetch('http://127.0.0.1:' + mirroredPort + '/');
    check('自定义：根路径不敞开（404）', rootInFixed.status, 404);

    // 换成另一个自定义码（带大写与空格，验证自动规整）
    const fixed2 = await switchMode('fixed', '  Home 2026  ');
    const fixed2Ui = await modeUi();
    log('[CDP] 自定义（规整）：' + JSON.stringify({ token: fixed2.token, input: fixed2Ui.codeInput, url: fixed2Ui.urlShown }));
    check('自定义：输入被规整为小写带连字符', fixed2.token, 'home-2026');
    check('自定义：输入框回显规整结果', fixed2Ui.codeInput, 'home-2026');
    check('自定义：地址跟着变', fixed2.urls[0].url.indexOf('/home-2026/') > 0, true);
    const newFixedRes = await fetch('http://127.0.0.1:' + mirroredPort + '/home-2026/api/state');
    check('自定义：新码快照可访问（200）', newFixedRes.status, 200);
    check('自定义：新码快照仍是只读', (await newFixedRes.json()).readOnly, true);
    const oldFixedRes = await fetch('http://127.0.0.1:' + mirroredPort + '/my-clock/');
    check('自定义：旧自定义码失效（404）', oldFixedRes.status, 404);

    // 非法自定义码 → 退回随机码，绝不能变成无码
    const badSt = await switchMode('fixed', 'a!');
    const badUi = await modeUi();
    log('[CDP] 非法自定义码：' + JSON.stringify({ token: badSt.token, fallback: badSt.authFallback }));
    check('非法自定义码：主进程标出 authFallback', badSt.authFallback, true);
    check('非法自定义码：退回 6 位随机码', /^[a-hj-km-np-z2-9]{6}$/.test(badSt.token || ''), true);
    check('非法自定义码：根路径仍不敞开（404）', (await fetch('http://127.0.0.1:' + mirroredPort + '/')).status, 404);
    check('非法自定义码：界面给出警示', badUi.warn.indexOf('不合法') >= 0, true);

    // 不需要访问码
    const noneSt = await switchMode('none');
    const noneUi = await modeUi();
    log('[CDP] 无码模式：' + JSON.stringify({ token: noneSt.token, ui: noneUi }));
    check('无码：状态切换到 none', noneSt.authMode, 'none');
    check('无码：不再有访问码', noneSt.token, '');
    check('无码：地址为根路径', noneSt.urls[0].url, 'http://' + noneSt.addresses[0].address + ':' + mirroredPort + '/');
    check('无码：输入行隐藏', noneUi.codeRowHidden, true);
    check('无码：换码按钮隐藏', noneUi.tokenBtnHidden, true);
    check('无码：访问码行隐藏', noneUi.codeLineHidden, true);
    check('无码：二维码仍然绘制（扫码还是要用的）', noneUi.qrVisible, true);
    const rootRes = await fetch('http://127.0.0.1:' + mirroredPort + '/');
    check('无码：根路径直接是时钟页（200）', rootRes.status, 200);
    const rootHtml = await rootRes.text();
    check('无码：根路径页面含时钟容器', rootHtml.indexOf('id="digits"') >= 0, true);
    check('无码：根路径页面零外链脚本', !/<script[^>]+src=/i.test(rootHtml), true);
    const rootState = await fetch('http://127.0.0.1:' + mirroredPort + '/api/state');
    check('无码：/api/state 可访问（200）', rootState.status, 200);
    check('无码：旧自定义码失效（404）', (await fetch('http://127.0.0.1:' + mirroredPort + '/home-2026/')).status, 404);
    check('无码：未知路径仍是 404', (await fetch('http://127.0.0.1:' + mirroredPort + '/nope')).status, 404);

    // 切回随机 → 自动补一个新短码
    const backSt = await switchMode('random');
    const backUi = await modeUi();
    log('[CDP] 切回随机：' + JSON.stringify({ token: backSt.token, ui: backUi.urlShown }));
    check('切回随机：是 6 位短码', /^[a-hj-km-np-z2-9]{6}$/.test(backSt.token || ''), true);
    check('切回随机：地址重新带码', backSt.urls[0].url.indexOf('/' + backSt.token + '/') > 0, true);
    check('切回随机：输入行隐藏', backUi.codeRowHidden, true);
    check('切回随机：换码按钮回来', backUi.tokenBtnHidden, false);
    check('切回随机：访问码行回来', backUi.codeLineHidden, false);
    check('切回随机：根路径不再敞开（404）', (await fetch('http://127.0.0.1:' + mirroredPort + '/')).status, 404);
    check('切回随机：新码可访问（200）', (await fetch('http://127.0.0.1:' + mirroredPort + '/' + backSt.token + '/')).status, 200);

    // ---- 关闭共享（走界面开关）----
    await s.evaluate('document.getElementById("lan-enabled").click()');
    await wait(1200);
    const stFinal = await s.evaluate('window.electronAPI.lanMirrorStatus().then(s => JSON.stringify(s))');
    const finalSt = JSON.parse(stFinal);
    check('关闭后服务已停止', finalSt.running, false);
    const panelOff = await s.evaluate(`(() => ({
      bodyHidden: document.getElementById('lan-body').classList.contains('hidden'),
      qrVisible: !document.getElementById('lan-qr').classList.contains('hidden'),
      addrRows: document.querySelectorAll('#lan-address-list .lan-addr').length,
      statusClass: document.getElementById('lan-status').className,
      statusText: document.getElementById('lan-status-text').textContent,
    }))()`);
    log('[CDP] 关闭后界面：' + JSON.stringify(panelOff));
    check('关闭后收起地址区', panelOff.bodyHidden, true);
    check('关闭后隐藏二维码', panelOff.qrVisible, false);
    check('关闭后清空地址行', panelOff.addrRows, 0);
    check('关闭后状态条回到关闭态', panelOff.statusClass.indexOf('off') >= 0, true);
    check('关闭后状态文案为「未开启共享」', panelOff.statusText, '未开启共享');
    let refused = false;
    try { await fetch('http://127.0.0.1:' + mirroredPort + '/' + rotated.token + '/'); } catch (e) { refused = true; }
    check('关闭后端口不再响应', refused, true);

    m.close(); s.close();
    log('--- 应用输出（片段）---\n' + (appOut.trim().slice(0, 800) || '(无)'));
  } catch (e) {
    log('[ERROR] ' + (e && e.stack || e));
    fail++;
  } finally {
    try { if (child) child.kill(); } catch (e) {}
    await wait(2500);
    if (appOutAll.trim()) log('--- 应用输出 ---\n' + appOutAll.trim().slice(0, 2000));
    log('合计：' + pass + ' PASS / ' + fail + ' FAIL');
    fs.writeFileSync(OUT + '.log', lines.join('\n'));
    process.exit(fail ? 1 : 0);
  }
})();
