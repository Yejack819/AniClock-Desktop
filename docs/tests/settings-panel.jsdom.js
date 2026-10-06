/* settings-panel.jsdom.js — [v1.0.5.6] 设置窗口渲染层的「无窗口」验收（jsdom）
 *
 * 用途：当真实 Electron 窗口起不来时（例如桌面会话不可用：连最小应用都会「建窗即关」），
 *       仍然能验证设置窗口的渲染层逻辑 —— 直接加载真实的 settings.html + qr-code.js + settings.js，
 *       用一个符合 IPC 契约的假 electronAPI 驱动，断言面板的结构、状态、二维码与交互。
 *
 * 跑法（jsdom 只装在项目外，不污染项目依赖）：
 *   mkdir -p $HOME/.workbuddy/binaries/node/workspace && cd $HOME/.workbuddy/binaries/node/workspace
 *   npm install jsdom --registry=https://registry.npmmirror.com --no-audit --no-fund
 *   NODE_PATH=$HOME/.workbuddy/binaries/node/workspace/node_modules node docs/tests/settings-panel.jsdom.js
 *
 * 边界：jsdom 没有 canvas 实现，这里用记录型 2d 上下文替代 ——
 *       能验「画了没有 / 画在多大的画布上 / fillRect 次数对不对」，不验像素外观；
 *       像素级外观由 docs/tests/qr-code.test.js 覆盖。
 *       真实主进程与端口链路（服务启停、http 页面、只读约束）由 docs/tests/lan-mirror-app-smoke.js 覆盖。
 */

const fs = require('fs');
const path = require('path');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('跳过：未找到 jsdom（本测试不引入项目依赖，需按文件头说明装到项目外并用 NODE_PATH 指向）。');
  process.exit(0);
}

const APP = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const failures = [];
const log = [];
function check(name, cond, extra) {
  if (cond) { pass++; log.push('[PASS] ' + name); }
  else { fail++; failures.push(name + (extra === undefined ? '' : ' → ' + extra)); log.push('[FAIL] ' + name + (extra === undefined ? '' : ' → ' + extra)); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- 假主进程：镜像服务状态机（与真实 lan-mirror 的行为对齐）----
// 访问码规则（随机/自定义/无码、规整、退回随机）直接用真实模块算，
// 保证这个假主进程不会和 main.js 的 ensureLanToken 跑偏。
const LM = require(path.join(APP, 'lan-mirror.js'));
let TOKEN = '';
let port = 53880;
let running = false;
let authMode = 'random';
let fixedCode = '';
const addresses = [{ name: 'WLAN', address: '192.168.1.7' }];
function applyAuth() {
  // 与 main.js ensureLanToken 同一条规则
  const r = LM.resolveToken({ lanMirrorAuthMode: authMode, lanMirrorFixedCode: fixedCode, lanMirrorToken: TOKEN });
  TOKEN = r.token;
  return r.authFallback;
}
function status() {
  const authFallback = applyAuth();
  const base = authMode === 'none' ? '/' : (TOKEN ? '/' + TOKEN + '/' : '');
  return {
    running, port: running ? port : null, defaultPort: 8788, token: TOKEN, error: null,
    authMode, fixedCode: LM.sanitizeCode(fixedCode), authFallback,
    requests: running ? 3 : 0, addresses,
    urls: running && base ? addresses.map(a => ({ name: a.name, ip: a.address, url: 'http://' + a.address + ':' + port + base })) : [],
    pageAvailable: true,
  };
}
function newToken() { return LM.randomToken(); }
TOKEN = newToken();

const config = {
  welcomeShown: true, language: 'zh', animType: 'flip', showSeconds: true,
  settingsTab: 'lan', lightsOffDisplay: 'clock', mode: 'normal', lightsOff: false,
  color: '#ffffff', bgColor: 'rgba(0,0,0,0.35)', fontFamily: 'Arial', fontSize: 200,
  infoScale: 0.3, animDuration: 350, positionPreset: 'center', x: 0, y: 0, winW: 800, winH: 400,
  showDate: true, showWeekday: true, datePosition: 'below', autoColor: false,
  extraTimezones: [], layerMode: 'alwaysOnTop', autoStart: false, silentStart: false,
  passthrough: false, settingsFontSize: 'md', hourFormat: 'auto', ampmCorner: 'top-right',
  timeOffsetMs: 0, autoAdjustEnabled: false, autoAdjustIntervalSec: 3600, autoAdjustAmountMs: 0,
  autoAdjustBaseMs: 0, autoAdjustAnchor: 0, alarmSoundDuration: 120,
  lanMirrorEnabled: false, lanMirrorPort: port, lanMirrorToken: TOKEN,
  lanMirrorAuthMode: 'random', lanMirrorFixedCode: '',
};

const canvasCalls = { fills: 0 };
const api = new Proxy({}, {
  get(_, prop) {
    switch (prop) {
      case 'getConfig': return async () => JSON.parse(JSON.stringify(config));
      // [v1.0.5.7] 设置窗口「改了就落盘」：镜像进来，好断言 animEase 这类新项真的传给了主进程
      case 'saveConfig': return async (cfg) => {
        if (cfg && typeof cfg === 'object') Object.assign(config, cfg);
        return { success: true };
      };
      case 'notifyClockUpdate': return async () => ({ success: true });
      case 'lanMirrorStatus': return async () => status();
      case 'setLanMirror': return async (patch) => {
        if (patch && patch.enabled !== undefined) { running = patch.enabled === true; config.lanMirrorEnabled = running; }
        if (patch && patch.port !== undefined) { port = patch.port; config.lanMirrorPort = port; }
        if (patch && patch.authMode !== undefined) { authMode = patch.authMode; config.lanMirrorAuthMode = authMode; }
        if (patch && patch.fixedCode !== undefined) { fixedCode = patch.fixedCode; config.lanMirrorFixedCode = fixedCode; }
        return status();
      };
      case 'newLanMirrorToken': return async () => { TOKEN = newToken(); config.lanMirrorToken = TOKEN; return status(); };
      case 'openLanMirrorUrl': return async () => ({ success: true });
      case 'getDisplays': return async () => [{ id: 1, index: 0, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true }];
      case 'getAllAlarms': return async () => [];
      case 'getAppInfo': return async () => ({ version: '1.0.5.6', appVersion: '1.0.5.6', name: 'Digital Clock' });
      case 'getPluginRuntimeState': return async () => ({ safeMode: false, strikes: 0 });
      case 'getPluginList': return async () => [];
      case 'getLightsOffLock': return async () => false;
      default: return async () => ({ success: true });
    }
  },
});

(async () => {
  // 1) 用真实 settings.html 建 DOM（去掉外链脚本，稍后手动按顺序求值）
  let html = fs.readFileSync(path.join(APP, 'settings.html'), 'utf-8');
  html = html.replace(/<script[^>]*><\/script>/g, '');

  const dom = new JSDOM(html, {
    url: 'file:///E:/clock/settings.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.electronAPI = api;
      window.confirm = () => true;
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      window.navigator.clipboard = { writeText: async () => {} };
      window.document.execCommand = () => true;
      // jsdom 不带 canvas 实现：给个记录型 2d 上下文
      window.HTMLCanvasElement.prototype.getContext = function () {
        return {
          fillStyle: '',
          clearRect() {},
          fillRect() { canvasCalls.fills++; },
          getImageData() { return { data: new Uint8ClampedArray(4) }; },
        };
      };
    },
  });
  const { window } = dom;
  const doc = window.document;

  // 2) 按真实顺序加载脚本：qr-code.js → settings.js
  window.eval(fs.readFileSync(path.join(APP, 'qr-code.js'), 'utf-8'));
  check('二维码编码器已挂到 window.DCQR', !!window.DCQR && typeof window.DCQR.toCanvas === 'function');

  let evalErr = null;
  try {
    window.eval(fs.readFileSync(path.join(APP, 'settings.js'), 'utf-8'));
  } catch (e) { evalErr = e; }
  check('settings.js 求值无异常', !evalErr, evalErr && evalErr.message);
  await wait(500);

  const $ = id => doc.getElementById(id);
  const q = sel => doc.querySelector(sel);

  // 3) 结构
  check('导航里有「局域网」项', !!q('#settings-nav .nav-item[data-panel="lan"]'));
  check('「局域网」面板存在', !!q('.panel[data-panel="lan"]'));
  check('导航项 12 个', doc.querySelectorAll('#settings-nav .nav-item').length === 12, String(doc.querySelectorAll('#settings-nav .nav-item').length));
  check('面板 12 个', doc.querySelectorAll('.panel').length === 12, String(doc.querySelectorAll('.panel').length));
  // [v1.0.5.7] 倒计时面板：导航项与面板成对存在，且不是教育模式隐藏项
  check('导航里有「倒计时」项', !!q('#settings-nav .nav-item[data-panel="countdown"]'));
  check('「倒计时」项不在 edu-hide 里', !q('#settings-nav .nav-item[data-panel="countdown"]').classList.contains('edu-hide'));
  check('「倒计时」面板存在', !!q('.panel[data-panel="countdown"]'));
  check('「倒计时」面板有列表容器与新建按钮', !!$('countdown-list') && !!$('countdown-add-btn'));
  check('初始停留在局域网面板（配置 settingsTab=lan）', q('.panel.active').dataset.panel === 'lan');

  // 4) 未开启时的初始态
  check('未开启：状态条为 off 态', $('lan-status').className.indexOf('off') >= 0, $('lan-status').className);
  check('未开启：状态文案正确', $('lan-status-text').textContent === '未开启共享', JSON.stringify($('lan-status-text').textContent));
  check('未开启：地址区收起', $('lan-body').classList.contains('hidden'));
  check('未开启：二维码带 hidden 类', $('lan-qr').classList.contains('hidden'));
  check('未开启：端口输入框置灰', $('lan-port').disabled);
  check('未开启：端口值来自配置', $('lan-port').value === String(port), $('lan-port').value);

  // 5) 改端口（未开启时只存不发）
  $('lan-port').value = '53900';
  $('lan-port').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(200);
  check('改端口：未开启时不启动服务', running === false);
  $('lan-port').value = '80';
  $('lan-port').dispatchEvent(new window.Event('change', { bubbles: true }));
  check('改端口：越界值被夹回 1024', $('lan-port').value === '1024', $('lan-port').value);
  $('lan-port').value = String(port);
  $('lan-port').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(200);

  // 6) 点开关 → 真实走 setLanMirror → 重渲染
  $('lan-enabled').click();
  await wait(400);
  const st1 = status();
  check('开启：主进程服务已运行', st1.running === true);
  check('开启：访问码为 6 位短码', /^[a-hj-km-np-z2-9]{6}$/.test(st1.token), st1.token);
  check('开启：开关保持勾选', $('lan-enabled').checked === true);
  check('开启：端口输入框可用', $('lan-port').disabled === false);
  check('开启：地址区展开', $('lan-body').classList.contains('hidden') === false);
  check('开启：状态条为运行态', $('lan-status').className === 'lan-status', $('lan-status').className);
  check('开启：状态文案含端口', $('lan-status-text').textContent.indexOf(String(st1.port)) >= 0, $('lan-status-text').textContent);
  check('开启：地址行数与状态一致', doc.querySelectorAll('#lan-address-list .lan-addr').length === st1.urls.length, String(doc.querySelectorAll('#lan-address-list .lan-addr').length));
  check('开启：展示的地址带访问码', (q('.lan-addr-url') || {}).textContent === st1.urls[0].url, (q('.lan-addr-url') || {}).textContent);
  check('开启：二维码已绘制（fillRect 被调用）', canvasCalls.fills > 50, String(canvasCalls.fills));
  // 画布尺寸跟着编码器真实算出来的模块数走（访问码从 32 位缩到 6 位后，二维码版本从 3 掉到 2，
  // 尺寸自然变小 —— 这正是短码的附带好处，所以别写死像素值）
  const qrEnc = window.DCQR.encode(st1.urls[0].url);
  const qrPx = (qrEnc.size + 8) * 4 + 'px';
  check('开启：二维码画布尺寸 =（模块 + 8 静区）×4',
    $('lan-qr').style.width === qrPx && $('lan-qr').style.height === qrPx,
    $('lan-qr').style.width + ' / ' + $('lan-qr').style.height + ' want ' + qrPx);
  check('开启：短访问码让二维码保持紧凑（版本 ≤ 4）', qrEnc.version <= 4, 'version=' + qrEnc.version);
  check('开启：二维码可见', $('lan-qr').classList.contains('hidden') === false);
  check('开启：无「没有可用地址」提示', $('lan-no-address').classList.contains('hidden'));
  check('单地址：不显示行内复制按钮（避免与主按钮重复）', doc.querySelectorAll('.lan-addr-copy').length === 0);

  // 7) 复制按钮 → 提示 → 自动复原
  $('lan-copy-btn').click();
  await wait(200);
  check('复制地址：状态条给出提示', $('lan-status-text').textContent === '已复制到剪贴板', $('lan-status-text').textContent);
  await wait(2400);
  check('复制地址：提示 2.2 秒后回到运行态', $('lan-status-text').textContent.indexOf('正在共享') === 0, $('lan-status-text').textContent);

  // 8) 切走再切回 → 自动拉到最新状态（换码后界面必须跟着变）
  const oldToken = TOKEN;
  window.electronAPI.newLanMirrorToken();
  await wait(100);
  q('#settings-nav .nav-item[data-panel="mode"]').click();
  await wait(200);
  q('#settings-nav .nav-item[data-panel="lan"]').click();
  await wait(400);
  check('重新进入面板：状态已刷新', $('lan-status-text').textContent.indexOf('正在共享') === 0, $('lan-status-text').textContent);
  check('重新进入面板：地址跟着换码更新', (q('.lan-addr-url') || {}).textContent.indexOf(TOKEN) >= 0 && TOKEN !== oldToken, (q('.lan-addr-url') || {}).textContent);

  // 9) 语言切换后文案重渲染
  const langSel = $('language-select');
  langSel.value = 'en';
  langSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  check('切英文：状态文案变英文', $('lan-status-text').textContent.indexOf('Sharing') === 0, $('lan-status-text').textContent);
  check('切英文：面板标题变英文', q('.panel[data-panel="lan"] .panel-title').textContent === 'LAN', q('.panel[data-panel="lan"] .panel-title').textContent);
  check('切英文：地址行仍带访问码', (q('.lan-addr-url') || {}).textContent.indexOf(TOKEN) >= 0);
  langSel.value = 'zh';
  langSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(300);
  check('切回中文：文案复原', $('lan-status-text').textContent.indexOf('正在共享') === 0, $('lan-status-text').textContent);

  // 10) 关掉开关 → 界面收起
  $('lan-enabled').click();
  await wait(400);
  check('关闭：主进程服务已停止', running === false);
  check('关闭：开关取消勾选', $('lan-enabled').checked === false);
  check('关闭：端口输入框置灰', $('lan-port').disabled === true);
  check('关闭：地址区收起', $('lan-body').classList.contains('hidden'));
  check('关闭：二维码隐藏', $('lan-qr').classList.contains('hidden'));
  check('关闭：地址行已清空', doc.querySelectorAll('#lan-address-list .lan-addr').length === 0);
  check('关闭：状态文案为「未开启共享」', $('lan-status-text').textContent === '未开启共享', $('lan-status-text').textContent);

  // 11) 端口被占用顺延：界面显示真实端口而非请求端口
  port = 53901;
  $('lan-enabled').click();
  await wait(400);
  check('顺延场景：状态显示真实端口', $('lan-status-text').textContent.indexOf(String(port)) >= 0, $('lan-status-text').textContent);
  check('顺延场景：地址用真实端口', (q('.lan-addr-url') || {}).textContent.indexOf(':' + port + '/') >= 0, (q('.lan-addr-url') || {}).textContent);

  // 12) [v1.0.5.6] 访问方式三选一
  check('访问方式：下拉存在', !!$('lan-auth-mode'));
  check('访问方式：默认随机', $('lan-auth-mode').value === 'random', $('lan-auth-mode').value);
  check('访问方式：三个选项', $('lan-auth-mode').querySelectorAll('option').length === 3, String($('lan-auth-mode').querySelectorAll('option').length));
  check('随机模式：自定义码输入行隐藏', $('lan-code-row').classList.contains('hidden'));
  check('随机模式：换码按钮可见', $('lan-token-btn').classList.contains('hidden') === false);
  check('随机模式：单独展示访问码', $('lan-code-line').classList.contains('hidden') === false && $('lan-code-value').textContent === TOKEN, $('lan-code-value').textContent);
  check('随机模式：提示文案为随机版', $('lan-auth-note').textContent.indexOf('6 位短码') >= 0, $('lan-auth-note').textContent);
  check('随机模式：无警示文案', $('lan-auth-warn').classList.contains('hidden'));

  // 12a) 切成「自定义访问码」→ 输入行出现，换码按钮让位
  $('lan-auth-mode').value = 'fixed';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  check('自定义：输入行出现', $('lan-code-row').classList.contains('hidden') === false);
  check('自定义：自动填了默认码', $('lan-code').value === 'my-clock', $('lan-code').value);
  check('自定义：地址用自定义码', (q('.lan-addr-url') || {}).textContent.indexOf('/my-clock/') > 0, (q('.lan-addr-url') || {}).textContent);
  check('自定义：换码按钮隐藏', $('lan-token-btn').classList.contains('hidden'));
  check('自定义：访问码行隐藏（码就在输入框里）', $('lan-code-line').classList.contains('hidden'));
  check('自定义：提示文案换掉', $('lan-auth-note').textContent.indexOf('自己设的访问码') >= 0, $('lan-auth-note').textContent);
  check('自定义：有「越短越好猜」提示', $('lan-auth-warn').classList.contains('hidden') === false && $('lan-auth-warn').textContent.indexOf('越好猜') >= 0, $('lan-auth-warn').textContent);

  // 12b) 输入非法码 → 就地红字；提交后主进程退回随机码
  $('lan-code').value = 'ab';                       // 太短
  $('lan-code').dispatchEvent(new window.Event('input', { bubbles: true }));
  check('非法码：输入时就地提示', $('lan-code-error').classList.contains('hidden') === false);
  $('lan-code').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  check('非法码：提交后仍留在自定义模式', $('lan-auth-mode').value === 'fixed');
  check('非法码：主进程退回随机码（没有变成无码）', /^[a-hj-km-np-z2-9]{6}$/.test(status().token), status().token);
  check('非法码：地址不是根路径', (q('.lan-addr-url') || {}).textContent.indexOf('/' + status().token + '/') > 0, (q('.lan-addr-url') || {}).textContent);
  check('非法码：给出警示文案', $('lan-auth-warn').classList.contains('hidden') === false && $('lan-auth-warn').textContent.indexOf('不合法') >= 0, $('lan-auth-warn').textContent);

  // 12c) 输入合法码 → 回显规整结果并生效
  $('lan-code').value = '  My Clock  ';
  $('lan-code').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  check('合法码：输入框回显规整结果', $('lan-code').value === 'my-clock', $('lan-code').value);
  check('合法码：地址生效', (q('.lan-addr-url') || {}).textContent.indexOf('/my-clock/') > 0, (q('.lan-addr-url') || {}).textContent);
  check('合法码：警示回到「越好猜」', $('lan-auth-warn').textContent.indexOf('越好猜') >= 0, $('lan-auth-warn').textContent);

  // 12d) 切到「不需要访问码」→ 根路径
  $('lan-auth-mode').value = 'none';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  check('无码：地址变成根路径', (q('.lan-addr-url') || {}).textContent === 'http://192.168.1.7:' + port + '/', (q('.lan-addr-url') || {}).textContent);
  check('无码：输入行隐藏', $('lan-code-row').classList.contains('hidden'));
  check('无码：换码按钮隐藏', $('lan-token-btn').classList.contains('hidden'));
  check('无码：访问码行隐藏', $('lan-code-line').classList.contains('hidden'));
  check('无码：有安全提示', $('lan-auth-warn').classList.contains('hidden') === false && $('lan-auth-warn').textContent.indexOf('可信') >= 0, $('lan-auth-warn').textContent);
  check('无码：二维码仍绘制（扫码还是要用的）', $('lan-qr').classList.contains('hidden') === false);

  // 12e) 切回随机 → 自动补一个新短码，界面复原
  $('lan-auth-mode').value = 'random';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  const afterRandom = status().token; // 切回随机后主进程现生成的短码
  check('切回随机：输入行隐藏', $('lan-code-row').classList.contains('hidden'));
  check('切回随机：换码按钮回来', $('lan-token-btn').classList.contains('hidden') === false);
  check('切回随机：访问码行回来', $('lan-code-line').classList.contains('hidden') === false);
  check('切回随机：地址带短码', /^[a-hj-km-np-z2-9]{6}$/.test(afterRandom) && (q('.lan-addr-url') || {}).textContent.indexOf('/' + afterRandom + '/') > 0, afterRandom + ' | ' + (q('.lan-addr-url') || {}).textContent);
  check('切回随机：无警示文案', $('lan-auth-warn').classList.contains('hidden'));

  // 12f) 关掉服务时也能改访问方式（配置要先落盘，否则下次开开关还是旧值）
  $('lan-auth-mode').value = 'none';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(300);
  $('lan-enabled').click();  // 关
  await wait(300);
  check('无码模式下关闭：服务已停', running === false);
  $('lan-auth-mode').value = 'fixed';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(300);
  check('关闭状态改访问方式：配置已落到主进程', status().authMode === 'fixed', status().authMode);
  $('lan-enabled').click();  // 开
  await wait(400);
  check('重新开启：按新访问方式启动（不是旧的随机码）', (q('.lan-addr-url') || {}).textContent.indexOf('/my-clock/') > 0, (q('.lan-addr-url') || {}).textContent);

  // 12g) 输入框里留着垃圾时切到自定义模式：必须换成可用的码，不能顶着非法值 + 红字
  $('lan-code').value = 'a!';   // 两个都不合法
  $('lan-auth-mode').value = 'none';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(300);
  $('lan-auth-mode').value = 'fixed';
  $('lan-auth-mode').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(400);
  check('切到自定义：输入框里是可用码（不沿用垃圾值）', $('lan-code').value === 'my-clock', $('lan-code').value);
  check('切到自定义：没有红字提示', $('lan-code-error').classList.contains('hidden'));
  check('切到自定义：地址用可用码', (q('.lan-addr-url') || {}).textContent.indexOf('/my-clock/') > 0, (q('.lan-addr-url') || {}).textContent);

  // 13) [v1.0.5.7] 数字动画「节奏」（匀速 / 慢起 / 慢停 / 两头慢 / 弹性）
  const easeSel = $('anim-ease');
  check('动画面板里有「节奏」下拉', !!easeSel);
  const easeOpts = easeSel ? Array.prototype.map.call(easeSel.options, o => o.value) : [];
  check('节奏共 5 档，顺序为 弹性/匀速/慢起/慢停/两头慢',
    easeOpts.join(',') === 'default,linear,ease-in,ease-out,ease-in-out', easeOpts.join(','));
  check('每档都有可读中文文案',
    !!easeSel && Array.prototype.every.call(easeSel.options, o => !!o.textContent.trim()),
    easeSel && Array.prototype.map.call(easeSel.options, o => o.textContent).join('/'));
  check('初始值来自配置（animEase=default）', !!easeSel && easeSel.value === 'default', easeSel && easeSel.value);

  if (easeSel) {
    easeSel.value = 'linear';
    easeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(200);
    check('选「匀速」→ 落盘 animEase=linear', config.animEase === 'linear', String(config.animEase));

    easeSel.value = 'ease-in-out';
    easeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(200);
    check('选「两头慢」→ 落盘 animEase=ease-in-out', config.animEase === 'ease-in-out', String(config.animEase));
  }

  // 与「无动画」联动：没有动画时节奏无从谈起，跟速度一起置灰
  $('anim-type').value = 'none';
  $('anim-type').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(200);
  check('选「无动画」→ 落盘 animType=none', config.animType === 'none', String(config.animType));
  check('选「无动画」→ 速度置灰', $('anim-speed').disabled === true);
  check('选「无动画」→ 节奏也置灰', !!easeSel && easeSel.disabled === true);
  $('anim-type').value = 'flip';
  $('anim-type').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(200);
  check('切回「翻转」→ 节奏恢复可用', !!easeSel && easeSel.disabled === false);

  console.log(log.join('\n'));
  console.log('\nsettings-panel(jsdom)：pass=' + pass + ' fail=' + fail);
  if (failures.length) { console.log('\n失败项：'); failures.forEach(f => console.log('  ✗ ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常：', e); process.exit(1); });
