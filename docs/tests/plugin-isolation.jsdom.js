/* plugin-isolation.jsdom.js — [v1.0.5.7] 插件隔离沙箱的「无窗口」验收（jsdom）
 *
 * 用途：验证 apiVersion>=3 的插件确实跑在**跨源 sandbox iframe** 里、宿主侧权限校验生效。
 *       真实 Electron 端到端（iframe 真能拦住 parent 访问）由 docs/tests/lan-mirror-app-smoke.js 同款
 *       CDP 探针负责；这里先锁住「宿主代码的静态契约」——沙箱属性、消息桥、双写、归属校验。
 *
 * 跑法（jsdom 只装在项目外，不污染项目依赖）：
 *   mkdir -p $HOME/.workbuddy/binaries/node/workspace && cd $HOME/.workbuddy/binaries/node/workspace
 *   npm install jsdom --registry=https://registry.npmmirror.com --no-audit --no-fund
 *   NODE_PATH=$HOME/.workbuddy/binaries/node/workspace/node_modules node docs/tests/plugin-isolation.jsdom.js
 *
 * 边界：jsdom 不执行 iframe srcdoc 里的脚本，也不实现真正的跨源隔离 ——
 *       这里验的是 **宿主侧写死的安全属性与桥接逻辑**（能不能被绕过），
 *       以及 plugin-sandbox.js 里桥函数在真实 DOM 上的行为（用 VM 注入执行）。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('跳过：未找到 jsdom（本测试不引入项目依赖，需按文件头说明装到项目外并用 NODE_PATH 指向）。');
  process.exit(0);
}

const APP = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra === undefined ? '' : ' → ' + extra)); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- 1. 静态契约：宿主创建沙箱 iframe 时只给 allow-scripts ----
const hostSrc = fs.readFileSync(path.join(APP, 'plugin-host.js'), 'utf8');
check('沙箱 iframe 用 sandbox="allow-scripts"',
  /setAttribute\(\s*['"]sandbox['"]\s*,\s*['"]allow-scripts['"]\s*\)/.test(hostSrc));
check('沙箱 iframe 绝不含 allow-same-origin',
  !/sandbox['"]\s*,\s*['"][^'"]*allow-same-origin/.test(hostSrc));
check('身份校验用 event.source === iframe.contentWindow',
  /ev\.source\s*!==\s*iframe\.contentWindow/.test(hostSrc) || /e\.source\s*!==\s*iframe\.contentWindow/.test(hostSrc));

// 沙箱桥内部同源判定：只认 parent
const sandboxSrc = fs.readFileSync(path.join(APP, 'plugin-sandbox.js'), 'utf8');
check('沙箱只接受来自 parent 的消息',
  /ev\.source\s*!==\s*parent/.test(sandboxSrc));
check('宿主插件 CSS 被注入沙箱文档（隔离后插件自绘区才吃得到样式）',
  /data-plugin-css/.test(hostSrc) && /pluginCss/.test(hostSrc));
check('applyVars 双写（宿主 html + 沙箱 html）',
  /document\.documentElement\.style\.setProperty/.test(sandboxSrc));

// ---- 2. 归属校验：senderOwnsPlugin / rememberPluginSender 存在且被数据 IPC 调用 ----
const mainSrc = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
check('main.js 有 senderOwnsPlugin 归属校验', /function senderOwnsPlugin/.test(mainSrc));
check('main.js 有 rememberPluginSender 记忆发送者', /function rememberPluginSender/.test(mainSrc));
check('plugin-data-get 走归属校验',
  /plugin-data-get[\s\S]{0,400}senderOwnsPlugin/.test(mainSrc));
check('plugin-data-set 走归属校验',
  /plugin-data-set[\s\S]{0,400}senderOwnsPlugin/.test(mainSrc));
check('plugin-set-setting 也走归属校验（纵深防御）',
  /plugin-set-setting[\s\S]{0,400}senderOwnsPlugin/.test(mainSrc));

// ---- 3. 行为契约：把 plugin-sandbox.js 的桥函数放进 jsdom 里跑 ----
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { runScripts: 'outside-only' });
const win = dom.window;
// 假 parent：捕获沙箱发出去的消息；并让 ev.source 判定成立（沙箱要求 ev.source === parent）
const sent = [];
const fakeParent = { postMessage: (msg) => sent.push(msg) };
try { Object.defineProperty(win, 'parent', { value: fakeParent, configurable: true }); } catch (e) {}

// 在 jsdom 上下文里执行 plugin-sandbox.js（它会注册 message 监听、定义 buildDc 等）
try {
  win.eval(sandboxSrc);
  check('plugin-sandbox.js 在 DOM 上下文可执行', true);
} catch (e) {
  check('plugin-sandbox.js 在 DOM 上下文可执行', false, e.message);
}

// 触发 boot → start()。沙箱靠 window 上的 message 事件接收 boot。
function bootSandbox(code, opts) {
  const bootMsg = {
    __dc: 1, kind: 'boot',
    id: 'test.plugin', name: 'T', version: '1.0.0',
    hook: (opts && opts.hook) || 'settings.theme',
    apiVersion: 3,
    panelId: (opts && opts.panelId) || null,
    settings: (opts && opts.settings) || { layout: 'grouped', accent: '#6C8CFF' },
    theme: { isDark: true, fg: '#fff', bg: '#000', ref: 0 },
    code: code,
  };
  const me = new win.MessageEvent('message', { data: bootMsg, source: fakeParent });
  win.dispatchEvent(me);
}

// 3a. 插件能拿到 dc，且 dc.root() 是本 iframe 的 body（不是宿主 body）
let gotRoot = null, gotDcKeys = null;
bootSandbox('dc.mount(function (slot, dc) { window.__probe = { root: dc.root(), isPanel: dc.isPanel(), keys: Object.keys(dc) }; });');
// [v1.0.5.7] 修掉恒真式断言（原来以 `|| true` 兜底，这条「验收」永远通过）
check('插件 dc.mount 被调用并拿到 dc', !!win.__probe);
const probe = win.__probe;
check('dc.root() 指向沙箱内的 body', !!probe && probe.root === win.document.body);
check('dc 暴露 hook/apiVersion/ui/storage 等', !!probe && probe.keys.indexOf('ui') >= 0 && probe.keys.indexOf('storage') >= 0);
check('无 panelId 时 isPanel() 为 false', !!probe && probe.isPanel === false);

// 3b. 带 panelId 时 isPanel() 为 true
bootSandbox('dc.mount(function (slot, dc) { window.__probe2 = { isPanel: dc.isPanel(), panelId: dc.panelId }; });', { panelId: 'plugin.test.plugin.panel' });
check('带 panelId 时 isPanel() 为 true', !!win.__probe2 && win.__probe2.isPanel === true);
check('dc.panelId 透传宿主给的 panelId', !!win.__probe2 && win.__probe2.panelId === 'plugin.test.plugin.panel');

// 3c. applyVars 在沙箱 html 上也生效（双写的一半）
bootSandbox('dc.mount(function () { dc.ui.applyVars({ "--lg-accent": "#ff0000" }); dc.mount._x = 1; });');
const rootEl = win.document.documentElement;
check('applyVars 把变量写到沙箱 <html>',
  rootEl.style.getPropertyValue('--lg-accent') === '#ff0000');

// 3d. patch('html', {attr}) 在沙箱 html 上也生效
bootSandbox('dc.mount(function () { dc.ui.patch("html", { attr: { "data-lg": "1" } }); });');
check('patch(html) 把属性写到沙箱 <html>', rootEl.getAttribute('data-lg') === '1');

// 3e. 发给宿主的调用带上了正确的 kind/method（消息桥可用）
const callMsgs = sent.filter(m => m && m.kind === 'call');
check('插件调用被翻译成 kind=call 消息', callMsgs.length > 0);
check('call 消息带 method 名', callMsgs.some(m => typeof m.method === 'string' && m.method.length > 0));

// 3f. 插件拿不到 Node：沙箱运行时文件里不出现 require/exports/process 的直连
check('沙箱运行时用 new Function(\'dc\', code) 执行插件（不给闭包）',
  /new Function\(\s*['"]dc['"]\s*,/.test(sandboxSrc));
check('沙箱运行时不含 require(', !/\brequire\s*\(/.test(sandboxSrc));

// ---- 3g. 版本门控：隔离与否必须看**插件声明**的 apiVersion，绝不能看宿主版本 ----
// 真实事故：getPluginBundle 只下发 hostApiVersion(=最新)，runPlugin 拿它判定隔离，
// 于是声明 apiVersion:1/2 的老插件也被塞进跨源 sandbox → 全部失效。这组断言锁死这一点。
check('getPluginBundle 下发插件自己声明的 apiVersion',
  /apiVersion:\s*m\.apiVersion/.test(mainSrc));
check('runPlugin 用插件自己的 apiVersion 决定隔离',
  /useIsolation\s*=\s*pluginApi\s*>=\s*3/.test(hostSrc));
check('runPlugin 绝不用 hostApiVersion 决定隔离（防回归）',
  !/useIsolation\s*=[^;]*hostApiVersion/.test(hostSrc));
check('legacy 的 dc.apiVersion 是插件自己的版本，不是宿主版本',
  !/apiVersion:\s*Number\(plugin\.hostApiVersion\)/.test(hostSrc));

// ---- 4. 静态契约（补充）：插件不得再直连 electronAPI ----
const exampleDirs = ['sample-plugin', 'db-meter', 'stopwatch', 'liquid-glass', 'caller'];
const NAV_PLUGINS = ['db-meter', 'stopwatch', 'liquid-glass', 'caller'];
for (const d of exampleDirs) {
  const p = path.join(APP, 'examples', d, 'index.js');
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  // 允许出现在注释里的字样，但代码里不能真的引用
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  check('examples/' + d + ' 不直连 window.electronAPI',
    !/window\.electronAPI/.test(codeOnly));
  const mf = path.join(APP, 'examples', d, 'plugin.json');
  const j = JSON.parse(fs.readFileSync(mf, 'utf8'));
  check('examples/' + d + ' apiVersion = 3', j.apiVersion === 3, 'apiVersion=' + j.apiVersion);

  // 开导航页的插件必须区分「主题相 / 页面相」：不能把设置 UI 建进主题背景层。
  if (NAV_PLUGINS.indexOf(d) >= 0) {
    check('examples/' + d + ' 用 isPanel()/panelId 区分两相',
      /isPanel\s*\(/.test(codeOnly) || /\.panelId/.test(codeOnly));
    // ui.nav() 的返回值是 Promise（异步 RPC），绝不能赋值给变量后当 DOM 节点用
    check('examples/' + d + ' 不把 ui.nav() 返回值当 DOM 节点',
      !/(const|let|var)\s+\w+\s*=\s*[\s\S]{0,20}\.ui\.nav\(/.test(codeOnly));
  }
}

// ---- 4b. 宿主：ui.nav 的返回值必须是布尔（不是节点），且两相位方法兼容无 panel 的主题槽 ----
check('宿主 ui.nav 返回 !!createNavPage(...)（布尔，非节点）',
  /'ui\.nav'\(args\)\s*\{\s*return\s*!!createNavPage/.test(hostSrc));
check('宿主 ui.setNavLabel 兼容主题槽（无 panel 时用第一项）',
  /setNavLabel[\s\S]{0,400}navPanels[\s\S]{0,200}slice\(0,\s*1\)/.test(hostSrc));
check('宿主 ui.activatePanel 兼容主题槽（无 panel 时用第一项）',
  /activatePanel[\s\S]{0,300}session\.panel\s*\|\|\s*panelIds\[0\]/.test(hostSrc));

// ---- 5. caller 的 MQTT 长度前缀必须是**大端** ----
const callerSrc = fs.readFileSync(path.join(APP, 'examples', 'caller', 'index.js'), 'utf8');
check('caller strField 用大端长度前缀',
  /unshift\(\s*\(b\.length\s*>>\s*8\)\s*&\s*255\s*,\s*b\.length\s*&\s*255\s*\)/.test(callerSrc));
check('caller 不再出现小端写法',
  !/unshift\(\s*b\.length\s*&\s*255\s*,\s*\(b\.length\s*>>\s*8\)\s*&\s*255\s*\)/.test(callerSrc));

// ---- 6. [v1.0.5.7] 沙箱事件订阅走 dom 指令通道（宿主方法表里没有 'listen'）----
check('沙箱 ui.on 走 domCall(\'listen\')（原来 call(\'listen\') 是 unknown-method）',
  /domCall\(\s*['"]listen['"]\s*,\s*\{\s*sel:\s*sel,\s*type:\s*type\s*\}\s*\)/.test(sandboxSrc));
check('沙箱代码不再直接 call(\'listen\')（注释除外）',
  !/call\(\s*['"]listen['"]/.test(sandboxSrc.replace(/\/\/[^\n]*/g, '')));
check('宿主 dom.listen 走权限门 + 受保护元素校验',
  /op === 'listen'[\s\S]{0,300}needsWindowUi\(\)[\s\S]{0,200}isProtected\(sel\)/.test(hostSrc));
check('宿主 ui.addStyle / ui.applyVars 有权限门',
  /'ui\.addStyle'\(args\)\s*\{[\s\S]{0,200}needsWindowUi\(\)/.test(hostSrc) &&
  /'ui\.applyVars'\(args\)\s*\{[\s\S]{0,300}needsWindowUi\(\)/.test(hostSrc));
check('宿主 setInfoText 不再 textContent 覆盖 slot（隔离后 slot 里有沙箱 iframe）',
  /const target = record\.infoEl \|\| record\.slot/.test(hostSrc));
check('宿主申请 mic 权限时给沙箱 iframe 加 allow="microphone"',
  /indexOf\(\s*['"]mic['"]\s*\)\s*>=\s*0[\s\S]{0,120}allow['"],\s*['"]microphone/.test(hostSrc));
check('沙箱 mount 的清理函数被记录（dispose 时执行）',
  /cleanups\.push\(c\)/.test(sandboxSrc) && /kind === 'dispose'/.test(sandboxSrc) && /kind: 'disposed'/.test(sandboxSrc));

// ---- 汇总 ----
console.log('\n插件隔离验收：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) {
  console.log('失败项：');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✅');
